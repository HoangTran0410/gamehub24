import { BaseGame, type GameAction } from "../BaseGame";
import {
  type Connect4State,
  type Connect4Action,
  type Cell,
  type MoveHistory,
  ROWS,
  COLS,
  WIN_LENGTH,
} from "./types";

export default class Connect4 extends BaseGame<Connect4State> {
  getInitState(): Connect4State {
    return {
      board: this.createEmptyBoard(),
      players: [
        {
          id: this.players[0]?.id || null,
          username: this.players[0]?.username || "Player 1",
          color: "red",
          isBot: false,
        },
        {
          id: this.players[1]?.id || null,
          username: this.players[1]?.username || "Player 2",
          color: "yellow",
          isBot: false,
        },
      ],
      currentPlayerIndex: 0, // Red goes first
      winner: null,
      gamePhase: "waiting",
      undoRequest: null,
      moveHistory: {},
      lastMove: null,
      winningCells: [],
    };
  }

  private createEmptyBoard(): Cell[][] {
    return Array(ROWS)
      .fill(null)
      .map(() => Array(COLS).fill(null));
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as Connect4Action;
    if (!this.isHost) return;

    switch (action.type) {
      case "MAKE_MOVE":
        this.handleMakeMove(action.playerId, action.col);
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
    if (!this.state.players[0].id || !this.state.players[1].id) return;

    this.state.gamePhase = "playing";
    this.state.currentPlayerIndex = 0;
    this.state.board = this.createEmptyBoard();
    this.state.moveHistory = {};
    this.state.winner = null;
    this.state.lastMove = null;
    this.state.winningCells = [];

    this.checkBotTurn();
  }

  private handleMakeMove(playerId: string, col: number): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return;

    // Find the lowest empty row in this column
    const row = this.getLowestEmptyRow(col);
    if (row === -1) return; // Column is full

    // Save state for undo
    this.saveHistory();

    // Apply move
    this.state.board[row][col] = currentPlayer.color;
    this.state.lastMove = { row, col };

    // Check for win
    const winningCells = this.checkWin(row, col, currentPlayer.color);
    if (winningCells.length > 0) {
      this.state.winningCells = winningCells;
      this.state.winner = playerId;
      this.state.gamePhase = "ended";
      this.clearSavedState();
    } else if (this.isBoardFull()) {
      // Draw
      this.state.winner = "draw";
      this.state.gamePhase = "ended";
      this.clearSavedState();
    } else {
      // Switch turn
      this.state.currentPlayerIndex = 1 - this.state.currentPlayerIndex;
    }

    this.checkBotTurn();
  }

