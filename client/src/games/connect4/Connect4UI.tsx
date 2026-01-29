import { useState } from "react";
import Connect4 from "./Connect4";
import { ROWS, COLS } from "./types";
import {
  Bot,
  RotateCcw,
  Play,
  RefreshCw,
  Check,
  X,
  BookOpen,
} from "lucide-react";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";
import useGameState from "../../hooks/useGameState";

// CSS for drop animation
const dropStyle = `
@keyframes drop {
  0% { transform: translateY(-400px); }
  60% { transform: translateY(10px); }
  80% { transform: translateY(-5px); }
  100% { transform: translateY(0); }
}
`;

export default function Connect4UI({
  game: baseGame,
  currentUserId,
}: GameUIProps) {
  const game = baseGame as Connect4;
  const [state] = useGameState(game);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const { ti, ts } = useLanguage();

  const myIndex = game.getMyPlayerIndex();
  const myColor = myIndex >= 0 ? state.players[myIndex].color : null;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const isHost = game.isHost;

  const handleColumnClick = (col: number) => {
    if (state.gamePhase !== "playing") return;
    if (!isMyTurn) return;
    if (game.isColumnFull(col)) return;
    game.requestMove(col);
  };

  const isWinningCell = (row: number, col: number) =>
    state.winningCells?.some((c) => c.row === row && c.col === col);

  const isLastMove = (row: number, col: number) =>
    state.lastMove?.row === row && state.lastMove?.col === col;

  const renderCell = (row: number, col: number) => {
    const cell = state.board[row][col];
    const winning = isWinningCell(row, col);
    const last = isLastMove(row, col);

    return (
      <div
        key={`${row}-${col}`}
        className="aspect-square flex items-center justify-center bg-blue-700 p-1"
      >
        <div
          className={`
            w-full h-full rounded-full transition-all duration-200
            ${!cell ? "bg-blue-900" : ""}
            ${cell === "red" ? "bg-red-500" : ""}
            ${cell === "yellow" ? "bg-yellow-400" : ""}
            ${winning ? "ring-4 ring-white animate-pulse" : ""}
            ${last && !winning ? "ring-2 ring-white/50" : ""}
          `}
          style={last && cell ? { animation: "drop 0.5s ease-out" } : undefined}
        />
      </div>
    );
  };

  const renderPreviewRow = () => {
    return (
      <div className="grid grid-cols-7 gap-1 mb-1">
        {Array(COLS)
          .fill(null)
          .map((_, col) => {
            const canDrop =
              state.gamePhase === "playing" &&
              isMyTurn &&
              !game.isColumnFull(col);
            const showPreview = hoverCol === col && canDrop;

            return (
              <div
                key={col}
                className={`
                  aspect-square flex items-center justify-center
                  rounded-full transition-all duration-200
                  ${canDrop ? "cursor-pointer" : "cursor-default"}
                `}
                onMouseEnter={() => setHoverCol(col)}
                onMouseLeave={() => setHoverCol(null)}
                onClick={() => handleColumnClick(col)}
              >
                {showPreview && (
                  <div
                    className={`
                      w-[80%] h-[80%] rounded-full opacity-60
                      ${myColor === "red" ? "bg-red-500" : "bg-yellow-400"}
                    `}
                  />
                )}
              </div>
            );
          })}
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
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-lg mx-auto pb-16!">
      {/* Inject drop animation CSS */}
      <style dangerouslySetInnerHTML={{ __html: dropStyle }} />

      {/* Player List */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full">
        <h3 className="text-sm font-medium text-gray-400 mb-1">Players</h3>
        {state.players.map((player, index) => (
          <div
            key={index}
            className={`
              flex items-center justify-between p-2 rounded-lg
              ${
                state.currentPlayerIndex === index &&
                state.gamePhase === "playing"
                  ? "bg-slate-600 ring-2 ring-blue-400"
                  : "bg-slate-700"
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-6 h-6 rounded-full
                  ${player.color === "red" ? "bg-red-500" : "bg-yellow-400"}
                `}
              />
              <span className="text-white">
                {player.id
                  ? player.username
                  : ti({ en: "(waiting...)", vi: "(đang chờ...)" })}
                {player.isBot && " 🤖"}
                {player.id === currentUserId &&
                  ti({ en: " (You)", vi: " (Bạn)" })}
              </span>
            </div>
            {player.isBot && isHost && state.gamePhase === "waiting" && (
              <button
                onClick={() => game.requestRemoveBot()}
                className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                {ti({ en: "Remove", vi: "Xóa" })}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Turn Indicator */}
      {state.gamePhase === "playing" && (
        <div className="text-lg text-gray-400">
          {isMyTurn ? (
            <span className="text-green-400">
              {ti({
                en: "Your turn! Click a column.",
                vi: "Lượt của bạn! Chọn một cột.",
              })}
            </span>
          ) : (
            <span>
              {ti({ en: "Waiting for", vi: "Đang chờ" })}{" "}
              {currentPlayer?.username}...
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
                en: "wants to undo their last move.",
                vi: "muốn hoàn tác nước đi cuối.",
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
      {state.gamePhase === "ended" && (
        <div className="text-center p-4 bg-slate-800 rounded-lg">
          <h3 className="text-xl font-bold text-white mb-2">
            {ti({ en: "Game Over!", vi: "Kết thúc!" })}
          </h3>
          <p className="text-gray-300">
            {state.winner === "draw"
              ? ti({ en: "It's a draw!", vi: "Hòa!" })
              : state.winner === currentUserId
                ? ti({ en: "🎉 You won!", vi: "🎉 Bạn thắng!" })
                : `${
                    state.players.find((p) => p.id === state.winner)?.username
                  } ${ti({ en: "wins!", vi: "thắng!" })}`}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap justify-center">
        {/* Waiting phase buttons */}
        {state.gamePhase === "waiting" && (
          <>
            {isHost && !state.players[1].id && (
              <button
                onClick={() => game.requestAddBot()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                <Bot className="w-4 h-4" />{" "}
                {ti({ en: "Add Bot", vi: "Thêm Bot" })}
              </button>
            )}
            {isHost && game.canStartGame() && (
              <button
                onClick={() => game.requestStartGame()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />{" "}
                {ti({ en: "Start Game", vi: "Bắt đầu" })}
              </button>
            )}
          </>
        )}

        {/* Playing phase buttons */}
        {state.gamePhase === "playing" && (
          <>
            {myIndex >= 0 &&
              Object.keys(state.moveHistory || {}).length > 0 &&
              !state.undoRequest && (
                <button
                  onClick={() => game.requestUndo()}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />{" "}
                  {ti({ en: "Undo", vi: "Hoàn tác" })}
                </button>
              )}
          </>
        )}

        {/* Game ended buttons */}
        {state.gamePhase === "ended" && (
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
      <div className="w-full max-w-[400px]">
        {/* Preview Row */}
        {state.gamePhase === "playing" && renderPreviewRow()}

        {/* Main Board */}
        <div
          className="grid gap-1 p-2 bg-blue-800 rounded-lg shadow-xl"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
          onMouseLeave={() => setHoverCol(null)}
        >
          {Array(ROWS)
            .fill(null)
            .map((_, row) =>
              Array(COLS)
                .fill(null)
                .map((_, col) => (
                  <div
                    key={`${row}-${col}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverCol(col)}
                    onClick={() => handleColumnClick(col)}
                  >
                    {renderCell(row, col)}
                  </div>
                )),
            )}
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
