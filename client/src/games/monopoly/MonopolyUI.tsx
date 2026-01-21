import { useEffect, useState, useRef } from "react";
import Monopoly from "./Monopoly";
import {
  type MonopolyState,
  type BoardSpace,
  type PropertyColor,
  type GameLog,
  type OwnedProperty,
  BOARD_SPACES,
  PROPERTY_COLORS,
  CHANCE_CARDS,
  CHEST_CARDS,
} from "./types";
import {
  Play,
  RotateCcw,
  RefreshCw,
  Dices,
  Home,
  DollarSign,
  Lock,
  BookOpen,
  X,
} from "lucide-react";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { useAlertStore } from "../../stores/alertStore";

// Property color display
const getPropertyColorStyle = (color?: PropertyColor): string => {
  if (!color) return "";
  return PROPERTY_COLORS[color] || "";
};

// CSS Animations
const animationStyles = `
@keyframes bounce-dice {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-15px) rotate(90deg); }
  50% { transform: translateY(-8px) rotate(180deg); }
  75% { transform: translateY(-12px) rotate(270deg); }
}

@keyframes pulse-token {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 currentColor; }
  50% { transform: scale(1.3); box-shadow: 0 0 12px 4px currentColor; }
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 5px 2px currentColor; }
  50% { box-shadow: 0 0 15px 5px currentColor; }
}

@keyframes slide-in {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes token-move {
  0% { transform: scale(1); }
  50% { transform: scale(1.5) translateY(-5px); }
  100% { transform: scale(1); }
}
`;

