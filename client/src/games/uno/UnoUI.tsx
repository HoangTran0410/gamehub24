import { useEffect, useState, useMemo, useRef } from "react";
import Uno from "./Uno";
import type { UnoState, UnoCard, PlayerSlot, CardColor } from "./types";
import {
  CardColor as Colors,
  CardType,
  COLOR_BG_CLASSES,
  TYPE_DISPLAY,
} from "./types";
import {
  Play,
  Bot,
  User,
  X,
  RefreshCcw,
  Check,
  Crown,
  Sparkle,
  Layers,
  Hand,
  BookOpen,
} from "lucide-react";
import { useUserStore } from "../../stores/userStore";
import { useRoomStore } from "../../stores/roomStore";
import { useAlertStore } from "../../stores/alertStore";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";

import useGameState from "../../hooks/useGameState";

export default function UnoUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Uno;
  const [state] = useGameState<UnoState>(game);
  const [selectedCard, setSelectedCard] = useState<UnoCard | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDiscardHistory, setShowDiscardHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const { username } = useUserStore();
  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();

  // Flying card animation state
  const [flyingCard, setFlyingCard] = useState<{
    card?: UnoCard;
    fromPlayerIndex: number;
    direction: "toDiscard" | "toHand";
    hidden?: boolean;
  } | null>(null);
  // Hide the newest card in discard pile while animation is playing
  const [hideTopDiscard, setHideTopDiscard] = useState(false);
  // Hide drawn cards in hand while animation is playing
  const [hideDrawnCards, setHideDrawnCards] = useState(0);

  const desktopSlotRefs = useRef<(HTMLDivElement | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const mobileSlotRefs = useRef<(HTMLDivElement | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const desktopDiscardPileRef = useRef<HTMLDivElement>(null);
  const mobileDiscardPileRef = useRef<HTMLDivElement>(null);
  const desktopDrawPileRef = useRef<HTMLButtonElement>(null);
  const mobileDrawPileRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const myHandRef = useRef<HTMLDivElement>(null);

  const isHost = game.isHost;
  const myIndex = game.getMyPlayerIndex();
  const mySlot = myIndex >= 0 ? state.players[myIndex] : null;

  const isMyTurn = state.currentTurnIndex === myIndex;
  const canStart = game.canStartGame();
  const currentRoom = useRoomStore((state) => state.currentRoom);
  const isRoomPlayer = useMemo(() => {
    return currentRoom?.players.some((p) => p.id === game.getUserId()) ?? false;
  }, [currentRoom, game]);

  // Track previous discard pile length to detect new cards
  const prevDiscardLengthRef = useRef(state.discardPile.length);
  // Track previous hand lengths for all players to detect drawn cards
  const prevHandLengthsRef = useRef(state.players.map((p) => p.hand.length));
  // Track previous turn index to know who played the card
  const prevTurnIndexRef = useRef(state.currentTurnIndex);

  useEffect(() => {
    return game.onUpdate((newState) => {
      // Detect if a card was played (discard pile grew)
      if (
        newState.discardPile.length > prevDiscardLengthRef.current &&
        newState.gamePhase === "playing"
      ) {
        const newCard = newState.discardPile[newState.discardPile.length - 1];

        // Use the previous turn index to know who played the card
        const fromPlayerIndex = prevTurnIndexRef.current;

        // Hide the top card while animating
        setHideTopDiscard(true);

        // Trigger flying animation
        setFlyingCard({
          card: newCard,
          fromPlayerIndex: fromPlayerIndex,
          direction: "toDiscard",
        });

        // Show the card in pile and clear animation after it completes
        setTimeout(() => {
          setHideTopDiscard(false);
          setFlyingCard(null);
        }, 350);
      }

      // Detect if cards were drawn (hand grew) - for ALL players
      newState.players.forEach((player, index) => {
        const prevLength = prevHandLengthsRef.current[index] || 0;
        const newLength = player.hand.length;

        if (newLength > prevLength && newState.gamePhase === "playing") {
          const isMe = index === myIndex;
          const drawnCount = newLength - prevLength;
          // If it's me, we know the card. If it's opponent, use hidden card.
          const drawnCard = isMe
            ? player.hand[player.hand.length - 1]
            : undefined;

          // Only hide drawn cards if it's me (since I can't see others' hands anyway)
          if (isMe) {
            setHideDrawnCards(drawnCount);
          }

          // Trigger flying animation for drawn card
          setFlyingCard({
            card: drawnCard,
            fromPlayerIndex: index,
            direction: "toHand",
            hidden: !isMe, // Should be hidden for opponents
          });

          // Show drawn cards and clear animation after it completes
          setTimeout(() => {
            if (isMe) setHideDrawnCards(0);
            setFlyingCard(null);
          }, 350);
        }
      });

      // Update refs for next comparison
      prevDiscardLengthRef.current = newState.discardPile.length;
      prevHandLengthsRef.current = newState.players.map((p) => p.hand.length);
      prevTurnIndexRef.current = newState.currentTurnIndex;

      setSelectedCard(null);
    });
  }, [game, myIndex]);

  const handleCardClick = (card: UnoCard) => {
    if (!isMyTurn || state.gamePhase !== "playing") return;
    if (state.pendingDraw > 0) return; // Must draw first

    if (!game.canPlayCardCheck(card)) return;

    // Check if wild card
    if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
      setSelectedCard(card);
      setShowColorPicker(true);
    } else {
      game.requestPlayCard(card);
    }
  };

  const handleColorSelect = (color: CardColor) => {
    if (selectedCard) {
      game.requestPlayCard(selectedCard, color);
      setShowColorPicker(false);
      setSelectedCard(null);
    }
  };

  const handleDraw = () => {
    game.requestDrawCard();
  };

  const handleCallUno = () => {
    game.requestCallUno();
  };

  // Arrange players around table
  const arrangedPlayers = useMemo(() => {
    const result = [];
    const baseIndex = myIndex >= 0 ? myIndex : 0;
    for (let i = 0; i < 4; i++) {
      const actualIndex = (baseIndex + i) % 4;
      result.push({ slot: state.players[actualIndex], actualIndex });
    }
    return result;
  }, [state.players, myIndex]);

  const topCard = state.discardPile[state.discardPile.length - 1];

  const renderPlayerSlot = (
    playerIndex: number,
    compact = false,
    targetRefArray?: React.MutableRefObject<(HTMLDivElement | null)[]>,
  ) => {
    const player = arrangedPlayers[playerIndex];
    const isInGame = myIndex >= 0;
    return (
      <div
        key={player.actualIndex}
        ref={(el: HTMLDivElement | null) => {
          if (targetRefArray) {
            targetRefArray.current[playerIndex] = el;
          }
        }}
      >
        <PlayerSlotDisplay
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
            !isHost &&
            state.gamePhase === "waiting" &&
            !isInGame &&
            isRoomPlayer
          }
        />
      </div>
    );
  };

  const renderPlayArea = (
    isMobile: boolean,
    pileRef: React.RefObject<HTMLDivElement | null>,
    drawRef: React.RefObject<HTMLButtonElement | null>,
  ) => {
    const cardSize = isMobile ? "medium" : "large";
    const pileDims = isMobile ? "w-14 h-20" : "w-20 h-28";
    const iconSize = isMobile ? "w-5 h-5" : "w-8 h-8";
    const containerClass = isMobile
      ? "flex @md:hidden flex-1 flex-col items-center justify-center gap-2 bg-slate-800/30 rounded-xl p-2 min-h-[120px]"
      : "hidden @md:flex flex-1 flex-col items-center justify-center gap-4 min-h-[200px] bg-slate-800/30 rounded-2xl p-4";

    return (
      <div className={containerClass}>
        {state.gamePhase === "waiting" && (
          <div
            className={`flex flex-col items-center ${
              isMobile ? "gap-2" : "gap-4"
            }`}
          >
            <span
              className={isMobile ? "text-slate-400 text-sm" : "text-slate-400"}
            >
              {ti({
                en: "Waiting for players...",
                vi: "Đang chờ người chơi...",
              })}
            </span>
            {isHost && canStart && (
              <button
                onClick={() => game.requestStartGame()}
                className={`px-6 py-3 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium flex items-center gap-2 ${
                  isMobile ? "text-sm px-4 py-2" : ""
                }`}
              >
                <Play className={isMobile ? "w-4 h-4" : "w-5 h-5"} />
                {ti({ en: "Start", vi: "Bắt đầu" })}
              </button>
            )}
            {isHost && !canStart && (
              <span className="text-sm text-slate-500">
                {ti({
                  en: "Need at least 2 players to start",
                  vi: "Cần ít nhất 2 người chơi để bắt đầu",
                })}
              </span>
            )}
          </div>
        )}

        {state.gamePhase === "playing" && (
          <div
            className={`flex flex-col items-center ${
              isMobile ? "gap-2" : "gap-4"
            }`}
          >
            {/* Discard & Draw Piles */}
            <div
              className={`flex items-center ${isMobile ? "gap-4" : "gap-6"}`}
            >
              {/* Draw Pile */}
              <button
                ref={drawRef}
                onClick={handleDraw}
                disabled={!isMyTurn}
                className={`relative ${pileDims} bg-linear-to-br from-slate-700 to-slate-900 rounded-xl border-2 border-slate-600 flex items-center justify-center hover:border-slate-400 transition-all disabled:opacity-50`}
              >
                <Layers className={`${iconSize} text-slate-400`} />
                <span className="absolute bottom-1 text-xs text-slate-400">
                  {state.drawPile.length}
                </span>
              </button>

              {/* Discard Pile Stack */}
              <div ref={pileRef} className={`relative ${pileDims}`}>
                <button
                  onClick={() => setShowDiscardHistory(true)}
                  className="absolute inset-0 cursor-pointer hover:scale-105 transition-transform"
                  title="Click to view history"
                >
                  {state.discardPile.slice(-4).map((card, index, arr) => {
                    const isTop = index === arr.length - 1;
                    // Hide top card during flying animation
                    if (isTop && hideTopDiscard) return null;
                    const offset =
                      (arr.length - 1 - index) * (isMobile ? 2 : 3);
                    const rotation =
                      (index - Math.floor(arr.length / 2)) * (isMobile ? 4 : 5);
                    return (
                      <div
                        key={card.id}
                        className="absolute inset-0"
                        style={{
                          transform: `translateX(${offset}px) translateY(${-offset}px) rotate(${rotation}deg)`,
                          zIndex: index,
                          opacity: isTop ? 1 : 0.7,
                        }}
                      >
                        <UnoCardDisplay card={card} size={cardSize} />
                      </div>
                    );
                  })}
                  {/* Current color indicator */}
                  {topCard && (
                    <div
                      className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-white z-10 ${
                        COLOR_BG_CLASSES[state.currentColor]
                      }`}
                    />
                  )}
                  {/* Badge showing total count */}
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-slate-600 rounded-full text-[10px] flex items-center justify-center z-20">
                    {state.discardPile.length}
                  </div>
                </button>
              </div>
            </div>

            {/* Pending Draw Indicator */}
            {state.pendingDraw > 0 && (
              <div className="text-lg font-bold text-red-400 animate-pulse">
                +{state.pendingDraw}{" "}
                {ti({ en: "cards pending!", vi: "bài chờ!" })}
              </div>
            )}

            {/* Turn & Direction (Desktop Only or Small Mobile?) */}
            {/* Simplified for mobile to save space, visible on Desktop */}
            <div className={`text-sm ${isMobile ? "hidden" : "block"}`}>
              {isMyTurn ? (
                <span className="text-primary-400 font-medium">
                  {ti({ en: "Your Turn", vi: "Lượt của BẠN" })}
                  {state.hasDrawn &&
                    ts({
                      en: " - Play drawn card or pass",
                      vi: " - Chọn bài đã rút hoặc bỏ lượt",
                    })}
                </span>
              ) : (
                <span className="text-slate-400">
                  {ti({
                    en:
                      state.players[state.currentTurnIndex]?.username +
                      "'s Turn",
                    vi:
                      "Lượt chơi của " +
                      state.players[state.currentTurnIndex]?.username,
                  })}
                </span>
              )}
            </div>

            <div
              className={`text-xs text-slate-500 ${
                isMobile ? "hidden" : "block"
              }`}
            >
              {ti({ en: "Direction", vi: "Hướng" })}:{" "}
              {state.turnDirection === 1
                ? "→ Clockwise"
                : "← Counter-clockwise"}
            </div>
          </div>
        )}

        {state.gamePhase === "ended" && (
          <div className="flex flex-col items-center gap-4">
            <Sparkle
              className={`${
                isMobile ? "w-8 h-8" : "w-12 h-12"
              } text-yellow-400`}
            />
            <span
              className={`${
                isMobile ? "text-lg" : "text-xl"
              } font-bold text-yellow-400`}
            >
              {state.players.find((p) => p.id === state.winner)?.username}{" "}
              {ti({ en: "Won!", vi: "Thắng!" })}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderGameRules = () => {
    if (!showRules) return null;

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
          <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({ en: "Game Rules: Uno", vi: "Luật Chơi: Uno" })}
            </h2>
            <button
              onClick={() => setShowRules(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 pt-0 space-y-4 text-slate-300 leading-relaxed">
            <div className="space-y-4">
              <p>
                {ti({
                  en: "Uno is a shedding-type card game. The goal is to be the first player to get rid of all your cards.",
                  vi: "Uno là trò chơi bài với mục tiêu là người đầu tiên đánh hết bài trên tay.",
                })}
              </p>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Gameplay", vi: "Luật chơi" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Match the top card on the discard pile by color or number.",
                    vi: "Đánh bài cùng màu hoặc cùng số với lá bài trên cùng.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Play Action cards to change the game:",
                    vi: "Sử dụng các lá bài chức năng để thay đổi cục diện:",
                  })}
                  <ul className="list-disc pl-5 mt-1 text-slate-400">
                    <li>
                      <strong>Skip</strong>:{" "}
                      {ti({
                        en: "Next player loses turn",
                        vi: "Người tiếp theo mất lượt",
                      })}
                    </li>
                    <li>
                      <strong>Reverse</strong>:{" "}
                      {ti({
                        en: "Reverses play direction",
                        vi: "Đảo chiều vòng đánh",
                      })}
                    </li>
                    <li>
                      <strong>Draw +2</strong>:{" "}
                      {ti({
                        en: "Next player draws 2 cards and skips turn",
                        vi: "Người sau phải bốc 2 lá và mất lượt",
                      })}
                    </li>
                    <li>
                      <strong>Wild</strong>:{" "}
                      {ti({
                        en: "Change current color",
                        vi: "Đổi màu đang đánh",
                      })}
                    </li>
                    <li>
                      <strong>Wild +4</strong>:{" "}
                      {ti({
                        en: "Change color + next player draws 4",
                        vi: "Đổi màu + người sau bốc 4 lá",
                      })}
                    </li>
                  </ul>
                </li>
                <li>
                  {ti({
                    en: "If you can't play, you must draw a card.",
                    vi: "Nếu không đánh được, bạn phải bốc 1 lá bài.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "UNO!", vi: "UNO!" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "When you have 1 card left, you MUST yell call 'UNO!'.",
                    vi: "Khi còn 1 lá bài, bạn BẮT BUỘC phải hô 'UNO!'.",
                  })}
                </li>
                {/* <li>
                  {ti({
                    en: "If you fail to call UNO and get caught, you must draw 2 penalty cards.",
                    vi: "Nếu quên hô UNO và bị bắt lỗi, bạn phải bốc phạt 2 lá.",
                  })}
                </li> */}
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Winning", vi: "Chiến thắng" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "The first player to play their last card wins the round.",
                    vi: "Người đầu tiên đánh hết bài sẽ thắng.",
                  })}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full p-2 @md:p-4 gap-2 @md:gap-4 overflow-hidden pb-16!"
    >
      {/* Mobile: Top row with 3 opponents */}
      <div className="flex @md:hidden justify-center gap-2">
        {renderPlayerSlot(1, true, mobileSlotRefs)}
        {renderPlayerSlot(2, true, mobileSlotRefs)}
        {renderPlayerSlot(3, true, mobileSlotRefs)}
      </div>

      {/* Desktop: Top Player */}
      <div className="hidden @md:flex justify-center">
        {renderPlayerSlot(2, false, desktopSlotRefs)}
      </div>

      {/* Desktop: Middle Row */}
      <div className="hidden @md:flex flex-1 items-center justify-between gap-4">
        {renderPlayerSlot(1, false, desktopSlotRefs)}

        {renderPlayArea(false, desktopDiscardPileRef, desktopDrawPileRef)}

        {renderPlayerSlot(3, false, desktopSlotRefs)}
      </div>

      {/* Mobile: Play Area */}
      {renderPlayArea(true, mobileDiscardPileRef, mobileDrawPileRef)}

      {/* Bottom: My Slot and Hand */}
      <div className="flex flex-col items-center gap-2 @md:gap-4">
        <div className="hidden @md:block">
          {renderPlayerSlot(0, false, desktopSlotRefs)}
        </div>
        <div className="flex @md:hidden">
          {renderPlayerSlot(0, true, mobileSlotRefs)}
        </div>

        {/* My Hand */}
        {mySlot && state.gamePhase === "playing" && (
          <div className="w-full overflow-x-auto overflow-y-visible pt-4 pb-1">
            <div ref={myHandRef} className="flex w-fit mx-auto px-4">
              {mySlot.hand.map((card, index) => {
                const canPlay = isMyTurn && game.canPlayCardCheck(card);
                // Hide drawn cards during animation
                if (index >= mySlot.hand.length - hideDrawnCards) return null;
                return (
                  <button
                    key={card.id}
                    onClick={() => handleCardClick(card)}
                    disabled={!isMyTurn || !canPlay}
                    className={`transition-transform duration-150 ${
                      index > 0 ? "-ml-6 @md:-ml-8" : ""
                    } ${
                      canPlay
                        ? "-translate-y-2 hover:-translate-y-3 cursor-pointer"
                        : "cursor-not-allowed"
                    }`}
                    style={{ zIndex: index }}
                  >
                    <UnoCardDisplay card={card} size="medium" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {state.gamePhase === "playing" && isMyTurn && (
          <div className="flex gap-2">
            {(state.pendingDraw > 0 || !game.hasPlayableCardCheck()) && (
              <button
                onClick={handleDraw}
                className="px-4 py-1.5 @md:px-6 @md:py-2 bg-red-600 hover:bg-red-500 rounded-lg font-medium flex items-center gap-1 @md:gap-2 text-sm"
              >
                <Layers className="w-4 h-4" />
                {ti({ en: "Draw", vi: "Rút" })} {state.pendingDraw || ""}
              </button>
            )}
            {state.hasDrawn && (
              <button
                onClick={handleDraw}
                className="px-4 py-1.5 @md:px-6 @md:py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium flex items-center gap-1 @md:gap-2 text-sm"
              >
                {ti({ en: "Pass", vi: "Bỏ qua" })}
              </button>
            )}
            {mySlot && mySlot.hand.length <= 2 && !mySlot.calledUno && (
              <button
                onClick={handleCallUno}
                className="px-4 py-1.5 @md:px-6 @md:py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-bold flex items-center gap-1 @md:gap-2 text-sm animate-pulse"
              >
                <Hand className="w-4 h-4" />
                UNO!
              </button>
            )}
          </div>
        )}

        {/* Game Controls */}
        {state.gamePhase !== "waiting" && (
          <div className="flex gap-2">
            {mySlot && (
              <button
                onClick={async () => {
                  if (isHost && state.gamePhase === "playing") {
                    const confirmed = await showConfirm(
                      ts({
                        en: "This will reset the current game and start fresh.",
                        vi: "Bạn có chắc muốn bắt đầu lại trò chơi?",
                      }),
                      ts({
                        en: "Start New Game?",
                        vi: "Bắt đầu trò chơi mới?",
                      }),
                    );
                    if (confirmed) {
                      game.requestNewGame();
                    }
                  } else {
                    game.requestNewGame();
                  }
                }}
                className="px-3 py-1.5 @md:px-4 @md:py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs @md:text-sm flex items-center gap-1 @md:gap-2"
              >
                <RefreshCcw className="w-3 h-3 @md:w-4 @md:h-4" />
                {ti({ en: "New Game", vi: "Chơi lại" })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Color Picker Modal */}
      {showColorPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-4 @md:p-6 shadow-xl">
            <h3 className="text-base @md:text-lg font-bold mb-4 text-center">
              {ti({ en: "Choose Color", vi: "Chọn Màu" })}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[Colors.RED, Colors.BLUE, Colors.GREEN, Colors.YELLOW].map(
                (color) => (
                  <button
                    key={color}
                    onClick={() => handleColorSelect(color)}
                    className={`w-16 h-16 @md:w-20 @md:h-20 rounded-xl ${COLOR_BG_CLASSES[color]} hover:scale-110 transition-transform border-4 border-white/30`}
                  />
                ),
              )}
            </div>
            <button
              onClick={() => {
                setShowColorPicker(false);
                setSelectedCard(null);
              }}
              className="mt-4 w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
            >
              {ti({ en: "Cancel", vi: "Hủy" })}
            </button>
          </div>
        </div>
      )}

      {/* New Game Request Modal */}
      {isHost && state.newGameRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-4 @md:p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-base @md:text-lg font-bold mb-3 @md:mb-4">
              {ti({ en: "New Game Request", vi: "Yêu cầu chơi lại" })}
            </h3>
            <p className="text-slate-300 mb-4 @md:mb-6 text-sm @md:text-base">
              <span className="font-medium text-white">
                {state.newGameRequest.fromName}
              </span>{" "}
              {ti({ en: "wants to start a new game.", vi: "muốn chơi lại" })}
            </p>
            <div className="flex gap-2 @md:gap-3">
              <button
                onClick={() => game.declineNewGame()}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium flex items-center justify-center gap-2 text-sm"
              >
                <X className="w-4 h-4" />
                {ti({ en: "Decline", vi: "Từ chối" })}
              </button>
              <button
                onClick={() => game.acceptNewGame()}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium flex items-center justify-center gap-2 text-sm"
              >
                <Check className="w-4 h-4" />
                {ti({ en: "Accept", vi: "Đồng ý" })}
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
                {ti({
                  en: `Discard Pile (${state.discardPile.length} cards)`,
                  vi: `Lịch sử (${state.discardPile.length} lá bài)`,
                })}
              </h3>
              <button
                onClick={() => setShowDiscardHistory(false)}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] grid grid-cols-4 @md:grid-cols-5 gap-2">
              {[...state.discardPile].reverse().map((card, index) => (
                <div key={`${card.id}-${index}`} className="relative">
                  <UnoCardDisplay card={card} size="small" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Flying Card Animation */}
      {flyingCard && (
        <FlyingCard
          card={flyingCard.card}
          hidden={flyingCard.hidden}
          fromPlayerIndex={flyingCard.fromPlayerIndex}
          myIndex={myIndex}
          desktopSlotRefs={desktopSlotRefs}
          mobileSlotRefs={mobileSlotRefs}
          myHandRef={myHandRef}
          desktopDiscardPileRef={desktopDiscardPileRef}
          mobileDiscardPileRef={mobileDiscardPileRef}
          desktopDrawPileRef={desktopDrawPileRef}
          mobileDrawPileRef={mobileDrawPileRef}
          containerRef={containerRef}
          direction={flyingCard.direction}
        />
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

// UNO Card Component
function UnoCardDisplay({
  card,
  size = "medium",
  hidden = false,
}: {
  card?: UnoCard;
  size?: "small" | "medium" | "large";
  hidden?: boolean;
}) {
  const sizeClasses = {
    small: "w-10 h-14",
    medium: "w-14 h-20 @md:w-16 @md:h-24",
    large: "w-20 h-28",
  };

  const textSizes = {
    small: "text-lg",
    medium: "text-xl @md:text-2xl",
    large: "text-3xl",
  };

  if (hidden || !card) {
    return (
      <div
        className={`
        ${sizeClasses[size]}
        bg-slate-900
        rounded-lg @md:rounded-xl shadow-lg
        border-2 border-slate-700
        shrink-0
        relative
        overflow-hidden
      `}
      >
        <div className="absolute inset-1 rounded border-2 border-slate-600 flex items-center justify-center bg-linear-to-br from-slate-800 to-black">
          <span className="text-slate-700/50 font-bold transform -rotate-45 select-none text-sm @md:text-base">
            UNO
          </span>
        </div>
      </div>
    );
  }

  const getCardContent = () => {
    if (card.type === CardType.NUMBER) {
      return card.value?.toString() || "0";
    }
    return TYPE_DISPLAY[card.type];
  };

  return (
    <div
      className={`
        ${sizeClasses[size]}
        ${COLOR_BG_CLASSES[card.color]}
        rounded-lg @md:rounded-xl shadow-lg
        border-2 border-white/30
        font-bold text-white
        ${textSizes[size]}
        shrink-0
        relative
      `}
      style={{
        textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
      }}
    >
      <span className="absolute top-0.5 left-1.5">{getCardContent()}</span>
    </div>
  );
}

// Flying Card Animation Component
function FlyingCard({
  card,
  hidden = false,
  fromPlayerIndex,
  myIndex,
  myHandRef,
  desktopSlotRefs,
  mobileSlotRefs,
  desktopDiscardPileRef,
  mobileDiscardPileRef,
  desktopDrawPileRef,
  mobileDrawPileRef,
  containerRef,
  direction = "toDiscard",
}: {
  card?: UnoCard;
  hidden?: boolean;
  fromPlayerIndex: number;
  myIndex: number;
  desktopSlotRefs: React.RefObject<(HTMLDivElement | null)[]>;
  mobileSlotRefs: React.RefObject<(HTMLDivElement | null)[]>;
  myHandRef: React.RefObject<HTMLDivElement | null>;
  desktopDiscardPileRef: React.RefObject<HTMLDivElement | null>;
  mobileDiscardPileRef: React.RefObject<HTMLDivElement | null>;
  desktopDrawPileRef?: React.RefObject<HTMLButtonElement | null>;
  mobileDrawPileRef?: React.RefObject<HTMLButtonElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  direction?: "toDiscard" | "toHand";
}) {
  const [animationState, setAnimationState] = useState<{
    startPos: { x: number; y: number };
    endPos: { x: number; y: number };
  } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Convert actual player index to screen position
    // Screen positions: 0=me (bottom), 1=left, 2=top, 3=right
    const baseIndex = myIndex >= 0 ? myIndex : 0;
    const screenPosition = (fromPlayerIndex - baseIndex + 4) % 4;

    let playerEl: HTMLElement | null | undefined;

    // Helper to check visibility
    const isVisible = (el: HTMLElement | null | undefined) =>
      el && el.offsetParent !== null;

    if (screenPosition === 0 && isVisible(myHandRef.current)) {
      playerEl = myHandRef.current;
    } else if (isVisible(desktopSlotRefs.current?.[screenPosition])) {
      playerEl = desktopSlotRefs.current?.[screenPosition];
    } else if (isVisible(mobileSlotRefs.current?.[screenPosition])) {
      playerEl = mobileSlotRefs.current?.[screenPosition];
    } else {
      // Fallback
      playerEl =
        myHandRef.current ||
        desktopSlotRefs.current?.[screenPosition] ||
        mobileSlotRefs.current?.[screenPosition];
    }

    const discardPileEl = isVisible(desktopDiscardPileRef.current)
      ? desktopDiscardPileRef.current
      : mobileDiscardPileRef.current ||
        desktopDiscardPileRef.current ||
        mobileDiscardPileRef.current;

    const drawPileEl = isVisible(desktopDrawPileRef?.current)
      ? desktopDrawPileRef?.current
      : mobileDrawPileRef?.current ||
        desktopDrawPileRef?.current ||
        mobileDrawPileRef?.current;
    const containerEl = containerRef.current;

    if (!playerEl || !discardPileEl || !containerEl) return;

    // Determine source and target based on direction
    let sourceEl, targetEl;

    if (direction === "toDiscard") {
      sourceEl = playerEl;
      targetEl = discardPileEl;
    } else {
      // toHand (Draw)
      if (!drawPileEl) return;
      sourceEl = drawPileEl;
      targetEl = playerEl;
    }

    const containerRect = containerEl.getBoundingClientRect();
    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    // Calculate positions relative to container
    const startPos = {
      x: sourceRect.left + sourceRect.width / 2 - containerRect.left - 40,
      y: sourceRect.top + sourceRect.height / 2 - containerRect.top - 56,
    };
    const endPos = {
      x: targetRect.left + targetRect.width / 2 - containerRect.left - 40,
      y: targetRect.top + targetRect.height / 2 - containerRect.top - 56,
    };

    setAnimationState({ startPos, endPos });

    // Trigger animation after a small delay to ensure initial position is set
    const animationTimer = setTimeout(() => {
      setIsAnimating(true);
    }, 10);

    return () => clearTimeout(animationTimer);
  }, [
    fromPlayerIndex,
    myIndex,
    desktopSlotRefs,
    mobileSlotRefs,
    myHandRef,
    desktopDiscardPileRef,
    mobileDiscardPileRef,
    desktopDrawPileRef,
    mobileDrawPileRef,
    containerRef,
    direction,
  ]);

  if (!animationState) return null;

  const { startPos, endPos } = animationState;
  const currentPos = isAnimating ? endPos : startPos;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: currentPos.x,
        top: currentPos.y,
        transition: isAnimating ? "all 300ms ease-out" : "none",
        transform: isAnimating ? "scale(1.1) rotate(5deg)" : "scale(0.8)",
        opacity: isAnimating ? 1 : 0.8,
      }}
    >
      <UnoCardDisplay card={card} size="large" hidden={hidden} />
    </div>
  );
}

// Player Slot Display
function PlayerSlotDisplay({
  slot,
  index,
  isCurrentTurn,
  isHost,
  gamePhase,
  onAddBot,
  onJoinSlot,
  onRemove,
  compact = false,
  // isInGame,
  canJoin = false,
}: {
  slot: PlayerSlot;
  index: number;
  isCurrentTurn: boolean;
  isHost: boolean;
  gamePhase: string;
  onAddBot: () => void;
  onJoinSlot: () => void;
  onRemove: () => void;
  compact?: boolean;
  isInGame: boolean;
  canJoin?: boolean;
}) {
  const isEmpty = slot.id === null;
  const canAddBot = isHost && gamePhase === "waiting";
  // const canJoin = !isHost && gamePhase === "waiting" && !isInGame;

  return (
    <div
      className={`
        ${
          compact
            ? "p-2 min-w-[90px]"
            : "p-2 @md:p-3 min-w-[100px] @md:min-w-[120px]"
        }
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
        <div className="flex flex-col gap-1">
          <span className="text-slate-500 text-xs text-center">
            Slot {index + 1}
          </span>
          <div className="flex gap-1">
            {canAddBot && (
              <button
                onClick={onAddBot}
                className="flex-1 p-1 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center"
                title="Add Bot"
              >
                <Bot className="w-5 h-5" />
              </button>
            )}
            {canJoin && (
              <button
                onClick={onJoinSlot}
                className="flex-1 p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center gap-1"
                title="Join this slot"
              >
                <User className="w-4 h-4" />
                Join
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            {slot.isBot && <Bot className="w-5 h-5 text-blue-400" />}
            {slot.isHost && <Crown className="w-5 h-5 text-yellow-400" />}
            <span className="text-xs font-medium">{slot.username}</span>
            {canAddBot && slot.id && !slot.isHost && (
              <button
                onClick={onRemove}
                className="p-0.5 hover:bg-slate-700 rounded"
                title="Remove"
              >
                <X className="w-5 h-5 text-red-400" />
              </button>
            )}
          </div>
          {(gamePhase === "playing" || gamePhase === "ended") && (
            <span className="text-[10px] text-slate-400">
              {slot.hand.length} cards
            </span>
          )}
          {slot.calledUno && slot.hand.length <= 1 && (
            <span className="text-[10px] text-yellow-400 font-bold">UNO!</span>
          )}
        </div>
      )}
    </div>
  );
}
