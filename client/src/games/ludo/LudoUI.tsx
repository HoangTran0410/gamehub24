import { useEffect, useState, useRef } from "react";
import Ludo from "./Ludo";
import type { LudoState, Token, PlayerColor, TokenPosition } from "./types";
import { SAFE_POSITIONS } from "./types";
import { Play, RefreshCw, Dices } from "lucide-react";
import { useAlertStore } from "../../stores/alertStore";

// Color mappings for CSS
const COLOR_CLASSES: Record<
  PlayerColor,
  { bg: string; light: string; ring: string; fill: string; text: string }
> = {
  red: {
    bg: "bg-red-500",
    light: "bg-red-200",
    ring: "ring-red-400",
    fill: "#ef4444",
    text: "text-red-500",
  },
  blue: {
    bg: "bg-blue-500",
    light: "bg-blue-200",
    ring: "ring-blue-400",
    fill: "#3b82f6",
    text: "text-blue-500",
  },
  green: {
    bg: "bg-green-500",
    light: "bg-green-200",
    ring: "ring-green-400",
    fill: "#22c55e",
    text: "text-green-500",
  },
  yellow: {
    bg: "bg-yellow-400",
    light: "bg-yellow-200",
    ring: "ring-yellow-400",
    fill: "#eab308",
    text: "text-yellow-500",
  },
};

// CSS animations
const animationStyles = `
@keyframes bounce-dice {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-20px) rotate(90deg); }
  50% { transform: translateY(-10px) rotate(180deg); }
  75% { transform: translateY(-15px) rotate(270deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 4px currentColor, 0 0 20px currentColor; }
  50% { opacity: 0.8; box-shadow: 0 0 0 6px currentColor, 0 0 30px currentColor; }
}

@keyframes pulse-corner {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
`;

interface LudoUIProps {
  game: Ludo;
  currentUserId: string;
}

