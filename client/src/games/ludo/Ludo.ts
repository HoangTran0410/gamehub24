import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import type { Socket } from "socket.io-client";
import {
  type LudoState,
  type LudoAction,
  type LudoPlayer,
  type Token,
  type TokenPosition,
  type PlayerColor,
  BOARD_SIZE,
  FINISH_LANE_SIZE,
  TOKENS_PER_PLAYER,
  START_POSITIONS,
  SAFE_POSITIONS,
} from "./types";

// Player colors in clockwise order matching board layout:
// Red (top-left) → Green (top-right) → Yellow (bottom-right) → Blue (bottom-left)
const PLAYER_COLORS: PlayerColor[] = ["red", "green", "yellow", "blue"];

export default class Ludo extends BaseGame {
  private state: LudoState;
  private onStateChange?: (state: LudoState) => void;

  constructor(
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    players: { id: string; username: string }[]
  ) {
    super(roomId, socket, isHost, userId);

    // Initialize 4 player slots
    this.state = {
      players: PLAYER_COLORS.map((color, index) => ({
        id: players[index]?.id || null,
        username: players[index]?.username || `Player ${index + 1}`,
        color,
        isBot: false,
        tokens: this.createInitialTokens(),
        hasFinished: false,
      })),
      currentPlayerIndex: 0,
      diceValue: null,
      hasRolled: false,
      canRollAgain: false,
      gamePhase: "waiting",
      winner: null,
      lastMove: null,
      consecutiveSixes: 0,
    };

    this.init();
  }

  private createInitialTokens(): Token[] {
    return Array(TOKENS_PER_PLAYER)
      .fill(null)
      .map((_, i) => ({
        id: i,
        position: { type: "home" as const, index: i },
      }));
  }

  init(): void {
    if (this.isHost) {
      this.broadcastState();
    }
  }

  onUpdate(callback: (state: LudoState) => void): void {
    this.onStateChange = callback;
  }

  getState(): LudoState {
    return { ...this.state };
  }

  setState(state: LudoState): void {
    this.state = state;
    this.onStateChange?.(this.state);
  }

  handleAction(data: { action: GameAction }): void {
    const action = data.action as LudoAction;
    if (!this.isHost) return;

    switch (action.type) {
      case "ROLL_DICE":
        this.handleRollDice(action.playerId);
        break;
      case "MOVE_TOKEN":
        this.handleMoveToken(action.playerId, action.tokenId);
        break;
      case "START_GAME":
        this.handleStartGame();
        break;
      case "RESET":
        this.reset();
        break;
      case "ADD_BOT":
        this.handleAddBot(action.slotIndex);
        break;
      case "REMOVE_BOT":
        this.handleRemoveBot(action.slotIndex);
        break;
      case "REQUEST_SYNC":
        this.broadcastState();
        break;
    }
  }

  makeMove(action: LudoAction): void {
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  // ============== Game Logic ==============

  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;

    // Count active players (at least 2 required)
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    if (activePlayers.length < 2) return;

    // Reset all tokens to home
    this.state.players.forEach((player) => {
      player.tokens = this.createInitialTokens();
      player.hasFinished = false;
    });

    this.state.gamePhase = "playing";
    this.state.currentPlayerIndex = this.findFirstActivePlayer();
    this.state.diceValue = null;
    this.state.hasRolled = false;
    this.state.canRollAgain = false;
    this.state.winner = null;
    this.state.lastMove = null;
    this.state.consecutiveSixes = 0;

    this.broadcastState();
    this.setState({ ...this.state });
    this.checkBotTurn();
  }

