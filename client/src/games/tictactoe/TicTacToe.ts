import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import type { Socket } from "socket.io-client";
import { type TicTacToeState, type TicTacToeAction } from "./types";

export default class TicTacToe extends BaseGame {
  private state: TicTacToeState;
  private onStateChange?: (state: TicTacToeState) => void;

  constructor(
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    players: { id: string; username: string }[]
  ) {
    super(roomId, socket, isHost, userId);

    // Initialize state
    this.state = {
      board: Array(9).fill(null),
      currentTurn: "X",
      winner: null,
      winningLine: null,
      isDraw: false,
      players: {
        X: players[0]?.id || null,
        O: players[1]?.id || null,
      },
      gameOver: false,
      lastMoveIndex: null,
      gamePhase: "waiting",
    };

    this.init();
  }

  init(): void {
    // If host, broadcast initial state
    if (this.isHost) {
      this.broadcastState();
    }
  }

  // Register callback for state changes (for UI updates)
  onUpdate(callback: (state: TicTacToeState) => void): void {
    this.onStateChange = callback;
  }

  getState(): TicTacToeState {
    return { ...this.state };
  }

  setState(state: TicTacToeState): void {
    this.state = state;
    this.onStateChange?.(this.state);
  }

  handleAction(data: { action: GameAction }): void {
    const action = data.action as TicTacToeAction;

    if (action.type === "MAKE_MOVE" && this.isHost) {
      this.makeMove(action);
    } else if (action.type === "RESET_GAME" && this.isHost) {
      this.reset();
    } else if (action.type === "SWITCH_TURN" && this.isHost) {
      this.handleSwitchTurn();
    } else if (action.type === "START_GAME" && this.isHost) {
      this.handleStartGame();
    }
  }

  makeMove(action: TicTacToeAction): void {
    if (action.type !== "MAKE_MOVE") return;

    const { cellIndex, playerId } = action;

    // Validate move
    if (this.state.gamePhase !== "playing") return;
    if (this.state.gameOver) return;
    if (this.state.board[cellIndex] !== null) return;

    // Get player symbol
    const playerSymbol = this.getPlayerSymbolInternal(playerId);
    if (!playerSymbol) return;

    // Check if it's player's turn
    if (playerSymbol !== this.state.currentTurn) return;

    // Make move
    this.state.board[cellIndex] = playerSymbol;
    this.state.lastMoveIndex = cellIndex;

    // Check for win or draw
    const result = this.checkGameEnd();
    if (result) {
      this.state.winner = (result.winner as "X" | "O") || null;
      if (result.pattern) {
        this.state.winningLine = result.pattern;
      }
      this.state.isDraw = result.isDraw || false;
      this.state.gameOver = true;
      this.broadcastGameEnd(result);
    } else {
      // Switch turn
      this.state.currentTurn = this.state.currentTurn === "X" ? "O" : "X";
    }

    // Broadcast updated state
    this.broadcastState();
    this.setState({ ...this.state });

    // Check if it's bot's turn
    this.checkBotTurn();
  }

