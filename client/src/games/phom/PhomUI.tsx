import { useState, useMemo, useEffect, useRef } from "react";
import Phom from "./Phom";
import type { Card, PlayerSlot, GamePhase } from "./types";
import { RANK_DISPLAY, Suit, decodeCard } from "./types";
import { useRoomStore } from "../../stores/roomStore";
import {
  Play,
  Bot,
  User,
  X,
  RefreshCcw,
  Crown,
  BookOpen,
  Trophy,
  Spade,
  Club,
  Diamond,
  Heart,
  ArrowDownToLine,
  UtensilsCrossed,
  Hand,
  Layers,
} from "lucide-react";
import { useUserStore } from "../../stores/userStore";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";
import useGameState from "../../hooks/useGameState";
import SoundManager from "../../utils/SoundManager";
import usePrevious from "../../hooks/usePrevious";
import CommonFlyingCard from "../../components/FlyingCard";
import { useAlertStore } from "../../stores/alertStore";

export const SUIT_SYMBOLS: Record<Suit, React.ReactNode> = {
  [Suit.SPADE]: <Spade className="@md:w-4 @md:h-4 w-3 h-3" fill="black" />,
  [Suit.CLUB]: <Club className="@md:w-4 @md:h-4 w-3 h-3" fill="black" />,
  [Suit.DIAMOND]: <Diamond className="@md:w-4 @md:h-4 w-3 h-3" fill="red" />,
  [Suit.HEART]: <Heart className="@md:w-4 @md:h-4 w-3 h-3" fill="red" />,
};

