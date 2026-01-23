import React, { useEffect, useState, useRef } from "react";
import type { GameUIProps } from "../types";
import OAnQuan, { simulateOAnQuanMove } from "./OAnQuan";
import type { OAnQuanState } from "./types";
import useLanguage from "../../stores/languageStore";
import {
  Play,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  X,
} from "lucide-react";
import { useAlertStore } from "../../stores/alertStore";
import { createPortal, flushSync } from "react-dom";

const FLY_DURATION = 300; // ms

// Helper to get element center
const getCenter = (element: HTMLElement | null) => {
  if (!element) return { x: 0, y: 0 };
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

const OAnQuanUI: React.FC<GameUIProps> = ({
  game: baseGame,
  currentUserId,
}) => {
  const game = baseGame as OAnQuan;
  const { confirm: showConfirm } = useAlertStore();
  const { ti, ts } = useLanguage();

  // State
  const [state, setState] = useState<OAnQuanState>(game.getState());
  const [displayBoard, setDisplayBoard] = useState<number[]>([
    ...game.getState().board,
  ]);
  const [animating, setAnimating] = useState(false);
  const [flyingState, setFlyingState] = useState<{
    count: number;
  }>({ count: 0 });

  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [highlightedSquare, setHighlightedSquare] = useState<number | null>(
    null,
  );
  const [showRules, setShowRules] = useState(false);

  // Refs
  const lastMoveRef = useRef<OAnQuanState["lastMove"] | undefined>(undefined);
  const animationQueueRef = useRef<{ move: any; state: OAnQuanState }[]>([]);
  const boardRef = useRef(displayBoard);
  const squareRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scoreRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingStateRef = useRef<OAnQuanState | null>(null);
  const flyingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boardRef.current = displayBoard;
  }, [displayBoard]);

  useEffect(() => {
    const handleUpdate = (newState: OAnQuanState) => {
      if (newState.lastMove && newState.lastMove !== lastMoveRef.current) {
        animationQueueRef.current.push({
          move: newState.lastMove,
          state: newState,
        });
        lastMoveRef.current = newState.lastMove;

        // Removed pendingStateRef update here because we want to use the state from the queue
        // pendingStateRef.current = newState;

        if (!animating) {
          processNextAnimation();
        }
      } else {
        if (!animating && animationQueueRef.current.length === 0) {
          setState(newState);
          setDisplayBoard(newState.board);
        } else {
          // If animating or queue not empty, store as pending final state
          pendingStateRef.current = newState;
        }
      }
    };

    return game.onUpdate(handleUpdate);
  }, [game, animating]);

  const processNextAnimation = async () => {
    if (animationQueueRef.current.length === 0) {
      setAnimating(false);
      if (pendingStateRef.current) {
        setState(pendingStateRef.current);
        setDisplayBoard(pendingStateRef.current.board);
        pendingStateRef.current = null;
      }
      return;
    }

    setAnimating(true);
    const item = animationQueueRef.current.shift();
    if (item) {
      await runAnimation(item.move);
      // APPLY STATE AFTER ANIMATION
      // This ensures the UI updates to "Bot's turn" (or whatever the state was at this snapshot)
      // right after the move completes.
      setState(item.state);
      setDisplayBoard(item.state.board);
      boardRef.current = item.state.board; // Sync ref immediately

      processNextAnimation();
    }
  };

  const runAnimation = async (move: NonNullable<OAnQuanState["lastMove"]>) => {
    const startBoard = [...boardRef.current];
    const { steps } = simulateOAnQuanMove(
      startBoard,
      move.squareId,
      move.direction,
    );

    let handSize = 0;
    let lastSquareId = move.squareId;

    for (const step of steps) {
      if (step.type === "sow") {
        const startRect = getCenter(squareRefs.current[lastSquareId]);
        const endRect = getCenter(squareRefs.current[step.squareId]);

        // 1. Update content (Synchronously)
        flushSync(() => {
          setFlyingState({ count: handSize });
        });

        // 2. Animate immediately using Web Animations API
        if (flyingRef.current) {
          // Ensure visible
          flyingRef.current.style.opacity = "1";

          const animation = flyingRef.current.animate(
            [
              {
                left: `${startRect.x}px`,
                top: `${startRect.y}px`,
                transform: "translate(-50%, -50%)",
              },
              {
                left: `${endRect.x}px`,
                top: `${endRect.y}px`,
                transform: "translate(-50%, -50%)",
              },
            ],
            {
              duration: FLY_DURATION,
              easing: "linear",
              fill: "forwards",
            },
          );
          await animation.finished;
        } else {
          // Fallback if ref missing
          await new Promise((r) => setTimeout(r, FLY_DURATION));
        }

        // 3. Hide
        if (flyingRef.current) {
          flyingRef.current.style.opacity = "0";
        }

        // Land Stone
        const currentBoard = [...boardRef.current];
        currentBoard[step.squareId] += 1;
        handSize--;

        flushSync(() => {
          setDisplayBoard(currentBoard);
          boardRef.current = currentBoard;
          setHighlightedSquare(step.squareId);
        });

        // await new Promise((r) => setTimeout(r, 150));
        // setHighlightedSquare(null);

        lastSquareId = step.squareId;
      } else if (step.type === "pickup") {
        const currentBoard = [...boardRef.current];
        handSize = step.amount;
        currentBoard[step.squareId] = 0;
        setDisplayBoard(currentBoard);
        boardRef.current = currentBoard;
        lastSquareId = step.squareId;
        await new Promise((r) => setTimeout(r, 300));
      } else if (step.type === "capture") {
        const playerIndex = game
          .getState()
          .players.findIndex((p) => p.id === move.player);

        if (playerIndex !== -1 && scoreRefs.current[playerIndex]) {
          const startRect = getCenter(squareRefs.current[step.squareId]);
          const endRect = getCenter(scoreRefs.current[playerIndex]);

          // 1. Pickup stones visually (Clear board, show flying)
          const currentBoard = [...boardRef.current];
          currentBoard[step.squareId] = 0;

          flushSync(() => {
            setDisplayBoard(currentBoard);
            boardRef.current = currentBoard;
            setFlyingState({ count: step.amount });
            setHighlightedSquare(step.squareId);
          });

          // 2. Fly to score box
          if (flyingRef.current) {
            flyingRef.current.style.opacity = "1";
            const animation = flyingRef.current.animate(
              [
                {
                  left: `${startRect.x}px`,
                  top: `${startRect.y}px`,
                  transform: "translate(-50%, -50%)",
                },
                {
                  left: `${endRect.x}px`,
                  top: `${endRect.y}px`,
                  transform: "translate(-50%, -50%)",
                },
              ],
              {
                duration: 500, // Slower for capture for emphasis?
                easing: "ease-in",
                fill: "forwards",
              },
            );
            await animation.finished;
            flyingRef.current.style.opacity = "0";
          } else {
            await new Promise((r) => setTimeout(r, 300));
          }
          setHighlightedSquare(null);
        } else {
          // Fallback if no player/ref found
          const currentBoard = [...boardRef.current];
          currentBoard[step.squareId] = 0;
          setDisplayBoard(currentBoard);
          boardRef.current = currentBoard;
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }
  };

  const handleSquareClick = (index: number) => {
    if (!isMyTurn || animating) return;
    if (index === 0 || index === 6) return;
    if (game.getState().board[index] === 0) return;

    const myIndex = game.getMyPlayerIndex();
    const validRange = myIndex === 0 ? [7, 11] : [1, 5];
    if (index < validRange[0] || index > validRange[1]) return;

    if (selectedSquare === index) {
      setSelectedSquare(null);
    } else {
      setSelectedSquare(index);
    }
  };

  const handleMove = (dir: "left" | "right") => {
    if (selectedSquare !== null) {
      game.requestMove(selectedSquare, dir);
      setSelectedSquare(null);
    }
  };

  const renderGameRules = () => {
    if (!showRules) return null;

    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
          <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({ en: "Game Rules: O An Quan", vi: "Luật Chơi: Ô Ăn Quan" })}
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
                  en: "O An Quan (Mandarin Square Capturing) is a traditional Vietnamese board game for two players. The goal is to capture as many stones as possible.",
                  vi: "Ô Ăn Quan là trò chơi dân gian Việt Nam dành cho 2 người. Mục tiêu là ăn được càng nhiều quân càng tốt.",
                })}
              </p>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Setup", vi: "Thiết lập" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Board: 10 'Rice Fields' (squares) and 2 'Mandarin Squares' (semicircles at ends).",
                    vi: "Bàn cờ: 10 ô 'Ruộng' và 2 ô 'Quan' (bán nguyệt ở hai đầu).",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Stones: 5 small stones in each Rice Field. 1 big stone (worth 10) in each Mandarin Square.",
                    vi: "Quân: 5 quân dân ở mỗi ruộng. 1 quân quan (giá trị 10) ở mỗi ô quan.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "How to Play", vi: "Cách chơi" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Players take turns. Valid moves must start from a Rice Field on your side (Player 1: Top, Player 2: Bottom).",
                    vi: "Người chơi lần lượt đi. Nước đi phải bắt đầu từ ô Ruộng phía mình (P1: Trên, P2: Dưới).",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Choose a square with stones and a direction (Left or Right).",
                    vi: "Chọn một ô có quân và hướng đi (Trái hoặc Phải).",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Stones are distributed one by one into subsequent squares.",
                    vi: "Các quân sẽ được rải lần lượt vào từng ô tiếp theo.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "If the last stone lands in a square with stones, pick them all up and continue distributing.",
                    vi: "Nếu quân cuối cùng rơi vào ô có quân, bốc hết quân ở đó lên và tiếp tục rải.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "If the last stone lands in an empty square, and the next square has stones, you CAPTURE those stones.",
                    vi: "Nếu quân cuối rơi vào ô trống, và ô kế tiếp có quân, bạn sẽ ĂN số quân đó.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Turn ends when the last stone lands in an empty square followed by another empty square, or hits a Mandarin square.",
                    vi: "Lượt đi kết thúc khi quân cuối rơi vào ô mà ô kế tiếp cũng trống, hoặc rơi vào ô Quan.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Winning", vi: "Chiến thắng" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Game ends when both Mandarin Squares are empty.",
                    vi: "Trò chơi hết khi 2 ô Quan đều trống.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Remaining stones on player's side belong to them.",
                    vi: "Số quân còn lại trong ruộng của ai thuộc về người đó.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Player with the highest score wins.",
                    vi: "Người có tổng điểm cao nhất sẽ thắng.",
                  })}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const isMyTurn = state.currentTurn === currentUserId;
  const myPlayerIndex = game.getMyPlayerIndex();
  const player1 = state.players[0];
  const player2 = state.players[1];

  const getPlayerLabel = (idx: number) => {
    const p = state.players[idx];
    if (!p)
      return ti({
        en: "Waiting for player...",
        vi: "Chờ người chơi tham gia...",
      });
    let name = p.username;
    if (p.id === currentUserId) name += ti({ en: " (You)", vi: " (Bạn)" });
    return name;
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full max-w-4xl mx-auto touch-none @md:min-h-[500px]">
      {/* Persistent Flying Cluster Overlay */}
      {createPortal(
        <div
          ref={flyingRef}
          className="fixed z-100 pointer-events-none"
          style={{
            // Hidden by default, shown by active animation only when needed
            // WAAPI will animate the position, but we handle opacity imperatively
            opacity: 0,
            width: "40px",
            height: "40px",
            // Initial off-screen or safe position to avoid flash
            left: 0,
            top: 0,
          }}
        >
          <div className="w-full h-full relative">
            <StoneCluster count={flyingState.count} />
          </div>
        </div>,
        document.body,
      )}

      <div className="flex flex-col items-center">
        <div className="text-xl font-bold bg-slate-700 px-4 py-1 rounded-full mb-2">
          {state.gamePhase === "waiting"
            ? state.players.length < 2
              ? ti({
                  en: "Wait for player to join...",
                  vi: "Chờ người chơi tham gia...",
                })
              : ti({
                  en: "Wait for host to start game...",
                  vi: "Chờ chủ phòng bắt đầu game...",
                })
            : state.winner
              ? ti({ en: "GAME OVER", vi: "KẾT THÚC" })
              : null}
        </div>
        {state.winner && (
          <div className="text-green-400 font-bold animate-pulse mb-4">
            {ti({ en: "Winner: ", vi: "Người thắng: " })}
            {state.players.find((p) => p.id === state.winner)?.username}
          </div>
        )}
      </div>

      {game.isHost && (
        <div className="mb-2 flex gap-4 flex-wrap justify-center">
          {state.gamePhase === "waiting" && state.players.length >= 2 && (
            <button
              onClick={() => game.requestStartGame()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded shadow"
            >
              <Play size={16} /> {ti({ en: "Start Game", vi: "Bắt đầu" })}
            </button>
          )}
          {state.gamePhase !== "waiting" && (
            <button
              onClick={async () => {
                if (
                  state.winner ||
                  (await showConfirm(
                    ts({
                      en: "Are you sure you want to reset the game?",
                      vi: "Bạn có chắc chắn muốn chơi lại không?",
                    }),
                    ts({ en: "Reset Game", vi: "Chơi lại" }),
                  ))
                ) {
                  game.requestResetGame();
                  setHighlightedSquare(null);
                  setSelectedSquare(null);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded shadow"
            >
              <RotateCcw size={16} /> {ti({ en: "Reset Game", vi: "Chơi lại" })}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-2 justify-center">
        {/* Player 1 */}
        <div
          ref={(el) => {
            scoreRefs.current[0] = el;
          }}
          className={`p-2 rounded border-2 ${
            state.currentTurn === player1?.id
              ? "bg-yellow-600 border-yellow-400 animate-bounce"
              : "bg-slate-700/50 border-transparent"
          }`}
        >
          <div className="text-lg">{getPlayerLabel(0)}</div>
          <div className="text-2xl font-mono text-yellow-300">
            {state.playerScores[player1?.id] || 0}
          </div>
        </div>

        {/* Board */}
        <div className="relative bg-amber-100 p-2 @md:p-4 rounded-xl select-none overflow-x-auto max-w-full">
          <div className="flex flex-row items-center gap-2 justify-center">
            <MandarinSquare
              count={displayBoard[0]}
              onClick={() => {}}
              isMandarin={true}
              forwardRef={(el) => (squareRefs.current[0] = el)}
              left={true}
            />

            <div className="flex flex-col @md:gap-2 gap-1">
              <div className="flex @md:gap-2 gap-1">
                {[11, 10, 9, 8, 7].map((idx) => (
                  <RiceField
                    key={idx}
                    idx={idx}
                    count={displayBoard[idx]}
                    playerOwner={0}
                    isSelectable={
                      isMyTurn &&
                      myPlayerIndex === 0 &&
                      !animating &&
                      displayBoard[idx] > 0
                    }
                    isSelected={selectedSquare === idx}
                    isHighlighted={highlightedSquare === idx}
                    onClick={() => handleSquareClick(idx)}
                    forwardRef={(el) => (squareRefs.current[idx] = el)}
                  />
                ))}
              </div>

              <div className="flex @md:gap-2 gap-1">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <RiceField
                    key={idx}
                    idx={idx}
                    count={displayBoard[idx]}
                    playerOwner={1}
                    isSelectable={
                      isMyTurn &&
                      myPlayerIndex === 1 &&
                      !animating &&
                      displayBoard[idx] > 0
                    }
                    isSelected={selectedSquare === idx}
                    isHighlighted={highlightedSquare === idx}
                    onClick={() => handleSquareClick(idx)}
                    forwardRef={(el) => (squareRefs.current[idx] = el)}
                  />
                ))}
              </div>
            </div>

            <MandarinSquare
              count={displayBoard[6]}
              onClick={() => {}}
              isMandarin={true}
              forwardRef={(el) => (squareRefs.current[6] = el)}
              isHighlighted={highlightedSquare === 6}
            />
          </div>

          {/* Selected Square */}
          {selectedSquare !== null && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 rounded-xl gap-2"
              onClick={() => setSelectedSquare(null)}
            >
              <button
                onClick={() => handleMove("left")}
                className="p-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
              >
                <ArrowLeft size={32} />
              </button>

              <button
                onClick={() => handleMove("right")}
                className="p-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
              >
                <ArrowRight size={32} />
              </button>
            </div>
          )}
        </div>

        {/* Player 2 */}
        <div
          ref={(el) => {
            scoreRefs.current[1] = el;
          }}
          className={`p-2 rounded border-2 ${
            state.currentTurn === player2?.id
              ? "bg-yellow-600 border-yellow-400 animate-bounce"
              : "bg-slate-700/50 border-transparent"
          }`}
        >
          <div className="text-lg">{getPlayerLabel(1)}</div>
          <div className="text-2xl font-mono text-yellow-300">
            {state.playerScores[player2?.id] || 0}
          </div>

          {/* Bot Controls */}
          {game.isHost && state.gamePhase === "waiting" && (
            <div className="flex items-center justify-center gap-2 mt-1">
              {state.players.length < 2 && (
                <button
                  onClick={() => game.requestAddBot(state.players.length)}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs flex items-center gap-1"
                >
                  +Bot
                </button>
              )}
              {state.players.length >= 2 && state.players[1]?.isBot && (
                <button
                  onClick={() => game.requestRemoveBot(1)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs flex items-center gap-1"
                >
                  - {ti({ en: "Remove Bot", vi: "Xóa Bot" })}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="absolute bottom-2 right-2 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-yellow-500 transition-colors z-20"
        title={ts({ en: "Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={20} />
      </button>
      {showRules && createPortal(renderGameRules(), document.body)}
    </div>
  );
};

const RiceField: React.FC<{
  idx: number;
  count: number;
  playerOwner: number;
  isSelectable: boolean;
  isSelected: boolean;
  isHighlighted?: boolean;
  onClick: () => void;
  forwardRef?: (el: HTMLDivElement | null) => void;
}> = ({
  count,
  isSelectable,
  isSelected,
  isHighlighted,
  onClick,
  forwardRef,
}) => {
  return (
    <div
      ref={forwardRef}
      onClick={onClick}
      className={`
                w-10 h-10 @md:w-16 @md:h-16 flex items-center justify-center rounded-lg border-2 relative transition-all
                ${
                  isSelected
                    ? "border-yellow-400 ring-2 ring-yellow-400 bg-amber-200 z-10"
                    : isSelectable
                      ? "border-green-500 ring-2 ring-green-400/50 bg-green-50 cursor-pointer hover:bg-green-100 hover:scale-105 z-0"
                      : "border-amber-700 bg-amber-50 cursor-default opacity-90"
                }
            `}
    >
      <StoneCluster count={count} isHighlighted={isHighlighted} />
      <div className="absolute bottom-0 right-0 text-[10px] text-amber-900 p-0.5">
        {count}
      </div>
    </div>
  );
};

const MandarinSquare: React.FC<{
  count: number;
  onClick: () => void;
  isMandarin: boolean;
  forwardRef?: (el: HTMLDivElement | null) => void;
  left?: boolean;
  isHighlighted?: boolean;
}> = ({ count, forwardRef, left, isHighlighted }) => {
  return (
    <div
      ref={forwardRef}
      className={`
             w-16 h-24 @md:w-20 @md:h-32 flex flex-col items-center justify-center ${left ? "rounded-l-full" : "rounded-r-full"} border-2 border-amber-900
             bg-amber-400 text-white font-bold text-xl relative shadow-inner
        `}
    >
      <div className="text-white drop-shadow-md z-1">
        <StoneCluster
          count={count}
          isBig={true}
          isHighlighted={isHighlighted}
        />
      </div>
      <div className="absolute bottom-2 text-xs opacity-70 text-amber-900">
        {count}
      </div>
    </div>
  );
};

const StoneCluster: React.FC<{
  count: number;
  isBig?: boolean;
  isHighlighted?: boolean;
}> = ({ count, isBig, isHighlighted }) => {
  const visualCount = Math.min(count, 30);
  const stones = Array.from({ length: visualCount });

  return (
    <div
      className={`flex flex-wrap justify-center items-center content-center w-full h-full p-1 gap-0.5 ${isHighlighted ? "scale-110 bg-green-400/50 rounded-lg shadow-[0_0_10px_rgba(74,222,128,0.8)]" : "transition-transform duration-200"}`}
    >
      {stones.map((_, i) => (
        <div
          key={i}
          className={`
                    rounded-full shadow-sm border border-black/10
                    ${isBig && i < Math.floor(count / 10) ? "w-4 h-4 bg-red-500" : "w-2 h-2 @md:w-2.5 @md:h-2.5 bg-slate-700"}
                 `}
        />
      ))}
    </div>
  );
};

export default OAnQuanUI;
