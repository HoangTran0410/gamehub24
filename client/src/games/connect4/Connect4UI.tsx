import { useState } from "react";
import Connect4 from "./Connect4";
import { Connect4GamePhase, Connect4PlayerFlag, COLS, ROWS } from "./types";
import {
  Bot,
  Play,
  RotateCcw,
  RefreshCw,
  Check,
  X,
  BookOpen,
} from "lucide-react";
import type { GameUIProps } from "../types";
import useLanguage from "../../stores/languageStore";
import { useAlertStore } from "../../stores/alertStore";
import { createPortal } from "react-dom";
import useGameState from "../../hooks/useGameState";
import { hasFlag } from "../../utils";

export default function Connect4UI({
  game: baseGame,
  currentUserId,
}: GameUIProps) {
  const game = baseGame as Connect4;
  const [state] = useGameState(game);
  const [showRules, setShowRules] = useState(false);
  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();

  const myPlayerIndex = game.getMyPlayerIndex();
  const isHost = game.isHost;

  if (!state) return null;

  const isMyTurn = state.currentPlayerIndex === myPlayerIndex;

  const handleColumnClick = (col: number) => {
    if (state.gamePhase !== Connect4GamePhase.PLAYING) return;
    if (!isMyTurn) return;
    if (game.isColumnFull(col)) return;
    game.requestMove(col);
  };

  const renderCell = (row: number, col: number) => {
    const pos = row * COLS + col;
    const cellVal = state.board[pos];
    const isWinningCell = state.winningCells.includes(pos);
    const isLastMove = state.lastMove === pos;

    const hasWinner = state.winningCells.length > 0;
    const isDimmed = hasWinner && !isWinningCell;

    return (
      <div key={`${row}-${col}`} className="w-full relative pb-[100%] h-0">
        <div
          className={`absolute inset-0 bg-blue-900/40 rounded-full flex items-center justify-center shadow-inner border border-blue-400/20 transition-opacity duration-500 ${
            isDimmed ? "opacity-40" : "opacity-100"
          }`}
        >
          {isWinningCell && (
            <div className="absolute inset-0 rounded-full ring-4 ring-white animate-winner-pulse shadow-[0_0_20px_rgba(255,255,255,0.8)] z-10" />
          )}
          {cellVal !== "0" && (
            <div
              className={`
                w-[85%] h-[85%] rounded-full shadow-lg transform transition-all duration-300
                ${cellVal === "1" ? "bg-red-500" : "bg-yellow-500"}
                ${isLastMove ? "border-4 border-white" : ""}
                ${isWinningCell ? "animate-winner-glow" : "animate-drop"}
                ${isDimmed ? "opacity-40 grayscale-[0.5]" : "opacity-100"}
              `}
              style={
                !isWinningCell
                  ? {
                      animationDuration: `${0.4 + row * 0.1}s`,
                      animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                    }
                  : {}
              }
            >
              {/* Glossy effect */}
              {/* <div className="absolute top-1 left-2 w-1/2 h-1/2 bg-white/20 rounded-full blur-[1px]" /> */}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGameRules = () => {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
          <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({ en: "Game Rules: Connect 4", vi: "Luật Chơi: Nối 4" })}
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
                  en: "Connect 4 is a two-player connection board game, in which the players choose a color and then take turns dropping colored discs into a seven-column, six-row vertically suspended grid.",
                  vi: "Connect 4 (Cờ ca-rô xếp đứng) là trò chơi dành cho 2 người, lần lượt thả các quân cờ màu vào lưới xếp đứng 7 cột 6 hàng.",
                })}
              </p>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Be the first to form a horizontal, vertical, or diagonal line of four of one's own discs.",
                    vi: "Là người đầu tiên xếp được 4 quân liên tiếp theo hàng ngang, dọc hoặc chéo.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Gameplay", vi: "Luật chơi" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Players take turns dropping one of their discs into an unfilled column.",
                    vi: "Người chơi lần lượt thả quân của mình vào một cột chưa đầy.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "The disc occupies the lowest available space within the column.",
                    vi: "Quân cờ sẽ rơi xuống vị trí thấp nhất có thể trong cột.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Winning", vi: "Chiến thắng" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "The game ends when a player connects 4 discs or the board is full (draw).",
                    vi: "Trò chơi kết thúc khi có người xếp được 4 quân hoặc bàn cờ đầy (hòa).",
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
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-2xl mx-auto pb-16!">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes drop {
          0% { transform: translateY(-500%); opacity: 0.5; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes winner-pulse {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 20px rgba(255, 255, 255, 0.8); }
          50% { transform: scale(1.05); opacity: 0.8; box-shadow: 0 0 40px rgba(255, 255, 255, 1); }
        }
        @keyframes winner-glow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.3); }
        }
        .animate-drop {
          animation-name: drop;
          animation-fill-mode: forwards;
        }
        .animate-winner-pulse {
          animation: winner-pulse 1s ease-in-out infinite;
        }
        .animate-winner-glow {
          animation: winner-glow 1s ease-in-out infinite;
        }
      `,
        }}
      />

      {/* Players */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full max-w-md border border-slate-700">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
          {ti({ en: "Players", vi: "Người chơi" })}
        </h3>
        {state.players.map((player, index) => {
          const isTurn = state.currentPlayerIndex === index;
          return (
            <div
              key={index}
              className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                isTurn
                  ? "bg-slate-700 ring-2 ring-blue-500 shadow-lg"
                  : "bg-slate-900 border border-slate-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full shadow-inner ${
                    index === 0 ? "bg-red-500" : "bg-yellow-400"
                  }`}
                />
                <span
                  className={`font-medium ${isTurn ? "text-white" : "text-gray-400"}`}
                >
                  {player.username}
                  {hasFlag(player.flags, Connect4PlayerFlag.BOT) && " 🤖"}
                </span>
              </div>
              {hasFlag(player.flags, Connect4PlayerFlag.BOT) && isHost && (
                <button
                  onClick={() => game.requestRemoveBot()}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                >
                  {ti({ en: "Remove", vi: "Xóa" })}
                </button>
              )}
              {isHost && !player.id && (
                <button
                  onClick={() => game.requestAddBot()}
                  className="flex items-center gap-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm"
                >
                  <Bot className="w-4 h-4" />
                  {ti({ en: "Add Bot", vi: "Thêm Bot" })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {state.gamePhase === Connect4GamePhase.WAITING && (
          <>
            {isHost && game.canStartGame() && (
              <button
                onClick={() => game.requestStartGame()}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-green-600/20 active:scale-95"
              >
                <Play className="w-5 h-5 text-white" />{" "}
                {ti({ en: "Start Game", vi: "Bắt đầu" })}
              </button>
            )}
            {!isHost && (
              <div className="text-gray-500 font-medium italic">
                {ti({
                  en: "Waiting for host to start...",
                  vi: "Đang chờ chủ phòng bắt đầu...",
                })}
              </div>
            )}
          </>
        )}

        {state.gamePhase === Connect4GamePhase.PLAYING && (
          <>
            {/* Show undo if we are in local history on host OR it's a regular game */}
            {!state.undoRequest && (
              <button
                onClick={() => game.requestUndo()}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium text-sm border border-slate-600"
              >
                <RotateCcw className="w-4 h-4 text-gray-400" />{" "}
                {ti({ en: "Undo", vi: "Hoàn tác" })}
              </button>
            )}

            {isHost && (
              <button
                onClick={async () => {
                  if (
                    await showConfirm(
                      ts({
                        en: "Reset the game?",
                        vi: "Chơi lại từ đầu?",
                      }),
                      ts({
                        en: "Reset",
                        vi: "Reset",
                      }),
                    )
                  )
                    game.requestNewGame();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium text-sm border border-slate-600"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />{" "}
                {ti({ en: "New Game", vi: "Ván mới" })}
              </button>
            )}
          </>
        )}
      </div>

      {/* Status */}
      {state.gamePhase === Connect4GamePhase.PLAYING && (
        <div className="text-lg font-semibold tracking-tight">
          {isMyTurn ? (
            <span className="text-blue-400 animate-pulse">
              {ti({ en: "Your Turn!", vi: "Lượt của bạn!" })}
            </span>
          ) : (
            <span className="text-gray-500">
              {ti({ en: "Waiting for", vi: "Đang chờ" })}{" "}
              {state.players[state.currentPlayerIndex].username}...
            </span>
          )}
        </div>
      )}

      {/* Undo Request Modal */}
      {state.undoRequest && state.undoRequest.fromId !== currentUserId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl max-w-sm mx-4 border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-2">
              {ti({ en: "Undo Request", vi: "Yêu cầu hoàn tác" })}
            </h3>
            <p className="text-gray-400 mb-6 leading-relaxed">
              <span className="text-blue-400 font-semibold">
                {state.undoRequest.fromName}
              </span>{" "}
              {ti({
                en: "wants to undo their last move.",
                vi: "muốn hoàn tác nước đi vừa rồi.",
              })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => game.acceptUndo()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-semibold"
              >
                <Check className="w-4 h-4" />{" "}
                {ti({ en: "Accept", vi: "Đồng ý" })}
              </button>
              <button
                onClick={() => game.declineUndo()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-semibold"
              >
                <X className="w-4 h-4" /> {ti({ en: "Decline", vi: "Từ chối" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting for undo response */}
      {state.undoRequest && state.undoRequest.fromId === currentUserId && (
        <div className="text-yellow-400 text-sm font-medium bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
          {ti({
            en: "Waiting for opponent to accept undo...",
            vi: "Đang chờ đối thủ chấp nhận hoàn tác...",
          })}
        </div>
      )}

      {/* Game Over */}
      {state.gamePhase === Connect4GamePhase.ENDED && (
        <div className="text-center p-6 bg-slate-800 rounded-xl border-2 border-slate-700 shadow-2xl mb-4">
          <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tighter">
            {ti({ en: "Game Over!", vi: "Kết thúc!" })}
          </h3>
          <p className="text-gray-300 text-lg mb-4 font-medium">
            {state.winner === "draw"
              ? ti({ en: "It's a draw!", vi: "Hòa!" })
              : state.winner === currentUserId
                ? ti({ en: "🏆 You Won!", vi: "🏆 Bạn đã thắng!" })
                : `${
                    state.players.find((p) => p.id === state.winner)?.username
                  } ${ti({ en: "wins!", vi: "thắng!" })}`}
          </p>
          <button
            onClick={() => game.requestNewGame()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all font-bold shadow-lg shadow-blue-600/20 active:scale-95 mx-auto"
          >
            <RefreshCw className="w-5 h-5" />{" "}
            {ti({ en: "Play Again", vi: "Chơi lại" })}
          </button>
        </div>
      )}

      {/* Game Board */}
      <div className="w-full max-w-md bg-blue-700 p-3 rounded-4xl shadow-2xl mx-auto">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: COLS }).map((_, col) => (
            <div
              key={col}
              onClick={() => handleColumnClick(col)}
              className={`flex flex-col gap-1 rounded-2xl transition-all duration-200 group/col relative overflow-hidden ${
                isMyTurn && !game.isColumnFull(col)
                  ? "cursor-pointer hover:bg-white/5"
                  : "cursor-default"
              }`}
            >
              {/* Highlight column on hover */}
              {isMyTurn && !game.isColumnFull(col) && (
                <div className="absolute inset-0 bg-white/0 group-hover/col:bg-white/5 rounded-2xl transition-colors pointer-events-none" />
              )}
              {Array.from({ length: ROWS }).map((_, row) =>
                renderCell(row, col),
              )}
            </div>
          ))}
        </div>
      </div>

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
