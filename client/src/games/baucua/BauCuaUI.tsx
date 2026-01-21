import { useEffect, useState } from "react";
import type { GameUIProps } from "../types";
import type BauCua from "./BauCua";
import type { BauCuaState, BauCuaSymbol, PlayerBalance } from "./types";
import { ALL_SYMBOLS, SYMBOL_NAMES, MIN_BET } from "./types";
import { useAlertStore } from "../../stores/alertStore";
import useLanguage from "../../stores/languageStore";
import { useRoomStore } from "../../stores/roomStore";
import { Bot, Play, RotateCcw, Trash2 } from "lucide-react";

export default function BauCuaUI({
  game: baseGame,
  currentUserId,
}: GameUIProps) {
  const game = baseGame as BauCua;
  const [state, setState] = useState<BauCuaState>(game.getState());
  const [betAmount, setBetAmount] = useState(50);
  const { confirm: showConfirm } = useAlertStore();
  const { ti, ts } = useLanguage();
  const { currentRoom } = useRoomStore();

  // Local bets for guests (before syncing to host)
  const [localBets, setLocalBets] = useState<
    { symbol: BauCuaSymbol; amount: number }[]
  >([]);

  // Dice animation states
  const [isRolling, setIsRolling] = useState(false);
  const [animatedDice, setAnimatedDice] = useState<
    [BauCuaSymbol, BauCuaSymbol, BauCuaSymbol]
  >(["gourd", "crab", "shrimp"]);

  useEffect(() => {
    const unsubscribe = game.onUpdate((newState) => {
      // Detect dice roll - when gamePhase changes to "rolling"
      if (newState.gamePhase === "rolling" && state.gamePhase === "betting") {
        // Start animation
        setIsRolling(true);

        // Animate for 3 seconds with random symbols
        const animationInterval = setInterval(() => {
          const randomDice: [BauCuaSymbol, BauCuaSymbol, BauCuaSymbol] = [
            ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
            ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
            ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
          ];
          setAnimatedDice(randomDice);
        }, 100); // Change every 100ms

        // After 3 seconds, stop animation and show result
        setTimeout(() => {
          clearInterval(animationInterval);
          setIsRolling(false);
        }, 3000);
      }

      setState(newState);

      // Clear local bets when new round starts
      if (
        newState.gamePhase === "betting" &&
        newState.currentRound !== state.currentRound
      ) {
        setLocalBets([]);
      }
    });
    return unsubscribe;
  }, [game, state.currentRound, state.gamePhase]);

  const myBalance = currentUserId
    ? state.playerBalances[currentUserId]
    : undefined;

  // Use local bets if not ready yet and not host, otherwise use server state
  const isReady = currentUserId
    ? state.playersReady[currentUserId] || false
    : false;
  const myBets = currentUserId
    ? game.isHost || isReady
      ? state.currentBets[currentUserId] || []
      : localBets
    : [];

  // Get symbol emoji
  const getSymbolEmoji = (symbol: BauCuaSymbol): string => {
    const emojiMap: Record<BauCuaSymbol, string> = {
      gourd: "🎃",
      crab: "🦀",
      shrimp: "🦐",
      fish: "🐟",
      chicken: "🐔",
      deer: "🦌",
    };
    return emojiMap[symbol];
  };

  // Get bet amount for a symbol
  const getBetOnSymbol = (symbol: BauCuaSymbol): number => {
    const bet = myBets.find(
      (b: { symbol: BauCuaSymbol; amount: number }) => b.symbol === symbol,
    );
    return bet?.amount || 0;
  };

  // Handle bet button click
  const handleBet = (symbol: BauCuaSymbol) => {
    if (state.gamePhase !== "betting") return;
    if (!myBalance) return;

    const currentTotal = myBets.reduce(
      (sum: number, b: { symbol: BauCuaSymbol; amount: number }) =>
        sum + b.amount,
      0,
    );
    if (currentTotal + betAmount > myBalance.currentBalance) return;

    // Guest: Update local state for instant UI feedback
    if (!game.isHost && !isReady) {
      const existingBetIndex = localBets.findIndex((b) => b.symbol === symbol);
      const newLocalBets = [...localBets];

      if (existingBetIndex >= 0) {
        newLocalBets[existingBetIndex].amount += betAmount;
      } else {
        newLocalBets.push({ symbol, amount: betAmount });
      }

      setLocalBets(newLocalBets);
    } else {
      // Host: Sync immediately
      game.requestPlaceBet(symbol, betAmount);
    }
  };

  // Get leaderboard sorted by balance
  const getLeaderboard = (): PlayerBalance[] => {
    return Object.values(state.playerBalances).sort(
      (a, b) => b.currentBalance - a.currentBalance,
    );
  };

  // Get bets on a specific symbol from all players
  const getBetsOnSymbol = (
    symbol: BauCuaSymbol,
  ): {
    playerId: string;
    username: string;
    amount: number;
    isBot: boolean;
  }[] => {
    const bets: {
      playerId: string;
      username: string;
      amount: number;
      isBot: boolean;
    }[] = [];

    Object.entries(state.currentBets).forEach(([playerId, playerBets]) => {
      const betOnSymbol = playerBets.find((b) => b.symbol === symbol);
      if (betOnSymbol) {
        const player = state.playerBalances[playerId];
        if (player) {
          bets.push({
            playerId,
            username: player.username,
            amount: betOnSymbol.amount,
            isBot: player.isBot,
          });
        }
      }
    });

    return bets.sort((a, b) => b.amount - a.amount);
  };

  // Get total bets on a symbol
  const getTotalBetsOnSymbol = (symbol: BauCuaSymbol): number => {
    return getBetsOnSymbol(symbol).reduce((sum, bet) => sum + bet.amount, 0);
  };

  // Generate mini sparkline SVG for a player's balance history
  const renderMiniSparkline = (history: number[]): React.ReactElement => {
    if (history.length < 2) {
      return <div className="w-16 h-8" />;
    }

    const width = 64;
    const height = 32;
    const padding = 2;

    const max = Math.max(...history);
    const min = Math.min(...history);
    const range = max - min || 1;

    const points = history
      .map((value, index) => {
        const x =
          padding + (index / (history.length - 1)) * (width - padding * 2);
        const y = padding + ((max - value) / range) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");

    const lastValue = history[history.length - 1];
    const prevValue = history[history.length - 2];
    const isUp = lastValue > prevValue;
    const isFlat = lastValue === prevValue;
    const color = isFlat ? "#6b7280" : isUp ? "#10b981" : "#ef4444";

    return (
      <svg width={width} height={height} className="inline-block">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  // Handle roll dice with confirmation if guests haven't bet
  const handleRollDice = async () => {
    if (!game.isHost) return;

    // Check if any human players (non-bots) haven't placed bets
    const humanPlayers = Object.values(state.playerBalances).filter(
      (p) => !p.isBot,
    );
    const playersWithoutBet = humanPlayers.filter(
      (p) =>
        (state.currentBets[p.playerId] || []).length === 0 &&
        state.playersReady[p.playerId],
    );

    if (playersWithoutBet.length > 0) {
      const confirmed = await showConfirm(
        ts({
          vi: `Có ${playersWithoutBet.length} người chưa đặt cược (${playersWithoutBet.map((p) => p.username).join(", ")}). Bạn có muốn lắc xúc xắc luôn không? `,
          en: `${playersWithoutBet.length} player(s) haven't placed bets yet (${playersWithoutBet.map((p) => p.username).join(", ")}). Roll dice anyway? `,
        }),
        ts({ vi: "Lắc xúc xắc", en: "Roll Dice" }),
      );

      if (!confirmed) return;
    }

    game.requestRollDice();
  };

  return (
    <div className="w-full h-full flex flex-col @md:gap-4 gap-2 @md:p-2 overflow-y-auto">
      {/* Host Controls */}
      {game.isHost && state.gamePhase !== "waiting" && (
        <div className="flex gap-2 w-full items-center justify-center">
          <button
            onClick={async () => {
              if (
                await showConfirm(
                  ts({
                    en: "Are you sure you want to reset the game?",
                    vi: "Bạn có chắc chắn muốn chơi lại không?",
                  }),
                  ts({ en: "Reset Game", vi: "Chơi lại" }),
                )
              )
                game.requestResetGame();
            }}
            className="rounded-lg text-xs bg-slate-700 hover:bg-slate-600 px-4 py-2 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {ti({ en: "Reset Game", vi: "Chơi lại" })}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-linear-to-r from-slate-600 to-slate-800 rounded-xl p-2 text-white">
        <h2 className="text-2xl font-bold text-center">
          🎲 {ti({ vi: "Bầu Cua", en: "Bau Cua" })} 🎲
        </h2>
        <p className="text-center text-sm opacity-90">
          {ti({
            vi: `Vòng ${state.currentRound}`,
            en: `Round ${state.currentRound}`,
          })}
        </p>
      </div>

      {/* Waiting Phase */}
      {state.gamePhase === "waiting" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl @md:p-6 p-2 py-6 border border-slate-700">
            <p className="text-xl mb-4 text-center">
              {ti({
                vi: "Đang chờ bắt đầu game...",
                en: "Waiting to start game...",
              })}
            </p>

            {/* Player List */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-slate-300">
                {ti({
                  vi: `Người chơi (${Object.keys(state.playerBalances).length}/${currentRoom?.maxPlayers})`,
                  en: `Players (${Object.keys(state.playerBalances).length}/${currentRoom?.maxPlayers})`,
                })}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {Object.values(state.playerBalances).map((player) => (
                  <div
                    key={player.playerId}
                    className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between w-[150px]"
                  >
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm truncate">
                        {player.username}
                      </p>
                      <p className="text-xs text-slate-400">
                        {player.currentBalance}💰
                      </p>
                    </div>
                    {player.isBot && <span className="text-lg ml-2">🤖</span>}
                    {game.isHost && player.isBot && (
                      <button
                        onClick={() => game.requestRemoveBot(player.playerId)}
                        className="p-2 text-red-400 hover:bg-slate-600 rounded-lg hover:cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {game.isHost && (
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  onClick={() => game.requestAddBot()}
                  className="flex items-center gap-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors disabled:bg-slate-800"
                  disabled={Object.keys(state.playerBalances).length >= 20}
                >
                  {ti({ vi: "Thêm Bot", en: "Add Bot" })}
                  <Bot className="w-4 h-4" />
                </button>
                <button
                  onClick={() => game.requestStartNewRound()}
                  className="flex items-center gap-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:bg-slate-800"
                  disabled={Object.keys(state.playerBalances).length === 0}
                >
                  {ti({ vi: "Bắt đầu", en: "Start Game" })}
                  <Play className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Game Area */}
      {(state.gamePhase === "betting" ||
        state.gamePhase === "rolling" ||
        state.gamePhase === "results") && (
        <div className="flex flex-col @md:grid @md:grid-cols-[1fr_300px] gap-4">
          {/* Left Column: Betting Interface */}
          <div className="flex flex-col gap-4">
            {/* Player Balance & Bet Controls */}
            {myBalance && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="text-sm text-slate-400">
                      {ti({ vi: "Số dư", en: "Your Balance" })}
                    </p>
                    <p className="text-2xl font-bold text-green-400">
                      {myBalance.currentBalance}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">
                      {ti({ vi: "Tổng cược", en: "Total Bet" })}
                    </p>
                    <p className="text-xl font-semibold text-orange-400">
                      {myBalance.totalBet}
                    </p>
                  </div>
                </div>

                {state.gamePhase === "betting" && (
                  <>
                    <div className="mb-3">
                      <label className="text-sm text-slate-400 block mb-2">
                        {ti({
                          vi: `Số tiền cược: ${betAmount}`,
                          en: `Bet Amount: ${betAmount}`,
                        })}
                      </label>
                      <input
                        type="range"
                        min={MIN_BET}
                        max={Math.min(500, myBalance.currentBalance)}
                        step={10}
                        value={betAmount}
                        onChange={(e) => setBetAmount(Number(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>{MIN_BET}</span>
                        <span>{Math.min(500, myBalance.currentBalance)}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Clear local bets for guests, send clear action to host
                          if (!game.isHost && !isReady) {
                            setLocalBets([]);
                          }
                          game.requestClearBets();
                        }}
                        className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:bg-slate-800 disabled:cursor-not-allowed"
                        disabled={myBets.length === 0}
                      >
                        {ti({ vi: "Xóa cược", en: "Clear Bets" })}{" "}
                        {myBets.length || ""}
                      </button>
                      <button
                        onClick={() => {
                          // Guest: Sync local bets to host before toggling ready
                          if (
                            !game.isHost &&
                            !isReady &&
                            localBets.length > 0
                          ) {
                            game.requestSyncBets(localBets);
                          }
                          game.requestToggleReady();
                        }}
                        className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:bg-slate-800 disabled:cursor-not-allowed ${
                          isReady
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                        disabled={myBets.length === 0}
                      >
                        {isReady
                          ? ti({ vi: "✓ Sẵn sàng", en: "✓ Ready" })
                          : ti({ vi: "Sẵn sàng?", en: "Ready?" })}
                      </button>
                    </div>

                    {/* notify user to select */}
                    {myBets.length === 0 && (
                      <p className="text-sm text-orange-500 pt-2">
                        {ti({
                          vi: "Vui lòng chọn cược",
                          en: "Please select a bet",
                        })}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Betting Board */}
            <div className="grid @md:grid-cols-2 grid-cols-3 @md:gap-3 gap-1">
              {ALL_SYMBOLS.map((symbol) => {
                const betOnThis = getBetOnSymbol(symbol);
                const betsOnSymbol = getBetsOnSymbol(symbol);
                const totalBets = getTotalBetsOnSymbol(symbol);
                const isWinning =
                  state.diceRoll?.includes(symbol) &&
                  state.gamePhase === "results";

                return (
                  <button
                    key={symbol}
                    onClick={() => handleBet(symbol)}
                    disabled={state.gamePhase !== "betting"}
                    className={`relative p-4 rounded-xl border-2 transition-all transform active:scale-95 ${
                      isWinning
                        ? "bg-linear-to-br from-yellow-500 to-orange-500 border-yellow-400 animate-pulse"
                        : betOnThis > 0
                          ? "bg-linear-to-br from-blue-600 to-purple-600 border-blue-400"
                          : "bg-slate-800/50 border-slate-700 hover:border-slate-500"
                    } ${
                      state.gamePhase === "betting"
                        ? "cursor-pointer"
                        : "cursor-not-allowed opacity-75"
                    }`}
                  >
                    <div className="text-4xl mb-2">
                      {getSymbolEmoji(symbol)}
                    </div>
                    <div className="text-sm font-semibold mb-2">
                      {ti(SYMBOL_NAMES[symbol])}
                    </div>

                    {/* My bet */}
                    {betOnThis > 0 && (
                      <div className="absolute top-2 right-2 bg-white text-black px-2 py-1 rounded-full text-xs font-bold">
                        {betOnThis}
                      </div>
                    )}

                    {/* All bets on this symbol */}
                    {betsOnSymbol.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs font-bold text-yellow-400 border-t border-slate-600 pt-2">
                          {ti({
                            vi: `Tổng: ${totalBets}`,
                            en: `Total: ${totalBets}`,
                          })}
                        </div>
                        <div className="max-h-20 overflow-y-auto space-y-0.5">
                          {betsOnSymbol.map((bet) => (
                            <div
                              key={bet.playerId}
                              className="text-xs flex justify-between items-center gap-1"
                            >
                              <span className="truncate flex-1 text-left">
                                {bet.username}
                                {bet.isBot && " 🤖"}
                              </span>
                              <span className="font-semibold text-green-400">
                                {bet.amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Sidebar: Dice & Leaderboard */}
          <div className="flex flex-col gap-4">
            {/* Dice Display */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4 text-center">
                {ti({ vi: "Kết quả xúc xắc", en: "Dice Roll" })}
              </h3>
              <div className="flex justify-center gap-4 mb-4">
                {/* Show animated dice during rolling, actual dice after animation ends */}
                {isRolling || state.diceRoll ? (
                  (isRolling ? animatedDice : state.diceRoll!).map(
                    (symbol, idx) => (
                      <div
                        key={idx}
                        className={`w-20 h-20 bg-white rounded-xl flex items-center justify-center text-5xl shadow-lg ${
                          isRolling ? "animate-bounce" : ""
                        }`}
                        style={{
                          animationDelay: `${idx * 0.1}s`,
                          transform: isRolling ? "rotate(360deg)" : "none",
                          transition: isRolling
                            ? "transform 0.1s linear"
                            : "none",
                        }}
                      >
                        {getSymbolEmoji(symbol)}
                      </div>
                    ),
                  )
                ) : (
                  <div className="text-slate-500 text-center">
                    {ti({
                      vi: "Đang chờ chủ phòng lắc...",
                      en: "Waiting for host roll...",
                    })}
                  </div>
                )}
              </div>

              {game.isHost && state.gamePhase === "betting" && (
                <button
                  onClick={handleRollDice}
                  className="w-full px-6 py-3 bg-linear-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-lg font-bold text-lg transition-all transform hover:scale-105"
                  disabled={isRolling}
                >
                  🎲 {ti({ vi: "Lắc xúc xắc", en: "Roll Dice" })} 🎲
                </button>
              )}

              {state.gamePhase === "results" && (
                <button
                  onClick={() => game.requestStartNewRound()}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold transition-colors"
                >
                  {ti({ vi: "Vòng tiếp theo", en: "Next Round" })}
                </button>
              )}
            </div>

            {/* Leaderboard with Sparklines */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
              <h3 className="text-lg font-semibold mb-3">
                {ti({ vi: "Bảng xếp hạng", en: "Leaderboard" })}
              </h3>
              <div className="space-y-2 max-h-120 overflow-y-auto">
                {getLeaderboard().map((player, idx) => (
                  <div
                    key={player.playerId}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      player.playerId === currentUserId
                        ? "bg-blue-600/30 border border-blue-500"
                        : "bg-slate-700/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-xl font-bold text-slate-400">
                        #{idx + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold">
                          {player.username}
                          {player.isBot && " 🤖"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {ti({
                            vi: `Cược: ${player.totalBet}`,
                            en: `Bet: ${player.totalBet}`,
                          })}
                          {state.playersReady[player.playerId] && " ✓"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Mini sparkline */}
                      {state.currentRound > 0 &&
                        renderMiniSparkline(player.balanceHistory)}
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-400">
                          {player.currentBalance}
                        </p>
                        {/* {game.isHost && player.isBot && (
                          <button
                            onClick={() =>
                              game.requestRemoveBot(player.playerId)
                            }
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            {ti({ vi: "Xóa", en: "Remove" })}
                          </button>
                        )} */}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game Ended */}
      {state.gamePhase === "ended" && (
        <div className="bg-linear-to-br from-yellow-600 to-orange-600 rounded-xl p-8 text-center border-4 border-yellow-400">
          <h2 className="text-3xl font-bold mb-4">
            🎉 {ti({ vi: "Kết thúc!", en: "Game Over!" })} 🎉
          </h2>
          {state.winner && (
            <p className="text-xl mb-6">
              {ti({
                vi: `Người chiến thắng: ${state.playerBalances[state.winner]?.username}`,
                en: `Winner: ${state.playerBalances[state.winner]?.username}`,
              })}
            </p>
          )}
          {game.isHost && (
            <button
              onClick={() => game.requestResetGame()}
              className="px-6 py-3 bg-white text-black rounded-lg font-bold hover:bg-slate-200 transition-colors"
            >
              {ti({ vi: "Chơi lại", en: "Play Again" })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
