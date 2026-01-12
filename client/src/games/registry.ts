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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BaseGame } from "./BaseGame";
import TicTacToe from "./tictactoe/TicTacToe";
import Caro from "./caro/Caro";
import ChessGame from "./chess/Chess";
import YouTubeWatch from "./youtube/YouTubeWatch";
import CanvasGame from "./canvas/CanvasGame";
import Thirteen from "./thirteen/Thirteen";
import Reversi from "./reversi/Reversi";
import Connect4 from "./connect4/Connect4";

export interface GameModule {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon; // Lucide icon component
  minPlayers: number;
  maxPlayers: number;
  isAvailable: boolean;
  createGame: (
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    players: { id: string; username: string }[]
  ) => BaseGame;
}

// Game Registry
const games: Map<string, GameModule> = new Map();

// Register Tic Tac Toe
games.set("tictactoe", {
  id: "tictactoe",
  name: "Tic Tac Toe",
  description: "Classic 3x3 grid game. Get three in a row to win!",
  icon: Grid2X2,
  minPlayers: 1,
  maxPlayers: 2,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new TicTacToe(roomId, socket, isHost, userId, players);
  },
});

// Register Caro (Gomoku)
games.set("caro", {
  id: "caro",
  name: "Caro (Gomoku)",
  description: "Get 5 in a row on a larger board. More strategic!",
  icon: Grid3x3,
  minPlayers: 1,
  maxPlayers: 2,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new Caro(roomId, socket, isHost, userId, players);
  },
});

// Register Connect 4
games.set("connect4", {
  id: "connect4",
  name: "Connect 4",
  description: "Classic 4-in-a-row! Drop discs and connect four to win.",
  icon: Columns3,
  minPlayers: 1,
  maxPlayers: 2,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new Connect4(roomId, socket, isHost, userId, players);
  },
});

// Register Reversi
games.set("reversi", {
  id: "reversi",
  name: "Reversi (Othello)",
  description: "Classic strategy game. Flip your opponent's pieces!",
  icon: Circle,
  minPlayers: 1,
  maxPlayers: 2,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new Reversi(roomId, socket, isHost, userId, players);
  },
});

// Register Chess
games.set("chess", {
  id: "chess",
  name: "Chess",
  description: "Strategic board game. Checkmate your opponent!",
  icon: ChessKnight,
  minPlayers: 1,
  maxPlayers: 2,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new ChessGame(roomId, socket, isHost, userId, players);
  },
});

games.set("youtube", {
  id: "youtube",
  name: "YouTube Watch Party",
  description: "Watch YouTube videos together with friends!",
  icon: Tv,
  minPlayers: 1,
  maxPlayers: 100,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new YouTubeWatch(roomId, socket, isHost, userId, players);
  },
});

games.set("canvas", {
  id: "canvas",
  name: "Draw Together",
  description: "Collaborative whiteboard to draw with friends!",
  icon: Palette,
  minPlayers: 1,
  maxPlayers: 10,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new CanvasGame(roomId, socket, isHost, userId, players);
  },
});

// Register Thirteen
games.set("thirteen", {
  id: "thirteen",
  name: "Thirteen",
  description: "Vietnamese card game (Tiến Lên Miền Nam)",
  icon: Spade,
  minPlayers: 1,
  maxPlayers: 4,
  isAvailable: true,
  createGame: (roomId, socket, isHost, userId, players) => {
    return new Thirteen(roomId, socket, isHost, userId, players);
  },
});

// Registry functions
export const getGame = (gameType: string): GameModule | undefined => {
  return games.get(gameType);
};

export const getAllGames = (): GameModule[] => {
  return Array.from(games.values());
};

export const registerGame = (module: GameModule): void => {
  games.set(module.id, module);
};
