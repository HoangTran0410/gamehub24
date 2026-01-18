import { create } from "zustand";

export interface Player {
  id: string;
  username: string;
  isHost: boolean;
  socketId?: string;
  isBot?: boolean;
}

export interface Room {
  id: string;
  name: string;
  ownerId: string;
  gameType: string;
  isPublic: boolean;
  password?: string;
  players: Player[];
  spectators: Player[];
  maxPlayers: number;
  createdAt: Date;
}

interface RoomStore {
  currentRoom: Room | null;
  publicRooms: Room[];
  setCurrentRoom: (room: Room | null) => void;
  setPublicRooms: (rooms: Room[]) => void;
  updatePlayers: (players: Player[]) => void;
  updateSpectators: (spectators: Player[]) => void;
  leaveRoom: () => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  currentRoom: null,
  publicRooms: [],
  setCurrentRoom: (room) => set({ currentRoom: room }),
  setPublicRooms: (rooms) => set({ publicRooms: rooms }),
  updatePlayers: (players) =>
    set((state) => ({
      currentRoom: state.currentRoom ? { ...state.currentRoom, players } : null,
    })),
  updateSpectators: (spectators) =>
    set((state) => ({
      currentRoom: state.currentRoom
        ? { ...state.currentRoom, spectators }
        : null,
    })),
  leaveRoom: () => set({ currentRoom: null }),
}));
