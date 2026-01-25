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
  | "relax";

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
};
