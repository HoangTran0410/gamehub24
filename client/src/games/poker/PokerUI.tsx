import { useEffect, useState, useMemo } from "react";
import Poker from "./Poker";
import type { PokerState, PokerPlayer, Card } from "./types";
import {
  SUIT_SYMBOLS,
  RANK_DISPLAY,
  Suit,
  HAND_NAMES,
  GAME_PHASES,
} from "./types";
import type { GameUIProps } from "../types";
import {
  User,
  Bot,
  Crown,
  X,
  Plus,
  Minus,
  DollarSign,
  Trophy,
  RotateCcw,
  BookOpen,
  Play,
  Coins,
  Disc,
} from "lucide-react";
import useLanguage from "../../stores/languageStore";
import { createPortal } from "react-dom";
import { useAlertStore } from "../../stores/alertStore";

export default function PokerUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Poker;
  const [state, setState] = useState<PokerState>(game.getState());
  // const { username } = useUserStore();
  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showRules, setShowRules] = useState(false);

  const isHost = game.isHost;
  const myIndex = game.getMyPlayerIndex();
  const mySlot = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = state.currentTurnIndex === myIndex;

  useEffect(() => {
    return game.onUpdate((newState) => {
      setState(newState);
      // Reset raise amount when turn changes or round changes?
      // Better to set default raise amount based on new state minRaise
      // but only if it's my turn?
    });
  }, [game]);

  // Update local raise amount when minRaise changes or it becomes my turn
  useEffect(() => {
    if (isMyTurn) {
      const minRaise = state.minRaise;
      const currentBet = state.currentBet;
      // Default raise to: currentBet + minRaise
      // Or if no bet yet, minRaise (Big Blind usually)
      setRaiseAmount(currentBet + minRaise);
    }
  }, [isMyTurn, state.minRaise, state.currentBet]);

  const handleFold = () => {
    game.requestFold();
  };

  const handleCheck = () => {
    game.requestCheck();
  };

  const handleCall = () => {
    game.requestCall();
  };

  const handleRaise = () => {
    game.requestRaise(raiseAmount);
  };

  const handleAllIn = () => {
    game.requestAllIn();
  };

  // Helper to get formatted players for circular table
  const arrangedPlayers = useMemo(() => {
    const result = [];
    const baseIndex = myIndex >= 0 ? myIndex : 0;
    // Show 6 seats
    for (let i = 0; i < 6; i++) {
      const actualIndex = (baseIndex + i) % 6;
      result.push({ slot: state.players[actualIndex], actualIndex });
    }
    return result;
  }, [state.players, myIndex]);

  const renderGameRules = () => {
    return (
      <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-slate-800 border-b border-slate-700 shrink-0">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({
                en: "How to Play Poker",
                vi: "Luật Chơi Poker",
              })}
            </h2>
            <button
              onClick={() => setShowRules(false)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto space-y-8 text-slate-300">
            {/* Objective */}
            <section>
              <p className="text-base text-slate-100 italic border-l-4 border-yellow-500 pl-4 py-1 bg-yellow-500/10 rounded-r">
                {ti({
                  en: "Create the best 5-card hand using your 2 hole cards and 5 community cards.",
                  vi: "Tạo ra tay bài 5 lá mạnh nhất từ 2 lá bài tẩy của bạn và 5 lá bài chung.",
                })}
              </p>
            </section>

            {/* Chips & Economy */}
            <section>
              <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
                <Coins className="w-5 h-5" />
                {ti({ en: "Chips & Blinds", vi: "Tiền & Mù" })}
              </h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>
                    {ti({ en: "Starting Chips", vi: "Tiền khởi điểm" })}
                  </span>
                  <span className="font-bold text-yellow-500">1000</span>
                </li>
                <li className="flex justify-between border-b border-slate-800 pb-1">
                  <span>
                    {ti({ en: "Blinds (Small/Big)", vi: "Tiền mù (Nhỏ/Lớn)" })}
                  </span>
                  <span className="font-bold text-white">10 / 20</span>
                </li>
                <li className="text-xs text-slate-400 italic mt-2">
                  {ti({
                    en: "Auto-Rebuy: Chips reset to 1000 if you go bankrupt (Next Hand).",
                    vi: "Tự động bơm tiền: Reset về 1000 nếu bạn cháy túi (Ván sau).",
                  })}
                </li>
              </ul>
            </section>

            {/* Dealer Info */}
            <section>
              <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
                <Disc className="w-5 h-5" />
                {ti({ en: "Dealer Position", vi: "Vị trí Dealer" })}
              </h3>
              <p className="text-sm text-slate-300 mb-2">
                {ti({
                  en: "The Dealer button (D) moves clockwise each hand. It determines who posts Blinds and acts last after the flop.",
                  vi: "Nút Dealer (D) di chuyển theo chiều kim đồng hồ mỗi ván. Nó xác định ai đặt tiền mù và ai hành động cuối cùng sau khi chia bài chung.",
                })}
              </p>
            </section>

            {/* Hand Rankings */}
            <section>
              <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                {ti({ en: "Hand Rankings", vi: "Thứ tự tay bài" })}
                <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded ml-auto">
                  {ti({ en: "Strongest to Weakest", vi: "Từ mạnh đến yếu" })}
                </span>
              </h3>
              <div className="space-y-2 text-sm">
                {[
                  {
                    id: HandRanking.ROYAL_FLUSH,
                    desc: {
                      en: "A, K, Q, J, 10 same suit",
                      vi: "Sảnh rồng đồng chất (A-10)",
                    },
                  },
                  {
                    id: HandRanking.STRAIGHT_FLUSH,
                    desc: {
                      en: "5 consecutive cards same suit",
                      vi: "5 lá liên tiếp đồng chất",
                    },
                  },
                  {
                    id: HandRanking.FOUR_OF_A_KIND,
                    desc: { en: "4 cards of same rank", vi: "4 lá giống nhau" },
                  },
                  {
                    id: HandRanking.FULL_HOUSE,
                    desc: {
                      en: "3 matching + 2 matching",
                      vi: "1 bộ ba + 1 bộ đôi",
                    },
                  },
                  {
                    id: HandRanking.FLUSH,
                    desc: { en: "5 cards same suit", vi: "5 lá cùng chất" },
                  },
                  {
                    id: HandRanking.STRAIGHT,
                    desc: { en: "5 consecutive cards", vi: "5 lá liên tiếp" },
                  },
                  {
                    id: HandRanking.THREE_OF_A_KIND,
                    desc: { en: "3 cards of same rank", vi: "3 lá giống nhau" },
                  },
                  {
                    id: HandRanking.TWO_PAIR,
                    desc: { en: "2 different pairs", vi: "2 đôi khác nhau" },
                  },
                  {
                    id: HandRanking.PAIR,
                    desc: { en: "2 cards of same rank", vi: "2 lá giống nhau" },
                  },
                  {
                    id: HandRanking.HIGH_CARD,
                    desc: { en: "Highest card plays", vi: "Lá bài cao nhất" },
                  },
                ].map((hand, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center p-2 rounded ${i % 2 === 0 ? "bg-slate-800/50" : ""}`}
                  >
                    <div
                      className={`flex items-center gap-2 px-2 py-0.5 rounded-full border ${getHandStyle(hand.id)}`}
                    >
                      <Trophy
                        className={`w-3 h-3 ${getHandIconColor(hand.id)}`}
                      />
                      <span className="font-bold">
                        {ti(HAND_NAMES[hand.id])}
                      </span>
                    </div>
                    <span className="text-slate-400 text-sm">
                      {ti(hand.desc)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Game Flow & Actions */}
            <div className="grid grid-cols-1 @md:grid-cols-2 gap-6">
              {/* Game Flow */}
              <section>
                <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5" />
                  {ti({ en: "Game Rounds", vi: "Vòng cược" })}
                </h3>
                <ol className="relative border-l border-slate-700 ml-3 space-y-0">
                  {[
                    {
                      name: "Pre-Flop",
                      vi: "Pre-Flop",
                      desc: { en: "2 Hole Cards Deal", vi: "Chia 2 lá tẩy" },
                    },
                    {
                      name: "Flop",
                      vi: "Flop",
                      desc: { en: "3 Community Cards", vi: "3 lá chung đầu" },
                    },
                    {
                      name: "Turn",
                      vi: "Turn",
                      desc: { en: "4th Community Card", vi: "Lá chung thứ 4" },
                    },
                    {
                      name: "River",
                      vi: "River",
                      desc: { en: "Last Community Card", vi: "Lá chung cuối" },
                    },
                    {
                      name: "Showdown",
                      vi: "Lật bài",
                      desc: {
                        en: "Best hand wins pot",
                        vi: "So bài & Trả thưởng",
                      },
                    },
                  ].map((round, i) => (
                    <li key={i} className="mb-4 last:mb-0 ml-4">
                      <div className="absolute w-3 h-3 bg-slate-600 rounded-full -left-[21px] mt-1.5 border border-slate-900"></div>
                      <h4 className="font-bold text-white">
                        {ti({ en: round.name, vi: round.vi })}
                      </h4>
                      <p className="text-sm text-slate-400">{ti(round.desc)}</p>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Actions */}
              <section>
                <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  {ti({ en: "Actions", vi: "Hành động" })}
                </h3>
                <ul className="space-y-3">
                  <li className="bg-slate-800/50 p-3 rounded-lg border-l-4 border-slate-500">
                    <div className="flex justify-between items-baseline mb-1">
                      <strong className="text-white">
                        {ti({ en: "Check / Fold", vi: "Xem / Bỏ" })}
                      </strong>
                      <span className="text-xs text-slate-500 uppercase">
                        {ti({ en: "Weak", vi: "Yếu" })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {ti({
                        en: "Skip turn if no bet / Discard hand.",
                        vi: "Xem (không cược) / Bỏ bài.",
                      })}
                    </p>
                  </li>
                  <li className="bg-slate-800/50 p-3 rounded-lg border-l-4 border-blue-500">
                    <div className="flex justify-between items-baseline mb-1">
                      <strong className="text-blue-200">
                        {ti({ en: "Call", vi: "Theo" })}
                      </strong>
                      <span className="text-xs text-blue-500/50 uppercase">
                        {ti({ en: "Passive", vi: "Thụ động" })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {ti({
                        en: "Match current highest bet.",
                        vi: "Theo cược bằng người trước.",
                      })}
                    </p>
                  </li>
                  <li className="bg-slate-800/50 p-3 rounded-lg border-l-4 border-green-500">
                    <div className="flex justify-between items-baseline mb-1">
                      <strong className="text-green-200">
                        {ti({ en: "Raise / All-in", vi: "Tố / Tất tay" })}
                      </strong>
                      <span className="text-xs text-green-500/50 uppercase">
                        {ti({ en: "Aggressive", vi: "Mạnh" })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {ti({
                        en: "Increase bet / Bet everything.",
                        vi: "Tố thêm tiền / Cược tất tay.",
                      })}
                    </p>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full h-full min-h-[700px] bg-slate-900 text-white relative overflow-hidden select-none mb-16!">
      {/* Game Area Wrapper */}
      <div className="relative flex-1 w-full shrink-0">
        {/* Table Background */}
        <div className="absolute inset-4 @md:inset-10 bg-[#35654d] border-16 border-[#4a2c20] rounded-[100px] shadow-2xl opacity-90 mx-auto max-w-6xl"></div>

        {/* Community Cards & Pot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-0 w-full max-w-md">
          {/* Pot Display */}
          <div className="bg-black/40 px-6 py-2 rounded-full border border-yellow-500/30 backdrop-blur-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-yellow-500" />
            <span className="text-yellow-400 font-bold text-lg">
              {ti({ en: "Pot", vi: "Tổng" })}: {state.pot}
            </span>
          </div>

          {/* Cards */}
          <div className="flex gap-2 min-h-[80px]">
            {state.communityCards.map((card, i) => (
              <CardDisplay
                key={i}
                card={card}
                size="lg"
                className="animate-in fade-in slide-in-from-bottom-12 duration-700 ease-out"
              />
            ))}
            {Array(5 - state.communityCards.length)
              .fill(null)
              .map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="w-14 h-20 @md:w-16 @md:h-24 border-2 border-white/10 rounded-lg bg-black/10"
                ></div>
              ))}
          </div>

          {/* Game Phase / Winner */}
          {state.gamePhase === "ended" && (
            <div className="text-xl font-bold text-yellow-400 animate-bounce flex items-center gap-2 drop-shadow-md">
              <Trophy className="w-6 h-6" />
              {state.winnerIds
                .map((id) => state.players.find((p) => p.id === id)?.username)
                .join(", ")}{" "}
              {ti({ en: "Won!", vi: "Thắng!" })}
              {state.winningHand && (
                <div className="text-sm font-normal text-white ml-2">
                  (
                  {ti(
                    HAND_NAMES[state.winningHand.rank] || {
                      en: state.winningHand.name,
                      vi: state.winningHand.name,
                    },
                  )}
                  )
                </div>
              )}
            </div>
          )}
        </div>

        {/* Players */}
        <div className="absolute inset-0 pointer-events-none">
          {arrangedPlayers.map((p, i) => (
            <div
              key={p.actualIndex}
              className={`absolute pointer-events-auto ${getPositionClass(i)}`}
            >
              <PlayerSlot
                player={p.slot}
                isSelf={myIndex === p.actualIndex}
                isActiveTurn={state.currentTurnIndex === p.actualIndex}
                isHost={isHost}
                gamePhase={state.gamePhase}
                winnerIds={state.winnerIds}
                bestHandName={
                  (myIndex === p.actualIndex || state.gamePhase === "ended") &&
                  p.slot.hand.length > 0
                    ? ti(
                        HAND_NAMES[
                          game.evaluateHand(p.slot.hand, state.communityCards)
                            .rank
                        ],
                      )
                    : undefined
                }
                bestHandRank={
                  (myIndex === p.actualIndex || state.gamePhase === "ended") &&
                  p.slot.hand.length > 0
                    ? game.evaluateHand(p.slot.hand, state.communityCards).rank
                    : undefined
                }
                onAddBot={() => game.requestAddBot(p.actualIndex)}
                onRemove={() => game.requestRemovePlayer(p.actualIndex)}
                onOpenRules={() => setShowRules(true)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Controls - Fixed Bottom Bar */}
      <div className="w-full shrink-0 p-2 bg-slate-900/80 backdrop-blur-md border-t border-slate-700 flex flex-col items-center justify-between gap-4 z-20">
        {/* Game State Info */}
        <div className="flex flex-row flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
          <span>
            {ti({ en: "Phase: ", vi: "Giai đoạn: " })}
            {ti(GAME_PHASES[state.gamePhase])}
          </span>
          <span>
            {ti({ en: "Min Raise: ", vi: "Tố tối thiểu: " })}
            {state.minRaise}
          </span>
          {state.lastAction && (
            <span className="text-white">
              {ti({ en: "Last: ", vi: "Vừa xong: " })}
              {
                state.players.find((p) => p.id === state.lastAction?.playerId)
                  ?.username
              }{" "}
              {state.lastAction.action} {state.lastAction.amount}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        {state.gamePhase !== "waiting" &&
          state.gamePhase !== "ended" &&
          (isMyTurn && mySlot ? (
            <div className="flex flex-wrap @md:flex-nowrap items-center justify-center gap-2 w-full @md:w-auto">
              {/* Check / Fold */}
              <button
                onClick={handleFold}
                className="flex-1 @md:flex-none px-4 @md:px-6 py-3 bg-red-900/80 hover:bg-red-800 rounded-lg text-white font-bold flex flex-col items-center min-w-[60px]"
              >
                <span className="text-xs @md:text-sm">
                  {ti({ en: "FOLD", vi: "BỎ BÀI" })}
                </span>
              </button>

              {state.currentBet > mySlot.currentBet ? (
                <button
                  onClick={handleCall}
                  className="flex-1 @md:flex-none px-4 @md:px-6 py-3 bg-blue-900/80 hover:bg-blue-800 rounded-lg text-white font-bold flex flex-col items-center min-w-[60px]"
                >
                  <span className="text-xs @md:text-sm">
                    {ti({ en: "CALL", vi: "THEO" })}
                  </span>
                  <span className="text-[10px] @md:text-xs">
                    {state.currentBet - mySlot.currentBet}
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleCheck}
                  className="flex-1 @md:flex-none px-4 @md:px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold flex flex-col items-center min-w-[60px]"
                >
                  <span className="text-xs @md:text-sm">
                    {ti({ en: "CHECK", vi: "XEM" })}
                  </span>
                </button>
              )}

              {/* Raise Control */}
              <div className="order-first @md:order-0 w-full @md:w-auto flex items-center justify-center gap-2 bg-black/40 p-1.5 rounded-lg border border-slate-700 mb-2 @md:mb-0">
                <button
                  onClick={() =>
                    setRaiseAmount(
                      Math.max(
                        state.currentBet + state.minRaise,
                        raiseAmount - state.minRaise,
                      ),
                    )
                  }
                  className="p-2 hover:bg-white/10 rounded"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="flex flex-col items-center w-20">
                  <span className="text-[10px] text-slate-400">
                    {ti({ en: "RAISE TO", vi: "TỐ LÊN" })}
                  </span>
                  <input
                    type="number"
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    className="w-full bg-transparent text-center font-bold outline-none text-sm"
                  />
                </div>
                <button
                  onClick={() => setRaiseAmount(raiseAmount + state.minRaise)}
                  className="p-2 hover:bg-white/10 rounded"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRaise}
                  disabled={raiseAmount > mySlot.chips + mySlot.currentBet}
                  className="ml-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-xs font-bold disabled:opacity-50 h-full"
                >
                  {ti({ en: "RAISE", vi: "TỐ" })}
                </button>
              </div>

              {/* All In */}
              <button
                onClick={handleAllIn}
                className="flex-1 @md:flex-none px-4 @md:px-6 py-3 bg-orange-700 hover:bg-orange-600 rounded-lg text-white font-bold flex flex-col items-center min-w-[60px]"
              >
                <span className="text-xs @md:text-sm">
                  {ti({ en: "ALL IN", vi: "TẤT TAY" })}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 p-4 bg-slate-800/50 rounded-lg border border-slate-700 w-full @md:w-auto min-w-[200px]">
              <div className="flex items-center gap-2 text-slate-400 animate-pulse">
                <span className="text-sm font-bold">
                  {ti({
                    en: `Waiting for ${
                      state.players[state.currentTurnIndex]?.username
                    }'s turn...`,
                    vi: `Đang chờ lượt của ${
                      state.players[state.currentTurnIndex]?.username
                    }...`,
                  })}
                </span>
              </div>
            </div>
          ))}

        {/* Waiting Room Controls */}
        {state.gamePhase === "waiting" && isHost && (
          <div className="w-full flex justify-center">
            {state.players.filter((p) => p.id !== null).length >= 2 ? (
              <button
                onClick={() => game.requestStartGame()}
                className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-lg shadow-lg shadow-green-900/20 w-full @md:w-auto"
              >
                {ti({ en: "Start Game", vi: "Bắt đầu" })}
              </button>
            ) : (
              <div className="px-8 py-3 bg-slate-700/50 rounded-xl font-bold text-lg text-slate-400 border border-slate-600 w-full @md:w-auto text-center cursor-not-allowed">
                {ti({
                  en: "Waiting for players (min 2)...",
                  vi: "Đang chờ người chơi (tối thiểu 2)...",
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game End Controls */}
      {state.gamePhase === "ended" && isHost && (
        <div className="w-full flex justify-center items-center gap-4 mt-6 z-50 animate-in slide-in-from-bottom-4 duration-500">
          <button
            onClick={() => game.requestStartGame()}
            className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-lg shadow-lg shadow-green-900/40 flex items-center gap-2 text-white transition-all transform hover:scale-105"
          >
            <Play className="w-5 h-5" />
            {ti({ en: "Next Hand", vi: "Ván tiếp theo" })}
          </button>

          <button
            onClick={async () => {
              if (
                await showConfirm(
                  ts({
                    en: "Are you sure you want to reset all chips and start over?",
                    vi: "Bạn có chắc chắn muốn reset tiền và chơi lại từ đầu không?",
                  }),
                  ts({
                    en: "Reset Game",
                    vi: "Chơi lại từ đầu",
                  }),
                )
              )
                game.requestResetGame();
            }}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-lg shadow-lg border border-slate-600 flex items-center gap-2 text-slate-300 hover:text-white transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            {ti({ en: "Reset Game", vi: "Chơi lại từ đầu" })}
          </button>
        </div>
      )}

      {/* Abort Game (During Play) */}
      {state.gamePhase !== "waiting" &&
        state.gamePhase !== "ended" &&
        isHost && (
          <div className="flex items-center justify-center mt-6">
            <button
              onClick={async () => {
                if (
                  await showConfirm(
                    ts({
                      en: "Are you sure you want to end the game?",
                      vi: "Bạn có chắc chắn muốn kết thúc game không?",
                    }),
                    ts({ en: "End Game", vi: "Kết thúc" }),
                  )
                )
                  game.requestResetGame();
              }}
              className="flex items-center gap-2 px-3 py-2 bg-red-900/20 hover:bg-red-900/50 rounded-lg text-red-500 hover:text-red-300 border border-red-900/30 text-xs font-bold transition-colors"
            >
              <X className="w-5 h-5" />
              {ti({ en: "End Game", vi: "Kết thúc" })}
            </button>
          </div>
        )}

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

// Layout positions for 6 players
// Mobile: 3 Top, 3 Bottom
// Desktop: Circular
const getPositionClass = (index: number) => {
  // Common desktop classes (circular)
  const d = {
    0: "@md:bottom-[5%] @md:left-1/2 @md:-translate-x-1/2 @md:top-auto @md:right-auto",
    1: "@md:bottom-[20%] @md:left-[5%] @md:top-auto @md:right-auto",
    2: "@md:top-[20%] @md:left-[5%] @md:bottom-auto @md:right-auto",
    3: "@md:top-[5%] @md:left-1/2 @md:-translate-x-1/2 @md:bottom-auto @md:right-auto",
    4: "@md:top-[20%] @md:right-[5%] @md:bottom-auto @md:left-auto",
    5: "@md:bottom-[20%] @md:right-[5%] @md:top-auto @md:left-auto",
  };

  // Mobile classes (Rows)
  // 0 (Self): Bottom Center
  // 1: Bottom Left
  // 5: Bottom Right
  // 3 (Head): Top Center
  // 2: Top Left
  // 4: Top Right

  switch (index) {
    case 0:
      return `bottom-6 left-1/2 -translate-x-1/2 ${d[0]}`;
    case 1:
      return `bottom-10 left-1 ${d[1]}`; // Bottom Left
    case 5:
      return `bottom-10 right-1 ${d[5]}`; // Bottom Right
    case 3:
      return `top-6 left-1/2 -translate-x-1/2 ${d[3]}`; // Top Center
    case 2:
      return `top-10 left-1 ${d[2]}`; // Top Left
    case 4:
      return `top-10 right-1 ${d[4]}`; // Top Right
    default:
      return "";
  }
};

import { HandRanking } from "./types";

// Helper for hand styles
const getHandStyle = (rank?: HandRanking) => {
  if (rank === undefined)
    return "bg-slate-900/90 border-slate-500/50 text-slate-200";

  switch (rank) {
    case HandRanking.ROYAL_FLUSH:
    case HandRanking.STRAIGHT_FLUSH:
      return "bg-purple-900/90 border-purple-500/50 text-purple-200 shadow-purple-900/50";
    case HandRanking.FOUR_OF_A_KIND:
    case HandRanking.FULL_HOUSE:
      return "bg-red-900/90 border-red-500/50 text-red-100 shadow-red-900/50";
    case HandRanking.FLUSH:
    case HandRanking.STRAIGHT:
      return "bg-blue-900/90 border-blue-500/50 text-blue-100 shadow-blue-900/50";
    case HandRanking.THREE_OF_A_KIND:
    case HandRanking.TWO_PAIR:
      return "bg-green-900/90 border-green-500/50 text-green-100 shadow-green-900/50";
    default: // Pair, High Card
      return "bg-slate-800/90 border-slate-500/50 text-slate-300 shadow-slate-900/50";
  }
};

const getHandIconColor = (rank?: HandRanking) => {
  if (rank === undefined) return "text-slate-400";
  switch (rank) {
    case HandRanking.ROYAL_FLUSH:
    case HandRanking.STRAIGHT_FLUSH:
      return "text-purple-400";
    case HandRanking.FOUR_OF_A_KIND:
    case HandRanking.FULL_HOUSE:
      return "text-red-400";
    case HandRanking.FLUSH:
    case HandRanking.STRAIGHT:
      return "text-blue-400";
    case HandRanking.THREE_OF_A_KIND:
    case HandRanking.TWO_PAIR:
      return "text-green-400";
    default:
      return "text-slate-400";
  }
};

function PlayerSlot({
  player,
  isSelf,
  isActiveTurn,
  isHost,
  gamePhase,
  winnerIds,
  onAddBot,
  onRemove,
  bestHandName,
  bestHandRank,
  onOpenRules,
}: {
  player: PokerPlayer;
  isSelf: boolean;
  isActiveTurn: boolean;
  isHost: boolean;
  gamePhase: string;
  winnerIds: string[];
  onAddBot: () => void;
  onRemove: () => void;
  bestHandName?: React.ReactNode;
  bestHandRank?: HandRanking;
  onOpenRules?: () => void;
}) {
  const { ti } = useLanguage();

  const isEmpty = player.id === null;
  const isWinner = player.id && winnerIds.includes(player.id);

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center bg-black/20 text-slate-400">
          <User className="w-8 h-8" />
        </div>
        {gamePhase === "waiting" && (
          <div className="flex flex-col gap-1">
            {/* Sit button removed for auto-sit */}
            {isHost && (
              <button
                onClick={onAddBot}
                className="px-3 py-1 bg-slate-700 rounded text-xs flex items-center gap-1"
              >
                <Bot className="w-3 h-3" /> Bot
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`
            relative flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-300
            ${isActiveTurn ? "bg-yellow-500/20 ring-2 ring-yellow-400 scale-105" : "bg-slate-900/60 ring-1 ring-slate-700"}
            ${player.hasFolded ? "opacity-50 grayscale" : ""}
            ${isWinner ? "animate-bounce" : ""}
            w-[90px] @md:w-[140px]
        `}
    >
      {/* Dealer Button */}
      {player.isDealer && (
        <div className="absolute -top-3 -right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center text-black font-bold text-xs border-2 border-slate-300 shadow-lg z-20">
          D
        </div>
      )}

      {/* Info */}
      <div className="flex items-center gap-2 mb-1 w-full justify-center">
        {player.isHost && <Crown className="w-3 h-3 text-yellow-500" />}
        {player.isBot && <Bot className="w-3 h-3 text-blue-400" />}
        <span className="text-xs font-bold truncate max-w-[80px]">
          {player.username}
        </span>
      </div>

      {/* Chips & Cards */}
      <div className="flex flex-col items-center gap-1 w-full">
        <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full text-green-400 text-xs font-mono w-full justify-center">
          <DollarSign className="w-3 h-3" /> {player.chips}
        </div>

        {/* Hole Cards */}
        <div className="flex justify-center -space-x-4 min-h-[50px] mt-1 relative">
          {player.hand.length > 0 ? (
            <>
              {isSelf || gamePhase === "showdown" || gamePhase === "ended" ? (
                player.hand.map((card, i) => (
                  <div
                    key={i}
                    className={`transform ${i === 0 ? "-rotate-6" : "rotate-6"} origin-bottom`}
                  >
                    <CardDisplay
                      card={card}
                      size="md"
                      className="animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out"
                    />
                  </div>
                ))
              ) : (
                <>
                  <div className="w-10 h-14 bg-blue-900 rounded border-2 border-white/20 transform -rotate-6 shadow-lg bg-[url('/card-back.png')]"></div>
                  <div className="w-10 h-14 bg-blue-900 rounded border-2 border-white/20 transform rotate-6 shadow-lg bg-[url('/card-back.png')]"></div>
                </>
              )}
            </>
          ) : (
            <div className="h-[50px]"></div>
          )}

          {/* Folded Indicator */}
          {player.hasFolded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded text-xs font-bold text-red-400">
              {ti({ en: "FOLDED", vi: "ĐÃ BỎ" })}
            </div>
          )}
        </div>

        {/* Current Bet */}
        {player.currentBet > 0 && (
          <div className="absolute -bottom-3 bg-yellow-900/80 px-2 py-1 rounded text-yellow-300 text-xs font-bold border border-yellow-500/30 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> {player.currentBet}
          </div>
        )}

        {/* Best Hand Indicator - Only for Self or Showdown */}
        {(isSelf || gamePhase === "ended") &&
          !player.hasFolded &&
          bestHandName && (
            <div
              onClick={onOpenRules}
              className={`absolute -top-6 whitespace-nowrap border px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg animate-in fade-in slide-in-from-bottom-2 z-40 flex items-center gap-1 transition-all duration-300 cursor-pointer hover:scale-110 ${getHandStyle(bestHandRank)}`}
            >
              <Trophy className={`w-3 h-3 ${getHandIconColor(bestHandRank)}`} />
              {bestHandName}
            </div>
          )}
      </div>

      {/* Host Controls */}
      {isHost &&
        gamePhase === "waiting" &&
        (player.isBot || player.isGuest) && (
          <button
            onClick={onRemove}
            className="absolute -top-2 -left-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-white hover:bg-red-500 z-30"
          >
            <X className="w-3 h-3" />
          </button>
        )}
    </div>
  );
}

function CardDisplay({
  card,
  size = "md",
  className = "",
  compact = true,
}: {
  card: Card;
  size?: "sm" | "md" | "lg";
  className?: string;
  compact?: boolean;
}) {
  const isRed = card.suit === Suit.HEART || card.suit === Suit.DIAMOND;
  const sizeClasses = {
    sm: "w-8 h-12 @md:w-10 @md:h-14 text-[10px] @md:text-xs",
    md: "w-10 h-14 @md:w-14 @md:h-20 text-xs @md:text-sm",
    lg: "w-12 h-16 @md:w-16 @md:h-24 text-sm @md:text-lg",
  };

  return (
    <div
      className={`${sizeClasses[size]} bg-white rounded-md shadow-lg border border-slate-300 flex flex-col items-center justify-between p-1 select-none ${className}`}
    >
      <div
        className={`self-start font-bold ${isRed ? "text-red-600" : "text-slate-900"} leading-none`}
      >
        {RANK_DISPLAY[card.rank]}
      </div>
      <div
        className={`${isRed ? "text-red-500" : "text-slate-800"} text-xl @md:text-2xl`}
      >
        {SUIT_SYMBOLS[card.suit]}
      </div>
      <div
        className={`self-end font-bold ${isRed ? "text-red-600" : "text-slate-900"} leading-none rotate-180`}
      >
        {compact ? "" : RANK_DISPLAY[card.rank]}
      </div>
    </div>
  );
}
