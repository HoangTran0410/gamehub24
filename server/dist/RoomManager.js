"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
class RoomManager {
    constructor() {
        this.DATA_DIR = "data";
        this.SAVE_FILE = "rooms.json";
        this.rooms = new Map();
        this.playerRoomMap = new Map(); // userId -> roomId
        this.roomSettings = new Map();
        this.ensureDataDir();
    }
    ensureDataDir() {
        const fs = require("fs");
        const path = require("path");
        const dirPath = path.resolve(this.DATA_DIR);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
    saveState() {
        try {
            const fs = require("fs");
            const path = require("path");
            const filePath = path.resolve(this.DATA_DIR, this.SAVE_FILE);
            const data = {
                rooms: Array.from(this.rooms.entries()),
                roomSettings: Array.from(this.roomSettings.entries()),
            };
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error("[RoomManager] Error saving state:", error);
        }
    }
    loadState() {
        try {
            const fs = require("fs");
            const path = require("path");
            const filePath = path.resolve(this.DATA_DIR, this.SAVE_FILE);
            if (!fs.existsSync(filePath)) {
                return;
            }
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const data = JSON.parse(fileContent);
            if (data.rooms) {
                this.rooms = new Map(data.rooms);
            }
            if (data.roomSettings) {
                this.roomSettings = new Map(data.roomSettings);
            }
            // Rebuild playerRoomMap
            this.playerRoomMap.clear();
            this.rooms.forEach((room) => {
                room.players.forEach((p) => this.playerRoomMap.set(p.id, room.id));
                room.spectators.forEach((p) => this.playerRoomMap.set(p.id, room.id));
            });
            console.log(`[RoomManager] Restored ${this.rooms.size} rooms from ${filePath}`);
        }
        catch (error) {
            console.error("[RoomManager] Error loading state:", error);
        }
    }
    getRoomSettings(roomId) {
        return this.roomSettings.get(roomId);
    }
    saveRoomSettings(roomId, settings) {
        this.roomSettings.set(roomId, settings);
        this.saveState();
    }
    createRoom(data, userId, username, socketId, customRoomId) {
        const roomId = customRoomId || username;
        // check if room already exists
        if (this.rooms.has(roomId)) {
            throw new Error("Room name " + roomId + " already exists. Please choose another name.");
        }
        const room = {
            id: roomId,
            name: data.name,
            ownerId: userId,
            gameType: data.gameType,
            isPublic: data.isPublic,
            password: data.password,
            players: [
                {
                    id: userId,
                    username,
                    isHost: true,
                    socketId,
                },
            ],
            spectators: [],
            maxPlayers: data.maxPlayers,
            createdAt: Date.now(),
        };
        this.rooms.set(roomId, room);
        this.playerRoomMap.set(userId, roomId);
        this.saveRoomSettings(roomId, {
            gameType: room.gameType,
            name: room.name,
        });
        this.saveState();
        console.log(`[RoomManager] Created room ${roomId} for user ${userId} (${username})`);
        return room;
    }
    joinRoom(roomId, userId, username, socketId, password) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { success: false, error: "Room not found" };
        }
        // Check password for private rooms
        if (!room.isPublic && room.password !== password) {
            return { success: false, error: "Incorrect password" };
        }
        // Check if player already in room (as player or spectator)
        if (room.players.some((p) => p.id === userId) ||
            room.spectators.some((p) => p.id === userId)) {
            return { success: true, room };
        }
        // New logic: All joiners become spectators first (unless rejoining handled above)
        // We remove the "room is full" check for spectators, or maybe set a distinct limit?
        // For now, let's allow unlimited spectators or a high number.
        // Add player to spectators
        room.spectators.push({
            id: userId,
            username,
            isHost: false,
            socketId,
        });
        this.playerRoomMap.set(userId, roomId);
        this.saveState();
        console.log(`[RoomManager] User ${userId} (${username}) joined room ${roomId}`);
        return { success: true, room };
    }
    leaveRoom(userId) {
        const roomId = this.playerRoomMap.get(userId);
        if (!roomId) {
            return { wasHost: false };
        }
        const room = this.rooms.get(roomId);
        if (!room) {
            return { wasHost: false };
        }
        const wasHost = room.ownerId === userId;
        // Remove player from room (check both lists)
        room.players = room.players.filter((p) => p.id !== userId);
        room.spectators = room.spectators.filter((p) => p.id !== userId);
        this.playerRoomMap.delete(userId);
        // If room is empty or host left, delete room
        if (room.players.length === 0 || wasHost) {
            this.rooms.delete(roomId);
            // Remove all players from this room
            room.players.forEach((p) => this.playerRoomMap.delete(p.id));
            room.spectators.forEach((p) => this.playerRoomMap.delete(p.id));
            // Remove all chats from room
            console.log(`[RoomManager] Deleted room ${roomId} (Host Left: ${wasHost}, Empty: ${room.players.length === 0})`);
            this.saveState();
            return { roomId, wasHost };
        }
        // If host left but room not empty, assign new host
        // if (wasHost && room.players.length > 0) {
        //   room.players[0].isHost = true;
        //   room.ownerId = room.players[0].id;
        //   console.log(
        //     `[RoomManager] Reassigned host for room ${roomId} to ${room.players[0].username}`,
        //   );
        // }
        this.saveState();
        return { roomId, room, wasHost };
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    getPublicRooms() {
        return Array.from(this.rooms.values()).filter((room) => room.isPublic);
    }
    getRoomByUserId(userId) {
        const roomId = this.playerRoomMap.get(userId);
        return roomId ? this.rooms.get(roomId) : undefined;
    }
    updatePlayerSocketId(userId, socketId) {
        const roomId = this.playerRoomMap.get(userId);
        if (!roomId)
            return;
        const room = this.rooms.get(roomId);
        if (!room)
            return;
        const player = room.players.find((p) => p.id === userId);
        if (player) {
            player.socketId = socketId;
        }
        else {
            const spectator = room.spectators.find((p) => p.id === userId);
            if (spectator) {
                spectator.socketId = socketId;
            }
        }
        // Update socket ID is just in-memory ephemeral state, usually.
        // However, if we restart, the old socket IDs are useless anyway.
        // So we don't strictly *need* to persist this update.
        // But saving state here keeps the file in sync if we want to debug.
        // Let's debounce or skip saving for just socket updates to reduce IO load.
        // For now, I'll Skip saving for socket update as it changes often and is invalidated on restart.
    }
    moveSpectatorToPlayer(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return { success: false, error: "Room not found" };
        const spectatorIndex = room.spectators.findIndex((p) => p.id === userId);
        if (spectatorIndex === -1)
            return { success: false, error: "User is not a spectator" };
        if (room.players.length >= room.maxPlayers)
            return { success: false, error: "Room player slots are full" };
        const player = room.spectators[spectatorIndex];
        room.spectators.splice(spectatorIndex, 1);
        room.players.push(player);
        this.saveState();
        return { success: true, room };
    }
    movePlayerToSpectator(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return { success: false, error: "Room not found" };
        const playerIndex = room.players.findIndex((p) => p.id === userId);
        if (playerIndex === -1)
            return { success: false, error: "User is not a player" };
        // Prevent removing the host (unless we handle host reassignment here, but simpler to block)
        if (room.players[playerIndex].id === room.ownerId) {
            return { success: false, error: "Cannot move host to spectators" };
        }
        const player = room.players[playerIndex];
        room.players.splice(playerIndex, 1);
        room.spectators.push(player);
        this.saveState();
        return { success: true, room };
    }
    kickUser(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return { success: false, error: "Room not found" };
        // Cannot kick host
        if (userId === room.ownerId) {
            return { success: false, error: "Cannot kick host" };
        }
        // Check players
        const playerIndex = room.players.findIndex((p) => p.id === userId);
        if (playerIndex !== -1) {
            room.players.splice(playerIndex, 1);
            this.playerRoomMap.delete(userId);
            this.saveState();
            return { success: true, room };
        }
        // Check spectators
        const spectatorIndex = room.spectators.findIndex((p) => p.id === userId);
        if (spectatorIndex !== -1) {
            room.spectators.splice(spectatorIndex, 1);
            this.playerRoomMap.delete(userId);
            this.saveState();
            return { success: true, room };
        }
        return { success: false, error: "User not found in room" };
    }
}
exports.RoomManager = RoomManager;