  private getLowestEmptyRow(col: number): number {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (this.state.board[row][col] === null) {
        return row;
      }
    }
    return -1;
  }

  private isBoardFull(): boolean {
    return this.state.board[0].every((cell) => cell !== null);
  }

  private checkWin(
    row: number,
    col: number,
    color: Cell,
  ): { row: number; col: number }[] {
    if (!color) return [];

    const directions = [
      [0, 1], // horizontal
      [1, 0], // vertical
      [1, 1], // diagonal \
      [1, -1], // diagonal /
    ];

    for (const [dr, dc] of directions) {
      const cells = this.getConnectedCells(row, col, dr, dc, color);
      if (cells.length >= WIN_LENGTH) {
        return cells;
      }
    }

    return [];
  }

  private getConnectedCells(
    row: number,
    col: number,
    dr: number,
    dc: number,
    color: Cell,
  ): { row: number; col: number }[] {
    const cells: { row: number; col: number }[] = [{ row, col }];

    // Check in positive direction
    let r = row + dr;
    let c = col + dc;
    while (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      this.state.board[r][c] === color
    ) {
      cells.push({ row: r, col: c });
      r += dr;
      c += dc;
    }

    // Check in negative direction
    r = row - dr;
    c = col - dc;
    while (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      this.state.board[r][c] === color
    ) {
      cells.push({ row: r, col: c });
      r -= dr;
      c -= dc;
    }

    return cells;
  }

  // ============== Undo System ==============

  private saveHistory(): void {
    const history: MoveHistory = {
      board: this.state.board.map((row) => [...row]),
      currentPlayerIndex: this.state.currentPlayerIndex,
    };
    const moveKey = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.state.moveHistory[moveKey] = history;

    // Prune if > 50
    const keys = Object.keys(this.state.moveHistory);
    if (keys.length > 50) {
      const sortedKeys = keys.sort();
      const numToRemove = sortedKeys.length - 50;
      for (let i = 0; i < numToRemove; i++) {
        delete this.state.moveHistory[sortedKeys[i]];
      }
    }
  }

  private handleRequestUndo(playerId: string, playerName: string): void {
    if (this.state.gamePhase !== "playing") return;
    if (Object.keys(this.state.moveHistory).length === 0) return;
    if (this.state.undoRequest) return;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    const opponentIndex = 1 - playerIndex;
    const opponent = this.state.players[opponentIndex];

    if (opponent?.isBot) {
      this.applyUndo();
    } else {
      this.state.undoRequest = { fromId: playerId, fromName: playerName };
    }
  }

  private handleAcceptUndo(): void {
    if (!this.state.undoRequest) return;
    this.applyUndo();
  }

  private applyUndo(): void {
    const keys = Object.keys(this.state.moveHistory).sort();
    if (keys.length === 0) return;

    const lastKey = keys[keys.length - 1];
    const lastState = this.state.moveHistory[lastKey];
    delete this.state.moveHistory[lastKey];

    this.state.board = lastState.board;
    this.state.currentPlayerIndex = lastState.currentPlayerIndex;
    this.state.undoRequest = null;
    this.state.lastMove = null;
    this.state.winningCells = [];
  }

  private handleDeclineUndo(): void {
    this.state.undoRequest = null;
  }

  // ============== Bot AI (Minimax with Alpha-Beta) ==============

  private handleAddBot(): void {
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players[1].id) return;

    this.state.players[1] = {
      id: `BOT_${Date.now()}`,
      username: "Bot",
      color: "yellow",
      isBot: true,
    };
  }

  private handleRemoveBot(): void {
    if (this.state.gamePhase !== "waiting") return;
    if (!this.state.players[1].isBot) return;

    this.state.players[1] = {
      id: null,
      username: "Player 2",
      color: "yellow",
      isBot: false,
    };
  }

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.isBot && currentPlayer.id) {
      setTimeout(() => this.makeBotMove(currentPlayer.id!), 600);
    }
  }

  private makeBotMove(botId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== botId) return;

    const bestCol = this.findBestMove();
    if (bestCol !== -1) {
      this.handleMakeMove(botId, bestCol);
    }
  }

  private findBestMove(): number {
    const botColor = this.state.players[this.state.currentPlayerIndex].color;
    const opponentColor = botColor === "red" ? "yellow" : "red";

    // Check for immediate win
    for (let col = 0; col < COLS; col++) {
      const row = this.getLowestEmptyRowForBoard(this.state.board, col);
      if (row === -1) continue;

      const testBoard = this.state.board.map((r) => [...r]);
      testBoard[row][col] = botColor;
      if (this.checkWinForBoard(testBoard, row, col, botColor)) {
        return col;
      }
    }

    // Block opponent win
    for (let col = 0; col < COLS; col++) {
      const row = this.getLowestEmptyRowForBoard(this.state.board, col);
      if (row === -1) continue;

      const testBoard = this.state.board.map((r) => [...r]);
      testBoard[row][col] = opponentColor;
      if (this.checkWinForBoard(testBoard, row, col, opponentColor)) {
        return col;
      }
    }

    // Use minimax for smart move
    let bestScore = -Infinity;
    let bestCol = -1;
    const depth = 5;

    for (let col = 0; col < COLS; col++) {
      const row = this.getLowestEmptyRowForBoard(this.state.board, col);
      if (row === -1) continue;

      const testBoard = this.state.board.map((r) => [...r]);
      testBoard[row][col] = botColor;

      const score = this.minimax(
        testBoard,
        depth - 1,
        -Infinity,
        Infinity,
        false,
        botColor,
        opponentColor,
      );

      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }

    // Fallback to center or first available
    if (bestCol === -1) {
      const preferredCols = [3, 2, 4, 1, 5, 0, 6];
      for (const col of preferredCols) {
        if (this.getLowestEmptyRowForBoard(this.state.board, col) !== -1) {
          return col;
        }
      }
    }

    return bestCol;
  }

  private minimax(
    board: Cell[][],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    botColor: Cell,
    opponentColor: Cell,
  ): number {
    // Terminal conditions
    if (depth === 0) {
      return this.evaluateBoard(board, botColor, opponentColor);
    }

    const currentColor = isMaximizing ? botColor : opponentColor;

    // Check for terminal state
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        if (board[row][col] !== null) {
          if (this.checkWinForBoard(board, row, col, board[row][col])) {
            return board[row][col] === botColor ? 10000 : -10000;
          }
        }
      }
    }

    if (this.isBoardFullForBoard(board)) {
      return 0;
    }

    if (isMaximizing) {
      let maxScore = -Infinity;
      for (let col = 0; col < COLS; col++) {
        const row = this.getLowestEmptyRowForBoard(board, col);
        if (row === -1) continue;

        board[row][col] = currentColor;
        const score = this.minimax(
          board,
          depth - 1,
          alpha,
          beta,
          false,
          botColor,
          opponentColor,
        );
        board[row][col] = null;

        maxScore = Math.max(maxScore, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxScore === -Infinity ? 0 : maxScore;
    } else {
      let minScore = Infinity;
      for (let col = 0; col < COLS; col++) {
        const row = this.getLowestEmptyRowForBoard(board, col);
        if (row === -1) continue;

        board[row][col] = currentColor;
        const score = this.minimax(
          board,
          depth - 1,
          alpha,
          beta,
          true,
          botColor,
          opponentColor,
        );
        board[row][col] = null;

        minScore = Math.min(minScore, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minScore === Infinity ? 0 : minScore;
    }
  }

  private evaluateBoard(
    board: Cell[][],
    botColor: Cell,
    opponentColor: Cell,
  ): number {
    let score = 0;

    // Score center column preference
    const centerCol = Math.floor(COLS / 2);
    for (let row = 0; row < ROWS; row++) {
      if (board[row][centerCol] === botColor) score += 3;
      if (board[row][centerCol] === opponentColor) score -= 3;
    }

    // Score windows of 4
    score += this.scoreWindows(board, botColor, opponentColor);

    return score;
  }

  private scoreWindows(
    board: Cell[][],
    botColor: Cell,
    opponentColor: Cell,
  ): number {
    let score = 0;

    // Horizontal
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col <= COLS - WIN_LENGTH; col++) {
        const window = [
          board[row][col],
          board[row][col + 1],
          board[row][col + 2],
          board[row][col + 3],
        ];
        score += this.scoreWindow(window, botColor, opponentColor);
      }
    }

    // Vertical
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row <= ROWS - WIN_LENGTH; row++) {
        const window = [
          board[row][col],
          board[row + 1][col],
          board[row + 2][col],
          board[row + 3][col],
        ];
        score += this.scoreWindow(window, botColor, opponentColor);
      }
    }

    // Diagonal \
    for (let row = 0; row <= ROWS - WIN_LENGTH; row++) {
      for (let col = 0; col <= COLS - WIN_LENGTH; col++) {
        const window = [
          board[row][col],
          board[row + 1][col + 1],
          board[row + 2][col + 2],
          board[row + 3][col + 3],
        ];
        score += this.scoreWindow(window, botColor, opponentColor);
      }
    }

    // Diagonal /
    for (let row = WIN_LENGTH - 1; row < ROWS; row++) {
      for (let col = 0; col <= COLS - WIN_LENGTH; col++) {
        const window = [
          board[row][col],
          board[row - 1][col + 1],
          board[row - 2][col + 2],
          board[row - 3][col + 3],
        ];
        score += this.scoreWindow(window, botColor, opponentColor);
      }
    }

    return score;
  }

  private scoreWindow(
    window: Cell[],
    botColor: Cell,
    opponentColor: Cell,
  ): number {
    const botCount = window.filter((c) => c === botColor).length;
    const opponentCount = window.filter((c) => c === opponentColor).length;
    const emptyCount = window.filter((c) => c === null).length;

    if (botCount === 4) return 100;
    if (botCount === 3 && emptyCount === 1) return 5;
    if (botCount === 2 && emptyCount === 2) return 2;
    if (opponentCount === 3 && emptyCount === 1) return -4;

    return 0;
  }

  private getLowestEmptyRowForBoard(board: Cell[][], col: number): number {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === null) return row;
    }
    return -1;
  }

  private isBoardFullForBoard(board: Cell[][]): boolean {
    return board[0].every((cell) => cell !== null);
  }

  private checkWinForBoard(
    board: Cell[][],
    row: number,
    col: number,
    color: Cell,
  ): boolean {
    if (!color) return false;

    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dr, dc] of directions) {
      let count = 1;

      // Positive direction
      let r = row + dr;
      let c = col + dc;
      while (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLS &&
        board[r][c] === color
      ) {
        count++;
        r += dr;
        c += dc;
      }

      // Negative direction
      r = row - dr;
      c = col - dc;
      while (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLS &&
        board[r][c] === color
      ) {
        count++;
        r -= dr;
        c -= dc;
      }

      if (count >= WIN_LENGTH) return true;
    }

    return false;
  }

  // ============== Public API ==============

  requestMove(col: number): void {
    const action: Connect4Action = {
      type: "MAKE_MOVE",
      playerId: this.userId,
      col,
    };
    this.makeAction(action);
  }

  requestStartGame(): void {
    const action: Connect4Action = { type: "START_GAME" };
    this.makeAction(action);
  }

  requestAddBot(): void {
    const action: Connect4Action = { type: "ADD_BOT" };
    this.makeAction(action);
  }

  requestRemoveBot(): void {
    const action: Connect4Action = { type: "REMOVE_BOT" };
    this.makeAction(action);
  }

  requestUndo(): void {
    const player = this.state.players.find((p) => p.id === this.userId);
    const action: Connect4Action = {
      type: "REQUEST_UNDO",
      playerId: this.userId,
      playerName: player?.username || "Player",
    };
    this.makeAction(action);
  }

  acceptUndo(): void {
    const action: Connect4Action = { type: "ACCEPT_UNDO" };
    this.makeAction(action);
  }

  declineUndo(): void {
    const action: Connect4Action = { type: "DECLINE_UNDO" };
    this.makeAction(action);
  }

  requestNewGame(): void {
    const action: Connect4Action = { type: "RESET" };
    this.makeAction(action);
  }

  reset(): void {
    this.state.board = this.createEmptyBoard();
    this.state.currentPlayerIndex = 0;
    this.state.winner = null;
    this.state.gamePhase = "waiting";
    this.state.undoRequest = null;
    this.state.moveHistory = {};
    this.state.lastMove = null;
    this.state.winningCells = [];
  }

  updatePlayers(players: { id: string; username: string }[]): void {
    if (this.state.gamePhase !== "waiting") {
      return;
    }

    // Slot 0 (Host)
    this.state.players[0].id = players[0]?.id || null;
    this.state.players[0].username = players[0]?.username || "Player 1";

    // Slot 1 (Guest or Bot)
    if (players[1]) {
      this.state.players[1].id = players[1].id;
      this.state.players[1].username = players[1].username;
      this.state.players[1].isBot = false;
    } else {
      // No guest. Clear if human. Keep if Bot.
      if (!this.state.players[1].isBot) {
        this.state.players[1].id = null;
        this.state.players[1].username = "Player 2";
      }
    }
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

  isColumnFull(col: number): boolean {
    return this.state.board[0][col] !== null;
  }
}