export default function PhomUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Phom;
  const { confirm: showConfirm } = useAlertStore();
  const [state] = useGameState(game);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showDiscardHistory, setShowDiscardHistory] = useState(false);
  const [highlightedCard, setHighlightedCard] = useState<Card | null>(null);
  const myHandRef = useRef<HTMLDivElement>(null);
  const { username } = useUserStore();
  const { ti, ts } = useLanguage();
  const { currentRoom } = useRoomStore();

  // Flying card animation state
  const [flyingCard, setFlyingCard] = useState<{
    card?: Card;
    fromPlayerIndex: number;
    direction: "toDiscard" | "toHand" | "toPhom";
    targetPlayerIndex?: number;
    hidden?: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>(Array(4).fill(null));
  const drawPileRef = useRef<HTMLDivElement>(null);
  const discardPileRef = useRef<HTMLDivElement>(null);

  const canStart = game.canStartGame();
  const isHost = game.isHost;
  const myIndex = game.getMyPlayerIndex();
  const mySlot = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = state.currentTurnIndex === myIndex;

  // Track previous state values for animation detection
  const prevDrawPileCount = usePrevious(state.drawPile.length);
  const prevHandCounts = usePrevious(state.players.map((p) => p.hand.length));
  const prevHands = usePrevious(state.players.map((p) => [...p.hand]));
  const prevLastDiscard = usePrevious(state.lastDiscardedCard);
  const prevTurnIndex = usePrevious(state.currentTurnIndex);

  useEffect(() => {
    if (state.gamePhase !== "playing") return;

    // Detect Eat: lastDiscardedCard was consumed (went from non-null to null)
    if (prevLastDiscard && !state.lastDiscardedCard) {
      const gainerIndex = state.players.findIndex((p, i) => {
        const prevCount = prevHandCounts?.[i] ?? 0;
        return p.hand.length > prevCount;
      });

      if (gainerIndex !== -1) {
        setFlyingCard({
          fromPlayerIndex: -2, // -2 means discard pile
          direction: "toHand",
          targetPlayerIndex: gainerIndex,
          card: prevLastDiscard,
          hidden: false,
        });
        // Highlight eaten card in my hand
        if (gainerIndex === myIndex) {
          setHighlightedCard(prevLastDiscard);
        }
      }
    }
    // Detect Draw: draw pile decreases AND someone's hand increases
    else if (
      prevDrawPileCount !== undefined &&
      state.drawPile.length < prevDrawPileCount
    ) {
      const gainerIndex = state.players.findIndex((p, i) => {
        const prevCount = prevHandCounts?.[i] ?? 0;
        return p.hand.length > prevCount;
      });

      if (gainerIndex !== -1) {
        const drawnCard =
          gainerIndex === myIndex
            ? state.players[gainerIndex].hand.find(
                (c) => !prevHands?.[gainerIndex]?.includes(c),
              )
            : undefined;
        setFlyingCard({
          fromPlayerIndex: -1, // -1 means draw pile
          direction: "toHand",
          targetPlayerIndex: gainerIndex,
          hidden: gainerIndex !== myIndex,
          card: drawnCard,
        });
        // Highlight drawn card in my hand
        if (gainerIndex === myIndex && drawnCard !== undefined) {
          setHighlightedCard(drawnCard);
        }
      }
    }
    // Detect Discard: lastDiscardedCard changes to a new value
    else if (
      state.lastDiscardedCard &&
      state.lastDiscardedCard !== prevLastDiscard
    ) {
      const discarderIndex = prevTurnIndex ?? 0;
      setFlyingCard({
        fromPlayerIndex: discarderIndex,
        direction: "toDiscard",
        card: state.lastDiscardedCard,
        hidden: false,
      });
    }
  }, [
    state,
    myIndex,
    prevDrawPileCount,
    prevHandCounts,
    prevHands,
    prevLastDiscard,
    prevTurnIndex,
  ]);

  // Clear highlight when turn phase changes to drawing (after discard)
  useEffect(() => {
    if (state.turnPhase === "drawing") {
      setHighlightedCard(null);
    }
  }, [state.turnPhase]);

  useEffect(() => {
    if (state.gamePhase !== "playing") return;
    if (
      prevTurnIndex !== undefined &&
      prevTurnIndex !== state.currentTurnIndex
    ) {
      SoundManager.playTurnSwitch(isMyTurn);
    }
  }, [state.currentTurnIndex, isMyTurn, state.gamePhase, prevTurnIndex]);

  const animationElements = useMemo(() => {
    if (!flyingCard || !containerRef.current) return null;

    const { fromPlayerIndex, direction, targetPlayerIndex } = flyingCard;

    const getPlayerRect = (idx: number) => {
      const baseIndex = myIndex >= 0 ? myIndex : 0;
      const screenPos = (idx - baseIndex + 4) % 4;
      if (screenPos === 0 && myHandRef.current)
        return myHandRef.current.getBoundingClientRect();
      if (slotRefs.current[screenPos])
        return slotRefs.current[screenPos]!.getBoundingClientRect();
      return null;
    };

    let sourceRect: DOMRect | null = null;
    let targetRect: DOMRect | null = null;

    if (direction === "toDiscard") {
      sourceRect = getPlayerRect(fromPlayerIndex);
      targetRect = discardPileRef.current
        ? discardPileRef.current.getBoundingClientRect()
        : null;
    } else if (direction === "toHand") {
      sourceRect =
        fromPlayerIndex === -1
          ? drawPileRef.current
            ? drawPileRef.current.getBoundingClientRect()
            : null
          : fromPlayerIndex === -2
            ? discardPileRef.current
              ? discardPileRef.current.getBoundingClientRect()
              : null
            : null;
      targetRect = getPlayerRect(targetPlayerIndex!);
    } else if (direction === "toPhom") {
      sourceRect = getPlayerRect(fromPlayerIndex);
      targetRect = slotRefs.current[
        (targetPlayerIndex! - (myIndex >= 0 ? myIndex : 0) + 4) % 4
      ]
        ? slotRefs.current[
            (targetPlayerIndex! - (myIndex >= 0 ? myIndex : 0) + 4) % 4
          ]!.getBoundingClientRect()
        : null;
    }

    if (!sourceRect || !targetRect) return null;

    return { sourceRect, targetRect };
  }, [flyingCard, myIndex]);

  const isRoomPlayer = useMemo(() => {
    return currentRoom?.players.some((p) => p.id === game.userId) ?? false;
  }, [currentRoom, game]);

  useEffect(() => {
    return game.onUpdate((_newState) => {
      setSelectedCardIdx(null);
    });
  }, [game]);

  const handleCardClick = (index: number) => {
    if (!isMyTurn || state.gamePhase !== "playing" || !mySlot) return;
    if (state.turnPhase === "drawing") return;
    setSelectedCardIdx(selectedCardIdx === index ? null : index);
  };

  const handleDiscard = () => {
    if (selectedCardIdx === null || !mySlot) return;
    game.requestDiscard(mySlot.hand[selectedCardIdx]);
    setSelectedCardIdx(null);
  };

  const handleDraw = () => {
    game.requestDraw();
  };
  const handleEat = () => {
    game.requestEat();
  };

  const arrangedPlayers = useMemo(() => {
    const result = [];
    const baseIndex = myIndex >= 0 ? myIndex : 0;
    for (let i = 0; i < 4; i++) {
      const actualIndex = (baseIndex + i) % 4;
      result.push({ slot: state.players[actualIndex], actualIndex });
    }
    return result;
  }, [state.players, myIndex]);

  const renderPlayArea = () => {
    return (
      <div className="flex flex-col items-center gap-6 w-full">
        {/* Central Deck and Discard Pile */}
        <div className="flex items-center gap-8 justify-center min-h-[120px]">
          {/* Draw Pile (Nọc) */}
          <div className="flex flex-col items-center gap-3">
            <div
              ref={drawPileRef}
              className={`w-14 h-20 @md:w-16 @md:h-24 bg-slate-700 rounded-lg border-2 border-slate-600 shadow-xl flex items-center justify-center relative transition-all active:scale-95 ${state.turnPhase === "drawing" && isMyTurn ? "ring-2 ring-primary-400 cursor-pointer shadow-primary-500/20 shadow-2xl hover:border-primary-400 hover:scale-105 hover:shadow-primary-500/30" : ""}`}
              onClick={
                state.turnPhase === "drawing" && isMyTurn
                  ? handleDraw
                  : undefined
              }
            >
              <div className="w-8 h-8 rounded-full border-2 border-slate-500/50 flex items-center justify-center">
                <ArrowDownToLine className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">
              {state.drawPile.length} {ts({ en: "cards", vi: "lá" })}
            </span>
            {state.turnPhase === "drawing" && isMyTurn && (
              <button
                onClick={handleDraw}
                className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg font-bold text-xs flex items-center gap-1 transition-all hover:scale-105 active:scale-95"
              >
                <ArrowDownToLine className="w-3 h-3" />{" "}
                {ts({ en: "Draw", vi: "Bốc bài" })}
              </button>
            )}
          </div>

          {/* Last Discarded Card */}
          <div className="flex flex-col items-center gap-3">
            <div ref={discardPileRef} className="relative">
              {state.lastDiscardedCard ? (
                <TableCard
                  card={state.lastDiscardedCard}
                  isHighlight={state.turnPhase === "drawing" && isMyTurn}
                  onClick={
                    state.turnPhase === "drawing" &&
                    isMyTurn &&
                    game.canFormPhomPublic(
                      mySlot?.hand || [],
                      state.lastDiscardedCard,
                    )
                      ? handleEat
                      : undefined
                  }
                />
              ) : (
                <div className="w-14 h-20 @md:w-16 @md:h-24 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-slate-500" />
                </div>
              )}
              {/* Discard pile counter badge */}
              {state.discardHistory.length > 0 && (
                <button
                  onClick={() => setShowDiscardHistory(true)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-slate-600 hover:bg-slate-500 rounded-full text-[10px] flex items-center justify-center z-20 cursor-pointer transition-colors"
                  title={ts({ en: "View history", vi: "Xem lịch sử" })}
                >
                  {state.discardHistory.length}
                </button>
              )}
            </div>
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
              {ts({ en: "Last Discard", vi: "Bài mới nhất" })}
            </span>
            {state.lastDiscardedCard &&
              state.turnPhase === "drawing" &&
              isMyTurn && (
                <button
                  onClick={handleEat}
                  disabled={
                    !game.canFormPhomPublic(
                      mySlot?.hand || [],
                      state.lastDiscardedCard,
                    )
                  }
                  className="mt-0.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-lg shadow-green-900/20 transition-all enabled:hover:scale-105 enabled:active:scale-95 enabled:hover:shadow-green-500/40 animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <UtensilsCrossed className="w-3 h-3" />{" "}
                  {ts({ en: "Eat", vi: "Ăn bài" })}
                </button>
              )}
          </div>
        </div>

        {state.gamePhase === "playing" && (
          <div className="text-xs @md:text-sm border-t border-slate-700 mt-2 pt-2 text-center w-full">
            {isMyTurn ? (
              <span className="text-primary-400 font-bold animate-pulse">
                {state.turnPhase === "drawing"
                  ? ts({
                      en: "Your Turn: Draw or Eat",
                      vi: "Lượt bạn: Bốc hoặc Ăn",
                    })
                  : ts({ en: "Your Turn: Discard", vi: "Lượt bạn: Đánh bài" })}
              </span>
            ) : (
              <span className="text-slate-400">
                {ts({ en: "Turn of", vi: "Lượt của" })}{" "}
                {state.players[state.currentTurnIndex]?.username} (
                {state.turnPhase})
              </span>
            )}
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">
              {ts({ en: "Round", vi: "Vòng" })} {state.roundNumber} / 4
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderWinner = () => {
    const rankedPlayers = [...state.players]
      .filter((p) => p.id)
      .sort((a, b) => (a.rank || 99) - (b.rank || 99));
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-8 h-8 text-yellow-400" />
          <span className="text-xl font-bold text-yellow-400">
            {ts({ en: "Result", vi: "Kết quả" })}
          </span>
        </div>

        {/* Sent Cards Log */}
        {state.sentCards.length > 0 && (
          <div className="space-y-1 w-full max-w-md mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              {ts({ en: "Cards Sent", vi: "Bài đã gửi" })}
            </span>
            {state.sentCards.map((sc, i) => {
              const from = state.players.find((p) => p.id === sc.fromId);
              const to = state.players.find((p) => p.id === sc.toId);
              const { rank, suit } = decodeCard(sc.card);
              const suitColor =
                suit === Suit.HEART || suit === Suit.DIAMOND
                  ? "text-red-500"
                  : "text-slate-800";
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1"
                >
                  <span className="text-slate-300 font-medium">
                    {from?.username}
                  </span>
                  <span className="text-slate-500">→</span>
                  <div
                    className={`w-5 h-8 bg-white rounded relative shrink-0 ${suitColor} border border-slate-200`}
                  >
                    <div className="flex flex-col items-center leading-none mt-0.5">
                      <span className="text-[10px] font-bold">
                        {RANK_DISPLAY[rank]}
                      </span>
                      <span className="text-[10px] -mt-0.5">
                        {SUIT_SYMBOLS[suit]}
                      </span>
                    </div>
                  </div>
                  <span className="text-slate-500">→</span>
                  <span className="text-green-400 font-medium">
                    {to?.username}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full min-w-[200px]">
          {rankedPlayers.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-4 p-2 rounded-lg bg-slate-800/50 border ${i === 0 ? "border-yellow-500/50 text-yellow-400" : "border-slate-700 text-slate-300"}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "💩"}
                </span>
                <span className="font-bold">{p.username}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold">
                  {p.isMom ? "MÓM" : p.score > 0 ? `${p.score} pts` : "Ù"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPlayerSlot = (playerIndex: number, compact = false) => {
    const player = arrangedPlayers[playerIndex];
    if (!player) return null;
    const isInGame = myIndex >= 0;

    return (
      <PlayerSlotDisplay
        key={player.actualIndex}
        slot={player.slot}
        index={player.actualIndex}
        isCurrentTurn={state.currentTurnIndex === player.actualIndex}
        isHost={isHost}
        gamePhase={state.gamePhase}
        onAddBot={() => game.requestAddBot(player.actualIndex)}
        onJoinSlot={() => game.requestJoinSlot(player.actualIndex, username)}
        onRemove={() => game.requestRemovePlayer(player.actualIndex)}
        compact={compact}
        isInGame={isInGame}
        canJoin={
          !isHost && state.gamePhase === "waiting" && !isInGame && isRoomPlayer
        }
      />
    );
  };

  const renderGameRules = () => {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full shadow-2xl relative">
          <div className="flex justify-between p-4 pr-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({
                en: "Game Rules: Phom (Tá Lả)",
                vi: "Luật Chơi: Phỏm (Tá Lả)",
              })}
            </h2>
            <button
              onClick={() => setShowRules(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 pt-0 space-y-4 text-slate-300 leading-relaxed max-h-[80vh] overflow-y-auto">
            {/* Objective */}
            <section className="space-y-2">
              <h3 className="text-lg font-bold text-yellow-400 border-b border-yellow-500/30 pb-1">
                {ts({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <p>
                {ts({
                  en: "Group your cards into 'Phom' (sets) during the game. At the end, the player with the lowest trash points (cards NOT in any Phom) wins.",
                  vi: "Xếp các lá bài thành 'Phỏm' trong suốt ván bài. Khi kết thúc, người có tổng điểm bài RÁC (không nằm trong Phỏm) thấp nhất sẽ thắng.",
                })}
              </p>
            </section>

            {/* Phom Types */}
            <section className="space-y-2">
              <h3 className="text-lg font-bold text-yellow-400 border-b border-yellow-500/30 pb-1">
                {ts({ en: "What is a Phom?", vi: "Phỏm là gì?" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <span className="font-bold text-white">
                    {ts({ en: "Sets of Kind", vi: "Bộ Sám / Tứ quý" })}:
                  </span>{" "}
                  {ts({
                    en: "3 or 4 cards of the same rank (e.g., three Jacks).",
                    vi: "3 hoặc 4 lá bài cùng giá trị (VD: ba lá J).",
                  })}
                </li>
                <li>
                  <span className="font-bold text-white">
                    {ts({ en: "Sequences", vi: "Bộ Sảnh" })}:
                  </span>{" "}
                  {ts({
                    en: "3 or more cards of the same suit in sequence (e.g., 5-6-7 of Hearts).",
                    vi: "3 lá trở lên cùng chất và liên tiếp nhau (VD: 5-6-7 cơ).",
                  })}
                </li>
              </ul>
            </section>

            {/* Gameplay */}
            <section className="space-y-2">
              <h3 className="text-lg font-bold text-yellow-400 border-b border-yellow-500/30 pb-1">
                {ts({ en: "How to Play", vi: "Cách chơi" })}
              </h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <span className="font-bold text-white">
                    {ts({ en: "Start your turn", vi: "Bắt đầu lượt" })}:
                  </span>{" "}
                  {ts({
                    en: "EAT the card discarded by the previous player (if it helps form a Phom), OR DRAW a new card from the deck.",
                    vi: "ĂN lá bài người trước vừa đánh (nếu giúp tạo Phỏm), HOẶC BỐC một lá bài mới từ nọc.",
                  })}
                </li>
                <li>
                  <span className="font-bold text-white">
                    {ts({ en: "End your turn", vi: "Kết thúc lượt" })}:
                  </span>{" "}
                  {ts({
                    en: "Discard one unwanted card from your hand.",
                    vi: "Đánh ra một lá bài rác từ trên tay.",
                  })}
                </li>
                <li>
                  <span className="font-bold text-white">
                    {ts({ en: "Game End", vi: "Kết thúc ván" })}:
                  </span>{" "}
                  {ts({
                    en: "When the deck runs out, the game automatically detects the best Phoms for each player, sends compatible trash cards to others' Phoms, and shows the final results.",
                    vi: "Khi nọc hết bài, hệ thống tự động tìm Phỏm tối ưu cho mỗi người, gửi bài rác hợp lệ vào Phỏm người khác, và hiển thị kết quả.",
                  })}
                </li>
              </ol>
            </section>

            {/* Scoring */}
            <section className="space-y-2">
              <h3 className="text-lg font-bold text-yellow-400 border-b border-yellow-500/30 pb-1">
                {ts({ en: "Scoring", vi: "Tính điểm" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ts({
                    en: "Each card is worth its face value (A=1, 2=2, ..., J=11, Q=12, K=13).",
                    vi: "Mỗi lá bài tính theo mặt (A=1, 2=2, ..., J=11, Q=12, K=13).",
                  })}
                </li>
                <li>
                  {ts({
                    en: "Your score = total value of trash cards (cards NOT in Phoms). Lower is better!",
                    vi: "Điểm = tổng giá trị bài rác (bài KHÔNG nằm trong Phỏm). Càng thấp càng tốt!",
                  })}
                </li>
              </ul>
            </section>

            {/* Special Rules */}
            <section className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <h3 className="text-md font-bold text-primary-400">
                {ts({ en: "Special Terms", vi: "Thuật ngữ quan trọng" })}
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <span className="text-green-400 font-bold">Ù:</span>{" "}
                  {ts({
                    en: "All 9 cards form Phoms → Instant win with 0 points!",
                    vi: "Tất cả 9 lá bài đều nằm trong Phỏm → Thắng trắng với 0 điểm!",
                  })}
                </li>
                <li>
                  <span className="text-blue-400 font-bold">
                    {ts({
                      en: "Tái (Extension)",
                      vi: "Tái (Gia hạn)",
                    })}
                    :
                  </span>{" "}
                  {ts({
                    en: "If someone eats a card in the last round, everyone gets another round to draw/discard.",
                    vi: "Nếu có người ăn bài ở vòng cuối, mọi người được thêm một vòng bốc/đánh bài.",
                  })}
                </li>
                <li>
                  <span className="text-purple-400 font-bold">
                    {ts({
                      en: "Auto Send",
                      vi: "Tự động gửi bài",
                    })}
                    :
                  </span>{" "}
                  {ts({
                    en: "After Phoms are shown, trash cards that fit into other players' Phoms are automatically sent to reduce your score.",
                    vi: "Sau khi hạ Phỏm, bài rác hợp lệ sẽ được tự động gửi vào Phỏm người khác để giảm điểm cho bạn.",
                  })}
                </li>
                <li>
                  <span className="text-red-400 font-bold">
                    {ts({ en: "Móm (Burned)", vi: "Móm (Cháy)" })}:
                  </span>{" "}
                  {ts({
                    en: "No Phoms at the end → Highest penalty, ranked last.",
                    vi: "Không có Phỏm nào khi kết thúc → Phạt nặng nhất, về bét.",
                  })}
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full p-2 @md:p-4 gap-4 @md:gap-6 overflow-hidden pb-16!"
    >
      {/* Top Rivals */}
      <div className="flex flex-wrap justify-center gap-2 @md:gap-4">
        {arrangedPlayers.slice(1).map((_p, i) => (
          <div
            key={i + 1}
            ref={(el) => {
              slotRefs.current[i + 1] = el;
            }}
          >
            {renderPlayerSlot(i + 1, true)}
          </div>
        ))}
      </div>

      {/* Main Board */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-[220px] bg-slate-800/30 rounded-2xl p-4 @md:p-8 relative">
        {state.gamePhase === "waiting" && (
          <div className="flex flex-col items-center gap-4">
            <span className="text-slate-400">
              {ts({
                en: "Waiting for players...",
                vi: "Đang chờ người chơi...",
              })}
            </span>
            {isHost && canStart && (
              <button
                onClick={() => game.requestStartGame()}
                className="px-8 py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-bold flex items-center gap-2"
              >
                <Play className="w-5 h-5" />
                {ts({ en: "Start Game", vi: "Bắt đầu" })}
              </button>
            )}
            {isHost && !canStart && (
              <span className="text-sm text-slate-500">
                Need at least 2 players
              </span>
            )}
          </div>
        )}

        {state.gamePhase === "playing" && renderPlayArea()}
        {state.gamePhase === "ended" && renderWinner()}
      </div>

      {/* Bottom Area (Me) */}
      <div className="flex flex-col items-center gap-3 @md:gap-6 mt-auto">
        {renderPlayerSlot(0, true)}

        {/* Hand - only during playing phase */}
        {mySlot &&
          state.gamePhase === "playing" &&
          mySlot.hand.length > 0 &&
          (() => {
            const phomsInHand = game.getPhomsPublic(mySlot.hand);
            const phomCardSet = new Set(phomsInHand.flatMap((p) => p.cards));
            const trashCards = mySlot.hand.filter((c) => !phomCardSet.has(c));
            // const suggestions = game.getDiscardSuggestionsPublic(mySlot.hand);
            // const bestDiscard = suggestions[0];

            const phomColors = [
              {
                border: "border-green-500",
                bg: "bg-green-500/10",
                label: "bg-green-500",
              },
              {
                border: "border-blue-500",
                bg: "bg-blue-500/10",
                label: "bg-blue-500",
              },
              {
                border: "border-purple-500",
                bg: "bg-purple-500/10",
                label: "bg-purple-500",
              },
              {
                border: "border-amber-500",
                bg: "bg-amber-500/10",
                label: "bg-amber-500",
              },
            ];

            return (
              <div
                ref={myHandRef}
                className="w-full flex flex-wrap justify-center items-end gap-1.5 mt-3 px-1"
                style={{
                  /* auto-scale to fit: 10 cards × ~36px overlap + group padding */
                  maxWidth: "100%",
                }}
              >
                {/* Phom Groups */}
                {phomsInHand.map((phom, phomIdx) => {
                  const color = phomColors[phomIdx % phomColors.length];
                  return (
                    <div
                      key={`phom-${phomIdx}`}
                      className={`flex items-end pt-3 pb-1 px-1.5 rounded-lg border-2 max-w-full ${color.border} ${color.bg} relative overflow-visible`}
                    >
                      <div
                        className={`absolute -top-2 left-1 ${color.label} text-white text-[8px] px-1 rounded font-bold z-10`}
                      >
                        P{phomIdx + 1}
                      </div>
                      {phom.cards.map((card, cardIdx) => {
                        const handIndex = mySlot.hand.indexOf(card);
                        const isLast = cardIdx === phom.cards.length - 1;
                        return (
                          <div
                            key={`${card}-${handIndex}`}
                            className={isLast ? "shrink-0" : "shrink-0"}
                            style={{
                              width: isLast ? undefined : 32,
                              zIndex: cardIdx,
                            }}
                          >
                            <CardDisplay
                              card={card}
                              selected={selectedCardIdx === handIndex}
                              onClick={() => handleCardClick(handIndex)}
                              disabled={
                                !isMyTurn || state.turnPhase === "drawing"
                              }
                              isSuggested={false}
                              isHighlighted={highlightedCard === card}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Trash Cards */}
                {trashCards.length > 0 && (
                  <div className="flex items-end pt-3 pb-1 px-1.5 rounded-lg border-2 max-w-full border-red-500/40 bg-red-500/5 relative overflow-visible">
                    <div className="absolute -top-2 left-1 bg-red-500/80 text-white text-[8px] px-1 rounded font-bold z-10">
                      {ts({ en: "TRASH", vi: "RÁC" })}
                    </div>
                    {trashCards.map((card, cardIdx) => {
                      const handIndex = mySlot.hand.indexOf(card);
                      const isLast = cardIdx === trashCards.length - 1;
                      return (
                        <div
                          key={`${card}-${handIndex}`}
                          className={isLast ? "shrink-0" : "shrink-0"}
                          style={{
                            width: isLast ? undefined : 32,
                            zIndex: cardIdx,
                          }}
                        >
                          <CardDisplay
                            card={card}
                            selected={selectedCardIdx === handIndex}
                            onClick={() => handleCardClick(handIndex)}
                            disabled={
                              !isMyTurn || state.turnPhase === "drawing"
                            }
                            isSuggested={
                              // state.turnPhase === "discarding" &&
                              // isMyTurn &&
                              // card === bestDiscard
                              false
                            }
                            isHighlighted={highlightedCard === card}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        {state.gamePhase === "playing" &&
          isMyTurn &&
          state.turnPhase === "discarding" && (
            <div className="flex gap-4">
              <button
                onClick={handleDiscard}
                disabled={selectedCardIdx === null}
                className="px-8 py-2.5 bg-red-600 hover:bg-red-500 text-white disabled:bg-slate-800 disabled:text-slate-500 rounded-lg font-extrabold flex items-center gap-2 transition-all enabled:hover:scale-105 active:scale-95 disabled:scale-100"
              >
                <Hand className="w-5 h-5" />{" "}
                {ts({ en: "Discard", vi: "Đánh bài" })}
              </button>
            </div>
          )}

        {state.gamePhase !== "waiting" && (
          <button
            onClick={async () => {
              if (
                game.state.gamePhase === "ended" ||
                (await showConfirm(
                  ts({
                    en: "Current game progress will be lost",
                    vi: "Tiến trình hiện tại sẽ mất",
                  }),
                  ts({ en: "New Game?", vi: "Ván mới?" }),
                ))
              )
                game.requestNewGame();
            }}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 hover:text-white rounded-lg text-sm flex items-center gap-2 transition-colors border border-slate-600"
          >
            <RefreshCcw className="w-4 h-4" />{" "}
            {ts({ en: "New Game", vi: "Ván mới" })}
          </button>
        )}
      </div>

      {/* New Game Request Modal */}
      {isHost && state.newGameRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full shadow-2xl border border-slate-700">
            <h3 className="text-lg font-bold mb-4">
              {ts({ en: "New Game Request", vi: "Yêu cầu chơi lại" })}
            </h3>
            <p className="text-slate-300 mb-6">
              {ts({
                en: `${state.newGameRequest.fromName} wants to start a new game.`,
                vi: `${state.newGameRequest.fromName} muốn chơi lại ván mới.`,
              })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => game.declineNewGame()}
                className="flex-1 py-2 bg-slate-700 rounded-lg"
              >
                {ts({ en: "Decline", vi: "Từ chối" })}
              </button>
              <button
                onClick={() => game.acceptNewGame()}
                className="flex-1 py-2 bg-green-600 rounded-lg font-bold"
              >
                {ts({ en: "Accept", vi: "Chấp nhận" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard History Modal */}
      {showDiscardHistory && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDiscardHistory(false)}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 @md:p-6 max-w-md w-full max-h-[80vh] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base @md:text-lg font-bold">
                {ts({
                  en: `Discard Pile (${state.discardHistory.length} cards)`,
                  vi: `Lịch sử đánh (${state.discardHistory.length} lá bài)`,
                })}
              </h3>
              <button
                onClick={() => setShowDiscardHistory(false)}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] space-y-1">
              {[...state.discardHistory].reverse().map((entry, index) => {
                const { rank, suit } = decodeCard(entry.card);
                const suitColor =
                  suit === Suit.HEART || suit === Suit.DIAMOND
                    ? "text-red-500"
                    : "text-slate-800";
                return (
                  <div
                    key={`${entry.card}-${index}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700"
                  >
                    <div
                      className={`w-8 h-12 bg-white rounded relative shrink-0 ${suitColor} border border-slate-200 flex flex-col items-center justify-center`}
                    >
                      <span className="text-xs font-bold leading-none">
                        {RANK_DISPLAY[rank]}
                      </span>
                      <span className="text-[10px] leading-none">
                        {SUIT_SYMBOLS[suit]}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-slate-300 truncate">
                        {entry.playerName}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        #{state.discardHistory.length - index}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-yellow-500 transition-colors z-40 shadow-xl border border-slate-600"
        title={ts({ en: "Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={24} />
      </button>
      {showRules && createPortal(renderGameRules(), document.body)}

      {/* Animation Portal */}
      {flyingCard && animationElements && (
        <CommonFlyingCard
          containerRef={containerRef}
          sourceRect={animationElements.sourceRect}
          targetRect={animationElements.targetRect}
          isOpen={true}
          duration={500}
          onComplete={() => setFlyingCard(null)}
        >
          {flyingCard.hidden ? (
            <div className="w-14 h-20 @md:w-16 @md:h-24 bg-slate-700 rounded-lg border-2 border-slate-600 shadow-xl" />
          ) : (
            <TableCard card={flyingCard.card || 0} />
          )}
        </CommonFlyingCard>
      )}
    </div>
  );
}

function CardDisplay({
  card,
  selected,
  onClick,
  disabled = false,
  isSuggested = false,
  isHighlighted = false,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  isPhom?: boolean;
  isSuggested?: boolean;
  isHighlighted?: boolean;
}) {
  const { ts } = useLanguage();
  const { rank, suit } = decodeCard(card);
  const suitColor =
    suit === Suit.HEART || suit === Suit.DIAMOND
      ? "text-red-500"
      : "text-slate-800";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        transform: selected ? "translateY(-12px)" : undefined,
      }}
      className={`
        w-14 h-20 @md:w-16 @md:h-24
        bg-white rounded-lg @md:rounded-xl shadow-lg
        border-2 transition-all duration-300 font-bold shrink-0
        group/card relative
        ${
          selected
            ? "border-primary-500 ring-2 ring-primary-400 shadow-primary-500/30 shadow-xl"
            : isHighlighted
              ? "border-yellow-400 ring-2 ring-yellow-400/70 shadow-yellow-400/40 shadow-xl animate-pulse"
              : isSuggested
                ? "border-red-500 ring-2 ring-red-400/50"
                : "border-slate-200"
        }
        ${
          !disabled && onClick
            ? (!selected
                ? "hover:border-slate-400 hover:scale-105 hover:-translate-y-1"
                : "") + " cursor-pointer"
            : "cursor-default"
        }
      `}
    >
      {isSuggested && (
        <div className="absolute -top-2 bg-red-600/50 text-white px-1 rounded text-xs z-10 shadow-sm animate-bounce">
          <div className="flex flex-col items-center justify-center">
            <span>{ts({ en: "TRASH", vi: "BÀI RÁC" })}</span>
            <span className="text-xs group-hover/card:max-h-50 max-h-0 overflow-hidden transition-all duration-300">
              {ts({ en: "Should discard", vi: "Nên đánh" })}
            </span>
          </div>
        </div>
      )}
      <div
        className={`absolute top-1 left-1.5 @md:top-1.5 @md:left-2 flex flex-col items-center leading-none ${suitColor}`}
      >
        <span className="text-base @md:text-xl font-bold">
          {RANK_DISPLAY[rank]}
        </span>
        <span className="text-sm @md:text-lg">{SUIT_SYMBOLS[suit]}</span>
      </div>
    </button>
  );
}

function TableCard({
  card,
  isHighlight,
  onClick,
}: {
  card: Card;
  isHighlight?: boolean;
  onClick?: () => void;
}) {
  const { rank, suit } = decodeCard(card);
  const suitColor =
    suit === Suit.HEART || suit === Suit.DIAMOND
      ? "text-red-500"
      : "text-slate-800";

  return (
    <div
      onClick={onClick}
      className={`
        w-14 h-20 @md:w-16 @md:h-24
        bg-white rounded-lg @md:rounded-xl shadow-lg
        border-2 font-bold shrink-0 relative transition-all active:scale-95
        ${
          isHighlight
            ? "border-primary-500 ring-2 ring-primary-400 cursor-pointer shadow-primary-500/20 shadow-2xl hover:scale-105"
            : "border-slate-200"
        }
      `}
    >
      <div
        className={`absolute top-1 left-1.5 @md:top-1.5 @md:left-2 flex flex-col items-center leading-none ${suitColor}`}
      >
        <span className="text-sm @md:text-xl font-bold">
          {RANK_DISPLAY[rank]}
        </span>
        <span className="text-xs @md:text-base">{SUIT_SYMBOLS[suit]}</span>
      </div>
    </div>
  );
}

function PlayerSlotDisplay({
  slot,
  isCurrentTurn,
  isHost,
  gamePhase,
  onAddBot,
  onJoinSlot,
  onRemove,
  compact = false,
  canJoin = false,
}: {
  slot: PlayerSlot;
  isCurrentTurn: boolean;
  isHost: boolean;
  gamePhase: GamePhase;
  onAddBot: () => void;
  onJoinSlot: () => void;
  onRemove: () => void;
  compact?: boolean;
  canJoin?: boolean;
  index: number;
  isInGame: boolean;
}) {
  const { ts } = useLanguage();
  const isEmpty = slot.id === null;
  const canAddBot = isHost && gamePhase === "waiting";

  return (
    <div
      className={`
        ${compact ? "p-2 min-w-[90px]" : "p-2 @md:p-3 min-w-[100px] @md:min-w-[120px]"}
        rounded-lg @md:rounded-xl transition-all border-2
        ${
          isCurrentTurn && gamePhase === "playing"
            ? "border-primary-600 bg-primary-500/10 animate-bounce"
            : "border-slate-700 bg-slate-800/50"
        }
        ${isEmpty ? "border-dashed" : ""}
      `}
    >
      {isEmpty ? (
        <div className="flex flex-col gap-1 items-center">
          <span className="text-slate-500 text-xs text-center font-medium">
            {ts({ en: "Slot empty", vi: "Còn trống" })}
          </span>
          <div className="flex gap-1 w-full">
            {canAddBot && (
              <button
                onClick={onAddBot}
                className="flex-1 p-1 bg-slate-700 hover:bg-slate-600 rounded text-[10px] flex items-center justify-center gap-1"
                title={ts({ en: "Add Bot", vi: "Thêm Bot" })}
              >
                <Bot className="w-3 h-3" /> {ts({ en: "Bot", vi: "Bot" })}
              </button>
            )}
            {canJoin && (
              <button
                onClick={onJoinSlot}
                className="flex-1 p-1 bg-primary-700 hover:bg-primary-600 rounded text-[10px] flex items-center justify-center gap-1 font-bold"
                title={ts({ en: "Join", vi: "Tham gia" })}
              >
                <User className="w-3 h-3" />{" "}
                {ts({ en: "Join", vi: "Tham gia" })}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5 relative">
          <div className="flex items-center gap-1 w-full justify-center">
            {slot.isBot ? (
              <Bot className="w-4 h-4 text-blue-400" />
            ) : slot.isHost ? (
              <Crown className="w-4 h-4 text-yellow-400" />
            ) : (
              <User className="w-4 h-4 text-green-400" />
            )}
            <span className="text-xs font-bold truncate max-w-[60px] @md:max-w-[80px]">
              {slot.username}
            </span>
            {isHost && !slot.isHost && gamePhase === "waiting" && (
              <button
                onClick={onRemove}
                className="p-0.5 hover:bg-slate-700 rounded"
                title="Remove"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            )}
          </div>

          {gamePhase === "ended" && slot.phoms.length > 0 && (
            <div className="flex flex-col gap-1 mt-1 w-full">
              {slot.phoms.map((phom, phomIdx) => {
                const phomColors = [
                  "border-green-500/60 bg-green-500/10",
                  "border-blue-500/60 bg-blue-500/10",
                  "border-purple-500/60 bg-purple-500/10",
                  "border-amber-500/60 bg-amber-500/10",
                ];
                const colorClass = phomColors[phomIdx % phomColors.length];
                return (
                  <div
                    key={phomIdx}
                    className={`flex flex-wrap justify-center gap-0.5 p-1 rounded border-2 ${colorClass}`}
                  >
                    {phom.cards.map((card, i) => {
                      const { rank, suit } = decodeCard(card);
                      const suitColor =
                        suit === Suit.HEART || suit === Suit.DIAMOND
                          ? "text-red-500"
                          : "text-slate-800";
                      return (
                        <div
                          key={i}
                          className={`w-5 h-8 @md:w-6 @md:h-9 bg-white rounded relative shrink-0 ${suitColor} border border-slate-200`}
                        >
                          <div className="flex flex-col items-center leading-none mt-0.5">
                            <span className="text-[10px] @md:text-xs font-bold">
                              {RANK_DISPLAY[rank]}
                            </span>
                            <span className="text-[10px] @md:text-xs -mt-0.5">
                              {SUIT_SYMBOLS[suit]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {gamePhase === "ended" && slot.hand.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-0.5 max-w-[140px] @md:max-w-[200px] mt-1">
              {slot.hand.map((card, i) => {
                const { rank, suit } = decodeCard(card);
                const suitColor =
                  suit === Suit.HEART || suit === Suit.DIAMOND
                    ? "text-red-500"
                    : "text-slate-800";
                return (
                  <div
                    key={i}
                    className={`
                      w-6 h-10 @md:w-7 @md:h-11
                      bg-white rounded
                      relative shrink-0
                      ${suitColor}
                      border border-slate-200
                    `}
                  >
                    <div className="flex flex-col items-center leading-none mt-0.5">
                      <span className="text-xs @md:text-xs font-bold">
                        {RANK_DISPLAY[rank]}
                      </span>
                      <span className="text-xs @md:text-xs -mt-0.5">
                        {SUIT_SYMBOLS[suit]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            (gamePhase === "playing" || gamePhase === "ended") && (
              <div className="flex flex-col items-center gap-0.5 mt-1">
                <span className="text-[10px] text-slate-400 font-medium">
                  {slot.hand.length} {ts({ en: "cards", vi: "lá" })}
                </span>
                {slot.eatenCards.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap justify-center">
                    {slot.eatenCards.map((_c: Card, i: number) => (
                      <div
                        key={i}
                        className="w-1.5 h-2.5 bg-green-500 rounded-sm shadow-sm"
                        title={ts({ en: "Eaten", vi: "Bị ăn" })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
