import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gamepad, Users, Plus, Trash2, Settings } from "lucide-react";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { useSocketStore } from "../stores/socketStore";
import { useAlertStore } from "../stores/alertStore";
import { getSocket } from "../services/socket";
import { getAllGames } from "../games/registry";
import type { Room } from "../stores/roomStore";
import SettingsModal from "../components/SettingsModal";

export default function Lobby() {
  const { username } = useUserStore();
  const { isConnected } = useSocketStore();
  const { publicRooms, setPublicRooms } = useRoomStore();
  const [showCreateModal, setShowCreateModal] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const socket = getSocket();

    // Request public rooms list
    socket.emit("room:list", (rooms: Room[]) => {
      setPublicRooms(rooms);
    });

    // Request online count
    socket.emit("stats:online", (data: { online: number }) => {
      setOnlineCount(data.online);
    });

    // Listen for room list updates
    socket.on("room:list:update", (rooms: Room[]) => {
      setPublicRooms(rooms);
    });

    // Periodically refresh online count
    const interval = setInterval(() => {
      socket.emit("stats:online", (data: { online: number }) => {
        setOnlineCount(data.online);
      });
    }, 10000); // Every 10 seconds

    return () => {
      socket.off("room:list:update");
      clearInterval(interval);
    };
  }, [setPublicRooms]);

  const handleSelectGame = (gameId: string) => {
    // Open create room modal
    setShowCreateModal(gameId);
  };

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Navbar */}
      <nav className="fixed top-4 left-4 right-4 z-50">
        <div className="max-w-7xl mx-auto glass-card rounded-2xl px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Gamepad className="w-8 h-8 text-primary" />
              <span className="text-xl font-display text-text-primary">
                GameHub
              </span>
            </div>

            <div
              onClick={() => setShowSettingsModal(true)}
              className={`flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer ${
                !isConnected ? "opacity-50" : ""
              }`}
              title={isConnected ? "Connected" : "Disconnected"}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span className="text-sm font-medium text-text-primary">
                {username}
              </span>
              <Settings className="w-4 h-4" />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-32 px-2 md:px-4 pb-16">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h2 className="text-5xl font-display text-text-primary mb-4 neon-glow">
              Play Together, Anywhere
            </h2>
            <p className="text-xl text-text-secondary mb-8">
              Join multiplayer games with friends in real-time
            </p>
            <div className="flex items-center justify-center gap-2 md:gap-4 flex-col md:flex-row">
              <button
                onClick={() => setShowCreateModal("")}
                className="px-8 py-3 bg-primary hover:bg-primary-light text-white font-display rounded-xl shadow-lg shadow-primary/50 hover:shadow-xl hover:shadow-primary/70 transition-all duration-200 cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create Room
              </button>

              <button
                onClick={() => {
                  const roomDiv = document.getElementById(
                    "public-rooms-section"
                  );
                  if (roomDiv) {
                    roomDiv.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-display rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex items-center gap-2 backdrop-blur-sm"
              >
                <Users className="w-5 h-5" />
                Public Rooms ({publicRooms.length})
              </button>
            </div>

            {/* Online Users Count */}
            <div className="mt-6 flex items-center justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {onlineCount} player{onlineCount !== 1 ? "s" : ""} online
              </div>
            </div>
          </div>

          {/* Games Gallery */}
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <Gamepad className="w-6 h-6 text-primary" />
              <h3 className="text-2xl font-display text-text-primary">
                Available Games
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:gap-6 gap-3">
              {getAllGames().map((game) => {
                const Icon = game.icon;
                return (
                  <div
                    key={game.id}
                    className={`glass-card rounded-2xl p-6 hover:border-primary/30 transition-all duration-200 ${
                      !game.isAvailable ? "opacity-50" : ""
                    }`}
                  >
                    {/* align center */}
                    <div className="mb-4 flex items-center justify-center">
                      <Icon className="w-12 h-12 text-primary" />
                    </div>
                    <h4 className="font-display text-xl text-text-primary mb-2">
                      {game.name}
                    </h4>
                    <p className="text-sm text-text-secondary mb-4">
                      {game.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
                      <Users className="w-4 h-4" />
                      <span>
                        {game.minPlayers === game.maxPlayers
                          ? `${game.minPlayers} Players`
                          : `${game.minPlayers}-${game.maxPlayers} Players`}
                      </span>
                    </div>
                    {game.isAvailable ? (
                      <button
                        onClick={() => handleSelectGame(game.id)}
                        className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-white font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Create Room
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full px-4 py-2 bg-white/5 text-text-muted font-semibold rounded-lg cursor-not-allowed"
                      >
                        Coming Soon
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Public Rooms */}
          <section id="public-rooms-section">
            <div className="flex items-center gap-3 mb-6">
              <Users className="w-6 h-6 text-primary" />
              <h3 className="text-2xl font-display text-text-primary">
                Public Rooms ({publicRooms.length})
              </h3>
            </div>

            {publicRooms.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center">
                <p className="text-text-muted">
                  No public rooms available. Create one to get started!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {publicRooms.map((room) => (
                  <RoomListItem key={room.id} room={room} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Create Room Modal */}
      {showCreateModal != null && (
        <CreateRoomModal
          gameId={showCreateModal}
          onClose={() => setShowCreateModal(null)}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </div>
  );
}

// Room List Item Component
function RoomListItem({ room }: { room: Room }) {
  const navigate = useNavigate();
  const { username } = useUserStore();
  const { setCurrentRoom } = useRoomStore();
  const { show: showAlert, confirm: confirmAction } = useAlertStore();

  const handleJoin = () => {
    const socket = getSocket();
    if (!socket) return showAlert("Socket not connected", { type: "error" });
    socket.emit(
      "room:join",
      { roomId: room.id },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setCurrentRoom(response.room);
          navigate(`/room/${room.id}`);
        } else {
          showAlert(response.error || "Failed to join room", { type: "error" });
        }
      }
    );
  };

  const handleCloseRoom = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmAction("Are you sure you want to close this room?")))
      return;

    const socket = getSocket();
    socket.emit("room:leave", { roomId: room.id });
  };

  const host = room.players.find((p) => p.isHost);
  const hostName = host?.username || "Unknown";
  const isHost = host?.username === username;
  const game = getAllGames().find((g) => g.id === room.gameType);
  const GameIcon = game?.icon || Gamepad;

  return (
    <div className="glass-card rounded-xl p-4 hover:border-primary/30 transition-all duration-200 cursor-pointer group flex flex-col sm:flex-row items-start sm:items-center gap-4">
      {/* Icon */}
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
        <GameIcon className="w-6 h-6 text-primary" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-display text-lg text-text-primary truncate transition-colors">
            {room.name}
          </h4>
          {room.password && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 uppercase tracking-wider">
              Private
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
            <span className="capitalize truncate max-w-[100px]">
              {game?.name || room.gameType}
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="w-3.5 h-3.5 text-text-muted" />
            <span className="truncate max-w-[120px]">Host: {hostName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">•</span>
            <span>
              {room.players.length}/{room.maxPlayers}
            </span>
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
        {isHost && (
          <button
            onClick={handleCloseRoom}
            className="px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg border border-red-500/20 transition-all duration-200"
            title="Close Room"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={handleJoin}
          className="flex-1 sm:flex-initial px-6 py-2.5 bg-primary hover:bg-primary-light text-white font-semibold rounded-lg shadow-lg shadow-primary/30 transition-all duration-200"
        >
          Join
        </button>
      </div>
    </div>
  );
}

// Create Room Modal Component
function CreateRoomModal({
  onClose,
  gameId,
}: {
  onClose: () => void;
  gameId: string;
}) {
  const { username } = useUserStore();
  const [roomName, setRoomName] = useState("");
  const [gameType, setGameType] = useState(gameId);
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { setCurrentRoom } = useRoomStore();
  const { show: showAlert } = useAlertStore();

  const handleCreate = () => {
    const socket = getSocket();
    if (!socket) return showAlert("Socket not connected", { type: "error" });

    const allGames = getAllGames();
    const game = allGames.find((g) => g.id === gameType) || allGames[0];
    if (!game) return showAlert("Game not found", { type: "error" });

    console.log(game);

    socket.emit(
      "room:create",
      {
        name: roomName.trim() || username,
        gameType: game.id,
        isPublic,
        password: isPublic ? undefined : password,
        maxPlayers: game.maxPlayers,
      },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setCurrentRoom(response.room);
          navigate(`/room/${response.room.id}`);
        } else {
          showAlert(response.error || "Failed to create room", {
            type: "error",
          });
        }
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-background-secondary border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl mx-4">
        <h2 className="font-display text-2xl text-text-primary mb-6">
          Create Room
        </h2>

        <div className="space-y-4 mb-6">
          {/* Room Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Room Name
            </label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={"Enter room name (default: " + username + ")"}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Game Type */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Game Type
            </label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer"
            >
              {getAllGames().map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </div>

          {/* Public/Private */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 text-primary bg-white/5 border-white/10 rounded focus:ring-2 focus:ring-primary cursor-pointer"
              />
              <span className="text-sm text-text-secondary">Public Room</span>
            </label>
          </div>

          {/* Password (if private) */}
          {!isPublic && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-text-secondary rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg shadow-lg shadow-primary/30 transition-all cursor-pointer"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// Regenerate Identity Modal Component
