import { useEffect, useState } from "react";
import DotsAndBoxes from "./DotsAndBoxes";
import type { DotsAndBoxesState, PlayerColor } from "./types";
import { Play, RefreshCw } from "lucide-react";

interface DotsAndBoxesUIProps {
  game: DotsAndBoxes;
  currentUserId: string;
}

const PLAYER_BG_COLORS: Record<PlayerColor, string> = {
  red: "bg-red-500/30",
  blue: "bg-blue-500/30",
};

const PLAYER_TEXT_COLORS: Record<PlayerColor, string> = {
  red: "text-red-500",
  blue: "text-blue-500",
};

export default function DotsAndBoxesUI({
  game,
  currentUserId,
}: DotsAndBoxesUIProps) {
  const [state, setState] = useState<DotsAndBoxesState>(game.getState());

  useEffect(() => {
    game.onUpdate(setState);
    setState(game.getState());
    game.requestSync();
  }, [game]);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const isGameEnded = state.isGameEnded;

  const handleLineClick = (
    type: "horizontal" | "vertical",
    row: number,
    col: number
  ) => {
    if (!isMyTurn || isGameEnded || state.gamePhase !== "playing") return;

    // Check if line is already taken
    if (type === "horizontal" && state.horizontalLines[row][col]) return;
    if (type === "vertical" && state.verticalLines[row][col]) return;

    game.requestPlaceLine(type, row, col);
  };

  const gridSize = state.gridSize;
  const gridPercentage = 100 / (gridSize - 1);

  return (
    <div className="flex flex-col items-center gap-6 p-4 w-full max-w-2xl mx-auto">
      {/* Header Info */}
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-3xl font-bold text-white">Dots & Boxes</h2>

        {!isGameEnded ? (
          <div className="text-lg">
            {isMyTurn ? (
              <span className="text-green-400 font-bold animate-pulse">
                Your Turn!
              </span>
            ) : (
              <span className="text-gray-300">
                Waiting for{" "}
                <span
                  className={`${
                    PLAYER_TEXT_COLORS[currentPlayer.color]
                  } font-bold`}
                >
                  {currentPlayer.username}
                </span>
                ...
              </span>
            )}
          </div>
        ) : (
          <div className="text-2xl font-bold text-white mb-2">
            Game Over!{" "}
            {state.winner === "draw"
              ? "It's a Draw!"
              : `${
                  state.players.find((p) => p.id === state.winner)?.username
                } Wins!`}
          </div>
        )}

        {/* Score Board & Player List */}
        <div className="flex gap-4 md:gap-8 bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 w-full justify-center">
          {state.players.map((p, index) => (
            <div
              key={`player-${index}`}
              className={`flex flex-col items-center gap-2 p-2 rounded-lg transition-all ${
                state.currentPlayerIndex === index && !isGameEnded
                  ? "bg-slate-700 scale-105 shadow-md border-2 " +
                    (p.color === "red" ? "border-red-500" : "border-blue-500")
                  : "border-2 border-transparent"
              } ${!p.id ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    p.color === "red" ? "bg-red-500" : "bg-blue-500"
                  }`}
                />
                <div
                  className={`text-sm font-bold ${
                    p.color === "red" ? "text-red-500" : "text-blue-500"
                  }`}
                >
                  {p.id ? p.username : "Empty"}
                </div>
              </div>

              {p.id ? (
                <div className="flex flex-col items-center">
                  <div
                    className={`text-3xl font-black ${
                      p.color === "red" ? "text-red-500" : "text-blue-500"
                    }`}
                  >
                    {p.score}
                  </div>
                </div>
              ) : (
                <div className="h-9 flex items-center">
                  <span className="text-gray-500 text-xs italic">
                    Waiting...
                  </span>
                </div>
              )}

              {/* Host Controls */}
              {game.isHostUser &&
                !isGameEnded &&
                state.boxes.every((r) => r.every((c) => c === null)) && (
                  <div className="mt-1">
                    {p.isBot ? (
                      <button
                        onClick={() => game.requestRemoveBot(index)}
                        className="text-xs bg-red-900 hover:bg-red-800 text-red-100 px-2 py-1 rounded"
                      >
                        Remove Bot
                      </button>
                    ) : (
                      !p.id && (
                        <button
                          onClick={() => game.requestAddBot(index)}
                          className="text-xs bg-cyan-900 hover:bg-cyan-800 text-cyan-100 px-2 py-1 rounded"
                        >
                          + Add Bot
                        </button>
                      )
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>

      {/* Game Board */}
      <div className="relative aspect-square w-full max-w-[400px] bg-slate-900 p-6 rounded-lg shadow-2xl select-none touch-none border-2 border-slate-700">
        <div className="relative w-full h-full">
          {/* 1. Render Boxes (Backgrounds) */}
          {state.boxes.map((rowBoxes, r) =>
            rowBoxes.map((ownerId, c) => {
              const owner = state.players.find((p) => p.id === ownerId);
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
                    className={`text-2xl font-bold opacity-50 ${
                      PLAYER_TEXT_COLORS[owner.color]
                    }`}
                  >
                    {owner.username[0].toUpperCase()}
                  </div>
                </div>
              );
            })
          )}

          {/* 2. Render Horizontal Lines */}
          {state.horizontalLines.map((rowLines, r) =>
            rowLines.map((isSet, c) => {
              const isLast =
                state.lastLine?.type === "horizontal" &&
                state.lastLine.row === r &&
                state.lastLine.col === c;
              return (
                <div
                  key={`h-${r}-${c}`}
                  onClick={() => handleLineClick("horizontal", r, c)}
                  className={`absolute h-2 -translate-y-1/2 cursor-pointer transition-colors duration-200
                            ${
                              isSet
                                ? isLast
                                  ? "bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)] animate-pulse"
                                  : "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                                : state.gamePhase === "playing"
                                ? "bg-slate-700 hover:bg-slate-500"
                                : "bg-slate-800 cursor-default"
                            }
                             z-10`}
                  style={{
                    top: `${r * gridPercentage}%`,
                    left: `${c * gridPercentage}%`,
                    width: `${gridPercentage}%`,
                  }}
                >
                  {/* Hitbox for easier clicking */}
                  {!isSet && state.gamePhase === "playing" && (
                    <div className="absolute inset-0 -top-2 -bottom-2" />
                  )}
                  {isSet && (
                    <div
                      className={`absolute inset-0 rounded-full ${
                        isLast ? "bg-yellow-400" : "bg-cyan-400"
                      }`}
                    />
                  )}
                </div>
              );
            })
          )}

          {/* 3. Render Vertical Lines */}
          {state.verticalLines.map((rowLines, r) =>
            rowLines.map((isSet, c) => {
              const isLast =
                state.lastLine?.type === "vertical" &&
                state.lastLine.row === r &&
                state.lastLine.col === c;
              return (
                <div
                  key={`v-${r}-${c}`}
                  onClick={() => handleLineClick("vertical", r, c)}
                  className={`absolute w-2 -translate-x-1/2 cursor-pointer transition-colors duration-200
                            ${
                              isSet
                                ? isLast
                                  ? "bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)] animate-pulse"
                                  : "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                                : state.gamePhase === "playing"
                                ? "bg-slate-700 hover:bg-slate-500"
                                : "bg-slate-800 cursor-default"
                            }
                             z-10`}
                  style={{
                    top: `${r * gridPercentage}%`,
                    left: `${c * gridPercentage}%`,
                    height: `${gridPercentage}%`,
                  }}
                >
                  {/* Hitbox for easier clicking */}
                  {!isSet && state.gamePhase === "playing" && (
                    <div className="absolute inset-0 -left-2 -right-2" />
                  )}
                  {isSet && (
                    <div
                      className={`absolute inset-0 rounded-full ${
                        isLast ? "bg-yellow-400" : "bg-cyan-400"
                      }`}
                    />
                  )}
                </div>
              );
            })
          )}

          {/* 4. Render Dots */}
          {Array(gridSize)
            .fill(0)
            .map((_, r) =>
              Array(gridSize)
                .fill(0)
                .map((__, c) => (
                  <div
                    key={`dot-${r}-${c}`}
                    className="absolute w-4 h-4 bg-slate-400 rounded-full -translate-x-1/2 -translate-y-1/2 z-20 shadow-sm"
                    style={{
                      top: `${r * gridPercentage}%`,
                      left: `${c * gridPercentage}%`,
                    }}
                  />
                ))
            )}
        </div>
      </div>

      {/* Undo Request Modal */}
      {state.undoRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800 p-4 rounded-lg shadow-xl border border-slate-600 flex flex-col gap-3">
            <p className="text-white">
              {
                state.players.find(
                  (p) => p.id === state.undoRequest?.requesterId
                )?.username
              }{" "}
              requested to undo the last move.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => game.rejectUndo()}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
              >
                Reject
              </button>
              <button
                onClick={() => game.approveUndo()}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        {!isGameEnded && state.gamePhase === "waiting" && game.isHostUser && (
          <button
            onClick={() => game.requestStartGame()}
            disabled={!game.canStartGame()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" /> Start Game
          </button>
        )}

        {/* Reset / New Game (Host only) */}
        {game.isHostUser && state.gamePhase !== "waiting" && (
          <button
            onClick={() => game.requestNewGame()}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />{" "}
            {isGameEnded ? "Play Again" : "Reset Game"}
          </button>
        )}

        {/* Undo Button (Visible if active game and made moves) */}
        {state.gamePhase === "playing" && !isGameEnded && (
          <button
            onClick={() => game.requestUndo()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
