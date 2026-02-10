import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { RoomManager } from "./RoomManager";
import { statsManager } from "./StatsManager";
import { calculateSize, formatSize, log, uuidShort } from "./utils";
import type { ChatMessage, CreateRoomData, JoinRoomData } from "./types";
import { chatPersistence } from "./ChatPersistence";

dotenv.config();

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const START_TIME = Date.now();

// Initialize Express
const app = express();
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling", "webtransport"],
  pingInterval: 20000,
  pingTimeout: 180000,
  allowEIO3: true,
});

// Initialize managers
const roomManager = new RoomManager();
roomManager.loadState();
const chatHistory: Map<string, ChatMessage[]> = new Map();
// Load last 20 messages from persistence for GLOBAL chat
const globalChatHistory: ChatMessage[] = chatPersistence.getRecentMessages(
  "global",
  20,
);
const spamMap = new Map<string, { count: number; lastMessageTime: number }>();
const SPAM_WINDOW_MS = 5000;
const MAX_MESSAGES_PER_WINDOW = 5;

// Generate a deterministic roomId for DM persistence using usernames
function getDmRoomId(userA: string, userB: string): string {
  return "dm:" + [userA, userB].sort().join("_");
}

// Online users tracking for DM feature - Keyed by USERNAME
const onlineUsers = new Map<string, { userId: string; socketId: string }>();

function getOnlineUserList() {
  return Array.from(onlineUsers.entries()).map(([username, { userId }]) => ({
    userId,
    username,
  }));
}

function trackDataStats(roomId: string, size: number) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.gameType) return;
  statsManager.trackDataTransfer(room.gameType, size);
}

// Cleanup spam map every 10 minutes to prevent memory leaks
setInterval(
  () => {
    const now = Date.now();
    for (const [userId, userSpam] of spamMap.entries()) {
      // If user hasn't chatted in 1 minute, remove from map
      if (now - userSpam.lastMessageTime > 60000) {
        spamMap.delete(userId);
      }
    }
  },
  10 * 60 * 1000,
);

// =============================================
// Room auto-cleanup: delete rooms with no connected sockets after 5 minutes
// =============================================
const ROOM_CLEANUP_INTERVAL_MS = 60 * 1000; // Check every 1 minute
const ROOM_EMPTY_TIMEOUT_MS = 5 * 60 * 1000; // Delete after 5 minutes empty
const emptyRoomTimestamps = new Map<string, number>(); // roomId -> timestamp when first detected empty

setInterval(async () => {
  try {
    const allRooms = roomManager.getAllRooms();
    for (const room of allRooms) {
      // Check how many sockets are actually in this Socket.IO room
      const sockets = await io.in(room.id).fetchSockets();
      const connectedCount = sockets.length;

      if (connectedCount === 0) {
        // Room has no connected sockets
        if (!emptyRoomTimestamps.has(room.id)) {
          // First time detecting empty, record timestamp
          emptyRoomTimestamps.set(room.id, Date.now());
          log(
            `⏳ Room "${room.name}" (${room.id}) has no connected sockets, will auto-delete in 5 minutes`,
          );
        } else {
          // Check if it's been empty long enough
          const emptyAt = emptyRoomTimestamps.get(room.id)!;
          if (Date.now() - emptyAt >= ROOM_EMPTY_TIMEOUT_MS) {
            // Delete the room
            log(
              `🗑️  Auto-deleting empty room "${room.name}" (${room.id}) — no connected sockets for 5 minutes`,
            );

            // Clean up all players/spectators from the room via RoomManager
            for (const player of [...room.players, ...room.spectators]) {
              roomManager.leaveRoom(player.id);
            }

            // If room still exists (e.g. leaveRoom didn't delete it), force delete
            if (roomManager.getRoom(room.id)) {
              // Force remove via leaveRoom of the owner
              roomManager.leaveRoom(room.ownerId);
            }

            // Clean up chat history
            chatHistory.delete(room.id);
            emptyRoomTimestamps.delete(room.id);

            // Broadcast updated room list
            io.emit("room:list:update", roomManager.getPublicRooms());
          }
        }
      } else {
        // Room has connected sockets, remove from empty tracking
        if (emptyRoomTimestamps.has(room.id)) {
          log(
            `✅ Room "${room.name}" (${room.id}) has active connections again, cancelling auto-delete`,
          );
          emptyRoomTimestamps.delete(room.id);
        }
      }
    }
  } catch (error) {
    console.error("Error during room auto-cleanup:", error);
  }
}, ROOM_CLEANUP_INTERVAL_MS);

