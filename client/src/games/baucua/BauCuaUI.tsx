import { useEffect, useState } from "react";
import type { GameUIProps } from "../types";
import type BauCua from "./BauCua";
import type {
  BauCuaState,
  BauCuaSymbol,
  PlayerBalance,
  PowerUpType,
  HotStreak,
} from "./types";
import {
  ALL_SYMBOLS,
  SYMBOL_NAMES,
  MIN_BET,
  POWERUP_NAMES,
  POWERUP_DESCRIPTIONS,
  POWERUP_CONFIG,
  JACKPOT_PERCENTAGE,
  MEGA_ROUND_INTERVAL,
} from "./types";
import { useAlertStore } from "../../stores/alertStore";
import useLanguage from "../../stores/languageStore";
import { useRoomStore } from "../../stores/roomStore";
import {
  Bot,
  Play,
  RotateCcw,
  Trash2,
  Zap,
  Shield,
  Eye,
  BookOpen,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";

export default function BauCuaUI({
  game: baseGame,
  currentUserId: userId = "",
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
  const [betError, setBetError] = useState<string | null>(null);
  const [selectedPowerUpType, setSelectedPowerUpType] =
    useState<PowerUpType | null>(null);

  const selectedPowerUp = selectedPowerUpType
    ? state.playerPowerUps[userId || ""]?.[selectedPowerUpType]
    : undefined;

  // Slot machine animation states
  const [isRolling, setIsRolling] = useState(false);
  const [slotReels, setSlotReels] = useState<
    [BauCuaSymbol[], BauCuaSymbol[], BauCuaSymbol[]]
  >([[], [], []]);
  const [slotPositions, setSlotPositions] = useState<[number, number, number]>([
    0, 0, 0,
  ]);
  const [showRules, setShowRules] = useState(false);

  // Optimistic states
  const [optimisticReady, setOptimisticReady] = useState<boolean | null>(null);
  const [optimisticPowerUp, setOptimisticPowerUp] =
    useState<PowerUpType | null>(null);

  // Derived states using optimistic values
  const isReady =
    optimisticReady !== null
      ? optimisticReady
      : userId
        ? state.playersReady[userId] || false
        : false;

  // const activePowerUp =
  //   optimisticPowerUp || (userId ? state.activePowerUps[userId] : undefined);

  useEffect(() => {
    const unsubscribe = game.onUpdate((newState) => {
      // Detect dice roll - when gamePhase changes to "rolling"
      if (newState.gamePhase === "rolling" && state.gamePhase === "betting") {
        // Start slot machine animation
        setIsRolling(true);

        // Create reels with random symbols (20 symbols per reel)
        const createReel = (finalSymbol: BauCuaSymbol): BauCuaSymbol[] => {
          const reel: BauCuaSymbol[] = [];
          for (let i = 0; i < 20; i++) {
            reel.push(
              ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
            );
          }
          // Add final symbol at the end
          reel.push(finalSymbol);
          return reel;
        };

        const finalDice = newState.diceRoll!;
        setSlotReels([
          createReel(finalDice[0]),
          createReel(finalDice[1]),
          createReel(finalDice[2]),
        ]);
        setSlotPositions([0, 0, 0]);

        // Animate each reel with staggered timing
        [0, 1, 2].forEach((reelIndex) => {
          const stopDelay = 1500 + reelIndex * 500; // Stop at 1.5s, 2s, 2.5s
          const animationDuration = 100; // Update every 100ms

          const intervalId = setInterval(() => {
            setSlotPositions((prev) => {
              const newPos = [...prev] as [number, number, number];
              newPos[reelIndex] = (newPos[reelIndex] + 1) % 21;
              return newPos;
            });
          }, animationDuration);

          setTimeout(() => {
            clearInterval(intervalId);
            // Set to final position
            setSlotPositions((prev) => {
              const newPos = [...prev] as [number, number, number];
              newPos[reelIndex] = 20; // Final symbol is at index 20
              return newPos;
            });
          }, stopDelay);
        });

        // After all reels stop (3 seconds total), end animation
        setTimeout(() => {
          setIsRolling(false);
        }, 3000);
      }

      setState(newState);
      // console.log(newState);

      // Clear local bets and selected power-up when new round starts
      if (
        newState.gamePhase === "betting" &&
        newState.currentRound !== state.currentRound
      ) {
        setLocalBets([]);
        setSelectedPowerUpType(null);
      }

      // // Clear selected power-up when phase changes away from betting
      if (newState.gamePhase !== "betting" && state.gamePhase === "betting") {
        setSelectedPowerUpType(null);
      }

      // Reconcile optimistic states
      if (
        userId &&
        optimisticReady !== null &&
        newState.playersReady[userId] === optimisticReady
      ) {
        setOptimisticReady(null);
      }

      if (
        userId &&
        optimisticPowerUp !== null &&
        newState.activePowerUps[userId] === optimisticPowerUp
      ) {
        setOptimisticPowerUp(null);
      }
    });
    return unsubscribe;
  }, [game, state.currentRound, state.gamePhase]);

  const myBalance = userId ? state.playerBalances[userId] : undefined;

  // Use local bets if not ready yet, otherwise use server state
  // const isReady = userId ? state.playersReady[userId] || false : false;
  // If we are "optimistically ready", we should STILL use localBets if we are transitioning to ready
  // Logic: when transitioning to Ready, we send localBets to server.
  // Until server confirms, localBets are more accurate?
  // Actually, once isReady is true, the UI usually switches to state.currentBets.
  // To prevent flash, we should probably stick to localBets if optimisticReady is true?
  const myBets = (
    userId
      ? isReady
        ? // If optimistically ready, prefer localBets if they have content (transitioning)
          // Or if we are confidently ready from server, use server.
          // But simplifying: state.currentBets is only reliable after SYNC.
          state.currentBets[userId] || []
        : localBets
      : []
  ).filter((bet) => bet.amount > 0);
  const totalBet = myBets.reduce((sum, bet) => sum + bet.amount, 0);
  const lastProfit = myBalance
    ? myBalance.currentBalance -
      myBalance.balanceHistory[myBalance.balanceHistory.length - 2]
    : 0;

  // Get power-up icon
  const getPowerUpIcon = (type: PowerUpType) => {
    const iconMap = {
      double_down: <Zap className="w-4 h-4" />,
      insurance: <Shield className="w-4 h-4" />,
      reveal_one: <Eye className="w-4 h-4" />,
    };
    return iconMap[type];
  };

  // Get hot streaks from recent rolls
  const getHotStreaks = (): HotStreak[] => {
    if (state.recentRolls.length === 0) return [];

    const counts: Record<BauCuaSymbol, number> = {
      gourd: 0,
      crab: 0,
      shrimp: 0,
      fish: 0,
      chicken: 0,
      deer: 0,
    };

    state.recentRolls.forEach((roll) => {
      roll.forEach((symbol) => {
        counts[symbol]++;
      });
    });

    const streaks: HotStreak[] = ALL_SYMBOLS.map((symbol) => ({
      symbol,
      count: counts[symbol],
    }));

    return streaks.sort((a, b) => b.count - a.count);
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

    const finalBetAmount = Math.min(
      betAmount,
      myBalance.currentBalance - totalBet,
    );
    // if (totalBet + betAmount > myBalance.currentBalance) return;

    if (finalBetAmount <= 0) {
      setBetError(ts({ en: "Not enough money", vi: "Không đủ tiền" }));
      return;
    }

    // Update local state for instant UI feedback (both host and guests)
    // Only sync to server when ready button is pressed
    if (!isReady) {
      const existingBetIndex = localBets.findIndex((b) => b.symbol === symbol);
      const newLocalBets = [...localBets];

      if (existingBetIndex >= 0) {
        newLocalBets[existingBetIndex].amount += finalBetAmount;
      } else {
        newLocalBets.push({ symbol, amount: finalBetAmount });
      }

      setLocalBets(newLocalBets);
      setBetError(null);
    } else {
      // Already ready: Sync immediately (for any additional bets)
      // game.requestPlaceBet(symbol, finalBetAmount);
      setBetError(
        ts({
          en: "Cancel your bet to change the symbol",
          vi: "Bấm Huỷ cược để thay đổi linh vật",
        }),
      );
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

    // Sync host's local bets if they have any local bets pending
    if (localBets.length > 0 && !isReady) {
      game.requestSyncBets(localBets);
    }

    // Check if any human players (non-bots) haven't placed bets
    const humanPlayers = Object.values(state.playerBalances).filter(
      (p) => !p.isBot,
    );
    const playersWithoutBet = humanPlayers.filter((p) => {
      // Exclude host from this check if they have local bets (which we just synced)
      // or if they are already ready
      if (p.playerId === userId && (localBets.length > 0 || isReady)) {
        return false;
      }
      return (
        (state.currentBets[p.playerId] || []).length === 0 ||
        !state.playersReady[p.playerId]
      );
    });

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

  const renderGameRules = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl relative">
        <button
          onClick={() => setShowRules(false)}
          className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-yellow-500" />
            {ti({ en: "Game Rules", vi: "Luật Chơi" })}
          </h2>

          <div className="space-y-4 text-slate-300 leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <p>
                {ti({
                  en: "Place bets on the symbols you think will appear on the dice. The last player with money wins!",
                  vi: "Đặt cược vào các linh vật bạn nghĩ sẽ xuất hiện trên xúc xắc. Người cuối cùng còn tiền sẽ thắng!",
                })}
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Rules", vi: "Quy Tắc" })}
              </h3>
              <ul className="space-y-2 list-disc pl-4">
                <li>
                  {ti({
                    en: "One symbol matches: Win 1x your bet.",
                    vi: "Trúng 1 linh vật: Ăn 1 lần tiền cược.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Two symbols match: Win 2x your bet.",
                    vi: "Trúng 2 linh vật: Ăn 2 lần tiền cược.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Three symbols match: Win 3x your bet + Jackpot chance!",
                    vi: "Trúng 3 linh vật: Ăn 3 lần tiền cược + Cơ hội nổ hũ!",
                  })}
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Power-ups", vi: "Kỹ Năng" })}
              </h3>
              <p className="mb-2">
                {ti({
                  en: "Can use 1 power-up per round.",
                  vi: "Được dùng 1 kỹ năng mỗi vòng.",
                })}
              </p>
              <ul className="space-y-2 list-disc pl-4">
                {Object.keys(POWERUP_CONFIG).map((key) => (
                  <li key={key}>
                    <strong>{ti(POWERUP_NAMES[key as PowerUpType])}:</strong>{" "}
                    {ti(POWERUP_DESCRIPTIONS[key as PowerUpType])}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Jackpot", vi: "Nổ Hũ" })}
              </h3>
              <ul className="space-y-2 list-disc pl-4">
                <li>
                  {ti({
                    en: `Jackpot is accumulated from ${JACKPOT_PERCENTAGE * 100}% of all bets each round.`,
                    vi: `Hũ được tích lũy từ ${JACKPOT_PERCENTAGE * 100}% tổng tiền cược mỗi vòng.`,
                  })}
                </li>
                <li>
                  {ti({
                    en: `After every ${MEGA_ROUND_INTERVAL} rounds, there will be a Jackpot round.`,
                    vi: `Sau mỗi ${MEGA_ROUND_INTERVAL} vòng, có 1 vòng Nổ Hũ.`,
                  })}
                </li>
                <li>
                  {ti({
                    en: "When 3 same symbols appear, the jackpot is triggered, split equally among those who has correct bet.",
                    vi: "Khi 3 linh vật giống nhau xuất hiện, hũ sẽ nổ, chia đều cho ai cược đúng.",
                  })}
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDices = () => {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 text-center">
          {ti({ vi: "Kết quả xúc xắc", en: "Dice Roll" })}
        </h3>
        <div className="flex justify-center gap-4 mb-4">
          {/* Slot machine style reels */}
          {isRolling || state.diceRoll ? (
            slotReels.map((reel, reelIndex) => {
              const currentPos = slotPositions[reelIndex];
              const finalSymbol = state.diceRoll
                ? state.diceRoll[reelIndex]
                : reel[reel.length - 1];

              return (
                <div
                  key={reelIndex}
                  className="relative w-20 h-20 bg-white rounded-xl overflow-hidden shadow-lg"
                >
                  {isRolling && reel.length > 0 ? (
                    <div
                      className="absolute transition-transform duration-100 ease-linear"
                      style={{
                        transform: `translateY(-${currentPos * 80}px)`,
                      }}
                    >
                      {reel.map((symbol, idx) => (
                        <div
                          key={idx}
                          className="w-20 h-20 flex items-center justify-center text-5xl border-b border-slate-200"
                        >
                          {SYMBOL_NAMES[symbol].emoji}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-20 h-20 flex items-center justify-center text-5xl">
                      {SYMBOL_NAMES[finalSymbol].emoji}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-slate-500 text-center">
              {isReady
                ? ti({
                    vi: "Đang chờ chủ phòng quay xúc xắc...",
                    en: "Waiting for host roll...",
                  })
                : ti({
                    vi: "Vui lòng đặt cược trước...",
                    en: "Please place bets first...",
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

        {game.isHost && state.gamePhase === "results" && (
          <button
            onClick={() => game.requestStartNewRound()}
            className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold transition-colors"
          >
            {ti({ vi: "Vòng tiếp theo", en: "Next Round" })}
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className={`relative w-full h-full flex flex-col @md:gap-4 gap-2 @md:p-2 pb-20 overflow-y-auto ${state.isMegaRound && state.gamePhase === "betting" ? "animate-pulse" : ""}`}
    >
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

      {/* Header */}
      {state.isMegaRound &&
      (state.gamePhase === "betting" ||
        state.gamePhase === "rolling" ||
        state.gamePhase === "results") ? (
        <div className="bg-linear-to-r from-yellow-600 via-orange-500 to-yellow-600 rounded-xl p-4 text-white border-4 border-yellow-400 shadow-lg shadow-yellow-500/50 animate-pulse">
          <h2 className="text-3xl font-bold text-center flex items-center justify-center gap-2">
            <span className="animate-bounce">🌟</span>
            {ti({ vi: "VÒNG NỔ HŨ", en: "MEGA ROUND" })}
            <span className="animate-bounce">🌟</span>
          </h2>
          <p className="text-center text-lg font-bold mt-2">
            {ti({
              vi: `Hũ: ${state.jackpotPool} 💎`,
              en: `Jackpot: ${state.jackpotPool} 💎`,
            })}
          </p>
          <p className="text-center text-sm opacity-90">
            {ti({
              vi: "Ra 3 con giống nhau = Ăn hết Hũ!",
              en: "Triple match = Win the Jackpot!",
            })}
          </p>
        </div>
      ) : (
        <div className="bg-linear-to-r from-slate-600 to-slate-800 rounded-xl p-2 text-white">
          <h2 className="text-2xl font-bold text-center">
            🎲 {ti({ vi: "Bầu Cua", en: "Bau Cua" })} 🎲
          </h2>
          <p className="text-center text-sm opacity-90">
            {ti({
              vi: `Vòng ${state.currentRound}`,
              en: `Round ${state.currentRound}`,
            })}
            {state.jackpotPool > 0 &&
              ` • ${ti({ vi: "Hũ", en: "Jackpot" })}: ${state.jackpotPool} 💎`}
          </p>
        </div>
      )}

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
                    <p className="text-2xl font-bold text-green-400 flex items-center gap-0">
                      {myBalance.currentBalance}
                      {myBalance.balanceHistory.length > 1 && (
                        <span
                          className={`ml-2 text-sm font-bold animate-pulse ${
                            lastProfit >= 0 ? "text-green-300" : "text-red-400"
                          }`}
                        >
                          {lastProfit >= 0 ? "+" : ""}
                          {lastProfit}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">
                      {ti({ vi: "Tổng cược", en: "Total Bet" })}
                    </p>
                    <p className="text-xl font-semibold text-orange-400">
                      {totalBet}
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
                      {!isReady && (
                        <button
                          onClick={() => {
                            setBetError(null);

                            // Clear local bets if not ready yet
                            if (!isReady) {
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
                      )}
                      <button
                        onClick={() => {
                          // Sync local bets to server before toggling ready
                          if (!isReady && localBets.length > 0) {
                            game.requestSyncBets(localBets);
                          }
                          setBetError(null);
                          game.requestToggleReady();
                          setOptimisticReady(!isReady); // Optimistic toggle
                        }}
                        className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:bg-slate-800 disabled:cursor-not-allowed ${
                          isReady
                            ? "bg-red-700 hover:bg-red-800"
                            : "bg-blue-700 hover:bg-blue-800"
                        }`}
                        disabled={myBets.length === 0}
                      >
                        {isReady
                          ? ti({ vi: "Huỷ cược", en: "Cancel Bet" })
                          : ti({ vi: "Đặt cược", en: "Place Bet" })}
                      </button>
                    </div>

                    {/* notify user to select */}
                    {myBets.length === 0 && (
                      <p className="text-sm text-orange-500 pt-2 animate-bounce">
                        {ti({
                          vi: "Vui lòng chọn linh vật",
                          en: "Please select a symbol",
                        })}
                      </p>
                    )}

                    {/* bet error */}
                    {betError && (
                      <p className="text-sm text-red-500 pt-2 animate-bounce">
                        {betError}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Betting Board */}
            <div className="grid grid-cols-3 @md:gap-3 gap-1 relative">
              {/* overlay to show waiting for host to roll */}
              {isReady && state.gamePhase === "betting" && (
                <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center">
                  <p className="text-md text-orange-500 pt-2 animate-bounce">
                    {ti({
                      vi: "Đang chờ chủ phòng quay xúc xắc..",
                      en: "Waiting for host to roll dice..",
                    })}
                  </p>
                </div>
              )}
              {ALL_SYMBOLS.map((symbol) => {
                const betOnThis = getBetOnSymbol(symbol);
                const betsOnSymbol = getBetsOnSymbol(symbol);
                const totalBets = getTotalBetsOnSymbol(symbol);
                const isWinning =
                  state.diceRoll?.includes(symbol) &&
                  state.gamePhase === "results";

                // Get hot streak count for this symbol
                const hotStreaks = getHotStreaks();
                const streakData = hotStreaks.find((s) => s.symbol === symbol);
                const streakCount = streakData?.count || 0;
                const totalRolls = state.recentRolls.length * 3;
                const streakRank = hotStreaks.findIndex(
                  (s) => s.symbol === symbol,
                );
                const isHot = streakRank < 2 && state.recentRolls.length >= 3;
                const isCold = streakRank >= 4 && state.recentRolls.length >= 3;
                const hasAllIn =
                  totalBets > (myBalance?.currentBalance || 0) ||
                  // some player is all-in on this symbol
                  betsOnSymbol.filter((bet) => {
                    const player = state.playerBalances[bet.playerId];
                    return player && player.totalBet >= player.currentBalance;
                  }).length > 0;

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
                    } ${
                      hasAllIn && state.gamePhase === "betting"
                        ? "ring-4 ring-red-500 ring-opacity-75 shadow-lg shadow-red-500/50 animate-pulse"
                        : ""
                    } ${
                      state.isMegaRound && state.gamePhase === "betting"
                        ? "shadow-lg shadow-yellow-500/30"
                        : ""
                    }`}
                  >
                    <div className="text-4xl mb-2">
                      {SYMBOL_NAMES[symbol].emoji}
                    </div>

                    {/* Hot/Cold streak indicator */}
                    {state.recentRolls.length >= 3 && (
                      <div className="absolute @md:top-2 @md:left-2 top-1 left-1 flex items-center gap-1 bg-black/60 px-2 py-1 rounded-full text-xs font-bold">
                        {isHot && "🔥"}
                        {isCold && "❄️"}
                        <span
                          className={
                            isHot
                              ? "text-orange-400"
                              : isCold
                                ? "text-cyan-400"
                                : "text-slate-300"
                          }
                        >
                          {/* {streakCount}/{totalRolls} */}
                          {Math.round((streakCount / totalRolls) * 100)}%
                        </span>
                      </div>
                    )}

                    {/* All-in indicator */}
                    {hasAllIn && state.gamePhase === "betting" && (
                      <div className="absolute @md:top-2 @md:left-2 top-1 left-1 bg-red-600 text-white px-2 py-1 rounded-full text-xs font-bold animate-bounce flex items-center gap-1">
                        🔥 ALL-IN
                      </div>
                    )}
                    <div className="text-sm font-semibold mb-2">
                      {ti(SYMBOL_NAMES[symbol])}
                    </div>

                    {/* My bet */}
                    {betOnThis > 0 && (
                      <div className="absolute @md:top-2 @md:right-2 top-1 right-1 bg-white text-black px-2 py-1 rounded-full text-xs font-bold">
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

            {/* Power-ups Panel */}
            {myBalance && state.playerPowerUps[userId] && (
              <div className="flex flex-col gap-2 bg-slate-800/50 backdrop-blur-sm rounded-xl @md:p-4 p-2 border border-slate-700">
                <h3 className="text-sm font-semibold mb-3 text-slate-300">
                  {ti({ vi: "Kỹ năng", en: "Power-ups" })}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    Object.keys(state.playerPowerUps[userId]) as PowerUpType[]
                  ).map((powerUpType) => {
                    const powerUp = state.playerPowerUps[userId][powerUpType];
                    const isSelected = selectedPowerUpType === powerUpType;
                    const isActive =
                      state.activePowerUps[userId] === powerUpType;
                    const isAvailable = powerUp.cooldown === 0 && !isActive;

                    return (
                      <button
                        key={powerUpType}
                        onClick={() =>
                          setSelectedPowerUpType(
                            isSelected ? null : powerUpType,
                          )
                        }
                        // disabled={!isAvailable && !isSelected}
                        className={`relative p-3 rounded-lg border-2 transition-all cursor-pointer ${
                          isActive
                            ? "bg-linear-to-br from-green-600 to-emerald-600 border-green-400"
                            : isSelected
                              ? "bg-linear-to-br from-blue-600 to-purple-600 border-blue-400 ring-2 ring-blue-300"
                              : isAvailable
                                ? "bg-slate-700 border-slate-600 hover:border-blue-400 hover:bg-slate-600"
                                : "bg-slate-800 border-slate-700 opacity-50"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div className="text-xl">
                            {getPowerUpIcon(powerUpType)}
                          </div>
                          <div className="text-xs font-semibold truncate w-full text-center">
                            {ti(POWERUP_NAMES[powerUpType])}
                          </div>
                          {!isAvailable && !isSelected && !isActive && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg">
                              <span className="text-2xl font-bold text-white">
                                {powerUp.cooldown}
                              </span>
                            </div>
                          )}
                          {isActive && (
                            <div className="text-xs text-green-300 font-bold">
                              ✓ {ti({ vi: "Đang dùng", en: "Active" })}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Show active power-up description (if not prediction-based) */}
                {selectedPowerUpType && (
                  <div className="p-3 bg-purple-600/20 border border-purple-500 rounded-lg">
                    <p className="text-xs text-purple-300 font-semibold mb-1">
                      ⚡ {ti(POWERUP_NAMES[selectedPowerUpType])}
                    </p>
                    <p className="text-xs text-slate-300">
                      {ti(POWERUP_DESCRIPTIONS[selectedPowerUpType])}
                    </p>
                  </div>
                )}

                {/* Activate button */}
                {selectedPowerUpType &&
                  !state.activePowerUps[userId] &&
                  state.gamePhase === "betting" && (
                    <button
                      onClick={() => {
                        game.requestActivatePowerUp(selectedPowerUpType);
                        // Optimistic update
                        setOptimisticPowerUp(selectedPowerUpType);
                        setSelectedPowerUpType(null);
                      }}
                      disabled={selectedPowerUp && selectedPowerUp.cooldown > 0}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors"
                    >
                      {selectedPowerUp && selectedPowerUp.cooldown > 0
                        ? ts({
                            en: `🪫 Wait for cooldown (${selectedPowerUp.cooldown} rounds left)`,
                            vi: `🪫 Đang hồi chiêu (còn ${selectedPowerUp.cooldown} vòng)`,
                          })
                        : ts({
                            en: "⚡ Use Power-up",
                            vi: "⚡ Sử dụng kỹ năng",
                          })}
                    </button>
                  )}

                {/* Cancel button for post_roll power-ups */}
                {state.activePowerUps[userId] &&
                  state.playerPowerUps[userId] &&
                  POWERUP_CONFIG[state.activePowerUps[userId]]?.timing ===
                    "post_roll" && (
                    <button
                      onClick={() => {
                        game.requestDeactivatePowerUp();
                        setOptimisticPowerUp(null); // Clear optimistic immediately
                      }}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      {ti({ vi: "Huỷ kỹ năng", en: "Cancel Power-up" })}
                    </button>
                  )}

                {/* Show prediction for Mắt Thần */}
                {state.powerUpPredictions[userId] && (
                  <div className="p-3 bg-green-600/20 border border-green-500 rounded-lg">
                    <p className="text-xs text-green-300 font-semibold mb-2">
                      🔮{" "}
                      {ti({
                        vi: "Dự đoán của Mắt Thần",
                        en: "Mystic Prediction",
                      })}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="text-3xl flex items-center">
                        <span className="mr-2 text-xl">
                          {ti(
                            SYMBOL_NAMES[
                              state.powerUpPredictions[userId].symbol
                            ],
                          )}
                        </span>
                        {
                          SYMBOL_NAMES[state.powerUpPredictions[userId].symbol]
                            .emoji
                        }
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">
                          {ti({ vi: "Độ chính xác", en: "Accuracy" })}
                        </p>
                        <p className="text-lg font-bold text-purple-300">
                          {Math.round(
                            state.powerUpPredictions[userId].accuracy * 100,
                          )}
                          %
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar: Dice & Leaderboard */}
          <div className="flex flex-col gap-4">
            {/* Dice Display */}
            {renderDices()}

            {/* Dice in fixed modal for mobile */}
            {createPortal(
              <div
                className={`fixed top-0 left-0 right-0 bottom-0 bg-slate-900/90 backdrop-blur-sm rounded-xl p-2 z-50 md:hidden ${isRolling ? "flex" : "hidden"} items-center justify-center`}
              >
                <div className="flex items-center justify-between">
                  {renderDices()}
                </div>
              </div>,
              document.getElementById("root")!,
            )}

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
                      player.playerId === userId
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-yellow-500 transition-colors z-50 shadow-lg border border-slate-500"
        title={ts({ en: "Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={24} />
      </button>

      {/* Rules Modal */}
      {showRules && createPortal(renderGameRules(), document.body)}
    </div>
  );
}
