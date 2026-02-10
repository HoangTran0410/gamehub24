import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Send,
  MessageSquare,
  Minimize2,
  ArrowLeft,
  Users,
  Circle,
  Search,
  Globe,
} from "lucide-react";
import { useUserStore } from "../stores/userStore";
import { getSocket } from "../services/socket";
import useLanguage from "../stores/languageStore";
import { useChatStore, type ChatMessage } from "../stores/chatStore";
import { useDMStore, type DMMessage, type OnlineUser } from "../stores/dmStore";
import { useRoomStore } from "../stores/roomStore";
import { formatTimeAgo } from "../utils";

type Tab = "global" | "online";

export default function GlobalChat() {
  const { currentRoom } = useRoomStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const { userId, username } = useUserStore();
  const { isGlobalChatOpen, setGlobalChatOpen, onlineCount, setOnlineCount } =
    useChatStore();
  const {
    onlineUsers,
    setOnlineUsers,
    conversations,
    addMessage: addDMMessage,
    activeChat,
    setActiveChat,
    unreadCounts,
    incrementUnread,
    markRead,
    totalUnread,
    typingUsers,
    setTyping,
  } = useDMStore();
  const { ti, ts } = useLanguage();
  const socket = getSocket();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tab, setTab] = useState<Tab>("global");
  const [searchQuery, setSearchQuery] = useState("");

  const compactMode = currentRoom != undefined;

  const isOpenRef = useRef(isGlobalChatOpen);
  useEffect(() => {
    isOpenRef.current = isGlobalChatOpen;
  }, [isGlobalChatOpen]);

  const activeChatRef = useRef(activeChat);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (!isOpenRef.current || tabRef.current !== "global") {
        setUnreadCount((prev) => prev + 1);
      }
    };

    const handleError = (data: { message: string }) => {
      setError(data.message);
      setTimeout(() => setError(null), 5000);
    };

    // DM handlers
    const handleOnlineUsers = (users: OnlineUser[]) => {
      console.log("online users", users);
      setOnlineUsers(users);
      setOnlineCount(users.length);
    };

    const handleDMReceive = (msg: DMMessage) => {
      addDMMessage(msg.from, msg);
      // Show unread if not currently viewing this DM
      if (
        !isOpenRef.current ||
        tabRef.current !== "online" ||
        activeChatRef.current !== msg.from
      ) {
        incrementUnread(msg.from);
      }
    };

    const handleDMTyping = (data: { from: string; isTyping: boolean }) => {
      setTyping(data.from, data.isTyping);
      if (data.isTyping) {
        // Auto-clear typing after 3s
        setTimeout(() => setTyping(data.from, false), 3000);
      }
    };

    socket.on("global:chat", handleMessage);
    socket.on("global:chat:error", handleError);
    socket.on("dm:online_users", handleOnlineUsers);
    socket.on("dm:receive", handleDMReceive);
    socket.on("dm:typing", handleDMTyping);

    // Fetch online users list
    socket.emit("dm:online_users", (users: OnlineUser[]) => {
      handleOnlineUsers(users);
    });

    return () => {
      socket.off("global:chat", handleMessage);
      socket.off("global:chat:error", handleError);
      socket.off("dm:online_users", handleOnlineUsers);
      socket.off("dm:receive", handleDMReceive);
      socket.off("dm:typing", handleDMTyping);
    };
  }, [socket]);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!socket) return;
    if (isGlobalChatOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      socket.emit("global:chat:history", (history: ChatMessage[]) => {
        if (Array.isArray(history)) {
          setMessages(history);
        }
      });
    }
  }, [socket, isGlobalChatOpen]);

  // Auto-scroll
  useEffect(() => {
    if (messagesContainerRef.current && isGlobalChatOpen) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isGlobalChatOpen, activeChat, conversations]);

  // Mark read & fetch DM history when opening a DM
  useEffect(() => {
    if (activeChat && tab === "online") {
      markRead(activeChat);
    }
  }, [activeChat, tab, socket]);

  // Typing debounce for DM
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitTyping = useCallback(
    (to: string) => {
      socket.emit("dm:typing", { to, isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("dm:typing", { to, isTyping: false });
      }, 2000);
    },
    [socket],
  );

  const handleSend = () => {
    if (!message.trim()) return;

    if (tab === "online" && activeChat) {
      // Send DM
      socket.emit(
        "dm:send",
        { to: activeChat, message: message.trim().slice(0, 500) },
        (response: {
          success: boolean;
          message?: DMMessage;
          error?: string;
        }) => {
          if (response.success && response.message) {
            addDMMessage(activeChat, response.message);
          } else {
            setError(response.error || "Failed to send");
            setTimeout(() => setError(null), 3000);
          }
        },
      );
    } else {
      // Send global
      const chatMessage = {
        userId,
        username,
        message: message.trim().slice(0, 100),
        type: "user",
      };
      socket.emit("global:chat", chatMessage);
    }
    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (tab === "online" && activeChat && e.target.value) {
      emitTyping(activeChat);
    }
  };

  const sortedUsers = useMemo(() => {
    // Combine all users into one list
    const allUsersUnsorted = new Map<
      string,
      {
        userId: string;
        username: string;
        isOnline: boolean;
        lastMessageTime: number;
      }
    >();

    // 1. Add online users
    onlineUsers
      .filter((u) => u.userId !== userId) // Filter out self
      .filter((u) =>
        searchQuery
          ? u.username.toLowerCase().includes(searchQuery.toLowerCase())
          : true,
      )
      .forEach((u) => {
        const msgs = conversations.get(u.username) || [];
        const lastMsg = msgs[msgs.length - 1];
        allUsersUnsorted.set(u.username, {
          userId: u.userId,
          username: u.username,
          isOnline: true,
          lastMessageTime: lastMsg ? lastMsg.timestamp : 0,
        });
      });

    // 2. Add offline users with history (if not already added)
    Array.from(conversations.entries()).forEach(([uname, msgs]) => {
      if (uname === username) return; // Skip self

      // search filter
      if (
        searchQuery &&
        !uname.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return;
      }

      if (!allUsersUnsorted.has(uname)) {
        // User is offline
        const lastMsg = msgs[msgs.length - 1];
        allUsersUnsorted.set(uname, {
          userId: uname, // fallback ID
          username: uname,
          isOnline: false,
          lastMessageTime: lastMsg ? lastMsg.timestamp : 0,
        });
      }
    });

    return Array.from(allUsersUnsorted.values()).sort((a, b) => {
      // 1. Sort by last message time (descending)
      if (b.lastMessageTime !== a.lastMessageTime) {
        return b.lastMessageTime - a.lastMessageTime;
      }
      // 2. Sort by online status (online first)
      if (a.isOnline !== b.isOnline) {
        return a.isOnline ? -1 : 1;
      }
      // 3. Sort by username (ascending)
      return a.username.localeCompare(b.username);
    });
  }, [onlineUsers, userId, searchQuery, conversations, username]);

  const dmTotalUnread = totalUnread();

  // --- Collapsed button ---
  if (!isGlobalChatOpen) {
    const totalBadge = unreadCount + dmTotalUnread;
    return (
      <button
        onClick={() => {
          setGlobalChatOpen(true);
          setUnreadCount(0);
          // Auto-switch to online tab if there's an active DM
          if (activeChat) setTab("online");
        }}
        className={`fixed bottom-4 right-4 z-40 bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-white rounded-full transition-all duration-300 flex items-center gap-2 cursor-pointer group
              ${compactMode ? "w-12 h-12 flex items-center justify-center opacity-70" : "px-5 py-3"}`}
      >
        <MessageSquare className="w-5 h-5 group-hover:scale-120 transition-transform" />
        {!compactMode && <span className="font-semibold">Chat</span>}
        {totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-slate-700 animate-pulse">
            {totalBadge > 9 ? "9+" : totalBadge}
          </span>
        )}
      </button>
    );
  }

  // --- Active DM conversation ---
  // Try to find user in online list, otherwise derive from activeChat (which is now the username)
  const activeDMUser =
    onlineUsers.find((u) => u.username === activeChat) ||
    (activeChat
      ? {
          userId: "", // Unknown if offline and not in list, but we rely on username mostly
          username: activeChat,
          isOffline: true,
        }
      : undefined);
  const dmMessages = activeChat ? conversations.get(activeChat) || [] : [];
  const isTargetTyping = activeChat ? typingUsers.get(activeChat) : false;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 md:w-96 bg-background-secondary/95 glass-blur border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 animate-scaleIn max-h-[600px] h-[500px]">
      {/* Header */}
      <div className="p-3 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {tab === "online" && activeChat ? (
            <>
              <button
                onClick={() => setActiveChat(null)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-text-secondary" />
              </button>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase ${
                  onlineUsers.some((u) => u.username === activeChat)
                    ? "bg-linear-to-br from-emerald-500 to-cyan-600"
                    : "bg-stone-600"
                }`}
              >
                {activeDMUser?.username?.[0] || "?"}
              </div>
              <div>
                <h3 className="font-bold text-text-primary text-sm leading-tight">
                  {activeDMUser?.username || "User"}
                </h3>
                {isTargetTyping ? (
                  <span className="text-[10px] text-emerald-400 animate-pulse">
                    typing...
                  </span>
                ) : (
                  !onlineUsers.some((u) => u.username === activeChat) && (
                    <span className="text-[10px] text-text-muted">Offline</span>
                  )
                )}
              </div>
            </>
          ) : (
            <>
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-text-primary flex items-center gap-1">
                {tab === "global"
                  ? ti({ en: "Global Chat", vi: "Chat Tổng" })
                  : ti({ en: "Online", vi: "Trực Tuyến" })}
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-2" />
                {onlineCount} online
              </h3>
            </>
          )}
        </div>
        <button
          onClick={() => {
            setGlobalChatOpen(false);
          }}
          className="p-1.5 hover:bg-white/10 rounded-lg text-text-secondary transition-colors cursor-pointer"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      {!activeChat && (
        <div className="flex border-b border-white/10 shrink-0">
          <button
            onClick={() => {
              setTab("global");
              setUnreadCount(0);
            }}
            className={`flex-1 py-2 text-xs font-semibold transition-all cursor-pointer relative ${
              tab === "global"
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-text-muted hover:text-text-secondary hover:bg-white/5"
            }`}
          >
            <Globe className="w-3.5 h-3.5 inline mr-1" />
            {ti({ en: "Global", vi: "Tổng" })}
            {unreadCount > 0 && tab !== "global" && (
              <span className="absolute top-1 right-3 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("online")}
            className={`flex-1 py-2 text-xs font-semibold transition-all cursor-pointer relative ${
              tab === "online"
                ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5"
                : "text-text-muted hover:text-text-secondary hover:bg-white/5"
            }`}
          >
            <Users className="w-3.5 h-3.5 inline mr-1" />
            Online ({onlineUsers.length})
            {dmTotalUnread > 0 && tab !== "online" && (
              <span className="absolute top-1 right-3 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {dmTotalUnread > 9 ? "9+" : dmTotalUnread}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Content area */}
      {tab === "global" && !activeChat ? (
        // --- Global Chat Messages ---
        <>
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
                        hour12: false,
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
                onChange={handleInputChange}
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
        </>
      ) : tab === "online" && !activeChat ? (
        // --- Online Users List ---
        <div className="flex-1 overflow-y-auto bg-black/20 flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-white/5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={ts({ en: "Search users...", vi: "Tìm kiếm..." })}
                className="w-full pl-8 pr-3 py-1.5 bg-black/20 border border-white/10 rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-emerald-400/50 transition-all"
              />
            </div>
          </div>
          {(() => {
            if (sortedUsers.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center flex-1 text-text-muted space-y-2">
                  <Users className="w-10 h-10 opacity-20" />
                  <p className="text-sm">
                    {searchQuery
                      ? ti({ en: "No users found", vi: "Không tìm thấy" })
                      : ti({
                          en: "No other users available",
                          vi: "Không có người dùng nào khác",
                        })}
                  </p>
                </div>
              );
            }

            return (
              <div className="p-2 space-y-0.5 flex-1 overflow-y-auto">
                {sortedUsers.map((user) => (
                  <UserListItem
                    key={user.username}
                    user={{ userId: user.userId, username: user.username }}
                    isOnline={user.isOnline}
                    unreadCount={unreadCounts.get(user.username) || 0}
                    isTyping={typingUsers.get(user.username)}
                    msgCount={(conversations.get(user.username) || []).length}
                    onClick={() => {
                      setActiveChat(user.username);
                      markRead(user.username);
                      setSearchQuery("");
                    }}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        // --- DM Conversation View ---
        <>
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20"
            ref={messagesContainerRef}
          >
            {dmMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted space-y-2">
                <Send className="w-10 h-10 opacity-20" />
                <p className="text-sm text-center">
                  {ti({
                    en: `Start a conversation with ${activeDMUser?.username || "this user"}`,
                    vi: `Bắt đầu trò chuyện với ${activeDMUser?.username || "người dùng này"}`,
                  })}
                </p>
              </div>
            ) : null}
            {dmMessages.map((msg) => {
              const isMine = msg.from === username; // Check against MY username
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 animate-fadeIn ${isMine ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white uppercase mt-0.5 shadow-lg ${
                      isMine
                        ? "bg-linear-to-br from-primary/80 to-purple-600"
                        : "bg-linear-to-br from-emerald-500 to-cyan-600"
                    }`}
                  >
                    {msg.from[0]}
                  </div>
                  <div className={`max-w-[75%] ${isMine ? "text-right" : ""}`}>
                    <span className="text-[10px] text-text-muted">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                    <p
                      className={`text-sm leading-relaxed wrap-break-word p-2 ${
                        isMine
                          ? "bg-primary/20 text-text-primary rounded-l-xl rounded-br-xl ml-auto"
                          : "bg-white/5 text-text-secondary rounded-r-xl rounded-bl-xl"
                      }`}
                    >
                      {msg.message}
                    </p>
                  </div>
                </div>
              );
            })}
            {isTargetTyping && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 animate-pulse pl-2">
                <span className="flex gap-0.5">
                  <span
                    className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
                {activeDMUser?.username} is typing...
              </div>
            )}
            {error && (
              <div className="mx-auto text-xs text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 text-center animate-pulse">
                {error}
              </div>
            )}
          </div>

          {/* DM Input */}
          <div className="p-3 border-t border-white/10 bg-white/5 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                maxLength={500}
                placeholder={
                  activeDMUser?.isOffline
                    ? ts({
                        en: "User is offline",
                        vi: "Người dùng không online",
                      })
                    : ts({
                        en: `Message ${activeDMUser?.username || ""}...`,
                        vi: `Nhắn tin cho ${activeDMUser?.username || ""}...`,
                      })
                }
                disabled={activeDMUser?.isOffline}
                className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400/50 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || activeDMUser?.isOffline}
                className="p-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/5 disabled:text-text-muted text-white rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:shadow-none hover:shadow-emerald-500/40 active:scale-95 cursor-pointer"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function UserListItem({
  user,
  isOnline,
  unreadCount,
  isTyping,
  msgCount,
  onClick,
}: {
  user: { userId: string; username: string };
  isOnline: boolean;
  unreadCount: number;
  isTyping?: boolean;
  msgCount: number;
  onClick: () => void;
}) {
  const { ti } = useLanguage();

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-all cursor-pointer group ${
        !isOnline ? "opacity-70 hover:opacity-100" : ""
      }`}
    >
      <div className="relative">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white uppercase shadow-lg ${
            isOnline
              ? "bg-linear-to-br from-emerald-500 to-cyan-600"
              : "bg-stone-600"
          }`}
        >
          {user.username[0]}
        </div>
        {isOnline && (
          <Circle className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 text-green-500 fill-green-500 stroke-background-secondary stroke-2" />
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <span className="text-sm font-semibold text-text-primary truncate block">
          {user.username}
        </span>
        {isTyping ? (
          <span className="text-[11px] text-emerald-400 animate-pulse">
            typing...
          </span>
        ) : msgCount > 0 ? (
          <span className="text-[11px] text-text-muted">
            {msgCount} {ti({ en: "messages", vi: "tin nhắn" })}
          </span>
        ) : (
          <span className="text-[11px] text-text-muted">
            {ti({
              en: "Click to chat",
              vi: "Nhấn để chat",
            })}
          </span>
        )}
      </div>
      {unreadCount > 0 && (
        <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
      {/* <Send className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" /> */}
    </button>
  );
}
