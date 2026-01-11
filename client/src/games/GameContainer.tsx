import { useEffect, useState } from "react";
import { useRoomStore } from "../stores/roomStore";
import { useUserStore } from "../stores/userStore";
import { useGameStore } from "../stores/gameStore";
import { getSocket } from "../services/socket";
import { getGame } from "./registry";
import loadable from "@loadable/component";

import TicTacToe from "./tictactoe/TicTacToe";
import Caro from "./caro/Caro";
import ChessGame from "./chess/Chess";
import YouTubeWatch from "./youtube/YouTubeWatch";
import CanvasGame from "./canvas/CanvasGame";
import Thirteen from "./thirteen/Thirteen";
import Reversi from "./reversi/Reversi";

const TicTacToeUI = loadable(() => import("./tictactoe/TicTacToeUI"), {
  fallback: <div>Loading TicTacToe...</div>,
});
const CaroUI = loadable(() => import("./caro/CaroUI"), {
  fallback: <div>Loading Caro...</div>,
});
const ChessUI = loadable(() => import("./chess/ChessUI"), {
  fallback: <div>Loading Chess...</div>,
});
const YouTubeWatchUI = loadable(() => import("./youtube/YouTubeWatchUI"), {
  fallback: <div>Loading YouTube...</div>,
});
const CanvasGameUI = loadable(() => import("./canvas/CanvasGameUI"), {
  fallback: <div>Loading Canvas...</div>,
});
const ThirteenUI = loadable(() => import("./thirteen/ThirteenUI"), {
  fallback: <div>Loading Thirteen...</div>,
});
const ReversiUI = loadable(() => import("./reversi/ReversiUI"), {
  fallback: <div>Loading Reversi...</div>,
});

export default function GameContainer() {
  const { currentRoom } = useRoomStore();
  const { userId } = useUserStore();
  const { gameInstance, setGameInstance, setIsHost } = useGameStore();
  const socket = getSocket();
  const [error, setError] = useState<string | null>(null);

  // Main Game Lifecycle Effect
  useEffect(() => {
    if (!currentRoom) return;

    // Helper to cleanup and create new game
    const createNewGame = () => {
      if (gameInstance) {
        gameInstance.destroy();
      }

      const gameType = currentRoom.gameType;
      const gameModule = getGame(gameType);

      if (!gameModule) {
        setError(`Game "${gameType}" not found`);
        setGameInstance(null); // Clear invalid game
        return;
      }

      setError(null);

      const isHost = currentRoom.ownerId === userId;
      setIsHost(isHost);

      const game = gameModule.createGame(
        currentRoom.id,
        socket,
        isHost,
        userId,
        currentRoom.players
      );

      setGameInstance(game);
    };

    // If no game, or Room ID mismatch (switched rooms), create new
    // We access the internal property if possible, or we just rely on local state tracking?
    // Since we don't expose roomId on BaseGame public interface easily (it is protected), but we can cast or assume.
    // Actually, checking if gameInstance is fresh is tricky.
    // Let's rely on a key or simple logic:
    // If we have no game -> Create.
    // If we have game, but it belongs to a different room (how to check? we can add public getter to BaseGame or just track it).
    // Let's add `getRoomId()` to BaseGame? Or just use the fact that we are in a dependency array.

    // BETTER APPROACH:
    // Split into 2 effects.
    // 1. Create/Destroy based on Room ID.
    // 2. Update players based on Room Players.

    // BUT we need to reference the SAME gameInstance.
    // Let's stick to one effect but use refs or smart checks.

    if (!gameInstance || (gameInstance as any).roomId !== currentRoom.id) {
      createNewGame();
    } else {
      // Same room, just update players
      // Update Host status
      const isHost = currentRoom.ownerId === userId;
      setIsHost(isHost);

      gameInstance.updatePlayers(currentRoom.players);
    }
  }, [
    currentRoom?.id,
    currentRoom?.gameType,
    currentRoom?.players,
    userId,
    socket,
    setGameInstance,
    setIsHost,
  ]);
  // We remove gameInstance from dependency to avoid loop if setGameInstance triggers this?
  // No, setGameInstance will update gameInstance.
  // We need to be careful.

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      // We can't access distinct gameInstance here easily if we don't capture it.
      // access store directly
      useGameStore.getState().gameInstance?.destroy();
      useGameStore.getState().setGameInstance(null);
    };
  }, []);

  if (!currentRoom) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">No room selected</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">{error}</p>
      </div>
    );
  }

  if (!gameInstance) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">Loading game...</p>
      </div>
    );
  }

  // Render game UI based on type
  if (gameInstance instanceof TicTacToe) {
    return <TicTacToeUI game={gameInstance} />;
  }

  if (gameInstance instanceof Caro) {
    return <CaroUI game={gameInstance} />;
  }

  if (gameInstance instanceof ChessGame) {
    return <ChessUI game={gameInstance} />;
  }

  if (gameInstance instanceof YouTubeWatch) {
    return <YouTubeWatchUI game={gameInstance} />;
  }

  if (gameInstance instanceof CanvasGame) {
    return <CanvasGameUI game={gameInstance} currentUserId={userId} />;
  }

  if (gameInstance instanceof Thirteen) {
    return <ThirteenUI game={gameInstance} />;
  }

  if (gameInstance instanceof Reversi) {
    return <ReversiUI game={gameInstance} currentUserId={userId} />;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-text-muted">Unknown game type</p>
    </div>
  );
}
