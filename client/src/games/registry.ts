import { Socket } from "socket.io-client";
import {
  Grid3x3,
  Tv,
  Circle,
  Palette,
  Spade,
  Grid2X2,
  Columns3,
  Layers,
  CircleDot,
  ChessRook,
  Landmark,
  Moon,
  ChessKnight,
  Component,
  Shrimp,
  Coins,
  Crosshair,
  Accessibility,
  SquareDashedBottom,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { BaseGame } from "./BaseGame";
import type { GameUIProps } from "./types";
import type { Room } from "../stores/roomStore";
import type { GameCategory } from "../constants";

// Localized string type
export type LocalizedString = { en: string; vi: string };

export interface GameModule {
  id: string;
  name: LocalizedString;
  description: LocalizedString;
  icon: LucideIcon;
  categories: GameCategory[];
  minPlayers: number;
  maxPlayers: number;
  isAvailable: boolean;
  createGame?: (
    room: Room,
    socket: Socket,
    isHost: boolean,
    userId: string,
  ) => Promise<BaseGame<any>>;
  loadUI?: () => Promise<ComponentType<GameUIProps>>;
}

// Game Registry
const games: Map<string, GameModule> = new Map();

// Register Tic Tac Toe
games.set("tictactoe", {
  id: "tictactoe",
  name: { en: "Tic Tac Toe", vi: "Cờ Ca-rô 3x3" },
  description: {
    en: "Classic 3x3 grid game. Get three in a row to win!",
    vi: "Trò chơi lưới 3x3 cổ điển. Xếp 3 ô liên tiếp để thắng!",
  },
  icon: Grid2X2,
  categories: ["board", "puzzle"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: TicTacToe } = await import("./tictactoe/TicTacToe");
    return new TicTacToe(room, socket, isHost, userId);
  },
  loadUI: () => import("./tictactoe/TicTacToeUI").then((m) => m.default),
});

// Register Caro (Gomoku)
games.set("caro", {
  id: "caro",
  name: { en: "Caro (Gomoku)", vi: "Cờ Ca-rô" },
  description: {
    en: "Get 5 in a row on a larger board. More strategic!",
    vi: "Xếp 5 ô liên tiếp trên bàn cờ lớn. Chiến thuật hơn!",
  },
  icon: Grid3x3,
  categories: ["board", "strategy", "puzzle"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Caro } = await import("./caro/Caro");
    return new Caro(room, socket, isHost, userId);
  },
  loadUI: () => import("./caro/CaroUI").then((m) => m.default),
});

// Register Connect 4
games.set("connect4", {
  id: "connect4",
  name: { en: "Connect 4", vi: "Nối 4" },
  description: {
    en: "Classic 4-in-a-row! Drop discs and connect four to win.",
    vi: "Thả đĩa và nối 4 ô liên tiếp để thắng!",
  },
  icon: Columns3,
  categories: ["board", "puzzle"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Connect4 } = await import("./connect4/Connect4");
    return new Connect4(room, socket, isHost, userId);
  },
  loadUI: () => import("./connect4/Connect4UI").then((m) => m.default),
});

// Register Ludo
games.set("ludo", {
  id: "ludo",
  name: { en: "Ludo", vi: "Cờ Cá Ngựa" },
  description: {
    en: "Classic board game! Roll dice and race your tokens home.",
    vi: "Lắc xúc xắc và đua các quân cờ về đích!",
  },
  icon: ChessKnight,
  categories: ["board", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Ludo } = await import("./ludo/Ludo");
    return new Ludo(room, socket, isHost, userId);
  },
  loadUI: () => import("./ludo/LudoUI").then((m) => m.default),
});

// Register Reversi
games.set("reversi", {
  id: "reversi",
  name: { en: "Reversi (Othello)", vi: "Cờ Lật" },
  description: {
    en: "Classic strategy game. Flip your opponent's pieces!",
    vi: "Trò chơi chiến thuật cổ điển. Lật quân của đối thủ!",
  },
  icon: Circle,
  categories: ["board", "strategy"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Reversi } = await import("./reversi/Reversi");
    return new Reversi(room, socket, isHost, userId);
  },
  loadUI: () => import("./reversi/ReversiUI").then((m) => m.default),
});

