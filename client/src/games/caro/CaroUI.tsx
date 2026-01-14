import React, { useState, useRef, useEffect } from "react";
import Caro from "./Caro";
import { type CaroState } from "./types";
import {
  X,
  Circle,
  Target,
  Undo,
  RotateCcw,
  RefreshCcw,
  Bot,
  Play,
} from "lucide-react";
import { useUserStore } from "../../stores/userStore";
import type { GameUIProps } from "../types";

const BOARD_SIZE = 50;
const CELL_SIZE = 40;

export default function CaroUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Caro;
  const [state, setState] = useState<CaroState>(game.getState());
  const { userId, username: myUsername } = useUserStore();

  const { board, winningLine, pendingUndoRequest } = state;
  const mySymbol = game.getPlayerSymbol();
  const isMyTurn = state.currentTurn === mySymbol;
  // Game logic handles turn validation, UI just needs to reflect it.

  useEffect(() => {
    game.onUpdate((newState) => setState(newState));
  }, [game]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport state
  const [viewport, setViewport] = useState({
    x: 20,
    y: 20,
  });

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({
    x: 0,
    y: 0,
    viewportX: 0,
    viewportY: 0,
  });
  const [hoverCell, setHoverCell] = useState<{
    row: number;
    col: number;
  } | null>(null);

  // Canvas size - responsive
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 600 });

  // Get last move
  const getLastMove = (): { row: number; col: number } | null => {
    const moves = state.history;
    if (moves.length === 0) return null;
    const lastKey = moves[moves.length - 1];
    const [row, col] = lastKey.split(",").map(Number);
    return { row, col };
  };

  // Update canvas size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        // Since container height shrinks with content, we use window height to constrain
        // Header ~40px, Padding/Gap ~40px, Extra space ~40px = ~120px offset
        // But let's be safe with 200px to allow for other UI elements
        const height = window.innerHeight - 200;
        const size = Math.min(width, height, 600);
        setCanvasSize({ width: size, height: size });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Calculate view area
    const cellSize = CELL_SIZE;
    const visibleCols = Math.ceil(canvasSize.width / cellSize);
    const visibleRows = Math.ceil(canvasSize.height / cellSize);

    // Calculate offset (smooth pan)
    const offsetX = -(viewport.x * cellSize) % cellSize;
    const offsetY = -(viewport.y * cellSize) % cellSize;

    const startCol = Math.floor(viewport.x);
    const startRow = Math.floor(viewport.y);

    // Draw grid
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;

    for (let i = 0; i <= visibleCols + 1; i++) {
      const x = offsetX + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasSize.height);
      ctx.stroke();
    }

    for (let i = 0; i <= visibleRows + 1; i++) {
      const y = offsetY + i * cellSize;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasSize.width, y);
      ctx.stroke();
    }

    // Draw hover
    if (hoverCell && isMyTurn && !state.gameOver) {
      const hoverCol = hoverCell.col - startCol;
      const hoverRow = hoverCell.row - startRow;

      if (
        hoverCol >= 0 &&
        hoverCol < visibleCols &&
        hoverRow >= 0 &&
        hoverRow < visibleRows
      ) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.2)";
        ctx.fillRect(
          offsetX + hoverCol * cellSize,
          offsetY + hoverRow * cellSize,
          cellSize,
          cellSize
        );
      }
    }

    // Draw pieces
    for (let i = 0; i < visibleCols + 1; i++) {
      for (let j = 0; j < visibleRows + 1; j++) {
        const col = startCol + i;
        const row = startRow + j;

        if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE)
          continue;

        const key = `${row},${col}`;
        const symbol = board[key];
        if (!symbol) continue;

        const x = offsetX + i * cellSize + cellSize / 2;
        const y = offsetY + j * cellSize + cellSize / 2;

        const isWinning = winningLine?.some(([r, c]) => r === row && c === col);
        const lastMove = getLastMove();
        const isLast = lastMove && lastMove.row === row && lastMove.col === col;

        // Draw highlight for last move (full cell background)
        if (isLast && !isWinning) {
          ctx.fillStyle = "rgba(251, 191, 36, 0.25)"; // amber with transparency
          ctx.fillRect(
            offsetX + i * cellSize,
            offsetY + j * cellSize,
            cellSize,
            cellSize
          );
        }

        if (symbol === "X") {
          ctx.strokeStyle = isWinning ? "#4ade80" : "#3b82f6";
          ctx.lineWidth = isLast ? 4 : 3;
          const size = cellSize * 0.3;

          ctx.beginPath();
          ctx.moveTo(x - size, y - size);
          ctx.lineTo(x + size, y + size);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + size, y - size);
          ctx.lineTo(x - size, y + size);
          ctx.stroke();
        } else {
          ctx.strokeStyle = isWinning ? "#4ade80" : "#ef4444";
          ctx.lineWidth = isLast ? 4 : 3;
          const radius = cellSize * 0.25;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Draw coordinates in corner
    ctx.fillStyle = "#64748b";
    ctx.font = "10px monospace";
    ctx.fillText(`(${startCol}, ${startRow})`, 5, 15);
  }, [
    viewport,
    board,
    winningLine,
    hoverCell,
    isMyTurn,
    state.gameOver,
    canvasSize,
  ]);

  // Convert canvas coordinates to board position
  const canvasToBoard = (
    clientX: number,
    clientY: number
  ): { row: number; col: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const cellSize = CELL_SIZE;
    const col = Math.floor(viewport.x + x / cellSize);
    const row = Math.floor(viewport.y + y / cellSize);

    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE)
      return null;

    return { row, col };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      viewportX: viewport.x,
      viewportY: viewport.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Update hover
    const pos = canvasToBoard(e.clientX, e.clientY);
    setHoverCell(pos);

    // Pan
    if (isPanning) {
      const dx = (panStart.x - e.clientX) / CELL_SIZE;
      const dy = (panStart.y - e.clientY) / CELL_SIZE;

      setViewport({
        x: Math.max(0, Math.min(BOARD_SIZE - 1, panStart.viewportX + dx)),
        y: Math.max(0, Math.min(BOARD_SIZE - 1, panStart.viewportY + dy)),
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
    setHoverCell(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't place if was panning
    if (
      Math.abs(e.clientX - panStart.x) > 5 ||
      Math.abs(e.clientY - panStart.y) > 5
    ) {
      return;
    }

    if (!isMyTurn || state.gameOver) return;

    const pos = canvasToBoard(e.clientX, e.clientY);
    if (!pos) return;

    const key = `${pos.row},${pos.col}`;
    if (board[key]) return;

    game.requestMove(pos.row, pos.col);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsPanning(true);
    setPanStart({
      x: touch.clientX,
      y: touch.clientY,
      viewportX: viewport.x,
      viewportY: viewport.y,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    // Update hover
    const pos = canvasToBoard(touch.clientX, touch.clientY);
    setHoverCell(pos);

    // Pan
    if (isPanning) {
      const dx = (panStart.x - touch.clientX) / CELL_SIZE;
      const dy = (panStart.y - touch.clientY) / CELL_SIZE;

      setViewport({
        x: Math.max(0, Math.min(BOARD_SIZE - 1, panStart.viewportX + dx)),
        y: Math.max(0, Math.min(BOARD_SIZE - 1, panStart.viewportY + dy)),
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];

    // Don't place if was panning
    if (
      Math.abs(touch.clientX - panStart.x) > 5 ||
      Math.abs(touch.clientY - panStart.y) > 5
    ) {
      setIsPanning(false);
      setHoverCell(null);
      return;
    }

    setIsPanning(false);
    setHoverCell(null);

    if (!isMyTurn || state.gameOver) return;

    const pos = canvasToBoard(touch.clientX, touch.clientY);
    if (!pos) return;

    const key = `${pos.row},${pos.col}`;
    if (board[key]) return;

    game.requestMove(pos.row, pos.col);
  };

  const focusLastMove = () => {
    const lastMove = getLastMove();
    if (!lastMove) return;

    // Calculate how many cells are visible in the viewport
    const visibleCols = canvasSize.width / CELL_SIZE;
    const visibleRows = canvasSize.height / CELL_SIZE;

    // Center the last move in the viewport (add 0.5 to center the cell itself)
    const targetX = Math.max(0, lastMove.col - visibleCols / 2 + 0.5);
    const targetY = Math.max(0, lastMove.row - visibleRows / 2 + 0.5);

    // Smooth animation
    const startX = viewport.x;
    const startY = viewport.y;
    const startTime = performance.now();
    const duration = 300; // ms

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);

      setViewport({
        x: startX + (targetX - startX) * eased,
        y: startY + (targetY - startY) * eased,
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  };

  return (
    <div className="flex flex-col gap-3 p-2 md:p-4 w-full">
      {/* Player List */}
      <div className="flex flex-col gap-2 p-3 bg-slate-800 rounded-lg w-full max-w-[400px] mx-auto">
        <h3 className="text-sm font-medium text-gray-400 mb-1">Players</h3>
        {(["X", "O"] as const).map((symbol) => {
          const player = state.players[symbol];
          const isCurrentTurn = state.currentTurn === symbol && !state.gameOver;
          const isMe = symbol === mySymbol;
          const isBot = player === "BOT";
          const playerName = isBot
            ? "Bot"
            : isMe
            ? myUsername
            : player
            ? "Opponent"
            : null;

          return (
            <div
              key={symbol}
              className={`
                flex items-center justify-between p-2 rounded-lg
                ${
                  isCurrentTurn
                    ? "bg-slate-600 ring-2 ring-blue-400"
                    : "bg-slate-700"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center">
                  {symbol === "X" ? (
                    <X className="w-5 h-5 text-blue-400" strokeWidth={2.5} />
                  ) : (
                    <Circle
                      className="w-5 h-5 text-red-400"
                      strokeWidth={2.5}
                    />
                  )}
                </div>
                <span className="text-white">
                  {playerName ? playerName : "(waiting...)"}
                  {isBot && " 🤖"}
                  {isMe && player && " (You)"}
                </span>
              </div>
              {isBot && game.isHostUser && !state.gameOver && (
                <button
                  onClick={() => game.removeBot()}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                >
                  Remove
                </button>
              )}
              {!player &&
                game.isHostUser &&
                !state.gameOver &&
                symbol === "O" && (
                  <button
                    onClick={() => game.addBot()}
                    className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1"
                  >
                    <Bot className="w-3 h-3" /> Add Bot
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {/* Start Game Button - only show when waiting and both players ready */}
      {state.gamePhase === "waiting" && game.isHostUser && (
        <div className="flex flex-col items-center gap-2">
          {game.canStartGame() ? (
            <button
              onClick={() => game.startGame()}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start Game
            </button>
          ) : (
            <span className="text-sm text-slate-400">
              Waiting for opponent to join...
            </span>
          )}
        </div>
      )}

      {/* Start Game message for non-host */}
      {state.gamePhase === "waiting" && !game.isHostUser && (
        <div className="text-sm text-slate-400">
          Waiting for host to start the game...
        </div>
      )}

      {/* Game Status - only show during playing */}
      {state.gamePhase === "playing" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold">
              {state.gameOver ? (
                state.winner ? (
                  <span
                    className={
                      state.winner === mySymbol
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    {state.winner === mySymbol ? "You Won!" : "Opponent Won!"}
                  </span>
                ) : (
                  <span className="text-yellow-400">Draw!</span>
                )
              ) : (
                <span
                  className={isMyTurn ? "text-primary-400" : "text-slate-400"}
                >
                  {isMyTurn ? "Your Turn" : "Opponent's Turn"}
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-1 md:gap-2 text-xs">
            {state.gameOver ? (
              <button
                onClick={() => game.requestReset()}
                className="px-2 py-1 bg-primary-600 hover:bg-primary-500 rounded text-white flex items-center gap-1"
                title="New game"
              >
                <RotateCcw className="w-3 h-3" />
                <span>New Game</span>
              </button>
            ) : Object.keys(board).length > 0 ? (
              <button
                onClick={focusLastMove}
                disabled={Object.keys(board).length === 0}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Focus to last move"
              >
                <Target className="w-3 h-3" />
                <span>Last</span>
              </button>
            ) : null}

            {/* Request Undo button - only show when opponent just moved */}
            {!state.gameOver &&
              Object.keys(board).length > 0 &&
              !isMyTurn &&
              !pendingUndoRequest && (
                <button
                  onClick={() => game.requestUndo()}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1"
                  title="Request undo from opponent"
                >
                  <Undo className="w-3 h-3" />
                  <span>Undo</span>
                </button>
              )}

            {/* Switch Turn button - only show when board is empty */}
            {!state.gameOver && Object.keys(board).length === 0 && isMyTurn && (
              <button
                onClick={() => game.switchTurn()}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1"
                title="Give first move to opponent"
              >
                <RefreshCcw className="w-3 h-3" />
                <span>Give First Move</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Undo Request Notification - separate section */}
      {pendingUndoRequest && (
        <div className="px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
          {/* Waiting for opponent response (I requested) */}
          {pendingUndoRequest === userId && (
            <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
              <Undo className="w-4 h-4 animate-pulse" />
              <span>Waiting for opponent to respond to undo request...</span>
            </div>
          )}

          {/* Undo confirmation buttons - opponent is asking me */}
          {pendingUndoRequest !== userId && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Undo className="w-4 h-4 text-amber-400" />
                <span>Opponent is requesting to undo their last move</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => game.responseUndo(true)}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-white text-sm font-medium flex items-center gap-1.5"
                  title="Allow undo"
                >
                  <span>Allow</span>
                </button>
                <button
                  onClick={() => game.responseUndo(false)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-sm font-medium flex items-center gap-1.5"
                  title="Deny undo"
                >
                  <span>Deny</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      {/* Canvas Container - Flex 1 to fill available space, centers the canvas */}
      <div
        ref={containerRef}
        className="w-full flex items-center justify-center"
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          style={{ width: canvasSize.width, height: canvasSize.height }}
          className="border-2 border-slate-700 rounded-lg bg-slate-900 cursor-move touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* Helper text */}
      <div className="text-xs text-slate-500 text-center">
        Drag to pan • Click to place
      </div>
    </div>
  );
}
