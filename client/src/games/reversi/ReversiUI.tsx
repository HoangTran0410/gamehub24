import { useState } from "react";
import Reversi from "./Reversi";
import { ReversiColor, ReversiGamePhase, ReversiPlayerFlag } from "./types";
import {
  Bot,
  RotateCcw,
  Play,
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

// CSS for flip animation
const flipStyle = `
@keyframes flip {
  0% { transform: rotateY(0deg) scale(1); }
  50% { transform: rotateY(90deg) scale(1.1); }
  100% { transform: rotateY(180deg) scale(1); }
}
`;

export default function ReversiUI({
  game: baseGame,
  currentUserId,
}: GameUIProps) {
  const game = baseGame as Reversi;
  const [state] = useGameState(game);
  const [showRules, setShowRules] = useState(false);
  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();

  const myColor = game.getMyColor();
  const currentTurn = state.turn;
  const isMyTurn = currentTurn === myColor;
  const validMoves =
    state.gamePhase === ReversiGamePhase.PLAYING && myColor !== null && isMyTurn
      ? game.getValidMoves(myColor)
      : [];
  const pieceCount = game.getPieceCount();
  const isHost = game.isHost;

  const isValidMove = (row: number, col: number) =>
    validMoves.some(([r, c]) => r === row && c === col);

  const handleCellClick = (row: number, col: number) => {
    if (state.gamePhase !== ReversiGamePhase.PLAYING) return;
    if (!isMyTurn) return;
    if (!isValidMove(row, col)) return;
    game.requestMove(row, col);
  };

  const renderCell = (cellValue: number, row: number, col: number) => {
    const valid = isValidMove(row, col);
    const pos = row * 8 + col;
    const isLastMove = state.lastMove === pos;
    const isFlipped = state.flippedCells?.includes(pos);
    const cellType =
      cellValue === 1 ? "black" : cellValue === 2 ? "white" : null;

    return (
      <button
        key={`${row}-${col}`}
        onClick={() => handleCellClick(row, col)}
        className={`
          aspect-square flex items-center justify-center
          bg-green-700 border border-green-800
          ${valid ? "cursor-pointer hover:bg-green-600" : "cursor-default"}
          ${isLastMove ? "ring-2 ring-yellow-400 ring-inset" : ""}
        `}
        disabled={!valid}
      >
        {cellType && (
          <div
            className={`
              w-[80%] h-[80%] rounded-full shadow-lg
              ${cellType === "black" ? "bg-gray-900" : "bg-white"}
              ${isLastMove ? "scale-110" : ""}
              ${isFlipped ? "animate-flip" : ""}
            `}
            style={
              isFlipped
                ? {
                    animation: "flip 0.4s ease-in-out",
                  }
                : undefined
            }
          />
        )}
        {!cellType && valid && (
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
        )}
      </button>
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
              {ti({ en: "Game Rules: Reversi", vi: "Luật Chơi: Cờ Lật" })}
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
                  en: "Reversi (Othello) is a strategy board game for two players, played on an 8×8 uncheckered board.",
                  vi: "Reversi (Othello) là trò chơi chiến thuật cho 2 người, chơi trên bàn cờ 8x8.",
                })}
              </p>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Have the majority of disks on the board turned to display your color when the last playable empty square is filled.",
                    vi: "Chiếm được nhiều ô trên bàn cờ nhất bằng màu của mình khi trò chơi kết thúc.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Gameplay", vi: "Luật chơi" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Players take turns placing disks on the board with their assigned color facing up.",
                    vi: "Người chơi lần lượt đặt quân cờ của mình lên bàn.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "During a play, any disks of the opponent's color that are in a straight line and bounded by the disk just placed and another disk of the current player's color are turned over to the current player's color.",
                    vi: "Nếu bạn đặt quân cờ kẹp giữa quân đối phương (hàng ngang, dọc, chéo), các quân đó sẽ bị lật sang màu của bạn.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "If you cannot make a valid move (capture at least one opponent's disk), you must pass your turn.",
                    vi: "Nếu không có nước đi hợp lệ (ăn ít nhất 1 quân), bạn phải bỏ lượt.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Winning", vi: "Chiến thắng" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "The game ends when neither player can move.",
                    vi: "Trò chơi kết thúc khi cả 2 bên không còn nước đi.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "The player with the most disks on the board wins.",
                    vi: "Người có nhiều quân cờ nhất trên bàn sẽ thắng.",
                  })}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const players = [state.players.black, state.players.white];
  const currentPlayerInTurn =
    currentTurn === ReversiColor.BLACK
      ? state.players.black
      : state.players.white;

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-2xl mx-auto pb-16!">
      {/* Inject flip animation CSS */}
      <style dangerouslySetInnerHTML={{ __html: flipStyle }} />

      {/* Player List */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full max-w-md">
        <h3 className="text-sm font-medium text-gray-400 mb-1">
          {ti({ en: "Players", vi: "Người chơi" })}
        </h3>
        {players.map((player, index) => {
          const color = index === 0 ? ReversiColor.BLACK : ReversiColor.WHITE;
          const isCurrentTurn = state.turn === color;

          return (
            <div
              key={index}
              className={
                "flex items-center justify-between p-2 rounded-lg " +
                (isCurrentTurn
                  ? "bg-slate-600 ring-2 ring-yellow-400"
                  : "bg-slate-700")
              }
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full text-center ${
                    color === ReversiColor.BLACK ? "bg-gray-900" : "bg-white"
                  } ${color === ReversiColor.BLACK ? "text-white" : "text-black"}`}
                >
                  {color === ReversiColor.BLACK
                    ? pieceCount.black
                    : pieceCount.white}
                </div>
                <span className="text-white">
                  {player ? player.username : "(waiting...)"}
                  {player &&
                    hasFlag(player.flags, ReversiPlayerFlag.BOT) &&
                    " 🤖"}
                </span>
              </div>
              {player &&
                hasFlag(player.flags, ReversiPlayerFlag.BOT) &&
                isHost && (
                  <button
                    onClick={() => game.requestRemoveBot()}
                    className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                  >
                    {ti({ en: "Remove", vi: "Xóa" })}
                  </button>
                )}
              {isHost && !player && (
                <button
                  onClick={() => game.requestAddBot()}
                  className="flex items-center gap-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  {ti({ en: "Add Bot", vi: "Thêm Bot" })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Turn Indicator */}
      {state.gamePhase === ReversiGamePhase.PLAYING && (
        <div className="text-lg text-gray-400">
          {isMyTurn ? (
            <span className="text-green-400">
              {ti({ en: "Your turn!", vi: "Lượt của bạn!" })}
            </span>
          ) : (
            <span>
              {ti({ en: "Waiting for", vi: "Đang chờ" })}{" "}
              {currentPlayerInTurn?.username} {ti({ en: "...", vi: "..." })}
            </span>
          )}
          {validMoves.length === 0 && isMyTurn && (
            <span className="ml-2 text-yellow-400">
              {ti({
                en: "No valid moves - must pass",
                vi: "Không có nước đi hợp lệ - phải bỏ lượt",
              })}
            </span>
          )}
        </div>
      )}

      {/* Undo Request Modal */}
      {state.undoRequest && state.undoRequest.fromId !== currentUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 shadow-xl max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              {ti({ en: "Undo Request", vi: "Yêu cầu hoàn tác" })}
            </h3>
            <p className="text-gray-400 mb-4">
              {state.undoRequest.fromName}{" "}
              {ti({
                en: "wants to undo their last move",
                vi: "muốn hoàn tác nước đi vừa rồi",
              })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => game.acceptUndo()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />{" "}
                {ti({ en: "Accept", vi: "Đồng ý" })}
              </button>
              <button
                onClick={() => game.declineUndo()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" /> {ti({ en: "Decline", vi: "Từ chối" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting for undo response */}
      {state.undoRequest && state.undoRequest.fromId === currentUserId && (
        <div className="text-yellow-400 text-sm">
          {ti({
            en: "Waiting for opponent to accept undo...",
            vi: "Đang chờ đối thủ chấp nhận hoàn tác...",
          })}
        </div>
      )}

      {/* Game Over */}
      {state.gamePhase === ReversiGamePhase.ENDED && (
        <div className="text-center p-4 bg-slate-800 rounded-lg">
          <h3 className="text-xl font-bold text-white mb-2">
            {ti({ en: "Game Over!", vi: "Trò chơi kết thúc!" })}
          </h3>
          <p className="text-gray-300 mb-4">
            {state.winner === "draw"
              ? ti({ en: "It's a draw!", vi: "Hòa!" })
              : state.winner === currentUserId
                ? ti({ en: "🎉 You won!", vi: "🎉 Bạn đã thắng!" })
                : `${players.find((p) => p?.id === state.winner)?.username || ti({ en: "Opponent", vi: "Đối thủ" })}{" "}
                  ${ti({ en: "wins!", vi: "thắng!" })}`}
          </p>
          <p className="text-gray-400">
            {ti({ en: "Black", vi: "Đen" })}: {pieceCount.black} |{" "}
            {ti({ en: "White", vi: "Trắng" })}: {pieceCount.white}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {/* Waiting phase buttons */}
        {state.gamePhase === ReversiGamePhase.WAITING && (
          <>
            {isHost && game.canStartGame() && (
              <button
                onClick={() => game.requestStartGame()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />{" "}
                {ti({ en: "Start Game", vi: "Bắt đầu" })}
              </button>
            )}
            {!isHost && (
              <div className="text-gray-400">
                {ti({
                  en: "Waiting for host to start game...",
                  vi: "Đang chờ chủ phòng bắt đầu trò chơi...",
                })}
              </div>
            )}
          </>
        )}

        {/* Playing phase buttons */}
        {state.gamePhase === ReversiGamePhase.PLAYING && (
          <>
            {isMyTurn && validMoves.length === 0 && (
              <button
                onClick={() => game.requestPass()}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
              >
                {ti({ en: "Pass Turn", vi: "Bỏ lượt" })}
              </button>
            )}
            {(state.moveHistory?.length || 0) > 0 && !state.undoRequest && (
              <button
                onClick={() => game.requestUndo()}
                className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />{" "}
                {ti({ en: "Undo", vi: "Hoàn tác" })}
              </button>
            )}
            {/* reset game */}
            {isHost && (
              <button
                onClick={async () => {
                  if (
                    await showConfirm(
                      ts({
                        en: "Are you sure you want to reset the game?",
                        vi: "Bạn có chắc chắn muốn reset trò chơi?",
                      }),
                      ts({
                        en: "Reset Game",
                        vi: "Chơi lại",
                      }),
                    )
                  )
                    game.requestNewGame();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />{" "}
                {ti({ en: "Play Again", vi: "Chơi lại" })}
              </button>
            )}
          </>
        )}

        {/* Game ended buttons */}
        {state.gamePhase === ReversiGamePhase.ENDED && (
          <button
            onClick={() => game.requestNewGame()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />{" "}
            {ti({ en: "Play Again", vi: "Chơi lại" })}
          </button>
        )}
      </div>

      {/* Game Board */}
      <div className="grid grid-cols-8 gap-0 rounded-lg overflow-hidden shadow-xl border-4 border-green-900 w-full max-w-[500px]">
        {Array.from({ length: 64 }).map((_, i) => {
          const ri = Math.floor(i / 8);
          const ci = i % 8;
          const val = state.board[i];
          const cellValue = val === "1" ? 1 : val === "2" ? 2 : 0;
          return renderCell(cellValue, ri, ci);
        })}
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
