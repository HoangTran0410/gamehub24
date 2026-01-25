import { useState } from "react";
import { createPortal } from "react-dom";
import { Smile, X } from "lucide-react";
import { getSocket } from "../../services/socket";
import { useRoomStore } from "../../stores/roomStore";
import { useUserStore } from "../../stores/userStore";
import { PRESET_EMOJIS } from "../../hooks/useFloatingEmojis";

interface EmojiToolbarProps {
  className?: string;
}

export function EmojiToolbar({ className = "" }: EmojiToolbarProps) {
  const [lastSentTime, setLastSentTime] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentRoom } = useRoomStore();
  const { userId, username } = useUserStore();
  const socket = getSocket();

  const handleEmojiClick = (emoji: string) => {
    if (Date.now() - lastSentTime < 1000 || !currentRoom) return;
    setLastSentTime(Date.now());

    socket.emit("chat:message", {
      roomId: currentRoom.id,
      userId,
      username,
      message: emoji,
      type: "user",
    });
  };

  const content = (
    <div
      className={`fixed md:bottom-4 md:left-4 bottom-2 left-2 z-100 flex items-end gap-2 ${className}`}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-sm border border-white/10 ${
          isExpanded
            ? "bg-slate-800 text-white hover:bg-slate-700"
            : "bg-slate-800/80 hover:bg-slate-700 text-white animate-pulse-slow"
        }`}
        title={isExpanded ? "Hide Emojis" : "Show Emojis"}
      >
        {isExpanded ? <X className="w-6 h-6" /> : <Smile className="w-6 h-6" />}
      </button>

      {/* Emoji List */}
      <div
        className={`
          flex items-center gap-1 p-2 rounded-2xl bg-slate-900/90 border border-white/10 backdrop-blur-md shadow-2xl origin-bottom-left transition-all duration-300 ease-out
          ${isExpanded ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-50 -translate-x-10 pointer-events-none absolute left-0 bottom-0"}
        `}
      >
        <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden max-w-[70vw] no-scrollbar px-1">
          {PRESET_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-transform hover:scale-125 active:scale-95 cursor-pointer text-2xl md:text-3xl leading-none shrink-0"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
