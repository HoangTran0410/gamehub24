import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import type { Socket } from "socket.io-client";
import {
  type ThirteenState,
  type ThirteenAction,
  type Card,
  type Combination,
  type PlayerSlot,
  Suit,
  Rank,
  CombinationType,
} from "./types";

export default class Thirteen extends BaseGame {
  private state: ThirteenState;
  private onStateChange?: (state: ThirteenState) => void;

  constructor(
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    players: { id: string; username: string }[]
  ) {
    super(roomId, socket, isHost, userId);

    // Initialize 4 player slots
    const slots: PlayerSlot[] = Array(4)
      .fill(null)
      .map((_, i) => {
        const player = players[i];
        return {
          id: player?.id || null,
          username: player?.username || `Slot ${i + 1}`,
          hand: [],
          isBot: false,
          isGuest: false,
          isHost: player?.id === this.userId,
          passed: false,
        };
      });

    this.state = {
      players: slots,
      currentTrick: [],
      currentTurnIndex: 0,
      lastPlayedBy: null,
      lastCombination: null,
      winner: null,
      gamePhase: "waiting",
      newGameRequest: null,
    };

    this.init();
  }

  init(): void {
    if (this.isHost) {
      this.broadcastState();
    }
  }

  onUpdate(callback: (state: ThirteenState) => void): void {
    this.onStateChange = callback;
  }

  getState(): ThirteenState {
    return { ...this.state };
  }

  setState(state: ThirteenState): void {
    this.state = state;
    this.onStateChange?.(this.state);
  }

  handleAction(data: { action: GameAction }): void {
    const action = data.action as ThirteenAction;

    if (!this.isHost) return; // Only host processes actions

    switch (action.type) {
      case "PLAY_CARDS":
        this.handlePlayCards(action.playerId, action.cards);
        break;
      case "PASS":
        this.handlePass(action.playerId);
        break;
      case "ADD_BOT":
        this.handleAddBot(action.slotIndex);
        break;
      case "JOIN_SLOT":
        this.handleJoinSlot(
          action.slotIndex,
          action.playerId,
          action.playerName
        );
        break;
      case "REMOVE_PLAYER":
        this.handleRemovePlayer(action.slotIndex);
        break;
      case "START_GAME":
        this.handleStartGame();
        break;
      case "NEW_GAME":
        this.reset();
        break;
      case "REQUEST_NEW_GAME":
        this.handleNewGameRequest(action.playerId, action.playerName);
        break;
      case "ACCEPT_NEW_GAME":
        this.reset();
        break;
      case "DECLINE_NEW_GAME":
        this.state.newGameRequest = null;
        this.broadcastState();
        this.setState({ ...this.state });
        break;
    }
  }

  makeMove(action: GameAction): void {
    // Delegate to handleAction for consistency
    this.handleAction({ action });
  }

