import { useAlertStore } from "../../stores/alertStore";
import type { Player } from "../../stores/roomStore";
import { BaseGame, type GameAction } from "../BaseGame";
import { type ChessState, type ChessAction } from "./types";
import { Chess } from "chess.js";

const chess = new Chess();

export default class ChessGame extends BaseGame<ChessState> {
  getInitState(): ChessState {
    return {
      fen: chess.fen(),
      turn: "w",
      winner: null,
      isDraw: false,
      check: false,
      players: {
        white: this.players[0] || null,
        black: this.players[1] || null,
      },
      gameOver: false,
      history: [],
      lastMove: null,
      capturedPieces: {
        white: [],
        black: [],
      },
      pendingUndoRequest: null,
      pendingNewGameRequest: null,
      isBotLoading: false,
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as ChessAction;
    console.log("[Chess] handleAction:", action, "isHost:", this.isHost);

    if (this.isHost) {
      switch (action.type) {
        case "MAKE_MOVE":
          this.makeAction(action);
          break;
        case "RESET_GAME": // Legacy or direct reset
          this.reset();
          break;
        case "NEW_GAME_REQUEST":
          this.handleNewGameRequest(action.playerId);
          break;
        case "NEW_GAME_RESPONSE":
          this.handleNewGameResponse(action.accepted);
          break;
      }
    }
  }

  makeAction(action: GameAction): void {
    const { from, to, promotion, playerId } = action as {
      from: string;
      to: string;
      promotion?: string;
      playerId: string;
    };

    console.log("[Chess] makeMove called", {
      from,
      to,
      playerId,
      turn: this.state.turn,
    });
    console.log("[Chess] Players:", this.state.players);

    if (this.state.gameOver) {
      console.log("[Chess] Game over, ignoring move");
      return;
    }

    // Validate turn
    let playerColor: "w" | "b" | null = null;
    if (this.state.players.white?.id === playerId) playerColor = "w";
    else if (this.state.players.black?.id === playerId) playerColor = "b";

    console.log("[Chess] Player color resolved:", playerColor);

    if (playerColor === null || this.state.turn !== playerColor) {
      console.log(
        "[Chess] Invalid turn or player. Turn:",
        this.state.turn,
        "Color:",
        playerColor,
      );
      return;
    }

    try {
      // Create temp chess instance to validate/execute
      const tempChess = new Chess(this.state.fen);
      const move = tempChess.move({ from, to, promotion });

      if (move) {
        // Apply move
        chess.load(tempChess.fen());
        this.updateStateFromChess(move);
        this.broadcastState();
        this.checkBotTurn();
      } else {
        console.log("[Chess] Move validation failed (move returned null)");
      }
    } catch (e) {
      console.error("Invalid move:", e, { from, to, promotion });
    }
  }

  private updateStateFromChess(move: any) {
    this.state.fen = chess.fen();
    this.state.turn = chess.turn();
    this.state.gameOver = chess.isGameOver();
    this.state.check = chess.inCheck();
    this.state.isDraw = chess.isDraw();
    this.state.lastMove = { from: move.from, to: move.to };
    this.state.history.push(this.state.fen);

    if (this.state.gameOver) {
      if (chess.isCheckmate()) {
        this.state.winner = chess.turn() === "w" ? "black" : "white";
      } else {
        this.state.winner = null; // Draw
      }
      this.clearSavedState();
    } else {
      // Check capture for display
      if (move.captured) {
        // If white moved and captured, add to white's captured list (showing black pieces)
        if (move.color === "w") {
          this.state.capturedPieces.white.push(move.captured);
        } else {
          this.state.capturedPieces.black.push(move.captured);
        }
      }
    }
  }

  reset(): void {
    chess.reset();
    this.state.fen = chess.fen();
    this.state.turn = "w";
    this.state.winner = null;
    this.state.isDraw = false;
    this.state.check = false;
    this.state.gameOver = false;
    this.state.history = [];
    this.state.lastMove = null;
    this.state.capturedPieces.white = [];
    this.state.capturedPieces.black = [];
    this.state.pendingUndoRequest = null;
    this.state.pendingNewGameRequest = null;
    this.state.isBotLoading = false;

    this.checkBotTurn();
  }

  // --- Actions ---

  requestMove(from: string, to: string, promotion?: string): void {
    const action: ChessAction = {
      type: "MAKE_MOVE",
      from,
      to,
      promotion,
      playerId: this.userId,
    };
    this.isHost ? this.makeAction(action) : this.sendSocketGameAction(action);
  }

  async requestReset(): Promise<void> {
    // If bot game -> Reset immediately
    const isBotGame =
      this.state.players.black?.isBot || this.state.players.white?.isBot;
    if (
      this.isHost ||
      isBotGame ||
      !this.state.players.white ||
      !this.state.players.black
    ) {
      if (await useAlertStore.getState().confirm("You can't reset the game")) {
        this.reset();
      }
      return;
    }

    // PvP -> Request New Game
    const action: ChessAction = {
      type: "NEW_GAME_REQUEST",
      playerId: this.userId,
    };
    this.isHost
      ? this.handleNewGameRequest(this.userId)
      : this.sendSocketGameAction(action);
  }

  // --- Handlers ---

  private handleNewGameRequest(playerId: string): void {
    this.state.pendingNewGameRequest = playerId;
  }

  private handleNewGameResponse(accepted: boolean): void {
    if (accepted) {
      this.reset();
    } else {
      this.state.pendingNewGameRequest = null;
    }
  }

  public getPlayerColor(): "w" | "b" | null {
    if (this.state.players.white?.id === this.userId) return "w";
    if (this.state.players.black?.id === this.userId) return "b";
    return null;
  }

  updatePlayers(players: Player[]): void {
    // Prioritize preserving existing assignment if possible, or just overwrite?
    // Simple overwrite based on room list order (Host=0, Guest=1)
    // Slot 0 (Host / White)
    this.state.players.white = players[0] || null;

    // Slot 1 (Guest / Black or Bot)
    if (players[1]) {
      this.state.players.black = players[1];
    } else {
      // No guest. Keep Bot if it was Bot, otherwise clear.
      if (!this.state.players.black?.isBot) {
        this.state.players.black = null;
      }
    }
  }

  // --- Bot Logic (Stockfish) ---
  private stockfishWorker: Worker | null = null;
  private isBotThinking: boolean = false;

  async addBot(): Promise<void> {
    if (!this.isHost) return;
    // Assign bot to empty slot, prioritize Black
    if (!this.state.players.black) {
      this.state.players.black = {
        id: "BOT",
        username: "BOT",
        isHost: false,
        isBot: true,
      };
    } else if (!this.state.players.white) {
      this.state.players.white = {
        id: "BOT",
        username: "BOT",
        isHost: false,
        isBot: true,
      };
    }

    this.state.isBotLoading = true;

    // Initialize Stockfish
    if (!this.stockfishWorker) {
      const stockfishUrl =
        "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";
      // Create a blob to load the worker from CDN to avoid cross-origin issues with direct Worker URL
      const blob = new Blob([`importScripts('${stockfishUrl}');`], {
        type: "application/javascript",
      });
      const workerUrl = URL.createObjectURL(blob);

      this.stockfishWorker = new Worker(workerUrl);
      this.stockfishWorker.onmessage = (event) => {
        this.handleStockfishMessage(event.data);
      };

      // Wait for engine to be ready
      const readyPromise = new Promise<void>((resolve) => {
        this.onBotReady = resolve;
      });

      this.stockfishWorker.postMessage("uci");
      this.stockfishWorker.postMessage("isready");

      await readyPromise;
    } else {
      // Already loaded, just ready check
      this.state.isBotLoading = false;

      this.checkBotTurn();
    }
  }

  removeBot(): void {
    if (!this.isHost) return;
    if (this.state.players.black?.isBot) {
      this.state.players.black = null;
    } else if (this.state.players.white?.isBot) {
      this.state.players.white = null;
    }
  }

  private onBotReady?: () => void;

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gameOver) return;

