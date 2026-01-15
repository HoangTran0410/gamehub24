import { useEffect, useState, useRef, useCallback } from "react";
import Billiard from "./Billiard";
import type { BilliardState, Ball } from "./types";
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BALL_RADIUS,
  POCKET_RADIUS,
  POCKETS,
  BALL_COLORS,
} from "./types";
import { Bot, Play, RefreshCcw, Target } from "lucide-react";
import { useUserStore } from "../../stores/userStore";
import type { GameUIProps } from "../types";

export default function BilliardUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Billiard;
  const [state, setState] = useState<BilliardState>(game.getState());
  const { username: myUsername } = useUserStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store balls in a ref for 60fps drawing without React re-renders
  const ballsRef = useRef<Ball[]>(game.getState().balls);

  // Ripple animation for pocketed balls
  interface RippleEffect {
    x: number;
    y: number;
    color: string;
    startTime: number;
    duration: number;
  }
  const ripplesRef = useRef<RippleEffect[]>([]);
  const prevPocketedRef = useRef<Set<number>>(new Set());

  // Aim state
  const [isAiming, setIsAiming] = useState(false);
  const [aimAngle, setAimAngle] = useState(0);
  const [aimPower, setAimPower] = useState(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  // Canvas scale for responsive
  const [scale, setScale] = useState(1);

  const isMyTurn = game.isMyTurn();

  // Ref to store drawCanvas function for use in callbacks
  const drawCanvasRef = useRef<() => void>(() => {});

  // Ref to track if we're currently aiming (for document event listeners)
  const isAimingRef = useRef(false);
  isAimingRef.current = isAiming;
  const aimAngleRef = useRef(0);
  aimAngleRef.current = aimAngle;
  const aimPowerRef = useRef(0);
  aimPowerRef.current = aimPower;

  // Handle canvas resize - scale to fit container width
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 16; // padding
        const newScale = Math.min(1, containerWidth / TABLE_WIDTH);
        setScale(newScale);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Store refs for aim state to use in drawCanvas without stale closures
  const aimStateRef = useRef({ isAiming, aimAngle, aimPower, mousePos });
  aimStateRef.current = { isAiming, aimAngle, aimPower, mousePos };
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Draw a single ball with optional highlight
  const drawBall = useCallback(
    (ctx: CanvasRenderingContext2D, ball: Ball, highlightColor?: string) => {
      const color = BALL_COLORS[ball.id] || "#FFF";

      // Highlight glow effect (drawn first, behind the ball)
      if (highlightColor) {
        ctx.save();
        ctx.shadowColor = highlightColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = highlightColor;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Ball shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.arc(ball.x + 2, ball.y + 2, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Ball base
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Stripe pattern for striped balls
      if (ball.id >= 9 && ball.id <= 15) {
        // render white circle at center
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball number (except cue ball)
      if (ball.id !== 0) {
        ctx.fillStyle = ball.id >= 9 && ball.id <= 15 ? "black" : "white";
        ctx.font = `bold ${BALL_RADIUS}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ball.id.toString(), ball.x, ball.y);
      }

      // Highlight shine
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.arc(
        ball.x - BALL_RADIUS * 0.3,
        ball.y - BALL_RADIUS * 0.3,
        BALL_RADIUS * 0.3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    },
    []
  );

  // Draw the entire canvas - can be called at 60fps
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentScale = scaleRef.current;
    const {
      isAiming: aiming,
      aimAngle: angle,
      aimPower: power,
    } = aimStateRef.current;

    // Set canvas size
    canvas.width = TABLE_WIDTH * currentScale;
    canvas.height = TABLE_HEIGHT * currentScale;

    ctx.save();
    ctx.scale(currentScale, currentScale);

    // Clear and draw table
    ctx.fillStyle = "#1a472a";
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Draw table border
    ctx.strokeStyle = "#5d3a1a";
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, TABLE_WIDTH - 20, TABLE_HEIGHT - 20);

    // Draw pockets
    ctx.fillStyle = "#111";
    for (const pocket of POCKETS) {
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Get current game state for highlighting
    const currentState = game.getState();
    const mySlot = game.getMySlot();
    const canAct =
      mySlot === currentState.currentTurn &&
      currentState.gamePhase === "playing" &&
      !currentState.isSimulating;

    // Determine target ball type for highlighting
    const myBallType = mySlot ? currentState.players[mySlot].ballType : null;
    const allMyBallsPocketed =
      myBallType &&
      ballsRef.current.filter((b) => !b.pocketed && b.type === myBallType)
        .length === 0;

    // Draw balls from ref (updated at 60fps)
    for (const ball of ballsRef.current) {
      if (ball.pocketed) continue;

      let highlightColor: string | undefined;

      if (canAct) {
        // Highlight cue ball (white) when it's my turn
        if (ball.id === 0) {
          highlightColor = "#00ff88"; // Green glow for cue ball
        }
        // Only highlight target balls AFTER ball type is assigned
        else if (myBallType) {
          // If all my balls are pocketed, highlight the 8-ball
          if (allMyBallsPocketed && ball.id === 8) {
            highlightColor = "#ffcc00"; // Gold glow for 8-ball
          }
          // Otherwise highlight my ball type
          else if (ball.type === myBallType) {
            highlightColor = "#00aaff"; // Blue glow for target balls
          }
        }
        // Before ball type assigned - only cue ball glows (already handled above)
      }

      drawBall(ctx, ball, highlightColor);
    }

    // Draw aim line when aiming
    const cueBallForAim = ballsRef.current.find(
      (b) => b.id === 0 && !b.pocketed
    );
    if (aiming && cueBallForAim && power > 0) {
      const endX = cueBallForAim.x + Math.cos(angle) * power * 150;
      const endY = cueBallForAim.y + Math.sin(angle) * power * 150;

      // Power indicator gradient
      const gradient = ctx.createLinearGradient(
        cueBallForAim.x,
        cueBallForAim.y,
        endX,
        endY
      );
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
      gradient.addColorStop(1, "rgba(255, 100, 100, 0.8)");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(cueBallForAim.x, cueBallForAim.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw cue stick
      const stickLength = 200;
      const stickDistance = BALL_RADIUS + 5 + power * 50;
      const stickStartX = cueBallForAim.x - Math.cos(angle) * stickDistance;
      const stickStartY = cueBallForAim.y - Math.sin(angle) * stickDistance;
      const stickEndX = stickStartX - Math.cos(angle) * stickLength;
      const stickEndY = stickStartY - Math.sin(angle) * stickLength;

      ctx.strokeStyle = "#8B4513";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(stickStartX, stickStartY);
      ctx.lineTo(stickEndX, stickEndY);
      ctx.stroke();

      // Cue tip
      ctx.fillStyle = "#E6D5B8";
      ctx.beginPath();
      ctx.arc(stickStartX, stickStartY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw ripple effects for pocketed balls
    const now = performance.now();
    const activeRipples: RippleEffect[] = [];

    for (const ripple of ripplesRef.current) {
      const elapsed = now - ripple.startTime;
      const progress = elapsed / ripple.duration;

      if (progress < 1) {
        activeRipples.push(ripple);

        // Draw multiple concentric ripples
        for (let i = 0; i < 3; i++) {
          const rippleProgress = Math.max(0, progress - i * 0.15);
          if (rippleProgress > 0 && rippleProgress < 1) {
            const radius = POCKET_RADIUS + rippleProgress * 40;
            const alpha = (1 - rippleProgress) * 0.6;

            ctx.strokeStyle = ripple.color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 3 - rippleProgress * 2;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // Update ripples ref to only keep active ones
    ripplesRef.current = activeRipples;

    ctx.restore();
  }, [drawBall]);

  // Update ref so callbacks always have the latest draw function
  drawCanvasRef.current = drawCanvas;

  // Initial draw and redraw on state changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas, state, isAiming, aimAngle, aimPower, scale]);

  // Subscribe to game updates
  useEffect(() => {
    game.onUpdate((newState) => {
      setState(newState);
      ballsRef.current = newState.balls;
      drawCanvasRef.current();
    });

    // Subscribe to frame updates for smooth 60fps animation
    game.onFrame((balls) => {
      // Detect newly pocketed balls and create ripple effects
      const currentPocketed = new Set(
        balls.filter((b) => b.pocketed).map((b) => b.id)
      );

      for (const ball of balls) {
        if (ball.pocketed && !prevPocketedRef.current.has(ball.id)) {
          // Find which pocket this ball went into
          for (const pocket of POCKETS) {
            const dx = ball.x - pocket.x;
            const dy = ball.y - pocket.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < POCKET_RADIUS * 2) {
              // Create ripple at this pocket
              const color = BALL_COLORS[ball.id] || "#FFF";
              ripplesRef.current.push({
                x: pocket.x,
                y: pocket.y,
                color: color,
                startTime: performance.now(),
                duration: 2000, // 600ms ripple animation
              });
              break;
            }
          }
        }
      }

      prevPocketedRef.current = currentPocketed;
      ballsRef.current = balls;
      drawCanvasRef.current();
    });
  }, [game]);

  // Get coordinates from mouse/touch event
  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale]
  );

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn || state.isSimulating) return;

    const cueBallNow = ballsRef.current.find((b) => b.id === 0 && !b.pocketed);
    if (!cueBallNow) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const coords = getCanvasCoords(clientX, clientY);
    if (!coords) return;

    // Check if clicking near cue ball
    const dx = coords.x - cueBallNow.x;
    const dy = coords.y - cueBallNow.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < BALL_RADIUS * 5) {
      // More forgiving touch area
      e.preventDefault();
      setIsAiming(true);
      setMousePos(coords);
    }
  };

  // Calculate aim from coordinates
  const updateAim = useCallback(
    (clientX: number, clientY: number) => {
      const cueBallNow = ballsRef.current.find(
        (b) => b.id === 0 && !b.pocketed
      );
      if (!cueBallNow) return;

      const coords = getCanvasCoords(clientX, clientY);
      if (!coords) return;

      setMousePos(coords);

      // Calculate angle from cue ball to mouse (opposite direction for aiming)
      const angle =
        Math.atan2(coords.y - cueBallNow.y, coords.x - cueBallNow.x) + Math.PI;
      setAimAngle(angle);

      // Calculate power based on distance
      const dx = coords.x - cueBallNow.x;
      const dy = coords.y - cueBallNow.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const power = Math.min(1, dist / 200);
      setAimPower(power);
    },
    [getCanvasCoords]
  );

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isAiming) return;
    e.preventDefault();

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    updateAim(clientX, clientY);
  };

  const handleShoot = useCallback(() => {
    if (aimPowerRef.current > 0.05) {
      game.shoot(aimAngleRef.current, aimPowerRef.current);
    }
    setIsAiming(false);
    setAimPower(0);
    setMousePos(null);
  }, [game]);

  // Document-level event listeners for mouse/touch up (works even outside canvas)
  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isAimingRef.current) return;
      updateAim(e.clientX, e.clientY);
    };

    const handleDocumentMouseUp = () => {
      if (!isAimingRef.current) return;
      handleShoot();
    };

    const handleDocumentTouchMove = (e: TouchEvent) => {
      if (!isAimingRef.current) return;
      if (e.touches.length > 0) {
        updateAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleDocumentTouchEnd = () => {
      if (!isAimingRef.current) return;
      handleShoot();
    };

    document.addEventListener("mousemove", handleDocumentMouseMove);
    document.addEventListener("mouseup", handleDocumentMouseUp);
    document.addEventListener("touchmove", handleDocumentTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", handleDocumentTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
      document.removeEventListener("touchmove", handleDocumentTouchMove);
      document.removeEventListener("touchend", handleDocumentTouchEnd);
    };
  }, [updateAim, handleShoot]);

  const getPlayerName = (slot: 1 | 2): string => {
    const player = state.players[slot];
    if (!player.id) return "(waiting...)";
    if (player.id === "BOT") return "Bot 🤖";
    // Use stored username, or fallback to "You" for current user
    if (player.id === game["userId"]) return myUsername || "You";
    return player.username || "Player " + slot;
  };

  const getBallTypeLabel = (slot: 1 | 2): string => {
    const ballType = state.players[slot].ballType;
    if (!ballType) return "";
    return ballType === "solid" ? "(Solids 1-7)" : "(Stripes 9-15)";
  };

  return (
    <div
      className="flex flex-col items-center gap-4 p-4 w-full max-w-4xl mx-auto"
      ref={containerRef}
    >
      {/* Player List */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full max-w-[500px]">
        <h3 className="text-sm font-medium text-gray-400 mb-1">Players</h3>
        {([1, 2] as const).map((slot) => {
          const player = state.players[slot];
          const isCurrentTurn =
            state.currentTurn === slot && state.gamePhase === "playing";
          const isMe = player.id === game["userId"];
          const isBot = player.id === "BOT";

          return (
            <div
              key={slot}
              className={`
                flex items-center justify-between p-3 rounded-lg
                ${
                  isCurrentTurn
                    ? "bg-slate-600 ring-2 ring-blue-400"
                    : "bg-slate-700"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full ${
                    slot === 1 ? "bg-blue-500" : "bg-red-500"
                  }`}
                />
                <div>
                  <span className="text-white font-medium">
                    {getPlayerName(slot)}
                    {isMe && player.id && " (You)"}
                  </span>
                  <span className="text-gray-400 text-sm ml-2">
                    {getBallTypeLabel(slot)}
                  </span>
                </div>
              </div>
              {isBot && game.isHostUser && state.gamePhase === "waiting" && (
                <button
                  onClick={() => game.removeBot()}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                >
                  Remove
                </button>
              )}
              {!player.id &&
                game.isHostUser &&
                slot === 2 &&
                state.gamePhase === "waiting" && (
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

      {/* Start Game Button */}
      {state.gamePhase === "waiting" && game.isHostUser && (
        <div className="flex flex-col items-center gap-2">
          {game.canStartGame() ? (
            <button
              onClick={() => game.startGame()}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Start Game
            </button>
          ) : (
            <span className="text-sm text-slate-400">
              Waiting for opponent to join...
            </span>
          )}
        </div>
      )}

      {/* New Game Button - for host during play */}
      {state.gamePhase === "playing" &&
        game.isHostUser &&
        !state.isSimulating && (
          <button
            onClick={() => game.requestReset()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            New Game
          </button>
        )}

      {/* Waiting message for non-host */}
      {state.gamePhase === "waiting" && !game.isHostUser && (
        <div className="text-sm text-slate-400">
          Waiting for host to start the game...
        </div>
      )}

      {/* Turn Indicator */}
      {state.gamePhase === "playing" && !state.winner && (
        <div className="text-lg text-gray-400">
          {state.isSimulating ? (
            <span className="text-yellow-400">Balls in motion...</span>
          ) : isMyTurn ? (
            <span className="text-green-400 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Your turn! Click near the cue ball and drag to aim.
            </span>
          ) : (
            <span>Waiting for opponent...</span>
          )}
        </div>
      )}

      {/* Foul/Turn Message */}
      {state.turnMessage && (
        <div className="text-yellow-400 text-sm">{state.turnMessage}</div>
      )}

      {/* Billiard Table Canvas */}
      <div className="relative bg-slate-900 p-2 rounded-xl shadow-2xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={TABLE_WIDTH * scale}
          height={TABLE_HEIGHT * scale}
          className="rounded-lg cursor-crosshair block"
          style={{ touchAction: "none" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
        />
      </div>

      {/* Power Indicator */}
      {isAiming && (
        <div className="w-full max-w-xs">
          <div className="text-sm text-gray-400 mb-1">
            Power: {Math.round(aimPower * 100)}%
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-75"
              style={{
                width: `${aimPower * 100}%`,
                background: `linear-gradient(90deg, #22c55e, #eab308, #ef4444)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Winner display */}
      {state.winner && (
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400 mb-4">
            🏆 {getPlayerName(state.winner)} wins!
          </div>
          <button
            onClick={() => game.requestReset()}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2 mx-auto"
          >
            <RefreshCcw className="w-5 h-5" />
            Play Again
          </button>
        </div>
      )}

      {/* Ball Legend */}
      <div className="flex flex-wrap gap-2 justify-center text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-yellow-500" /> Solids (1-7)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full border-2 border-yellow-500 bg-white" />{" "}
          Stripes (9-15)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-black border border-gray-600" />{" "}
          8-Ball
        </span>
      </div>
    </div>
  );
}
