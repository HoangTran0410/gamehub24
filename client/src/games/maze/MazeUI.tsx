import React, { useEffect, useRef, useState, useMemo } from "react";
import type { GameUIProps } from "../types";
import Maze, { DIFFICULTY_CONFIG, type Difficulty } from "./Maze";
import type { MazeState, Direction } from "./types";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Play,
  RotateCcw,
} from "lucide-react";
import { useAlertStore } from "../../stores/alertStore";
import useLanguage from "../../stores/languageStore";

const APP_PADDING = 32; // Total horizontal padding of the app container
const HUD_HEIGHT = 180; // Approximate height of HUD

const MazeUI: React.FC<GameUIProps> = ({ game, currentUserId }) => {
  const mazeGame = game as Maze;
  const [state, setState] = useState<MazeState>(mazeGame.getState());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();

  // Dynamic Cell Size State
  const [cellSize, setCellSize] = useState(30);

  const myPlayer = currentUserId ? state.players[currentUserId] : undefined;

  // Subscribe to state updates
  useEffect(() => {
    const unsubscribe = mazeGame.onUpdate((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, [mazeGame]);

  // Generate maze grid locally based on seed & config
  const mazeGrid = useMemo(() => {
    return mazeGame.getMazeGrid();
  }, [state.config, state.seed, mazeGame]);

  // Dynamic Layout Calculation
  useEffect(() => {
    const updateLayout = () => {
      if (!containerRef.current) return;

      const { rows, cols } = state.config;

      // Calculate available space
      // Use window inner dimensions minus some padding/HUD space
      const maxWidth = Math.min(window.innerWidth - APP_PADDING, 800); // Optional max width cap
      const maxHeight = window.innerHeight - HUD_HEIGHT - APP_PADDING;

      // Calculate max possible cell size to fit within bounds
      // We want to fit 'cols' in width and 'rows' in height
      const maxCellWidth = Math.floor(maxWidth / cols);
      const maxCellHeight = Math.floor(maxHeight / rows);

      // Desired cell size constraint
      let size = Math.min(maxCellWidth, maxCellHeight);

      // Clamp size
      size = Math.max(10, Math.min(size, 40));

      setCellSize(size);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    // Also update when config changes (rows/cols change)
    return () => window.removeEventListener("resize", updateLayout);
  }, [state.config]);

  // Draw maze on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { rows, cols } = state.config;
    const width = cols * cellSize;
    const height = rows * cellSize;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    // Draw End Zone
    ctx.fillStyle = "rgba(34, 197, 94, 0.2)"; // Green
    ctx.fillRect(
      (cols - 1) * cellSize,
      (rows - 1) * cellSize,
      cellSize,
      cellSize,
    );

    // Draw Start Zone
    ctx.fillStyle = "rgba(59, 130, 246, 0.2)"; // Blue
    ctx.fillRect(0, 0, cellSize, cellSize);

    // Draw Portals
    ctx.lineWidth = 3;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = mazeGrid[y][x];
        if (cell.portalTo) {
          const px = x * cellSize + cellSize / 2;
          const py = y * cellSize + cellSize / 2;

          // Outer glow
          ctx.beginPath();
          ctx.arc(px, py, cellSize * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = cell.portalTo.color + "40"; // Transparent
          ctx.fill();

          // Inner ring
          ctx.beginPath();
          ctx.arc(px, py, cellSize * 0.25, 0, Math.PI * 2);
          ctx.strokeStyle = cell.portalTo.color;
          ctx.stroke();

          // Center dot
          ctx.beginPath();
          ctx.arc(px, py, cellSize * 0.1, 0, Math.PI * 2);
          ctx.fillStyle = cell.portalTo.color;
          ctx.fill();
        }
      }
    }

    // Draw Walls
    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 2; // Fixed wall thickness? Or scale? Keep constant for now.
    ctx.lineCap = "round";

    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = mazeGrid[y][x];
        const px = x * cellSize;
        const py = y * cellSize;

        if (cell.walls.top) {
          ctx.moveTo(px, py);
          ctx.lineTo(px + cellSize, py);
        }
        if (cell.walls.right) {
          ctx.moveTo(px + cellSize, py);
          ctx.lineTo(px + cellSize, py + cellSize);
        }
        if (cell.walls.bottom) {
          ctx.moveTo(px, py + cellSize);
          ctx.lineTo(px + cellSize, py + cellSize);
        }
        if (cell.walls.left) {
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + cellSize);
        }
      }
    }
    ctx.stroke();
  }, [mazeGrid, state.config, cellSize]); // Redraw when cellSize changes

  // Handle Keyboard Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.status !== "PLAYING") return;

      let dir: Direction | null = null;
      if (e.key === "ArrowUp") dir = "UP";
      if (e.key === "ArrowDown") dir = "DOWN";
      if (e.key === "ArrowLeft") dir = "LEFT";
      if (e.key === "ArrowRight") dir = "RIGHT";
      if (e.key === " ") handleTeleport();

      if (dir) {
        e.preventDefault();
        handleMove(dir);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.status, mazeGame]);

  const getRank = (playerId: string) => {
    const index = state.winners.indexOf(playerId);
    return index === -1 ? undefined : index + 1;
  };

  const handleTeleport = () => {
    if (currentUserId)
      mazeGame.makeAction({ type: "TELEPORT", playerId: currentUserId });
  };

  const handleMove = (direction: Direction) => {
    if (currentUserId)
      mazeGame.makeAction({ type: "MOVE", direction, playerId: currentUserId });
  };

  const handleStart = () => {
    mazeGame.makeAction({ type: "START_GAME" });
  };

  const handleReset = async () => {
    if (
      await showConfirm(
        ts({
          en: "Current progress will be lost",
          vi: "Tiến trình hiện tại sẽ mất",
        }),
        ts({
          en: "Reset Game?",
          vi: "Chơi lại?",
        }),
      )
    )
      mazeGame.makeAction({ type: "RESET_GAME" });
  };

  const handleNextLevel = () => {
    mazeGame.makeAction({ type: "NEXT_LEVEL" });
  };

  const handleDifficulty = (difficulty: Difficulty) => {
    mazeGame.makeAction({ type: "UPDATE_SETTINGS", difficulty });
  };

  const animationFrameRef = useRef<number>(undefined);
  const [isMyPlayerAnimating, setIsMyPlayerAnimating] = useState(false);

  // Animation Loop
  useEffect(() => {
    let lastAnimatingState = false;

    const animate = () => {
      const now = Date.now();

      Object.values(state.players).forEach((player) => {
        const el = playerRefs.current[player.id];
        if (!el) return;

        let renderX = player.x;
        let renderY = player.y;

        const isAnim =
          player.moveStart &&
          player.moveEnd &&
          player.currentPath &&
          player.currentPath.length >= 2 &&
          now < player.moveEnd;

        if (isAnim) {
          const totalDuration = player.moveEnd! - player.moveStart!;
          const elapsed = now - player.moveStart!;
          const progress = Math.max(0, Math.min(elapsed / totalDuration, 1));

          const path = player.currentPath!;
          const totalSegments = path.length - 1;
          const currentDist = progress * totalSegments;
          const segmentIndex = Math.floor(currentDist);
          const segmentProgress = currentDist - segmentIndex;

          if (segmentIndex < totalSegments) {
            const p1 = path[segmentIndex];
            const p2 = path[segmentIndex + 1];

            // Standard interpolation
            renderX = p1.x + (p2.x - p1.x) * segmentProgress;
            renderY = p1.y + (p2.y - p1.y) * segmentProgress;
          }
        }

        // Apply styles directly using dynamic cellSize
        el.style.left = `${renderX * cellSize + cellSize * 0.15}px`;
        el.style.top = `${renderY * cellSize + cellSize * 0.15}px`;
        el.style.width = `${cellSize * 0.7}px`;
        el.style.height = `${cellSize * 0.7}px`;

        // Handle Opacity for Finish State
        // const isAnimatingTimestamp = now < (player.moveEnd || 0);
        // if (getRank(player.id) && !isAnimatingTimestamp) {
        //   el.style.opacity = "0.5";
        // } else {
        //   el.style.opacity = "1";
        // }
      });

      // Update my player animation state for UI
      if (currentUserId && state.players[currentUserId]) {
        const p = state.players[currentUserId];
        const currentlyAnimating = !!(p.moveEnd && now < p.moveEnd);
        if (currentlyAnimating !== lastAnimatingState) {
          lastAnimatingState = currentlyAnimating;
          setIsMyPlayerAnimating(currentlyAnimating);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [state.players, currentUserId, cellSize]); // Re-bind when settings (cellSize) change

  // Calculate available moves for UI feedback
  const availableMoves = useMemo(() => {
    if (!myPlayer || !mazeGrid || isMyPlayerAnimating)
      return { UP: false, DOWN: false, LEFT: false, RIGHT: false };

    const { x, y } = myPlayer;
    if (y < 0 || x < 0 || y >= state.config.rows || x >= state.config.cols)
      return { UP: false, DOWN: false, LEFT: false, RIGHT: false };

    const cell = mazeGrid[y][x];
    return {
      UP: !cell.walls.top,
      DOWN: !cell.walls.bottom,
      LEFT: !cell.walls.left,
      RIGHT: !cell.walls.right,
    };
  }, [myPlayer?.x, myPlayer?.y, mazeGrid, state.config, isMyPlayerAnimating]);

  const renderMoveButtons = () => {
    if (
      state.status !== "PLAYING" ||
      !myPlayer ||
      isMyPlayerAnimating ||
      getRank(myPlayer.id)
    )
      return null;

    const BUTTON_SIZE = 40; // Fixed large touch target
    const ICON_SIZE = 24;
    const OFFSET = 40; // Fixed pixel distance from player center

    // Calculate Player Center relative to the container
    const rawCenterX = myPlayer.x * cellSize + cellSize / 2;
    const rawCenterY = myPlayer.y * cellSize + cellSize / 2;

    const width = state.config.cols * cellSize;
    const height = state.config.rows * cellSize;

    // Minimum space needed from center to edge based on enabled buttons
    const spaceLeft = availableMoves.LEFT
      ? OFFSET + BUTTON_SIZE / 2
      : BUTTON_SIZE / 2;
    const spaceRight = availableMoves.RIGHT
      ? OFFSET + BUTTON_SIZE / 2
      : BUTTON_SIZE / 2;
    const spaceTop = availableMoves.UP
      ? OFFSET + BUTTON_SIZE / 2
      : BUTTON_SIZE / 2;
    const spaceBottom = availableMoves.DOWN
      ? OFFSET + BUTTON_SIZE / 2
      : BUTTON_SIZE / 2;

    // Clamp center position to keep buttons inside
    const centerX = Math.max(
      spaceLeft,
      Math.min(width - spaceRight, rawCenterX),
    );
    const centerY = Math.max(
      spaceTop,
      Math.min(height - spaceBottom, rawCenterY),
    );

    const getButtonStyle = (offsetX: number, offsetY: number) => ({
      width: `${BUTTON_SIZE}px`,
      height: `${BUTTON_SIZE}px`,
      left: `${centerX + offsetX - BUTTON_SIZE / 2}px`,
      top: `${centerY + offsetY - BUTTON_SIZE / 2}px`,
    });

    const className =
      "absolute flex items-center justify-center bg-white/10 hover:bg-white/40 rounded-full backdrop-blur-sm transition-all hover:scale-110 active:scale-95 z-30 border border-white/10 shadow-lg ring-1 ring-black/20 opacity-50";

    return (
      <>
        {availableMoves.UP && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              handleMove("UP");
            }}
            className={className}
            style={getButtonStyle(0, -OFFSET)}
          >
            <ArrowUp size={ICON_SIZE} className="text-white drop-shadow-md" />
          </button>
        )}
        {availableMoves.DOWN && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              handleMove("DOWN");
            }}
            className={className}
            style={getButtonStyle(0, OFFSET)}
          >
            <ArrowDown size={ICON_SIZE} className="text-white drop-shadow-md" />
          </button>
        )}
        {availableMoves.LEFT && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              handleMove("LEFT");
            }}
            className={className}
            style={getButtonStyle(-OFFSET, 0)}
          >
            <ArrowLeft size={ICON_SIZE} className="text-white drop-shadow-md" />
          </button>
        )}
        {availableMoves.RIGHT && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              handleMove("RIGHT");
            }}
            className={className}
            style={getButtonStyle(OFFSET, 0)}
          >
            <ArrowRight
              size={ICON_SIZE}
              className="text-white drop-shadow-md"
            />
          </button>
        )}

        {/* Teleport Button */}
        {mazeGrid[myPlayer.y][myPlayer.x].portalTo && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              handleTeleport();
            }}
            className="absolute flex items-center justify-center bg-purple-500/80 hover:bg-purple-400 rounded-full backdrop-blur-sm transition-all hover:scale-110 active:scale-95 z-40 border border-white/20 shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse opacity-50"
            style={{
              width: `${BUTTON_SIZE}px`,
              height: `${BUTTON_SIZE}px`,
              left: `${centerX - BUTTON_SIZE / 2}px`,
              top: `${centerY - BUTTON_SIZE / 2}px`,
            }}
          >
            <RotateCcw
              size={ICON_SIZE}
              className="text-white drop-shadow-md animate-spin"
              style={{ animationDirection: "reverse" }}
            />
          </button>
        )}
      </>
    );
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-full p-4 overflow-hidden pb-16!"
      ref={containerRef}
    >
      {/* HUD & Players Combined */}
      <div className="flex flex-col w-full max-w-2xl bg-gray-800 p-4 rounded-xl shadow-lg gap-4 z-10 shrink-0">
        {/* Top Row: Info & Controls */}
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex flex-col">
            <span className="text-sm text-gray-400">Level</span>
            <span className="text-xl font-bold text-white flex gap-2 items-center">
              {state.level}{" "}
              <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
                {state.config.difficulty}
              </span>
            </span>

            {mazeGame.isHost && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                title="Reset Game"
              >
                <RotateCcw size={18} />
                {ti({ en: "Reset", vi: "Chơi lại" })}
              </button>
            )}
          </div>

          <div className="flex flex-col flex-wrap gap-0">
            {Object.values(state.players).map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-2 p-1.5 px-3 bg-gray-900/50 rounded-lg border border-gray-700/50"
              >
                <div
                  className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                  style={{ backgroundColor: player.color }}
                />
                <div className="truncate font-medium text-sm text-gray-300 max-w-[100px]">
                  {player.username || player.id.slice(0, 8)}
                  {player.id === currentUserId && (
                    <span className="text-blue-400 ml-1">
                      ({ts({ en: "You", vi: "Bạn" })})
                    </span>
                  )}
                </div>
                {getRank(player.id) && (
                  <span className="text-xs font-bold bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded ml-1">
                    #{getRank(player.id)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div
        className="relative shadow-2xl rounded-lg border border-gray-700 select-none bg-black mt-4 shrink-0 transition-all duration-300"
        style={{
          width: state.config.cols * cellSize,
          height: state.config.rows * cellSize,
        }}
      >
        {/* Clipped Game World Wrapper */}
        <div className="absolute inset-0 overflow-hidden rounded-lg">
          <canvas ref={canvasRef} />

          {/* Render Players with DOM Refs */}
          {Object.values(state.players).map((player) => (
            <div
              key={player.id}
              ref={(el) => {
                playerRefs.current[player.id] = el;
              }}
              className="absolute rounded-full shadow-sm flex items-center justify-center border-2 border-white"
              style={{
                width: `${cellSize * 0.7}px`,
                height: `${cellSize * 0.7}px`,
                // Initial position logic duplicated from animation loop for first render
                left: `${player.x * cellSize + cellSize * 0.15}px`,
                top: `${player.y * cellSize + cellSize * 0.15}px`,
                backgroundColor: player.color,
                zIndex: player.id === currentUserId ? 20 : 10,
              }}
            >
              {getRank(player.id) && (
                <span className="text-xs font-bold text-white drop-shadow-md">
                  #{getRank(player.id)}
                </span>
              )}
              {/* {player.id === currentUserId && !getRank(player.id) && (
                <div className="absolute w-2 h-2 bg-white rounded-full"></div>
              )} */}
            </div>
          ))}

          {/* Overlay for Waiting */}
          {state.status === "WAITING" && (
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-6 z-50 p-4 text-center">
              <div className="text-white text-3xl font-bold">
                {mazeGame.isHost
                  ? ts({ en: "Setup Game", vi: "Cài đặt Game" })
                  : ts({
                      en: "Waiting for Host...",
                      vi: "Đang chờ chủ phòng...",
                    })}
              </div>

              {mazeGame.isHost && (
                <div className="flex flex-col gap-4 items-center animate-in fade-in zoom-in duration-300">
                  <div className="flex bg-gray-800 rounded-lg p-1.5 ring-1 ring-gray-700">
                    {Object.keys(DIFFICULTY_CONFIG).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => handleDifficulty(diff)}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${state.config.difficulty === diff ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleStart}
                    className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-green-500/20 transition-all hover:-translate-y-0.5"
                  >
                    <Play size={24} fill="currentColor" />{" "}
                    {ts({ en: "Start Game", vi: "Chơi" })}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Overlay for Finished */}
          {state.status === "FINISHED" && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-6 z-50 p-4 text-center">
              <div className="text-green-400 text-4xl font-bold drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">
                {ts({ en: "Level Complete!", vi: "Xong Level" })} {state.level}
              </div>

              {myPlayer && getRank(myPlayer.id) && (
                <div className="text-white text-xl">
                  {ts({ en: "You finished", vi: "Bạn về đích" })}{" "}
                  <span className="font-bold text-yellow-400">
                    #{getRank(myPlayer.id)}
                  </span>
                </div>
              )}

              {mazeGame.isHost ? (
                <button
                  onClick={handleNextLevel}
                  className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-blue-500/20 transition-all hover:-translate-y-0.5"
                >
                  {ts({ en: "Next Level", vi: "Level tiếp theo" })}{" "}
                  <Play size={24} fill="currentColor" />
                </button>
              ) : (
                <div>
                  {ts({
                    en: "Waiting for Host...",
                    vi: "Đang chờ chủ phòng...",
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* On-screen Controls Overlay (Unclipped) */}
        {renderMoveButtons()}
      </div>

      <div className="mt-4 text-gray-500 text-sm hidden sm:block">
        {ts({
          vi: "Về đích đầu tiên để dành chiến thắng",
          en: "First to the finish wins!",
        })}
      </div>
    </div>
  );
};

export default MazeUI;
