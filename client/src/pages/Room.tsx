import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Crown,
  ArrowLeft,
  Gamepad,
  User,
  Share2,
  X,
  Lock,
  Languages,
  Star,
} from "lucide-react";
import { useRoomStore } from "../stores/roomStore";
import { useChatStore } from "../stores/chatStore";
import { useUserStore } from "../stores/userStore";
import { useAlertStore } from "../stores/alertStore";
import useLanguage from "../stores/languageStore";
import { getSocket } from "../services/socket";
import { getAllGames, type GameCategory } from "../games/registry";
import { useGameFavorites } from "../hooks/useGameFavorites";
import GameCategoryFilter from "../components/GameCategoryFilter";
import { type Room } from "../stores/roomStore";
import SidePanel from "../components/SidePanel";
import GameContainer from "../games/GameContainer";
import ShareModal from "../components/ShareModal";

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { currentRoom, setCurrentRoom, updatePlayers, updateSpectators } =
    useRoomStore();
  const { clearMessages } = useChatStore();
  const { userId, username } = useUserStore();

  const { show: showAlert, confirm: showConfirm } = useAlertStore();
  const { ti, ts, language, setLanguage } = useLanguage();
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
            if (response.error === "Incorrect password") {
              setShowPasswordPrompt(true);
            } else {
              showAlert(response.error || "Failed to join room", {
                type: "error",
              });
              navigate("/");
            }
          }
        },
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

    socket.on("room:spectators", (spectators) => {
      updateSpectators(spectators);
    });

    socket.on("room:update", (room) => {
      setCurrentRoom(room);
    });

    socket.on("room:deleted", (data) => {
      showAlert(
        data.reason ||
          ts({ en: "Room deleted by host", vi: "Phòng đã bị chủ xóa" }),
        {
          type: "info",
          title: ts({ en: "Room Closed", vi: "Phòng đã đóng" }),
        },
      );
      setCurrentRoom(null);
      clearMessages();
      navigate("/");
    });

    socket.on("room:kicked", (data) => {
      showAlert(
        data.reason ||
          ts({
            en: "You have been kicked from the room",
            vi: "Bạn đã bị đuổi khỏi phòng",
          }),
        {
          type: "error",
          title: ts({ en: "Kicked", vi: "Bị đuổi" }),
        },
      );
      setCurrentRoom(null);
      clearMessages();
      navigate("/");
    });

    return () => {
      socket.off("room:players");
      socket.off("room:spectators");
      socket.off("room:update");
      socket.off("room:deleted");
      socket.off("room:kicked");
    };
  }, [roomId, socket, updatePlayers, setCurrentRoom, navigate, clearMessages]);

  const isHost = currentRoom?.ownerId === userId;

  const hostUser = currentRoom?.players.find(
    (p) => p.id === currentRoom.ownerId,
  );

  const isSpectator = currentRoom?.spectators?.some((p) => p.id === userId);

  // Warning before unload (browser back/refresh/close) for host
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isHost) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    if (isHost) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isHost]);

  const handleLeaveRoom = async () => {
    const confirmed = await showConfirm(
      isHost
        ? ts({
            en: "Room will be deleted if you (host) leave",
            vi: "Phòng sẽ bị xóa nếu bạn (chủ) rời đi",
          })
        : ts({
            en: "Are you sure want to leave this room",
            vi: "Bạn có chắc muốn rời phòng này",
          }),
      isHost
        ? ts({ en: "Close room?", vi: "Đóng phòng?" })
        : ts({ en: "Leave room?", vi: "Rời phòng?" }),
    );
    if (confirmed) {
      socket.emit("room:leave", { roomId });
      setCurrentRoom(null);
      clearMessages();
      navigate("/");
    }
  };

  // Resize state
  const [chatPanelWidth, setChatPanelWidth] = useState(() => {
    const storedWidth = localStorage.getItem("chatPanelWidth");
    return storedWidth ? parseInt(storedWidth) : 400;
  });
  const [isResizing, setIsResizing] = useState(false);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to check for desktop view
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startResizing = useCallback(() => {
    setIsResizing(true);
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isDragging.current && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      // Calculate difference from the right edge of the container
      const newWidth = containerRect.right - e.clientX;

      if (newWidth >= 200 && newWidth <= 800) {
        setChatPanelWidth(newWidth);
        localStorage.setItem("chatPanelWidth", newWidth.toString());
      }
    }
  }, []);

  useEffect(() => {
    // Only add listeners if we're resizing to avoid overhead
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showChangeGameModal, setShowChangeGameModal] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [showUserTooltip, setShowUserTooltip] = useState(false);

  const handleChangeGame = (gameId: string) => {
    socket.emit("room:update", { roomId, gameType: gameId });
    setShowChangeGameModal(false);
  };

  useEffect(() => {
    if (showUserTooltip) {
      const timeout = setTimeout(() => setShowUserTooltip(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [showUserTooltip]);

  const handleUserTouch = () => {
    setShowUserTooltip(true);
  };

  if (!currentRoom) {
    if (showPasswordPrompt) {
      return (
        <div className="min-h-screen bg-background-primary flex items-center justify-center">
          <PasswordPromptModal
            roomId={roomId || ""}
            onSuccess={(room) => setCurrentRoom(room)}
            onCancel={() => navigate("/")}
            onError={(msg) => showAlert(msg, { type: "error" })}
          />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary">
            {ti({ en: "Loading room...", vi: "Đang tải phòng..." })}
          </p>
        </div>
      </div>
    );
  }

  const game = getAllGames().find((g) => g.id === currentRoom.gameType);

  return (
    <>
      {showShareModal && (
        <ShareModal
          roomId={roomId || ""}
          onClose={() => setShowShareModal(false)}
        />
      )}
      {showChangeGameModal && (
        <ChangeGameModal
          currentRoom={currentRoom}
          onClose={() => setShowChangeGameModal(false)}
          onChangeGame={handleChangeGame}
        />
      )}

      <div className="min-h-screen bg-background-primary flex flex-col">
        {/* Room Header */}
        <header className="z-40 glass-card border-b border-white/10 flex-shrink-0">
          <div className="w-full px-3 md:px-4 py-3 md:py-4">
            <div className="flex items-center justify-between gap-2">
              {/* Left side: Back button + Room info */}
              <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
                <button
                  onClick={handleLeaveRoom}
                  className="p-1.5 md:p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                  aria-label="Leave room"
                >
                  <ArrowLeft className="w-5 h-5 text-text-secondary" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <h1 className="text-base md:text-xl font-display text-text-primary truncate">
                      {currentRoom.name}
                    </h1>
                    <button
                      onClick={() => setShowShareModal(true)}
                      className="p-1 md:p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                      aria-label="Share room"
                      title="Share room link"
                    >
                      <Share2 className="w-4 h-4 text-text-secondary hover:text-primary" />
                    </button>
                  </div>
                  {/* Host info - hidden on mobile */}
                  {hostUser?.username != currentRoom.name && (
                    <div className="hidden md:flex items-center gap-2 text-sm">
                      <Crown className="w-4 h-4 text-text-muted" />
                      <span className="text-text-muted">
                        {hostUser?.username}{" "}
                        {isHost ? ti({ en: "(You)", vi: "(Bạn)" }) : ""}
                      </span>
                    </div>
                  )}
                  {/* Game type - visible on all screens */}
                  <div className="flex items-center gap-1.5 text-xs md:text-sm">
                    <button
                      onClick={
                        isHost ? () => setShowChangeGameModal(true) : undefined
                      }
                      className={`flex items-center gap-1.5 ${
                        isHost
                          ? "bg-white/5 hover:bg-white/10 cursor-pointer px-2 py-0.5 rounded transition-colors text-primary"
                          : "text-text-muted cursor-default"
                      }`}
                      title={
                        isHost ? ts({ en: "Change game", vi: "Đổi game" }) : ""
                      }
                    >
                      {game?.icon ? (
                        <game.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      ) : (
                        <Gamepad className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      )}
                      <p className="capitalize font-medium">
                        {ti(
                          getAllGames().find(
                            (g) => g.id === currentRoom.gameType,
                          )?.name || "",
                        )}
                      </p>
                      {isHost && (
                        <span className="text-[10px] opacity-70">▼</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right side: User info */}
              <div className="flex items-center gap-2 md:gap-3">
                <div className="relative">
                  <button
                    onClick={handleUserTouch}
                    onMouseEnter={handleUserTouch}
                    className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm flex-shrink-0 cursor-pointer hover:bg-white/10 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
                  >
                    <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-text-muted" />
                    <span className="max-w-[80px] md:max-w-none truncate">
                      {username}
                    </span>
                  </button>
                  {/* Tooltip */}
                  {showUserTooltip && (
                    <div className="absolute right-0 top-full mt-1 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 animate-fadeIn">
                      {ti({ en: "Your ID:", vi: "ID của bạn:" })}{" "}
                      <span className="font-semibold">{username}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                  className="p-1.5 md:p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-text-secondary hover:text-primary"
                  // title={ti({ en: "Change Language", vi: "Đổi ngôn ngữ" })}
                >
                  <Languages className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                {/* Language Dropdown */}
                {showLanguageDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowLanguageDropdown(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-40 bg-slate-800 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 animate-fadeIn">
                      <button
                        onClick={() => {
                          setLanguage("en");
                          setShowLanguageDropdown(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors flex items-center gap-2 ${
                          language === "en"
                            ? "text-primary font-medium"
                            : "text-text-secondary"
                        }`}
                      >
                        <span className="text-lg">🇺🇸</span>
                        English
                      </button>
                      <button
                        onClick={() => {
                          setLanguage("vi");
                          setShowLanguageDropdown(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors flex items-center gap-2 ${
                          language === "vi"
                            ? "text-primary font-medium"
                            : "text-text-secondary"
                        }`}
                      >
                        <span className="text-lg">🇻🇳</span>
                        Tiếng Việt
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 w-full px-2 py-6 overflow-hidden">
          <div
            className="flex flex-col lg:flex-row md:gap-1 gap-4 h-full"
            ref={containerRef}
          >
            {/* Game Container */}
            <div className="flex-1 min-w-0 glass-card rounded-2xl p-2 md:p-4 overflow-hidden flex flex-col relative">
              {isSpectator && (
                <div className="absolute top-0 left-0 right-0 bg-blue-500/80 text-white text-xs py-1 px-4 text-center z-50 backdrop-blur-sm">
                  {ti({
                    en: "You are spectating. Wait for host to add you to the game.",
                    vi: "Bạn đang xem. Chờ chủ phòng thêm vào game.",
                  })}
                </div>
              )}
              <GameContainer
                onShowChangeGameModal={() => setShowChangeGameModal(true)}
              />
            </div>

            {/* Resize Handle (Desktop Only) */}
            <div
              className={`hidden lg:flex w-4 cursor-col-resize items-center justify-center hover:bg-white/10 rounded transition-colors flex-shrink-0 ${
                isResizing ? "bg-white/10" : ""
              }`}
              onMouseDown={startResizing}
            >
              <div className="w-1 h-8 bg-white/20 rounded-full" />
            </div>

            {/* Chat Panel & Spectators */}
            <div
              className="flex-shrink-0 glass-card rounded-2xl flex flex-col overflow-hidden"
              style={{
                width: isDesktop ? chatPanelWidth : "100%",
                height: isDesktop ? "auto" : "600px",
              }}
            >
              <SidePanel />
            </div>
          </div>
        </main>

        <footer className="p-4 flex-shrink-0">
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
    </>
  );
}

// Subcomponents extracted to avoid re-renders

function PasswordPromptModal({
  roomId,
  onSuccess,
  onCancel,
  onError,
}: {
  roomId: string;
  onSuccess: (room: Room) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { ti, ts } = useLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsSubmitting(true);
    const socket = getSocket();
    socket.emit(
      "room:join",
      { roomId, password },
      (response: { success: boolean; room?: any; error?: string }) => {
        setIsSubmitting(false);
        if (response.success && response.room) {
          onSuccess(response.room);
        } else {
          onError(response.error || "Failed to join");
          if (response.error === "Incorrect password") {
            setPassword("");
          }
        }
      },
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
      <div className="bg-background-secondary border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl mx-4 animate-scaleIn">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4 text-yellow-500">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-display text-text-primary">
            {ti({ en: "Password Required", vi: "Yêu cầu mật khẩu" })}
          </h2>
          <p className="text-text-secondary mt-2">
            {ti({
              en: "This room is private. Please enter the password to join.",
              vi: "Phòng này riêng tư. Vui lòng nhập mật khẩu để tham gia.",
            })}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={ts({
              en: "Enter room password",
              vi: "Nhập mật khẩu phòng",
            })}
            autoFocus
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-center text-lg dating-tighter"
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-text-secondary font-medium rounded-xl transition-colors cursor-pointer"
            >
              {ti({ en: "Cancel", vi: "Hủy" })}
            </button>
            <button
              type="submit"
              disabled={!password || isSubmitting}
              className="flex-1 px-4 py-3 bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer"
            >
              {isSubmitting
                ? ti({ en: "Joining...", vi: "Đang vào..." })
                : ti({ en: "Join Room", vi: "Vào phòng" })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangeGameModal({
  currentRoom,
  onClose,
  onChangeGame,
}: {
  currentRoom: Room;
  onClose: () => void;
  onChangeGame: (gameId: string) => void;
}) {
  const { ti, ts } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<
    GameCategory | "favorites" | null
  >(null);
  const { favorites, toggleFavorite, favoritesCount } = useGameFavorites();

  const filteredGames = getAllGames().filter((game) =>
    selectedCategory === "favorites"
      ? favorites.includes(game.id)
      : selectedCategory
        ? game.categories.includes(selectedCategory)
        : true,
  );

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-background-secondary border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl mx-4 animate-scaleIn relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-lg transition-colors text-text-secondary z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-2xl font-display text-text-primary mb-6">
          {ti({ en: "Change Game", vi: "Đổi game" })}
        </h3>

        <div className="mb-6">
          <GameCategoryFilter
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            favoritesCount={favoritesCount}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGames.map((game) => {
            const Icon = game.icon;
            const isSelected = currentRoom.gameType === game.id;
            return (
              <div key={game.id} className="relative group">
                <button
                  onClick={(e) => toggleFavorite(game.id, e)}
                  className={`absolute top-2 right-2 p-1.5 rounded-full transition-all duration-200 z-10 ${
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
                    className={`w-4 h-4 ${favorites.includes(game.id) ? "fill-current" : ""}`}
                  />
                </button>

                <button
                  onClick={() => onChangeGame(game.id)}
                  disabled={!game.isAvailable || isSelected}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all text-left w-full ${
                    isSelected
                      ? "bg-primary/20 border-primary cursor-default"
                      : !game.isAvailable
                        ? "opacity-50 cursor-not-allowed border-white/5 bg-white/5"
                        : "bg-white/5 border-white/10 hover:border-primary/50 hover:bg-white/10 cursor-pointer"
                  }`}
                >
                  <div
                    className={`p-3 rounded-lg ${
                      isSelected
                        ? "bg-primary text-white"
                        : "bg-white/10 text-primary"
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4
                      className={`font-bold ${
                        isSelected ? "text-primary" : "text-text-primary"
                      }`}
                    >
                      {ti(game.name)}
                    </h4>
                    <p className="text-xs text-text-secondary line-clamp-2 mt-2 opacity-50">
                      {ti(game.description)}
                    </p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
