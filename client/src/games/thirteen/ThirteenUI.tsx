import { useState, useMemo, useEffect } from "react";
import Thirteen from "./Thirteen";
import type { Card, PlayerSlot } from "./types";
import { SUIT_SYMBOLS, RANK_DISPLAY, Suit } from "./types";
import { useRoomStore } from "../../stores/roomStore";
import {
  Play,
  SkipForward,
  Bot,
  User,
  X,
  RefreshCcw,
  Check,
  Crown,
  Sparkle,
  BookOpen,
} from "lucide-react";
import { useUserStore } from "../../stores/userStore";
import { useAlertStore } from "../../stores/alertStore";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";
import useGameState from "../../hooks/useGameState";

export default function ThirteenUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Thirteen;
  const [state] = useGameState(game);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [expandPlays, setExpandPlays] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const { username } = useUserStore();
  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();
  const { currentRoom } = useRoomStore();

  const isHost = game.isHost;
  const myIndex = game.getMyPlayerIndex();
  const mySlot = myIndex >= 0 ? state.players[myIndex] : null;
  const isMyTurn = state.currentTurnIndex === myIndex;
  const canStart = game.canStartGame();

  const isRoomPlayer = useMemo(() => {
    return currentRoom?.players.some((p) => p.id === game.getUserId()) ?? false;
  }, [currentRoom, game]);

  const validation = useMemo(() => {
    if (selectedCards.length === 0 || !mySlot) return null;
    const selectedCardObjs = selectedCards.map((i) => mySlot.hand[i]);
    return game.validateSelectedCards(selectedCardObjs);
  }, [selectedCards, mySlot, game]);

  useEffect(() => {
    return game.onUpdate((_newState) => {
      setSelectedCards([]);
    });
  }, [game]);

  const handleCardClick = (index: number) => {
    if (!isMyTurn || state.gamePhase !== "playing") return;

    setSelectedCards((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      return [...prev, index];
    });
  };

  const handlePlay = () => {
    if (selectedCards.length === 0 || !mySlot) return;
    const cards = selectedCards
      .map((i) => mySlot.hand[i])
      .sort((a, b) => a.rank - b.rank);
    game.requestPlayCards(cards);
    setSelectedCards([]);
  };

  const handlePass = () => {
    game.requestPass();
  };

  // Arrange players around table (current player at bottom)
  // If player is not in any slot yet, just show slots in order
  const arrangedPlayers = useMemo(() => {
    const result = [];
    const baseIndex = myIndex >= 0 ? myIndex : 0; // Use 0 if not in any slot
    for (let i = 0; i < 4; i++) {
      const actualIndex = (baseIndex + i) % 4;
      result.push({ slot: state.players[actualIndex], actualIndex });
    }
    return result;
  }, [state.players, myIndex]);

  // Reusable Play Area element
  const renderPlayArea = (variant: "desktop" | "mobile") => {
    const isDesktop = variant === "desktop";
    const minHeight = isDesktop ? "min-h-[80px]" : "min-h-[60px]";
    const textSize = isDesktop ? "text-sm" : "text-xs";
    const marginTop = isDesktop ? "mt-6" : "mt-4";

    return (
      <>
        <div
          className={`relative ${minHeight} flex items-center justify-center`}
        >
          {state.currentTrick.length === 0 ? (
            <span className={`text-slate-500 ${isDesktop ? "" : "text-sm"}`}>
              New Round
            </span>
          ) : (
            <div
              className="flex cursor-pointer items-center justify-center max-w-[200px]"
              onClick={() => setExpandPlays(!expandPlays)}
            >
              {state.currentTrick.map((play, playIndex) => {
                const hasMultipleCards = play.cards.length > 1;
                // Calculate center offset to stack plays in center of parent
                const totalPlays = state.currentTrick.length;
                const collapsedOffset = -90; // % of own width
                const expandedOffset = -30;
                // Total offset from first to last play
                const totalOffset = expandPlays
                  ? expandedOffset * (totalPlays - 1)
                  : collapsedOffset * (totalPlays - 1);
                // Shift to center: half of total offset
                const centerShift = -totalOffset / 2;
                // Each play's position: its cumulative offset + center shift
                const translateX =
                  (expandPlays ? expandedOffset : collapsedOffset) * playIndex +
                  centerShift;
                // Add Y offset for visual distinction
                const offsetY = playIndex * (isDesktop ? 4 : 3);
                return (
                  <div
                    key={playIndex}
                    style={{
                      transform: `translateX(${translateX}%) translateY(${offsetY}px)`,
                    }}
                    className={`
                      flex rounded-lg transition-all duration-300 ease-out
                      ${
                        hasMultipleCards
                          ? "bg-slate-700/30 ring-1 ring-slate-600"
                          : ""
                      }
                    `}
                  >
                    {play.cards.map((card, j) => (
                      <TableCard index={j} key={j} card={card} delay={j * 50} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {state.gamePhase === "playing" && (
          <div className={`${textSize} border-t ${marginTop} pt-2`}>
            {isMyTurn ? (
              <span className="text-primary-400 font-medium">
                {ts({ en: "Your Turn", vi: "Lượt của bạn" })}
              </span>
            ) : (
              <span className="text-slate-400">
                {ts({ en: "Turn of", vi: "Lượt của" })}
                {state.players[state.currentTurnIndex]?.username}
              </span>
            )}
          </div>
        )}
      </>
    );
  };

  // Reusable Winner display element
  const renderWinner = (variant: "desktop" | "mobile") => {
    const isDesktop = variant === "desktop";
    const iconSize = isDesktop ? "w-12 h-12" : "w-8 h-8";
    const textSize = isDesktop ? "text-xl" : "text-base";
    const gap = isDesktop ? "gap-4" : "gap-2";

    return (
      <div className={`flex flex-col items-center ${gap}`}>
        <Sparkle className={`${iconSize} text-yellow-400`} />
        <span className={`${textSize} font-bold text-yellow-400`}>
          {state.players.find((p) => p.id === state.winner)?.username} Won!
        </span>
      </div>
    );
  };

  const renderPlayerSlot = (playerIndex: number, compact = false) => {
    const player = arrangedPlayers[playerIndex];
    const isInGame = myIndex >= 0; // Current user is already in a slot
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
    if (!showRules) return null;

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
          <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({
                en: "Game Rules: Thirteen",
                vi: "Luật Chơi: Tiến Lên Miền Nam",
              })}
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
                  en: "Thirteen (Tien Len) is a popular climbing card game using a standard 52-card deck. The goal is to be the first to empty your hand.",
                  vi: "Tiến Lên Miền Nam là trò chơi bài phổ biến sử dụng bộ bài 52 lá. Mục tiêu là người đầu tiên đánh hết bài.",
                })}
              </p>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Card Ranking", vi: "Thứ tự bài" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Ranks (Low to High): 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2.",
                    vi: "Giá trị (Thấp đến Cao): 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Suits (Low to High): Spades ♠ < Clubs ♣ < Diamonds ♦ < Hearts ♥.",
                    vi: "Chất (Thấp đến Cao): Bích ♠ < Chuồn ♣ < Rô ♦ < Cơ ♥.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Combinations", vi: "Kết hợp bài" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>{ti({ en: "Single", vi: "Cóc" })}</strong>:{" "}
                  {ti({ en: "A single card.", vi: "Một lá bài lẻ." })}
                </li>
                <li>
                  <strong>{ti({ en: "Pair", vi: "Đôi" })}</strong>:{" "}
                  {ti({
                    en: "Two cards of the same rank.",
                    vi: "2 lá cùng giá trị.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Triple", vi: "3 (Sám cô)" })}</strong>:{" "}
                  {ti({
                    en: "Three cards of the same rank.",
                    vi: "3 lá cùng giá trị.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Straight", vi: "Sảnh" })}</strong>:{" "}
                  {ti({
                    en: "3+ consecutive rank cards (e.g., 3-4-5). 2 cannot be in a straight.",
                    vi: "3+ lá liên tiếp (VD: 3-4-5). 2 không được nằm trong sảnh.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Four of a Kind", vi: "Tứ quý" })}</strong>:{" "}
                  {ti({
                    en: "Four cards of the same rank.",
                    vi: "4 lá cùng giá trị.",
                  })}
                </li>
                <li>
                  <strong>
                    {ti({ en: "Three consecutive pairs", vi: "3 đôi thông" })}
                  </strong>
                  :{" "}
                  {ti({
                    en: "Three consecutive pairs of cards.",
                    vi: "3 đôi liên tiếp.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Gameplay", vi: "Luật chơi" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Play a combination that is higher (better rank/suit) than the previous one to beat it.",
                    vi: "Đánh bộ bài cao hơn (về giá trị/chất) để chặn bài trước đó.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "If everyone passes, the last player to play starts a new round with any combination.",
                    vi: "Nếu tất cả bỏ lượt, người đánh cuối cùng sẽ được đi tiếp với bất kỳ bộ nào.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Special: Four of a Kind cuts a 2. Three consecutive pairs cuts a single 2 or three consecutive pairs.",
                    vi: "Đặc biệt: Tứ quý chặt 2. 3 đôi thông chặt 2 hoặc 3 đôi thông nhỏ hơn.",
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
    <div className="flex flex-col h-full p-2 @md:p-4 gap-2 @md:gap-4 overflow-hidden @md:min-h-[500px] pb-16!">
      {/* Mobile: Top row with 3 opponents */}
      <div className="flex @md:hidden justify-center gap-2">
        {renderPlayerSlot(1, true)}
        {renderPlayerSlot(2, true)}
        {renderPlayerSlot(3, true)}
      </div>

      {/* Desktop: Top Player */}
      <div className="hidden @md:flex justify-center">
        {renderPlayerSlot(2)}
      </div>

      {/* Desktop: Middle Row with Left/Right players and Play Area */}
      <div className="hidden @md:flex flex-1 items-center justify-between gap-4">
        {renderPlayerSlot(1)}

        {/* Play Area - Desktop */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[200px] bg-slate-800/30 rounded-2xl p-4">
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
                  className="px-6 py-3 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium flex items-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  {ts({ en: "Start Game", vi: "Bắt đầu" })}
                </button>
              )}
              {isHost && !canStart && (
                <span className="text-sm text-slate-500">
                  {ts({
                    en: "Need at least 2 players",
                    vi: "Cần ít nhất 2 người chơi",
                  })}
                </span>
              )}
            </div>
          )}

          {(state.gamePhase === "playing" || state.gamePhase === "ended") && (
            <>{renderPlayArea("desktop")}</>
          )}

          {state.gamePhase === "ended" && renderWinner("desktop")}
        </div>

        {renderPlayerSlot(3)}
      </div>

      {/* Mobile: Play Area */}
      <div className="flex @md:hidden flex-1 flex-col items-center justify-center gap-2 bg-slate-800/30 rounded-xl p-2 min-h-[120px]">
        {state.gamePhase === "waiting" && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-slate-400 text-sm">
              {ts({
                en: "Waiting for players...",
                vi: "Đang chờ người chơi...",
              })}
            </span>
            {isHost && canStart && (
              <button
                onClick={() => game.requestStartGame()}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg font-medium flex items-center gap-2 text-sm"
              >
                <Play className="w-4 h-4" />
                {ts({ en: "Start", vi: "Bắt đầu" })}
              </button>
            )}
            {isHost && !canStart && (
              <span className="text-xs text-slate-500">
                {ts({
                  en: "Need at least 2 players",
                  vi: "Cần ít nhất 2 người chơi",
                })}
              </span>
            )}
          </div>
        )}

        {state.gamePhase === "playing" && <>{renderPlayArea("mobile")}</>}

        {state.gamePhase === "ended" && renderWinner("mobile")}
      </div>

      {/* Bottom: My Slot and Hand */}
      <div className="flex flex-col items-center gap-2 @md:gap-4">
        {/* Desktop: My Player Slot */}
        <div className="hidden @md:block">{renderPlayerSlot(0)}</div>

        {/* Mobile: My Player Slot */}
        <div className="flex @md:hidden">{renderPlayerSlot(0, true)}</div>

        {/* My Hand */}
        {mySlot && state.gamePhase === "playing" && (
          <div className="flex justify-center max-w-full overflow-x-auto overflow-y-visible pt-4 p-0 @md:p-4 pb-1">
            {mySlot.hand.map((card, index) => (
              <CardDisplay
                key={`${card.rank}-${card.suit}`}
                card={card}
                selected={selectedCards.includes(index)}
                onClick={() => handleCardClick(index)}
                disabled={!isMyTurn}
                index={index}
              />
            ))}
          </div>
        )}

        {/* Validation Error & Action Buttons */}
        {state.gamePhase === "playing" && isMyTurn && (
          <div className="flex flex-col items-center gap-2">
            {/* Validation Message */}
            {validation?.valid && (
              <span className="text-green-400 text-xs @md:text-sm font-medium">
                ✓ {ti({ en: "Valid play", vi: "Bài hợp lệ" })}
              </span>
            )}
            {validation?.valid === false && (
              <span className="text-red-400 text-xs @md:text-sm font-medium">
                ⚠️ {ti(validation.error)}
              </span>
            )}

            <div className="flex gap-2">
              <button
                onClick={handlePlay}
                disabled={selectedCards.length === 0 || !validation?.valid}
                className="px-4 py-1.5 @md:px-6 @md:py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-900 disabled:cursor-not-allowed rounded-lg font-medium flex items-center gap-1 @md:gap-2 text-sm"
              >
                <Play className="w-4 h-4" />
                {ts({ en: "Play", vi: "Đánh" })}
              </button>
              {state.lastCombination && (
                <button
                  onClick={async () => {
                    const confirmed = await useAlertStore.getState().confirm(
                      ts({
                        en: "You will not be able to play cards until the next round.",
                        vi: "Bạn sẽ không thể chơi bài cho đến vòng sau.",
                      }),
                      ts({ en: "Pass this round?", vi: "Bỏ lượt này?" }),
                    );
                    if (confirmed) {
                      handlePass();
                    }
                  }}
                  className="px-4 py-1.5 @md:px-6 @md:py-2 bg-red-700 hover:bg-red-600 rounded-lg font-medium flex items-center gap-1 @md:gap-2 text-sm"
                >
                  <SkipForward className="w-4 h-4" />
                  {ts({ en: "Pass", vi: "Bỏ lượt" })}
                </button>
              )}
            </div>
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
                        vi: "Việc này sẽ xoá game hiện tại và bắt đầu lại.",
                      }),
                      ts({ en: "Start New Game?", vi: "Chơi lại?" }),
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
                {ts({ en: "New game", vi: "Chơi lại" })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* New Game Request Modal (Host Only) */}
      {isHost && state.newGameRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-4 @md:p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-base @md:text-lg font-bold mb-3 @md:mb-4">
              {ts({ en: "New Game Request", vi: "Yêu cầu chơi lại" })}
            </h3>
            <p className="text-slate-300 mb-4 @md:mb-6 text-sm @md:text-base">
              <span className="font-medium text-white">
                {state.newGameRequest.fromName}
              </span>{" "}
              {ts({
                en: "wants to start a new game.",
                vi: "muốn chơi lại game.",
              })}
            </p>
            <div className="flex gap-2 @md:gap-3">
              <button
                onClick={() => game.declineNewGame()}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium flex items-center justify-center gap-2 text-sm"
              >
                <X className="w-4 h-4" />
                {ts({ en: "Decline", vi: "Từ chối" })}
              </button>
              <button
                onClick={() => game.acceptNewGame()}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium flex items-center justify-center gap-2 text-sm"
              >
                <Check className="w-4 h-4" />
                {ts({ en: "Accept", vi: "Chấp nhận" })}
              </button>
            </div>
          </div>
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

// Card component for hand display (overlapping) - top-left corner style
function CardDisplay({
  card,
  selected,
  onClick,
  disabled = false,
  index = 0,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  index?: number;
}) {
  const suitColor =
    card.suit === Suit.HEART || card.suit === Suit.DIAMOND
      ? "text-red-500"
      : "text-slate-800";

  // Overlap cards: negative margin based on index
  const marginLeft = index === 0 ? "ml-0" : "-ml-5 @md:-ml-9";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ zIndex: index }}
      className={`
        ${marginLeft}
        w-10 h-16 @md:w-16 @md:h-20
        bg-white rounded-md @md:rounded-lg shadow-lg
        border-2 transition-all duration-150 font-bold shrink-0 relative
        ${
          selected
            ? "border-primary-500 -translate-y-3 ring-2 ring-primary-400 shadow-primary-500/30 shadow-xl z-50"
            : "border-slate-300 hover:border-slate-400"
        }
        ${
          !disabled && onClick
            ? (!selected ? "md:hover:-translate-y-1" : "") + " cursor-pointer"
            : "cursor-default"
        }
      `}
    >
      {/* Top-left corner */}
      <div
        className={`absolute top-0.5 left-1 flex flex-col items-center leading-none ${suitColor}`}
      >
        <span className="text-sm @md:text-lg font-bold">
          {RANK_DISPLAY[card.rank]}
        </span>
        <span className="text-sm @md:text-sm">{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </button>
  );
}

// Card for table display
function TableCard({
  card,
  delay = 0,
  index = 0,
}: {
  card: Card;
  delay?: number;
  index?: number;
}) {
  const suitColor =
    card.suit === Suit.HEART || card.suit === Suit.DIAMOND
      ? "text-red-500"
      : "text-slate-800";

  const marginLeft = index === 0 ? "ml-0" : "-ml-6 @md:-ml-9";

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`
        ${marginLeft}
        w-10 h-14 @md:w-16 @md:h-20
        bg-white rounded-md @md:rounded-lg shadow-lg
        border-2 border-slate-200 font-bold shrink-0 relative
        animate-[cardPlay_0.3s_ease-out_forwards]
      `}
    >
      <div
        className={`absolute top-0.5 left-1 flex flex-col items-center leading-none ${suitColor}`}
      >
        <span className="text-xs @md:text-lg font-bold">
          {RANK_DISPLAY[card.rank]}
        </span>
        <span className="text-[10px] @md:text-sm">
          {SUIT_SYMBOLS[card.suit]}
        </span>
      </div>
    </div>
  );
}

// Compact player slot for mobile
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
  isInGame: boolean; // Is current user already in a slot
  canJoin?: boolean;
}) {
  const { ts } = useLanguage();
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
          slot.passed && gamePhase === "playing"
            ? "border-slate-600 bg-slate-900/70 opacity-50"
            : isCurrentTurn && gamePhase === "playing"
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
                {ts({ en: "Join", vi: "Tham gia" })}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            {slot.isBot && <Bot className="w-5 h-5 text-blue-400" />}
            {slot.isGuest && <User className="w-5 h-5 text-green-400" />}
            {slot.isHost && <Crown className="w-5 h-5 text-yellow-400" />}
            <span className="text-xs font-medium">{slot.username}</span>
            {canAddBot && (slot.isBot || slot.isGuest) && (
              <button
                onClick={onRemove}
                className="p-0.5 hover:bg-slate-700 rounded"
                title="Remove"
              >
                <X className="w-5 h-5 text-red-400" />
              </button>
            )}
          </div>
          {gamePhase === "playing" ||
            (gamePhase === "ended" && (
              <span className="text-[10px] text-slate-400">
                {slot.hand.length} {ts({ en: "cards", vi: "lá" })}
              </span>
            ))}
          {slot.passed && (
            <span className="text-[10px] text-yellow-400">
              {ts({ en: "Passed", vi: "Đã bỏ" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