// Register Chess
games.set("chess", {
  id: "chess",
  name: { en: "Chess", vi: "Cờ Vua" },
  description: {
    en: "Strategic board game. Checkmate your opponent!",
    vi: "Trò chơi chiến thuật. Chiếu hết đối thủ!",
  },
  icon: ChessRook,
  categories: ["board", "strategy"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: ChessGame } = await import("./chess/Chess");
    return new ChessGame(room, socket, isHost, userId);
  },
  loadUI: () => import("./chess/ChessUI").then((m) => m.default),
});

games.set("youtube", {
  id: "youtube",
  name: { en: "YouTube Watch Party", vi: "Xem YouTube Cùng Nhau" },
  description: {
    en: "Watch YouTube videos together with friends!",
    vi: "Xem video YouTube cùng bạn bè!",
  },
  icon: Tv,
  categories: ["party", "relax"],
  minPlayers: 1,
  maxPlayers: 100,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: YouTubeWatch } = await import("./youtube/YouTubeWatch");
    return new YouTubeWatch(room, socket, isHost, userId);
  },
  loadUI: () => import("./youtube/YouTubeWatchUI").then((m) => m.default),
});

games.set("draw", {
  id: "draw",
  name: { en: "Draw & Guess", vi: "Vẽ & đoán" },
  description: {
    en: "Draw and guess words with friends!",
    vi: "Vẽ và đoán từ cùng bạn bè!",
  },
  icon: Palette,
  categories: ["party", "relax"],
  minPlayers: 1,
  maxPlayers: 30,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: CanvasGame } = await import("./draw/Draw");
    return new CanvasGame(room, socket, isHost, userId);
  },
  loadUI: () => import("./draw/DrawUI").then((m) => m.default),
});

// Register Thirteen
games.set("thirteen", {
  id: "thirteen",
  name: { en: "Thirteen", vi: "Tiến Lên Miền Nam" },
  description: {
    en: "Vietnamese card game (Tiến Lên Miền Nam)",
    vi: "Trò chơi bài phổ biến tại Việt Nam!",
  },
  icon: Spade,
  categories: ["card", "party", "strategy"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Thirteen } = await import("./thirteen/Thirteen");
    return new Thirteen(room, socket, isHost, userId);
  },
  loadUI: () => import("./thirteen/ThirteenUI").then((m) => m.default),
});

// Register Dots and Boxes
games.set("dotsandboxes", {
  id: "dotsandboxes",
  name: { en: "Dots & Boxes", vi: "Nối Điểm" },
  description: {
    en: "Classic strategy game. Connect dots to close boxes!",
    vi: "Nối các điểm để đóng ô vuông!",
  },
  icon: SquareDashedBottom,
  categories: ["puzzle", "strategy"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: DotsAndBoxes } =
      await import("./dotsandboxes/DotsAndBoxes");
    return new DotsAndBoxes(room, socket, isHost, userId);
  },
  loadUI: () => import("./dotsandboxes/DotsAndBoxesUI").then((m) => m.default),
});

// Register UNO
games.set("uno", {
  id: "uno",
  name: { en: "UNO", vi: "UNO" },
  description: {
    en: "Classic card game! Match colors or numbers to win.",
    vi: "Trò chơi bài cổ điển! Ghép màu hoặc số để thắng.",
  },
  icon: Layers,
  categories: ["card", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Uno } = await import("./uno/Uno");
    return new Uno(room, socket, isHost, userId);
  },
  loadUI: () => import("./uno/UnoUI").then((m) => m.default),
});

// Register Billiard
games.set("billiard", {
  id: "billiard",
  name: { en: "Billiard (8-Ball)", vi: "Bi-a (8 Bóng)" },
  description: {
    en: "Classic pool game! Pocket your balls and sink the 8-ball to win.",
    vi: "Đánh bóng vào lỗ và ghi bàn bóng 8 để thắng!",
  },
  icon: CircleDot,
  categories: ["strategy"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Billiard } = await import("./billiard/Billiard");
    return new Billiard(room, socket, isHost, userId);
  },
  loadUI: () => import("./billiard/BilliardUI").then((m) => m.default),
});

// Register Monopoly (Cờ Tỷ Phú)
games.set("monopoly", {
  id: "monopoly",
  name: { en: "Monopoly", vi: "Cờ Tỷ Phú" },
  description: {
    en: "Buy properties, build houses, bankrupt your opponents!",
    vi: "Mua bất động sản, xây nhà, phá sản đối thủ!",
  },
  icon: Landmark,
  categories: ["board", "strategy", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Monopoly } = await import("./monopoly/Monopoly");
    return new Monopoly(room, socket, isHost, userId);
  },
  loadUI: () => import("./monopoly/MonopolyUI").then((m) => m.default),
});

