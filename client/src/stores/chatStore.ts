import { create } from "zustand";

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
  type: "user" | "system";
  temp?: boolean;
}

interface ChatStore {
  onlineCount: number;
  setOnlineCount: (count: number) => void;
  messages: ChatMessage[];
  isGlobalChatOpen: boolean;
  setGlobalChatOpen: (isOpen: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  setMessages: (messages: ChatMessage[]) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  onlineCount: 0,
  setOnlineCount: (count) => set({ onlineCount: count }),
  isGlobalChatOpen: false,
  setGlobalChatOpen: (isOpen) => set({ isGlobalChatOpen: isOpen }),

  messages: [],
  addMessage: (message) =>
    set((state) => {
      // Prevent duplicates
      if (state.messages.some((m) => m.id === message.id)) {
        return state;
      }
      return { messages: [...state.messages, message] };
    }),
  clearMessages: () => set({ messages: [] }),
  setMessages: (messages) => set({ messages }),
}));
