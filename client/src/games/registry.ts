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
  Cat,
  Pencil,
  Club,
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
  lastUpdatedTime?: number;
  allowSavedState?: boolean;
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
    en: "Get 3 in a row to win!",
    vi: "Xếp 3 ô liên tiếp để thắng!",
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
    en: "Get 5 in a row to win!",
    vi: "Xếp 5 ô liên tiếp để thắng!",
  },
  icon: Grid3x3,
  categories: ["board", "strategy", "puzzle"],
  minPlayers: 2,
  maxPlayers: 2,
  isAvailable: true,
  allowSavedState: true,
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
    en: "Drop discs and connect four to win.",
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
    en: "Roll dice and race your tokens home.",
    vi: "Lắc xúc xắc và đua các quân cờ về đích!",
  },
  icon: ChessKnight,
  categories: ["board", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  allowSavedState: true,
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
    en: "Flip your opponent's pieces!",
    vi: "Lật quân của đối thủ!",
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
    en: "Checkmate your opponent!",
    vi: "Chiếu hết đối thủ!",
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
  name: { en: "YouTube Party", vi: "YouTube Cùng Nhau" },
  description: {
    en: "Watch YouTube with friends!",
    vi: "Xem YouTube cùng bạn bè!",
  },
  icon: Tv,
  categories: ["party", "relax"],
  minPlayers: 1,
  maxPlayers: 100,
  isAvailable: true,
  allowSavedState: true,
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
  icon: Pencil,
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
    en: "Connect dots to close boxes!",
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
    en: "Match colors or numbers to win.",
    vi: "Ghép màu hoặc số để thắng.",
  },
  icon: Layers,
  categories: ["card", "party"],
  minPlayers: 2,
  maxPlayers: 10,
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
    en: "Pocket balls and win.",
    vi: "Đánh bóng vào lỗ để thắng!",
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
    en: "Buy, build, bankrupt your opponents!",
    vi: "Mua, xây, phá sản đối thủ!",
  },
  icon: Landmark,
  categories: ["board", "strategy", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  allowSavedState: true,
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
    vi: "Trò chơi dân gian Việt Nam.",
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
  allowSavedState: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Werewolf } = await import("./werewolf/Werewolf");
    return new Werewolf(room, socket, isHost, userId);
  },
  loadUI: () => import("./werewolf/WerewolfUI").then((m) => m.default),
});

// Register Bầu Cua (Vietnamese Tet Dice Game)
games.set("baucua", {
  id: "baucua",
  name: { en: "Bau Cua", vi: "Bầu Cua" },
  description: {
    en: "Vietnamese animal dice game",
    vi: "Chọn linh vật và lắc xúc xắc!",
  },
  icon: Shrimp,
  categories: ["party", "relax"],
  minPlayers: 1,
  maxPlayers: 20,
  isAvailable: true,
  allowSavedState: true,
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
    en: "Classic Texas Hold'em Poker.",
    vi: "Game bài Poker Texas cổ điển.",
  },
  icon: Coins,
  categories: ["card", "strategy", "party"],
  minPlayers: 2,
  maxPlayers: 6,
  isAvailable: true,
  allowSavedState: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: Poker } = await import("./poker/Poker");
    return new Poker(room, socket, isHost, userId);
  },
  loadUI: () => import("./poker/PokerUI").then((m) => m.default),
});

// Register Maze
games.set("maze", {
  id: "maze",
  name: { en: "Maze", vi: "Mê Cung" },
  description: {
    en: "Race to the finish line in a maze!",
    vi: "Đua về đích trong mê cung!",
  },
  icon: Accessibility,
  categories: ["puzzle", "party"],
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
  name: { en: "Gunny Wars", vi: "Bắn Gunny" },
  description: {
    en: "Large world, many guns!",
    vi: "Thế giới rộng lớn, súng đa dạng!",
  },
  icon: Crosshair,
  categories: ["gun", "strategy", "party"],
  minPlayers: 1,
  maxPlayers: 4,
  isAvailable: true,
  allowSavedState: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: GunnyWars } = await import("./gunnywars/GunnyWars");
    return new GunnyWars(room, socket, isHost, userId);
  },
  loadUI: () => import("./gunnywars/GunnyWarsUI").then((m) => m.default),
});

// Register Exploding Kittens
games.set("explodingkittens", {
  id: "explodingkittens",
  name: { en: "Exploding Kittens", vi: "Mèo Nổ" },
  description: {
    en: "A kitty-powered version of Russian Roulette!",
    vi: "Phiên bản mèo của trò Cò quay Nga!",
  },
  icon: Cat,
  categories: ["card", "party", "strategy"],
  minPlayers: 2,
  maxPlayers: 5,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: ExplodingKittens } =
      await import("./explodingkittens/ExplodingKittens");
    return new ExplodingKittens(room, socket, isHost, userId);
  },
  loadUI: () =>
    import("./explodingkittens/ExplodingKittensUI").then((m) => m.default),
});

// Register Iro Karuta (Color Mixing)
games.set("irokaruta", {
  id: "irokaruta",
  name: { en: "Mix colors", vi: "Trộn màu" },
  description: {
    en: "Japanese color mixing card game!",
    vi: "Game trộn thẻ màu Nhật Bản!",
  },
  icon: Palette,
  categories: ["party", "puzzle"],
  minPlayers: 1,
  maxPlayers: 20,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: IroKaruta } = await import("./irokaruta/IroKaruta");
    return new IroKaruta(room, socket, isHost, userId);
  },
  loadUI: () => import("./irokaruta/IroKarutaUI").then((m) => m.default),
});

// Register Phom
games.set("phom", {
  id: "phom",
  name: { en: "Phom (Tá Lả)", vi: "Phỏm (Tá Lả)" },
  description: {
    en: "Traditional Vietnamese card game",
    vi: "Trò chơi dân gian Việt Nam",
  },
  icon: Spade,
  categories: ["card", "strategy", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: PhomGame } = await import("./phom/Phom");
    return new PhomGame(room, socket, isHost, userId);
  },
  loadUI: () => import("./phom/PhomUI").then((m) => m.default),
});

// Register Mậu Binh (Chinese Poker)
games.set("maubinh", {
  id: "maubinh",
  name: { en: "Chinese Poker", vi: "Mậu Binh (Xập Xám)" },
  description: {
    en: "Arrange 13 cards into 3 hands to win!",
    vi: "Xếp 13 lá bài thành 3 chi để thắng!",
  },
  icon: Club,
  categories: ["card", "strategy", "party"],
  minPlayers: 2,
  maxPlayers: 4,
  isAvailable: true,
  createGame: async (room, socket, isHost, userId) => {
    const { default: MauBinh } = await import("./maubinh/MauBinh");
    return new MauBinh(room, socket, isHost, userId);
  },
  loadUI: () => import("./maubinh/MauBinhUI").then((m) => m.default),
});

// Registry functions
export const getGame = (gameType: string): GameModule | undefined => {
  return games.get(gameType);
};

export const getAllGames = (): GameModule[] => {
  return Array.from(games.values()).reverse();
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
