import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DMMessage {
  id: string;
  from: string;
  to: string;
  message: string;
  timestamp: number;
}

export interface OnlineUser {
  userId: string;
  username: string;

  isOffline?: boolean;
}

interface DMStore {
  onlineUsers: OnlineUser[];
  setOnlineUsers: (users: OnlineUser[]) => void;

  // Conversations: keyed by the OTHER user's USERNAME
  conversations: Map<string, DMMessage[]>;
  addMessage: (otherUsername: string, message: DMMessage) => void;
  setConversation: (otherUsername: string, messages: DMMessage[]) => void;

  // Active chat: USERNAME of the user we're chatting with
  activeChat: string | null;
  setActiveChat: (username: string | null) => void;

  // Unread counts per USERNAME
  unreadCounts: Map<string, number>;
  incrementUnread: (username: string) => void;
  markRead: (username: string) => void;
  totalUnread: () => number;

  // Typing indicators (keyed by USERNAME)
  typingUsers: Map<string, boolean>;
  setTyping: (username: string, isTyping: boolean) => void;
}

// Custom storage to handle Map serialization
const storage = {
  getItem: (name: string) => {
    const str = localStorage.getItem(name);
    if (!str) return null;
    return JSON.parse(str, (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (value.__type === "Map") {
          return new Map(value.value);
        }
      }
      return value;
    });
  },
  setItem: (name: string, value: any) => {
    const str = JSON.stringify(value, (_key, value) => {
      if (value instanceof Map) {
        return {
          __type: "Map",
          value: Array.from(value.entries()),
        };
      }
      return value;
    });
    localStorage.setItem(name, str);
  },
  removeItem: (name: string) => localStorage.removeItem(name),
};

export const useDMStore = create<DMStore>()(
  persist(
    (set, get) => ({
      onlineUsers: [],
      setOnlineUsers: (users) => set({ onlineUsers: users }),

      conversations: new Map(),
      addMessage: (otherUsername, message) =>
        set((state) => {
          const conversations = new Map(state.conversations);
          const messages = conversations.get(otherUsername) || [];
          // Prevent duplicates
          if (messages.some((m) => m.id === message.id)) return state;
          conversations.set(otherUsername, [...messages, message]);
          return { conversations };
        }),
      setConversation: (otherUsername, messages) =>
        set((state) => {
          const conversations = new Map(state.conversations);
          conversations.set(otherUsername, messages);
          return { conversations };
        }),

      activeChat: null,
      setActiveChat: (username) => set({ activeChat: username }),

      unreadCounts: new Map(),
      incrementUnread: (username) =>
        set((state) => {
          const unreadCounts = new Map(state.unreadCounts);
          unreadCounts.set(username, (unreadCounts.get(username) || 0) + 1);
          return { unreadCounts };
        }),
      markRead: (username) =>
        set((state) => {
          const unreadCounts = new Map(state.unreadCounts);
          unreadCounts.delete(username);
          return { unreadCounts };
        }),
      totalUnread: () => {
        const counts = get().unreadCounts;
        let total = 0;
        counts.forEach((count) => (total += count));
        return total;
      },

      typingUsers: new Map(),
      setTyping: (username, isTyping) =>
        set((state) => {
          const typingUsers = new Map(state.typingUsers);
          if (isTyping) {
            typingUsers.set(username, true);
          } else {
            typingUsers.delete(username);
          }
          return { typingUsers };
        }),
    }),
    {
      name: "gamehub-dm-storage-v2", // v2 to invalidate old (userId-based) data
      storage: storage,
      partialize: (state) => ({
        conversations: state.conversations,
        unreadCounts: state.unreadCounts,
        activeChat: state.activeChat,
      }),
    },
  ),
);
