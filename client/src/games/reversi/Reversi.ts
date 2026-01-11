import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import type { Socket } from "socket.io-client";
import {
  type ReversiState,
  type ReversiAction,
  type Cell,
  type MoveHistory,
  DIRECTIONS,
} from "./types";
import { runMCTS } from "./mcts";

export default class Reversi extends BaseGame {
  private state: ReversiState;
  private onStateChange?: (state: ReversiState) => void;

  constructor(
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    players: { id: string; username: string }[]
  ) {
    super(roomId, socket, isHost, userId);

    // Initialize with 2 player slots
    this.state = {
      board: this.createInitialBoard(),
      players: [
        {
          id: players[0]?.id || null,
          username: players[0]?.username || "Player 1",
          color: "black",
          isBot: false,
        },
        {
          id: players[1]?.id || null,
          username: players[1]?.username || "Player 2",
          color: "white",
          isBot: false,
        },
      ],
      currentPlayerIndex: 0, // Black goes first
      winner: null,
      gamePhase: "waiting",
      undoRequest: null,
      moveHistory: [],
      lastMove: null,
      flippedCells: [],
    };

    this.init();
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

  init(): void {
    if (this.isHost) {
      this.broadcastState();
    }
  }

  onUpdate(callback: (state: ReversiState) => void): void {
    this.onStateChange = callback;
  }

  getState(): ReversiState {
    return { ...this.state };
  }

  setState(state: ReversiState): void {
    this.state = state;
    this.onStateChange?.(this.state);
  }

  handleAction(data: { action: GameAction }): void {
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
      case "REQUEST_SYNC":
        // Host sends current state to all clients
        this.broadcastState();
        break;
    }
  }

  makeMove(action: ReversiAction): void {
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  // ============== Game Logic ==============

  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;
    // Need both players
    if (!this.state.players[0].id || !this.state.players[1].id) return;

    this.state.gamePhase = "playing";
    this.state.currentPlayerIndex = 0;
    this.state.board = this.createInitialBoard();
    this.state.moveHistory = [];
    this.state.winner = null;
    this.state.lastMove = null;

    this.broadcastState();
    this.setState({ ...this.state });
    this.checkBotTurn();
  }

  private handleMakeMove(playerId: string, row: number, col: number): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return;

    // Validate move
    const flips = this.getFlips(row, col, currentPlayer.color);
    if (flips.length === 0) return;

    // Save state for undo
    this.saveHistory();

    // Apply move
    this.state.board[row][col] = currentPlayer.color;
    for (const [r, c] of flips) {
      this.state.board[r][c] = currentPlayer.color;
    }
    this.state.lastMove = { row, col };
    // Track flipped cells for animation
    this.state.flippedCells = flips.map(([r, c]) => ({ row: r, col: c }));

    // Switch turn
    this.state.currentPlayerIndex = 1 - this.state.currentPlayerIndex;

    // Check if next player has valid moves
    const nextPlayer = this.state.players[this.state.currentPlayerIndex];
    const nextMoves = this.getValidMoves(nextPlayer.color);
    if (nextMoves.length === 0) {
      // Next player has no moves, check if current player has moves
      const currentMoves = this.getValidMoves(currentPlayer.color);
      if (currentMoves.length === 0) {
        // Game over
        this.endGame();
      } else {
        // Skip next player's turn
        this.state.currentPlayerIndex = 1 - this.state.currentPlayerIndex;
      }
    }

