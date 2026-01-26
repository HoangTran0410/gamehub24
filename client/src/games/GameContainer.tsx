import { useEffect, useState, useRef, type ComponentType } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { useGameStore } from "../stores/gameStore";
import { useAlertStore } from "../stores/alertStore";
import useLanguage from "../stores/languageStore";
import { getSocket } from "../services/socket";
import { getGame } from "./registry";
import type { GameUIProps } from "./types";
import { RotateCcw, Zap, ZapOff } from "lucide-react";
import type { BaseGame } from "./BaseGame";

export default function GameContainer({
  onShowChangeGameModal,
}: {
  onShowChangeGameModal: () => void;
}) {
  const { currentRoom } = useRoomStore();
  const { userId } = useUserStore();
  const { gameInstance, setGameInstance, setIsHost } = useGameStore();
  const { confirm: showConfirm } = useAlertStore();
  const { ts } = useLanguage();
  const socket = getSocket();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [GameUI, setGameUI] = useState<ComponentType<GameUIProps> | null>(null);

  // Track current loading to avoid race conditions
  const loadingRef = useRef<{ roomId: string; gameType: string } | null>(null);

  const [isOptimized, setIsOptimized] = useState(true);

  // Toggle Optimization
  const toggleOptimization = () => {
    if (gameInstance) {
      const newState = !isOptimized;
      setIsOptimized(newState);
      gameInstance.setOptimization(newState);
    }
  };

  // Main Game Lifecycle Effect
  useEffect(() => {
    if (!currentRoom) return;

    const roomId = currentRoom.id;
    const gameType = currentRoom.gameType;

    // Check if we need to create a new game
    const needsNewGame =
      !gameInstance ||
      (gameInstance as any).roomId !== roomId ||
      (gameInstance as any).assignedGameType !== gameType;

    if (!needsNewGame) {
      // Same room, just update players
      const isHost = currentRoom.ownerId === userId;
      setIsHost(isHost);
      gameInstance.updatePlayers(currentRoom.players);
      return;
    }

    // Avoid duplicate loading
    if (
      loadingRef.current?.roomId === roomId &&
      loadingRef.current?.gameType === gameType
    ) {
      return;
    }

    const loadGame = async () => {
      loadingRef.current = { roomId, gameType };
      setIsLoading(true);
      setError(null);
      setGameUI(null);

      // Cleanup previous game
      if (gameInstance) {
        console.log("destroying game instance", gameInstance);
        gameInstance.destroy();
        setGameInstance(null);
      }

      const gameModule = getGame(gameType);
      if (!gameModule || !gameModule.createGame || !gameModule.loadUI) {
        setError(`Game "${gameType}" not found`);
        setIsLoading(false);
        loadingRef.current = null;
        return;
      }

      try {
        const isHost = currentRoom.ownerId === userId;
        setIsHost(isHost);

        // Load game class and UI in parallel
        const [game, UI]: [BaseGame<any>, ComponentType<GameUIProps>] =
          await Promise.all([
            gameModule.createGame(
              roomId,
              socket,
              isHost,
              userId,
              currentRoom.players,
            ),
            gameModule.loadUI(),
          ]);

        // Check if still relevant (room might have changed during loading)
        if (
          loadingRef.current?.roomId !== roomId ||
          loadingRef.current?.gameType !== gameType
        ) {
          game.destroy();
          return;
        }

        // Set game name for persistence
        game.setGameName(gameType);

        // Check for saved state (Host only)
        if (isHost) {
          try {
            const key = `saved_game_${gameType}`;
            const savedItem = localStorage.getItem(key);
            if (savedItem) {
              const { state, timestamp } = JSON.parse(savedItem);
              const dateStr = new Date(timestamp).toLocaleString();

              const shouldRestore = await showConfirm(
                ts({
                  en: `Found unfinished game from ${dateStr}. Resume?`,
                  vi: `Tìm thấy ván game chưa xong lúc ${dateStr}. Tiếp tục?`,
                }),
                ts({ en: "Resume Game", vi: "Tiếp tục game" }),
              );

              if (shouldRestore) {
                game.setState(state);
                // Sync current players to the restored state
                game.updatePlayers(currentRoom.players);
                // Ensure broadcast happens to sync all clients
                // First time host enter room, no one here yet -> no need to broadcast
                // game.broadcastState();
              } else {
                // User chose to start new, clear old state
                localStorage.removeItem(key);
              }
            }
          } catch (e) {
            console.error("Error restoring game:", e);
          }
        }

        // guest sync state from host
        else {
        }

        // Tag instance for change detection
        (game as any).assignedGameType = gameType;

        setGameInstance(game);
        setGameUI(() => UI);
      } catch (err) {
        console.error("Failed to load game:", err);
        setError(`Failed to load game: ${err}`);
      } finally {
        setIsLoading(false);
        loadingRef.current = null;
      }
    };

    loadGame();
  }, [
    currentRoom?.id,
    currentRoom?.gameType,
    currentRoom?.players,
    currentRoom?.ownerId,
    userId,
    socket,
    setGameInstance,
    setIsHost,
  ]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      useGameStore.getState().gameInstance?.destroy();
      useGameStore.getState().setGameInstance(null);
    };
  }, []);

  if (!currentRoom) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <p className="text-text-muted">No room selected</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px]">
        <p className="text-red-500">{error}</p>

        <button
          onClick={onShowChangeGameModal}
          className="mt-4 px-4 py-2 flex items-center bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          {ts({ en: "Change Game", vi: "Đổi game" })}
        </button>
      </div>
    );
  }

  if (isLoading || !gameInstance || !GameUI) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <p className="text-text-muted">Loading game...</p>
      </div>
    );
  }

  // Render the dynamically loaded UI component
  return (
    <div className="relative w-full h-full">
      <GameUI game={gameInstance} currentUserId={userId} />

      {/* Optimization Toggle (Host + Dev Only) */}
      {gameInstance.isHost && false && (
        <button
          onClick={toggleOptimization}
          className={`absolute -top-2 -right-2 p-2 rounded-full shadow-lg transition-all z-50 opacity-10 hover:opacity-100 ${
            isOptimized
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "bg-gray-500 hover:bg-gray-600 text-white"
          }`}
          title={
            isOptimized
              ? "Optimization Enabled"
              : "Optimization Disabled (Full State)"
          }
        >
          {isOptimized ? (
            <Zap className="w-5 h-5" />
          ) : (
            <ZapOff className="w-5 h-5" />
          )}
        </button>
      )}
    </div>
  );
}
