import { useEffect, useRef, useState } from "react";
import ChessGame from "./Chess";
import type { ChessState } from "./types";
import { Chess } from "chess.js";
import { Chessground as ChessgroundApi } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import { RotateCcw, Bot, BookOpen, X } from "lucide-react";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import { useUserStore } from "../../stores/userStore";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";

export default function ChessUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as ChessGame;
  const [state, setState] = useState<ChessState>(game.getState());
  const { userId } = useUserStore();
  const { ti, ts } = useLanguage();
  const [showRules, setShowRules] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const chessgroundRef = useRef<Api | null>(null);

  // Sync state
  useEffect(() => {
    return game.onUpdate((newState) => setState(newState));
  }, [game]);

  const myColorCode = game.getPlayerColor();
  const isMyTurn = myColorCode ? state.turn === myColorCode : false;
  const inCheck = state.check;

  // Initialize/Update Chessground
  useEffect(() => {
    if (!boardRef.current) return;

    const _myColor = myColorCode === "w" ? "white" : "black";

    const config = {
      fen: state.fen,
      orientation: _myColor,
      turnColor: state.turn === "w" ? "white" : "black",
      movable: {
        free: false,
        color: isMyTurn ? myColorCode : undefined,
        dests: getValidMoves(state.fen),
      },
      events: {
        move: (orig: Key, dest: Key) => {
          // Check for promotion
          const chess = new Chess(state.fen);
          const piece = chess.get(orig as any);
          const isPromotion =
            piece?.type === "p" &&
            ((piece.color === "w" && dest[1] === "8") ||
              (piece.color === "b" && dest[1] === "1"));

          game.requestMove(orig, dest, isPromotion ? "q" : undefined);
        },
      },
      draggable: {
        enabled: true,
        showGhost: true,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      animation: {
        enabled: true,
        duration: 200,
      },
    };

    if (!chessgroundRef.current) {
      // @ts-ignore
      chessgroundRef.current = ChessgroundApi(boardRef.current, config);
    } else {
      chessgroundRef.current.set({
        fen: state.fen,
        turnColor: state.turn === "w" ? "white" : "black",
        movable: {
          free: false,
          color: isMyTurn && !state.gameOver ? _myColor : undefined,
          dests: isMyTurn ? getValidMoves(state.fen) : new Map(),
        },
        check: inCheck ? (state.turn === "w" ? "white" : "black") : undefined,
        lastMove: state.lastMove
          ? [state.lastMove.from as Key, state.lastMove.to as Key]
          : undefined,
      });
    }

    // Add ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (chessgroundRef.current) {
        chessgroundRef.current.redrawAll();
      }
    });

    if (boardRef.current) {
      resizeObserver.observe(boardRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [state.fen, isMyTurn, state.gameOver, myColorCode]);

  // Helper to get valid moves using a temp chess instance
  const getValidMoves = (fen: string): Map<Key, Key[]> => {
    const dests = new Map<Key, Key[]>();
    if (!isMyTurn || state.gameOver) return dests;

    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });

    for (const move of moves) {
      const from = move.from as Key;
      const to = move.to as Key;
      if (!dests.has(from)) dests.set(from, []);
      dests.get(from)?.push(to);
    }
    return dests;
  };

  const renderGameRules = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
        <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-yellow-500" />
            {ti({ en: "Game Rules: Chess", vi: "Luật Chơi: Cờ Vua" })}
          </h2>
          <button
            onClick={() => setShowRules(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 pt-0 space-y-4 text-slate-300 leading-relaxed">
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-yellow-400">
                {ti({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <p>
                {ti({
                  en: "Checkmate the opponent's king. White moves first.",
                  vi: "Chiếu bí vua của đối phương. Trắng đi trước.",
                })}
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Basic Rules", vi: "Quy Tắc Cơ Bản" })}
              </h3>
              <ul className="list-disc pl-4">
                <li>
                  <strong>{ti({ en: "King", vi: "Vua" })}</strong>:{" "}
                  {ti({
                    en: "Moves one square in any direction.",
                    vi: "Di chuyển 1 ô theo mọi hướng.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Queen", vi: "Hậu" })}</strong>:{" "}
                  {ti({
                    en: "Moves diagonally, horizontally, or vertically any number of squares.",
                    vi: "Di chuyển ngang, dọc, chéo bao nhiêu ô tùy ý.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Rook", vi: "Xe" })}</strong>:{" "}
                  {ti({
                    en: "Moves horizontally or vertically any number of squares.",
                    vi: "Di chuyển ngang hoặc dọc bao nhiêu ô tùy ý.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Bishop", vi: "Tượng" })}</strong>:{" "}
                  {ti({
                    en: "Moves diagonally any number of squares.",
                    vi: "Di chuyển chéo bao nhiêu ô tùy ý.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Knight", vi: "Mã" })}</strong>:{" "}
                  {ti({
                    en: "Moves in an 'L' shape: two squares in one direction and then one square perpendicular to that direction.",
                    vi: "Di chuyển theo hình chữ L.",
                  })}
                </li>
                <li>
                  <strong>{ti({ en: "Pawn", vi: "Tốt" })}</strong>:{" "}
                  {ti({
                    en: "Moves forward one square (or two on the first move). Captures diagonally.",
                    vi: "Di chuyển thẳng 1 ô (hoặc 2 ở nước đầu). Ăn chéo.",
                  })}
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Special Moves", vi: "Nước Đi Đặc Biệt" })}
              </h3>
              <ul className="list-disc pl-4">
                <li>
                  {ti({
                    en: "Castling: Move the King two squares towards a Rook.",
                    vi: "Nhập thành: Di chuyển Vua 2 ô về phía Xe.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "En Passant: Special pawn capture.",
                    vi: "Bắt tốt qua đường.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Promotion: Pawn reaching the other side becomes a Queen, Rook, Bishop, or Knight.",
                    vi: "Phong cấp: Tốt đi đến cuối bàn cờ được phong làm Hậu, Xe, Tượng hoặc Mã.",
                  })}
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-2xl mx-auto pb-16!">
      {/* Status Header */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full max-w-[400px] mx-auto">
        <h3 className="text-sm font-medium text-gray-400 mb-1">
          {ti({ en: "Players", vi: "Người chơi" })}
        </h3>
        {(["white", "black"] as const).map((color) => {
          const player = state.players[color];
          const isBot = player?.isBot;
          const isCurrentTurn =
            state.turn === (color === "white" ? "w" : "b") && !state.gameOver;
          const isMe = player?.id === userId;

          return (
            <div
              key={color}
              className={`
                flex items-center justify-between p-2 rounded-lg
                ${
                  isCurrentTurn
                    ? "bg-slate-600 ring-2 ring-yellow-400"
                    : "bg-slate-700"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    color === "white" ? "bg-white" : "bg-black"
                  }`}
                ></div>
                <span className="text-white">
                  {isBot
                    ? "Bot"
                    : player
                      ? player.username
                      : ti({ en: "(waiting...)", vi: "(đang chờ...)" })}
                  {isBot && " 🤖"}
                  {isMe && player && ti({ en: " (You)", vi: " (Bạn)" })}
                </span>
              </div>

              {/* Action Buttons */}
              {isBot && game.isHost && !state.gameOver && (
                <button
                  onClick={() => game.removeBot()}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                >
                  {ti({ en: "Remove", vi: "Xóa" })}
                </button>
              )}
              {!player && game.isHost && !state.gameOver && (
                <button
                  onClick={() => game.addBot()}
                  disabled={state.isBotLoading}
                  className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1"
                >
                  {state.isBotLoading ? (
                    <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Bot className="w-3 h-3" />
                  )}
                  {ti({ en: "Add Bot", vi: "Thêm Bot" })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Game Status Message */}
      {state.gameOver ? (
        <div className="text-lg font-bold text-center my-2">
          {state.winner ? (
            <span
              className={
                state.winner === (myColorCode === "w" ? "white" : "black")
                  ? "text-green-400"
                  : "text-red-400"
              }
            >
              {state.winner ===
              (userId === state.players.white?.id ? "white" : "black")
                ? ti({ en: "You Won!", vi: "Bạn thắng!" })
                : ti({ en: "Opponent Won!", vi: "Đối thủ thắng!" })}
            </span>
          ) : (
            <span className="text-yellow-400">
              {ti({ en: "Draw!", vi: "Hòa!" })}
            </span>
          )}
        </div>
      ) : (
        inCheck &&
        state.turn === myColorCode && (
          <div className="text-center my-2">
            <div className="text-red-400 font-bold animate-pulse">
              {ti({ en: "Check!", vi: "Chiếu!" })}
            </div>
          </div>
        )
      )}

      {/* Global Game Controls */}
      <div className="flex flex-col gap-2 justify-center items-center w-full">
        {/* Turn Indicator */}
        <div className="text-lg text-gray-400">
          {isMyTurn ? (
            <span className="text-green-400">
              {ti({ en: "Your turn!", vi: "Lượt của bạn!" })}
            </span>
          ) : (
            <span>
              {ti({ en: "Waiting for", vi: "Đang chờ" })}{" "}
              {state.players[myColorCode === "w" ? "black" : "white"]?.username}{" "}
              {ti({ en: "...", vi: "..." })}
            </span>
          )}
        </div>

        {!state.gameOver && !state.pendingNewGameRequest && (
          <button
            onClick={() => game.requestReset()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {ti({ en: "New Game", vi: "Ván mới" })}
          </button>
        )}

        {state.gameOver && (
          <button
            onClick={() => game.requestReset()}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {ti({ en: "Play Again", vi: "Chơi lại" })}
          </button>
        )}
      </div>

      {/* New Game Request Handling Popup */}
      {state.pendingNewGameRequest &&
        state.pendingNewGameRequest !== userId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl flex flex-col gap-4 max-w-sm w-full">
              <div className="text-lg text-white font-medium text-center">
                {ti({
                  en: "Opponent wants to start a new game",
                  vi: "Đối thủ muốn chơi ván mới",
                })}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    game.onSocketGameAction({
                      action: { type: "NEW_GAME_RESPONSE", accepted: true },
                    })
                  }
                  className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded-lg text-white font-medium"
                >
                  {ti({ en: "Accept", vi: "Đồng ý" })}
                </button>
                <button
                  onClick={() =>
                    game.onSocketGameAction({
                      action: { type: "NEW_GAME_RESPONSE", accepted: false },
                    })
                  }
                  className="flex-1 bg-red-600 hover:bg-red-500 py-2 rounded-lg text-white font-medium"
                >
                  {ti({ en: "Decline", vi: "Từ chối" })}
                </button>
              </div>
            </div>
          </div>
        )}

      {state.pendingNewGameRequest &&
        state.pendingNewGameRequest === userId && (
          <div className="text-sm text-yellow-400 animate-pulse flex items-center justify-center">
            {ti({
              en: "Requesting New Game...",
              vi: "Đang yêu cầu ván mới...",
            })}
          </div>
        )}

      {/* Chessboard */}
      <div className="w-full max-w-xl">
        <div
          ref={boardRef}
          className="w-full aspect-square rounded-lg overflow-hidden"
          style={{ maxHeight: "min(80vh, 600px)" }}
        />
      </div>

      {/* Captured Pieces */}
      <div className="w-full flex justify-between gap-4 text-sm">
        <div className="rounded-lg p-2 flex-1 bg-slate-400">
          <div className="text-xs text-slate-100 mb-1">
            {ti({ en: "White captured:", vi: "Trắng bắt:" })}{" "}
          </div>
          <div className="flex flex-wrap gap-1">
            {state.capturedPieces.white.map((p, i) => (
              <img
                key={i}
                src={`https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/b${p.toUpperCase()}.svg`}
                alt={p}
                className="w-5 h-5 object-contain"
              />
            ))}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 flex-1">
          <div className="text-xs text-slate-400 mb-1">
            {ti({ en: "Black captured:", vi: "Đen bắt:" })}
          </div>
          <div className="flex flex-wrap gap-1">
            {state.capturedPieces.black.map((p, i) => (
              <img
                key={i}
                src={`https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/w${p.toUpperCase()}.svg`}
                alt={p}
                className="w-5 h-5 object-contain"
              />
            ))}
          </div>
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
