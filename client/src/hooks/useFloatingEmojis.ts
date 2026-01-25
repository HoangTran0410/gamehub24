import { useState, useEffect } from "react";
import { uuid } from "../utils";
import { getSocket } from "../services/socket";
import type { FloatingEmoji } from "../components/room/EmojiFloatingLayer";

export const PRESET_EMOJIS = [
  "❤️",
  "😂",
  "😮",
  "😡",
  "👍",
  "👎",
  "🎉",
  "💩",
  "👻",
  "🚀",
];

export function useFloatingEmojis() {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const socket = getSocket();

  useEffect(() => {
    if (!socket) return;

    // Chat Emoji Listener
    const handleChatMessage = (msg: any) => {
      // Regex for only emojis
      // const emojiRegex =
      //   /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u;

      // const isShort = msg.message.length < 10;
      // const isOnlyEmoji = emojiRegex.test(msg.message);

      if (PRESET_EMOJIS.includes(msg.message)) {
        const id = uuid();
        const x = Math.random() * 80 + 10; // 10% to 90%
        setFloatingEmojis((prev) => [
          ...prev,
          { id, senderId: msg.username, emoji: msg.message, x },
        ]);

        // Cleanup after animation
        setTimeout(() => {
          setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
        }, 4000);
      }
    };

    socket.on("chat:message", handleChatMessage);

    return () => {
      socket.off("chat:message", handleChatMessage);
    };
  }, [socket]);

  return floatingEmojis;
}
