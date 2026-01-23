import { useEffect, useState } from "react";
import DotsAndBoxes from "./DotsAndBoxes";
import type { DotsAndBoxesState, PlayerColor } from "./types";
import { Play, RefreshCw, BookOpen, X } from "lucide-react";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";

const PLAYER_BG_COLORS: Record<PlayerColor, string> = {
  red: "bg-red-500/60",
  blue: "bg-blue-500/60",
};

const PLAYER_TEXT_COLORS: Record<PlayerColor, string> = {
  red: "text-red-500",
  blue: "text-blue-500",
};

export default function DotsAndBoxesUI({
  game: baseGame,
  currentUserId,
}: GameUIProps) {
  const game = baseGame as DotsAndBoxes;
  const [state, setState] = useState<DotsAndBoxesState>(game.getState());
  const [showRules, setShowRules] = useState(false);
  const { ti, ts } = useLanguage();

  useEffect(() => {
    return game.onUpdate(setState);
  }, [game]);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const isGameEnded = state.isGameEnded;

  const handleLineClick = (
    type: "horizontal" | "vertical",
    row: number,
    col: number,
  ) => {
    if (!isMyTurn || isGameEnded || state.gamePhase !== "playing") return;

    // Check if line is already taken
    if (type === "horizontal" && state.horizontalLines[row][col]) return;
    if (type === "vertical" && state.verticalLines[row][col]) return;

    game.requestPlaceLine(type, row, col);
  };

  const gridSize = state.gridSize;
  const gridPercentage = 100 / (gridSize - 1);

  const renderGameRules = () => {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
          <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({
                en: "Game Rules: Dots And Boxes",
                vi: "Luật Chơi: Nối Điểm",
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
                  en: "Dots and Boxes is a pencil-and-paper game for two players. The game starts with an empty grid of dots.",
                  vi: "Dots and Boxes (Nối điểm) là trò chơi dành cho 2 người. Trò chơi bắt đầu với một lưới các điểm.",
                })}
              </p>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Complete more boxes (squares) than your opponent.",
                    vi: "Hoàn thành (đóng) được nhiều ô vuông hơn đối thủ.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Gameplay", vi: "Luật chơi" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Players take turns adding a single horizontal or vertical line between two unjoined adjacent dots.",
                    vi: "Người chơi lần lượt thêm một đoạn thẳng ngang hoặc dọc giữa 2 điểm chưa được nối.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "A player who completes the fourth side of a 1x1 box earns one point and MUST take another turn.",
                    vi: "Người vẽ cạnh thứ 4 của một ô vuông 1x1 sẽ được điểm và PHẢI đi thêm lượt nữa.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "If you complete multiple boxes in one move, you keep playing until you fail to complete a box.",
                    vi: "Nếu bạn đóng được nhiều ô trong một lượt, bạn tiếp tục đi cho đến khi không đóng được ô nào nữa.",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Winning", vi: "Chiến thắng" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "The game ends when no more lines can be placed.",
                    vi: "Trò chơi kết thúc khi không còn đường nào để vẽ.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "The player with the most boxes wins.",
                    vi: "Người có nhiều ô nhất sẽ thắng.",
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
    <div className="flex flex-col items-center gap-6 p-4 w-full max-w-2xl mx-auto pb-10">
      {/* Header Info */}
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-3xl font-bold text-white">Dots & Boxes</h2>

        {/* Score Board & Player List */}
        <div className="flex gap-4 @md:gap-8 bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 w-full justify-center">
          {state.players.map((p, index) => (
            <div
              key={`player-${index}`}
              className={`flex flex-col items-center gap-2 p-2 rounded-lg transition-all ${
                state.currentPlayerIndex === index && !isGameEnded
                  ? "bg-slate-700 scale-105 shadow-md border-2 " +
                    (p?.color === "red" ? "border-red-500" : "border-blue-500")
                  : "border-2 border-transparent"
              } ${!p?.id ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    p?.color === "red" ? "bg-red-500" : "bg-blue-500"
                  }`}
                />
                <div
                  className={`text-sm font-bold ${
                    p?.color === "red" ? "text-red-500" : "text-blue-500"
                  }`}
                >
                  {p?.id ? p.username : ti({ en: "Empty", vi: "Trống" })}
                </div>
              </div>

              {p?.id ? (
                <div className="flex flex-col items-center">
                  <div
                    className={`text-3xl font-black ${
                      p?.color === "red" ? "text-red-500" : "text-blue-500"
                    }`}
                  >
                    {p.score}
                  </div>
                </div>
              ) : (
                <div className="h-9 flex items-center">
                  <span className="text-gray-500 text-xs italic">
                    {ti({ en: "Waiting...", vi: "Đang chờ..." })}
                  </span>
                </div>
              )}

              {/* Host Controls */}
              {game.isHost &&
                !isGameEnded &&
                state.boxes.every((r) => r.every((c) => c === null)) && (
                  <div className="mt-1">
                    {p?.isBot ? (
                      <button
                        onClick={() => game.requestRemoveBot(index)}
                        className="text-xs bg-red-900 hover:bg-red-800 text-red-100 px-2 py-1 rounded"
                      >
                        {ti({ en: "Remove Bot", vi: "Xóa Bot" })}
                      </button>
                    ) : (
                      !p?.id && (
                        <button
                          onClick={() => game.requestAddBot(index)}
                          className="text-xs bg-cyan-900 hover:bg-cyan-800 text-cyan-100 px-2 py-1 rounded"
                        >
                          {ti({ en: "+ Add Bot", vi: "+ Thêm Bot" })}
                        </button>
                      )
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>

        {/* Turn Info */}
        {!isGameEnded && state.gamePhase === "playing" ? (
          <div className="text-lg">
            {isMyTurn ? (
              <span className="text-green-400 font-bold animate-pulse">
                {ti({ en: "Your Turn!", vi: "Lượt của bạn!" })}
              </span>
            ) : (
              <span className="text-gray-300">
                {ti({ en: "Waiting for", vi: "Đang chờ" })}{" "}
                <span
                  className={`${
                    PLAYER_TEXT_COLORS[currentPlayer?.color || "red"]
                  } font-bold`}
                >
                  {currentPlayer?.username}
                </span>
                ...
              </span>
            )}
          </div>
        ) : isGameEnded ? (
          <div className="text-2xl font-bold text-white mb-2">
            Game Over!{" "}
            {state.winner === "draw"
              ? ti({ en: "It's a Draw!", vi: "Hòa!" })
              : `${
                  state.players.find((p) => p?.id === state.winner)?.username
                } ${ti({ en: "Wins!", vi: "Thắng!" })}`}
          </div>
        ) : null}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        {!isGameEnded && state.gamePhase === "waiting" && game.isHost && (
          <button
            onClick={() => game.requestStartGame()}
            disabled={!game.canStartGame()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />{" "}
            {ti({ en: "Start Game", vi: "Bắt đầu" })}
          </button>
        )}

        {/* Reset / New Game (Host only) */}
        {game.isHost && state.gamePhase !== "waiting" && (
          <button
            onClick={() => game.requestNewGame()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />{" "}
            {isGameEnded
              ? ti({ en: "Play Again", vi: "Chơi lại" })
              : ti({ en: "New Game", vi: "Ván mới" })}
          </button>
        )}

        {/* Undo Button (Visible if active game and made moves) */}
        {state.gamePhase === "playing" && !isGameEnded && (
          <button
            onClick={() => game.requestUndo()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            {ti({ en: "Undo", vi: "Hoàn tác" })}
          </button>
        )}
      </div>

      {/* Undo Request Modal */}
      {state.undoRequest &&
        (() => {
          const requester = state.players.find(
            (p) => p?.id === state.undoRequest?.requesterId,
          );
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-slate-800 p-4 rounded-lg shadow-xl border border-slate-600 flex flex-col gap-3">
                <p className="text-white">
                  {requester?.username}{" "}
                  {ti({
                    en: "requested to undo the last move.",
                    vi: "muốn hoàn tác nước đi vừa rồi.",
                  })}
                </p>
                {requester?.id != game.userId ? (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => game.rejectUndo()}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
                    >
                      {ti({ en: "Reject", vi: "Từ chối" })}
                    </button>
                    <button
                      onClick={() => game.approveUndo()}
                      className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded"
                    >
                      {ti({ en: "Approve", vi: "Đồng ý" })}
                    </button>
                  </div>
                ) : (
                  <div className="text-white">
                    {ti({
                      en: "Waiting for approval...",
                      vi: "Đang chờ phê duyệt...",
                    })}
                    <button
                      onClick={() => game.rejectUndo()}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
                    >
                      {ti({ en: "Cancel", vi: "Hủy" })}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-yellow-500 transition-colors z-40 shadow-lg border border-slate-500"
        title={ts({ en: "Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={24} />
      </button>

      {/* Game Board */}
      <div className="relative aspect-square w-full max-w-[400px] bg-slate-900 p-6 rounded-lg shadow-2xl select-none touch-none border-2 border-slate-700">
        <div className="relative w-full h-full">
          {/* 1. Render Boxes (Backgrounds) */}
          {state.boxes.map((rowBoxes, r) =>
            rowBoxes.map((ownerId, c) => {
              const owner = state.players.find((p) => p?.id === ownerId);
              if (!owner) return null;
              return (
                <div
                  key={`box-${r}-${c}`}
                  className={`absolute flex items-center justify-center rounded-sm transition-all duration-500 scale-90 ${
                    PLAYER_BG_COLORS[owner.color]
                  }`}
                  style={{
                    top: `${r * gridPercentage}%`,
                    left: `${c * gridPercentage}%`,
                    width: `${gridPercentage}%`,
                    height: `${gridPercentage}%`,
                  }}
                >
                  <div
                    className={`text-2xl font-bold ${
                      PLAYER_TEXT_COLORS[owner.color]
                    }`}
                  >
                    {owner.username[0].toUpperCase()}
                  </div>
                </div>
              );
            }),
          )}

          {/* 2. Render Lines (Horizontal & Vertical) */}
          {(["horizontal", "vertical"] as const).map((lineType) => {
            const lines =
              lineType === "horizontal"
                ? state.horizontalLines
                : state.verticalLines;
            return lines.map((rowLines, r) =>
              rowLines.map((isSet, c) => {
                const isLast =
                  state.lastLine?.type === lineType &&
                  state.lastLine.row === r &&
                  state.lastLine.col === c;
                const isHorizontal = lineType === "horizontal";

                return (
                  <div
                    key={`${lineType[0]}-${r}-${c}`}
                    onClick={() => handleLineClick(lineType, r, c)}
                    className={`absolute cursor-pointer transition-all duration-200 rounded-full z-10
                      ${
                        isHorizontal
                          ? "h-2 -translate-y-1/2"
                          : "w-2 -translate-x-1/2"
                      }
                      ${
                        isSet
                          ? isLast
                            ? "bg-yellow-400 shadow-[0_0_12px_4px_rgba(250,204,21,0.7)] animate-pulse"
                            : "bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.4)]"
                          : state.gamePhase === "playing"
                            ? "bg-slate-800 hover:bg-slate-400"
                            : "bg-slate-800 cursor-default"
                      }`}
                    style={{
                      top: `${r * gridPercentage}%`,
                      left: `${c * gridPercentage}%`,
                      ...(isHorizontal
                        ? { width: `${gridPercentage}%` }
                        : { height: `${gridPercentage}%` }),
                    }}
                  >
                    {/* Hitbox for easier clicking */}
                    {!isSet && state.gamePhase === "playing" && (
                      <div
                        className={`absolute inset-0 ${
                          isHorizontal ? "-top-2 -bottom-2" : "-left-2 -right-2"
                        }`}
                      />
                    )}
                  </div>
                );
              }),
            );
          })}

          {/* 4. Render Dots */}
          {/* {Array(gridSize)
            .fill(0)
            .map((_, r) =>
              Array(gridSize)
                .fill(0)
                .map((__, c) => (
                  <div
                    key={`dot-${r}-${c}`}
                    className="absolute w-3 h-3 bg-slate-600 rounded-full -translate-x-1/2 -translate-y-1/2 z-20"
                    style={{
                      top: `${r * gridPercentage}%`,
                      left: `${c * gridPercentage}%`,
                    }}
                  />
                ))
            )} */}
        </div>
      </div>

      {showRules && createPortal(renderGameRules(), document.body)}
    </div>
  );
}