  // ============== Card Logic ==============

  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of [Suit.SPADE, Suit.CLUB, Suit.DIAMOND, Suit.HEART]) {
      for (let rank = Rank.THREE; rank <= Rank.TWO; rank++) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  private shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private dealCards(): void {
    const deck = this.shuffleDeck(this.createDeck());
    // const activePlayers = this.state.players.filter((p) => p.id !== null);
    const cardsPerPlayer = 13; // Math.floor(deck.length / activePlayers.length);

    let cardIndex = 0;
    for (const player of this.state.players) {
      if (player.id !== null) {
        player.hand = deck.slice(cardIndex, cardIndex + cardsPerPlayer);
        this.sortHand(player.hand);
        cardIndex += cardsPerPlayer;
      }
    }
  }

  private sortHand(hand: Card[]): void {
    hand.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.suit - b.suit;
    });
  }

  // Compare cards: higher value wins
  private getCardValue(card: Card): number {
    return card.rank * 10 + card.suit;
  }

  // Validate combination of cards
  private getCombination(cards: Card[]): Combination | null {
    if (cards.length === 0) return null;

    const sorted = [...cards].sort(
      (a, b) => this.getCardValue(a) - this.getCardValue(b)
    );

    // Single
    if (cards.length === 1) {
      return {
        type: CombinationType.SINGLE,
        cards: sorted,
        value: this.getCardValue(sorted[0]),
      };
    }

    // Check if all same rank (pair, triple, four of a kind)
    const allSameRank = cards.every((c) => c.rank === cards[0].rank);

    if (allSameRank) {
      if (cards.length === 2) {
        return {
          type: CombinationType.PAIR,
          cards: sorted,
          value: this.getCardValue(sorted[sorted.length - 1]),
        };
      }
      if (cards.length === 3) {
        return {
          type: CombinationType.TRIPLE,
          cards: sorted,
          value: this.getCardValue(sorted[sorted.length - 1]),
        };
      }
      if (cards.length === 4) {
        return {
          type: CombinationType.FOUR_OF_KIND,
          cards: sorted,
          value: this.getCardValue(sorted[sorted.length - 1]),
        };
      }
    }

    // Check straight (3+ consecutive ranks, no 2s allowed in middle)
    if (cards.length >= 3) {
      const isStraight = this.isStraight(sorted);
      if (isStraight) {
        return {
          type: CombinationType.STRAIGHT,
          cards: sorted,
          value:
            this.getCardValue(sorted[sorted.length - 1]) * 100 + cards.length,
        };
      }
    }

    // Check three consecutive pairs (sám cô): 334455, 778899, etc.
    if (cards.length === 6) {
      const isThreeConsecutivePairs = this.isThreeConsecutivePairs(sorted);
      if (isThreeConsecutivePairs) {
        return {
          type: CombinationType.THREE_CONSECUTIVE_PAIRS,
          cards: sorted,
          value: this.getCardValue(sorted[sorted.length - 1]),
        };
      }
    }

    return null;
  }

  // Check if 6 cards form 3 consecutive pairs (sám cô)
  private isThreeConsecutivePairs(sorted: Card[]): boolean {
    if (sorted.length !== 6) return false;
    // Cannot have 2 in consecutive pairs
    if (sorted.some((c) => c.rank === Rank.TWO)) return false;

    // Group by rank
    const rankCounts = new Map<Rank, number>();
    for (const card of sorted) {
      rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
    }

    // Must have exactly 3 different ranks, each appearing exactly twice
    const ranks = Array.from(rankCounts.keys()).sort((a, b) => a - b);
    if (ranks.length !== 3) return false;
    if (!Array.from(rankCounts.values()).every((count) => count === 2))
      return false;

    // Ranks must be consecutive
    if (ranks[1] !== ranks[0] + 1 || ranks[2] !== ranks[1] + 1) return false;

    return true;
  }

  private isStraight(sorted: Card[]): boolean {
    // Cannot have 2 in a straight (2 is the highest)
    if (sorted.some((c) => c.rank === Rank.TWO)) return false;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].rank !== sorted[i - 1].rank + 1) return false;
    }
    return true;
  }

  // Check if new combination can beat the last one
  private canBeat(
    newCombo: Combination,
    lastCombo: Combination | null
  ): boolean {
    if (!lastCombo) return true;

    // Four of a kind can beat any 2
    if (
      newCombo.type === CombinationType.FOUR_OF_KIND &&
      lastCombo.type === CombinationType.SINGLE &&
      lastCombo.cards[0].rank === Rank.TWO
    ) {
      return true;
    }

    // Three consecutive pairs (sám cô) can beat a single 2
    if (
      newCombo.type === CombinationType.THREE_CONSECUTIVE_PAIRS &&
      lastCombo.type === CombinationType.SINGLE &&
      lastCombo.cards[0].rank === Rank.TWO
    ) {
      return true;
    }

    // Must be same type
    if (newCombo.type !== lastCombo.type) return false;

    // Must be same length for straights
    if (
      newCombo.type === CombinationType.STRAIGHT &&
      newCombo.cards.length !== lastCombo.cards.length
    ) {
      return false;
    }

    return newCombo.value > lastCombo.value;
  }

  // ============== Game Actions ==============

  private handlePlayCards(playerId: string, cards: Card[]): void {
    if (this.state.gamePhase !== "playing") return;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex)
      return;

    const player = this.state.players[playerIndex];

    // Validate player has these cards
    if (!this.playerHasCards(player, cards)) return;

    // Validate combination
    const combination = this.getCombination(cards);
    if (!combination) return;

    // Check if can beat last combination
    if (!this.canBeat(combination, this.state.lastCombination)) return;

    // Remove cards from player's hand
    this.removeCardsFromHand(player, cards);

    // Add to current trick
    this.state.currentTrick.push({ playerId, cards });
    this.state.lastPlayedBy = playerId;
    this.state.lastCombination = combination;

    // Reset passed flags for other players
    if (this.state.currentTrick.length == 0) {
      this.state.players.forEach((p) => {
        if (p.id !== playerId) p.passed = false;
      });
    }

    // Check win condition
    if (player.hand.length === 0) {
      this.state.winner = playerId;
      this.state.gamePhase = "ended";
      this.broadcastState();
      this.setState({ ...this.state });
      this.broadcastGameEnd({ winner: playerId });
      return;
    }

    // Move to next player
    this.advanceTurn();
    this.broadcastState();
    this.setState({ ...this.state });

    // Check for bot turn
    this.checkBotTurn();
  }

  private handlePass(playerId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex)
      return;

    // Cannot pass if starting new trick
    if (!this.state.lastCombination) return;

    this.state.players[playerIndex].passed = true;

    // Check if all others passed
    const activePlayers = this.state.players.filter(
      (p) => p.id !== null && p.hand.length > 0
    );
    const allOthersPassed = activePlayers.every(
      (p) => p.id === this.state.lastPlayedBy || p.passed
    );

    if (allOthersPassed && this.state.lastPlayedBy) {
      // Winner of trick starts new trick
      this.state.currentTrick = [];
      this.state.lastCombination = null;
      this.state.players.forEach((p) => (p.passed = false));
      const winnerIndex = this.state.players.findIndex(
        (p) => p.id === this.state.lastPlayedBy
      );
      this.state.currentTurnIndex = winnerIndex;
    } else {
      this.advanceTurn();
    }

    this.broadcastState();
    this.setState({ ...this.state });

    this.checkBotTurn();
  }

  private advanceTurn(): void {
    let nextIndex = (this.state.currentTurnIndex + 1) % 4;
    let attempts = 0;

    while (attempts < 4) {
      const player = this.state.players[nextIndex];
      if (player.id !== null && player.hand.length > 0 && !player.passed) {
        break;
      }
      nextIndex = (nextIndex + 1) % 4;
      attempts++;
    }

    this.state.currentTurnIndex = nextIndex;
  }

  private playerHasCards(player: PlayerSlot, cards: Card[]): boolean {
    return cards.every((card) =>
      player.hand.some((c) => c.rank === card.rank && c.suit === card.suit)
    );
  }

  private removeCardsFromHand(player: PlayerSlot, cards: Card[]): void {
    for (const card of cards) {
      const index = player.hand.findIndex(
        (c) => c.rank === card.rank && c.suit === card.suit
      );
      if (index !== -1) {
        player.hand.splice(index, 1);
      }
    }
  }

  // ============== Slot Management ==============

  private handleAddBot(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players[slotIndex].id !== null) return;

    const botId = `BOT_${slotIndex}_${Date.now()}`;
    const newPlayers = [...this.state.players];
    newPlayers[slotIndex] = {
      id: botId,
      username: `Bot ${slotIndex + 1}`,
      hand: [],
      isBot: true,
      isGuest: false,
      isHost: false,
      passed: false,
    };
    this.state = { ...this.state, players: newPlayers };

    this.broadcastState();
    this.onStateChange?.(this.state);
  }

  private handleJoinSlot(
    slotIndex: number,
    playerId: string,
    playerName: string
  ): void {
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players[slotIndex].id !== null) return;
    // Check if player is already in another slot
    if (this.state.players.some((p) => p.id === playerId)) return;

    const newPlayers = [...this.state.players];
    newPlayers[slotIndex] = {
      id: playerId,
      username: playerName,
      hand: [],
      isBot: false,
      isGuest: false, // They're a real player now
      isHost: false,
      passed: false,
    };
    this.state = { ...this.state, players: newPlayers };

    this.broadcastState();
    this.onStateChange?.(this.state);
  }

  private handleRemovePlayer(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.gamePhase !== "waiting") return;

    const player = this.state.players[slotIndex];
    // Can only remove bots and guests, not real players
    if (!player.isBot && !player.isGuest) return;

    const newPlayers = [...this.state.players];
    newPlayers[slotIndex] = {
      id: null,
      username: `Slot ${slotIndex + 1}`,
      hand: [],
      isBot: false,
      isGuest: false,
      isHost: false,
      passed: false,
    };
    this.state = { ...this.state, players: newPlayers };

    this.broadcastState();
    this.onStateChange?.(this.state);
  }

  // ============== Game Flow ==============

  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;

    // Need at least 2 players
    const filledSlots = this.state.players.filter((p) => p.id !== null).length;
    if (filledSlots < 2) return;

    this.dealCards();
    this.state.gamePhase = "playing";
    this.state.currentTurnIndex = this.findStartingPlayer();
    this.state.currentTrick = [];
    this.state.lastCombination = null;
    this.state.lastPlayedBy = null;

    this.broadcastState();
    this.setState({ ...this.state });

    this.checkBotTurn();
  }

  private findStartingPlayer(): number {
    // Player with 3♠ starts (or lowest card if not dealt)
    for (let i = 0; i < 4; i++) {
      const player = this.state.players[i];
      if (
        player.id &&
        player.hand.some((c) => c.rank === Rank.THREE && c.suit === Suit.SPADE)
      ) {
        return i;
      }
    }
    // Fallback: first player with cards
    return this.state.players.findIndex((p) => p.id !== null);
  }

  private handleNewGameRequest(playerId: string, playerName: string): void {
    this.state.newGameRequest = { fromId: playerId, fromName: playerName };
    this.broadcastState();
    this.setState({ ...this.state });
  }

  reset(): void {
    const slots: PlayerSlot[] = this.state.players.map((p, _i) => ({
      id: p.id,
      username: p.username,
      hand: [],
      isBot: p.isBot,
      isGuest: p.isGuest,
      isHost: p.isHost,
      passed: false,
    }));

    this.state = {
      players: slots,
      currentTrick: [],
      currentTurnIndex: 0,
      lastPlayedBy: null,
      lastCombination: null,
      winner: null,
      gamePhase: "waiting",
      newGameRequest: null,
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
    // Update player slots with new players from room
    for (let i = 0; i < Math.min(players.length, 4); i++) {
      const slot = this.state.players[i];
      if (!slot.isBot && !slot.isGuest) {
        slot.id = players[i]?.id || null;
        slot.username = players[i]?.username || `Slot ${i + 1}`;
      }
    }
    this.broadcastState();
    this.setState({ ...this.state });
  }

  // ============== Bot AI ==============

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    if (currentPlayer.isBot && currentPlayer.id) {
      setTimeout(() => this.makeBotMove(currentPlayer), 800);
    }
  }

  private makeBotMove(bot: PlayerSlot): void {
    if (this.state.gamePhase !== "playing") return;
    if (!bot.id) return;

    // Try to find a valid play
    const validPlay = this.findValidPlay(bot.hand);

    if (validPlay) {
      this.handlePlayCards(bot.id, validPlay);
    } else if (this.state.lastCombination) {
      // Pass if can't beat
      this.handlePass(bot.id);
    } else {
      // Must play if starting new trick - play lowest single
      this.handlePlayCards(bot.id, [bot.hand[0]]);
    }
  }

  private findValidPlay(hand: Card[]): Card[] | null {
    const lastCombo = this.state.lastCombination;

    if (!lastCombo) {
      // Starting new trick - play lowest single
      return [hand[0]];
    }

    // Try to find matching combination that beats the last
    switch (lastCombo.type) {
      case CombinationType.SINGLE:
        return this.findBeatingSingle(hand, lastCombo);
      case CombinationType.PAIR:
        return this.findBeatingPair(hand, lastCombo);
      case CombinationType.TRIPLE:
        return this.findBeatingTriple(hand, lastCombo);
      case CombinationType.STRAIGHT:
        return this.findBeatingStraight(hand, lastCombo);
      default:
        return null;
    }
  }

  private findBeatingSingle(
    hand: Card[],
    lastCombo: Combination
  ): Card[] | null {
    const lastValue = this.getCardValue(lastCombo.cards[0]);
    for (const card of hand) {
      if (this.getCardValue(card) > lastValue) {
        return [card];
      }
    }
    return null;
  }

  private findBeatingPair(hand: Card[], lastCombo: Combination): Card[] | null {
    const lastValue = lastCombo.value;
    const grouped = this.groupByRank(hand);

    for (const cards of Object.values(grouped)) {
      if (cards.length >= 2) {
        const pair = cards.slice(0, 2);
        const combo = this.getCombination(pair);
        if (combo && combo.value > lastValue) {
          return pair;
        }
      }
    }
    return null;
  }

  private findBeatingTriple(
    hand: Card[],
    lastCombo: Combination
  ): Card[] | null {
    const lastValue = lastCombo.value;
    const grouped = this.groupByRank(hand);

    for (const cards of Object.values(grouped)) {
      if (cards.length >= 3) {
        const triple = cards.slice(0, 3);
        const combo = this.getCombination(triple);
        if (combo && combo.value > lastValue) {
          return triple;
        }
      }
    }
    return null;
  }

  private findBeatingStraight(
    hand: Card[],
    lastCombo: Combination
  ): Card[] | null {
    const requiredLength = lastCombo.cards.length;
    const lastValue = lastCombo.value;

    // Simple: try all consecutive combinations
    for (let start = 0; start <= hand.length - requiredLength; start++) {
      const potential = hand.slice(start, start + requiredLength);
      const combo = this.getCombination(potential);
      if (
        combo &&
        combo.type === CombinationType.STRAIGHT &&
        combo.value > lastValue
      ) {
        return potential;
      }
    }
    return null;
  }

  private groupByRank(hand: Card[]): Record<number, Card[]> {
    const groups: Record<number, Card[]> = {};
    for (const card of hand) {
      if (!groups[card.rank]) groups[card.rank] = [];
      groups[card.rank].push(card);
    }
    return groups;
  }

  // ============== Public API ==============

  requestPlayCards(cards: Card[]): void {
    const action: ThirteenAction = {
      type: "PLAY_CARDS",
      playerId: this.userId,
      cards,
    };
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  requestPass(): void {
    const action: ThirteenAction = {
      type: "PASS",
      playerId: this.userId,
    };
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  requestAddBot(slotIndex: number): void {
    const action: ThirteenAction = { type: "ADD_BOT", slotIndex };
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  requestJoinSlot(slotIndex: number, playerName: string): void {
    const action: ThirteenAction = {
      type: "JOIN_SLOT",
      slotIndex,
      playerId: this.userId,
      playerName,
    };
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  requestRemovePlayer(slotIndex: number): void {
    const action: ThirteenAction = { type: "REMOVE_PLAYER", slotIndex };
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  requestStartGame(): void {
    const action: ThirteenAction = { type: "START_GAME" };
    if (this.isHost) {
      this.handleAction({ action });
    } else {
      this.sendAction(action);
    }
  }

  requestNewGame(): void {
    if (this.isHost) {
      this.handleAction({ action: { type: "NEW_GAME" } });
    } else {
      // Guest requests - send to host for approval
      const player = this.state.players.find((p) => p.id === this.userId);
      const action: ThirteenAction = {
        type: "REQUEST_NEW_GAME",
        playerId: this.userId,
        playerName: player?.username || "Guest",
      };
      this.sendAction(action);
    }
  }

  acceptNewGame(): void {
    if (!this.isHost) return;
    this.handleAction({ action: { type: "ACCEPT_NEW_GAME" } });
  }

  declineNewGame(): void {
    if (!this.isHost) return;
    this.handleAction({ action: { type: "DECLINE_NEW_GAME" } });
  }

  getMyPlayerIndex(): number {
    return this.state.players.findIndex((p) => p.id === this.userId);
  }

  getUserId(): string {
    return this.userId;
  }

  canStartGame(): boolean {
    if (this.state.gamePhase !== "waiting") return false;
    const filledSlots = this.state.players.filter((p) => p.id !== null).length;
    return filledSlots >= 2;
  }

  // Public method to validate selected cards and return error message if invalid
  validateSelectedCards(cards: Card[]): { valid: boolean; error?: string } {
    if (cards.length === 0) {
      return { valid: false, error: "Select cards to play" };
    }

    const combination = this.getCombination(cards);
    if (!combination) {
      if (cards.length === 2) {
        return { valid: false, error: "Cards must be a pair (same rank)" };
      }
      if (cards.length === 3) {
        return { valid: false, error: "Cards must be a triple or straight" };
      }
      if (cards.length >= 4) {
        return {
          valid: false,
          error: "Invalid combination (try straight or four-of-a-kind)",
        };
      }
      return { valid: false, error: "Invalid card selection" };
    }

    const lastCombo = this.state.lastCombination;
    if (!lastCombo) {
      return { valid: true };
    }

    // Check type mismatch
    if (combination.type !== lastCombo.type) {
      // Special case: four of a kind can beat single 2
      if (
        combination.type === CombinationType.FOUR_OF_KIND &&
        lastCombo.type === CombinationType.SINGLE &&
        lastCombo.cards[0].rank === Rank.TWO
      ) {
        return { valid: true };
      }
      // Special case: three consecutive pairs (sám cô) can beat single 2
      if (
        combination.type === CombinationType.THREE_CONSECUTIVE_PAIRS &&
        lastCombo.type === CombinationType.SINGLE &&
        lastCombo.cards[0].rank === Rank.TWO
      ) {
        return { valid: true };
      }
      return {
        valid: false,
        error: `Must play ${lastCombo.type.replace("_", " ")}`,
      };
    }

    // Check length mismatch for straights
    if (
      combination.type === CombinationType.STRAIGHT &&
      combination.cards.length !== lastCombo.cards.length
    ) {
      return {
        valid: false,
        error: `Straight must have ${lastCombo.cards.length} cards`,
      };
    }

    // Check value
    if (combination.value <= lastCombo.value) {
      return { valid: false, error: "Your cards are too low" };
    }

    return { valid: true };
  }
}
