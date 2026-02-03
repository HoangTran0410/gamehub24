import { BaseGame, type GameAction } from "../BaseGame";
import {
  type ReversiState,
  type ReversiAction,
  type MoveHistory,
  ReversiColor,
  ReversiGamePhase,
  ReversiPlayerFlag,
  DIRECTIONS,
} from "./types";
import { runMCTS } from "./mcts";
import type { Player } from "../../stores/roomStore";
import { hasFlag } from "../../utils";

export default class Reversi extends BaseGame<ReversiState> {
  getInitState(): ReversiState {
    return {
      board: this.encodeInitialBoard(),
      players: {
        black: this.preparePlayer(this.players[0]),
        white: this.preparePlayer(this.players[1]),
      },
      turn: ReversiColor.BLACK,
      winner: null,
      gamePhase: ReversiGamePhase.WAITING,
      undoRequest: null,
      moveHistory: [],
      lastMove: null,
      flippedCells: [],
    };
  }

  private preparePlayer(player: Player | null) {
    if (!player) return null;
    return {
      ...player,
      flags: player.isBot ? ReversiPlayerFlag.BOT : 0,
    };
  }

  private encodeInitialBoard(): string {
    const board = Array(64).fill("0");
    // Center 4 pieces: (3,3)=W, (3,4)=B, (4,3)=B, (4,4)=W
    board[3 * 8 + 3] = "2"; // White
    board[3 * 8 + 4] = "1"; // Black
    board[4 * 8 + 3] = "1"; // Black
    board[4 * 8 + 4] = "2"; // White
    return board.join("");
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
    if (this.state.gamePhase !== ReversiGamePhase.WAITING) return;
    // Need both players
    if (!this.state.players.black?.id || !this.state.players.white?.id) return;

    this.state.gamePhase = ReversiGamePhase.PLAYING;
    this.state.turn = ReversiColor.BLACK;
    this.state.board = this.encodeInitialBoard();
    this.state.moveHistory = [];
    this.state.winner = null;
    this.state.lastMove = null;
    this.state.flippedCells = [];

    this.checkBotTurn();
  }

  private handleMakeMove(playerId: string, row: number, col: number): void {
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const currentTurn = this.state.turn;
    const currentPlayer =
      currentTurn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;

    if (!currentPlayer || currentPlayer.id !== playerId) return;

    // Validate move
    const flips = this.getFlips(row, col, currentTurn);
    if (flips.length === 0) return;

    // Save state for undo
    this.saveHistory();

    // Apply move
    const boardArr = this.state.board.split("");
    const pieceVal = currentTurn === ReversiColor.BLACK ? "1" : "2";

    boardArr[row * 8 + col] = pieceVal;
    for (const [r, c] of flips) {
      boardArr[r * 8 + c] = pieceVal;
    }

    this.state.board = boardArr.join("");
    this.state.lastMove = row * 8 + col;
    this.state.flippedCells = flips.map(([r, c]) => r * 8 + c);

    // Switch turn
    const nextTurn =
      currentTurn === ReversiColor.BLACK
        ? ReversiColor.WHITE
        : ReversiColor.BLACK;
    this.state.turn = nextTurn;

    // Check if next player has valid moves
    const nextMoves = this.getValidMoves(nextTurn);
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
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const currentTurn = this.state.turn;
    const currentPlayer =
      currentTurn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;

    if (!currentPlayer || currentPlayer.id !== playerId) return;

    // Can only pass if no valid moves
    const validMoves = this.getValidMoves(currentTurn);
    if (validMoves.length > 0) return;

    this.state.turn =
      currentTurn === ReversiColor.BLACK
        ? ReversiColor.WHITE
        : ReversiColor.BLACK;

    this.checkBotTurn();
  }

