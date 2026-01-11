import { useEffect, useState } from "react";
import Reversi from "./Reversi";
import type { ReversiState, Cell } from "./types";
import { Bot, RotateCcw, Play, RefreshCw, Check, X } from "lucide-react";

// CSS for flip animation
const flipStyle = `
@keyframes flip {
  0% { transform: rotateY(0deg) scale(1); }
  50% { transform: rotateY(90deg) scale(1.1); }
  100% { transform: rotateY(180deg) scale(1); }
}
`;

interface ReversiUIProps {
  game: Reversi;
  currentUserId: string;
}

export default function ReversiUI({ game, currentUserId }: ReversiUIProps) {
  const [state, setState] = useState<ReversiState>(game.getState());

  useEffect(() => {
    game.onUpdate(setState);
    setState(game.getState());
    // Request sync from host when joining
    game.requestSync();
  }, [game]);

  const myIndex = game.getMyPlayerIndex();
  const myColor = myIndex >= 0 ? state.players[myIndex].color : null;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const validMoves =
    state.gamePhase === "playing" && isMyTurn
      ? game.getValidMoves(myColor)
      : [];
  const pieceCount = game.getPieceCount();
  const isHost = game.isHostUser;

  const isValidMove = (row: number, col: number) =>
    validMoves.some(([r, c]) => r === row && c === col);

  const handleCellClick = (row: number, col: number) => {
    if (state.gamePhase !== "playing") return;
    if (!isMyTurn) return;
    if (!isValidMove(row, col)) return;
    game.requestMove(row, col);
  };

  const renderCell = (cell: Cell, row: number, col: number) => {
    const valid = isValidMove(row, col);
    const isLastMove =
      state.lastMove?.row === row && state.lastMove?.col === col;
    const isFlipped = state.flippedCells?.some(
      (c) => c.row === row && c.col === col
    );

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
        {cell && (
          <div
            className={`
              w-[80%] h-[80%] rounded-full shadow-lg
              ${cell === "black" ? "bg-gray-900" : "bg-white"}
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
        {!cell && valid && (
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-2xl mx-auto">
      {/* Inject flip animation CSS */}
      <style dangerouslySetInnerHTML={{ __html: flipStyle }} />
      {/* Player List */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full max-w-md">
        <h3 className="text-sm font-medium text-gray-400 mb-1">Players</h3>
        {state.players.map((player, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-2 bg-slate-700 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full ${
                  player.color === "black" ? "bg-gray-900" : "bg-white"
                } ${player.color === "black" ? "text-white" : "text-black"}`}
              >
                {player.color === "black" ? pieceCount.black : pieceCount.white}
              </div>
              <span className="text-white">
                {player.id ? player.username : "(waiting...)"}
                {player.isBot && " 🤖"}
              </span>
            </div>
            {player.isBot && isHost && (
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
            <span className="text-green-400">Your turn!</span>
          ) : (
            <span>Waiting for {currentPlayer?.username}...</span>
          )}
          {validMoves.length === 0 && isMyTurn && (
            <span className="ml-2 text-yellow-400">
              (No valid moves - must pass)
            </span>
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
          <p className="text-gray-300 mb-4">
            {state.winner === "draw"
              ? "It's a draw!"
              : state.winner === currentUserId
              ? "🎉 You won!"
              : `${
                  state.players.find((p) => p.id === state.winner)?.username
                } wins!`}
          </p>
          <p className="text-gray-400">
            Black: {pieceCount.black} | White: {pieceCount.white}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
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
            {isMyTurn && validMoves.length === 0 && (
              <button
                onClick={() => game.requestPass()}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
              >
                Pass Turn
              </button>
            )}
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
      <div className="grid grid-cols-8 gap-0 rounded-lg overflow-hidden shadow-xl border-4 border-green-900 w-full max-w-[500px]">
        {state.board.map((row, ri) =>
          row.map((cell, ci) => renderCell(cell, ri, ci))
        )}
      </div>
    </div>
  );
}
