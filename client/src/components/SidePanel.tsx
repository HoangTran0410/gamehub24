import { useState, useEffect } from "react";
import { MessageSquare, Users } from "lucide-react";
import ChatPanel from "./ChatPanel";
import UserList from "./UserList";
import useLanguage from "../stores/languageStore";
import { useChatStore } from "../stores/chatStore";
import { useRoomStore } from "../stores/roomStore";

export default function SidePanel() {
  const [activeTab, setActiveTab] = useState<"chat" | "users">("chat");
  const { ti } = useLanguage();
  const { messages } = useChatStore();
  const { currentRoom } = useRoomStore();
  const [lastReadMessageTime, setLastReadMessageTime] = useState<number>(
    Date.now(),
  );
  const [lastSeenParticipantCount, setLastSeenParticipantCount] =
    useState<number>(0);

  const messageCount = messages.length;
  const playersCount = currentRoom?.players?.length || 0;
  const spectatorsCount = currentRoom?.spectators?.length || 0;
  const participantCount = playersCount + spectatorsCount;

  // Track if there are any unread messages
  // A message is unread if its timestamp is greater than lastReadMessageTime
  // AND we are not currently on the chat tab
  const hasUnreadMessages =
    activeTab !== "chat" &&
    messages.some((msg) => msg.timestamp > lastReadMessageTime);

  // Track if there are changes in user count
  // We show badge if the current count is different from the last seen count
  // AND we are not currently on the users tab
  const hasNewUsers =
    activeTab !== "users" && participantCount !== lastSeenParticipantCount;

  // Update lastReadTime when switching to chat tab or when receiving new messages while on chat tab
  useEffect(() => {
    if (activeTab === "chat") {
      setLastReadMessageTime(Date.now());
    }
  }, [activeTab, messages.length]);

  // Update lastSeenParticipantCount when switching to users tab or when count changes while on users tab
  useEffect(() => {
    if (activeTab === "users") {
      setLastSeenParticipantCount(participantCount);
    }
  }, [activeTab, participantCount]);

  // Initial sync for participant count to avoid badge on load if we start on a different tab but want to treat initial state as "seen" (optional)
  // For now, let's assume if we start on chat, we might want to know if there are users.
  // Actually, to prevent badge on initial load if we want:
  useEffect(() => {
    if (lastSeenParticipantCount === 0 && participantCount > 0) {
      setLastSeenParticipantCount(participantCount);
    }
  }, [participantCount]); // Run once when participants are first loaded

  return (
    <div className="flex flex-col h-full w-full bg-transparent">
      {/* Tabs Header */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
            activeTab === "chat"
              ? "text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-white/5"
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-4 h-4" />
            {hasUnreadMessages && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1a1b26]" />
            )}
          </div>
          {ti({ en: "Chat", vi: "Chat" })}
          <span className="bg-white/10 text-xs py-0.5 px-1.5 rounded-md text-text-muted">
            {messageCount}
          </span>
          {activeTab === "chat" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
            activeTab === "users"
              ? "text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-white/5"
          }`}
        >
          <div className="relative">
            <Users className="w-4 h-4" />
            {hasNewUsers && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1a1b26]" />
            )}
          </div>
          {ti({ en: "Users", vi: "Trong phòng" })}
          <span className="bg-white/10 text-xs py-0.5 px-1.5 rounded-md text-text-muted">
            {playersCount}
            {participantCount > playersCount ? `/${participantCount}` : ""}
          </span>
          {activeTab === "users" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            activeTab === "chat"
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <ChatPanel />
        </div>
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            activeTab === "users"
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <UserList />
        </div>
      </div>
    </div>
  );
}
