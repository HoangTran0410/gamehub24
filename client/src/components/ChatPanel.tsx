import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useChatStore, type ChatMessage } from "../stores/chatStore";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { getSocket } from "../services/socket";
import useLanguage from "../stores/languageStore";
import { PRESET_EMOJIS } from "../constants";

export default function ChatPanel() {
  const [message, setMessage] = useState("");
  const { messages, addMessage, clearMessages } = useChatStore();
  const { currentRoom } = useRoomStore();
  const { userId, username } = useUserStore();
  const { ti } = useLanguage();
  const socket = getSocket();

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg: ChatMessage) => {
      if (!PRESET_EMOJIS.includes(msg.message)) addMessage(msg);
    };

    const handleHistoryDelete = () => {
      clearMessages();
    };

    // Listen for chat messages
    socket.on("chat:message", handleMessage);

    // Listen for chat history delete
    socket.on("chat:history:delete", handleHistoryDelete);

    // Request chat history when joining room
    if (currentRoom?.id) {
      socket.emit(
        "chat:history",
        { roomId: currentRoom.id },
        (history: ChatMessage[]) => {
          history.forEach((msg) => addMessage(msg));
        },
      );
    }

    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:history:delete", handleHistoryDelete);
    };
  }, [socket, addMessage, currentRoom?.id]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!message.trim() || !currentRoom) return;

    const chatMessage: Omit<ChatMessage, "id" | "timestamp"> = {
      roomId: currentRoom.id,
      userId,
      username,
      message: message.trim().slice(0, 100),
      type: "user",
    };

    socket.emit("chat:message", chatMessage);
    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-h-[400px] md:min-h-[100px]">
      {/* Messages */}
      <div
        className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[70vh]"
        ref={messagesContainerRef}
      >
        {messages.length === 0 && (
          <p className="text-text-muted text-sm text-center">
            {ti({ en: "No messages yet.", vi: "Không có tin nhắn" })}
          </p>
        )}
        {messages.map((msg) =>
          msg.type === "system" ? (
            <SystemMessage key={msg.id} message={msg} />
          ) : (
            <UserMessage
              key={msg.id}
              message={msg}
              isHost={msg.userId === currentRoom?.ownerId}
            />
          ),
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={100}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="p-2 bg-primary hover:bg-primary-light disabled:bg-primary/30 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function UserMessage({
  message,
  isHost,
}: {
  message: ChatMessage;
  isHost: boolean;
}) {
  const time = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-primary">
          {message.username[0].toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-text-primary text-sm truncate">
            {message.username}
            {isHost ? " 👑" : ""}
          </span>
          <span className="text-xs text-text-muted shrink-0">{time}</span>
        </div>
        <p className="text-text-secondary text-sm wrap-break-word text-left">
          {message.message}
        </p>
      </div>
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  const time = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <div className="flex items-center justify-center my-2">
      <div className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs text-text-muted">
        {message.message} {time}
      </div>
    </div>
  );
}