    this.broadcastState();
    this.setState({ ...this.state });
    this.checkBotTurn();
  }

  private handlePass(playerId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return;

    // Can only pass if no valid moves
    const validMoves = this.getValidMoves(currentPlayer.color);
    if (validMoves.length > 0) return;

    this.state.currentPlayerIndex = 1 - this.state.currentPlayerIndex;

    this.broadcastState();
    this.setState({ ...this.state });
    this.checkBotTurn();
  }

  private endGame(): void {
    this.state.gamePhase = "ended";

    // Count pieces
    let blackCount = 0;
    let whiteCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.state.board[r][c] === "black") blackCount++;
        if (this.state.board[r][c] === "white") whiteCount++;
      }
    }

    if (blackCount > whiteCount) {
      this.state.winner = this.state.players[0].id;
    } else if (whiteCount > blackCount) {
      this.state.winner = this.state.players[1].id;
    } else {
      this.state.winner = "draw";
    }

    this.broadcastGameEnd({ winner: this.state.winner ?? undefined });
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
    if (!color || this.state.board[row][col] !== null) return [];

    const opponent = color === "black" ? "white" : "black";
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
        this.state.board[r][c] === opponent
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
        this.state.board[r][c] === color &&
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
      board: this.state.board.map((row) => [...row]),
      currentPlayerIndex: this.state.currentPlayerIndex,
    };
    this.state.moveHistory.push(history);
    // Keep max 10 moves
    if (this.state.moveHistory.length > 10) {
      this.state.moveHistory.shift();
    }
  }

  private handleRequestUndo(playerId: string, playerName: string): void {
    if (this.state.gamePhase !== "playing") return;
    if (this.state.moveHistory.length === 0) return;
    if (this.state.undoRequest) return;

    // Find opponent - if bot, apply undo directly
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    const opponentIndex = 1 - playerIndex;
    const opponent = this.state.players[opponentIndex];

    if (opponent?.isBot) {
      // Direct undo when playing against bot
      this.applyUndo();
    } else {
      // Request undo from human opponent
      this.state.undoRequest = { fromId: playerId, fromName: playerName };
      this.broadcastState();
      this.setState({ ...this.state });
    }
  }

  private handleAcceptUndo(): void {
    if (!this.state.undoRequest) return;
    this.applyUndo();
  }

  private applyUndo(): void {
    if (this.state.moveHistory.length === 0) return;

    const lastState = this.state.moveHistory.pop()!;
    this.state.board = lastState.board;
    this.state.currentPlayerIndex = lastState.currentPlayerIndex;
    this.state.undoRequest = null;
    this.state.lastMove = null;

    this.broadcastState();
    this.setState({ ...this.state });
  }

  private handleDeclineUndo(): void {
    this.state.undoRequest = null;
    this.broadcastState();
    this.setState({ ...this.state });
  }

  // ============== Bot AI ==============

  private handleAddBot(): void {
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players[1].id) return; // Slot taken

    this.state.players[1] = {
      id: `BOT_${Date.now()}`,
      username: "Bot",
      color: "white",
      isBot: true,
    };

    this.broadcastState();
    this.setState({ ...this.state });
  }

  private handleRemoveBot(): void {
    if (this.state.gamePhase !== "waiting") return;
    if (!this.state.players[1].isBot) return;

    this.state.players[1] = {
      id: null,
      username: "Player 2",
      color: "white",
      isBot: false,
    };

    this.broadcastState();
    this.setState({ ...this.state });
  }

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.isBot && currentPlayer.id) {
      setTimeout(() => this.makeBotMove(currentPlayer.id!), 800);
    }
  }

  private makeBotMove(botId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== botId) return;

    const validMoves = this.getValidMoves(currentPlayer.color);
    if (validMoves.length === 0) {
      this.handlePass(botId);
      return;
    }

    // Use MCTS to find best move (500ms timeout)
    const playerIndex = currentPlayer.color === "black" ? 0 : 1;
    const mctsMove = runMCTS(this.state.board, playerIndex as 0 | 1, 500);

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
    this.makeMove(action);
  }

  requestPass(): void {
    const action: ReversiAction = { type: "PASS", playerId: this.userId };
    this.makeMove(action);
  }

  requestStartGame(): void {
    const action: ReversiAction = { type: "START_GAME" };
    this.makeMove(action);
  }

  requestAddBot(): void {
    const action: ReversiAction = { type: "ADD_BOT" };
    this.makeMove(action);
  }

  requestRemoveBot(): void {
    const action: ReversiAction = { type: "REMOVE_BOT" };
    this.makeMove(action);
  }

  requestUndo(): void {
    const player = this.state.players.find((p) => p.id === this.userId);
    const action: ReversiAction = {
      type: "REQUEST_UNDO",
      playerId: this.userId,
      playerName: player?.username || "Player",
    };
    this.makeMove(action);
  }

  acceptUndo(): void {
    const action: ReversiAction = { type: "ACCEPT_UNDO" };
    this.makeMove(action);
  }

  declineUndo(): void {
    const action: ReversiAction = { type: "DECLINE_UNDO" };
    this.makeMove(action);
  }

  requestSync(): void {
    const action: ReversiAction = { type: "REQUEST_SYNC" };
    if (this.isHost) {
      this.broadcastState();
    } else {
      this.sendAction(action);
    }
  }

  requestNewGame(): void {
    const action: ReversiAction = { type: "RESET" };
    this.makeMove(action);
  }

  reset(): void {
    this.state = {
      ...this.state,
      board: this.createInitialBoard(),
      currentPlayerIndex: 0,
      winner: null,
      gamePhase: "waiting",
      undoRequest: null,
      moveHistory: [],
      lastMove: null,
    };

    this.broadcastState();
    this.setState({ ...this.state });
  }

  checkGameEnd(): GameResult | null {
    if (this.state.winner) {
      return { winner: this.state.winner };
    }
    return null;
  }

  updatePlayers(players: { id: string; username: string }[]): void {
    if (this.state.gamePhase !== "waiting") return;

    for (let i = 0; i < Math.min(players.length, 2); i++) {
      if (!this.state.players[i].isBot) {
        this.state.players[i].id = players[i]?.id || null;
        this.state.players[i].username =
          players[i]?.username || `Player ${i + 1}`;
      }
    }

    this.broadcastState();
    this.setState({ ...this.state });
  }

  // ============== Helper Methods ==============

  getMyPlayerIndex(): number {
    return this.state.players.findIndex((p) => p.id === this.userId);
  }

  canStartGame(): boolean {
    return (
      this.state.players[0].id !== null && this.state.players[1].id !== null
    );
  }

  getPieceCount(): { black: number; white: number } {
    let black = 0;
    let white = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.state.board[r][c] === "black") black++;
        if (this.state.board[r][c] === "white") white++;
      }
    }
    return { black, white };
  }
}