export default function MonopolyUI({
  game: baseGame,
  currentUserId,
}: GameUIProps) {
  const game = baseGame as Monopoly;
  const { confirm: showConfirm } = useAlertStore();
  const [state, setState] = useState<MonopolyState>(game.getState());
  const [historyLogs, setHistoryLogs] = useState<GameLog[]>(
    game.getState().logs || [],
  );
  const { ti, ts } = useLanguage();
  const [rolling, setRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState<[number, number]>(
    game.getState().diceValues || [1, 1],
  );
  const [selectedProperty, setSelectedProperty] = useState<BoardSpace | null>(
    null,
  );
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [dismissedOffers, setDismissedOffers] = useState<string[]>([]);
  const [decliningOfferId, setDecliningOfferId] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState<
    Record<string, boolean>
  >({});
  const [tradePlayerId, setTradePlayerId] = useState<string | null>(null);

  // Hover state for visual connection
  const [hoveredPropertyId, setHoveredPropertyId] = useState<number | null>(
    null,
  );

  const [lineCoords, setLineCoords] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Update line coordinates when hovered item changes or property is selected
  useEffect(() => {
    let rafId: number;
    const updateCoords = () => {
      // Prioritize selected property (modal), then hovered property
      const targetId = selectedProperty
        ? selectedProperty.id
        : hoveredPropertyId;
      const sourceId = selectedProperty
        ? "monopoly-property-detail-modal"
        : `monopoly-property-item-${targetId}`;

      if (targetId === null || !gameContainerRef.current) {
        setLineCoords(null);
        return;
      }

      const boardEl = document.getElementById(
        `monopoly-board-space-${targetId}`,
      );
      const sourceEl = document.getElementById(sourceId);
      const containerEl = gameContainerRef.current;

      if (boardEl && sourceEl && containerEl) {
        const boardRect = boardEl.getBoundingClientRect();
        const sourceRect = sourceEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();

        setLineCoords({
          x1: sourceRect.left - containerRect.left + sourceRect.width / 2,
          y1: sourceRect.top - containerRect.top + sourceRect.height / 2,
          x2: boardRect.left - containerRect.left + boardRect.width / 2,
          y2: boardRect.top - containerRect.top + boardRect.height / 2,
        });
        rafId = requestAnimationFrame(updateCoords);
      } else {
        setLineCoords(null);
      }
    };

    if (hoveredPropertyId !== null || selectedProperty !== null) {
      updateCoords();
    } else {
      setLineCoords(null);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [hoveredPropertyId, selectedProperty]);

  const isRollingRef = useRef(false);
  const lastDiceRef = useRef<number[] | undefined>(game.getState().diceValues);
  // Track latest state to prevent stale closures during animation
  const latestStateRef = useRef<MonopolyState>(game.getState());

  // Cache player positions to handle mutated state delay
  const lastPositionsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    // Init positions cache
    const initialPos: Record<string, number> = {};
    game.getState().players.forEach((p) => {
      if (p.id) initialPos[p.id] = p.position;
    });
    lastPositionsRef.current = initialPos;
    latestStateRef.current = game.getState();

    return game.onUpdate((newState) => {
      latestStateRef.current = newState;

      // Detect new dice roll by comparing with last known dice values
      const newDice = newState.diceValues;
      const isNewRoll =
        newDice &&
        (!lastDiceRef.current ||
          newDice[0] !== lastDiceRef.current[0] ||
          newDice[1] !== lastDiceRef.current[1]);

      if (isNewRoll && !isRollingRef.current) {
        // Start animation sequence
        isRollingRef.current = true;
        lastDiceRef.current = newDice;
        setRolling(true);

        let count = 0;
        const interval = setInterval(() => {
          setDisplayDice([
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
          ]);
          count++;
          if (count > 8) {
            clearInterval(interval);
            // Use LATEST state from ref to avoid stale closure (e.g. if player moved during animation)
            const finalState = latestStateRef.current;

            setDisplayDice(finalState.diceValues || newDice); // Fallback to current roll if nulled (unlikely)
            setRolling(false);
            isRollingRef.current = false;

            // UPDATE STATE ONLY AFTER ANIMATION FINISHES
            setState(finalState);

            // Update cache after animation
            const posMap: Record<string, number> = {};
            finalState.players.forEach((p) => {
              if (p.id) posMap[p.id] = p.position;
            });
            lastPositionsRef.current = posMap;
          }
        }, 80);
        return;
      }

      // If not rolling, update immediately
      if (!isRollingRef.current) {
        setState(newState);
        // Sync displayDice if needed (e.g. valid dice but missed animation or initial load)
        if (newState.diceValues) {
          setDisplayDice(newState.diceValues);
        }

        // Important: Reset lastDiceRef if new dice is null (end of turn)
        // or update it if it's a re-load/sync without animation
        lastDiceRef.current = newState.diceValues || undefined;

        // Update positions cache
        const posMap: Record<string, number> = {};
        newState.players.forEach((p) => {
          if (p.id) posMap[p.id] = p.position;
        });
        lastPositionsRef.current = posMap;
      }

      // Update local history logs (accumulate unique logs)
      setHistoryLogs((prevLogs) => {
        const newLogs = newState.logs || [];
        // Detect reset: if newLogs are empty but we had logs before
        if (newLogs.length === 0 && prevLogs.length > 0) {
          return [];
        }
        const existingIds = new Set(prevLogs.map((l) => l.id));
        const uniqueNewLogs = newLogs.filter((l) => !existingIds.has(l.id));
        if (uniqueNewLogs.length === 0) return prevLogs;
        // If logs were reset (e.g. game restart), handle gracefully (though line 247 handles it)
        return [...prevLogs, ...uniqueNewLogs];
      });
    });
  }, [game]);

  const myIndex = game.getMyPlayerIndex();
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const isHost = game.isHost;

  const canRoll =
    isMyTurn &&
    (!state.hasRolled || state.canRollAgain) &&
    !state.pendingAction &&
    !rolling;

  // Get board space position for display (11x11 grid)
  const getSpacePosition = (
    index: number,
  ): { row: number; col: number; rotation: number } => {
    if (index >= 0 && index <= 10) {
      // Bottom row (left to right)
      return { row: 10, col: 10 - index, rotation: 0 };
    } else if (index >= 11 && index <= 19) {
      // Left column (bottom to top)
      return { row: 10 - (index - 10), col: 0, rotation: 90 };
    } else if (index >= 20 && index <= 30) {
      // Top row (left to right)
      return { row: 0, col: index - 20, rotation: 180 };
    } else {
      // Right column (top to bottom)
      return { row: index - 30, col: 10, rotation: 270 };
    }
  };

  const renderDice = (value: number, size: string = "w-12 h-12") => {
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
      "top-left": "top-1 left-1",
      "top-right": "top-1 right-1",
      "middle-left": "top-1/2 left-1 -translate-y-1/2",
      "middle-right": "top-1/2 right-1 -translate-y-1/2",
      center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
      "bottom-left": "bottom-1 left-1",
      "bottom-right": "bottom-1 right-1",
    };

    return (
      <div
        className={`relative ${size} bg-white rounded-lg shadow-lg border-2 border-gray-300`}
        style={{
          animation: rolling
            ? "bounce-dice 0.3s ease-in-out infinite"
            : undefined,
        }}
      >
        {(dots[value] || []).map((pos, i) => (
          <div
            key={i}
            className={`absolute w-2 h-2 bg-gray-800 rounded-full ${dotPositions[pos]}`}
          />
        ))}
      </div>
    );
  };

  const renderBoardSpace = (space: BoardSpace) => {
    const pos = getSpacePosition(space.id);
    // const isCorner = [0, 10, 20, 30].includes(space.id);
    const ownership = state.properties.find((p) => p.spaceId === space.id);
    const owner = ownership
      ? state.players.find((p) => p.id === ownership.ownerId)
      : null;

    return (
      <div
        key={space.id}
        id={`monopoly-board-space-${space.id}`}
        className={`relative flex flex-col overflow-hidden cursor-pointer transition-all duration-300 ${
          space.id === hoveredPropertyId || space.id === selectedProperty?.id
            ? "z-49 scale-110 ring-4 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] bg-slate-600"
            : "bg-slate-700 border border-slate-600 hover:bg-slate-600"
        }`}
        style={{
          gridRow: pos.row + 1,
          gridColumn: pos.col + 1,
          aspectRatio: 1,
          //  isCorner
          //   ? "1"
          //   : pos.rotation === 0 || pos.rotation === 180
          //   ? "0.75"
          //   : "1.33",
        }}
        onClick={() => setSelectedProperty(space)}
      >
        {/* Property color bar */}
        {space.type === "property" && space.color && (
          <div
            className="w-full h-[15%] min-h-[2px] shrink-0"
            style={{ backgroundColor: getPropertyColorStyle(space.color) }}
          />
        )}

        {/* Space name */}
        <div className="flex-1 flex items-center justify-center p-0.5 overflow-hidden">
          <span className="text-[5px] md:text-[8px] text-white text-center leading-tight line-clamp-2 font-medium">
            {ti(space.name || space.name)}
          </span>
        </div>

        {/* Houses/Hotel indicator */}
        {ownership && ownership.houses > 0 && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-px md:gap-0.5 p-px md:p-0.5">
            {ownership.houses === 5 ? (
              <div
                className="w-2 h-1.5 md:w-3 md:h-2 bg-red-500 rounded-sm"
                title="Hotel"
              >
                {/* 🏨 */}
              </div>
            ) : (
              Array.from({ length: ownership.houses }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-1 md:w-1.5 md:h-1.5 bg-green-500 rounded-sm"
                  title="House"
                >
                  {/* 🏠 */}
                </div>
              ))
            )}
          </div>
        )}

        {/* Owner indicator */}
        {owner && (
          <div
            className="absolute top-0 right-0 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full border border-white"
            style={{ backgroundColor: owner.color }}
            title={owner.username}
          />
        )}

        {/* Mortgaged indicator */}
        {ownership?.mortgaged && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Lock className="w-2 h-2 md:w-3 md:h-3 text-white" />
          </div>
        )}
      </div>
    );
  };

  const renderPropertyList = (properties: OwnedProperty[]) => {
    if (properties.length === 0) {
      return (
        <p className="text-gray-400 text-xs italic pl-1">
          {ti({ en: "No properties", vi: "Chưa có tài sản" })}
        </p>
      );
    }

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {properties.map((prop) => {
          const space = BOARD_SPACES[prop.spaceId];
          if (!space) return null;
          return (
            <div
              key={prop.spaceId}
              id={`monopoly-property-item-${space.id}`}
              onMouseEnter={() => setHoveredPropertyId(space.id)}
              onMouseLeave={() => setHoveredPropertyId(null)}
              className={`flex items-center gap-1.5 text-[10px] font-medium text-white px-2 py-1 rounded-md cursor-pointer transition-colors border border-slate-600/50 shadow-sm ${
                hoveredPropertyId === space.id
                  ? "bg-slate-600 ring-2 ring-yellow-400"
                  : "bg-slate-800/80 hover:bg-slate-700"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProperty(space);
              }}
            >
              <div
                className="w-2 h-2 rounded-full shadow-sm"
                style={{
                  backgroundColor:
                    space.type === "property" && space.color
                      ? getPropertyColorStyle(space.color)
                      : "#666",
                }}
              />
              <span className="truncate max-w-[80px]">{ti(space.name)}</span>
              {prop.houses > 0 && (
                <span className="text-yellow-400 text-[9px] ml-0.5">
                  {prop.houses === 5 ? "🏨" : `🏠${prop.houses}`}
                </span>
              )}

              {prop.mortgaged && (
                <Lock className="w-2.5 h-2.5 text-red-400 ml-0.5" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const RenderSparkline = ({
    data,
    color,
    width = 100,
    height = 30,
  }: {
    data: number[];
    color: string;
    width?: number;
    height?: number;
  }) => {
    if (!data || data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Prevent division by zero

    // Use a small padding so points aren't cut off
    const padding = 2;
    // Internal coordinate system
    const effectiveHeight = height - padding * 2;
    const effectiveWidth = width;

    // Calculate points based on internal width/height (0-100 default)
    const points = data
      .map((val, i) => {
        const x = (i / (data.length - 1)) * effectiveWidth;
        const y = height - padding - ((val - min) / range) * effectiveHeight;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible mt-1"
      >
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Draw dots at start and end */}
        {/* <circle
          cx="0"
          cy={height - padding - ((data[0] - min) / range) * effectiveHeight}
          r="2"
          fill={color}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={effectiveWidth}
          cy={
            height -
            padding -
            ((data[data.length - 1] - min) / range) * effectiveHeight
          }
          r="2"
          fill={color}
          vectorEffect="non-scaling-stroke"
        /> */}
      </svg>
    );
  };

  const renderPlayerPanel = () => (
    <div className="bg-slate-800 rounded-lg p-3 w-full">
      <h3 className="text-white font-bold mb-2 text-sm">
        {ti({ en: "Players", vi: "Người chơi" })}
      </h3>
      <div className="space-y-2">
        {state.players.map((player, index) => {
          if (!player.id) return null;
          const isActive = state.currentPlayerIndex === index;
          const myProps = state.properties.filter(
            (p) => p.ownerId === player.id,
          );
          const isExpanded = expandedPlayerId[player.id || ""];

          return (
            <div
              key={index}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? "bg-slate-600 ring-2 ring-yellow-400"
                  : "bg-slate-700 hover:bg-slate-600"
              }
                ${player.isBankrupt ? "opacity-50" : ""}`}
              onClick={() =>
                setExpandedPlayerId((prev) => ({
                  ...prev,
                  [player.id || ""]: !isExpanded,
                }))
              }
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-4 h-4 rounded-full border-2 border-white"
                  style={{ backgroundColor: player.color }}
                />
                <span className="text-white text-sm font-medium flex-1 truncate text-left">
                  {player.username}
                  {player.isBot && " 🤖"}
                  {player.id === currentUserId &&
                    ti({ en: " (You)", vi: " (Bạn)" })}
                </span>
                {player.inJail && (
                  <span className="text-xs">
                    🔒 {ti({ en: "in jail", vi: "trong tù" })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <DollarSign className="w-3 h-3" />
                <span className="font-mono">
                  {player.money.toLocaleString()}
                </span>
                <Home className="w-3 h-3 ml-2" />
                <span>{myProps.length}</span>
              </div>

              {/* Money History Chart */}
              <div className="h-8 w-full opacity-70 hover:opacity-100 transition-opacity mt-1">
                {player.moneyHistory && (
                  <RenderSparkline
                    data={player.moneyHistory}
                    color={player.color}
                    height={30}
                  />
                )}
              </div>

              {/* Property List */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-slate-500">
                  {renderPropertyList(myProps)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderBankruptcyWarning = () => {
    if (!state.pendingAction) return null;

    let requiredAmount = 0;
    if (state.pendingAction.type === "BUY_DECISION") {
      const s = BOARD_SPACES[state.pendingAction.spaceId];
      if (
        s &&
        (s.type === "property" || s.type === "railroad" || s.type === "utility")
      ) {
        requiredAmount = s.price;
      }
    } else if (
      state.pendingAction.type === "PAY_RENT" ||
      state.pendingAction.type === "PAY_TAX"
    ) {
      requiredAmount = state.pendingAction.amount;
    }

    if (requiredAmount > (currentPlayer?.money || 0)) {
      return (
        <div className="bg-red-900/50 border border-red-500 rounded p-2 mb-3 flex items-center gap-2">
          <span className="text-xl">⚠️</span>
          <p className="text-red-200 text-xs text-left">
            <strong className="block text-red-100">
              {ti({
                en: "Insufficient Funds!",
                vi: "Không đủ tiền!",
              })}
            </strong>
            {ti({
              en: "Proceeding will result in BANKRUPTCY and LOSS.",
              vi: "Thực hiện hành động này sẽ dẫn đến PHÁ SẢN và THUA.",
            })}
            <br />
            {ti({
              en: "Sell or mortgage assets to get money.",
              vi: "Hãy bán hoặc thế chấp tài sản để có tiền.",
            })}
          </p>
        </div>
      );
    }
    return null;
  };

  const renderGameControls = () => {
    if (state.gamePhase === "waiting") {
      return (
        <div className="flex flex-col items-center gap-4 p-4 bg-slate-800 rounded-lg">
          <h3 className="text-white font-bold">
            {ti({ en: "Waiting for players...", vi: "Đang chờ người chơi..." })}
          </h3>
          <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
            {state.players.map((player, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded bg-slate-700"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="text-white text-sm">
                    {player.id
                      ? player.username
                      : ti({ en: "(empty)", vi: "(trống)" })}
                    {player.isBot && " 🤖"}
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
            ))}
          </div>
          {isHost && game.canStartGame() && (
            <button
              onClick={() => game.requestStartGame()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />{" "}
              {ti({ en: "Start Game", vi: "Bắt đầu" })}
            </button>
          )}
        </div>
      );
    }

    if (state.gamePhase === "ended") {
      const winner = state.players.find((p) => p.id === state.winner);
      return (
        <div className="flex flex-col items-center gap-4 p-4 bg-slate-800 rounded-lg">
          <h3 className="text-2xl font-bold text-yellow-400">
            🎉 {ti({ en: "Game Over!", vi: "Kết thúc!" })}
          </h3>
          <p className="text-white">
            {winner?.id === currentUserId
              ? ti({ en: "You won!", vi: "Bạn thắng!" })
              : `${winner?.username} ${ti({ en: "wins!", vi: "thắng!" })}`}
          </p>
          {isHost && (
            <button
              onClick={() => game.requestResetGame()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />{" "}
              {ti({ en: "Play Again", vi: "Chơi lại" })}
            </button>
          )}
        </div>
      );
    }

    // Playing phase
    return (
      <div className="flex flex-col items-center gap-3 p-4 bg-slate-800 rounded-lg w-full max-w-md">
        {/* Turn indicator */}
        <div className="text-white text-center">
          {isMyTurn ? (
            <span className="text-green-400 font-bold text-lg">
              {ti({ en: "Your turn!", vi: "Lượt của bạn!" })}
            </span>
          ) : (
            <span className="text-gray-300">
              {ti({ en: "Waiting for", vi: "Đang chờ" })}{" "}
              <span style={{ color: currentPlayer?.color }}>
                {currentPlayer?.username}
              </span>
              ...
            </span>
          )}
        </div>

        {/* Dice display */}
        {(state.diceValues || rolling) && (
          <div className="flex items-center gap-3">
            {renderDice(displayDice[0])}
            {renderDice(displayDice[1])}
            <span className="text-white text-xl font-bold ml-2">
              = {displayDice[0] + displayDice[1]}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 justify-center">
          {canRoll && (
            <button
              onClick={() => game.requestRollDice()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-semibold"
            >
              <Dices className="w-5 h-5" />
              {state.canRollAgain
                ? ti({ en: "Roll Again! 🎉", vi: "Đổ tiếp! 🎉" })
                : ti({ en: "Roll Dice", vi: "Đổ xí ngầu" })}
            </button>
          )}

          {isMyTurn && currentPlayer?.inJail && !state.hasRolled && (
            <button
              onClick={() => game.requestPayJailFine()}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
            >
              {ti({
                en: `Pay ${500}đ to Leave Jail`,
                vi: `Trả ${500}đ để ra tù`,
              })}
            </button>
          )}

          {isMyTurn &&
            state.hasRolled &&
            !state.canRollAgain &&
            !state.pendingAction &&
            !rolling && (
              <button
                onClick={() => game.requestEndTurn()}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                {ti({ en: "End Turn", vi: "Kết thúc lượt" })}
              </button>
            )}
        </div>

        {/* Pending action modal */}
        {state.pendingAction && isMyTurn && (
          <div className="w-full p-3 bg-slate-700 rounded-lg animate-slide-in">
            {/* Bankruptcy Warning */}
            {renderBankruptcyWarning()}
            {state.pendingAction.type === "BUY_DECISION" && (
              <div className="flex flex-col gap-2">
                <p className="text-white text-center">
                  {ti({ en: "Buy", vi: "Mua" })}{" "}
                  {ti(BOARD_SPACES[state.pendingAction.spaceId]?.name)}{" "}
                  {ti({ en: "for", vi: "giá" })}{" "}
                  {(() => {
                    const s = BOARD_SPACES[state.pendingAction.spaceId];
                    if (
                      s &&
                      (s.type === "property" ||
                        s.type === "railroad" ||
                        s.type === "utility") &&
                      s.price
                    ) {
                      return s.price.toLocaleString();
                    }
                    return "";
                  })()}
                  đ?
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => {
                      if (state.pendingAction?.type === "BUY_DECISION") {
                        game.requestBuyProperty(state.pendingAction.spaceId);
                      }
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg"
                  >
                    {ti({ en: "Buy", vi: "Mua" })}
                  </button>
                  <button
                    onClick={() => game.requestDeclineProperty()}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg"
                  >
                    {ti({ en: "Decline", vi: "Bỏ qua" })}
                  </button>
                </div>
              </div>
            )}

            {state.pendingAction.type === "PAY_RENT" && (
              <div className="flex flex-col gap-2">
                <p className="text-white text-center">
                  {ti({ en: "Pay", vi: "Trả" })}{" "}
                  {state.pendingAction.amount.toLocaleString()}đ{" "}
                  {ti({ en: "rent", vi: "tiền thuê" })}
                </p>
                <button
                  onClick={() => game.requestPayRent()}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg mx-auto"
                >
                  {ti({ en: "Pay Rent", vi: "Trả tiền thuê" })}
                </button>
              </div>
            )}

            {state.pendingAction.type === "PAY_TAX" && (
              <div className="flex flex-col gap-2">
                <p className="text-white text-center">
                  {ti({ en: "Pay", vi: "Trả" })}{" "}
                  {state.pendingAction.amount.toLocaleString()}đ{" "}
                  {ti({ en: "tax", vi: "thuế" })}
                </p>
                <button
                  onClick={() => game.requestPayTax()}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg mx-auto"
                >
                  {ti({ en: "Pay Tax", vi: "Trả thuế" })}
                </button>
              </div>
            )}

            {state.pendingAction.type === "CARD" && (
              <div className="flex flex-col gap-2">
                <p className="text-white text-center font-medium">
                  {ti(state.pendingAction.card.text)}
                </p>
                <button
                  onClick={() => game.requestUseCard()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg mx-auto"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        )}

        {/* Last action */}
        {state.lastAction && (
          <p className="text-gray-400 text-sm text-center">
            {ti(state.lastAction)}
          </p>
        )}

        {isHost && (
          <button
            onClick={async () => {
              if (
                await showConfirm(
                  ts({
                    en: "Start a new game? Current progress will be lost.",
                    vi: "Bắt đầu ván mới? Tiến trình hiện tại sẽ bị mất.",
                  }),
                  ts({ en: "New Game", vi: "Ván mới" }),
                )
              ) {
                game.requestResetGame();
              }
            }}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors flex items-center gap-2"
            title={ti({ en: "New Game", vi: "Ván mới" }) as string}
          >
            <RotateCcw className="w-4 h-4" />{" "}
          </button>
        )}
      </div>
    );
  };

  const renderPropertyDetail = () => {
    if (!selectedProperty) return null;

    const ownership = state.properties.find(
      (p) => p.spaceId === selectedProperty.id,
    );
    const owner = ownership
      ? state.players.find((p) => p.id === ownership.ownerId)
      : null;
    const isMyProperty = ownership?.ownerId === currentUserId;

    const utilitiesCount = state.properties.filter(
      (p) =>
        p.ownerId === currentUserId &&
        BOARD_SPACES[p.spaceId].type === "utility",
    ).length;
    const railwaysCount = state.properties.filter(
      (p) =>
        p.ownerId === currentUserId &&
        BOARD_SPACES[p.spaceId].type === "railroad",
    ).length;

    return (
      <div
        className="fixed inset-0 z-50 flex md:items-center items-start justify-start bg-black/60 p-4"
        onClick={() => setSelectedProperty(null)}
      >
        <div
          id="monopoly-property-detail-modal"
          className="bg-slate-800 rounded-xl p-4 max-w-sm w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color header */}
          {selectedProperty.type === "property" && selectedProperty.color && (
            <div
              className="h-8 rounded-t-lg -mx-4 -mt-4 mb-3"
              style={{
                backgroundColor: getPropertyColorStyle(selectedProperty.color),
              }}
            />
          )}

          <h3 className="text-white font-bold text-xl mb-2">
            {ti(selectedProperty.name)}
          </h3>

          {selectedProperty.description && (
            <ul className="text-gray-300 text-sm">
              {ts(selectedProperty.description)
                .split("\n")
                .map((line) => (
                  <li key={line}>{line}</li>
                ))}
            </ul>
          )}

          {selectedProperty.type === "chest" && renderChestCards()}

          {selectedProperty.type === "chance" && renderChanceCards()}

          <div className="text-gray-300 space-y-1 text-sm">
            {(selectedProperty.type === "property" ||
              selectedProperty.type === "railroad" ||
              selectedProperty.type === "utility") &&
              selectedProperty.price && (
                <p>
                  💰 {ti({ en: "Price", vi: "Giá mua" })}:{" "}
                  {selectedProperty.price.toLocaleString()}đ
                </p>
              )}
            {selectedProperty.type === "property" &&
              selectedProperty.houseCost && (
                <p>
                  🔨 {ti({ en: "Build house", vi: "Giá xây nhà" })}:{" "}
                  {selectedProperty.houseCost.toLocaleString()}đ
                </p>
              )}
            {selectedProperty.type === "tax" && selectedProperty.taxAmount && (
              <p>
                💰 {ti({ en: "Tax", vi: "Thuế" })}:{" "}
                {selectedProperty.taxAmount.toLocaleString()}đ
              </p>
            )}
            {selectedProperty.type === "railroad" &&
              selectedProperty.baseRent && (
                <p className="mt-3 pt-3">
                  💵 {ti({ en: "Rent", vi: "Thuê" })}:{" "}
                  {selectedProperty.baseRent.toLocaleString()}
                  {/* {selectedProperty.type === "utility" ? "x 🎲" : "đ"} */}
                  {selectedProperty.type === "railroad"
                    ? " x" +
                      railwaysCount +
                      ts({
                        en: " (multiplied by railroad count)",
                        vi: " (nhân số ga sở hữu)",
                      })
                    : ""}
                </p>
              )}

            {/* {selectedProperty.type === "railroad" && (
              <p>
                💵 {ti({ en: "Rent", vi: "Thuê" })}:{" "}
                {selectedProperty.baseRent.toLocaleString()}
              </p>
            )} */}

            {selectedProperty.type === "utility" && (
              <>
                <p>
                  💵 {ti({ en: "Rent", vi: "Thuê" })}:{" "}
                  {selectedProperty.baseRent.toLocaleString()}
                </p>
                <div className="mt-2 text-xs flex flex-col gap-1">
                  {/* Base Rent (0 utilities) */}
                  <div
                    className={`flex justify-between px-2 py-1 rounded ${
                      !ownership || utilitiesCount === 0
                        ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                        : ""
                    }`}
                  >
                    <span>{ti({ en: "Base Rent", vi: "Thuê cơ bản" })}</span>
                    <span>{selectedProperty.baseRent.toLocaleString()}đ</span>
                  </div>
                  {/* Base Rent (1 utilities) */}
                  <div
                    className={`flex justify-between px-2 py-1 rounded ${
                      !ownership || utilitiesCount === 1
                        ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                        : ""
                    }`}
                  >
                    <span>{ti({ en: "1 Utility", vi: "1 Cụm" })}</span>
                    <span>
                      {selectedProperty.baseRent.toLocaleString()}đ + 4x 🎲
                    </span>
                  </div>
                  {/* Base Rent (2 utilities) */}
                  <div
                    className={`flex justify-between px-2 py-1 rounded ${
                      !ownership || utilitiesCount === 2
                        ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                        : ""
                    }`}
                  >
                    <span>{ti({ en: "2 Utilities", vi: "2 Cụm" })}</span>
                    <span>
                      {selectedProperty.baseRent.toLocaleString()}đ + 10x 🎲
                    </span>
                  </div>
                </div>
              </>
            )}

            {selectedProperty.type === "property" && selectedProperty.rent && (
              <div className="mt-2 text-xs flex flex-col gap-1">
                {/* Base Rent (0 houses) */}
                <div
                  className={`flex justify-between px-2 py-1 rounded ${
                    !ownership || ownership.houses === 0
                      ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                      : ""
                  }`}
                >
                  <span>{ti({ en: "Rent", vi: "Thuê" })}</span>
                  <span>{selectedProperty.rent[0].toLocaleString()}đ</span>
                </div>

                {/* 1 House */}
                <div
                  className={`flex justify-between px-2 py-1 rounded ${
                    ownership?.houses === 1
                      ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                      : ""
                  }`}
                >
                  <span>{ti({ en: "With 1 House", vi: "Với 1 Nhà" })}</span>
                  <span>{selectedProperty.rent[1].toLocaleString()}đ</span>
                </div>

                {/* 2 Houses */}
                <div
                  className={`flex justify-between px-2 py-1 rounded ${
                    ownership?.houses === 2
                      ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                      : ""
                  }`}
                >
                  <span>{ti({ en: "With 2 Houses", vi: "Với 2 Nhà" })}</span>
                  <span>{selectedProperty.rent[2].toLocaleString()}đ</span>
                </div>

                {/* 3 Houses */}
                <div
                  className={`flex justify-between px-2 py-1 rounded ${
                    ownership?.houses === 3
                      ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                      : ""
                  }`}
                >
                  <span>{ti({ en: "With 3 Houses", vi: "Với 3 Nhà" })}</span>
                  <span>{selectedProperty.rent[3].toLocaleString()}đ</span>
                </div>

                {/* 4 Houses */}
                <div
                  className={`flex justify-between px-2 py-1 rounded ${
                    ownership?.houses === 4
                      ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                      : ""
                  }`}
                >
                  <span>{ti({ en: "With 4 Houses", vi: "Với 4 Nhà" })}</span>
                  <span>{selectedProperty.rent[4].toLocaleString()}đ</span>
                </div>

                {/* Hotel */}
                <div
                  className={`flex justify-between px-2 py-1 rounded ${
                    ownership?.houses === 5
                      ? "bg-green-900/40 text-green-300 font-bold border border-green-700/50"
                      : ""
                  }`}
                >
                  <span>{ti({ en: "With Hotel", vi: "Với Khách sạn" })}</span>
                  <span>{selectedProperty.rent[5]?.toLocaleString()}đ</span>
                </div>
              </div>
            )}
          </div>

          {owner && (
            <div className="mt-3 pt-3 border-t border-slate-600">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: owner.color }}
                />
                <span className="text-white">
                  {ti({ en: "Owned by", vi: "Sở hữu bởi" })}: {owner.username}
                </span>
              </div>
              {ownership && ownership.houses > 0 && (
                <p className="text-gray-300 text-sm mt-1">
                  🏠{" "}
                  {ownership.houses === 5
                    ? ti({ en: "Hotel", vi: "Khách sạn" })
                    : `${ownership.houses} ${ti({
                        en: "house(s)",
                        vi: "nhà",
                      })}`}
                </p>
              )}
            </div>
          )}

          {/* Economy Actions */}
          {isMyProperty && (
            <div className="mt-4 pt-3 border-t border-slate-600 flex flex-col gap-2">
              <h4 className="text-white text-xs font-bold uppercase mb-1">
                {ti({ en: "Manage Property", vi: "Quản lý tài sản" })}
              </h4>

              {/* Sell House */}
              {ownership &&
                ownership.houses > 0 &&
                selectedProperty.type === "property" &&
                selectedProperty.houseCost && (
                  <button
                    onClick={() => game.requestSellHouse(selectedProperty.id)}
                    className="w-full px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded text-xs"
                  >
                    {ti({ en: "Sell House", vi: "Bán nhà" })} (+
                    {selectedProperty.houseCost
                      ? (selectedProperty.houseCost / 2).toLocaleString()
                      : 0}
                    đ)
                  </button>
                )}

              {/* Mortgage / Unmortgage */}
              {ownership &&
                !ownership.mortgaged &&
                ownership.houses === 0 &&
                (selectedProperty.type === "property" ||
                  selectedProperty.type === "railroad" ||
                  selectedProperty.type === "utility") &&
                selectedProperty.price && (
                  <button
                    onClick={async () => {
                      const price = (
                        (selectedProperty.price || 0) / 2
                      ).toLocaleString();
                      if (
                        await showConfirm(
                          ts({
                            en: `Mortgage ${ts(
                              selectedProperty.name,
                            )} for ${price}?`,
                            vi: `Bạn có chắc chắn muốn thế chấp ${ts(
                              selectedProperty.name,
                            )} với giá ${price}?`,
                          }),
                          ts({ en: "Mortgage", vi: "Thế chấp" }),
                        )
                      ) {
                        game.requestMortgage(selectedProperty.id);
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs"
                  >
                    {ti({ en: "Mortgage", vi: "Thế chấp" })} (+
                    {(selectedProperty.price / 2).toLocaleString()}đ)
                  </button>
                )}

              {ownership &&
                ownership.mortgaged &&
                (selectedProperty.type === "property" ||
                  selectedProperty.type === "railroad" ||
                  selectedProperty.type === "utility") &&
                selectedProperty.price && (
                  <button
                    onClick={() => game.requestUnmortgage(selectedProperty.id)}
                    className="w-full px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs"
                  >
                    {ti({ en: "Unmortgage", vi: "Chuộc lại" })} (-
                    {((selectedProperty.price / 2) * 1.1).toLocaleString()}đ)
                  </button>
                )}

              {/* Trade With Player */}
              <div className="pt-2">
                <p className="text-gray-400 text-xs mb-1">
                  {ti({ en: "Sell to Player", vi: "Bán cho người khác" })}
                </p>
                <div className="flex gap-1">
                  <select
                    className="flex-1 bg-slate-700 text-white text-xs rounded p-1 outline-none"
                    id="trade-player-select"
                    value={tradePlayerId || ""}
                    onChange={(e) => setTradePlayerId(e.target.value)}
                  >
                    {state.players
                      .filter(
                        (p) => p.id && p.id !== currentUserId && !p.isBankrupt,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id!}>
                          {p.username}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    placeholder={ts({ en: "Price", vi: "Giá" })}
                    className="w-16 bg-slate-700 text-white text-xs rounded p-1 outline-none"
                    id="trade-price-input"
                  />
                  <button
                    onClick={() => {
                      const select = document.getElementById(
                        "trade-player-select",
                      ) as HTMLSelectElement;
                      const input = document.getElementById(
                        "trade-price-input",
                      ) as HTMLInputElement;
                      const targetId = select.value;
                      const price = parseInt(input.value);
                      if (targetId && !isNaN(price) && price > 0) {
                        game.requestOfferTrade(
                          targetId,
                          selectedProperty.id,
                          price,
                        );
                        setSelectedProperty(null);
                      }
                    }}
                    className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Buy From Player (If owned by someone else) */}
          {!isMyProperty && ownership && ownership.ownerId !== "bank" && (
            <div className="mt-4 pt-3 border-t border-slate-600 flex flex-col gap-2">
              <p className="text-gray-400 text-xs mb-1">
                {ti({ en: "Offer to Buy", vi: "Đề nghị mua lại" })}
              </p>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder={ts({ en: "Price", vi: "Giá" })}
                  className="flex-1 bg-slate-700 text-white text-xs rounded p-1 outline-none"
                  id="buy-price-input"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById(
                      "buy-price-input",
                    ) as HTMLInputElement;
                    const price = parseInt(input.value);
                    if (!isNaN(price) && price > 0) {
                      // Target is the current owner
                      game.requestOfferTrade(
                        ownership.ownerId,
                        selectedProperty.id,
                        price,
                      );
                      setSelectedProperty(null);
                    }
                  }}
                  className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs"
                >
                  {ti({ en: "Send Offer", vi: "Gửi đề nghị" })}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            {isMyProperty &&
              selectedProperty.type === "property" &&
              selectedProperty.color &&
              selectedProperty.houseCost && (
                <div className="flex-1">
                  {(() => {
                    const validation = game.canBuildHouse(
                      currentUserId!,
                      selectedProperty.id,
                    );
                    return (
                      <div className="flex flex-col gap-1">
                        <button
                          disabled={!validation.allowed || !isMyTurn}
                          onClick={() => {
                            if (validation.allowed && isMyTurn) {
                              game.requestBuildHouse(selectedProperty.id);
                              setSelectedProperty(null);
                            }
                          }}
                          className={`w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                            validation.allowed && isMyTurn
                              ? "bg-green-600 hover:bg-green-500 text-white"
                              : "bg-green-900/50 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          {ti({ en: "Build House", vi: "Xây nhà" })} (
                          {selectedProperty.houseCost
                            ? selectedProperty.houseCost.toLocaleString()
                            : 0}
                          đ)
                        </button>
                        {(!validation.allowed || !isMyTurn) && (
                          <p className="text-[10px] text-red-400 text-center leading-tight">
                            {ti(
                              validation.reason ||
                                ts({
                                  en: "Wait for your turn",
                                  vi: "Đợi tới lượt của bạn",
                                }),
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            <button
              onClick={() => setSelectedProperty(null)}
              className="flex-1 px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm"
            >
              {ti({ en: "Close", vi: "Đóng" })}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMyProperties = () => {
    return (
      state.gamePhase === "playing" &&
      myIndex >= 0 &&
      currentUserId && (
        <div className="bg-slate-800 rounded-lg p-3">
          <h3 className="text-white font-bold mb-2 text-sm">
            {ti({ en: "My Properties", vi: "Tài sản của tôi" })}
          </h3>
          {renderPropertyList(game.getPlayerProperties(currentUserId))}
        </div>
      )
    );
  };

  const renderHistoryLog = () => {
    return (
      <div
        className={`bg-slate-800 rounded-lg p-2 w-full flex flex-col transition-all duration-300 ${
          isHistoryExpanded ? "h-40 md:h-56" : "h-auto"
        }`}
      >
        <h3
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="text-white font-bold text-xs sticky top-0 bg-slate-800 z-10 flex items-center justify-between cursor-pointer hover:text-gray-200"
        >
          <div className="flex items-center gap-1">
            <span>{isHistoryExpanded ? "▼" : "▶"}</span>
            <span>{ti({ en: "History", vi: "Lịch sử" })}</span>
          </div>
          <span className="text-[10px] font-normal text-gray-400">
            {historyLogs?.length || 0}
          </span>
        </h3>
        {isHistoryExpanded && (
          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 font-mono custom-scrollbar mt-1">
            {(historyLogs || [])
              .slice()
              .reverse()
              .map((log) => (
                <div
                  key={log.id}
                  className={`px-1.5 py-0.5 rounded-sm border-l-2 text-[10px] leading-tight flex items-baseline ${
                    log.type === "alert"
                      ? "bg-red-900/20 border-red-500 text-red-200"
                      : log.type === "action"
                        ? "bg-blue-900/20 border-blue-500 text-blue-200"
                        : "bg-slate-700/30 border-gray-500 text-gray-400"
                  }`}
                >
                  <span className="opacity-40 mr-1.5 min-w-[38px] shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  <span className="wrap-break-word text-left">
                    {ti(log.message)}
                  </span>
                </div>
              ))}
            {(!historyLogs || historyLogs.length === 0) && (
              <p className="text-gray-600 text-[10px] text-center italic mt-2">
                {ti({ en: "No history yet", vi: "Chưa có lịch sử" })}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderChanceCards = () => {
    return (
      <div className="mb-8">
        <h3 className="text-lg font-bold text-orange-400 mb-4 border-b border-orange-400/30 pb-2">
          {ti({ en: "Chance Cards", vi: "Thẻ Cơ Hội" })} (?)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {CHANCE_CARDS.map((card) => (
            <div
              key={card.id}
              className="bg-slate-700 border-l-2 border-orange-500 p-2 rounded text-xs flex flex-col justify-between h-full"
            >
              <p className="text-white font-medium">{ti(card.text)}</p>
              <p className="text-[10px] text-gray-400 uppercase">
                {card.action.type.replace(/_/g, " ")}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderChestCards = () => {
    return (
      <div className="mb-4">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 border-b border-yellow-400/30 pb-2">
          {ti({ en: "Community Chest Cards", vi: "Thẻ Khí Vận" })} (chest)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {CHEST_CARDS.map((card) => (
            <div
              key={card.id}
              className="bg-slate-700 border-l-2 border-yellow-500 p-2 rounded text-xs flex flex-col justify-between h-full"
            >
              <p className="text-white font-medium">{ti(card.text)}</p>
              <p className="text-[10px] text-gray-400 uppercase">
                {card.action.type.replace(/_/g, " ")}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGameRules = () => {
    if (!showRules) return null;

    return (
      <div
        className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
        onClick={() => setShowRules(false)}
      >
        <div
          className="bg-slate-800 rounded-xl max-w-4xl w-full max-h-[90%] flex flex-col shadow-2xl border border-slate-600"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({ en: "Game Rules & Cards", vi: "Luật Chơi & Thẻ" })}
            </h2>
            <button
              onClick={() => setShowRules(false)}
              className="p-1 hover:bg-slate-700 rounded transition-colors text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {/* 1. Basic Rules */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-green-400 mb-4 border-b border-green-400/30 pb-2">
                {ti({ en: "Basic Rules", vi: "Luật Cơ Bản" })}
              </h3>
              <ul className="list-disc pl-5 text-gray-300 space-y-2 text-sm">
                <li>
                  <strong className="text-white">
                    {ti({ en: "Goal", vi: "Mục Tiêu" })}:
                  </strong>{" "}
                  {ti({
                    en: "Be the last player remaining with money. Bankrupt other players by buying properties and charging rent.",
                    vi: "Là người chơi cuối cùng còn tiền. Làm phá sản người khác bằng cách mua đất và thu tiền thuê.",
                  })}
                </li>
                <li>
                  <strong className="text-white">
                    {ti({ en: "Movement", vi: "Di Chuyển" })}:
                  </strong>{" "}
                  {ti({
                    en: "Roll two dice to move. Rolling doubles allows you to roll again. Three consecutive doubles sends you to Jail.",
                    vi: "Gieo 2 xí ngầu để di chuyển. Đổ đôi được đi tiếp. Đổ đôi 3 lần liên tiếp sẽ phải vào Tù.",
                  })}
                </li>
                <li>
                  <strong className="text-white">
                    {ti({ en: "Properties", vi: "Tài Sản" })}:
                  </strong>{" "}
                  {ti({
                    en: "Streets, Railroads, and Utilities. Buy them to collect rent. Complete a color set to double the rent and build Houses/Hotels.",
                    vi: "Đường phố, Nhà ga, Công ty. Mua để thu tiền thuê. Sưu tập đủ bộ màu để nhân đôi tiền thuê và xây Nhà/Khách sạn.",
                  })}
                </li>
                <li>
                  <strong className="text-white">
                    {ti({ en: "Jail", vi: "Nhà Tù" })}:
                  </strong>{" "}
                  {ti({
                    en: "If sent to Jail, you cannot move but can still collect rent. To leave: pay 500đ, roll doubles, or use a 'Get Out of Jail Free' card.",
                    vi: "Nếu vào Tù, bạn không thể di chuyển nhưng vẫn được thu tiền. Để ra: trả 500đ, đổ đôi, hoặc dùng thẻ 'Ra Tù Miễn Phí'.",
                  })}
                </li>
              </ul>
            </div>

            {/* 2. Special Spaces */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-blue-400 mb-4 border-b border-blue-400/30 pb-2">
                {ti({ en: "Special Spaces", vi: "Ô Đặc Biệt" })}
              </h3>
              <div className="space-y-4">
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <h4 className="font-bold text-white mb-1">
                    {ti({
                      en: "Utilities (Water / Electricity)",
                      vi: "Công Ty (Điện/Nước)",
                    })}
                  </h4>
                  <p className="text-xs text-gray-300">
                    {ti({
                      en: "Rent depends on the dice roll.",
                      vi: "Tiền thuê phụ thuộc vào số đổ xí ngầu.",
                    })}
                    <br />-{" "}
                    {ti({
                      en: "Own 1 Utility: Rent = 4x dice roll",
                      vi: "Sở hữu 1 Công ty: Thuê = 4x số đổ xí ngầu",
                    })}
                    <br />-{" "}
                    {ti({
                      en: "Own 2 Utilities: Rent = 10x dice roll",
                      vi: "Sở hữu 2 Công ty: Thuê = 10x số đổ xí ngầu",
                    })}
                  </p>
                </div>
                {/* railroad */}
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <h4 className="font-bold text-white mb-1">
                    {ti({ en: "Railroads", vi: "Nhà Ga" })}
                  </h4>
                  <p className="text-xs text-gray-300">
                    {ti({
                      en: "Rent depends on the railroad count.",
                      vi: "Tiền thuê phụ thuộc vào số ga sở hữu.",
                    })}
                    <br />
                    {ti({
                      en: "The more you own, the higher the rent.",
                      vi: "Sở hữu càng nhiều, giá thuê càng cao.",
                    })}
                    <br />-{" "}
                    {ti({
                      en: "Own 1 Railroad: Rent = Original Rent",
                      vi: "Sở hữu 1 Ga: Thuê = Giá thuê ban đầu",
                    })}
                    <br />-{" "}
                    {ti({
                      en: "Own 2 Railroads: Rent = 2x Original Rent",
                      vi: "Sở hữu 2 Ga: Thuê = 2x Giá thuê ban đầu",
                    })}
                    <br />-{" "}
                    {ti({
                      en: "Own 3 Railroads: Rent = 3x Original Rent",
                      vi: "Sở hữu 3 Ga: Thuê = 3x Giá thuê ban đầu",
                    })}
                    <br />-{" "}
                    {ti({
                      en: "Own 4 Railroads: Rent = 4x Original Rent",
                      vi: "Sở hữu 4 Ga: Thuê = 4x Giá thuê ban đầu",
                    })}
                  </p>
                </div>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <h4 className="font-bold text-white mb-1">
                    {ti({ en: "Taxes", vi: "Thuế" })}
                  </h4>
                  <p className="text-xs text-gray-300">
                    {ti({
                      en: "Pay a fixed amount to the bank.",
                      vi: "Trả một khoản cố định cho ngân hàng.",
                    })}
                    <br />-{" "}
                    <span className="text-red-400">
                      {ti({ en: "Income Tax", vi: "Thuế Thu Nhập" })}
                    </span>
                    : 2000đ
                    <br />-{" "}
                    <span className="text-red-400">
                      {ti({ en: "Luxury Tax", vi: "Thuế Xa Xỉ" })}
                    </span>
                    : 1000đ
                  </p>
                </div>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <h4 className="font-bold text-white mb-1">
                    {ti({ en: "Jail", vi: "Nhà Tù" })}
                  </h4>
                  <p className="text-xs text-gray-300">
                    -{" "}
                    <strong className="text-orange-400">
                      {ti({ en: "Go to Jail", vi: "Vào Tù" })}
                    </strong>
                    :{" "}
                    {ti({
                      en: "Move directly to Jail. Do not pass GO, do not collect salary. Turn ends.",
                      vi: "Đi thẳng vào tù. Không qua Khởi Hành, không nhận lương. Kết thúc lượt.",
                    })}
                    <br />-{" "}
                    <strong className="text-green-400">
                      {ti({ en: "Just Visiting", vi: "Thăm Tù" })}
                    </strong>
                    :{" "}
                    {ti({
                      en: "If you land here normally, nothing happens.",
                      vi: "Nếu bạn đi vào ô này bình thường, không có gì xảy ra.",
                    })}
                    <br />-{" "}
                    <strong className="text-red-400">
                      {ti({ en: "In Jail", vi: "Trong Tù" })}
                    </strong>
                    :{" "}
                    {ti({
                      en: "You can still collect rent! To leave: roll doubles, pay 500đ, or use card.",
                      vi: "Vẫn được thu tiền thuê! Để ra: đổ đôi, trả 500đ, hoặc dùng thẻ.",
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Chance Cards */}
            {renderChanceCards()}

            {/* 4. Community Chest Cards */}
            {renderChestCards()}
          </div>
        </div>
      </div>
    );
  };

  const renderTradeOffers = () => {
    // Show offers TO me or FROM me (pending or declined-with-message)
    const myOffers = state.tradeOffers?.filter(
      (o) =>
        !dismissedOffers.includes(o.id) &&
        (o.toPlayerId === currentUserId ||
          (o.fromPlayerId === currentUserId &&
            (o.status === "pending" || o.status === "declined"))),
    );

    if (!myOffers || myOffers.length === 0) return null;

    return (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4">
        {myOffers.map((offer) => {
          const fromMe = offer.fromPlayerId === currentUserId;
          const otherPlayer = state.players.find(
            (p) => p.id === (fromMe ? offer.toPlayerId : offer.fromPlayerId),
          );
          const space = BOARD_SPACES[offer.propertyId];

          // Determine if it was a Buy or Sell offer
          // We need state to know who owns it, but we can infer from "fromMyself" and intent?
          // Actually, we can check property ownership in state
          const property = state.properties.find(
            (p) => p.spaceId === offer.propertyId,
          );
          const isSellOffer = property?.ownerId === offer.fromPlayerId;
          // const isBuyOffer = property?.ownerId === offer.toPlayerId;

          let title = ti({ en: "TRADE OFFER", vi: "LỜI MỜI GIAO DỊCH" });
          let description = "";
          let textColor = "text-yellow-400";

          if (offer.status === "declined") {
            title = ti({ en: "TRADE DECLINED", vi: "GIAO DỊCH BỊ TỪ CHỐI" });
            textColor = "text-red-400";
            description = `${otherPlayer?.username} ${ti({
              en: "declined your offer.",
              vi: "đã từ chối đề nghị của bạn.",
            })}`;
          } else if (fromMe) {
            if (isSellOffer) {
              description = `${ti({
                en: "You offered to sell",
                vi: "Bạn đề nghị bán",
              })} ${ti(space?.name)} ${ti({
                en: "to",
                vi: "cho",
              })} ${otherPlayer?.username}`;
            } else {
              description = `${ti({
                en: "You offered to buy",
                vi: "Bạn đề nghị mua",
              })} ${ti(space?.name)} ${ti({
                en: "from",
                vi: "từ",
              })} ${otherPlayer?.username}`;
            }
          } else {
            if (isSellOffer) {
              description = `${otherPlayer?.username} ${ti({
                en: "offers to sell",
                vi: "muốn bán",
              })} ${ti(space?.name)} ${ti({
                en: "to you",
                vi: "cho bạn",
              })}`;
            } else {
              description = `${otherPlayer?.username} ${ti({
                en: "offers to buy",
                vi: "muốn mua",
              })} ${ti(space?.name)} ${ti({
                en: "from you",
                vi: "từ bạn",
              })}`;
            }
          }

          return (
            <div
              key={offer.id}
              className={`border-2 rounded-lg p-3 shadow-xl animate-in slide-in-from-top duration-300 ${
                offer.status === "declined"
                  ? "bg-slate-800 border-red-500"
                  : "bg-slate-800 border-yellow-500"
              }`}
            >
              <h4 className={`font-bold text-sm text-center mb-1 ${textColor}`}>
                {title}
              </h4>
              <p className="text-white text-xs text-center mb-2">
                {description}
              </p>

              {/* Show counter offer / reason if declined */}
              {offer.status === "declined" && offer.responseMessage && (
                <div className="bg-red-900/50 p-2 rounded mb-2 border border-red-700/50">
                  <p className="text-red-200 text-xs text-center italic">
                    "{ti(offer.responseMessage)}"
                  </p>
                </div>
              )}

              {offer.status !== "declined" && (
                <p className="text-center text-green-400 font-mono font-bold mb-3">
                  {offer.price.toLocaleString()}đ
                </p>
              )}

              <div className="flex gap-2 justify-center">
                {decliningOfferId !== offer.id &&
                  offer.status === "pending" &&
                  !fromMe && (
                    <button
                      onClick={() => game.requestRespondTrade(offer.id, true)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold shadow-md hover:scale-105 transition-transform"
                    >
                      {ti({ en: "ACCEPT", vi: "ĐỒNG Ý" })}
                    </button>
                  )}

                {offer.status === "declined" ? (
                  <button
                    onClick={() =>
                      setDismissedOffers((prev) => [...prev, offer.id])
                    }
                    className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-medium"
                  >
                    {ti({ en: "Dismiss", vi: "Đóng" })}
                  </button>
                ) : decliningOfferId === offer.id ? (
                  <div className="flex flex-col gap-2 w-full animate-in slide-in-from-bottom-2 fade-in">
                    <input
                      autoFocus
                      type="text"
                      value={declineMessage}
                      onChange={(e) => setDeclineMessage(e.target.value)}
                      placeholder={
                        ti({
                          en: "Reason (optional)...",
                          vi: "Lý do (tùy chọn)...",
                        }) as string
                      }
                      className="bg-slate-900 border border-slate-600 rounded p-1 text-xs text-white outline-none w-full"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          game.requestRespondTrade(
                            offer.id,
                            false,
                            declineMessage,
                          );
                          setDecliningOfferId(null);
                          setDeclineMessage("");
                        }
                      }}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setDecliningOfferId(null);
                          setDeclineMessage("");
                        }}
                        className="px-2 py-1 bg-slate-600 text-xs text-white rounded"
                      >
                        {ti({ en: "Back", vi: "Trở lại" })}
                      </button>
                      <button
                        onClick={() => {
                          game.requestRespondTrade(
                            offer.id,
                            false,
                            declineMessage,
                          );
                          setDecliningOfferId(null);
                          setDeclineMessage("");
                        }}
                        className="px-2 py-1 bg-red-600 text-xs text-white rounded font-bold"
                      >
                        {ti({ en: "Send", vi: "Gửi" })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (fromMe) {
                        game.requestCancelTrade(offer.id);
                      } else {
                        // Open decline input
                        setDecliningOfferId(offer.id);
                        setDeclineMessage("");
                      }
                    }}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium shadow-sm hover:opacity-90 transition-opacity"
                  >
                    {fromMe
                      ? ti({ en: "Cancel", vi: "Hủy" })
                      : ti({ en: "DECLINE", vi: "TỪ CHỐI" })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTokenOverlay = () => {
    return (
      <div className="absolute inset-0 pointer-events-none z-20">
        {state.players.map((player, index) => {
          if (!player.id || player.isBankrupt) return null;
          const isCurrentPlayer = player.id === currentPlayer?.id;

          // Use cached position if rolling (prevent premature jump)
          let position = player.position;
          if (
            rolling &&
            isCurrentPlayer &&
            lastPositionsRef.current[player.id] !== undefined
          ) {
            position = lastPositionsRef.current[player.id];
          }

          const pos = getSpacePosition(position);

          // Calculate position percentage
          // Grid is 11x11. Each cell is ~9.09%
          // Center of cell is ~4.54%
          // We add small offsets based on player index to prevent overlap

          // Base center position
          let topPct = (pos.row / 11) * 100 + 4.54;
          let leftPct = (pos.col / 11) * 100 + 4.54;

          // Offset based on player index (2x2 grid within cell)
          // 0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right
          const offsetX = ((index % 2) - 0.5) * 3;
          const offsetY = (Math.floor(index / 2) - 0.5) * 3;

          return (
            <div
              key={player.id}
              className={`absolute w-3 h-3 md:w-5 md:h-5 rounded-full border-2 border-white shadow-lg flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) ${
                isCurrentPlayer
                  ? "z-50 ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-700 scale-150 shadow-[0_0_20px_rgba(250,204,21,0.8)]"
                  : "z-30"
              }`}
              style={{
                top: `${topPct + offsetY}%`,
                left: `${leftPct + offsetX}%`,
                backgroundColor: player.color,
              }}
              title={player.username}
            >
              {/* Helper avatar icon */}
              <span className="text-[6px] md:text-[9px] font-bold text-white drop-shadow-md select-none">
                {player.username.charAt(0).toUpperCase()}
              </span>

              {/* Active Player Glow Effect */}
              {isCurrentPlayer && (
                <div className="absolute inset-0 rounded-full animate-ping opacity-75 bg-white" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="relative flex flex-col md:flex-row gap-2 p-0 w-full max-w-6xl mx-auto"
      ref={gameContainerRef}
    >
      {renderTradeOffers()}
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />

      {/* Main Board */}
      <div className="flex flex-col items-center gap-2 flex-1">
        <div className="relative bg-slate-900 rounded-lg md:rounded-xl p-0.5 md:p-1 shadow-2xl border-2 md:border-4 border-slate-700 overflow-hidden w-full max-w-[95vw]">
          {/* Grid board */}
          <div
            className="grid gap-px md:gap-0.5 w-full"
            style={{
              gridTemplateColumns: "repeat(11, 1fr)",
              gridTemplateRows: "repeat(11, 1fr)",
            }}
          >
            {BOARD_SPACES.map(renderBoardSpace)}

            {/* Center area - game controls go here */}
            <div
              className="bg-linear-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center overflow-auto"
              style={{
                gridRow: "2 / 11",
                gridColumn: "2 / 11",
              }}
            >
              {/* Title */}
              <h2 className="text-xs md:text-xl font-bold text-transparent bg-clip-text bg-linear-to-r from-yellow-400 to-red-500 mb-1 md:mb-2">
                CỜ TỶ PHÚ
              </h2>

              {/* Game Controls */}
              {renderGameControls()}
            </div>
          </div>

          {/* Token Overlay - Smooth Movement Animation */}
          {renderTokenOverlay()}
        </div>
      </div>

      {/* Side Panel */}
      <div className="flex flex-col gap-4 shrink-0 md:w-64 w-full">
        {renderPlayerPanel()}
        {renderMyProperties()}
        {renderHistoryLog()}
      </div>

      {/* Game Rules Modal */}
      {renderGameRules()}

      {/* Property Detail Modal */}
      {renderPropertyDetail()}

      {/* Floating Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 z-40 bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-full shadow-xl border border-slate-600 transition-transform hover:scale-110"
        title={ti({ en: "Game Rules", vi: "Luật Chơi" }) as string}
      >
        <BookOpen className="w-6 h-6 text-yellow-500" />
      </button>

      {/* Hover Connection Line Layer */}
      {lineCoords && (
        <svg className="absolute inset-0 pointer-events-none z-49 overflow-visible w-full h-full">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#FACC15" />
            </marker>
          </defs>
          <line
            x1={lineCoords.x1}
            y1={lineCoords.y1}
            x2={lineCoords.x2}
            y2={lineCoords.y2}
            stroke="#FACC15"
            strokeWidth="3"
            strokeDasharray="5,5"
            markerEnd="url(#arrowhead)"
            className="drop-shadow-md"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="100"
              to="0"
              dur="1s"
              repeatCount="indefinite"
            />
          </line>
          <circle cx={lineCoords.x1} cy={lineCoords.y1} r="4" fill="#FACC15">
            <animate
              attributeName="opacity"
              values="0.5;1;0.5"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      )}
    </div>
  );
}