  private endGame(): void {
    this.state.gamePhase = ReversiGamePhase.ENDED;

    // Count pieces
    let blackCount = 0;
    let whiteCount = 0;
    for (let i = 0; i < 64; i++) {
      if (this.state.board[i] === "1") blackCount++;
      else if (this.state.board[i] === "2") whiteCount++;
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

  public getValidMoves(color: ReversiColor): [number, number][] {
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

  private getFlips(
    row: number,
    col: number,
    color: ReversiColor,
  ): [number, number][] {
    if (this.state.board[row * 8 + col] !== "0") return [];

    const pieceVal = color === ReversiColor.BLACK ? "1" : "2";
    const opponentVal = color === ReversiColor.BLACK ? "2" : "1";
    const allFlips: [number, number][] = [];

    for (const [dr, dc] of DIRECTIONS) {
      const flips: [number, number][] = [];
      let r = row + dr;
      let c = col + dc;

      // Move in direction while finding opponent pieces
      while (
        r >= 0 &&
        r < 8 &&
        c >= 0 &&
        c < 8 &&
        this.state.board[r * 8 + c] === opponentVal
      ) {
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
        this.state.board[r * 8 + c] === pieceVal &&
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
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;
    if (this.state.moveHistory.length === 0) return;
    if (this.state.undoRequest) return;

    // Find opponent - if bot, apply undo directly
    const playerColor = this.state.turn;
    const opponentColor =
      playerColor === ReversiColor.BLACK
        ? ReversiColor.WHITE
        : ReversiColor.BLACK;
    const opponent =
      opponentColor === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;

    if (opponent && hasFlag(opponent.flags, ReversiPlayerFlag.BOT)) {
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
    this.state.flippedCells = [];
  }

  private handleDeclineUndo(): void {
    this.state.undoRequest = null;
  }

  // ============== Bot AI ==============

  private handleAddBot(): void {
    if (this.state.players.white?.id) return; // Slot taken

    this.state.players.white = {
      id: `BOT_${Date.now()}`,
      username: "Bot",
      isHost: false,
      isBot: true,
      flags: ReversiPlayerFlag.BOT,
    };
  }

  private handleRemoveBot(): void {
    if (
      !this.state.players.white ||
      !hasFlag(this.state.players.white.flags, ReversiPlayerFlag.BOT)
    )
      return;

    this.state.players.white = null;
  }

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const currentPlayer =
      this.state.turn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;
    if (
      currentPlayer &&
      hasFlag(currentPlayer.flags, ReversiPlayerFlag.BOT) &&
      currentPlayer.id
    ) {
      setTimeout(() => this.makeBotMove(currentPlayer.id!), 800);
    }
  }

  private makeBotMove(botId: string): void {
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const turn = this.state.turn;
    const currentPlayer =
      turn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;
    if (currentPlayer?.id != botId) return;

    const validMoves = this.getValidMoves(turn);
    if (validMoves.length === 0) {
      this.handlePass(botId);
      return;
    }

    // Use MCTS to find best move (500ms timeout)
    const playerIndex = turn === ReversiColor.BLACK ? 0 : 1;
    // Decode board for MCTS
    const board: (null | "black" | "white")[][] = Array(8)
      .fill(null)
      .map(() => Array(8).fill(null));
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8);
      const c = i % 8;
      if (this.state.board[i] === "1") board[r][c] = "black";
      else if (this.state.board[i] === "2") board[r][c] = "white";
    }

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
    this.state.board = this.encodeInitialBoard();
    this.state.turn = ReversiColor.BLACK;
    this.state.winner = null;
    this.state.gamePhase = ReversiGamePhase.WAITING;
    this.state.undoRequest = null;
    this.state.moveHistory = [];
    this.state.lastMove = null;
    this.state.flippedCells = [];
  }

  updatePlayers(players: Player[]): void {
    if (this.state.gamePhase !== ReversiGamePhase.WAITING) {
      return;
    }

    // Slot 0 (Black/Host)
    this.state.players.black = this.preparePlayer(players[0]);
    // Slot 1 (White/Guest or Bot)
    if (
      !this.state.players.white ||
      !hasFlag(this.state.players.white.flags, ReversiPlayerFlag.BOT)
    ) {
      this.state.players.white = this.preparePlayer(players[1]);
    }
  }

  // ============== Helper Methods ==============

  getMyColor(): ReversiColor | null {
    if (this.state.players.black?.id === this.userId) return ReversiColor.BLACK;
    if (this.state.players.white?.id === this.userId) return ReversiColor.WHITE;
    return null;
  }

  getMyPlayerIndex(): number {
    const color = this.getMyColor();
    return color === ReversiColor.BLACK
      ? 0
      : color === ReversiColor.WHITE
        ? 1
        : -1;
  }

  canStartGame(): boolean {
    return this.state.players.black != null && this.state.players.white != null;
  }

  getPieceCount(): { black: number; white: number } {
    let black = 0;
    let white = 0;
    for (let i = 0; i < 64; i++) {
      if (this.state.board[i] === "1") black++;
      else if (this.state.board[i] === "2") white++;
    }
    return { black, white };
  }
}
