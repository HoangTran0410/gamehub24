import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Crown, ArrowLeft } from "lucide-react";
import { useRoomStore } from "../stores/roomStore";
import { useChatStore } from "../stores/chatStore";
import { useUserStore } from "../stores/userStore";
import { useAlertStore } from "../stores/alertStore";
import { getSocket } from "../services/socket";
import ChatPanel from "../components/ChatPanel";
import GameContainer from "../games/GameContainer";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { currentRoom, setCurrentRoom, updatePlayers } = useRoomStore();
  const { clearMessages } = useChatStore();
  const { userId } = useUserStore();
  const { show: showAlert, confirm: showConfirm } = useAlertStore();
  const socket = getSocket();

  // Effect for joining room via direct URL
  useEffect(() => {
    if (!roomId) {
      navigate("/");
      return;
    }

    // Skip if already have room data for this room
    if (currentRoom?.id === roomId) {
      console.log("Already have room data, skipping join");
      return;
    }

    let isJoining = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const attemptJoin = () => {
      if (isJoining) return;
      isJoining = true;

      console.log("Attempting to join room:", roomId, "socket.id:", socket.id);

      // Set timeout to detect failed callback
      timeoutId = setTimeout(() => {
        console.log("Join timeout - callback never received");
        isJoining = false;
      }, 5000);

      socket.emit(
        "room:join",
        { roomId },
        (response: { success: boolean; room?: any; error?: string }) => {
          console.log("room:join response:", response);
          if (timeoutId) clearTimeout(timeoutId);

          if (response.success && response.room) {
            setCurrentRoom(response.room);
          } else {
            isJoining = false;
            showAlert(response.error || "Failed to join room", {
              type: "error",
            });
            navigate("/");
          }
        }
      );
    };

    const handleConnect = () => {
      console.log("Socket connected, will attempt join");
      // Small delay to ensure socket is fully ready
      setTimeout(attemptJoin, 100);
    };

    if (socket.connected) {
      attemptJoin();
    } else {
      console.log("Socket not connected, waiting...");
      socket.on("connect", handleConnect);
    }

    return () => {
      socket.off("connect", handleConnect);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [roomId, socket, navigate, setCurrentRoom]); // eslint-disable-next-line react-hooks/exhaustive-deps

  // Effect for room event listeners
  useEffect(() => {
    if (!roomId) return;

    socket.on("room:players", (players) => {
      updatePlayers(players);
    });

    socket.on("room:update", (room) => {
      setCurrentRoom(room);
    });

    socket.on("room:deleted", (data) => {
      showAlert(data.reason || "Room deleted by host", {
        type: "info",
        title: "Room Closed",
      });
      setCurrentRoom(null);
      clearMessages();
      navigate("/");
    });

    return () => {
      socket.off("room:players");
      socket.off("room:update");
      socket.off("room:deleted");
    };
  }, [roomId, socket, updatePlayers, setCurrentRoom, navigate, clearMessages]);

  const isHost = currentRoom?.ownerId === userId;

  const handleLeaveRoom = async () => {
    const confirmed = await showConfirm(
      isHost
        ? "Room will be deleted if you (host) leave"
        : "Are you sure want to leave this room",
      "Leave room?"
    );
    if (confirmed) {
      socket.emit("room:leave", { roomId });
      setCurrentRoom(null);
      clearMessages();
      navigate("/");
    }
  };

  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary">Loading room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Room Header */}
      <header className="md:sticky md:top-0 z-40 glass-card border-b border-white/10">
        <div className="max-w-7xl mx-auto px-2 md:px-4 py-2 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleLeaveRoom}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                aria-label="Leave room"
              >
                <ArrowLeft className="w-5 h-5 text-text-secondary" />
              </button>
              <div>
                <h1 className="text-xl font-display text-text-primary">
                  {currentRoom.name}
                </h1>
                <p className="text-sm text-text-muted capitalize">
                  {currentRoom.gameType}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Crown className="w-4 h-4" />
              <span>
                Host:{" "}
                {
                  currentRoom.players.find((p) => p.id === currentRoom.ownerId)
                    ?.username
                }{" "}
                {isHost ? "(You)" : ""}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-2 md:px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Game Container */}
          <div className="glass-card rounded-2xl p-2 md:p-4">
            <GameContainer />
          </div>

          {/* Chat Panel */}
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}
