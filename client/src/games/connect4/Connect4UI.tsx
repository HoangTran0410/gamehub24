import { useEffect, useState } from "react";
import Connect4 from "./Connect4";
import type { Connect4State } from "./types";
import { ROWS, COLS } from "./types";
import { Bot, RotateCcw, Play, RefreshCw, Check, X } from "lucide-react";

// CSS for drop animation
const dropStyle = `
@keyframes drop {
  0% { transform: translateY(-400px); }
  60% { transform: translateY(10px); }
  80% { transform: translateY(-5px); }
  100% { transform: translateY(0); }
}
`;

interface Connect4UIProps {
  game: Connect4;
  currentUserId: string;
}

export default function Connect4UI({ game, currentUserId }: Connect4UIProps) {
  const [state, setState] = useState<Connect4State>(game.getState());
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  useEffect(() => {
    game.onUpdate(setState);
    setState(game.getState());
    game.requestSync();
  }, [game]);

  const myIndex = game.getMyPlayerIndex();
  const myColor = myIndex >= 0 ? state.players[myIndex].color : null;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const isHost = game.isHostUser;

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

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-lg mx-auto">
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
                {player.id ? player.username : "(waiting...)"}
                {player.isBot && " 🤖"}
                {player.id === currentUserId && " (You)"}
              </span>
            </div>
            {player.isBot && isHost && state.gamePhase === "waiting" && (
              <button
                onClick={() => game.requestRemoveBot()}
                className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Turn Indicator */}
      {state.gamePhase === "playing" && (
        <div className="text-lg text-gray-400">
          {isMyTurn ? (
            <span className="text-green-400">Your turn! Click a column.</span>
          ) : (
            <span>Waiting for {currentPlayer?.username}...</span>
          )}
        </div>
      )}

      {/* Undo Request Modal */}
      {state.undoRequest && state.undoRequest.fromId !== currentUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 shadow-xl max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              Undo Request
            </h3>
            <p className="text-gray-400 mb-4">
              {state.undoRequest.fromName} wants to undo their last move.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => game.acceptUndo()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" /> Accept
              </button>
              <button
                onClick={() => game.declineUndo()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting for undo response */}
      {state.undoRequest && state.undoRequest.fromId === currentUserId && (
        <div className="text-yellow-400 text-sm">
          Waiting for opponent to accept undo...
        </div>
      )}

      {/* Game Over */}
      {state.gamePhase === "ended" && (
        <div className="text-center p-4 bg-slate-800 rounded-lg">
          <h3 className="text-xl font-bold text-white mb-2">Game Over!</h3>
          <p className="text-gray-300">
            {state.winner === "draw"
              ? "It's a draw!"
              : state.winner === currentUserId
              ? "🎉 You won!"
              : `${
                  state.players.find((p) => p.id === state.winner)?.username
                } wins!`}
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
                <Bot className="w-4 h-4" /> Add Bot
              </button>
            )}
            {isHost && game.canStartGame() && (
              <button
                onClick={() => game.requestStartGame()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" /> Start Game
              </button>
            )}
          </>
        )}

        {/* Playing phase buttons */}
        {state.gamePhase === "playing" && (
          <>
            {myIndex >= 0 &&
              state.moveHistory.length > 0 &&
              !state.undoRequest && (
                <button
                  onClick={() => game.requestUndo()}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Undo
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
            <RefreshCw className="w-4 h-4" /> Play Again
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
                ))
            )}
        </div>
      </div>
    </div>
  );
}