  checkGameEnd(): (GameResult & { pattern?: number[] }) | null {
    const { board } = this.state;

    // Win patterns (rows, columns, diagonals)
    const winPatterns = [
      [0, 1, 2], // Row 1
      [3, 4, 5], // Row 2
      [6, 7, 8], // Row 3
      [0, 3, 6], // Col 1
      [1, 4, 7], // Col 2
      [2, 5, 8], // Col 3
      [0, 4, 8], // Diagonal 1
      [2, 4, 6], // Diagonal 2
    ];

    // Check for winner
    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a] as "X" | "O", pattern };
      }
    }

    // Check for draw
    if (board.every((cell) => cell !== null)) {
      return { isDraw: true };
    }

    return null;
  }

  reset(): void {
    this.state = {
      board: Array(9).fill(null),
      currentTurn: "X",
      winner: null,
      winningLine: null,
      isDraw: false,
      players: this.state.players, // Keep same players
      gameOver: false,
      lastMoveIndex: null,
      gamePhase: "waiting",
    };

    this.broadcastState();
    this.setState({ ...this.state });
  }

  updatePlayers(players: { id: string; username: string }[]): void {
    this.state.players = {
      X: players[0]?.id || null,
      O: players[1]?.id || null,
    };
    this.broadcastState();
    this.setState({ ...this.state });
  }

  // Request a move (client-side)
  requestMove(cellIndex: number): void {
    const action: TicTacToeAction = {
      type: "MAKE_MOVE",
      cellIndex,
      playerId: this.userId,
    };

    if (this.isHost) {
      this.makeMove(action);
    } else {
      this.sendAction(action);
    }
  }

  // Request reset (client-side)
  requestReset(): void {
    if (this.isHost) {
      this.reset();
    } else {
      this.sendAction({
        type: "RESET_GAME",
      });
    }
  }

  // Switch Turn Logic
  handleSwitchTurn(): void {
    // Can only switch turn if board is empty and game is not over
    if (this.state.gameOver) return;
    if (this.state.board.some((cell) => cell !== null)) return;

    this.state.currentTurn = this.state.currentTurn === "X" ? "O" : "X";
    this.broadcastState();
    this.setState({ ...this.state });

    // Check if it became bot's turn
    this.checkBotTurn();
  }

  switchTurn(): void {
    if (this.isHost) {
      this.handleSwitchTurn();
    } else {
      this.sendAction({
        type: "SWITCH_TURN",
      });
    }
  }

  // Bot Management
  addBot(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;

    // Assign BOT to O
    this.state.players.O = "BOT";
    this.broadcastState();
    this.setState({ ...this.state });
  }

  removeBot(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players.O !== "BOT") return;

    this.state.players.O = null;
    this.broadcastState();
    this.setState({ ...this.state });
  }

  // Start Game
  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;
    if (!this.state.players.X || !this.state.players.O) return;

    this.state.gamePhase = "playing";
    this.broadcastState();
    this.setState({ ...this.state });

    // Check if bot goes first
    this.checkBotTurn();
  }

  startGame(): void {
    if (this.isHost) {
      this.handleStartGame();
    } else {
      this.sendAction({ type: "START_GAME" });
    }
  }

  canStartGame(): boolean {
    return (
      !!this.state.players.X &&
      !!this.state.players.O &&
      this.state.gamePhase === "waiting"
    );
  }

  // Check if it's bot's turn and make move
  private checkBotTurn(): void {
    if (!this.isHost) return;

    const currentPlayerId =
      this.state.currentTurn === "X"
        ? this.state.players.X
        : this.state.players.O;

    if (currentPlayerId === "BOT" && !this.state.gameOver) {
      setTimeout(() => this.makeBotMove(), 600);
    }
  }

  private makeBotMove(): void {
    if (this.state.gameOver) return;

    // Simple Minimax or Random for now, let's do Minimax
    const bestMove = this.getBestMove();
    if (bestMove !== -1) {
      this.makeMove({
        type: "MAKE_MOVE",
        cellIndex: bestMove,
        playerId: "BOT",
      });
    }
  }

  private getBestMove(): number {
    const board = this.state.board;
    let bestScore = -Infinity;
    let move = -1;

    // AI is always Minimizing 'X' (Player) and Maximizing 'O' (Bot) if Bot is O.
    // Usually X goes first. If Bot is O, it wants to win as O.
    // Let's assume Bot is always 'O' for now based on addBot implementation.
    const botSymbol = "O";
    const playerSymbol = "X";

    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = botSymbol;
        const score = this.minimax(board, 0, false, botSymbol, playerSymbol);
        board[i] = null;
        if (score > bestScore) {
          bestScore = score;
          move = i;
        }
      }
    }
    return move;
  }

  private minimax(
    board: (string | null)[],
    depth: number,
    isMaximizing: boolean,
    botSymbol: string,
    playerSymbol: string
  ): number {
    const result = this.checkWinInternal(board);
    if (result === botSymbol) return 10 - depth;
    if (result === playerSymbol) return depth - 10;
    if (result === "draw") return 0;

    if (isMaximizing) {
      let bestScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = botSymbol;
          const score = this.minimax(
            board,
            depth + 1,
            false,
            botSymbol,
            playerSymbol
          );
          board[i] = null;
          bestScore = Math.max(score, bestScore);
        }
      }
      return bestScore;
    } else {
      let bestScore = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = playerSymbol;
          const score = this.minimax(
            board,
            depth + 1,
            true,
            botSymbol,
            playerSymbol
          );
          board[i] = null;
          bestScore = Math.min(score, bestScore);
        }
      }
      return bestScore;
    }
  }

  private checkWinInternal(board: (string | null)[]): string | "draw" | null {
    const winPatterns = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a] as string;
      }
    }

    if (board.every((cell) => cell !== null)) return "draw";
    return null;
  }

  // Private helper to get symbol for any player ID
  private getPlayerSymbolInternal(playerId: string): "X" | "O" | null {
    if (this.state.players.X === playerId) return "X";
    if (this.state.players.O === playerId) return "O";
    return null;
  }

  // Public method to get current user's symbol
  public getPlayerSymbol(): "X" | "O" | null {
    return this.getPlayerSymbolInternal(this.userId);
  }
}