    const currentPlayerId =
      this.state.turn === "w"
        ? this.state.players.white
        : this.state.players.black;

    // Check if current player is BOT
    if (currentPlayerId?.isBot && !this.isBotThinking) {
      this.makeBotMove();
    }
  }

  private makeBotMove(): void {
    if (this.state.gameOver || !this.stockfishWorker) return;

    this.isBotThinking = true;

    // 1. Position
    this.stockfishWorker.postMessage(`position fen ${this.state.fen}`);

    // 2. Go (simple depth or time limit)
    // Skill Level can be adjusted via "setoption name Skill Level value X"
    // For now, let's just give it a reasonable time limit (e.g. 1 sec) or depth
    this.stockfishWorker.postMessage("go movetime 1000");
  }

  private handleStockfishMessage(message: string) {
    // console.log("Stockfish:", message);

    if (message === "readyok") {
      this.state.isBotLoading = false;

      this.checkBotTurn();
      if (this.onBotReady) {
        this.onBotReady();
        this.onBotReady = undefined;
      }
    }

    if (message.startsWith("bestmove")) {
      // Format: "bestmove e2e4 ponder ..."
      const parts = message.split(" ");
      const bestMove = parts[1];

      if (bestMove && bestMove !== "(none)") {
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        // Promotion? e.g. "a7a8q"
        const promotion =
          bestMove.length > 4 ? bestMove.substring(4, 5) : undefined;

        this.makeAction({
          type: "MAKE_MOVE",
          from,
          to,
          promotion,
          playerId: "BOT",
        } as any);
      }
      this.isBotThinking = false;
    }
  }

  // Cleanup worker when game destroyed (optional if we had a destroy method)
  public destroy() {
    super.destroy();
    if (this.stockfishWorker) {
      this.stockfishWorker.terminate();
      this.stockfishWorker = null;
    }
  }
}