export default function LudoUI({ game, currentUserId }: LudoUIProps) {
  const [state, setState] = useState<LudoState>(game.getState());
  const [rolling, setRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState<number>(1);
  const [showingResult, setShowingResult] = useState(false);
  const prevDiceValue = useRef<number | null>(null);
  const animationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  useEffect(() => {
    game.onUpdate((newState) => {
      // Detect when a new dice value comes in (someone rolled)
      const isNewRoll =
        newState.diceValue !== null &&
        newState.diceValue !== prevDiceValue.current;

      if (isNewRoll && !rolling) {
        // Capture the dice result for the closure
        const diceResult = newState.diceValue!;

        // Show rolling animation to all players
        setRolling(true);
        setShowingResult(false);

        // Clear any existing animation
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current);
        }

        // Animate dice rolling for 800ms then show result
        let count = 0;
        animationIntervalRef.current = setInterval(() => {
          setDisplayDice(Math.floor(Math.random() * 6) + 1);
          count++;
          if (count > 10) {
            if (animationIntervalRef.current) {
              clearInterval(animationIntervalRef.current);
              animationIntervalRef.current = null;
            }
            setDisplayDice(diceResult);
            setRolling(false);
            setShowingResult(true);

            // Hide result after 2 seconds
            setTimeout(() => setShowingResult(false), 2000);
          }
        }, 80);

        prevDiceValue.current = diceResult;
      } else if (newState.diceValue === null) {
        prevDiceValue.current = null;
      }

      setState(newState);
    });
    setState(game.getState());
    game.requestSync();

    // Cleanup on unmount
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, [game]);

  const myIndex = game.getMyPlayerIndex();
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const isHost = game.isHostUser;
  const canRoll =
    isMyTurn &&
    (!state.hasRolled || state.canRollAgain) &&
    !rolling &&
    !showingResult;

  // Compute movable tokens from React state so it updates reactively
  const hasMovableTokens =
    state.diceValue !== null &&
    state.players[state.currentPlayerIndex]?.tokens.some((token) => {
      if (token.position.type === "home") return state.diceValue === 6;
      if (token.position.type === "finished") return false;
      return true; // tokens on board or in finish lane can potentially move
    });

  const handleRollDice = () => {
    if (!canRoll) return;
    // Reset prevDiceValue so the next update triggers animation
    prevDiceValue.current = null;
    // Just request the roll, animation will happen when state updates
    game.requestRollDice();
  };

  const handleTokenClick = (tokenId: number) => {
    if (!isMyTurn) return;
    if (!state.hasRolled) return;
    if (rolling) return; // Don't allow moves during animation
    if (!game.isTokenMovable(tokenId)) return;
    game.requestMoveToken(tokenId);
  };

  // Calculate token screen positions
  const getTokenScreenPosition = (
    pos: TokenPosition,
    color: PlayerColor,
    tokenIndex: number
  ): { x: number; y: number } | null => {
    if (pos.type === "home") {
      // Home tokens centered in a 2x2 grid, positioned lower to not overlap name
      const homeOffsets: Record<PlayerColor, { x: number; y: number }> = {
        red: { x: 2.5, y: 2.5 },
        blue: { x: 10.5, y: 2.5 },
        green: { x: 10.5, y: 10.5 },
        yellow: { x: 2.5, y: 10.5 },
      };
      const base = homeOffsets[color];
      // Tighter 2x2 grid
      const offset = [
        { dx: -0.6, dy: -0.6 },
        { dx: 0.6, dy: -0.6 },
        { dx: -0.6, dy: 0.6 },
        { dx: 0.6, dy: 0.6 },
      ][tokenIndex];
      return { x: base.x + offset.dx, y: base.y + offset.dy };
    }

    if (pos.type === "board") {
      return getBoardPosition(pos.position);
    }

    if (pos.type === "finish") {
      const finishPaths: Record<PlayerColor, { x: number; y: number }[]> = {
        red: [
          { x: 1.5, y: 6.5 },
          { x: 2.5, y: 6.5 },
          { x: 3.5, y: 6.5 },
          { x: 4.5, y: 6.5 },
          { x: 5.5, y: 6.5 },
        ],
        blue: [
          { x: 6.5, y: 1.5 },
          { x: 6.5, y: 2.5 },
          { x: 6.5, y: 3.5 },
          { x: 6.5, y: 4.5 },
          { x: 6.5, y: 5.5 },
        ],
        green: [
          { x: 11.5, y: 6.5 },
          { x: 10.5, y: 6.5 },
          { x: 9.5, y: 6.5 },
          { x: 8.5, y: 6.5 },
          { x: 7.5, y: 6.5 },
        ],
        yellow: [
          { x: 6.5, y: 11.5 },
          { x: 6.5, y: 10.5 },
          { x: 6.5, y: 9.5 },
          { x: 6.5, y: 8.5 },
          { x: 6.5, y: 7.5 },
        ],
      };
      return finishPaths[color][pos.position] || { x: 6.5, y: 6.5 };
    }

    if (pos.type === "finished") {
      return { x: 6.5, y: 6.5 };
    }

    return null;
  };

  // Get board position from index (0-51)
  const getBoardPosition = (index: number): { x: number; y: number } => {
    const path: { x: number; y: number }[] = [
      // Red start area
      { x: 0.5, y: 6.5 },
      { x: 1.5, y: 5.5 },
      { x: 2.5, y: 5.5 },
      { x: 3.5, y: 5.5 },
      { x: 4.5, y: 5.5 },
      { x: 5.5, y: 5.5 },
      // Up to blue
      { x: 5.5, y: 4.5 },
      { x: 5.5, y: 3.5 },
      { x: 5.5, y: 2.5 },
      { x: 5.5, y: 1.5 },
      { x: 5.5, y: 0.5 },
      // Blue corner
      { x: 6.5, y: 0.5 },
      { x: 7.5, y: 0.5 },
      // Blue start going right
      { x: 7.5, y: 1.5 },
      { x: 7.5, y: 2.5 },
      { x: 7.5, y: 3.5 },
      { x: 7.5, y: 4.5 },
      { x: 7.5, y: 5.5 },
      // Right to green
      { x: 8.5, y: 5.5 },
      { x: 9.5, y: 5.5 },
      { x: 10.5, y: 5.5 },
      { x: 11.5, y: 5.5 },
      { x: 12.5, y: 5.5 },
      // Green corner
      { x: 12.5, y: 6.5 },
      { x: 12.5, y: 7.5 },
      // Green start going left
      { x: 11.5, y: 7.5 },
      { x: 10.5, y: 7.5 },
      { x: 9.5, y: 7.5 },
      { x: 8.5, y: 7.5 },
      { x: 7.5, y: 7.5 },
      // Down to yellow
      { x: 7.5, y: 8.5 },
      { x: 7.5, y: 9.5 },
      { x: 7.5, y: 10.5 },
      { x: 7.5, y: 11.5 },
      { x: 7.5, y: 12.5 },
      // Yellow corner
      { x: 6.5, y: 12.5 },
      { x: 5.5, y: 12.5 },
      // Yellow start going up
      { x: 5.5, y: 11.5 },
      { x: 5.5, y: 10.5 },
      { x: 5.5, y: 9.5 },
      { x: 5.5, y: 8.5 },
      { x: 5.5, y: 7.5 },
      // Left back to red
      { x: 4.5, y: 7.5 },
      { x: 3.5, y: 7.5 },
      { x: 2.5, y: 7.5 },
      { x: 1.5, y: 7.5 },
      { x: 0.5, y: 7.5 },
    ];
    return path[index % path.length] || { x: 6.5, y: 6.5 };
  };

  const renderToken = (
    token: Token,
    color: PlayerColor,
    playerIndex: number
  ) => {
    const pos = getTokenScreenPosition(token.position, color, token.id);
    if (!pos) return null;

    const isCurrentPlayer = state.currentPlayerIndex === playerIndex;
    const isMovable =
      !rolling &&
      isMyTurn &&
      playerIndex === myIndex &&
      state.hasRolled &&
      game.isTokenMovable(token.id);
    const colors = COLOR_CLASSES[color];

    return (
      <div
        key={`${color}-${token.id}`}
        className={`
          absolute w-6 h-6 rounded-full border-2 border-white shadow-lg z-10
          ${colors.bg}
          ${isMovable ? "cursor-pointer" : ""}
          ${isCurrentPlayer && !isMovable ? "opacity-90" : ""}
        `}
        style={{
          left: `${(pos.x / 13) * 100}%`,
          top: `${(pos.y / 13) * 100}%`,
          transform: isMovable
            ? "translate(-50%, -50%) scale(1.25)"
            : "translate(-50%, -50%)",
          transition:
            "left 0.5s ease-in-out, top 0.5s ease-in-out, transform 0.2s ease-in-out",
          boxShadow: isMovable
            ? `0 0 0 4px ${colors.fill}, 0 0 20px ${colors.fill}, 0 0 30px ${colors.fill}80`
            : undefined,
          zIndex: isMovable ? 20 : 10,
          animation: isMovable ? "pulse 1s ease-in-out infinite" : undefined,
        }}
        onClick={() => isMovable && handleTokenClick(token.id)}
      >
        <span className="flex items-center justify-center w-full h-full text-white text-xs font-bold drop-shadow-lg">
          {token.id + 1}
        </span>
      </div>
    );
  };

  const renderDice = () => {
    const dots: Record<number, string[]> = {
      1: ["center"],
      2: ["top-right", "bottom-left"],
      3: ["top-right", "center", "bottom-left"],
      4: ["top-left", "top-right", "bottom-left", "bottom-right"],
      5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
      6: [
        "top-left",
        "top-right",
        "middle-left",
        "middle-right",
        "bottom-left",
        "bottom-right",
      ],
    };

    const dotPositions: Record<string, string> = {
      "top-left": "top-1.5 left-1.5",
      "top-right": "top-1.5 right-1.5",
      "middle-left": "top-1/2 left-1.5 -translate-y-1/2",
      "middle-right": "top-1/2 right-1.5 -translate-y-1/2",
      center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
      "bottom-left": "bottom-1.5 left-1.5",
      "bottom-right": "bottom-1.5 right-1.5",
    };

    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className={`
            relative w-16 h-16 bg-white rounded-xl shadow-lg border-2 border-gray-300
            ${
              canRoll
                ? "cursor-pointer hover:shadow-xl hover:scale-105 transition-all"
                : ""
            }
          `}
          style={{
            animation: rolling
              ? "bounce-dice 0.3s ease-in-out infinite"
              : undefined,
          }}
          onClick={handleRollDice}
        >
          {(dots[displayDice] || []).map((pos, i) => (
            <div
              key={i}
              className={`absolute w-3 h-3 bg-gray-800 rounded-full ${dotPositions[pos]}`}
            />
          ))}
        </div>
        {state.diceValue !== null && !rolling && (
          <div className="text-2xl font-bold text-white bg-slate-700 px-3 py-1 rounded-lg">
            🎲 {state.diceValue}
          </div>
        )}
      </div>
    );
  };

  // Get player name position on board - centered in each corner
  const getPlayerNamePosition = (
    color: PlayerColor
  ): { x: string; y: string } => {
    switch (color) {
      case "red":
        return { x: "19.2%", y: "3%" }; // Center of red corner (0-5 grid = 2.5 center)
      case "blue":
        return { x: "80.8%", y: "3%" }; // Center of blue corner
      case "green":
        return { x: "80.8%", y: "97%" }; // Center of green corner
      case "yellow":
        return { x: "19.2%", y: "97%" }; // Center of yellow corner
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-2xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />

      {/* Turn & Dice Display */}
      {state.gamePhase === "playing" && (
        <div className="flex flex-col items-center gap-3">
          <div className="text-lg text-gray-400">
            {isMyTurn ? (
              <span className="text-green-400 font-semibold">Your turn!</span>
            ) : (
              <span>
                Waiting for{" "}
                <span
                  className={COLOR_CLASSES[currentPlayer?.color || "red"].text}
                >
                  {currentPlayer?.username}
                </span>
                ...
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {renderDice()}
            {canRoll && (
              <button
                onClick={handleRollDice}
                disabled={rolling}
                className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 font-semibold"
              >
                <Dices className="w-5 h-5" />
                {rolling
                  ? "Rolling..."
                  : state.canRollAgain
                  ? "Roll Again! 🎉"
                  : "Roll Dice"}
              </button>
            )}
          </div>
          {state.hasRolled &&
            !state.canRollAgain &&
            isMyTurn &&
            !rolling &&
            hasMovableTokens && (
              <span className="text-yellow-400 animate-pulse">
                👆 Click a highlighted token to move
              </span>
            )}
        </div>
      )}

      {/* Game Over */}
      {state.gamePhase === "ended" && (
        <div className="text-center p-4 bg-slate-800 rounded-lg">
          <h3 className="text-xl font-bold text-white mb-2">Game Over!</h3>
          <p className="text-gray-300">
            {state.winner === currentUserId
              ? "🎉 You won!"
              : `${
                  state.players.find((p) => p.id === state.winner)?.username
                } wins!`}
          </p>
        </div>
      )}

      {/* Player List for waiting phase */}
      {state.gamePhase === "waiting" && (
        <div className="grid grid-cols-2 gap-2 w-full max-w-md">
          {state.players.map((player, index) => {
            const colors = COLOR_CLASSES[player.color];
            return (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-700"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full ${colors.bg}`} />
                  <span className="text-sm text-white">
                    {player.id ? player.username : "(empty)"}
                    {player.isBot && " 🤖"}
                    {player.id === currentUserId && " (You)"}
                  </span>
                </div>
                {isHost &&
                  (player.isBot ? (
                    <button
                      onClick={() => game.requestRemoveBot(index)}
                      className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
                    >
                      ✕
                    </button>
                  ) : (
                    !player.id && (
                      <button
                        onClick={() => game.requestAddBot(index)}
                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded"
                      >
                        +Bot
                      </button>
                    )
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {state.gamePhase === "waiting" && isHost && game.canStartGame() && (
          <button
            onClick={() => game.requestStartGame()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" /> Start Game
          </button>
        )}
        {state.gamePhase === "ended" && (
          <button
            onClick={() => game.requestNewGame()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Play Again
          </button>
        )}
      </div>

      {/* Game Board */}
      <div className="relative w-full max-w-[450px] aspect-square bg-slate-900 rounded-xl overflow-hidden shadow-2xl border-4 border-slate-700">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 13 13">
          {/* Home bases with highlighting for current player */}
          {state.players.map((player, idx) => {
            const isCurrent =
              state.currentPlayerIndex === idx && state.gamePhase === "playing";
            const positions: Record<PlayerColor, { x: number; y: number }> = {
              red: { x: 0, y: 0 },
              blue: { x: 8, y: 0 },
              green: { x: 8, y: 8 },
              yellow: { x: 0, y: 8 },
            };
            const pos = positions[player.color];
            return (
              <g key={player.color}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width="5"
                  height="5"
                  fill={COLOR_CLASSES[player.color].fill}
                  opacity={isCurrent ? 0.5 : 0.25}
                  style={
                    isCurrent
                      ? { animation: "pulse-corner 1s ease-in-out infinite" }
                      : undefined
                  }
                />
                <rect
                  x={pos.x}
                  y={pos.y}
                  width="5"
                  height="5"
                  fill="none"
                  stroke={
                    isCurrent ? COLOR_CLASSES[player.color].fill : "transparent"
                  }
                  strokeWidth="0.15"
                />
              </g>
            );
          })}

          {/* Center finish area */}
          <rect
            x="5"
            y="5"
            width="3"
            height="3"
            fill="#374151"
            stroke="#4b5563"
            strokeWidth="0.05"
          />
          <polygon points="6.5,5.5 7.5,6.5 6.5,7.5 5.5,6.5" fill="#6b7280" />

          {/* Path grids - Horizontal lanes */}
          {/* Top path (Blue area) */}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={`top-${i}`}
              x={5 + i * 0.6}
              y="0"
              width="1"
              height="5"
              fill="none"
              stroke="#374151"
              strokeWidth="0.03"
            />
          ))}
          {/* Bottom path (Yellow area) */}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={`bot-${i}`}
              x={5 + i * 0.6}
              y="8"
              width="1"
              height="5"
              fill="none"
              stroke="#374151"
              strokeWidth="0.03"
            />
          ))}

          {/* Vertical paths */}
          <rect x="5" y="0" width="3" height="5" fill="#4b5563" />
          <rect x="5" y="8" width="3" height="5" fill="#4b5563" />
          <rect x="0" y="5" width="5" height="3" fill="#4b5563" />
          <rect x="8" y="5" width="5" height="3" fill="#4b5563" />

          {/* Grid lines for lanes */}
          {/* Top vertical lane */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line
              key={`tv-${i}`}
              x1="5"
              y1={i}
              x2="8"
              y2={i}
              stroke="#374151"
              strokeWidth="0.05"
            />
          ))}
          {/* Bottom vertical lane */}
          {[8, 9, 10, 11, 12, 13].map((i) => (
            <line
              key={`bv-${i}`}
              x1="5"
              y1={i}
              x2="8"
              y2={i}
              stroke="#374151"
              strokeWidth="0.05"
            />
          ))}
          {/* Left horizontal lane */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line
              key={`lh-${i}`}
              x1={i}
              y1="5"
              x2={i}
              y2="8"
              stroke="#374151"
              strokeWidth="0.05"
            />
          ))}
          {/* Right horizontal lane */}
          {[8, 9, 10, 11, 12, 13].map((i) => (
            <line
              key={`rh-${i}`}
              x1={i}
              y1="5"
              x2={i}
              y2="8"
              stroke="#374151"
              strokeWidth="0.05"
            />
          ))}

          {/* Finish lanes colored */}
          <rect x="1" y="6" width="4" height="1" fill="#ef4444" opacity="0.4" />
          <rect x="6" y="1" width="1" height="4" fill="#3b82f6" opacity="0.4" />
          <rect x="8" y="6" width="4" height="1" fill="#22c55e" opacity="0.4" />
          <rect x="6" y="8" width="1" height="4" fill="#eab308" opacity="0.4" />

          {/* Safe zone markers */}
          {SAFE_POSITIONS.map((pos, i) => {
            const gridPos = getBoardPosition(pos);
            return (
              <circle
                key={i}
                cx={gridPos.x}
                cy={gridPos.y}
                r="0.25"
                // purple
                fill="#8b5cf655"
              />
            );
          })}
        </svg>

        {/* Player names on board corners */}
        {state.players.map((player, idx) => {
          const namePos = getPlayerNamePosition(player.color);
          const isCurrent =
            state.currentPlayerIndex === idx && state.gamePhase === "playing";
          const colors = COLOR_CLASSES[player.color];

          return (
            <div
              key={`name-${player.color}`}
              className={`
                absolute px-2 py-0.5 rounded text-xs font-bold
                ${
                  isCurrent
                    ? `${colors.bg} text-white`
                    : "bg-black/50 " + colors.text
                }
                ${isCurrent ? "animate-pulse" : ""}
              `}
              style={{
                left: namePos.x,
                top: namePos.y,
                transform: `translate(-50%, ${
                  namePos.y === "97%" ? "-100%" : "0"
                })`,
              }}
            >
              {player.id ? player.username : "(empty)"}
              {player.isBot && " 🤖"}
            </div>
          );
        })}

        {/* Tokens */}
        {state.players.map(
          (player, playerIndex) =>
            player.id &&
            player.tokens.map((token) =>
              renderToken(token, player.color, playerIndex)
            )
        )}
      </div>

      {state.gamePhase === "playing" && isHost && (
        <button
          onClick={async () => {
            const confirmed = await useAlertStore
              .getState()
              .confirm(
                "Are you sure you want to reset the game? All progress will be lost.",
                "New Game"
              );
            if (confirmed) {
              game.requestNewGame();
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> New Game
        </button>
      )}
    </div>
  );
}
