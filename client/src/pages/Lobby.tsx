import { useEffect, useMemo, useState, memo } from "react";
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
  MessageSquare,
  Github,
  RotateCcw,
  GamepadDirectional,
} from "lucide-react";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { useSocketStore } from "../stores/socketStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAlertStore } from "../stores/alertStore";
import useLanguage from "../stores/languageStore";
import { getSocket } from "../services/socket";
import { getAllGames } from "../games/registry";
import type { Room } from "../stores/roomStore";
import type { GameModule } from "../games/registry";
import { useGameFavorites } from "../hooks/useGameFavorites";
import GameCategoryFilter from "../components/GameCategoryFilter";
import RecentUpdates from "../components/RecentUpdates";
import { CATEGORY_CONFIG, type GameCategory } from "../constants";
import { useChatStore } from "../stores/chatStore";
import Portal from "../components/Portal";
import SearchInput from "../components/SearchInput";
import { useGamesFilter } from "../hooks/useGamesFilter";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";
import { getGame } from "../games/registry";

export default function Lobby() {
  const { ti } = useLanguage();
  const { username } = useUserStore();
  const { isConnected } = useSocketStore();
  const { publicRooms, setPublicRooms } = useRoomStore();
  const { setGlobalChatOpen, onlineCount } = useChatStore();
  const { favorites, toggleFavorite, favoritesCount } = useGameFavorites();
  const { recentGameIds } = useRecentlyPlayed();

  const [showCreateModal, setShowCreateModal] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const { setShowSettingsModal } = useSettingsStore();
  const [selectedCategory, setSelectedCategory] = useState<
    GameCategory | "favorites" | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");

  const gamesToShow = useGamesFilter(searchQuery, selectedCategory);

  useEffect(() => {
    const socket = getSocket();

    // Request public rooms list
    socket.emit("room:list", (rooms: Room[]) => {
      setPublicRooms(rooms);
    });

    // Listen for room list updates
    socket.on("room:list:update", (rooms: Room[]) => {
      setPublicRooms(rooms);
    });

    return () => {
      socket.off("room:list:update");
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
    setSelectedCategory(category);
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
      <main className="pt-32 px-2 md:px-4 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
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
                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-display rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex items-center gap-2 glass-blur"
              >
                <LogIn className="w-5 h-5" />
                {ti({ en: "Join Room", vi: "Vào Phòng" })}
              </button>

              {/* <button
                onClick={() => {
                  const roomDiv = document.getElementById(
                    "public-rooms-section",
                  );
                  if (roomDiv) {
                    roomDiv.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-display rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex items-center gap-2 glass-blur"
              >
                <Users className="w-5 h-5" />
                {ti({ en: "Public Rooms", vi: "Phòng Công Khai" })} (
                {publicRooms.length})
              </button> */}

              {/* Github button */}
              <button
                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-display rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex items-center gap-2 glass-blur"
                onClick={() =>
                  window.open(
                    "https://github.com/hoangtran0410/gamehub24",
                    "_blank",
                  )
                }
              >
                <Github className="w-5 h-5" />
                {ti({ en: "GitHub", vi: "GitHub" })}
              </button>
            </div>

            {/* Online Users Count */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {onlineCount}{" "}
                {ti({
                  en: onlineCount !== 1 ? "players online" : "player online",
                  vi: "người chơi online",
                })}
              </div>

              {/* Chat Toggle Button (Desktop Only) */}
              <button
                onClick={() => setGlobalChatOpen(true)}
                className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-full text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors cursor-pointer"
              >
                {/* <div className="w-2 h-2 rounded-full bg-blue-500" /> */}
                <MessageSquare className="w-5 h-5 text-primary" />
                {ti({ en: "Open Chat", vi: "Mở Chat" })}
              </button>
            </div>

            {/* Updates Section */}
            <RecentUpdates onOpenGame={setShowCreateModal} />
          </div>

          {/* Public Rooms */}
          <section id="public-rooms-section" className="mb-16">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-primary" />
                <h3 className="text-xl md:text-2xl font-display text-text-primary">
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
              <div className="glass-card rounded-2xl p-8 md:p-12 text-center">
                <p className="text-text-muted">
                  {ti({
                    en: "No public rooms available. Create one to get started!",
                    vi: "Chưa có phòng công khai. Tạo một phòng để bắt đầu!",
                  })}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                {publicRooms.map((room) => (
                  <RoomListItem key={room.id} room={room} />
                ))}
              </div>
            )}
          </section>

          {/* Games Gallery */}
          <section>
            {recentGameIds.length > 0 && (
              <div className="animate-fadeIn mb-16">
                <div className="flex items-center gap-2 mb-4">
                  <RotateCcw className="w-5 h-5 text-primary" />
                  <h3 className="text-2xl font-display text-text-primary">
                    {ti({ en: "Recently Played", vi: "Chơi gần đây" })}
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 md:gap-4 gap-2">
                  {recentGameIds
                    .map((id) => getGame(id))
                    .filter((game): game is GameModule => !!game)
                    .map((game) => (
                      <GameCard
                        key={`recent-${game.id}`}
                        game={game}
                        isFavorite={favorites.includes(game.id)}
                        onToggleFavorite={toggleFavorite}
                        onSelect={handleSelectGame}
                      />
                    ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-6 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <GamepadDirectional className="w-6 h-6 text-primary" />
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
            </div>

            <div className="flex justify-center mb-4">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                className="w-full max-w-md"
              />
            </div>

            <div
              className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 md:gap-4 gap-2 transition-opacity duration-150`}
            >
              {gamesToShow.length <= 0 && (
                <p className="text-text-muted text-center col-span-full">
                  {ti({ en: "No games available", vi: "Không có trò chơi" })}
                </p>
              )}
              {gamesToShow.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isFavorite={favorites.includes(game.id)}
                  onToggleFavorite={toggleFavorite}
                  onSelect={handleSelectGame}
                />
              ))}
            </div>
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

      {/* Join Room Modal */}
      {showJoinModal && (
        <JoinRoomModal onClose={() => setShowJoinModal(false)} />
      )}

      <footer className="p-4 pt-16">
        <p className="text-text-muted text-xs text-center">
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

// Game Card Component
const GameCard = memo(
  ({
    game,
    isFavorite,
    onToggleFavorite,
    onSelect,
  }: {
    game: GameModule;
    isFavorite: boolean;
    onToggleFavorite: (gameId: string, e: React.MouseEvent) => void;
    onSelect: (gameId: string) => void;
  }) => {
    const { ti } = useLanguage();
    const Icon = game.icon;

    return (
      <div
        className={`glass-card rounded-2xl py-4 px-2 transition-all duration-200 ${
          !game.isAvailable ? "opacity-50" : ""
        } relative group flex flex-col will-change-transform cursor-pointer hover:scale-[1.02]`}
        onClick={() => game.isAvailable && onSelect(game.id)}
      >
        <button
          onClick={(e) => onToggleFavorite(game.id, e)}
          className={`absolute top-2 right-2 md:top-4 md:right-4 p-2 rounded-full transition-all duration-200 z-10 cursor-pointer ${
            isFavorite
              ? "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
              : "text-text-muted hover:text-yellow-500 hover:bg-white/5 opacity-50 md:opacity-0 group-hover:opacity-100"
          }`}
        >
          <Star className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`} />
        </button>

        <div className="mb-3 md:mb-4 flex items-center justify-center">
          <Icon className="w-12 h-12 md:w-14 md:h-14 text-primary" />
        </div>
        <h4 className="font-display text-lg md:text-xl text-text-primary mb-2 text-center leading-tight">
          {ti(game.name)}
        </h4>
        <p className="text-sm text-slate-400/60 mb-3 hidden md:block text-center flex-1">
          {ti(game.description)}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
          {game.categories.map((cat: string) => (
            <span
              key={cat}
              className={`px-2 py-0.5 text-[11px] md:text-[10px] font-medium rounded-full border opacity-70 group-hover:opacity-100 ${CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG].color}`}
            >
              {ti(CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG].label)}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 text-xs text-text-muted mb-4 justify-center">
          <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
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
        <div className="mt-auto">
          {game.isAvailable ? null : (
            // <button
            //   onClick={() => onSelect(game.id)}
            //   className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm md:text-base font-semibold rounded-lg transition-colors cursor-pointer"
            // >
            //   {ti({ en: "Play", vi: "Chơi" })}
            // </button>
            <button
              disabled
              className="w-full px-4 py-2 bg-white/5 text-text-muted text-sm md:text-base font-semibold rounded-lg cursor-not-allowed"
            >
              {ti({ en: "Coming Soon", vi: "Sắp ra mắt" })}
            </button>
          )}
        </div>
      </div>
    );
  },
);

// Room List Item Component
const RoomListItem = memo(({ room }: { room: Room }) => {
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

  const game = useMemo(
    () => getAllGames().find((g) => g.id === room.gameType),
    [room.gameType],
  );
  const host = room.players.find((p) => p.isHost);
  const hostName = host?.username || "Unknown";
  const isHost = host?.username === username;
  const GameIcon = game?.icon || Gamepad;

  return (
    <div className="glass-card rounded-xl p-4 hover:border-primary/30 transition-all duration-200 cursor-pointer group flex flex-col gap-3 md:gap-4">
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
});

// Create Room Modal Component
const CreateRoomModal = memo(
  ({ onClose, gameId }: { onClose: () => void; gameId: string }) => {
    const { username, userId } = useUserStore();
    const [roomName, setRoomName] = useState(username);
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
    const { addRecentGame } = useRecentlyPlayed();

    useEffect(() => {
      if (gameType) localStorage.setItem("gamehub24_lastGameId", gameType);
    }, [gameType]);

    const allGames = useMemo(() => getAllGames(), []);

    const selectedGame = useMemo(() => {
      return allGames.find((g) => g.id === gameType) || allGames[0];
    }, [gameType, allGames]);

    const handleCreate = () => {
      const socket = getSocket();
      if (!socket || !isConnected)
        return showAlert("Socket not connected", { type: "error" });

      if (!selectedGame) return showAlert("Game not found", { type: "error" });

      console.log(selectedGame);

      socket.emit(
        "room:create",
        {
          name: roomName.trim() || username,
          gameType: selectedGame.id,
          isPublic,
          password:
            requirePassword && password?.trim?.()?.length > 0
              ? password.trim()
              : undefined,
          maxPlayers: selectedGame.maxPlayers,
        },
        (response: { success: boolean; room?: Room; error?: string }) => {
          if (response.success && response.room) {
            setCurrentRoom(response.room);
            addRecentGame(selectedGame.id);
            navigate(`/room/${response.room.id}`, { replace: true });
          } else {
            showAlert(response.error || "Failed to create room", {
              type: "error",
            });
          }
        },
      );
    };

    const handleCreateOffline = () => {
      const game = allGames.find((g) => g.id === gameType) || allGames[0];
      if (!game) return showAlert("Game not found", { type: "error" });

      const localRoomId = `local_${Date.now()}`;
      const localRoom: Room = {
        id: localRoomId,
        name: roomName.trim() || username,
        ownerId: userId, // Using username as ID for local to match checks if mostly based on ID equality
        gameType: game.id,
        isPublic: false,
        players: [
          {
            id: userId, // ownerId matches this
            username: username,
            isHost: true,
            isBot: false,
          },
        ],
        spectators: [],
        maxPlayers: game.maxPlayers,
        createdAt: new Date(),

        isOffline: true,
      };

      setCurrentRoom(localRoom);
      addRecentGame(selectedGame.id);
      navigate(`/room/${localRoomId}`, { replace: true });
    };

    return (
      <Portal>
        <div className="fixed inset-0 bg-black/80 glass-blur flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-background-secondary border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl mx-4 text-center">
            <h2 className="font-display text-2xl text-text-primary mb-6">
              {ti({ en: "Create Room", vi: "Tạo Phòng" })}
            </h2>

            <div className="space-y-4 mb-6">
              {/* Room Name */}
              <div>
                <label className="block text-sm text-text-secondary mb-2 text-left">
                  {ti({ en: "Room Name", vi: "Tên Phòng" })}
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={ts({
                    en: `Name your room (default: ${username})`,
                    vi: `Đặt tên phòng (mặc định: ${username})`,
                  })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              {/* Game Type */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2 text-left">
                  {ti({ en: "Game", vi: "Trò chơi" })}
                </label>
                <select
                  value={gameType}
                  onChange={(e) => setGameType(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer"
                >
                  {allGames.map((game) => (
                    <option
                      key={game.id}
                      value={game.id}
                      disabled={!game.isAvailable}
                    >
                      {ts(game.name)}
                      {!game.isAvailable &&
                        ` (${ts({ en: "Coming Soon", vi: "Sắp ra mắt" })})`}
                    </option>
                  ))}{" "}
                </select>

                {selectedGame && (
                  <div className="mt-2 text-center">
                    <p className="text-sm text-text-muted">
                      {ts(selectedGame.description)}
                    </p>
                  </div>
                )}
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
                {isPublic && (
                  <label className="text-xs text-text-muted">
                    {ti({
                      en: "Everyone can see your public room",
                      vi: "Ai cũng có thể thấy phòng công khai của bạn",
                    })}
                  </label>
                )}
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
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={ts({
                      en: "Enter password",
                      vi: "Nhập mật khẩu",
                    })}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-col md:flex-row justify-center items-center">
              <div className="flex gap-2">
                <button
                  onClick={handleCreateOffline}
                  className="px-4 py-2 md:py-2.5 bg-slate-700 hover:bg-slate-500 text-white rounded-lg cursor-pointer"
                >
                  {ti({ en: "Play Offline", vi: "Chơi Offline" })}
                </button>

                <button
                  onClick={handleCreate}
                  className="px-4 py-2 md:py-2.5 bg-primary hover:bg-primary-light text-white rounded-lg shadow-lg shadow-primary/30 transition-all cursor-pointer"
                >
                  {ti({ en: "Create Online", vi: "Tạo Online" })}
                </button>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 text-text-secondary rounded-lg transition-colors cursor-pointer"
              >
                {ti({ en: "Cancel", vi: "Hủy" })}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    );
  },
);

const JoinRoomModal = memo(({ onClose }: { onClose: () => void }) => {
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
    <Portal>
      <div className="fixed inset-0 bg-black/80 glass-blur flex items-center justify-center z-50 animate-fadeIn">
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
    </Portal>
  );
});
