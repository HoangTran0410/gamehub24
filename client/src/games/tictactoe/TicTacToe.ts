import type { Player } from "../../stores/roomStore";
import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import type { TicTacToeState, TicTacToeAction, MakeMoveAction } from "./types";

export default class TicTacToe extends BaseGame<TicTacToeState> {
  getInitState(): TicTacToeState {
    return {
      board: Array(9).fill(null),
      currentTurn: "X",
      winner: null,
      winningLine: null,
      isDraw: false,
      players: {
        X: this.players[0],
        O: this.players[1],
      },
      gameOver: false,
      lastMoveIndex: null,
      gamePhase: "waiting",
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as TicTacToeAction;
    if (!this.isHost) return;

    switch (action.type) {
      case "MAKE_MOVE":
        this.makeMove(action as MakeMoveAction);
        break;
      case "RESET_GAME":
        this.reset();
        break;
      case "SWITCH_TURN":
        this.handleSwitchTurn();
        break;
      case "START_GAME":
        this.handleStartGame();
        break;
    }
  }

  makeMove(action: MakeMoveAction): void {
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
      this.clearSavedState();
    } else {
      // Switch turn
      this.state.currentTurn = this.state.currentTurn === "X" ? "O" : "X";
    }

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
    this.state.board = Array(9).fill(null);
    this.state.currentTurn = "X";
    this.state.winner = null;
    this.state.winningLine = null;
    this.state.isDraw = false;
    this.state.gameOver = false;
    this.state.lastMoveIndex = null;
    this.state.gamePhase = "waiting";
  }

  updatePlayers(players: Player[]): void {
    // X is always the first player (Host)
    this.state.players.X = players[0];

    // O is the second player. If human joins, they overwrite Bot.
    if (players[1]) {
      this.state.players.O = players[1];
    } else {
      // No human for O. If it was human, clear it. Keep Bot if active.
      if (!this.state.players.O?.isBot) {
        this.state.players.O = null;
      }
    }
  }

  // Request reset (client-side)
  requestReset(): void {
    if (this.isHost) {
      this.reset();
    } else {
      this.sendSocketGameAction({
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

    // Check if it became bot's turn
    this.checkBotTurn();
  }

  switchTurn(): void {
    if (this.isHost) {
      this.handleSwitchTurn();
    } else {
      this.sendSocketGameAction({
        type: "SWITCH_TURN",
      });
    }
  }

  // Bot Management
  addBot(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;

    // Assign BOT to O
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

  // Check if it's bot's turn and make move
  private checkBotTurn(): void {
    if (!this.isHost) return;

    const currentPlayerId =
      this.state.currentTurn === "X"
        ? this.state.players.X
        : this.state.players.O;

    if (currentPlayerId?.isBot && !this.state.gameOver) {
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
    const board = JSON.parse(JSON.stringify(this.state.board));
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
    playerSymbol: string,
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
            playerSymbol,
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
            playerSymbol,
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
    if (this.state.players.X?.id === playerId) return "X";
    if (this.state.players.O?.id === playerId) return "O";
    return null;
  }

  // Public method to get current user's symbol
  public getPlayerSymbol(): "X" | "O" | null {
    return this.getPlayerSymbolInternal(this.userId);
  }
}
