import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gamepad,
  Users,
  Plus,
  Trash2,
  Settings,
  Gamepad2,
  LogIn,
  Star,
} from "lucide-react";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { useSocketStore } from "../stores/socketStore";
import { useAlertStore } from "../stores/alertStore";
import useLanguage from "../stores/languageStore";
import { getSocket } from "../services/socket";
import {
  getAllGames,
  type GameCategory,
  CATEGORY_CONFIG,
} from "../games/registry";
import type { Room } from "../stores/roomStore";
import SettingsModal from "../components/SettingsModal";
import { useGameFavorites } from "../hooks/useGameFavorites";
import GameCategoryFilter from "../components/GameCategoryFilter";

export default function Lobby() {
  const { username } = useUserStore();
  const { isConnected } = useSocketStore();
  const { publicRooms, setPublicRooms } = useRoomStore();
  const { ti, ts } = useLanguage();
  const [showCreateModal, setShowCreateModal] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<
    GameCategory | "favorites" | null
  >(null);
  const { favorites, toggleFavorite, favoritesCount } = useGameFavorites();
  const [isAnimating, setIsAnimating] = useState(false);

  const gamesToShow = useMemo(
    () =>
      getAllGames().filter((game) =>
        selectedCategory === "favorites"
          ? favorites.includes(game.id)
          : selectedCategory
            ? game.categories.includes(selectedCategory)
            : true,
      ),
    [selectedCategory, favorites],
  );

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

  const handleCategoryChange = (
    category: GameCategory | "favorites" | null,
  ) => {
    if (selectedCategory === category) return;
    setIsAnimating(true);
    setTimeout(() => {
      setSelectedCategory(category);
      setIsAnimating(false);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Navbar */}
      <nav className="fixed top-4 left-4 right-4 z-50">
        <div className="max-w-7xl mx-auto glass-card rounded-2xl px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 md:gap-3">
              <Gamepad2 className="md:w-8 md:h-8 w-6 h-6 text-primary" />
              <span className="md:text-xl text-lg font-display text-text-primary">
                GameHub24
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
              <span className="md:text-sm text-xs font-medium text-text-primary">
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
            <h2 className="text-5xl font-display text-text-primary mb-4">
              {ti({
                en: "Play Together, Anywhere",
                vi: "Chơi Cùng Nhau, Mọi Nơi",
              })}
            </h2>
            <p className="text-xl text-text-secondary mb-8">
              {ti({
                en: "Join multiplayer games with friends in real-time",
                vi: "Tham gia các trò chơi nhiều người với bạn bè trong thời gian thực",
              })}
            </p>
            <div className="flex items-center justify-center gap-2 md:gap-4 flex-col md:flex-row">
              <button
                onClick={() => setShowCreateModal("")}
                className="px-8 py-3 bg-primary hover:bg-primary-light text-white font-display rounded-xl shadow-lg shadow-primary/50 hover:shadow-xl hover:shadow-primary/70 transition-all duration-200 cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                {ti({ en: "Create Room", vi: "Tạo Phòng" })}
              </button>

              <button
                onClick={() => setShowJoinModal(true)}
                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-display rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex items-center gap-2 backdrop-blur-sm"
              >
                <LogIn className="w-5 h-5" />
                {ti({ en: "Join Room", vi: "Vào Phòng" })}
              </button>

              <button
                onClick={() => {
                  const roomDiv = document.getElementById(
                    "public-rooms-section",
                  );
                  if (roomDiv) {
                    roomDiv.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-display rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex items-center gap-2 backdrop-blur-sm"
              >
                <Users className="w-5 h-5" />
                {ti({ en: "Public Rooms", vi: "Phòng Công Khai" })} (
                {publicRooms.length})
              </button>
            </div>

            {/* Online Users Count */}
            <div className="mt-6 flex items-center justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {onlineCount}{" "}
                {ti({
                  en: onlineCount !== 1 ? "players online" : "player online",
                  vi: "người chơi online",
                })}
              </div>
            </div>
          </div>

          {/* Games Gallery */}
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Gamepad className="w-6 h-6 text-primary" />
                <h3 className="text-2xl font-display text-text-primary">
                  {ti({ en: "Available Games", vi: "Trò Chơi" })}
                </h3>
              </div>

              {/* Category Filter */}
              <GameCategoryFilter
                selectedCategory={selectedCategory}
                onSelectCategory={handleCategoryChange}
                favoritesCount={favoritesCount}
              />
            </div>

            <div
              className={`grid grid-cols-1 md:grid-cols-3 md:gap-6 gap-3 transition-opacity duration-300 ${
                isAnimating ? "opacity-0" : "opacity-100"
              }`}
            >
              {gamesToShow.length <= 0 && (
                <p className="text-text-muted text-center">
                  {ti({ en: "No games available", vi: "Không có trò chơi" })}
                </p>
              )}
              {gamesToShow.map((game) => {
                const Icon = game.icon;
                return (
                  <div
                    key={game.id}
                    className={`glass-card rounded-2xl p-6 hover:border-primary/30 transition-all duration-200 ${
                      !game.isAvailable ? "opacity-50" : ""
                    } relative group`}
                  >
                    {/* Favorite Button */}
                    <button
                      onClick={(e) => toggleFavorite(game.id, e)}
                      className={`absolute top-4 right-4 p-2 rounded-full transition-all duration-200 z-10 ${
                        favorites.includes(game.id)
                          ? "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
                          : "text-text-muted hover:text-yellow-500 hover:bg-white/5 md:opacity-0 group-hover:opacity-100"
                      }`}
                      title={ts({
                        en: "Toggle Favorite",
                        vi: "Đánh dấu yêu thích",
                      })}
                    >
                      <Star
                        className={`w-5 h-5 ${favorites.includes(game.id) ? "fill-current" : ""}`}
                      />
                    </button>

                    {/* align center */}
                    <div className="mb-4 flex items-center justify-center">
                      <Icon className="w-12 h-12 text-primary" />
                    </div>
                    <h4 className="font-display text-xl text-text-primary mb-2">
                      {ti(game.name)}
                    </h4>
                    <p className="text-sm text-text-secondary mb-3">
                      {ti(game.description)}
                    </p>
                    {/* Category badges */}
                    <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
                      {game.categories.map((cat) => (
                        <span
                          key={cat}
                          className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${CATEGORY_CONFIG[cat].color}`}
                        >
                          {ti(CATEGORY_CONFIG[cat].label)}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted mb-4 justify-center">
                      <Users className="w-4 h-4" />
                      <span>
                        {game.minPlayers === game.maxPlayers
                          ? `${game.minPlayers} ${ti({
                              en: "Players",
                              vi: "Người chơi",
                            })}`
                          : `${game.minPlayers}-${game.maxPlayers} ${ti({
                              en: "Players",
                              vi: "Người chơi",
                            })}`}
                      </span>
                    </div>
                    {game.isAvailable ? (
                      <button
                        onClick={() => handleSelectGame(game.id)}
                        className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {ti({ en: "Create Room", vi: "Tạo Phòng" })}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full px-4 py-2 bg-white/5 text-text-muted font-semibold rounded-lg cursor-not-allowed"
                      >
                        {ti({ en: "Coming Soon", vi: "Sắp Ra Mắt" })}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Public Rooms */}
          <section id="public-rooms-section">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-primary" />
                <h3 className="text-2xl font-display text-text-primary">
                  {ti({ en: "Public Rooms", vi: "Phòng Công Khai" })} (
                  {publicRooms.length})
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal("")}
                className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary font-medium rounded-lg border border-primary/20 hover:border-primary/40 transition-colors cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {ti({ en: "Create", vi: "Tạo" })}
              </button>
            </div>

            {publicRooms.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center">
                <p className="text-text-muted">
                  {ti({
                    en: "No public rooms available. Create one to get started!",
                    vi: "Chưa có phòng công khai. Tạo một phòng để bắt đầu!",
                  })}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {/* Join Room Modal */}
      {showJoinModal && (
        <JoinRoomModal onClose={() => setShowJoinModal(false)} />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      <footer className="p-4">
        <p className="text-text-muted text-xs">
          &copy; {new Date().getFullYear()} GameHub24. Made with ❤️ by{" "}
          <span className="text-primary">
            <a
              href="https://github.com/HoangTran0410/gamehub24"
              target="_blank"
            >
              HoangTran
            </a>
          </span>
          .
        </p>
      </footer>
    </div>
  );
}

// Room List Item Component
function RoomListItem({ room }: { room: Room }) {
  const navigate = useNavigate();
  const { username } = useUserStore();
  const { setCurrentRoom } = useRoomStore();
  const { show: showAlert, confirm: confirmAction } = useAlertStore();
  const { ti, ts } = useLanguage();

  const handleJoin = () => {
    const socket = getSocket();
    if (!socket) return showAlert("Socket not connected", { type: "error" });
    socket.emit(
      "room:join",
      { roomId: room.id },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setCurrentRoom(response.room);
          navigate(`/room/${room.id}`, { replace: true });
        } else {
          showAlert(response.error || "Failed to join room", { type: "error" });
        }
      },
    );
  };

  const handleCloseRoom = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !(await confirmAction(
        ts({
          en: "Are you sure you want to close this room?",
          vi: "Bạn có chắc muốn đóng phòng này không?",
        }),
      ))
    )
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
    <div className="glass-card rounded-xl p-4 hover:border-primary/30 transition-all duration-200 cursor-pointer group flex flex-col gap-4">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0 mt-1">
          <GameIcon className="w-6 h-6 text-primary" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h4 className="font-display text-lg text-text-primary leading-tight wrap-break-word">
              {room.name}
            </h4>
            {room.password && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 uppercase tracking-wider shrink-0">
                {ti({ en: "Private", vi: "Riêng tư" })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
              <span className="capitalize">
                {ti(game?.name) || room.gameType}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <span>
                {ti({ en: "Host", vi: "Chủ" })}:{" "}
                <span className="text-text-primary">{hostName}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              <span>
                {room.players.length}/{room.maxPlayers}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons - Full width on bottom */}
      <div className="flex items-center gap-2 w-full pt-2 border-t border-white/5">
        {isHost && (
          <button
            onClick={handleCloseRoom}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg border border-red-500/20 transition-all duration-200"
            title="Close Room"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={handleJoin}
          className="flex-1 px-6 py-2 bg-primary hover:bg-primary-light text-white font-semibold rounded-lg shadow-lg shadow-primary/30 transition-all duration-200"
        >
          {ti({ en: "Join Room", vi: "Vào Phòng" })}
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
  const [gameType, setGameType] = useState(
    gameId || localStorage.getItem("gamehub24_lastGameId") || "",
  );
  const [isPublic, setIsPublic] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { setCurrentRoom } = useRoomStore();
  const { show: showAlert } = useAlertStore();
  const { isConnected } = useSocketStore();
  const { ti, ts } = useLanguage();

  useEffect(() => {
    if (gameType) localStorage.setItem("gamehub24_lastGameId", gameType);
  }, [gameType]);

  const handleCreate = () => {
    const socket = getSocket();
    if (!socket || !isConnected)
      return showAlert("Socket not connected", { type: "error" });

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
        password: requirePassword ? password : undefined,
        maxPlayers: game.maxPlayers,
      },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setCurrentRoom(response.room);
          navigate(`/room/${response.room.id}`, { replace: true });
        } else {
          showAlert(response.error || "Failed to create room", {
            type: "error",
          });
        }
      },
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-background-secondary border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl mx-4">
        <h2 className="font-display text-2xl text-text-primary mb-6">
          {ti({ en: "Create Room", vi: "Tạo Phòng" })}
        </h2>

        <div className="space-y-4 mb-6">
          {/* Room Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {ti({ en: "Room Name", vi: "Tên Phòng" })}
            </label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={ts({
                en: `Enter room name (default: ${username})`,
                vi: `Nhập tên phòng (mặc định: ${username})`,
              })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Game Type */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {ti({ en: "Game", vi: "Trò chơi" })}
            </label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer"
            >
              {getAllGames().map((game) => (
                <option key={game.id} value={game.id}>
                  {ts(game.name)}
                </option>
              ))}{" "}
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
              <span className="text-sm text-text-secondary">
                {ti({ en: "Public Room", vi: "Phòng công khai" })}
              </span>
            </label>
          </div>

          {/* Require Password */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requirePassword}
                onChange={(e) => setRequirePassword(e.target.checked)}
                className="w-4 h-4 text-primary bg-white/5 border-white/10 rounded focus:ring-2 focus:ring-primary cursor-pointer"
              />
              <span className="text-sm text-text-secondary">
                {ti({ en: "Require Password", vi: "Yêu cầu mật khẩu" })}
              </span>
            </label>
          </div>

          {/* Password (if private) */}
          {requirePassword && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {ti({ en: "Password", vi: "Mật khẩu" })}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={ts({ en: "Enter password", vi: "Nhập mật khẩu" })}
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
            {ti({ en: "Cancel", vi: "Hủy" })}
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg shadow-lg shadow-primary/30 transition-all cursor-pointer"
          >
            {ti({ en: "Create", vi: "Tạo" })}
          </button>
        </div>
      </div>
    </div>
  );
}

function JoinRoomModal({ onClose }: { onClose: () => void }) {
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { setCurrentRoom } = useRoomStore();
  const { show: showAlert } = useAlertStore();
  const { isConnected } = useSocketStore();
  const { ti, ts } = useLanguage();

  const handleJoin = () => {
    const socket = getSocket();
    if (!socket || !isConnected)
      return showAlert("Socket not connected", { type: "error" });

    if (!roomId.trim())
      return showAlert("Please enter a room ID", { type: "error" });

    socket.emit(
      "room:join",
      { roomId: roomId.trim(), password: password || undefined },
      (response: { success: boolean; room?: Room; error?: string }) => {
        if (response.success && response.room) {
          setCurrentRoom(response.room);
          navigate(`/room/${response.room.id}`, { replace: true });
        } else {
          showAlert(response.error || "Failed to join room", {
            type: "error",
          });
        }
      },
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-background-secondary border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl mx-4">
        <h2 className="font-display text-2xl text-text-primary mb-6">
          {ti({ en: "Join Room", vi: "Vào Phòng" })}
        </h2>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {ti({ en: "Room ID", vi: "ID Phòng" })}
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder={ts({ en: "Enter room ID", vi: "Nhập ID phòng" })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {ti({ en: "Password (Optional)", vi: "Mật khẩu (Tùy chọn)" })}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={ts({
                en: "Enter password if required",
                vi: "Nhập mật khẩu nếu cần",
              })}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-text-secondary rounded-lg transition-colors cursor-pointer"
          >
            {ti({ en: "Cancel", vi: "Hủy" })}
          </button>
          <button
            onClick={handleJoin}
            disabled={!roomId.trim()}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-lg shadow-primary/30 transition-all cursor-pointer"
          >
            {ti({ en: "Join", vi: "Vào" })}
          </button>
        </div>
      </div>
    </div>
  );
}
