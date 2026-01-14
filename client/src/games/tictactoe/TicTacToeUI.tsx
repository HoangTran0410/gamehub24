import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TicTacToe from "./TicTacToe";
import type { TicTacToeState } from "./types";
import { RefreshCcw, X, Circle, LogOut, Bot, Play } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { useChatStore } from "../../stores/chatStore";
import { useUserStore } from "../../stores/userStore";
import { getSocket } from "../../services/socket";
import type { GameUIProps } from "../types";

export default function TicTacToeUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as TicTacToe;
  const [state, setState] = useState<TicTacToeState>(game.getState());
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  // Use stores needed for leave game logic
  const { setCurrentRoom } = useRoomStore();
  const { clearMessages } = useChatStore();
  const { username: myUsername } = useUserStore();

  const mySymbol = game.getPlayerSymbol();
  const isMyTurn = state.currentTurn === mySymbol;
  const board = state.board;
  const winningLine = state.winningLine;
  const lastMoveIndex = state.lastMoveIndex;

  useEffect(() => {
    // Subscribe to game state updates
    game.onUpdate((state) => {
      setState(state);
    });
  }, [game]);

  const handleCellClick = (index: number) => {
    if (state.gameOver) return;
    if (state.board[index] !== null) return;
    if (!isMyTurn) return;

    game.requestMove(index);
  };

  const onSwitchTurn = () => {
    game.switchTurn();
  };

  return (
    <div className="flex flex-col items-center gap-3 md:p-4 w-full max-w-sm mx-auto">
      {/* Player List */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full max-w-[400px] mx-auto">
        <h3 className="text-sm font-medium text-gray-400 mb-1">Players</h3>
        {(["X", "O"] as const).map((symbol) => {
          const player = state.players[symbol];
          const isCurrentTurn = state.currentTurn === symbol && !state.gameOver;
          const isMe = symbol === mySymbol;
          const isBot = player === "BOT";
          const playerName = isBot
            ? "Bot"
            : isMe
            ? myUsername
            : player
            ? "Opponent"
            : null;

          return (
            <div
              key={symbol}
              className={`
                flex items-center justify-between p-2 rounded-lg
                ${
                  isCurrentTurn
                    ? "bg-slate-600 ring-2 ring-blue-400"
                    : "bg-slate-700"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center">
                  {symbol === "X" ? (
                    <X className="w-5 h-5 text-blue-400" strokeWidth={2.5} />
                  ) : (
                    <Circle
                      className="w-5 h-5 text-red-400"
                      strokeWidth={2.5}
                    />
                  )}
                </div>
                <span className="text-white">
                  {playerName ? playerName : "(waiting...)"}
                  {isBot && " 🤖"}
                  {isMe && player && " (You)"}
                </span>
              </div>
              {isBot && game.isHostUser && !state.gameOver && (
                <button
                  onClick={() => game.removeBot()}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                >
                  Remove
                </button>
              )}
              {!player &&
                game.isHostUser &&
                !state.gameOver &&
                symbol === "O" && (
                  <button
                    onClick={() => game.addBot()}
                    className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1"
                  >
                    <Bot className="w-3 h-3" /> Add Bot
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {/* Start Game Button - only show when waiting and both players ready */}
      {state.gamePhase === "waiting" && game.isHostUser && (
        <div className="flex flex-col items-center gap-2">
          {game.canStartGame() ? (
            <button
              onClick={() => game.startGame()}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Start Game
            </button>
          ) : (
            <span className="text-sm text-slate-400">
              Waiting for opponent to join...
            </span>
          )}
        </div>
      )}

      {/* Start Game message for non-host */}
      {state.gamePhase === "waiting" && !game.isHostUser && (
        <div className="text-sm text-slate-400">
          Waiting for host to start the game...
        </div>
      )}

      {/* Turn Indicator */}
      {state.gamePhase === "playing" && !state.gameOver && (
        <div className="text-lg text-gray-400">
          {isMyTurn ? (
            <span className="text-green-400">Your turn! Click a cell.</span>
          ) : (
            <span>Waiting for opponent...</span>
          )}
        </div>
      )}

      {/* Switch Turn button - only show when board is empty and playing */}
      {state.gamePhase === "playing" &&
        !state.gameOver &&
        board.every((cell) => cell === null) &&
        isMyTurn && (
          <button
            onClick={onSwitchTurn}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-sm font-medium transition-colors flex items-center gap-2"
            title="Give first move to opponent"
          >
            <RefreshCcw className="w-4 h-4" />
            Give First Move
          </button>
        )}

      {/* Game Board */}
      <div className="grid grid-cols-3 gap-2 bg-slate-800 p-3 rounded-xl relative">
        {board.map((cell, index) => {
          const isWinningCell = winningLine?.includes(index);
          const isLastMove = lastMoveIndex === index;
          const canInteract = isMyTurn && !cell && !state.gameOver;

          return (
            <button
              key={index}
              onClick={() => handleCellClick(index)}
              disabled={!canInteract}
              className={`
                w-20 h-20 sm:w-24 sm:h-24 rounded-lg flex items-center justify-center text-4xl transition-all
                border border-slate-700
                ${
                  cell
                    ? "bg-slate-700 shadow-inner"
                    : "bg-slate-750 hover:bg-slate-700"
                }
                ${isWinningCell ? "bg-green-500/20 ring-2 ring-green-500" : ""}
                ${
                  isLastMove && !isWinningCell
                    ? "bg-amber-500/20 ring-2 ring-amber-500/50"
                    : ""
                }
                ${
                  canInteract
                    ? "cursor-pointer hover:ring-2 hover:ring-primary-500/50"
                    : "cursor-default"
                }
              `}
            >
              {cell === "X" && (
                <X
                  className={`w-12 h-12 ${
                    isWinningCell ? "text-green-400" : "text-blue-400"
                  }`}
                  strokeWidth={2.5}
                />
              )}
              {cell === "O" && (
                <Circle
                  className={`w-10 h-10 ${
                    isWinningCell ? "text-green-400" : "text-red-400"
                  }`}
                  strokeWidth={2.5}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Game Over Actions */}
      {state.gameOver && (
        <div className="flex gap-3 w-full">
          <button
            onClick={() => game.requestReset()}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 font-medium transition-colors flex items-center justify-center gap-2"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