function formatUpTime(diff: number) {
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const hoursRemainder = hours % 24;
  const minutesRemainder = minutes % 60;
  const secondsRemainder = seconds % 60;
  return `${days}d ${hoursRemainder}h ${minutesRemainder}m ${secondsRemainder}s`;
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Overview statistic
app.get("/stats", (req, res) => {
  const rooms = roomManager.getPublicRooms();
  const playersInRooms = rooms.reduce(
    (acc, room) => acc + room.players.length,
    0,
  );
  const stats = statsManager.getStats();
  const dataTransfer = Object.entries(stats.dataTransfer).reduce(
    (acc, [key, value]) => {
      acc[key] = {
        value,
        formatted: formatSize(value),
      };
      return acc;
    },
    {} as Record<string, { value: number; formatted: string }>,
  );
  const result = {
    online: io.engine.clientsCount,
    rooms: rooms.length,
    players: playersInRooms,
    startTime: new Date(START_TIME).toISOString(),
    uptime: formatUpTime(Date.now() - START_TIME),
    stats: {
      ...stats,
      dataTransfer,
    },
  };
  res.json(result);
});

// Socket.IO connection handler
io.on("connection", (socket: Socket) => {
  const { userId, username } = socket.handshake.auth;

  log(`🟢 User connected: ${username} (${userId}) [${socket.id}]`);

  // Track online user (by username)
  onlineUsers.set(username, { userId, socketId: socket.id });
  io.emit("dm:online_users", getOnlineUserList());

  // Update socket ID if user reconnects
  roomManager.updatePlayerSocketId(userId, socket.id);

  // Check if user is in a room and rejoin if necessary
  const currentRoom = roomManager.getRoomByUserId(userId);
  if (currentRoom) {
    socket.join(currentRoom.id);
    log(`🔄 User ${username} rejoined room ${currentRoom.id} (socket updated)`);
  }

  // heartbeat
  socket.on("heartbeat", () => {});

  // Get online users count
  socket.on("stats:online", (callback) => {
    try {
      callback?.({ online: io.engine.clientsCount });
    } catch (error) {
      console.error("Error getting online count:", error);
      callback?.({ online: 0 });
    }
  });

  // ROOM EVENTS

  // Create room
  socket.on("room:create", (data: CreateRoomData, callback) => {
    try {
      const room = roomManager.createRoom(data, userId, username, socket.id);
      socket.join(room.id);

      log(
        `📦 Room created: ${room.name} (${room.id}) (game: ${data.gameType}) by ${username}`,
      );

      if (data.gameType) {
        statsManager.trackPlay(data.gameType);
      }

      callback?.({ success: true, room });

      // Broadcast updated room list to all clients
      if (room.isPublic) {
        io.emit("room:list:update", roomManager.getPublicRooms());
      }
    } catch (error) {
      console.error("Error creating room:", error);
      callback?.({
        success: false,
        error: "Failed to create room: " + (error as Error).message,
      });
    }
  });

  // Join room
  socket.on("room:join", (data: JoinRoomData, callback) => {
    try {
      let result = roomManager.joinRoom(
        data.roomId,
        userId,
        username,
        socket.id,
        data.password,
      );

      // If room not found, auto create
      if (
        !result.success &&
        result.error === "Room not found" &&
        // only allow auto join if user own this room
        data.roomId === username
      ) {
        const savedSettings = roomManager.getRoomSettings(data.roomId);
        const room = roomManager.createRoom(
          {
            name: savedSettings?.name || data.roomId,
            gameType: savedSettings?.gameType || "", // Use saved or default
            isPublic: false,
            maxPlayers: 10,
          },
          userId,
          username,
          socket.id,
          data.roomId,
        );
        result = { success: true, room };
        log(
          `📦 Room auto-created: ${room.name} (${room.id}) by ${username} (using ${
            savedSettings ? "saved" : "default"
          } settings)`,
        );
      }

      if (result.success && result.room) {
        socket.join(result.room.id);

        log(`👤 ${username} joined room: ${result.room.name}`);

        // Send room data to joiner
        callback?.({ success: true, room: result.room });

        // Broadcast updated lists to room
        // io.to(data.roomId).emit("room:players", result.room.players);
        // io.to(data.roomId).emit("room:spectators", result.room.spectators);
        io.to(data.roomId).emit("room:update", result.room);

        // Send system message
        const systemMessage: ChatMessage = {
          id: uuidShort(),
          roomId: data.roomId,
          userId: "system",
          username: "System",
          message: `${username} joined the room`,
          timestamp: Date.now(),
          type: "system",
        };
        io.to(data.roomId).emit("chat:message", systemMessage);

        // Broadcast updated room list
        if (result.room.isPublic) {
          io.emit("room:list:update", roomManager.getPublicRooms());
        }
      } else {
        callback?.({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error joining room:", error);
      callback?.({
        success: false,
        error: "Failed to join room: " + (error as Error).message,
      });
    }
  });

  // Leave room
  socket.on("room:leave", (data: { roomId: string }) => {
    try {
      const result = roomManager.leaveRoom(userId);

      if (result.roomId) {
        socket.leave(result.roomId);

        log(`👋 ${username} left room: ${result.roomId}`);

        if (result.room) {
          // Room still exists, broadcast updated lists
          // io.to(result.roomId).emit("room:players", result.room.players);
          // io.to(result.roomId).emit("room:spectators", result.room.spectators);
          io.to(result.roomId).emit("room:update", result.room);

          // Send system message
          const systemMessage: ChatMessage = {
            id: uuidShort(),
            roomId: result.roomId,
            userId: "system",
            username: "System",
            message: `${username} left the room`,
            timestamp: Date.now(),
            type: "system",
          };
          io.to(result.roomId).emit("chat:message", systemMessage);
        } else {
          // Room was deleted, notify all
          log(`🗑️  Room deleted: ${result.roomId}`);

          // Remove chat history
          chatHistory.delete(result.roomId);

          if (result.wasHost) {
            io.to(result.roomId).emit("room:deleted", {
              reason: "Host left the room",
            });
          }
        }

        // Broadcast updated room list
        if (result.room?.isPublic) {
          io.emit("room:list:update", roomManager.getPublicRooms());
        }
      }
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  });

  // Get room list
  socket.on("room:list", (callback) => {
    try {
      const rooms = roomManager.getPublicRooms();
      callback?.(rooms);
    } catch (error) {
      console.error("Error getting room list:", error);
      callback?.([]);
    }
  });

  // Update room (host only - e.g., change game type)
  socket.on("room:update", (data: { roomId: string; gameType?: string }) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) return;

      // Only host can update room
      if (room.ownerId !== userId) return;

      // Update game type if provided
      if (data.gameType) {
        if (room.gameType !== data.gameType) {
          statsManager.trackPlay(data.gameType);
        }
        room.gameType = data.gameType;
        log(`🔄 Room ${room.name} game changed to: ${data.gameType}`);

        // Save updated settings
        roomManager.saveRoomSettings(data.roomId, {
          gameType: room.gameType,
          name: room.name,
        });
      }

      // Broadcast updated room to all players in the room
      io.to(data.roomId).emit("room:update", room);

      // Update public room list
      if (room.isPublic) {
        io.emit("room:list:update", roomManager.getPublicRooms());
      }
    } catch (error) {
      console.error("Error updating room:", error);
    }
  });

  // Host adds spectator to players
  socket.on(
    "room:addPlayer",
    (data: { roomId: string; userId: string }, callback) => {
      try {
        const room = roomManager.getRoom(data.roomId);
        if (!room)
          return callback?.({ success: false, error: "Room not found" });

        if (room.ownerId !== userId) {
          return callback?.({
            success: false,
            error: "Only host can add players",
          });
        }

        const result = roomManager.moveSpectatorToPlayer(
          data.roomId,
          data.userId,
        );
        if (result.success && result.room) {
          // io.to(data.roomId).emit("room:players", result.room.players);
          // io.to(data.roomId).emit("room:spectators", result.room.spectators);
          io.to(data.roomId).emit("room:update", result.room);
          callback?.({ success: true });

          // Send system message
          const player = result.room.players.find((p) => p.id === data.userId);
          const systemMessage: ChatMessage = {
            id: uuidShort(),
            roomId: data.roomId,
            userId: "system",
            username: "System",
            message: `${player?.username} joined the game`,
            timestamp: Date.now(),
            type: "system",
          };
          io.to(data.roomId).emit("chat:message", systemMessage);
        } else {
          callback?.({ success: false, error: result.error });
        }
      } catch (error) {
        console.error("Error adding player:", error);
        callback?.({ success: false, error: "Internal error" });
      }
    },
  );

  // Host removes player to spectators
  socket.on(
    "room:removePlayer",
    (data: { roomId: string; userId: string }, callback) => {
      try {
        const room = roomManager.getRoom(data.roomId);
        if (!room)
          return callback?.({ success: false, error: "Room not found" });

        if (room.ownerId !== userId) {
          return callback?.({
            success: false,
            error: "Only host can remove players",
          });
        }

        const result = roomManager.movePlayerToSpectator(
          data.roomId,
          data.userId,
        );
        if (result.success && result.room) {
          // io.to(data.roomId).emit("room:players", result.room.players);
          // io.to(data.roomId).emit("room:spectators", result.room.spectators);
          io.to(data.roomId).emit("room:update", result.room);
          callback?.({ success: true });

          // Send system message
          const spectator = result.room.spectators.find(
            (p) => p.id === data.userId,
          );
          const systemMessage: ChatMessage = {
            id: uuidShort(),
            roomId: data.roomId,
            userId: "system",
            username: "System",
            message: `${spectator?.username} moved to spectators`,
            timestamp: Date.now(),
            type: "system",
          };
          io.to(data.roomId).emit("chat:message", systemMessage);
        } else {
          callback?.({ success: false, error: result.error });
        }
      } catch (error) {
        console.error("Error removing player:", error);
        callback?.({ success: false, error: "Internal error" });
      }
    },
  );

  // Host kicks user
  socket.on(
    "room:kick",
    (data: { roomId: string; userId: string }, callback) => {
      try {
        const room = roomManager.getRoom(data.roomId);
        if (!room)
          return callback?.({ success: false, error: "Room not found" });

        if (room.ownerId !== userId) {
          return callback?.({
            success: false,
            error: "Only host can kick users",
          });
        }

        const kickedUserSocketId =
          room.players.find((p) => p.id === data.userId)?.socketId ||
          room.spectators.find((p) => p.id === data.userId)?.socketId;

        const result = roomManager.kickUser(data.roomId, data.userId);
        if (result.success && result.room) {
          // io.to(data.roomId).emit("room:players", result.room.players);
          // io.to(data.roomId).emit("room:spectators", result.room.spectators);
          io.to(data.roomId).emit("room:update", result.room);

          // Force kicked user to leave room
          if (kickedUserSocketId) {
            const kickedSocket = io.sockets.sockets.get(kickedUserSocketId);
            if (kickedSocket) {
              kickedSocket.leave(data.roomId);
              kickedSocket.emit("room:kicked", {
                reason: "You were kicked by the host",
              });
            }
          }

          callback?.({ success: true });

          // Send system message
          const systemMessage: ChatMessage = {
            id: uuidShort(),
            roomId: data.roomId,
            userId: "system",
            username: "System",
            message: `A user was kicked from the room`,
            timestamp: Date.now(),
            type: "system",
          };
          io.to(data.roomId).emit("chat:message", systemMessage);
        } else {
          callback?.({ success: false, error: result.error });
        }
      } catch (error) {
        console.error("Error kicking user:", error);
        callback?.({ success: false, error: "Internal error" });
      }
    },
  );

  // GAME EVENTS (Pure relay)

  // Relay game actions
  socket.on("game:action", (data: { roomId: string; action: any }) => {
    const { json, size } = calculateSize(data);
    log(
      `game:action ${userId} -> ${data.roomId} (${(size / 1024).toFixed(2)} KB) ${json}\n\n`,
    );
    trackDataStats(data.roomId, size);
    socket.to(data.roomId).emit("game:action", data);
  });

  // Relay game state
  socket.on("game:state", (data: { roomId: string; state: any }) => {
    const { json, size } = calculateSize(data);
    log(
      `game:state ${userId} -> ${data.roomId} (${(size / 1024).toFixed(2)} KB) ${json}\n\n`,
    );
    trackDataStats(data.roomId, size);
    socket.to(data.roomId).emit("game:state", data);
  });

  // Relay game state patch
  socket.on("game:state:patch", (data: { roomId: string; patch: any }) => {
    const { json, size } = calculateSize(data);
    log(
      `game:state:patch ${userId} -> ${data.roomId} (${(size / 1024).toFixed(2)} KB) ${json}\n\n`,
    );
    trackDataStats(data.roomId, size);
    socket.to(data.roomId).emit("game:state:patch", data);
  });

  // Request sync (Relay to host, with requester socketId)
  socket.on("game:request_sync", (data: { roomId: string }) => {
    log(`game:request_sync ${userId} -> ${data.roomId}`);
    // Determine host? The host is in the room.
    // Actually we can just broadcast to the room, the host will pick it up.
    // But we need to attach the requester's socket ID so the host knows who to reply to.
    socket.to(data.roomId).emit("game:request_sync", {
      roomId: data.roomId,
      targetUser: username,
      requesterSocketId: socket.id,
    });
  });

  // Direct state sync (Host -> Specific User)
  socket.on(
    "game:state:direct",
    (data: {
      roomId: string;
      targetUser: string;
      targetSocketId: string;
      state: any;
      version: number;
    }) => {
      const { json, size } = calculateSize(data);

      log(
        `game:state:direct ${data.roomId} -> ${data.targetUser || data.targetSocketId} (${(size / 1024).toFixed(2)} KB) ${json}\n\n`,
      );
      trackDataStats(data.roomId, size);
      io.to(data.targetSocketId).emit("game:state", {
        roomId: data.roomId,
        state: data.state,
        version: data.version,
      });
    },
  );

  // CHAT EVENTS

  // Send chat message
  socket.on("chat:message", (data: Omit<ChatMessage, "id" | "timestamp">) => {
    try {
      const message: ChatMessage = {
        ...data,
        id: uuidShort(),
        timestamp: Date.now(),
      };

      // Store in history
      if (!data.temp) {
        if (!chatHistory.has(data.roomId)) {
          chatHistory.set(data.roomId, []);
        }
        const history = chatHistory.get(data.roomId)!;
        history.push(message);

        // Keep last 50 messages
        if (history.length > 50) {
          history.shift();
        }

        // Persist room chat
        chatPersistence.saveMessage(message);
      }

      // Broadcast to room
      io.to(data.roomId).emit("chat:message", message);
    } catch (error) {
      console.error("Error sending chat message:", error);
    }
  });

  // Get chat history
  socket.on("chat:history", (data: { roomId: string }, callback) => {
    try {
      const history = chatHistory.get(data.roomId) || [];
      callback?.(history);
    } catch (error) {
      console.error("Error getting chat history:", error);
      callback?.([]);
    }
  });

  // Delete chat history - host only
  socket.on("chat:history:delete", (data: { roomId: string }) => {
    try {
      if (roomManager.getRoom(data.roomId)?.ownerId !== userId) return;
      chatHistory.delete(data.roomId);

      io.to(data.roomId).emit("chat:history:delete");
    } catch (error) {
      console.error("Error deleting chat history:", error);
    }
  });

  // GLOBAL CHAT EVENTS
  socket.on(
    "global:chat",
    (data: Omit<ChatMessage, "id" | "timestamp" | "roomId">) => {
      try {
        const now = Date.now();
        const userSpam = spamMap.get(userId) || {
          count: 0,
          lastMessageTime: 0,
        };

        // Reset count if window passed
        if (now - userSpam.lastMessageTime > SPAM_WINDOW_MS) {
          userSpam.count = 0;
        }

        // Check limit
        if (userSpam.count >= MAX_MESSAGES_PER_WINDOW) {
          socket.emit("global:chat:error", {
            message: "You are chatting too fast. Please slow down.",
          });
          return;
        }

        // Update spam tracker
        userSpam.count++;
        userSpam.lastMessageTime = now;
        spamMap.set(userId, userSpam);

        const message: ChatMessage = {
          ...data,
          id: uuidShort(),
          roomId: "global",
          timestamp: now,
        };

        // Store in history
        globalChatHistory.push(message);
        if (globalChatHistory.length > 20) {
          globalChatHistory.shift();
        }

        // Persist to file
        chatPersistence.saveMessage(message);

        // Broadcast to all
        io.emit("global:chat", message);
      } catch (error) {
        console.error("Error sending global chat message:", error);
      }
    },
  );

  socket.on("global:chat:history", (callback) => {
    callback?.(globalChatHistory);
  });

  // DM EVENTS

  // Request online users list
  socket.on("dm:online_users", (callback) => {
    callback?.(getOnlineUserList());
  });

  // Send DM to specific user (by username)
  socket.on("dm:send", (data: { to: string; message: string }, callback) => {
    try {
      // Spam prevention (same as global chat)
      const now = Date.now();
      const userSpam = spamMap.get(userId) || {
        count: 0,
        lastMessageTime: 0,
      };
      if (now - userSpam.lastMessageTime > SPAM_WINDOW_MS) {
        userSpam.count = 0;
      }
      if (userSpam.count >= MAX_MESSAGES_PER_WINDOW) {
        return callback?.({
          success: false,
          error: "You are sending messages too fast. Please slow down.",
        });
      }
      userSpam.count++;
      userSpam.lastMessageTime = now;
      spamMap.set(userId, userSpam);

      const targetUser = onlineUsers.get(data.to);

      const dmMessage = {
        id: uuidShort(),
        from: username,
        to: data.to,
        message: data.message.trim().slice(0, 500),
        timestamp: Date.now(),
      };

      // Persist DM to file
      const dmRoomId = getDmRoomId(username, data.to);
      chatPersistence.saveMessage({
        id: dmMessage.id,
        roomId: dmRoomId,
        userId: userId, // Keep original userId for record/auth if needed, but message structure uses usernames
        username: username,
        message: dmMessage.message,
        timestamp: dmMessage.timestamp,
        type: "user",
      });

      // Send to target user if online
      if (targetUser) {
        io.to(targetUser.socketId).emit("dm:receive", dmMessage);
      }

      // Echo back to sender for confirmation
      callback?.({ success: true, message: dmMessage });
    } catch (error) {
      console.error("Error sending DM:", error);
      callback?.({ success: false, error: "Failed to send message" });
    }
  });

  // Typing indicator
  socket.on("dm:typing", (data: { to: string; isTyping: boolean }) => {
    const targetUser = onlineUsers.get(data.to);
    if (targetUser) {
      io.to(targetUser.socketId).emit("dm:typing", {
        from: username,
        isTyping: data.isTyping,
      });
    }
  });

  // DISCONNECT

  socket.on("disconnect", (reason) => {
    log(
      `🔴 User disconnected: ${username} (${userId}) [${socket.id}]. Reason: ${reason}`,
    );

    // Remove from online users and broadcast
    onlineUsers.delete(username);
    io.emit("dm:online_users", getOnlineUserList());

    // Handle room cleanup
    const result = roomManager.leaveRoom(userId);

    if (result.roomId) {
      if (result.room) {
        io.to(result.roomId).emit("room:players", result.room.players);

        const systemMessage: ChatMessage = {
          id: uuidShort(),
          roomId: result.roomId,
          userId: "system",
          username: "System",
          message: `${username} disconnected`,
          timestamp: Date.now(),
          type: "system",
        };
        io.to(result.roomId).emit("chat:message", systemMessage);
      } else {
        // Room was deleted because host left/disconnected
        log(`🗑️  Room deleted (host disconnected): ${result.roomId}`);

        // Delete chat for room
        chatHistory.delete(result.roomId);

        if (result.wasHost) {
          io.to(result.roomId).emit("room:deleted", {
            reason: "Host disconnected",
          });
        }
      }

      // Broadcast updated room list
      if (result.room?.isPublic) {
        io.emit("room:list:update", roomManager.getPublicRooms());
      }
    }
  });
});

// Start server
httpServer.listen(PORT, () => {
  log(`
  ╔═══════════════════════════════════════╗
  ║   🎮 Game Hub Server Running 🎮      ║
  ╠═══════════════════════════════════════╣
  ║  Port: ${PORT}                          ║
  ║  Environment: ${process.env.NODE_ENV || "development"}        ║
  ║  Client URL: ${CLIENT_URL}   ║
  ╚═══════════════════════════════════════╝
  `);
});
