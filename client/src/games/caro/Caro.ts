import type { Player } from "../../stores/roomStore";
import { BaseGame, type GameAction } from "../BaseGame";
import { type CaroState, type CaroAction } from "./types";

const BOARD_SIZE = 50;

export default class Caro extends BaseGame<CaroState> {
  getInitState(): CaroState {
    return {
      board: {},
      currentTurn: "X",
      winner: null,
      winningLine: null,
      isDraw: false,
      players: {
        X: this.players[0],
        O: this.players[1],
      },
      gameOver: false,
      history: [],
      lastMove: null,
      pendingUndoRequest: null,
      gamePhase: "waiting",
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as CaroAction;

    if (this.isHost) {
      switch (action.type) {
        case "MAKE_MOVE":
          this.makeMove(action);
          break;
        case "UNDO_REQUEST":
          this.handleUndoRequest(action.playerId);
          break;
        case "UNDO_RESPONSE":
          this.handleUndoResponse(action.accepted);
          break;
        case "SWITCH_TURN":
          this.handleSwitchTurn();
          break;
        case "RESET_GAME":
          this.reset();
          break;
        case "START_GAME":
          this.handleStartGame();
          break;
      }
    }
  }

  makeMove(action: GameAction): void {
    const { row, col, playerId } = action as {
      row: number;
      col: number;
      playerId: string;
    };

    if (this.state.gamePhase !== "playing") return;
    if (this.state.gameOver) return;
    const key = `${row},${col}`;
    if (this.state.board[key]) return;

    const playerSymbol = this.getPlayerSymbolInternal(playerId);
    if (!playerSymbol || playerSymbol !== this.state.currentTurn) return;

    // Apply move
    this.state.board[key] = playerSymbol;
    this.state.history.push(key);
    this.state.pendingUndoRequest = null; // Clear any pending undo

    // Check win
    const win = this.checkWin(row, col, playerSymbol);
    if (win) {
      this.state.winner = playerSymbol;
      this.state.winningLine = win;
      this.state.gameOver = true;
      this.clearSavedState();
    } else {
      this.state.currentTurn = playerSymbol === "X" ? "O" : "X";
    }

    this.checkBotTurn();
  }

  reset(): void {
    this.state.board = {};
    this.state.currentTurn = "X";
    this.state.winner = null;
    this.state.winningLine = null;
    this.state.isDraw = false;
    this.state.gameOver = false;
    this.state.history = [];
    this.state.lastMove = null;
    this.state.pendingUndoRequest = null;
    this.state.gamePhase = "waiting";
  }

  updatePlayers(players: Player[]): void {
    const x = players[0] || null;
    let o = players[1] || null;

    if (o?.isBot || !o) {
      o = {
        id: "BOT",
        username: "Bot",
        isHost: false,
        isBot: true,
      };
    }

    this.state.players.X = x;
    this.state.players.O = o;
  }
  // --- Helpers ---

  private checkWin(
    row: number,
    col: number,
    symbol: "X" | "O",
  ): [number, number][] | null {
    const directions = [
      [0, 1], // Horizontal
      [1, 0], // Vertical
      [1, 1], // Diagonal \
      [1, -1], // Diagonal /
    ];

    for (const [dr, dc] of directions) {
      const line: [number, number][] = [[row, col]];

      // Check forward
      let r = row + dr;
      let c = col + dc;
      while (
        r >= 0 &&
        r < BOARD_SIZE &&
        c >= 0 &&
        c < BOARD_SIZE &&
        this.state.board[`${r},${c}`] === symbol
      ) {
        line.push([r, c]);
        r += dr;
        c += dc;
      }

      // Check backward
      r = row - dr;
      c = col - dc;
      while (
        r >= 0 &&
        r < BOARD_SIZE &&
        c >= 0 &&
        c < BOARD_SIZE &&
        this.state.board[`${r},${c}`] === symbol
      ) {
        line.push([r, c]);
        r -= dr;
        c -= dc;
      }

      if (line.length >= 5) {
        return line;
      }
    }
    return null;
  }

  private getPlayerSymbolInternal(playerId: string): "X" | "O" | null {
    if (this.state.players.X?.id === playerId) return "X";
    if (this.state.players.O?.id === playerId) return "O";
    return null;
  }

  public getPlayerSymbol(): "X" | "O" | null {
    return this.getPlayerSymbolInternal(this.userId);
  }

  // --- Client Actions ---

  requestMove(row: number, col: number): void {
    const action: CaroAction = {
      type: "MAKE_MOVE",
      row,
      col,
      playerId: this.userId,
    };
    this.isHost ? this.makeMove(action) : this.sendSocketGameAction(action);
  }

  requestUndo(): void {
    const action: CaroAction = { type: "UNDO_REQUEST", playerId: this.userId };
    this.isHost
      ? this.handleUndoRequest(this.userId)
      : this.sendSocketGameAction(action);
  }

  responseUndo(accepted: boolean): void {
    const action: CaroAction = { type: "UNDO_RESPONSE", accepted };
    this.isHost
      ? this.handleUndoResponse(accepted)
      : this.sendSocketGameAction(action);
  }

  switchTurn(): void {
    const action: CaroAction = { type: "SWITCH_TURN" };
    this.isHost ? this.handleSwitchTurn() : this.sendSocketGameAction(action);
  }

  requestReset(): void {
    const action: CaroAction = { type: "RESET_GAME" };
    this.isHost ? this.reset() : this.sendSocketGameAction(action);
  }

  // --- Host Handlers ---

  private handleUndoRequest(playerId: string): void {
    if (this.state.history.length === 0) return;

    // Auto-undo if only one move made
    /* Actually prompt logic says: "Request Undo button - only show when opponent just moved"
       Strictly speaking, one requests undo for the opponent's last move?
       Or their own last move?

       Common implementation: Undo undoes the last move (usually opponent's move if it's my turn).
       BUT usually people undo their OWN bad move.
       If it is My Turn, I haven't moved yet. The last move was Opponent.
       If I request undo, I am asking Opponent to take back their move?
       Or did I just make a move, and now it is Opponent's turn, and I request undo?

       User prompt UI Logic:
       `!isMyTurn && !pendingUndoRequest` -> Show Undo Button.
       This means I just moved (so it's NOT my turn), and I want to undo.

       So logic:
       Player A moves. Turn becomes Player B.
       Player A sees "Undo" button.
       Player A requests undo.
       Player B sees "Opponent is requesting to undo their last move".
    */

    const lastKey = this.state.history[this.state.history.length - 1];
    const lastSymbol = this.state.board[lastKey];
    const requesterSymbol = this.getPlayerSymbolInternal(playerId);

    // Can only request undo if you made the last move
    if (lastSymbol !== requesterSymbol) return;

    this.state.pendingUndoRequest = playerId;
  }

  private handleUndoResponse(accepted: boolean): void {
    if (!accepted) {
      this.state.pendingUndoRequest = null;
    } else {
      // Undo the last move
      const lastKey = this.state.history.pop();
      if (lastKey) {
        delete this.state.board[lastKey];
        // Switch turn back
        this.state.currentTurn = this.state.currentTurn === "X" ? "O" : "X";
        this.state.gameOver = false;
        this.state.winner = null;
        this.state.winningLine = null;
      }
      this.state.pendingUndoRequest = null;
    }
  }

  private handleSwitchTurn(): void {
    if (this.state.gameOver) return;
    if (this.state.history.length > 0) return;

    this.state.currentTurn = this.state.currentTurn === "X" ? "O" : "X";
  }

  // --- Bot Logic ---

  addBot(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;
    this.state.players.O = {
      id: "BOT",
      username: "Bot",
      isHost: false,
      isBot: true,
    };
  }

  removeBot(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;
    if (!this.state.players.O?.isBot) return;

    this.state.players.O = null;
  }

  // Start Game
  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;
    if (!this.state.players.X || !this.state.players.O) return;

    this.state.gamePhase = "playing";

    // Check if bot goes first
    this.checkBotTurn();
  }

