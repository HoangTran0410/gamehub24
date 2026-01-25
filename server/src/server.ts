import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { RoomManager } from "./RoomManager";
import type { ChatMessage, CreateRoomData, JoinRoomData } from "./types";

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
const globalChatHistory: ChatMessage[] = [];
const spamMap = new Map<string, { count: number; lastMessageTime: number }>();
const SPAM_WINDOW_MS = 5000;
const MAX_MESSAGES_PER_WINDOW = 5;

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
  const stats = {
    online: io.engine.clientsCount,
    rooms: rooms.length,
    players: playersInRooms,
    startTime: new Date(START_TIME).toISOString(),
    uptime: formatUpTime(Date.now() - START_TIME),
  };
  res.json(stats);
});

// Socket.IO connection handler
io.on("connection", (socket: Socket) => {
  const { userId, username } = socket.handshake.auth;

  console.log(`🟢 User connected: ${username} (${userId}) [${socket.id}]`);

  // Update socket ID if user reconnects
  roomManager.updatePlayerSocketId(userId, socket.id);

  // Check if user is in a room and rejoin if necessary
  const currentRoom = roomManager.getRoomByUserId(userId);
  if (currentRoom) {
    socket.join(currentRoom.id);
    console.log(
      `🔄 User ${username} rejoined room ${currentRoom.id} (socket updated)`,
    );
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

      console.log(`📦 Room created: ${room.name} (${room.id}) by ${username}`);

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
        console.log(
          `📦 Room auto-created: ${room.name} (${room.id}) by ${username} (using ${
            savedSettings ? "saved" : "default"
          } settings)`,
        );
      }

      if (result.success && result.room) {
        socket.join(result.room.id);

        console.log(`👤 ${username} joined room: ${result.room.name}`);

        // Send room data to joiner
        callback?.({ success: true, room: result.room });

        // Broadcast updated lists to room
        // io.to(data.roomId).emit("room:players", result.room.players);
        // io.to(data.roomId).emit("room:spectators", result.room.spectators);
        io.to(data.roomId).emit("room:update", result.room);

        // Send system message
        const systemMessage: ChatMessage = {
          id: uuidv4(),
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

        console.log(`👋 ${username} left room: ${result.roomId}`);

        if (result.room) {
          // Room still exists, broadcast updated lists
          // io.to(result.roomId).emit("room:players", result.room.players);
          // io.to(result.roomId).emit("room:spectators", result.room.spectators);
          io.to(result.roomId).emit("room:update", result.room);

          // Send system message
          const systemMessage: ChatMessage = {
            id: uuidv4(),
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
          console.log(`🗑️  Room deleted: ${result.roomId}`);

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
        room.gameType = data.gameType;
        console.log(`🔄 Room ${room.name} game changed to: ${data.gameType}`);

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
            id: uuidv4(),
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
            id: uuidv4(),
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
            id: uuidv4(),
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
    console.log(`game:action ${userId} -> ${data.roomId}`);
    socket.to(data.roomId).emit("game:action", data);
  });

  // Relay game state
  socket.on("game:state", (data: { roomId: string; state: any }) => {
    const json = JSON.stringify(data);
    console.log(
      `game:state ${userId} -> ${data.roomId} (${(json.length / 1024).toFixed(2)} KB) ${json}\n\n`,
    );
    socket.to(data.roomId).emit("game:state", data);
  });

  // Relay game state patch
  socket.on("game:state:patch", (data: { roomId: string; patch: any }) => {
    const json = JSON.stringify(data);
    console.log(
      `game:state:patch ${userId} -> ${data.roomId} (${(json.length / 1024).toFixed(2)} KB) ${json}\n\n`,
    );
    socket.to(data.roomId).emit("game:state:patch", data);
  });

  // Request sync (Relay to host, with requester socketId)
  socket.on("game:request_sync", (data: { roomId: string }) => {
    console.log(`game:request_sync ${userId} -> ${data.roomId}`);
    // Determine host? The host is in the room.
    // Actually we can just broadcast to the room, the host will pick it up.
    // But we need to attach the requester's socket ID so the host knows who to reply to.
    socket.to(data.roomId).emit("game:request_sync", {
      roomId: data.roomId,
      requesterSocketId: socket.id,
    });
  });

  // Direct state sync (Host -> Specific User)
  socket.on(
    "game:state:direct",
    (data: {
      roomId: string;
      targetSocketId: string;
      state: any;
      version: number;
    }) => {
      const json = JSON.stringify(data);
      console.log(
        `game:state:direct ${data.roomId} -> ${data.targetSocketId} (${(json.length / 1024).toFixed(2)} KB) ${json}\n\n`,
      );
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
        id: uuidv4(),
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
          id: uuidv4(),
          roomId: "global",
          timestamp: now,
        };

        // Store in history
        globalChatHistory.push(message);
        if (globalChatHistory.length > 20) {
          globalChatHistory.shift();
        }

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

  // DISCONNECT

  socket.on("disconnect", (reason) => {
    console.log(
      `🔴 User disconnected: ${username} (${userId}) [${socket.id}]. Reason: ${reason}`,
    );

    // Handle room cleanup
    const result = roomManager.leaveRoom(userId);

    if (result.roomId) {
      if (result.room) {
        io.to(result.roomId).emit("room:players", result.room.players);

        const systemMessage: ChatMessage = {
          id: uuidv4(),
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
        console.log(`🗑️  Room deleted (host disconnected): ${result.roomId}`);

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
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🎮 Game Hub Server Running 🎮      ║
  ╠═══════════════════════════════════════╣
  ║  Port: ${PORT}                          ║
  ║  Environment: ${process.env.NODE_ENV || "development"}        ║
  ║  Client URL: ${CLIENT_URL}   ║
  ╚═══════════════════════════════════════╝
  `);
});
