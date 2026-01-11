import { io, Socket } from "socket.io-client";
import { useUserStore } from "../stores/userStore";
import { useSocketStore } from "../stores/socketStore";

let socket: Socket | null = null;

// Get server URL from environment or localStorage
export const getServerUrl = (): string => {
  const savedUrl = localStorage.getItem("gamehub_server_url");
  if (savedUrl) return savedUrl;

  return import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
};

// Update server URL and reconnect
export const setServerUrl = (url: string): void => {
  localStorage.setItem("gamehub_server_url", url);

  // Disconnect existing socket
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // Reinitialize and connect
  initSocket();
  connectSocket();
};

// Initialize socket connection
export const initSocket = (): Socket => {
  if (socket) return socket;

  const { userId, username } = useUserStore.getState();

  socket = io(getServerUrl(), {
    auth: {
      userId,
      username,
    },
    autoConnect: true,
  });

  // Connection event handlers
  socket.on("connect", () => {
    console.log("✅ Connected to server:", socket?.id);
    useSocketStore.getState().setIsConnected(true);
  });

  socket.on("disconnect", (reason) => {
    console.log("❌ Disconnected from server:", reason);
    useSocketStore.getState().setIsConnected(false);
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error.message);
  });

  return socket;
};

// Get existing socket instance (auto-initializes if needed)
export const getSocket = (): Socket => {
  if (!socket) {
    return initSocket();
  }
  return socket;
};

// Connect to server
export const connectSocket = (): void => {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
};

// Disconnect from server
export const disconnectSocket = (): void => {
  if (socket?.connected) {
    socket.disconnect();
  }
};

// Export socket getter for use in components
export { socket };
