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
  POWERUP_CONFIG,
  JACKPOT_PERCENTAGE,
  MEGA_ROUND_INTERVAL,
  MAX_SYMBOLS_PER_PLAYER,
  RICH_MODE_TARGETS,
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
  Star,
} from "lucide-react";
import { createPortal } from "react-dom";
import { formatPrice } from "../../utils";
import BettingModal from "./BettingModal";

// Get power-up icon
const getPowerUpIcon = (type: PowerUpType) => {
  const iconMap = {
    double_down: <Zap className="w-5 h-5" />,
    insurance: <Shield className="w-5 h-5" />,
    reveal_one: <Eye className="w-5 h-5" />,
    lucky_star: <Star className="w-5 h-5" />,
  };
  return iconMap[type];
};

export default function BauCuaUI({
  game: baseGame,
  currentUserId: userId = "",
}: GameUIProps) {
  const game = baseGame as BauCua;
  const [state, setState] = useState<BauCuaState>(game.getState());
  // Removed global betAmount state as it's now handled in the modal
  const { confirm: showConfirm, show: showAlert } = useAlertStore();
  const { ti, ts } = useLanguage();
  const { currentRoom } = useRoomStore();

  // Local bets for guests (before syncing to host)
  const [showGameOverModal, setShowGameOverModal] = useState(true);
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
  const [selectedSymbolForBet, setSelectedSymbolForBet] =
    useState<BauCuaSymbol | null>(null);

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

  const myBalance = userId ? state.playerBalances[userId] : undefined;
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
  const myBetOnSelectedSymbol = selectedSymbolForBet
    ? myBets
        .filter((bet) => bet.symbol === selectedSymbolForBet)
        .reduce((sum, bet) => sum + bet.amount, 0)
    : 0;
  const myTotalBet = myBets.reduce((sum, bet) => sum + bet.amount, 0);
  const myLastProfit = myBalance
    ? myBalance.currentBalance -
      myBalance.balanceHistory[myBalance.balanceHistory.length - 2]
    : 0;

  const availableBalance = myBalance
    ? myBalance.currentBalance - myTotalBet
    : 0;

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

  // Handle bet button click (Open modal)
  const handleSymbolClick = (symbol: BauCuaSymbol) => {
    if (state.gamePhase !== "betting") return;
    if (!myBalance) return;

    // Check if user has enough money to place a minimum bet
    const availableBalance = myBalance.currentBalance - myTotalBet;

    if (
      availableBalance < MIN_BET &&
      !myBets.find((b) => b.symbol === symbol)
    ) {
      showAlert(
        ts({
          vi:
            "Bạn không đủ tiền để đặt cược (tối thiểu " +
            formatPrice(MIN_BET) +
            ")",
          en: "Insufficient funds (minimum " + formatPrice(MIN_BET) + ")",
        }),
        { type: "error", title: ts({ vi: "Hết tiền!", en: "Out of money!" }) },
      );
      return;
    }

    setSelectedSymbolForBet(symbol);
  };

  // Handle confirm bet from modal
  const handlePlaceBet = (amount: number) => {
    if (!selectedSymbolForBet) return;
    const symbol = selectedSymbolForBet;

    if (state.gamePhase !== "betting") return;
    if (!myBalance) return;

    const finalBetAmount = Math.min(
      amount,
      myBalance.currentBalance - myTotalBet,
    );

    if (finalBetAmount < MIN_BET) {
      setBetError(
        ts({ en: `Minimum bet is `, vi: `Cược tối thiểu ` }) +
          formatPrice(MIN_BET),
      );
      return;
    }

    // Update local state for instant UI feedback (both host and guests)
    // Only sync to server when ready button is pressed
    if (!isReady) {
      console.log(localBets);
      if (localBets.length >= MAX_SYMBOLS_PER_PLAYER) {
        setBetError(
          ts({
            en: "Maximum 3 bets only",
            vi: "Chỉ được đặt tối đa 3 linh vật ",
          }),
        );
        return;
      }

      const existingBetIndex = localBets.findIndex((b) => b.symbol === symbol);
      const newLocalBets = [...localBets];

      if (existingBetIndex >= 0) {
        newLocalBets[existingBetIndex].amount = finalBetAmount;
      } else {
        newLocalBets.push({ symbol, amount: finalBetAmount });
      }

      setLocalBets(newLocalBets);
      setBetError(null);
    } else {
      // Already ready
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
      // exclude players with no money
      if (p.currentBalance < MIN_BET) {
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
          vi: `Có ${playersWithoutBet.length} người chưa sẵn sàng (${playersWithoutBet.map((p) => p.username).join(", ")}). Bạn có muốn lắc xúc xắc luôn không? `,
          en: `${playersWithoutBet.length} player(s) haven't ready yet (${playersWithoutBet.map((p) => p.username).join(", ")}). Roll dice anyway? `,
        }),
        ts({ vi: "Lắc xúc xắc", en: "Roll Dice" }),
      );

      if (!confirmed) return;
    }

    game.requestRollDice();
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

  // Render Game Over Screen
  const renderGameOver = () => {
    if (!showGameOverModal) return null;
    return createPortal(
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
        <div className="bg-slate-900 border-2 border-yellow-500 rounded-2xl max-w-lg w-full p-8 shadow-2xl relative overflow-hidden">
          <div className="text-center space-y-6 relative z-10">
            {state.winners && state.winners.length > 0 ? (
              <>
                <h2 className="text-4xl font-bold text-yellow-500 animate-bounce">
                  {state.winners.length > 1
                    ? ti({ vi: "CHIẾN THẮNG", en: "WINNERS" })
                    : ti({ vi: "CHIẾN THẮNG", en: "WINNER" })}
                </h2>

                <div className="flex flex-col gap-4 items-center justify-center py-4">
                  {state.winners.map((winnerId) => {
                    const player = state.playerBalances[winnerId];
                    if (!player) return null;
                    return (
                      <div
                        key={winnerId}
                        className="bg-slate-800/80 p-4 rounded-xl border border-yellow-500/50 min-w-[200px] flex flex-col items-center gap-2 transform hover:scale-105 transition-transform"
                      >
                        <div className="text-4xl">👑</div>
                        <div className="text-2xl font-bold text-white">
                          {player.username}
                        </div>
                        <div className="text-yellow-400 font-bold text-xl">
                          {formatPrice(player.currentBalance)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-4xl font-bold text-slate-400">
                  {ti({ vi: "KẾT THÚC", en: "GAME OVER" })}
                </h2>
                <p className="text-slate-300 text-lg">
                  {ti({
                    vi: "Không có người chiến thắng",
                    en: "No winner this time",
                  })}
                </p>
                <p className="text-slate-500 text-sm italic">
                  {ti({
                    vi: "Tất cả người chơi đều đã hết tiền",
                    en: "All players ran out of money",
                  })}
                </p>
              </>
            )}

            {game.isHost && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => game.requestResetGame()}
                  className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-xl shadow-lg hover:shadow-green-500/50 transition-all transform hover:-translate-y-1"
                >
                  {ti({ vi: "Chơi lại", en: "Play Again" })} 🔄
                </button>
              </div>
            )}

            {!game.isHost && (
              <p className="text-slate-500 animate-pulse">
                {ti({
                  vi: "Đang chờ chủ phòng chơi lại...",
                  en: "Waiting for host to reset...",
                })}
              </p>
            )}

            {/* close modal button */}
            <button
              onClick={() => setShowGameOverModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  const renderGameRules = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
        <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-yellow-500" />
            {ti({ en: "Game Rules", vi: "Luật Chơi: Bầu cua" })}
          </h2>
          <button
            onClick={() => setShowRules(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-slate-300 leading-relaxed">
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mt-4">
              {ti({ en: "Objective", vi: "Mục tiêu" })}
            </h3>
            <p>
              {ti({
                en: "Place bets on the symbols you think will appear on the dice.",
                vi: "Đặt cược vào các linh vật bạn nghĩ sẽ xuất hiện trên xúc xắc.",
              })}
            </p>
            <p>
              {ti({
                vi: "2 chế độ chơi: ",
                en: "2 game modes: ",
              })}
            </p>
            <ul className="list-disc pl-4">
              <li>
                💀{" "}
                {ti({
                  vi: "Sinh tồn: Ai sống sót (còn tiền) cuối cùng sẽ thắng.",
                  en: "Survival: Last player standing (with money) wins.",
                })}
              </li>
              <li>
                💰{" "}
                {ti({
                  vi: "Giàu có: Ai kiếm được tiền đạt mục tiêu trước sẽ thắng.",
                  en: "Rich: The first player to reach the target amount wins.",
                })}
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-400 mt-4">
              {ti({ en: "Rules", vi: "Quy Tắc" })}
            </h3>
            <ul className="list-disc pl-4">
              <li>
                {ti({
                  en: "Max 3 bets each round.",
                  vi: "Đặt cược nhiều nhất 3 linh vật mỗi vòng.",
                })}
              </li>
              <li>
                {ti({
                  en: "Press Ready and wait host to roll dices.",
                  vi: "Bấm sẵn sàng và đợi chủ phòng quay xúc xắc.",
                })}
              </li>
              <li>
                ✅{" "}
                {ti({
                  en: "Each symbol matches: Win 2x your bet.",
                  vi: "Cược đúng linh vật: Nhận x2 tiền cược của linh vật đó.",
                })}
              </li>
              <li>
                ❌{" "}
                {ti({
                  en: "Each symbol not matches: Lose bet on that symbol.",
                  vi: "Cược sai linh vật: Mất tiền cược.",
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
            <ul className="list-disc pl-4">
              {Object.keys(POWERUP_CONFIG).map((key) => (
                <li key={key}>
                  <strong>
                    {ti(POWERUP_CONFIG[key as PowerUpType].emoji)}{" "}
                    {ti(POWERUP_CONFIG[key as PowerUpType].name)}:
                  </strong>{" "}
                  {ti(POWERUP_CONFIG[key as PowerUpType].description)}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-400 mt-4">
              {ti({ en: "Jackpot", vi: "Nổ Hũ" })} 💎
            </h3>
            <ul className="list-disc pl-4">
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
  );

  const renderDices = () => {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 text-center">
          {ti({ vi: "Kết quả xúc xắc", en: "Dice Roll" })}
        </h3>
        <div className="flex justify-center gap-2 mb-4">
          {/* Slot machine style reels */}
          {isRolling || state.diceRoll ? (
            slotReels.map((reel, reelIndex) => {
              const currentPos = slotPositions[reelIndex];
              const finalSymbol = state.diceRoll
                ? state.diceRoll[reelIndex]
                : reel[reel.length - 1];

              const isCorrectBet =
                !isRolling &&
                state.diceRoll &&
                myBets.some((bet) => bet.symbol === finalSymbol);

              return (
                <div
                  key={reelIndex}
                  className={`relative w-20 h-20 bg-white rounded-xl overflow-hidden shadow-lg ${isCorrectBet ? "bg-linear-to-t from-green-300 to-blue-200 border-3 border-green-500" : ""}`}
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
                    <div
                      className={`w-20 h-20 flex items-center justify-center text-5xl ${
                        isCorrectBet ? "animate-bounce" : ""
                      }`}
                    >
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
                : !myBets.length
                  ? availableBalance < MIN_BET
                    ? ti({
                        vi: "Bạn đã hết tiền...",
                        en: "You are out of money...",
                      })
                    : ti({
                        vi: "Vui lòng đặt cược trước...",
                        en: "Please place bets first...",
                      })
                  : !game.isHost
                    ? ti({
                        vi: "Vui lòng bấm Sẵn sàng...",
                        en: "Please press Ready...",
                      })
                    : null}
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

  const renderWaitingPhase = () => {
    return (
      <div className="space-y-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl @md:p-6 p-2 py-6 border border-slate-700">
          <p className="text-xl mb-4 text-center">
            {ti({
              vi: "Đang chờ bắt đầu game...",
              en: "Waiting to start game...",
            })}
          </p>

          {/* Game Mode Selection (Host Only) */}
          {game.isHost && (
            <div className="mb-6 p-4 bg-slate-700/50 rounded-xl border border-slate-600">
              <h3 className="text-lg font-semibold mb-3 text-white text-center">
                {ti({ vi: "Cài đặt phòng", en: "Room Settings" })}
              </h3>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => game.requestSetGameMode(0)}
                    className={`px-4 py-2 rounded-lg font-bold transition-all ${
                      state.minBalanceToWin === 0
                        ? "bg-red-600 text-white ring-2 ring-red-400"
                        : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                    }`}
                  >
                    ☠️ {ti({ vi: "Sinh tồn", en: "Survival" })}
                  </button>
                  <button
                    onClick={() => game.requestSetGameMode(100000000)}
                    className={`px-4 py-2 rounded-lg font-bold transition-all ${
                      state.minBalanceToWin > 0
                        ? "bg-yellow-600 text-white ring-2 ring-yellow-400"
                        : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                    }`}
                  >
                    🏆 {ti({ vi: "Giàu có", en: "Rich" })}
                  </button>
                </div>

                {state.minBalanceToWin > 0 && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <div className="text-sm text-center text-slate-300 mb-2">
                      {ti({
                        vi: "Mục tiêu chiến thắng:",
                        en: "Winning Goal:",
                      })}
                    </div>
                    <div className="flex flex-wrap justify-center gap-1">
                      {RICH_MODE_TARGETS.map((val) => (
                        <button
                          key={val}
                          onClick={() => game.requestSetGameMode(val)}
                          className={`px-3 py-1 text-xs rounded-full border ${
                            state.minBalanceToWin === val
                              ? "bg-yellow-500/20 border-yellow-500 text-yellow-300"
                              : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400"
                          }`}
                        >
                          {formatPrice(val)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-center text-slate-400 mt-2 italic">
                  {state.minBalanceToWin === 0
                    ? ti({
                        vi: "Người sống sót cuối cùng sẽ chiến thắng.",
                        en: "The last player with money wins.",
                      })
                    : ti({
                        vi: "Người đầu tiên đạt mức tiền này sẽ chiến thắng.",
                        en: "First player to reach this balance wins.",
                      })}
                </div>
              </div>
            </div>
          )}

          {!game.isHost && (
            <div className="mb-6 text-center">
              <div className="inline-block px-4 py-2 rounded-lg bg-black/30 border border-slate-600">
                {state.minBalanceToWin === 0 ? (
                  <div className="text-red-400 font-bold flex items-center gap-2">
                    <span>☠️</span>{" "}
                    {ti({ vi: "Chế độ: Sinh tồn", en: "Mode: Survival" })}
                  </div>
                ) : (
                  <div className="text-yellow-400 font-bold flex items-center gap-2">
                    <span>🏆</span>{" "}
                    {ti({ vi: "Chế độ: Đua top", en: "Rich Mode" })}
                    <span className="text-white">
                      ({formatPrice(state.minBalanceToWin)})
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

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
                      {formatPrice(player.currentBalance)}💰
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
    );
  };

  const renderBetBoard = () => {
    return (
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
            state.diceRoll?.includes(symbol) && state.gamePhase === "results";

          // Get hot streak count for this symbol
          const hotStreaks = getHotStreaks();
          const streakData = hotStreaks.find((s) => s.symbol === symbol);
          const streakCount = streakData?.count || 0;
          const totalRolls = state.recentRolls.length * 3;
          const streakRank = hotStreaks.findIndex((s) => s.symbol === symbol);
          const isHot = streakRank < 2 && state.recentRolls.length >= 3;
          const isCold = streakRank >= 4 && state.recentRolls.length >= 3;
          const hasAllIn =
            // i am all-in
            ((isReady || game.isHost) &&
              myBalance?.currentBalance &&
              betOnThis >= (myBalance?.currentBalance || 0)) ||
            // some player is all-in on this symbol
            betsOnSymbol.filter((bet) => {
              const player = state.playerBalances[bet.playerId];
              const bets = state.currentBets[bet.playerId];
              return (
                player &&
                player.totalBet >= player.currentBalance &&
                bets.length === 1
              );
            }).length > 0;

          return (
            <button
              key={symbol}
              onClick={() => handleSymbolClick(symbol)}
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
              }`}
            >
              <div className="text-4xl mb-2">{SYMBOL_NAMES[symbol].emoji}</div>

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
                    {streakCount}/{totalRolls}
                    {/* {Math.round((streakCount / totalRolls) * 100)}% */}
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
                  {formatPrice(betOnThis)}
                </div>
              )}

              {/* All bets on this symbol */}
              {betsOnSymbol.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs font-bold text-yellow-400 border-t border-slate-600 pt-2">
                    {ti({ vi: `Tổng: `, en: `Total: ` })}
                    {formatPrice(totalBets)}
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
                          {formatPrice(bet.amount)}
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
    );
  };

  const renderLeaderBoard = () => {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
        <h3 className="text-lg font-semibold mb-3">
          {ti({ vi: "Bảng xếp hạng", en: "Leaderboard" })}
        </h3>
        <div className="space-y-2 max-h-120 overflow-y-auto">
          {getLeaderboard().map((pBalance, idx) => {
            const lastProfit =
              pBalance.balanceHistory.length > 1
                ? pBalance.currentBalance -
                  pBalance.balanceHistory[pBalance.balanceHistory.length - 2]
                : 0;

            return (
              <div
                key={pBalance.playerId}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  pBalance.playerId === userId
                    ? "bg-blue-600/30 border border-blue-500"
                    : "bg-slate-700/50"
                }`}
              >
                <div className="flex items-center gap-3 flex-1 text-left">
                  <span className="text-xl font-bold text-slate-400">
                    #{idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {pBalance.username}
                      {pBalance.isBot && " 🤖"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {ti({ vi: `Cược: `, en: `Bet: ` })}
                      {formatPrice(pBalance.totalBet)}
                      {state.playersReady[pBalance.playerId] && " ✓"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ">
                  {/* Mini sparkline */}
                  {state.currentRound > 0 &&
                    renderMiniSparkline(pBalance.balanceHistory)}
                  <div className="flex flex-col items-end gap-0">
                    <p className="text-lg font-bold text-green-400">
                      {formatPrice(pBalance.currentBalance)}
                    </p>
                    <span
                      className={`text-xs ${lastProfit >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {lastProfit > 0 ? "+" : ""}
                      {formatPrice(lastProfit)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMainGameArea = () => {
    return (
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
                    {formatPrice(myBalance.currentBalance)}
                    {myBalance.balanceHistory.length > 1 && (
                      <span
                        className={`ml-2 text-sm font-bold animate-pulse ${
                          myLastProfit >= 0 ? "text-green-300" : "text-red-400"
                        }`}
                      >
                        {myLastProfit >= 0 ? "+" : ""}
                        {formatPrice(myLastProfit)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400">
                    {ti({ vi: "Tổng cược", en: "Total Bet" })}
                  </p>
                  <p className="text-xl font-semibold text-orange-400">
                    {formatPrice(myTotalBet)}
                  </p>
                </div>
              </div>

              {state.gamePhase === "betting" && (
                <>
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
                    {!game.isHost && (
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
                          ? ti({ vi: "Huỷ sẵn sàng", en: "Cancel Ready" })
                          : availableBalance < MIN_BET && myBets.length === 0
                            ? ti({ vi: "Hết tiền", en: "Out of money" })
                            : ti({ vi: "Sẵn sàng", en: "Ready" })}
                      </button>
                    )}
                  </div>

                  {/* notify user to select */}
                  {myBets.length === 0 ? (
                    availableBalance < MIN_BET ? (
                      <p className="text-sm text-red-500 pt-2 animate-bounce">
                        {ti({
                          vi: "Bạn không đủ tiền cược",
                          en: "Insufficient funds",
                        })}
                      </p>
                    ) : (
                      <p className="text-sm text-orange-500 pt-2 animate-bounce">
                        {ti({
                          vi: "Vui lòng chọn linh vật",
                          en: "Please select a symbol",
                        })}
                      </p>
                    )
                  ) : !isReady && !game.isHost ? (
                    <p className="text-sm text-orange-500 pt-2 animate-bounce">
                      {ti({
                        vi: "Bấm Sẵn sàng khi đặt cược xong",
                        en: "Press Ready when you finish betting",
                      })}
                    </p>
                  ) : null}

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
          {renderBetBoard()}

          {/* Power-ups Panel */}
          {myBalance && state.playerPowerUps[userId] && (
            <div className="flex flex-col gap-2 bg-slate-800/50 backdrop-blur-sm rounded-xl @md:p-4 p-2 border border-slate-700">
              <h3 className="font-semibold mb-3 text-slate-300">
                {ti({ vi: "Kỹ năng", en: "Power-ups" })}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {(
                  Object.keys(state.playerPowerUps[userId]) as PowerUpType[]
                ).map((powerUpType) => {
                  const powerUp = state.playerPowerUps[userId][powerUpType];
                  const isSelected = selectedPowerUpType === powerUpType;
                  const isActive = state.activePowerUps[userId] === powerUpType;
                  const isAvailable = powerUp.cooldown === 0 && !isActive;

                  return (
                    <button
                      key={powerUpType}
                      onClick={() =>
                        setSelectedPowerUpType(isSelected ? null : powerUpType)
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
                        {getPowerUpIcon(powerUpType)}
                        <div className="text-sm font-semibold truncate w-full text-center">
                          {ti(POWERUP_CONFIG[powerUpType].name)}
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
                  <p className="text-sm text-purple-300 font-semibold mb-1">
                    {ti(POWERUP_CONFIG[selectedPowerUpType].name)}
                  </p>
                  <p className="text-sm text-slate-300">
                    {ti(POWERUP_CONFIG[selectedPowerUpType].description)}
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
                            state.powerUpPredictions[userId]?.symbol
                          ],
                        )}
                      </span>
                      {
                        SYMBOL_NAMES[state.powerUpPredictions[userId]?.symbol]
                          ?.emoji
                      }
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">
                        {ti({ vi: "Độ chính xác", en: "Accuracy" })}
                      </p>
                      <p className="text-lg font-bold text-purple-300">
                        {Math.round(
                          state.powerUpPredictions[userId]?.accuracy * 100,
                        )}
                        %
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* Show result for Lucky Star */}
              {state.playerPowerUps[userId]?.lucky_star?.lastMultiplier &&
                state.gamePhase === "results" &&
                state.playerPowerUps[userId].lucky_star.lastUsedRound ===
                  state.currentRound && (
                  <div className="p-3 bg-yellow-600/20 border border-yellow-500 rounded-lg mt-2">
                    <p className="text-xs text-yellow-300 font-semibold mb-2">
                      🌟{" "}
                      {ti({
                        vi: "Kết quả Sao May Mắn",
                        en: "Lucky Star Result",
                      })}
                    </p>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-yellow-300">
                        x
                        {state.playerPowerUps[
                          userId
                        ].lucky_star.lastMultiplier?.toFixed(1)}
                      </p>
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
              className={`fixed top-0 left-0 right-0 bottom-0 bg-slate-900/90 backdrop-blur-sm rounded-xl p-2 z-50 ${isRolling ? "flex" : "hidden"} md:hidden items-center justify-center`}
            >
              <div className="flex items-center justify-between">
                {renderDices()}
              </div>
            </div>,
            document.getElementById("root")!,
          )}

          {/* Leaderboard with Sparklines */}
          {renderLeaderBoard()}
        </div>
      </div>
    );
  };

  return (
    <>
      <BettingModal
        isOpen={!!selectedSymbolForBet}
        onClose={() => setSelectedSymbolForBet(null)}
        onConfirm={handlePlaceBet}
        onClear={() => {
          setLocalBets((prev) =>
            prev.filter((bet) => bet.symbol !== selectedSymbolForBet),
          );
          setSelectedSymbolForBet(null);
        }}
        currentBets={localBets}
        symbol={selectedSymbolForBet}
        currentBalance={myBalance ? myBalance.currentBalance - myTotalBet : 0}
        currentBet={myBetOnSelectedSymbol}
      />
      <div
        className={`relative w-full h-full flex flex-col @md:gap-4 gap-2 @md:p-2 pb-20 overflow-y-auto`}
      >
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
              {ti({ vi: `Hũ: `, en: `Jackpot: ` })}
              {formatPrice(state.jackpotPool)} 💎
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
                ` • ${ti({ vi: "Hũ", en: "Jackpot" })}: ${formatPrice(state.jackpotPool)} 💎`}
            </p>
            {/* Show Game Mode Info */}
            <div className="text-center text-xs mt-1 text-yellow-300 font-semibold bg-black/20 py-1 rounded-lg">
              {state.minBalanceToWin === 0 ? (
                <span>
                  ☠️ {ti({ vi: "Chế độ: Sinh tồn", en: "Mode: Survival" })}
                </span>
              ) : (
                <span>
                  🏆 {ti({ vi: "Chế độ: Đua top", en: "Mode: Rich" })} (
                  {ti({ vi: "Mục tiêu: ", en: "Goal: " })}
                  {formatPrice(state.minBalanceToWin)})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Waiting Phase */}
        {state.gamePhase === "waiting" && renderWaitingPhase()}

        {/* Main Game Area */}
        {state.gamePhase !== "waiting" && renderMainGameArea()}

        {/* Game Over Screen */}
        {state.gamePhase === "ended" && renderGameOver()}

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
    </>
  );
}
