import { memo } from "react";
import { createPortal } from "react-dom";

export interface FloatingEmoji {
  id: string;
  senderId: string;
  emoji: string;
  x: number; // percentage 0-100
}

interface EmojiFloatingLayerProps {
  emojis: FloatingEmoji[];
}

export const EmojiFloatingLayer = memo(function EmojiFloatingLayer({
  emojis,
}: EmojiFloatingLayerProps) {
  if (emojis.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-0 top-0 left-0 right-0 inset-0 pointer-events-none overflow-hidden z-500">
      {emojis.map((item) => (
        <div
          key={item.id}
          className="flex flex-col items-center absolute bottom-0 text-4xl md:text-6xl animate-floatUp will-change-transform"
          style={{
            left: `${item.x}%`,
            animationDuration: "3s", // Override if needed
          }}
        >
          {item.emoji}
          <span className="text-xs text-gray-300">{item.senderId}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
});