  startGame(): void {
    if (this.isHost) {
      this.handleStartGame();
    } else {
      this.sendSocketGameAction({ type: "START_GAME" });
    }
  }

  canStartGame(): boolean {
    return (
      !!this.state.players.X &&
      !!this.state.players.O &&
      this.state.gamePhase === "waiting"
    );
  }

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer =
      this.state.currentTurn === "X"
        ? this.state.players.X
        : this.state.players.O;

    if (currentPlayer?.isBot && !this.state.gameOver) {
      setTimeout(() => this.makeBotMove(), 600);
    }
  }

  private makeBotMove(): void {
    if (this.state.gameOver) return;

    const bestMove = this.getBestMove();
    if (bestMove) {
      this.makeMove({
        type: "MAKE_MOVE",
        row: bestMove.row,
        col: bestMove.col,
        playerId: "BOT",
      });
    }
  }

  private getBestMove(): { row: number; col: number } | null {
    const moves = this.getCandidateMoves();
    if (moves.length === 0) {
      // First move usually at center
      return {
        row: Math.floor(BOARD_SIZE / 2),
        col: Math.floor(BOARD_SIZE / 2),
      };
    }

    let bestScore = -Infinity;
    let bestMoves: { row: number; col: number }[] = [];

    // Bot is 'O' (usually), Player is 'X'
    const botSymbol = "O";
    const playerSymbol = "X";

    for (const move of moves) {
      const { row, col } = move;
      const score = this.evaluateMove(row, col, botSymbol, playerSymbol);

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    if (bestMoves.length > 0) {
      const randomIndex = Math.floor(Math.random() * bestMoves.length);
      return bestMoves[randomIndex];
    }

    return null;
  }

  private getCandidateMoves(): { row: number; col: number }[] {
    const candidates = new Set<string>();
    const takenKeys = Object.keys(this.state.board);

    // If board empty, return empty list (handled in getBestMove)
    if (takenKeys.length === 0) return [];

    const directions = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ];

    // Look at neighbors of all existing pieces
    for (const key of takenKeys) {
      const [r, c] = key.split(",").map(Number);
      for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        if (
          nr >= 0 &&
          nr < BOARD_SIZE &&
          nc >= 0 &&
          nc < BOARD_SIZE &&
          !this.state.board[`${nr},${nc}`]
        ) {
          candidates.add(`${nr},${nc}`);
        }
      }
    }

    return Array.from(candidates).map((key) => {
      const [row, col] = key.split(",").map(Number);
      return { row, col };
    });
  }

  private evaluateMove(
    row: number,
    col: number,
    botSymbol: string,
    playerSymbol: string,
  ): number {
    // Simple heuristic:
    // Score based on creating own lines vs blocking opponent lines
    let score = 0;

    // Favor center logic slightly to break ties
    // score += (1 - Math.abs(row - BOARD_SIZE/2) / BOARD_SIZE) * 1;

    // Check all 4 directions
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dr, dc] of directions) {
      // Analyze lines created by Bot if it moves here
      score += this.evaluateLine(row, col, dr, dc, botSymbol, true);
      // Analyze lines created by Player if they moved here (Blocking value)
      score += this.evaluateLine(row, col, dr, dc, playerSymbol, false);
    }

    return score;
  }

  private evaluateLine(
    row: number,
    col: number,
    dr: number,
    dc: number,
    symbol: string,
    isAttack: boolean,
  ): number {
    let consecutive = 0;
    let openEnds = 0;

    // Check forward
    let r = row + dr;
    let c = col + dc;
    while (this.state.board[`${r},${c}`] === symbol) {
      consecutive++;
      r += dr;
      c += dc;
    }
    if (
      r >= 0 &&
      r < BOARD_SIZE &&
      c >= 0 &&
      c < BOARD_SIZE &&
      !this.state.board[`${r},${c}`]
    ) {
      openEnds++;
    }

    // Check backward
    r = row - dr;
    c = col - dc;
    while (this.state.board[`${r},${c}`] === symbol) {
      consecutive++;
      r -= dr;
      c -= dc;
    }
    if (
      r >= 0 &&
      r < BOARD_SIZE &&
      c >= 0 &&
      c < BOARD_SIZE &&
      !this.state.board[`${r},${c}`]
    ) {
      openEnds++;
    }

    // Current cell counts as 1
    const count = consecutive + 1;

    // Scoring weights
    if (count >= 5) return 100000; // Win
    if (count === 4) {
      if (openEnds === 2) return 10000; // Unstoppable win
      if (openEnds === 1) return isAttack ? 1000 : 2000; // Win next or Block must
    }
    if (count === 3) {
      if (openEnds === 2) return isAttack ? 500 : 1000; // Create open 4 or Block open 4
      if (openEnds === 1) return 100;
    }
    if (count === 2 && openEnds === 2) return 10;

    return count;
  }
}
