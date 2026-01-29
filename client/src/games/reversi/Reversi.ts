import { BaseGame, type GameAction } from "../BaseGame";
import {
  type ReversiState,
  type ReversiAction,
  type Cell,
  type MoveHistory,
  DIRECTIONS,
} from "./types";
import { runMCTS } from "./mcts";
import type { Player } from "../../stores/roomStore";

export default class Reversi extends BaseGame<ReversiState> {
  getInitState(): ReversiState {
    return {
      board: this.encodeBoard(this.createInitialBoard()),
      players: {
        black: this.players[0],
        white: this.players[1],
      },
      turn: "black", // Black goes first
      winner: null,
      gamePhase: "waiting",
      undoRequest: null,
      moveHistory: [],
      lastMove: null,
      flippedCells: [],
    };
  }

  private encodeBoard(board: Cell[][]): string {
    let encoded = "";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (cell === "black") encoded += "1";
        else if (cell === "white") encoded += "2";
        else encoded += "0";
      }
    }
    return encoded;
  }

  private decodeBoard(encoded: string): Cell[][] {
    const board: Cell[][] = Array(8)
      .fill(null)
      .map(() => Array(8).fill(null));
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8);
      const c = i % 8;
      const val = encoded[i];
      if (val === "1") board[r][c] = "black";
      else if (val === "2") board[r][c] = "white";
      else board[r][c] = null;
    }
    return board;
  }

  private createInitialBoard(): Cell[][] {
    const board: Cell[][] = Array(8)
      .fill(null)
      .map(() => Array(8).fill(null));
    // Center 4 pieces
    board[3][3] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[4][4] = "white";
    return board;
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as ReversiAction;
    if (!this.isHost) return;

    switch (action.type) {
      case "MAKE_MOVE":
        this.handleMakeMove(action.playerId, action.row, action.col);
        break;
      case "PASS":
        this.handlePass(action.playerId);
        break;
      case "START_GAME":
        this.handleStartGame();
        break;
      case "RESET":
        this.reset();
        break;
      case "ADD_BOT":
        this.handleAddBot();
        break;
      case "REMOVE_BOT":
        this.handleRemoveBot();
        break;
      case "REQUEST_UNDO":
        this.handleRequestUndo(action.playerId, action.playerName);
        break;
      case "ACCEPT_UNDO":
        this.handleAcceptUndo();
        break;
      case "DECLINE_UNDO":
        this.handleDeclineUndo();
        break;
    }
  }

  // ============== Game Logic ==============

  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;
    // Need both players
    if (!this.state.players.black?.id || !this.state.players.white?.id) return;

    this.state.gamePhase = "playing";
    this.state.turn = "black";
    this.state.board = this.encodeBoard(this.createInitialBoard());
    this.state.moveHistory = [];
    this.state.winner = null;
    this.state.lastMove = null;

    this.checkBotTurn();
  }

  private handleMakeMove(playerId: string, row: number, col: number): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.turn];
    if (!currentPlayer || currentPlayer.id != playerId) return;

    // Validate move
    const currentTurn = this.state.turn;
    const flips = this.getFlips(row, col, currentTurn);
    if (flips.length === 0) return;

    // Save state for undo
    this.saveHistory();

    // Apply move
    const board = this.decodeBoard(this.state.board);
    board[row][col] = currentTurn;
    for (const [r, c] of flips) {
      board[r][c] = currentTurn;
    }
    this.state.board = this.encodeBoard(board);
    this.state.lastMove = { row, col };
    // Track flipped cells for animation
    this.state.flippedCells = flips.map(([r, c]) => ({ row: r, col: c }));

    // Switch turn
    this.state.turn = currentTurn === "black" ? "white" : "black";

    // Check if next player has valid moves
    const nextMoves = this.getValidMoves(this.state.turn);
    if (nextMoves.length === 0) {
      // Next player has no moves, check if current player has moves
      const currentMoves = this.getValidMoves(currentTurn);
      if (currentMoves.length === 0) {
        // Game over
        this.endGame();
      } else {
        // Skip next player's turn
        this.state.turn = currentTurn;
      }
    }

    this.checkBotTurn();
  }

  private handlePass(playerId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.turn];
    if (!currentPlayer || currentPlayer.id != playerId) return;

    // Can only pass if no valid moves
    const validMoves = this.getValidMoves(this.state.turn);
    if (validMoves.length > 0) return;

    this.state.turn = this.state.turn === "black" ? "white" : "black";

    this.checkBotTurn();
  }

  private endGame(): void {
    this.state.gamePhase = "ended";

    // Count pieces
    let blackCount = 0;
    let whiteCount = 0;
    for (let i = 0; i < 64; i++) {
      if (this.state.board[i] === "1") blackCount++;
      if (this.state.board[i] === "2") whiteCount++;
    }

    if (blackCount > whiteCount) {
      this.state.winner = this.state.players.black?.id || null;
    } else if (whiteCount > blackCount) {
      this.state.winner = this.state.players.white?.id || null;
    } else {
      this.state.winner = "draw";
    }

    this.clearSavedState();
  }

  // ============== Move Validation ==============

  public getValidMoves(color: Cell): [number, number][] {
    const moves: [number, number][] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.getFlips(r, c, color).length > 0) {
          moves.push([r, c]);
        }
      }
    }
    return moves;
  }

  private getFlips(row: number, col: number, color: Cell): [number, number][] {
    const board = this.decodeBoard(this.state.board);
    if (!color || board[row][col] != null) return [];

    const opponent = color === "black" ? "white" : "black";
    const allFlips: [number, number][] = [];

    for (const [dr, dc] of DIRECTIONS) {
      const flips: [number, number][] = [];
      let r = row + dr;
      let c = col + dc;

      // Move in direction while finding opponent pieces
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === opponent) {
        flips.push([r, c]);
        r += dr;
        c += dc;
      }

      // Check if we ended on our own piece
      if (
        r >= 0 &&
        r < 8 &&
        c >= 0 &&
        c < 8 &&
        board[r][c] === color &&
        flips.length > 0
      ) {
        allFlips.push(...flips);
      }
    }

    return allFlips;
  }

  // ============== Undo System ==============

  private saveHistory(): void {
    const history: MoveHistory = {
      b: this.state.board,
      t: this.state.turn,
    };
    this.state.moveHistory.push(history);

    // Keep max 5 moves
    if (this.state.moveHistory.length > 5) {
      this.state.moveHistory.shift();
    }
  }

  private handleRequestUndo(playerId: string, playerName: string): void {
    if (this.state.gamePhase !== "playing") return;
    if (Object.keys(this.state.moveHistory).length === 0) return;
    if (this.state.undoRequest) return;

    // Find opponent - if bot, apply undo directly
    const playerColor = this.state.turn;
    const opponentColor = playerColor === "black" ? "white" : "black";
    const opponent = this.state.players[opponentColor];

    if (opponent?.isBot) {
      // Direct undo when playing against bot
      this.applyUndo();
    } else {
      // Request undo from human opponent
      this.state.undoRequest = { fromId: playerId, fromName: playerName };
    }
  }

  private handleAcceptUndo(): void {
    if (!this.state.undoRequest) return;
    this.applyUndo();
  }

  private applyUndo(): void {
    if (this.state.moveHistory.length === 0) return;

    const lastState = this.state.moveHistory.pop()!;
    this.state.board = lastState.b;
    this.state.turn = lastState.t;
    this.state.undoRequest = null;
    this.state.lastMove = null;
  }

  private handleDeclineUndo(): void {
    this.state.undoRequest = null;
  }

  // ============== Bot AI ==============

  private handleAddBot(): void {
    // if (this.state.gamePhase !== "waiting") return;
    if (this.state.players.white?.id) return; // Slot taken

    this.state.players.white = {
      id: `BOT_${Date.now()}`,
      username: "Bot",
      isHost: false,
      isBot: true,
    };
  }

  private handleRemoveBot(): void {
    // if (this.state.gamePhase !== "waiting") return;
    if (!this.state.players.white?.isBot) return;

    this.state.players.white = null;
  }

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.turn];
    if (currentPlayer?.isBot && currentPlayer.id) {
      setTimeout(() => this.makeBotMove(currentPlayer.id!), 800);
    }
  }

  private makeBotMove(botId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.turn];
    if (currentPlayer?.id != botId) return;

    const validMoves = this.getValidMoves(this.state.turn);
    if (validMoves.length === 0) {
      this.handlePass(botId);
      return;
    }

    // Use MCTS to find best move (500ms timeout)
    const playerIndex = this.state.turn === "black" ? 0 : 1;
    const board = this.decodeBoard(this.state.board);
    const mctsMove = runMCTS(board, playerIndex as 0 | 1, 500);

    if (mctsMove) {
      this.handleMakeMove(botId, mctsMove[0], mctsMove[1]);
    } else {
      // Fallback: random move
      const randomMove =
        validMoves[Math.floor(Math.random() * validMoves.length)];
      this.handleMakeMove(botId, randomMove[0], randomMove[1]);
    }
  }

  // ============== Public API ==============

  requestMove(row: number, col: number): void {
    const action: ReversiAction = {
      type: "MAKE_MOVE",
      playerId: this.userId,
      row,
      col,
    };
    this.makeAction(action);
  }

  requestPass(): void {
    const action: ReversiAction = { type: "PASS", playerId: this.userId };
    this.makeAction(action);
  }

  requestStartGame(): void {
    const action: ReversiAction = { type: "START_GAME" };
    this.makeAction(action);
  }

  requestAddBot(): void {
    const action: ReversiAction = { type: "ADD_BOT" };
    this.makeAction(action);
  }

  requestRemoveBot(): void {
    const action: ReversiAction = { type: "REMOVE_BOT" };
    this.makeAction(action);
  }

  requestUndo(): void {
    const player =
      this.state.players.black?.id === this.userId
        ? this.state.players.black
        : this.state.players.white;
    const action: ReversiAction = {
      type: "REQUEST_UNDO",
      playerId: this.userId,
      playerName: player?.username || "Player",
    };
    this.makeAction(action);
  }

  acceptUndo(): void {
    const action: ReversiAction = { type: "ACCEPT_UNDO" };
    this.makeAction(action);
  }

  declineUndo(): void {
    const action: ReversiAction = { type: "DECLINE_UNDO" };
    this.makeAction(action);
  }

  requestNewGame(): void {
    const action: ReversiAction = { type: "RESET" };
    this.makeAction(action);
  }

  reset(): void {
    this.state = {
      ...this.state,
      board: this.encodeBoard(this.createInitialBoard()),
      turn: "black",
      winner: null,
      gamePhase: "waiting",
      undoRequest: null,
      moveHistory: [],
      lastMove: null,
    };
  }

  updatePlayers(players: Player[]): void {
    if (this.state.gamePhase !== "waiting") {
      return;
    }

    // Slot 0 (Host)
    this.state.players.black = players[0];
    // Slot 1 (Guest or Bot)
    this.state.players.white = players[1];
  }

  // ============== Helper Methods ==============

  getMyColor(): "black" | "white" | null {
    if (this.state.players.black?.id === this.userId) return "black";
    if (this.state.players.white?.id === this.userId) return "white";
    return null;
  }

  getMyPlayerIndex(): number {
    return this.getMyColor() === "black" ? 0 : 1;
  }

  canStartGame(): boolean {
    return this.state.players.black != null && this.state.players.white != null;
  }

  getPieceCount(): { black: number; white: number } {
    let black = 0;
    let white = 0;
    for (let i = 0; i < 64; i++) {
      if (this.state.board[i] === "1") black++;
      if (this.state.board[i] === "2") white++;
    }
    return { black, white };
  }
}
