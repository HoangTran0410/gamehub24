import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare, Minimize2 } from "lucide-react";
import { useUserStore } from "../stores/userStore";
import { getSocket } from "../services/socket";
import useLanguage from "../stores/languageStore";
import { useChatStore, type ChatMessage } from "../stores/chatStore";
import { useRoomStore } from "../stores/roomStore";
import { formatTimeAgo } from "../utils";

export default function GlobalChat() {
  const { currentRoom } = useRoomStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const { userId, username } = useUserStore();
  const { isGlobalChatOpen, setGlobalChatOpen, onlineCount, setOnlineCount } =
    useChatStore();
  const { ti, ts } = useLanguage();
  const socket = getSocket();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const compactMode = currentRoom != undefined;

  const isOpenRef = useRef(isGlobalChatOpen);
  useEffect(() => {
    isOpenRef.current = isGlobalChatOpen;
  }, [isGlobalChatOpen]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (!isOpenRef.current) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    const handleError = (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(null), 5000);
    };

    const fetchOnlineCount = () => {
      socket.emit("stats:online", (data: { online: number }) => {
        setOnlineCount(data.online);
      });
    };

    socket.on("global:chat", handleMessage);
    socket.on("global:chat:error", handleError);

    // Request online count
    fetchOnlineCount();

    // Periodically refresh online count
    const interval = setInterval(() => {
      fetchOnlineCount();
    }, 30000); // Every 30 seconds

    return () => {
      socket.off("global:chat", handleMessage);
      socket.off("global:chat:error", handleError);
      clearInterval(interval);
    };
  }, [socket]);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!socket) return;

    // Initial fetch
    if (isGlobalChatOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      socket.emit("global:chat:history", (history: ChatMessage[]) => {
        if (Array.isArray(history)) {
          setMessages(history);
        }
      });
    }
  }, [socket, isGlobalChatOpen]);

  useEffect(() => {
    if (messagesContainerRef.current && isGlobalChatOpen) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isGlobalChatOpen]);

  const handleSend = () => {
    if (!message.trim()) return;

    const chatMessage = {
      userId,
      username,
      message: message.trim().slice(0, 100),
      type: "user",
    };

    socket.emit("global:chat", chatMessage);
    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isGlobalChatOpen) {
    return (
      <button
        onClick={() => {
          setGlobalChatOpen(true);
          setUnreadCount(0);
        }}
        className={`fixed bottom-4 right-4 z-40 bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-white rounded-full transition-all duration-300 flex items-center gap-2 cursor-pointer group
              ${compactMode ? "w-12 h-12 flex items-center justify-center opacity-70" : "px-5 py-3"}`}
      >
        <MessageSquare className="w-5 h-5 group-hover:scale-120 transition-transform" />
        {!compactMode && <span className="font-semibold">Chat</span>}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-slate-700 animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 md:w-96 bg-background-secondary/95 glass-blur border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 animate-scaleIn max-h-[600px] h-[500px]">
      {/* Header */}
      <div className="p-3 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-text-primary flex items-center gap-1">
            {ti({ en: "Global Chat", vi: "Chat Tổng" })}
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-2" />
            {onlineCount} online
          </h3>
        </div>
        <button
          onClick={() => setGlobalChatOpen(false)}
          className="p-1.5 hover:bg-white/10 rounded-lg text-text-secondary transition-colors cursor-pointer"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20"
        ref={messagesContainerRef}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted space-y-2">
            <MessageSquare className="w-10 h-10 opacity-20" />
            <p className="text-sm">
              {ti({
                en: "Start the conversation!",
                vi: "Bắt đầu cuộc trò chuyện!",
              })}
            </p>
          </div>
        ) : (
          <div className="text-xs text-text-muted text-center w-full">
            {ti({
              en: "Show recent 20 messages",
              vi: "Hiển thị 20 tin nhắn gần nhất",
            })}
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-2.5 animate-fadeIn">
            <div className="w-8 h-8 rounded-full bg-linear-to-br from-primary/80 to-purple-600 flex items-center justify-center shrink-0 shadow-lg text-xs font-bold text-white uppercase mt-0.5">
              {msg.username[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-sm font-bold text-text-primary truncate">
                  {msg.username}
                </span>
                <span className="text-[10px] text-text-muted">
                  {ts(formatTimeAgo(msg.timestamp))} -{" "}
                  {new Date(msg.timestamp).toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed wrap-break-word bg-white/5 p-2 rounded-r-xl rounded-bl-xl">
                {msg.message}
              </p>
            </div>
          </div>
        ))}
        {error && (
          <div className="mx-auto text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 text-center animate-pulse">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10 bg-white/5 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            maxLength={100}
            placeholder={ts({
              en: "Type a message...",
              vi: "Nhập tin nhắn...",
            })}
            className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="p-2 bg-primary hover:bg-primary-light disabled:bg-white/5 disabled:text-text-muted text-white rounded-xl transition-all shadow-lg shadow-primary/20 disabled:shadow-none hover:shadow-primary/40 active:scale-95 cursor-pointer"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-2 text-center">
          {ti({
            en: "Be respectful. Spamming is not allowed.",
            vi: "Hãy tôn trọng. Không được spam.",
          })}
        </p>
      </div>
    </div>
  );
}
