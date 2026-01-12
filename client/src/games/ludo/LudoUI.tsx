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

const COLORS = {
  red: "#ef444444",
  blue: "#3b82f644",
  green: "#22c55e44",
  yellow: "#eab30844",
  stroke: "#0002",
  base: "#fff1",
  cell: "#4b5563",
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
  const [tokenSelectPopup, setTokenSelectPopup] = useState<{
    tokens: { token: Token; color: PlayerColor; playerIndex: number }[];
    x: number;
    y: number;
  } | null>(null);
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

  const handleTokenClick = (
    tokenId: number,
    event: React.MouseEvent,
    token: Token,
    color: PlayerColor,
    playerIndex: number
  ) => {
    if (!isMyTurn) return;
    if (!state.hasRolled) return;
    if (rolling) return;
    if (!game.isTokenMovable(tokenId)) return;

    // Find all movable tokens at the same position
    const myPlayer = state.players[myIndex];
    if (!myPlayer) return;

    const tokensAtSamePosition = myPlayer.tokens.filter((t) => {
      if (!game.isTokenMovable(t.id)) return false;
      // Check if same position type and value
      if (t.position.type !== token.position.type) return false;
      if (t.position.type === "board" && token.position.type === "board") {
        return t.position.position === token.position.position;
      }
      if (t.position.type === "home" && token.position.type === "home") {
        return false; // All home tokens share the home base
      }
      if (t.position.type === "finish" && token.position.type === "finish") {
        return t.position.position === token.position.position;
      }
      return false;
    });

    if (tokensAtSamePosition.length > 1) {
      // Show popup to select which token to move
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      setTokenSelectPopup({
        tokens: tokensAtSamePosition.map((t) => ({
          token: t,
          color,
          playerIndex,
        })),
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    } else {
      // Only one token, move it directly
      setTokenSelectPopup(null);
      game.requestMoveToken(tokenId);
    }
  };

  const handleSelectToken = (tokenId: number) => {
    setTokenSelectPopup(null);
    game.requestMoveToken(tokenId);
  };

  // Calculate token screen positions (15x15 grid, each cell = 1 unit)
  const getTokenScreenPosition = (
    pos: TokenPosition,
    color: PlayerColor,
    tokenIndex: number
  ): { x: number; y: number } | null => {
    if (pos.type === "home") {
      // Home tokens in 4 corners, 2x2 grid inside the home base
      const homeOffsets: Record<PlayerColor, { x: number; y: number }> = {
        red: { x: 3, y: 3 }, // Top-left corner
        green: { x: 12, y: 3 }, // Top-right corner
        yellow: { x: 12, y: 12 }, // Bottom-right corner
        blue: { x: 3, y: 12 }, // Bottom-left corner
      };
      const base = homeOffsets[color];
      const offset = [
        { dx: -1, dy: -1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: 1 },
        { dx: 1, dy: 1 },
      ][tokenIndex];
      return { x: base.x + offset.dx, y: base.y + offset.dy };
    }

    if (pos.type === "board") {
      return getBoardPosition(pos.position);
    }

    if (pos.type === "finish") {
      // Finish lanes (home run) - 5 cells leading to center
      const finishPaths: Record<PlayerColor, { x: number; y: number }[]> = {
        red: [
          { x: 1.5, y: 7.5 },
          { x: 2.5, y: 7.5 },
          { x: 3.5, y: 7.5 },
          { x: 4.5, y: 7.5 },
          { x: 5.5, y: 7.5 },
        ],
        green: [
          { x: 7.5, y: 1.5 },
          { x: 7.5, y: 2.5 },
          { x: 7.5, y: 3.5 },
          { x: 7.5, y: 4.5 },
          { x: 7.5, y: 5.5 },
        ],
        yellow: [
          { x: 13.5, y: 7.5 },
          { x: 12.5, y: 7.5 },
          { x: 11.5, y: 7.5 },
          { x: 10.5, y: 7.5 },
          { x: 9.5, y: 7.5 },
        ],
        blue: [
          { x: 7.5, y: 13.5 },
          { x: 7.5, y: 12.5 },
          { x: 7.5, y: 11.5 },
          { x: 7.5, y: 10.5 },
          { x: 7.5, y: 9.5 },
        ],
      };
      return finishPaths[color][pos.position] || { x: 7.5, y: 7.5 };
    }

    if (pos.type === "finished") {
      return { x: 7.5, y: 7.5 }; // Center of board
    }

    return null;
  };

  // Get board position from index (0-51) on 15x15 grid
  // Standard Ludo clockwise path starting from Red's entry
  // SAFE_POSITIONS = [0, 8, 13, 21, 26, 34, 39, 47]
  const getBoardPosition = (index: number): { x: number; y: number } => {
    // 52-position path forming a closed clockwise loop on 15x15 grid
    const path: { x: number; y: number }[] = [
      // === RED START (position 0-12): Bottom of left arm, going up then right ===
      { x: 1.5, y: 6.5 }, // 0  - Red start (SAFE)
      { x: 2.5, y: 6.5 }, // 1
      { x: 3.5, y: 6.5 }, // 2
      { x: 4.5, y: 6.5 }, // 3
      { x: 5.5, y: 6.5 }, // 4
      { x: 6.5, y: 5.5 }, // 5  - Corner turn up
      { x: 6.5, y: 4.5 }, // 6
      { x: 6.5, y: 3.5 }, // 7
      { x: 6.5, y: 2.5 }, // 8  - SAFE
      { x: 6.5, y: 1.5 }, // 9
      { x: 6.5, y: 0.5 }, // 10
      { x: 7.5, y: 0.5 }, // 11 - Top center
      { x: 8.5, y: 0.5 }, // 12

      // === GREEN START (position 13-25): Left of top arm, going right then down ===
      { x: 8.5, y: 1.5 }, // 13 - Green start (SAFE)
      { x: 8.5, y: 2.5 }, // 14
      { x: 8.5, y: 3.5 }, // 15
      { x: 8.5, y: 4.5 }, // 16
      { x: 8.5, y: 5.5 }, // 17
      { x: 9.5, y: 6.5 }, // 18 - Corner turn right
      { x: 10.5, y: 6.5 }, // 19
      { x: 11.5, y: 6.5 }, // 20
      { x: 12.5, y: 6.5 }, // 21 - SAFE
      { x: 13.5, y: 6.5 }, // 22
      { x: 14.5, y: 6.5 }, // 23
      { x: 14.5, y: 7.5 }, // 24 - Right center
      { x: 14.5, y: 8.5 }, // 25

      // === YELLOW START (position 26-38): Top of right arm, going down then left ===
      { x: 13.5, y: 8.5 }, // 26 - Yellow start (SAFE)
      { x: 12.5, y: 8.5 }, // 27
      { x: 11.5, y: 8.5 }, // 28
      { x: 10.5, y: 8.5 }, // 29
      { x: 9.5, y: 8.5 }, // 30
      { x: 8.5, y: 9.5 }, // 31 - Corner turn down
      { x: 8.5, y: 10.5 }, // 32
      { x: 8.5, y: 11.5 }, // 33
      { x: 8.5, y: 12.5 }, // 34 - SAFE
      { x: 8.5, y: 13.5 }, // 35
      { x: 8.5, y: 14.5 }, // 36
      { x: 7.5, y: 14.5 }, // 37 - Bottom center
      { x: 6.5, y: 14.5 }, // 38

      // === BLUE START (position 39-51): Right of bottom arm, going left then up ===
      { x: 6.5, y: 13.5 }, // 39 - Blue start (SAFE)
      { x: 6.5, y: 12.5 }, // 40
      { x: 6.5, y: 11.5 }, // 41
      { x: 6.5, y: 10.5 }, // 42
      { x: 6.5, y: 9.5 }, // 43
      { x: 5.5, y: 8.5 }, // 44 - Corner turn left
      { x: 4.5, y: 8.5 }, // 45
      { x: 3.5, y: 8.5 }, // 46
      { x: 2.5, y: 8.5 }, // 47 - SAFE
      { x: 1.5, y: 8.5 }, // 48
      { x: 0.5, y: 8.5 }, // 49
      { x: 0.5, y: 7.5 }, // 50 - Left center
      { x: 0.5, y: 6.5 }, // 51 - Back near Red start
    ];

    return path[index % 52] || { x: 7.5, y: 7.5 };
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
          left: `${(pos.x / 15) * 100}%`,
          top: `${(pos.y / 15) * 100}%`,
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
        onClick={(e) =>
          isMovable && handleTokenClick(token.id, e, token, color, playerIndex)
        }
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
      <div className="flex flex-row items-center gap-2">
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

  // Get player name position on board - centered in each corner (15x15 grid)
  const getPlayerNamePosition = (
    color: PlayerColor
  ): { x: string; y: string } => {
    switch (color) {
      case "red":
        return { x: "20%", y: "3%" }; // Top-left corner
      case "green":
        return { x: "80%", y: "3%" }; // Top-right corner
      case "yellow":
        return { x: "80%", y: "97%" }; // Bottom-right corner
      case "blue":
        return { x: "20%", y: "97%" }; // Bottom-left corner
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-2xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />

      {/* Token Selection Popup */}
      {tokenSelectPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setTokenSelectPopup(null)}
        >
          <div
            className="bg-slate-800 rounded-lg p-4 shadow-xl border border-slate-600"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white text-sm mb-3 text-center">
              Select which token to move:
            </p>
            <div className="flex gap-2 justify-center">
              {tokenSelectPopup.tokens.map(({ token, color }) => {
                const colors = COLOR_CLASSES[color];
                return (
                  <button
                    key={token.id}
                    onClick={() => handleSelectToken(token.id)}
                    className={`
                      w-10 h-10 rounded-full border-2 border-white shadow-lg
                      ${colors.bg}
                      hover:scale-110 transition-transform
                      flex items-center justify-center
                    `}
                  >
                    <span className="text-white font-bold text-sm">
                      {token.id + 1}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-gray-400 text-xs mt-2 text-center">
              Click outside to cancel
            </p>
          </div>
        </div>
      )}
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
          {/* Render in board layout order: [Red, Green] top, [Blue, Yellow] bottom */}
          {[0, 1, 3, 2].map((index) => {
            const player = state.players[index];
            if (!player) return null;
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
      <div className="relative w-full max-w-[450px] aspect-square bg-slate-900 rounded-xl overflow-hidden shadow-2xl border-4 border-black">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 15 15">
          {/* Board background */}
          {/* <rect x="0" y="0" width="15" height="15" fill="black" /> */}

          {/* === HOME BASES (6x6 in corners) === */}
          {/* Red - Top Left */}
          <rect
            x="0"
            y="0"
            width="6"
            height="6"
            fill={COLORS.red}
            stroke={COLORS.stroke}
            strokeWidth="0.05"
          />
          <rect x="1" y="1" width="4" height="4" fill={COLORS.base} />
          <circle
            cx="2"
            cy="2"
            r="0.6"
            fill={COLORS.red}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="4"
            cy="2"
            r="0.6"
            fill={COLORS.red}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="2"
            cy="4"
            r="0.6"
            fill={COLORS.red}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="4"
            cy="4"
            r="0.6"
            fill={COLORS.red}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />

          {/* Green - Top Right */}
          <rect
            x="9"
            y="0"
            width="6"
            height="6"
            fill={COLORS.green}
            stroke={COLORS.stroke}
            strokeWidth="0.05"
          />
          <rect x="10" y="1" width="4" height="4" fill={COLORS.base} />
          <circle
            cx="11"
            cy="2"
            r="0.6"
            fill={COLORS.green}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="13"
            cy="2"
            r="0.6"
            fill={COLORS.green}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="11"
            cy="4"
            r="0.6"
            fill={COLORS.green}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="13"
            cy="4"
            r="0.6"
            fill={COLORS.green}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />

          {/* Yellow - Bottom Right */}
          <rect
            x="9"
            y="9"
            width="6"
            height="6"
            fill={COLORS.yellow}
            stroke={COLORS.stroke}
            strokeWidth="0.05"
          />
          <rect x="10" y="10" width="4" height="4" fill={COLORS.base} />
          <circle
            cx="11"
            cy="11"
            r="0.6"
            fill={COLORS.yellow}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="13"
            cy="11"
            r="0.6"
            fill={COLORS.yellow}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="11"
            cy="13"
            r="0.6"
            fill={COLORS.yellow}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="13"
            cy="13"
            r="0.6"
            fill={COLORS.yellow}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />

          {/* Blue - Bottom Left */}
          <rect
            x="0"
            y="9"
            width="6"
            height="6"
            fill={COLORS.blue}
            stroke={COLORS.stroke}
            strokeWidth="0.05"
          />
          <rect x="1" y="10" width="4" height="4" fill={COLORS.base} />
          <circle
            cx="2"
            cy="11"
            r="0.6"
            fill={COLORS.blue}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="4"
            cy="11"
            r="0.6"
            fill={COLORS.blue}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="2"
            cy="13"
            r="0.6"
            fill={COLORS.blue}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <circle
            cx="4"
            cy="13"
            r="0.6"
            fill={COLORS.blue}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />

          {/* === CROSS PATH CELLS === */}
          {/* Left arm (3 rows x 6 cols) */}
          {[0, 1, 2, 3, 4, 5].map((col) => (
            <g key={`left-${col}`}>
              <rect
                x={col}
                y={6}
                width="1"
                height="1"
                fill={col === 1 ? COLORS.red : COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={col}
                y={7}
                width="1"
                height="1"
                fill={col === 0 ? COLORS.cell : COLORS.red}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={col}
                y={8}
                width="1"
                height="1"
                fill={COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
            </g>
          ))}

          {/* Right arm (3 rows x 6 cols) */}
          {[0, 1, 2, 3, 4, 5].map((col) => (
            <g key={`right-${col}`}>
              <rect
                x={9 + col}
                y={6}
                width="1"
                height="1"
                fill={COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={9 + col}
                y={7}
                width="1"
                height="1"
                fill={col < 5 ? COLORS.yellow : COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={9 + col}
                y={8}
                width="1"
                height="1"
                fill={col === 4 ? COLORS.yellow : COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
            </g>
          ))}

          {/* Top arm (6 rows x 3 cols) */}
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <g key={`top-${row}`}>
              <rect
                x={6}
                y={row}
                width="1"
                height="1"
                fill={COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={7}
                y={row}
                width="1"
                height="1"
                fill={row > 0 ? COLORS.green : COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={8}
                y={row}
                width="1"
                height="1"
                fill={row === 1 ? COLORS.green : COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
            </g>
          ))}

          {/* Bottom arm (6 rows x 3 cols) */}
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <g key={`bottom-${row}`}>
              <rect
                x={6}
                y={9 + row}
                width="1"
                height="1"
                fill={row === 4 ? COLORS.blue : COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={7}
                y={9 + row}
                width="1"
                height="1"
                fill={row < 5 ? COLORS.blue : COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
              <rect
                x={8}
                y={9 + row}
                width="1"
                height="1"
                fill={COLORS.cell}
                stroke={COLORS.stroke}
                strokeWidth="0.02"
              />
            </g>
          ))}

          {/* === CENTER TRIANGLES === */}
          <polygon
            points="6,6 9,6 7.5,7.5"
            fill={COLORS.green}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <polygon
            points="9,6 9,9 7.5,7.5"
            fill={COLORS.yellow}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <polygon
            points="9,9 6,9 7.5,7.5"
            fill={COLORS.blue}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />
          <polygon
            points="6,9 6,6 7.5,7.5"
            fill={COLORS.red}
            stroke={COLORS.stroke}
            strokeWidth="0.03"
          />

          {/* === SAFE ZONE MARKERS (stars) === */}
          {SAFE_POSITIONS.map((pos, i) => {
            const gridPos = getBoardPosition(pos);
            return (
              <polygon
                key={i}
                points={starPoints(gridPos.x, gridPos.y, 0.35)}
                fill="#fbbf2455"
                strokeWidth="0.03"
                opacity="0.9"
              />
            );
          })}

          {/* Highlight current player's corner */}
          {state.gamePhase === "playing" &&
            (() => {
              const current = state.players[state.currentPlayerIndex];
              const positions: Record<PlayerColor, { x: number; y: number }> = {
                red: { x: 0, y: 0 },
                green: { x: 9, y: 0 },
                yellow: { x: 9, y: 9 },
                blue: { x: 0, y: 9 },
              };
              const pos = positions[current.color];
              return (
                <rect
                  x={pos.x}
                  y={pos.y}
                  width="6"
                  height="6"
                  // fill="none"
                  fill={COLOR_CLASSES[current.color].fill}
                  strokeWidth="0.15"
                  style={{ animation: "pulse-corner 1s ease-in-out infinite" }}
                />
              );
            })()}
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

const starPoints = (cx: number, cy: number, r: number): string => {
  const points: string[] = [];
  for (let j = 0; j < 10; j++) {
    const radius = j % 2 === 0 ? r : r * 0.4;
    const angle = Math.PI / 2 + (j * Math.PI) / 5;
    const x = cx + radius * Math.cos(angle);
    const y = cy - radius * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
};
