import { Socket } from "socket.io-client";
import {
  Grid3x3,
  Tv,
  Circle,
  Palette,
  Spade,
  ChessKnight,
  Grid2X2,
  Columns3,
  Dices,
  LayoutGrid,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { BaseGame } from "./BaseGame";
import type { GameUIProps } from "./types";

// Game categories
export type GameCategory =
  | "board"
  | "strategy"
  | "puzzle"
  | "card"
  | "party"
  | "relax"
  | "classic";

export interface GameModule {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  categories: GameCategory[];
  minPlayers: number;
  maxPlayers: number;
  isAvailable: boolean;
  createGame: (
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    players: { id: string; username: string }[]
  ) => Promise<BaseGame>;
  loadUI: () => Promise<ComponentType<GameUIProps>>;
}

// Game Registry
const games: Map<string, GameModule> = new Map();

// Register Tic Tac Toe
games.set("tictactoe", {
  id: "tictactoe",
  name: "Tic Tac Toe",
  description: "Classic 3x3 grid game. Get three in a row to win!",
  icon: Grid2X2,
  categories: ["board", "classic", "puzzle"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: TicTacToe } = await import("./tictactoe/TicTacToe");
    return new TicTacToe(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./tictactoe/TicTacToeUI").then((m) => m.default),
});

// Register Caro (Gomoku)
games.set("caro", {
  id: "caro",
  name: "Caro (Gomoku)",
  description: "Get 5 in a row on a larger board. More strategic!",
  icon: Grid3x3,
  categories: ["board", "strategy", "puzzle"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: Caro } = await import("./caro/Caro");
    return new Caro(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./caro/CaroUI").then((m) => m.default),
});

// Register Connect 4
games.set("connect4", {
  id: "connect4",
  name: "Connect 4",
  description: "Classic 4-in-a-row! Drop discs and connect four to win.",
  icon: Columns3,
  categories: ["board", "classic", "puzzle"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: Connect4 } = await import("./connect4/Connect4");
    return new Connect4(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./connect4/Connect4UI").then((m) => m.default),
});

// Register Ludo
games.set("ludo", {
  id: "ludo",
  name: "Ludo",
  description: "Classic board game! Roll dice and race your tokens home.",
  icon: Dices,
  categories: ["board", "classic", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: Ludo } = await import("./ludo/Ludo");
    return new Ludo(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./ludo/LudoUI").then((m) => m.default),
});

// Register Reversi
games.set("reversi", {
  id: "reversi",
  name: "Reversi (Othello)",
  description: "Classic strategy game. Flip your opponent's pieces!",
  icon: Circle,
  categories: ["board", "strategy", "classic"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: Reversi } = await import("./reversi/Reversi");
    return new Reversi(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./reversi/ReversiUI").then((m) => m.default),
});

// Register Chess
games.set("chess", {
  id: "chess",
  name: "Chess",
  description: "Strategic board game. Checkmate your opponent!",
  icon: ChessKnight,
  categories: ["board", "strategy", "classic"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: ChessGame } = await import("./chess/Chess");
    return new ChessGame(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./chess/ChessUI").then((m) => m.default),
});

games.set("youtube", {
  id: "youtube",
  name: "YouTube Watch Party",
  description: "Watch YouTube videos together with friends!",
  icon: Tv,
  categories: ["party", "relax"],
  minPlayers: 1,
  maxPlayers: 100,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: YouTubeWatch } = await import("./youtube/YouTubeWatch");
    return new YouTubeWatch(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./youtube/YouTubeWatchUI").then((m) => m.default),
});

games.set("canvas", {
  id: "canvas",
  name: "Draw Together",
  description: "Collaborative whiteboard to draw with friends!",
  icon: Palette,
  categories: ["party", "relax"],
  minPlayers: 1,
  maxPlayers: 10,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: CanvasGame } = await import("./canvas/CanvasGame");
    return new CanvasGame(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./canvas/CanvasGameUI").then((m) => m.default),
});

// Register Thirteen
games.set("thirteen", {
  id: "thirteen",
  name: "Thirteen",
  description: "Vietnamese card game (Tiến Lên Miền Nam)",
  icon: Spade,
  categories: ["card", "strategy"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: Thirteen } = await import("./thirteen/Thirteen");
    return new Thirteen(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./thirteen/ThirteenUI").then((m) => m.default),
});

// Register Dots and Boxes
games.set("dotsandboxes", {
  id: "dotsandboxes",
  name: "Dots & Boxes",
  description: "Classic strategy game. Connect dots to close boxes!",
  icon: LayoutGrid,
  categories: ["puzzle", "strategy", "classic"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: DotsAndBoxes } = await import(
      "./dotsandboxes/DotsAndBoxes"
    );
    return new DotsAndBoxes(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./dotsandboxes/DotsAndBoxesUI").then((m) => m.default),
});

// Register UNO
games.set("uno", {
  id: "uno",
  name: "UNO",
  description: "Classic card game! Match colors or numbers to win.",
  icon: Layers,
  categories: ["card", "party", "classic"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (roomId, socket, isHost, userId, players) => {
    const { default: Uno } = await import("./uno/Uno");
    return new Uno(roomId, socket, isHost, userId, players);
  },
  loadUI: () => import("./uno/UnoUI").then((m) => m.default),
});

// Registry functions
export const getGame = (gameType: string): GameModule | undefined => {
  return games.get(gameType);
};

export const getAllGames = (): GameModule[] => {
  return Array.from(games.values());
};

export const getAllCategories = (): GameCategory[] => {
  const categories = new Set<GameCategory>();
  games.forEach((game) => {
    game.categories.forEach((cat) => categories.add(cat));
  });
  return Array.from(categories);
};

export const registerGame = (module: GameModule): void => {
  games.set(module.id, module);
};
