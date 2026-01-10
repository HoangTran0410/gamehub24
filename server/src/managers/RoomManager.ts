import { v4 as uuidv4 } from "uuid";
import { Room, Player, CreateRoomData } from "../types";

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRoomMap: Map<string, string> = new Map(); // userId -> roomId

  createRoom(
    data: CreateRoomData,
    userId: string,
    username: string,
    socketId: string
  ): Room {
    const roomId = `room_${uuidv4()}`;

    const room: Room = {
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
      maxPlayers: data.maxPlayers,
      createdAt: new Date(),
    };

    this.rooms.set(roomId, room);
    this.playerRoomMap.set(userId, roomId);

    console.log(
      `[RoomManager] Created room ${roomId} for user ${userId} (${username})`
    );

    return room;
  }

  joinRoom(
    roomId: string,
    userId: string,
    username: string,
    socketId: string,
    password?: string
  ): { success: boolean; room?: Room; error?: string } {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: "Room not found" };
    }

    // Check password for private rooms
    if (!room.isPublic && room.password !== password) {
      return { success: false, error: "Incorrect password" };
    }

    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
      return { success: false, error: "Room is full" };
    }

    // Check if player already in room
    if (room.players.some((p) => p.id === userId)) {
      return { success: true, room };
    }

    // Add player to room
    room.players.push({
      id: userId,
      username,
      isHost: false,
      socketId,
    });

    this.playerRoomMap.set(userId, roomId);

    console.log(
      `[RoomManager] User ${userId} (${username}) joined room ${roomId}`
    );

    return { success: true, room };
  }

  leaveRoom(userId: string): {
    roomId?: string;
    room?: Room;
    wasHost: boolean;
  } {
    const roomId = this.playerRoomMap.get(userId);

    if (!roomId) {
      return { wasHost: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { wasHost: false };
    }

    const wasHost = room.ownerId === userId;

    // Remove player from room
    room.players = room.players.filter((p) => p.id !== userId);
    this.playerRoomMap.delete(userId);

    // If room is empty or host left, delete room
    if (room.players.length === 0 || wasHost) {
      this.rooms.delete(roomId);
      // Remove all players from this room
      room.players.forEach((p) => this.playerRoomMap.delete(p.id));
      console.log(
        `[RoomManager] Deleted room ${roomId} (Host Left: ${wasHost}, Empty: ${
          room.players.length === 0
        })`
      );
      return { roomId, wasHost };
    }

    // If host left but room not empty, assign new host
    if (wasHost && room.players.length > 0) {
      room.players[0].isHost = true;
      room.ownerId = room.players[0].id;
      console.log(
        `[RoomManager] Reassigned host for room ${roomId} to ${room.players[0].username}`
      );
    }

    return { roomId, room, wasHost };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getPublicRooms(): Room[] {
    return Array.from(this.rooms.values()).filter((room) => room.isPublic);
  }

  getRoomByUserId(userId: string): Room | undefined {
    const roomId = this.playerRoomMap.get(userId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  updatePlayerSocketId(userId: string, socketId: string): void {
    const roomId = this.playerRoomMap.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === userId);
    if (player) {
      player.socketId = socketId;
    }
  }
}
