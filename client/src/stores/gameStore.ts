import { create } from "zustand";
import type { BaseGame } from "../games/BaseGame";

interface GameStore {
  gameInstance: BaseGame<any> | null;
  gameState: any;
  isHost: boolean;
  setGameInstance: (instance: BaseGame<any> | null) => void;
  updateGameState: (state: any) => void;
  setIsHost: (isHost: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameInstance: null,
  gameState: null,
  isHost: false,
  setGameInstance: (instance) => set({ gameInstance: instance }),
  updateGameState: (state) => set({ gameState: state }),
  setIsHost: (isHost) => set({ isHost }),
}));