// Register O An Quan
games.set("oanquan", {
  id: "oanquan",
  name: { en: "O An Quan", vi: "Ô Ăn Quan" },
  description: {
    en: "Traditional Vietnamese simplified strategy game.",
    vi: "Trò chơi dân gian Việt Nam. Tính toán nước đi để ăn nhiều quân nhất!",
  },
  icon: Component,
  categories: ["board", "strategy"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: OAnQuan } = await import("./oanquan/OAnQuan");
    return new OAnQuan(room, socket, isHost, userId);
  },
  loadUI: () => import("./oanquan/OAnQuanUI").then((m) => m.default),
});

// Register Werewolf (Ma Sói)
games.set("werewolf", {
  id: "werewolf",
  name: { en: "Werewolf", vi: "Ma Sói" },
  description: {
    en: "Chat-only social deduction game. Find the wolves!",
    vi: "Trò chơi suy luận xã hội. Tìm ra ma sói!",
  },
  icon: Moon,
  categories: ["party", "strategy"],
  minPlayers: 5,
  maxPlayers: 12,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Werewolf } = await import("./werewolf/Werewolf");
    return new Werewolf(room, socket, isHost, userId);
  },
  loadUI: () => import("./werewolf/WerewolfUI").then((m) => m.default),
});

// Register Bầu Cua (Vietnamese Tet Dice Game)
games.set("baucua", {
  id: "baucua",
  name: { en: "Bầu Cua", vi: "Bầu Cua" },
  description: {
    en: "Traditional Vietnamese Tet dice game. Choose symbols and roll the dice!",
    vi: "Trò chơi xúc xắc Tết truyền thống Việt Nam. Chọn linh vật và lắc xúc xắc!",
  },
  icon: Shrimp,
  categories: ["party", "relax"],
  minPlayers: 1,
  maxPlayers: 20,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: BauCua } = await import("./baucua/BauCua");
    return new BauCua(room, socket, isHost, userId);
  },
  loadUI: () => import("./baucua/BauCuaUI").then((m) => m.default),
});

// Register Poker
games.set("poker", {
  id: "poker",
  name: { en: "Poker (Texas Hold'em)", vi: "Xì tố (Poker)" },
  description: {
    en: "Classic Texas Hold'em Poker. Play, bluff, and win!",
    vi: "Game bài Poker Texas cổ điển. Chơi, chiến thuật và giành chiến thắng!",
  },
  icon: Coins,
  categories: ["card", "strategy", "party"],
  minPlayers: 2,
  maxPlayers: 6,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Poker } = await import("./poker/Poker");
    return new Poker(room, socket, isHost, userId);
  },
  loadUI: () => import("./poker/PokerUI").then((m) => m.default),
});

// Register Maze
games.set("maze", {
  id: "maze",
  name: { en: "Maze Race", vi: "Đua Mê Cung" },
  description: {
    en: "Race to the finish line in a procedurally generated maze!",
    vi: "Đua về đích trong mê cung được tạo ngẫu nhiên!",
  },
  icon: Accessibility,
  categories: ["puzzle", "party", "strategy"],
  minPlayers: 1,
  maxPlayers: 10,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Maze } = await import("./maze/Maze");
    return new Maze(room, socket, isHost, userId);
  },
  loadUI: () => import("./maze/MazeUI").then((m) => m.default),
});

// Register GunnyWars
games.set("gunnywars", {
  id: "gunnywars",
  name: { en: "GunnyWars", vi: "Gunny Wars" },
  description: {
    en: "Turn-based artillery game. Adjust angle and power to defeat opponents!",
    vi: "Game bắn súng tọa độ. Căn góc và lực trúng mục tiêu!",
  },
  icon: Crosshair,
  categories: ["strategy", "party"],
  minPlayers: 1,
  maxPlayers: 2,
  isAvailable: false,
  // createGame: async (room, socket, isHost, userId) => {
  //   const { default: GunnyWars } = await import("./gunnywars/GunnyWars");
  //   return new GunnyWars(room, socket, isHost, userId);
  // },
  // loadUI: () => import("./gunnywars/GunnyWarsUI").then((m) => m.default),
});

// Registry functions
export const getGame = (gameType: string): GameModule | undefined => {
  return games.get(gameType);
};

export const getAllGames = (): GameModule[] => {
  return Array.from(games.values());
  // show recent added game first?
  // .reverse();
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