  private findFirstActivePlayer(): number {
    for (let i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].id !== null) return i;
    }
    return 0;
  }

  private handleRollDice(playerId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return;
    if (this.state.hasRolled && !this.state.canRollAgain) return;

    // Roll the dice - increase chance of 6 when no tokens are on board for faster start
    let dice: number;
    if (!this.hasAnyTokenOnBoard(currentPlayer)) {
      // 50% chance to get 6, 50% chance for normal roll (1-6)
      dice = Math.random() < 0.5 ? 6 : Math.floor(Math.random() * 6) + 1;
    } else {
      dice = Math.floor(Math.random() * 6) + 1;
    }
    this.state.diceValue = dice;
    this.state.hasRolled = true;
    this.state.canRollAgain = false;

    // Track consecutive 6s
    if (dice === 6) {
      this.state.consecutiveSixes++;
      // if (this.state.consecutiveSixes >= 3) {
      //   // Three 6s in a row = lose turn, but show dice first
      //   this.state.consecutiveSixes = 0;
      //   this.broadcastState();
      //   this.setState({ ...this.state });

      //   // Delay turn change so animation can play (3 seconds total)
      //   setTimeout(() => {
      //     this.nextTurn();
      //     this.broadcastState();
      //     this.setState({ ...this.state });
      //     this.checkBotTurn();
      //   }, 3000);
      //   return;
      // }
    } else {
      this.state.consecutiveSixes = 0;
    }

    // Check if any moves are possible
    const movableTokens = this.getMovableTokens(currentPlayer, dice);

    // Broadcast the dice result first so animation plays for everyone
    this.broadcastState();
    this.setState({ ...this.state });

    if (movableTokens.length === 0) {
      // No valid moves, delay then end turn (3 seconds for animation + viewing)
      setTimeout(() => {
        this.nextTurn();
        this.broadcastState();
        this.setState({ ...this.state });
        this.checkBotTurn();
      }, 3000);
    } else if (movableTokens.length === 1 && !currentPlayer.isBot) {
      // Only 1 movable token - auto move after a short delay for dice animation
      setTimeout(() => {
        this.handleMoveToken(playerId, movableTokens[0].id);
      }, 800);
    } else {
      this.checkBotTurn();
    }
  }

  private handleMoveToken(playerId: string, tokenId: number): void {
    if (this.state.gamePhase !== "playing") return;
    if (this.state.diceValue === null) return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return;

    const token = currentPlayer.tokens.find((t) => t.id === tokenId);
    if (!token) return;

    const dice = this.state.diceValue;
    const newPosition = this.calculateNewPosition(
      token,
      currentPlayer.color,
      dice
    );
    if (!newPosition) return;

    // Save last move
    this.state.lastMove = {
      playerId,
      tokenId,
      from: { ...token.position } as TokenPosition,
      to: newPosition,
    };

    // Execute move
    token.position = newPosition;

    // Check for capture
    if (newPosition.type === "board") {
      this.checkCapture(currentPlayer.color, newPosition.position);
    }

    // Check if token finished
    if (newPosition.type === "finished") {
      // Check if all tokens finished
      if (currentPlayer.tokens.every((t) => t.position.type === "finished")) {
        currentPlayer.hasFinished = true;
        this.state.winner = playerId;
        this.state.gamePhase = "ended";
        this.broadcastGameEnd({ winner: playerId });
        this.broadcastState();
        this.setState({ ...this.state });
        return;
      }
    }

    // Check if player gets another turn (rolled 6)
    if (dice === 6) {
      this.state.canRollAgain = true;
      this.state.hasRolled = false;
      this.state.diceValue = null;
    } else {
      this.nextTurn();
    }

    this.broadcastState();
    this.setState({ ...this.state });
    this.checkBotTurn();
  }

  private getMovableTokens(player: LudoPlayer, dice: number): Token[] {
    return player.tokens.filter((token) => {
      const newPos = this.calculateNewPosition(token, player.color, dice);
      return newPos !== null;
    });
  }

  private calculateNewPosition(
    token: Token,
    color: PlayerColor,
    dice: number
  ): TokenPosition | null {
    const pos = token.position;
    const startPos = START_POSITIONS[color];

    if (pos.type === "home") {
      // Can only leave home with a 6
      if (dice !== 6) return null;
      return { type: "board", position: startPos };
    }

    if (pos.type === "board") {
      // Calculate steps around the board
      let newPos = pos.position;
      let stepsToFinish = this.getStepsToFinishEntry(pos.position, color);

      if (stepsToFinish < dice) {
        // Would enter finish lane
        const finishPos = dice - stepsToFinish - 1;
        if (finishPos >= FINISH_LANE_SIZE) {
          return null; // Would overshoot
        }
        if (finishPos === FINISH_LANE_SIZE - 1) {
          return { type: "finished" };
        }
        return { type: "finish", position: finishPos };
      } else if (stepsToFinish === dice) {
        // Exactly at finish entry, go to finish lane
        return { type: "finish", position: 0 };
      } else {
        // Normal move around board
        newPos = (pos.position + dice) % BOARD_SIZE;
        return { type: "board", position: newPos };
      }
    }

    if (pos.type === "finish") {
      const newFinishPos = pos.position + dice;
      if (newFinishPos > FINISH_LANE_SIZE - 1) {
        return null; // Would overshoot
      }
      if (newFinishPos === FINISH_LANE_SIZE - 1) {
        return { type: "finished" };
      }
      return { type: "finish", position: newFinishPos };
    }

    return null;
  }

  private getStepsToFinishEntry(position: number, color: PlayerColor): number {
    const startPos = START_POSITIONS[color];
    const finishEntryPos = (startPos + BOARD_SIZE - 1) % BOARD_SIZE;

    if (position <= finishEntryPos) {
      return finishEntryPos - position;
    } else {
      return BOARD_SIZE - position + finishEntryPos;
    }
  }

  private checkCapture(currentColor: PlayerColor, boardPosition: number): void {
    // Can't capture on safe positions
    if (SAFE_POSITIONS.includes(boardPosition)) return;

    for (const player of this.state.players) {
      if (player.color === currentColor) continue;

      for (const token of player.tokens) {
        if (
          token.position.type === "board" &&
          token.position.position === boardPosition
        ) {
          // Send token back to home
          const homeIndex = player.tokens.filter(
            (t) => t.position.type === "home"
          ).length;
          token.position = { type: "home", index: homeIndex };
        }
      }
    }
  }

  private nextTurn(): void {
    this.state.diceValue = null;
    this.state.hasRolled = false;
    this.state.canRollAgain = false;
    this.state.consecutiveSixes = 0;

    // Find next active player
    let nextIndex = this.state.currentPlayerIndex;
    do {
      nextIndex = (nextIndex + 1) % this.state.players.length;
    } while (
      this.state.players[nextIndex].id === null ||
      this.state.players[nextIndex].hasFinished
    );

    this.state.currentPlayerIndex = nextIndex;
  }

  /**
   * Check if any player has at least one token on the board (not in home)
   * Used to determine if we should boost the chance of rolling 6 for faster starts
   */
  private hasAnyTokenOnBoard(player: LudoPlayer): boolean {
    if (player.id === null) return false;
    for (const token of player.tokens) {
      if (token.position.type === "board" || token.position.type === "finish") {
        return true;
      }
    }
    return false;
  }

  // ============== Bot AI ==============

  private handleAddBot(slotIndex: number): void {
    if (this.state.gamePhase !== "waiting") return;
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.players[slotIndex].id !== null) return;

    this.state.players[slotIndex] = {
      ...this.state.players[slotIndex],
      id: `BOT_${Date.now()}_${slotIndex}`,
      username: `Bot ${slotIndex + 1}`,
      isBot: true,
    };

    this.broadcastState();
    this.setState({ ...this.state });
  }

  private handleRemoveBot(slotIndex: number): void {
    if (this.state.gamePhase !== "waiting") return;
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (!this.state.players[slotIndex].isBot) return;

    this.state.players[slotIndex] = {
      ...this.state.players[slotIndex],
      id: null,
      username: `Player ${slotIndex + 1}`,
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
      setTimeout(() => this.executeBotTurn(currentPlayer.id!), 800);
    }
  }

  private executeBotTurn(botId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id !== botId) return;

    if (!this.state.hasRolled || this.state.canRollAgain) {
      // Need to roll dice
      this.handleRollDice(botId);
      return;
    }

    // Pick best token to move
    if (this.state.diceValue !== null) {
      const movableTokens = this.getMovableTokens(
        currentPlayer,
        this.state.diceValue
      );
      if (movableTokens.length > 0) {
        const bestToken = this.pickBestToken(
          currentPlayer,
          movableTokens,
          this.state.diceValue
        );
        this.handleMoveToken(botId, bestToken.id);
      }
    }
  }

  private pickBestToken(
    player: LudoPlayer,
    tokens: Token[],
    dice: number
  ): Token {
    // Priority:
    // 1. Move token that can finish
    // 2. Move token that can capture
    // 3. Move token from home (if rolled 6)
    // 4. Move token closest to finish
    // 5. Random

    for (const token of tokens) {
      const newPos = this.calculateNewPosition(token, player.color, dice);
      if (newPos?.type === "finished") {
        return token;
      }
    }

    // Check for capture opportunity
    for (const token of tokens) {
      const newPos = this.calculateNewPosition(token, player.color, dice);
      if (
        newPos?.type === "board" &&
        !SAFE_POSITIONS.includes(newPos.position)
      ) {
        if (this.canCaptureAt(player.color, newPos.position)) {
          return token;
        }
      }
    }

    // Prefer moving from home
    const homeToken = tokens.find((t) => t.position.type === "home");
    if (homeToken && dice === 6) {
      return homeToken;
    }

    // Move token furthest along
    return tokens.reduce((best, token) => {
      const bestProgress = this.getTokenProgress(best, player.color);
      const tokenProgress = this.getTokenProgress(token, player.color);
      return tokenProgress > bestProgress ? token : best;
    });
  }

  private canCaptureAt(currentColor: PlayerColor, position: number): boolean {
    for (const player of this.state.players) {
      if (player.color === currentColor) continue;
      for (const token of player.tokens) {
        if (
          token.position.type === "board" &&
          token.position.position === position
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private getTokenProgress(token: Token, color: PlayerColor): number {
    const pos = token.position;
    if (pos.type === "home") return 0;
    if (pos.type === "finished") return BOARD_SIZE + FINISH_LANE_SIZE + 1;
    if (pos.type === "finish") return BOARD_SIZE + pos.position;
    if (pos.type === "board") {
      const startPos = START_POSITIONS[color];
      if (pos.position >= startPos) {
        return pos.position - startPos;
      }
      return BOARD_SIZE - startPos + pos.position;
    }
    return 0;
  }

  // ============== Public API ==============

  requestRollDice(): void {
    const action: LudoAction = { type: "ROLL_DICE", playerId: this.userId };
    this.makeMove(action);
  }

  requestMoveToken(tokenId: number): void {
    const action: LudoAction = {
      type: "MOVE_TOKEN",
      playerId: this.userId,
      tokenId,
    };
    this.makeMove(action);
  }

  requestStartGame(): void {
    const action: LudoAction = { type: "START_GAME" };
    this.makeMove(action);
  }

  requestAddBot(slotIndex: number): void {
    const action: LudoAction = { type: "ADD_BOT", slotIndex };
    this.makeMove(action);
  }

  requestRemoveBot(slotIndex: number): void {
    const action: LudoAction = { type: "REMOVE_BOT", slotIndex };
    this.makeMove(action);
  }

  requestSync(): void {
    const action: LudoAction = { type: "REQUEST_SYNC" };
    if (this.isHost) {
      this.broadcastState();
    } else {
      this.sendAction(action);
    }
  }

  requestNewGame(): void {
    const action: LudoAction = { type: "RESET" };
    this.makeMove(action);
  }

  reset(): void {
    this.state = {
      ...this.state,
      players: this.state.players.map((p) => ({
        ...p,
        tokens: this.createInitialTokens(),
        hasFinished: false,
      })),
      currentPlayerIndex: 0,
      diceValue: null,
      hasRolled: false,
      canRollAgain: false,
      gamePhase: "waiting",
      winner: null,
      lastMove: null,
      consecutiveSixes: 0,
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

    for (let i = 0; i < Math.min(players.length, 4); i++) {
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
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    return activePlayers.length >= 2;
  }

  getMovableTokensForCurrentPlayer(): Token[] {
    if (this.state.diceValue === null) return [];
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    return this.getMovableTokens(currentPlayer, this.state.diceValue);
  }

  isTokenMovable(tokenId: number): boolean {
    const movable = this.getMovableTokensForCurrentPlayer();
    return movable.some((t) => t.id === tokenId);
  }
}
