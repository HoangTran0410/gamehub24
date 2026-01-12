export interface Player {
  id: string;
  username: string;
  isHost: boolean;
  socketId: string;
}

export interface Room {
  id: string;
  name: string;
  ownerId: string;
  gameType: string;
  isPublic: boolean;
  password?: string;
  players: Player[];
  maxPlayers: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
  type: "user" | "system";
}

export interface CreateRoomData {
  name: string;
  gameType: string;
  isPublic: boolean;
  password?: string;
  maxPlayers: number;
}

export interface JoinRoomData {
  roomId: string;
  password?: string;
}
