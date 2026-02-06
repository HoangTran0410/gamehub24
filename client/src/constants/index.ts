export const PRESET_EMOJIS = `😂 😭 😮 😡 🤬 😎 🤔 😐 🙄
❤️ 💔 👍 👎 🔥 💯 👏 🙌
🎉 🏆 🚀 💥 💣 🎯
🤡 💀 💩 👻 👊 🤝`;

// Game categories
export type GameCategory =
  | "board"
  | "strategy"
  | "puzzle"
  | "card"
  | "party"
  | "relax"
  | "gun";

// Category display names and colors
export const CATEGORY_CONFIG: Record<
  GameCategory,
  { label: { en: string; vi: string }; color: string }
> = {
  board: {
    label: { en: "Board", vi: "Bàn cờ" },
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  strategy: {
    label: { en: "Strategy", vi: "Chiến thuật" },
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  puzzle: {
    label: { en: "Puzzle", vi: "Giải đố" },
    color: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  card: {
    label: { en: "Card", vi: "Bài" },
    color: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  party: {
    label: { en: "Party", vi: "Nhiều người" },
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  relax: {
    label: { en: "Relax", vi: "Thư giãn" },
    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
  gun: {
    label: { en: "Gun", vi: "Bắn súng" },
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
};

export type UpdateType = "new" | "hot" | "fix";

export const UpdateTypeColor: Record<UpdateType, string> = {
  new: "text-green-500",
  hot: "text-red-500",
  fix: "text-yellow-500",
};

export const updates: {
  type: UpdateType;
  en: string;
  vi: string;
  timestamp: number;
  gameId?: string;
  link?: string;
}[] = [
  {
    type: "new",
    en: "New game: Exploding Kittens",
    vi: "Game mới: Mèo Nổ",
    gameId: "explodingkittens",
    timestamp: 1770360805218,
  },
  {
    type: "new",
    en: "Add sounds",
    vi: "Thêm âm thanh",
    timestamp: 1770268040360,
  },
  {
    type: "fix",
    en: "Fix UI and optimize games",
    vi: "Fix giao diện và tối ưu games",
    timestamp: 1770152415598,
  },
  {
    type: "new",
    en: "New game: Gunny Wars",
    vi: "Game mới: Bắn Gunny",
    gameId: "gunny",
    timestamp: 1770070617562,
  },
  {
    type: "fix",
    en: "Fix bug hang web: Uno",
    vi: "Fix bug đứng web: Uno",
    gameId: "uno",
    timestamp: 1769855181340,
  },
  {
    type: "new",
    en: "New game: Maze",
    vi: "Game mới: Mê Cung",
    gameId: "maze",
    timestamp: 1769669794704,
  },
  {
    type: "new",
    en: "New feature: Global chat",
    vi: "Chức năng mới: Chat tổng",
    timestamp: 1769360911300,
  },
  {
    type: "fix",
    en: "New game: Draw & Guess",
    vi: "Game mới: Vẽ & Đoán",
    gameId: "draw",
    timestamp: 1769331150518,
  },
  {
    type: "new",
    en: "Emoji in all games",
    vi: "Thả emoji trong mọi game",
    timestamp: 1769331150517,
  },
  {
    type: "new",
    en: "New game: Poker",
    vi: "Game mới: Xì tố (Poker)",
    gameId: "poker",
    timestamp: 1769274000000,
  },
  {
    type: "hot",
    en: "Welcome to Gamehub24",
    vi: "Ra mắt Gamehub24",
    timestamp: 1769101200000,
    link: "https://www.facebook.com/groups/indiehackervn/posts/2062449634542598",
  },
];

export const lastUpdatedTime = updates.reduce((max, update) => {
  return Math.max(max, update.timestamp);
}, 0);
