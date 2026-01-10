import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { RoomManager } from "./managers/RoomManager";
import { ChatMessage, CreateRoomData, JoinRoomData } from "./types";

dotenv.config();

const PORT = process.env.PORT || 3001;
const CLIENT_URL = "*"; // process.env.CLIENT_URL || "http://localhost:5173";

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
});

// Initialize managers
const roomManager = new RoomManager();
const chatHistory: Map<string, ChatMessage[]> = new Map();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Socket.IO connection handler
io.on("connection", (socket: Socket) => {
  const { userId, username } = socket.handshake.auth;

  console.log(`🟢 User connected: ${username} (${userId}) [${socket.id}]`);

  // Update socket ID if user reconnects
  roomManager.updatePlayerSocketId(userId, socket.id);

  // ROOM EVENTS

  // Create room
  socket.on("room:create", (data: CreateRoomData, callback) => {
    try {
      const room = roomManager.createRoom(data, userId, username, socket.id);
      socket.join(room.id);

      console.log(`📦 Room created: ${room.name} (${room.id}) by ${username}`);

      callback({ success: true, room });

      // Broadcast updated room list to all clients
      io.emit("room:list:update", roomManager.getPublicRooms());
    } catch (error) {
      console.error("Error creating room:", error);
      callback({ success: false, error: "Failed to create room" });
    }
  });

  // Join room
  socket.on("room:join", (data: JoinRoomData, callback) => {
    try {
      const result = roomManager.joinRoom(
        data.roomId,
        userId,
        username,
        socket.id,
        data.password
      );

      if (result.success && result.room) {
        socket.join(data.roomId);

        console.log(`👤 ${username} joined room: ${result.room.name}`);

        // Send room data to joiner
        callback({ success: true, room: result.room });

        // Broadcast updated player list to room
        io.to(data.roomId).emit("room:players", result.room.players);

        // Send system message
        const systemMessage: ChatMessage = {
          id: uuidv4(),
          roomId: data.roomId,
          userId: "system",
          username: "System",
          message: `${username} joined the room`,
          timestamp: new Date(),
          type: "system",
        };
        io.to(data.roomId).emit("chat:message", systemMessage);

        // Broadcast updated room list
        io.emit("room:list:update", roomManager.getPublicRooms());
      } else {
        callback({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error joining room:", error);
      callback({ success: false, error: "Failed to join room" });
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
          // Room still exists, broadcast updated player list
          io.to(result.roomId).emit("room:players", result.room.players);

          // Send system message
          const systemMessage: ChatMessage = {
            id: uuidv4(),
            roomId: result.roomId,
            userId: "system",
            username: "System",
            message: `${username} left the room`,
            timestamp: new Date(),
            type: "system",
          };
          io.to(result.roomId).emit("chat:message", systemMessage);
        } else {
          // Room was deleted, notify all
          console.log(`🗑️  Room deleted: ${result.roomId}`);

          if (result.wasHost) {
            io.to(result.roomId).emit("room:deleted", {
              reason: "Host left the room",
            });
          }
        }

        // Broadcast updated room list
        io.emit("room:list:update", roomManager.getPublicRooms());
      }
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  });

  // Get room list
  socket.on("room:list", (callback) => {
    try {
      const rooms = roomManager.getPublicRooms();
      callback(rooms);
    } catch (error) {
      console.error("Error getting room list:", error);
      callback([]);
    }
  });

  // GAME EVENTS (Pure relay)

  // Relay game actions
  socket.on("game:action", (data: { roomId: string; action: any }) => {
    console.log("game:action", data);
    socket.to(data.roomId).emit("game:action", data);
  });

  // Relay game state
  socket.on("game:state", (data: { roomId: string; state: any }) => {
    console.log("game:state", data);
    socket.to(data.roomId).emit("game:state", data);
  });

  // Relay game end
  socket.on("game:end", (data: { roomId: string; result: any }) => {
    console.log("game:end", data);
    socket.to(data.roomId).emit("game:end", data);
  });

  // CHAT EVENTS

  // Send chat message
  socket.on("chat:message", (data: Omit<ChatMessage, "id" | "timestamp">) => {
    try {
      const message: ChatMessage = {
        ...data,
        id: uuidv4(),
        timestamp: new Date(),
      };

      // Store in history
      if (!chatHistory.has(data.roomId)) {
        chatHistory.set(data.roomId, []);
      }
      const history = chatHistory.get(data.roomId)!;
      history.push(message);

      // Keep last 50 messages
      if (history.length > 50) {
        history.shift();
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
      callback(history);
    } catch (error) {
      console.error("Error getting chat history:", error);
      callback([]);
    }
  });

  // DISCONNECT

  socket.on("disconnect", (reason) => {
    console.log(
      `🔴 User disconnected: ${username} (${userId}) [${socket.id}]. Reason: ${reason}`
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
          timestamp: new Date(),
          type: "system",
        };
        io.to(result.roomId).emit("chat:message", systemMessage);
      } else {
        // Room was deleted because host left/disconnected
        console.log(`🗑️  Room deleted (host disconnected): ${result.roomId}`);
        if (result.wasHost) {
          io.to(result.roomId).emit("room:deleted", {
            reason: "Host disconnected",
          });
        }
      }

      // Broadcast updated room list
      io.emit("room:list:update", roomManager.getPublicRooms());
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
