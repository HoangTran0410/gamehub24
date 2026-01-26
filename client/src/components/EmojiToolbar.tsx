import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Smile, X } from "lucide-react";
import { getSocket } from "../services/socket";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { uuid } from "../utils";
import { PRESET_EMOJIS } from "../constants";

export interface FloatingEmoji {
  id: string;
  senderId: string;
  emoji: string;
  x: number; // percentage 0-100
}

export default function EmojiToolbar() {
  const [lastSentTime, setLastSentTime] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentRoom } = useRoomStore();
  const { userId, username } = useUserStore();
  const socket = getSocket();

  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);

  const timeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (!socket) return;

    // Chat Emoji Listener
    const handleChatMessage = (msg: any) => {
      // Regex for only emojis
      // const emojiRegex =
      //   /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u;

      // const isShort = msg.message.length < 10;
      // const isOnlyEmoji = emojiRegex.test(msg.message);

      if (PRESET_EMOJIS.includes(msg.message.trim())) {
        const id = uuid();
        setEmojis((prev) => [
          ...prev,
          {
            id,
            senderId: msg.username,
            emoji: msg.message,
            x: Math.random() * 60 + 20,
          },
        ]);

        // Cleanup after animation
        timeoutRef.current[id] = setTimeout(() => {
          setEmojis((prev) => prev.filter((e) => e.id !== id));
        }, 4000);
      }
    };

    socket.on("chat:message", handleChatMessage);

    return () => {
      socket.off("chat:message", handleChatMessage);
      Object.values(timeoutRef.current).forEach((timeout) =>
        clearTimeout(timeout),
      );
    };
  }, [socket]);

  const handleEmojiClick = (emoji: string) => {
    if (Date.now() - lastSentTime < 500 || !currentRoom) return;
    setLastSentTime(Date.now());

    if (currentRoom?.isOffline) {
      setEmojis((prev) => [
        ...prev,
        {
          id: uuid(),
          senderId: username,
          emoji,
          x: Math.random() * 60 + 20,
        },
      ]);
    } else {
      socket.emit("chat:message", {
        roomId: currentRoom.id,
        userId,
        username,
        message: emoji,
        type: "user",
        temp: true,
      });
    }
  };

  return createPortal(
    <>
      {/* Toolbar */}
      <div
        className={`fixed md:bottom-4 md:left-4 bottom-2 left-2 z-100 flex items-end gap-2 max-w-full`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border border-white/10 cursor-pointer ${
            isExpanded
              ? "bg-slate-800 text-white hover:bg-slate-700"
              : "bg-slate-800/80 hover:bg-slate-700 text-white animate-pulse-slow opacity-70"
          }`}
        >
          {isExpanded ? (
            <X className="w-6 h-6" />
          ) : (
            <Smile className="w-6 h-6 hover:scale-120 transition-transform" />
          )}
        </button>

        {/* Emoji List */}
        <div
          className={`flex flex-col items-center gap-1 p-2 rounded-2xl bg-slate-900/90 border border-white/10 backdrop-blur-md shadow-2xl origin-bottom-left transition-all duration-300 ease-out
            ${isExpanded ? "opacity-100 scale-100 translate-y-0" : "opacity-0 translate-y-20 pointer-events-none absolute left-14"}`}
        >
          <div className="flex flex-col items-start gap-1 overflow-auto max-w-[75vw] no-scrollbar px-1">
            {PRESET_EMOJIS.split("\n").map((emojiRow) => (
              <div key={emojiRow} className="flex items-center gap-1">
                {emojiRow.split(" ").map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiClick(emoji)}
                    className="md:p-1.5 p-1 hover:bg-white/10 rounded-lg transition-transform hover:scale-125 active:scale-95 cursor-pointer text-2xl md:text-3xl leading-none shrink-0"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Emojis */}
      <div className="fixed bottom-0 top-0 left-0 right-0 inset-0 pointer-events-none overflow-hidden z-500">
        {emojis.map((item) => (
          <div
            key={item.id}
            className="flex flex-col items-center absolute bottom-0 text-4xl md:text-6xl animate-floatUp will-change-transform transform-origin-center"
            style={{
              left: `${item.x}%`,
              animationDuration: "3s", // Override if needed
            }}
          >
            {item.emoji}
            <span className="text-xs text-gray-300">{item.senderId}</span>
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
