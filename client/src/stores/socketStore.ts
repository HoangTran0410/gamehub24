import { create } from "zustand";

interface SocketStore {
  isConnected: boolean;
  setIsConnected: (status: boolean) => void;
}

export const useSocketStore = create<SocketStore>((set) => ({
  isConnected: false,
  setIsConnected: (status) => set({ isConnected: status }),
}));
