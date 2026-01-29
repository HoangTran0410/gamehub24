import React, { useState, useRef, useEffect } from "react";
import Caro from "./Caro";
import {
  X,
  Circle,
  Target,
  Undo,
  RefreshCcw,
  Bot,
  Play,
  BookOpen,
} from "lucide-react";
import { useUserStore } from "../../stores/userStore";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { useAlertStore } from "../../stores/alertStore";
import { createPortal } from "react-dom";
import useGameState from "../../hooks/useGameState";

const BOARD_SIZE = 50;
const CELL_SIZE = 40;

export default function CaroUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Caro;
  const [state] = useGameState(game);
  const { userId } = useUserStore();
  const { confirm: showConfirm } = useAlertStore();
  const { ti, ts } = useLanguage();
  const [showRules, setShowRules] = useState(false);

  const { board, winningLine, pendingUndoRequest } = state;
  const mySymbol = game.getPlayerSymbol();
  const isMyTurn = state.currentTurn === mySymbol;
  // Game logic handles turn validation, UI just needs to reflect it.

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
          cellSize,
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
            cellSize,
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
    clientY: number,
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

  const renderGameRules = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
        <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-yellow-500" />
            {ti({ en: "Game Rules: Caro (Gomoku)", vi: "Luật Chơi: Cờ Caro" })}
          </h2>
          <button
            onClick={() => setShowRules(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-slate-300 leading-relaxed">
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <p>
                {ti({
                  en: "Be the first player to get 5 of your marks in a row (horizontally, vertically, or diagonally).",
                  vi: "Là người đầu tiên tạo được 5 dấu liên tiếp (ngang, dọc hoặc chéo).",
                })}
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Rules", vi: "Quy Tắc" })}
              </h3>
              <ul className="list-disc pl-4">
                <li>
                  {ti({
                    en: "Players take turns placing their mark (X or O) on an empty square.",
                    vi: "Người chơi lần lượt đặt dấu (X hoặc O) vào một ô trống.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "The game is played on an infinite board (expandable).",
                    vi: "Trò chơi diễn ra trên bàn cờ vô tận (có thể mở rộng).",
                  })}
                </li>
                <li>
                  {ti({
                    en: "The game ends when one player gets 5 in a row.",
                    vi: "Trò chơi kết thúc khi có người chơi đạt 5 dấu liên tiếp.",
                  })}
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Controls", vi: "Điều Khiển" })}
              </h3>
              <ul className="list-disc pl-4">
                <li>
                  {ti({
                    en: "Click/Tap to place a mark.",
                    vi: "Click/Chạm để đặt dấu.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Drag to pan the board.",
                    vi: "Kéo để di chuyển bàn cờ.",
                  })}
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-2 @md:p-4 w-full pb-16!">
      {/* Player List */}
      <div className="flex flex-col gap-2 p-3 bg-slate-800 rounded-lg w-full max-w-[400px] mx-auto">
        {(["X", "O"] as const).map((symbol) => {
          const player = state.players[symbol];
          const isCurrentTurn = state.currentTurn === symbol && !state.gameOver;
          const isMe = symbol === mySymbol;
          const isBot = player?.isBot;
          const playerName = isBot ? "Bot" : player?.username;

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
                  {playerName
                    ? playerName
                    : ti({ en: "(waiting...)", vi: "(đang chờ...)" })}
                  {isBot && " 🤖"}
                  {isMe && player && ti({ en: " (You)", vi: " (Bạn)" })}
                </span>
              </div>
              {isBot &&
                game.isHost &&
                !state.gameOver &&
                state.gamePhase !== "playing" && (
                  <button
                    onClick={() => game.removeBot()}
                    className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                  >
                    {ti({ en: "Remove", vi: "Xóa" })}
                  </button>
                )}
              {!player && game.isHost && !state.gameOver && symbol === "O" && (
                <button
                  onClick={() => game.addBot()}
                  className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1"
                >
                  <Bot className="w-3 h-3" />{" "}
                  {ti({ en: "Add Bot", vi: "Thêm Bot" })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Start Game Button - only show when waiting and both players ready */}
      {state.gamePhase === "waiting" && game.isHost && (
        <div className="flex flex-col items-center gap-2">
          {game.canStartGame() ? (
            <button
              onClick={() => game.startGame()}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              {ti({ en: "Start Game", vi: "Bắt đầu" })}
            </button>
          ) : (
            <span className="text-sm text-slate-400">
              {ti({
                en: "Waiting for opponent to join...",
                vi: "Đang chờ đối thủ tham gia...",
              })}
            </span>
          )}
        </div>
      )}

      {/* Reset game button */}
      {state.gamePhase === "playing" && game.isHost && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={async () => {
              if (
                state.gameOver ||
                (await showConfirm(
                  ts({
                    en: "Are you sure you want to reset the game?",
                    vi: "Bạn có chắc chắn muốn chơi lại?",
                  }),
                  ts({
                    en: "Reset Game",
                    vi: "Chơi lại",
                  }),
                ))
              )
                game.reset();
            }}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            {ti({ en: "Reset Game", vi: "Chơi lại" })}
          </button>
        </div>
      )}

      {/* Start Game message for non-host */}
      {state.gamePhase === "waiting" && !game.isHost && (
        <div className="text-sm text-slate-400">
          {ti({
            en: "Waiting for host to start the game...",
            vi: "Đang chờ chủ phòng bắt đầu...",
          })}
        </div>
      )}

      {/* Game Status - only show during playing */}
      {state.gamePhase === "playing" && (
        <div className="flex flex-col items-center justify-between">
          <div className="text-md font-semibold">
            {state.gameOver ? (
              state.winner ? (
                <span
                  className={
                    state.winner === mySymbol
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {state.winner === mySymbol
                    ? ti({ en: "You Won!", vi: "Bạn thắng!" })
                    : ti({ en: "Opponent Won!", vi: "Đối thủ thắng!" })}
                </span>
              ) : (
                <span className="text-yellow-400">
                  {ti({ en: "Draw!", vi: "Hòa!" })}
                </span>
              )
            ) : (
              <span
                className={isMyTurn ? "text-primary-400" : "text-slate-400"}
              >
                {isMyTurn
                  ? ti({ en: "Your Turn", vi: "Lượt của bạn" })
                  : ti({ en: "Opponent's Turn", vi: "Lượt đối thủ" })}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-1 @md:gap-2 text-xs">
            {!state.gameOver && Object.keys(board).length > 0 ? (
              <button
                onClick={focusLastMove}
                disabled={Object.keys(board).length === 0}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  ti({
                    en: "Focus to last move",
                    vi: "Xem nước đi cuối",
                  }) as string
                }
              >
                <Target className="w-3 h-3" />
                <span>{ti({ en: "Last", vi: "Cuối" })}</span>
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
                  title={
                    ti({
                      en: "Request undo from opponent",
                      vi: "Yêu cầu đối thủ hoàn tác",
                    }) as string
                  }
                >
                  <Undo className="w-3 h-3" />
                  <span>{ti({ en: "Undo", vi: "Hoàn tác" })}</span>
                </button>
              )}

            {/* Switch Turn button - only show when board is empty */}
            {!state.gameOver && Object.keys(board).length === 0 && isMyTurn && (
              <button
                onClick={() => game.switchTurn()}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1"
                title={
                  ti({
                    en: "Give first move to opponent",
                    vi: "Nhường nước đi đầu cho đối thủ",
                  }) as string
                }
              >
                <RefreshCcw className="w-3 h-3" />
                <span>
                  {ti({ en: "Give First Move", vi: "Nhường đi trước" })}
                </span>
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
              <span>
                {ti({
                  en: "Waiting for opponent to respond to undo request...",
                  vi: "Đang chờ đối thủ phản hồi yêu cầu hoàn tác...",
                })}
              </span>
            </div>
          )}

          {/* Undo confirmation buttons - opponent is asking me */}
          {pendingUndoRequest !== userId && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Undo className="w-4 h-4 text-amber-400" />
                <span>
                  {ti({
                    en: "Opponent is requesting to undo their last move",
                    vi: "Đối thủ yêu cầu hoàn tác nước đi cuối",
                  })}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => game.responseUndo(true)}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-white text-sm font-medium flex items-center gap-1.5"
                  title={
                    ti({ en: "Allow undo", vi: "Cho phép hoàn tác" }) as string
                  }
                >
                  <span>{ti({ en: "Allow", vi: "Đồng ý" })}</span>
                </button>
                <button
                  onClick={() => game.responseUndo(false)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-sm font-medium flex items-center gap-1.5"
                  title={
                    ti({ en: "Deny undo", vi: "Từ chối hoàn tác" }) as string
                  }
                >
                  <span>{ti({ en: "Deny", vi: "Từ chối" })}</span>
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
        {ti({
          en: "Drag to pan • Click to place",
          vi: "Kéo để di chuyển • Nhấp để đặt quân",
        })}
      </div>

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-yellow-500 transition-colors z-40 shadow-lg border border-slate-500"
        title={ts({ en: "Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={24} />
      </button>
      {showRules && createPortal(renderGameRules(), document.body)}
    </div>
  );
}
