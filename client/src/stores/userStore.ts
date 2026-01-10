import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserStore {
  userId: string;
  username: string;
  generateNewId: () => void;
  setUsername: (username: string) => void;
}

const ADJECTIVES = [
  // Cũ
  "swift",
  "brave",
  "calm",
  "cool",
  "quick",
  "bold",
  "wise",
  "keen",
  "wild",
  "free",
  "pure",
  "deep",
  "warm",
  "soft",
  "fair",
  "true",
  "glad",
  "kind",
  "neat",
  "rich",
  "safe",
  "slim",
  "tall",
  "fast",
  // Mới: Trạng thái & Tính chất
  "bright",
  "dark",
  "sharp",
  "smooth",
  "grand",
  "proud",
  "vivid",
  "silent",
  "lucky",
  "heavy",
  "light",
  "fresh",
  "mighty",
  "gentle",
  "fancy",
  "tough",
  "loyal",
  "quiet",
  "smart",
  "super",
  "eager",
  "jolly",
  "crisp",
  "sturdy",
  "noble",
  "brisk",
  "dandy",
  "fancy",
  "flat",
  "glossy",
  "good",
  "grand",
  "great",
  "handy",
  "happy",
  "hardy",
  "huge",
  "lean",
  "long",
  "lost",
  // Mới: Màu sắc & Cảm giác
  "red",
  "blue",
  "green",
  "gold",
  "silver",
  "pink",
  "gray",
  "white",
  "black",
  "azure",
  "amber",
  "blind",
  "busy",
  "cheap",
  "chief",
  "clean",
  "close",
  "crazy",
  "curly",
  "cute",
  "daft",
  "dear",
  "dirty",
  "dry",
  "easy",
  "extra",
  "fair",
  "fine",
  "firm",
  "flat",
  "full",
  "funny",
  "good",
  "grey",
  "grim",
  "half",
  "hard",
  "high",
  "holy",
  "hot",
];

const NOUNS = [
  // Cũ
  "tiger",
  "wave",
  "star",
  "wind",
  "hawk",
  "wolf",
  "bear",
  "lake",
  "moon",
  "fire",
  "snow",
  "leaf",
  "rain",
  "rock",
  "rose",
  "tree",
  "bird",
  "fish",
  "frog",
  "deer",
  "dove",
  "fox",
  "owl",
  "seal",
  // Mới: Động vật & Sinh vật
  "eagle",
  "lion",
  "lynx",
  "orca",
  "panda",
  "crane",
  "swan",
  "falcon",
  "whale",
  "shark",
  "horse",
  "mouse",
  "snake",
  "goat",
  "lamb",
  "duck",
  "goose",
  "crab",
  "ant",
  "bee",
  "wasp",
  "moth",
  "slug",
  "snail",
  "stork",
  "crow",
  "raven",
  "robin",
  "finch",
  "cricket",
  // Mới: Thiên nhiên & Địa lý
  "ocean",
  "mount",
  "river",
  "cloud",
  "desert",
  "forest",
  "valley",
  "peak",
  "cliff",
  "dune",
  "field",
  "glade",
  "grove",
  "island",
  "marsh",
  "meadow",
  "pond",
  "reef",
  "shore",
  "spring",
  "stone",
  "brook",
  "creek",
  "bench",
  "bridge",
  "gate",
  "path",
  "road",
  "stone",
  "wall",
  // Mới: Vũ trụ & Khác
  "sun",
  "mars",
  "sky",
  "comet",
  "nova",
  "dust",
  "gem",
  "iron",
  "gold",
  "silk",
  "steel",
  "zinc",
  "bolt",
  "beam",
  "ray",
  "zone",
  "space",
  "orbit",
  "path",
  "way",
];

function toUpperCaseFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Generate short, readable, memorable IDs like "swift-tiger-42"
export const generateRandomUsername = (): string => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${toUpperCaseFirstLetter(adj)}${toUpperCaseFirstLetter(noun)}${num}`;
};

export const useUserStore = create<UserStore>()(
  persist(
    (set) => {
      const username =
        localStorage.getItem("gamehub_user") || generateRandomUsername();
      localStorage.setItem("gamehub_user", username);

      return {
        userId: "user_" + username,
        username: username,

        generateNewId: () => {
          const u = generateRandomUsername();
          localStorage.setItem("gamehub_user", u);
          return set({
            userId: "user_" + u,
            username: u,
          });
        },
        setUsername: (username: string) => set({ username }),
      };
    },
    {
      name: "gamehub_user",
    }
  )
);
