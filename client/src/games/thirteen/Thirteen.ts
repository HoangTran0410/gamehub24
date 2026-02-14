import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import {
  type ThirteenState,
  type ThirteenAction,
  type Card,
  type Combination,
  type PlayerSlot,
  Suit,
  CombinationType,
  CombinationName,
  encodeCard,
  decodeCard,
  Rank,
  type BotPersona,
} from "./types";
import type { Player } from "../../stores/roomStore";

export default class Thirteen extends BaseGame<ThirteenState> {
  protected isGameOver(state: ThirteenState): boolean {
    return state.gamePhase === "ended";
  }

  getInitState(): ThirteenState {
    // Initialize 4 player slots
    const slots: PlayerSlot[] = Array(4)
      .fill(null)
      .map((_, i) => {
        const player = this.players[i];
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

    return {
      players: slots,
      currentTrick: [],
      currentTurnIndex: 0,
      lastPlayedBy: null,
      lastCombination: null,
      winner: null,
      rankings: [],
      gamePhase: "waiting",
      newGameRequest: null,
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
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
          action.playerName,
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

        break;
    }
  }

  // ============== Card Logic ==============

  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of [Suit.SPADE, Suit.CLUB, Suit.DIAMOND, Suit.HEART]) {
      for (let rank = Rank.THREE; rank <= Rank.TWO; rank++) {
        deck.push(encodeCard(rank as any, suit as any));
      }
    }
    return deck;
  }

  private selectedHandPattern: string = "random";

  public setHandPattern(pattern: string): void {
    this.selectedHandPattern = pattern;
  }

  public getHandPattern(): string {
    return this.selectedHandPattern;
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
    let deck = this.createDeck();

    if (this.selectedHandPattern !== "random") {
      const { patternCards, remainingDeck } = this.extractPattern(
        deck,
        this.selectedHandPattern,
      );
      // Ensure patternCards are added first, then fill up to 13 with shuffled remaining
      const initialHand = [
        ...patternCards,
        ...this.shuffleDeck(remainingDeck).slice(0, 13 - patternCards.length),
      ];
      // Add the rest of the cards to the deck for other players
      const usedCards = new Set(initialHand);
      const leftover = this.shuffleDeck(
        this.createDeck().filter((c) => !usedCards.has(c)),
      );
      deck = [...initialHand, ...leftover];
    } else {
      deck = this.shuffleDeck(deck);
    }

    const cardsPerPlayer = 13;
    let cardIndex = 0;
    for (const player of this.state.players) {
      if (player.id !== null) {
        player.hand = deck.slice(cardIndex, cardIndex + cardsPerPlayer);
        this.sortHand(player.hand);
        cardIndex += cardsPerPlayer;
      }
    }
  }

  private extractPattern(
    deck: Card[],
    pattern: string,
  ): { patternCards: Card[]; remainingDeck: Card[] } {
    let patternCards: Card[] = [];

    const byRank = this.groupByRank(deck);
    const availableRanks = Object.keys(byRank)
      .map(Number)
      .sort(() => Math.random() - 0.5);

    switch (pattern) {
      case CombinationType.FOUR_OF_KIND: {
        for (const rank of availableRanks) {
          if (byRank[rank].length === 4) {
            patternCards = byRank[rank];
            break;
          }
        }
        break;
      }
      case CombinationType.TRIPLE: {
        for (const rank of availableRanks) {
          if (byRank[rank].length >= 3) {
            patternCards = byRank[rank].slice(0, 3);
            break;
          }
        }
        break;
      }
      case CombinationType.PAIR: {
        for (const rank of availableRanks) {
          if (byRank[rank].length >= 2) {
            patternCards = byRank[rank].slice(0, 2);
            break;
          }
        }
        break;
      }
      case CombinationType.THREE_CONSECUTIVE_PAIRS: {
        // Try random starting rank for consecutive pairs
        const startRanks = Array.from(
          { length: Rank.KING - Rank.THREE + 1 },
          (_, i) => i + Rank.THREE,
        ).sort(() => Math.random() - 0.5);

        for (const r of startRanks) {
          if (
            r + 2 <= Rank.KING &&
            byRank[r]?.length >= 2 &&
            byRank[r + 1]?.length >= 2 &&
            byRank[r + 2]?.length >= 2
          ) {
            patternCards = [
              ...byRank[r].slice(0, 2),
              ...byRank[r + 1].slice(0, 2),
              ...byRank[r + 2].slice(0, 2),
            ];
            break;
          }
        }
        break;
      }
      case CombinationType.FOUR_CONSECUTIVE_PAIRS: {
        const startRanks = Array.from(
          { length: Rank.QUEEN - Rank.THREE + 1 },
          (_, i) => i + Rank.THREE,
        ).sort(() => Math.random() - 0.5);

        for (const r of startRanks) {
          if (
            r + 3 <= Rank.KING &&
            byRank[r]?.length >= 2 &&
            byRank[r + 1]?.length >= 2 &&
            byRank[r + 2]?.length >= 2 &&
            byRank[r + 3]?.length >= 2
          ) {
            patternCards = [
              ...byRank[r].slice(0, 2),
              ...byRank[r + 1].slice(0, 2),
              ...byRank[r + 2].slice(0, 2),
              ...byRank[r + 3].slice(0, 2),
            ];
            break;
          }
        }
        break;
      }
      case CombinationType.STRAIGHT: {
        // Try to generate a random length straight
        const length = Math.floor(Math.random() * 5) + 5; // 5 to 9 cards
        const startRanks = Array.from(
          { length: Rank.ACE - length + 1 - Rank.THREE + 1 },
          (_, i) => i + Rank.THREE,
        ).sort(() => Math.random() - 0.5);

        for (const startRank of startRanks) {
          let found = true;
          const selected: Card[] = [];
          for (let i = 0; i < length; i++) {
            if (byRank[startRank + i]?.length > 0) {
              selected.push(byRank[startRank + i][0]);
            } else {
              found = false;
              break;
            }
          }
          if (found) {
            patternCards = selected;
            break;
          }
        }
        break;
      }
    }

    const used = new Set(patternCards);
    const remainingDeck = deck.filter((c) => !used.has(c));
    return { patternCards, remainingDeck };
  }

  private sortHand(hand: Card[]): void {
    hand.sort((a, b) => a - b);
  }

  // Validate combination of cards
  private getCombination(cards: Card[]): Combination | null {
    if (cards.length === 0) return null;

    const sorted = [...cards].sort((a, b) => a - b);

    // Single
    if (cards.length === 1) {
      return {
        type: CombinationType.SINGLE,
        cardCount: 1,
        value: sorted[0],
      };
    }

    // Check if all same rank (pair, triple, four of a kind)
    const allSameRank = cards.every(
      (c) => decodeCard(c).rank === decodeCard(cards[0]).rank,
    );

    if (allSameRank) {
      if (cards.length === 2) {
        return {
          type: CombinationType.PAIR,
          cardCount: 2,
          value: sorted[sorted.length - 1],
        };
      }
      if (cards.length === 3) {
        return {
          type: CombinationType.TRIPLE,
          cardCount: 3,
          value: sorted[sorted.length - 1],
        };
      }
      if (cards.length === 4) {
        return {
          type: CombinationType.FOUR_OF_KIND,
          cardCount: 4,
          value: sorted[sorted.length - 1],
        };
      }
    }

    // Check straight (3+ consecutive ranks, no 2s allowed in middle)
    if (cards.length >= 3) {
      const isStraight = this.isStraight(sorted);
      if (isStraight) {
        return {
          type: CombinationType.STRAIGHT,
          cardCount: cards.length,
          value: sorted[sorted.length - 1] * 100 + cards.length,
        };
      }
    }

    // Check three consecutive pairs: 334455, 778899, etc.
    if (cards.length === 6) {
      const isThreeConsecutivePairs = this.isThreeConsecutivePairs(sorted);
      if (isThreeConsecutivePairs) {
        return {
          type: CombinationType.THREE_CONSECUTIVE_PAIRS,
          cardCount: 6,
          value: sorted[sorted.length - 1],
        };
      }
    }

    // Check four consecutive pairs: 33445566, etc.
    if (cards.length === 8) {
      const isFourConsecutivePairs = this.isFourConsecutivePairs(sorted);
      if (isFourConsecutivePairs) {
        return {
          type: CombinationType.FOUR_CONSECUTIVE_PAIRS,
          cardCount: 8,
          value: sorted[sorted.length - 1],
        };
      }
    }

    return null;
  }

  // Check if cards form consecutive pairs
  private isConsecutivePairs(sorted: Card[], count: number): boolean {
    if (sorted.length !== count * 2) return false;

    for (let i = 0; i < count; i++) {
      const c1 = decodeCard(sorted[i * 2]);
      const c2 = decodeCard(sorted[i * 2 + 1]);

      // Each pair must have same rank
      if (c1.rank !== c2.rank) return false;

      // No 2s allowed in consecutive pairs
      if (c1.rank === Rank.TWO) return false;

      // Compare with next pair
      if (i < count - 1) {
        const nextPairFirst = decodeCard(sorted[(i + 1) * 2]);
        if (nextPairFirst.rank !== c1.rank + 1) return false;
      }
    }
    return true;
  }

  // Check if 6 cards form 3 consecutive pairs
  private isThreeConsecutivePairs(sorted: Card[]): boolean {
    return this.isConsecutivePairs(sorted, 3);
  }

  // Check if 8 cards form 4 consecutive pairs
  private isFourConsecutivePairs(sorted: Card[]): boolean {
    return this.isConsecutivePairs(sorted, 4);
  }

  private isStraight(sorted: Card[]): boolean {
    // Cannot have 2 in a straight (2 is the highest)
    if (sorted.some((c) => decodeCard(c).rank === Rank.TWO)) return false;

    for (let i = 1; i < sorted.length; i++) {
      if (decodeCard(sorted[i]).rank !== decodeCard(sorted[i - 1]).rank + 1)
        return false;
    }
    return true;
  }

  // Check if new combination can beat the last one
  private canBeat(
    newCombo: Combination,
    lastCombo: Combination | null,
  ): boolean {
    if (!lastCombo) return true;

    // Higher combinations can beat 2s
    const lastCards =
      this.state.currentTrick[this.state.currentTrick.length - 1]?.cards;
    if (lastCards && lastCards.length > 0) {
      const lastRank = decodeCard(lastCards[0]).rank;

      // Single 2 can be beaten by Quad or 3+ Consecutive Pairs
      if (lastCombo.type === CombinationType.SINGLE && lastRank === Rank.TWO) {
        if (
          newCombo.type === CombinationType.FOUR_OF_KIND ||
          newCombo.type === CombinationType.THREE_CONSECUTIVE_PAIRS ||
          newCombo.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
        ) {
          return true;
        }
      }

      // Pair of 2s can be beaten by Quad or 4+ Consecutive Pairs
      if (lastCombo.type === CombinationType.PAIR && lastRank === Rank.TWO) {
        if (
          newCombo.type === CombinationType.FOUR_OF_KIND ||
          newCombo.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
        ) {
          return true;
        }
      }

      // 3 Consecutive Pairs can be beaten by Quad or 4 Consecutive Pairs
      if (lastCombo.type === CombinationType.THREE_CONSECUTIVE_PAIRS) {
        if (
          newCombo.type === CombinationType.FOUR_OF_KIND ||
          newCombo.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
        ) {
          return true;
        }
      }

      // Quad can be beaten by 4 Consecutive Pairs
      if (
        lastCombo.type === CombinationType.FOUR_OF_KIND &&
        newCombo.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
      ) {
        return true;
      }
    }

    // Must be same type
    if (newCombo.type !== lastCombo.type) return false;

    // Must be same length for straights
    if (
      newCombo.type === CombinationType.STRAIGHT &&
      newCombo.cardCount !== lastCombo.cardCount
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

    // Check if player finished their hand
    if (player.hand.length === 0) {
      // Add to rankings if not already there
      if (!this.state.rankings.includes(playerId)) {
        this.state.rankings.push(playerId);
      }
      // Set winner to first finisher
      if (!this.state.winner) {
        this.state.winner = playerId;
      }

      // Check remaining players with cards
      const playersWithCards = this.state.players.filter(
        (p) => p.id !== null && p.hand.length > 0,
      );

      // If only 1 player left with cards, auto-rank them last
      if (playersWithCards.length <= 1) {
        for (const p of playersWithCards) {
          if (p.id && !this.state.rankings.includes(p.id)) {
            this.state.rankings.push(p.id);
          }
        }
        this.state.gamePhase = "ended";
        this.clearSavedState();
        return;
      }

      // If all human players finished, also end game (rank remaining bots)
      const humanPlayersWithCards = playersWithCards.filter((p) => !p.isBot);
      if (humanPlayersWithCards.length === 0) {
        const sorted = playersWithCards.sort(
          (a, b) => a.hand.length - b.hand.length,
        );
        for (const p of sorted) {
          if (p.id && !this.state.rankings.includes(p.id)) {
            this.state.rankings.push(p.id);
          }
        }
        this.state.gamePhase = "ended";
        this.clearSavedState();
        return;
      }
    }

    // Move to next player or resolve trick end
    if (!this.resolveTrickEnd()) {
      this.advanceTurn();
    }

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

    if (!this.resolveTrickEnd()) {
      this.advanceTurn();
    }

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

  /**
   * Checks if the current trick is over (all other active players passed)
   * and resets the game state for a new trick if it is.
   * Returns true if the trick was resolved/reset.
   */
  private resolveTrickEnd(): boolean {
    if (!this.state.lastPlayedBy) return false;

    // Active players are those who still have cards
    const activePlayers = this.state.players.filter(
      (p) => p.id !== null && p.hand.length > 0,
    );

    // Trick is over if all other active players have passed
    const allOthersPassed = activePlayers.every(
      (p) => p.id === this.state.lastPlayedBy || p.passed,
    );

    if (allOthersPassed) {
      // Current trick winner starts the new trick
      this.state.currentTrick = [];
      this.state.lastCombination = null;
      this.state.players.forEach((p) => (p.passed = false));

      const winnerIndex = this.state.players.findIndex(
        (p) => p.id === this.state.lastPlayedBy,
      );

      if (winnerIndex !== -1) {
        this.state.currentTurnIndex = winnerIndex;
        // If the winner already finished their hand, find the next active player
        const winnerPlayer = this.state.players[winnerIndex];
        if (winnerPlayer.hand.length === 0) {
          this.advanceTurn();
        }
      }
      return true;
    }

    return false;
  }

  private playerHasCards(player: PlayerSlot, cards: Card[]): boolean {
    return cards.every((card) => player.hand.some((c) => c === card));
  }

  private removeCardsFromHand(player: PlayerSlot, cards: Card[]): void {
    for (const card of cards) {
      const index = player.hand.findIndex((c) => c === card);
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
    this.state.players[slotIndex] = {
      id: botId,
      username: `Bot ${slotIndex + 1}`,
      hand: [],
      isBot: true,
      isHost: false,
      passed: false,
    };
  }

  private handleJoinSlot(
    slotIndex: number,
    playerId: string,
    playerName: string,
  ): void {
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players[slotIndex].id !== null) return;
    // Check if player is already in another slot
    if (this.state.players.some((p) => p.id === playerId)) return;

    this.state.players[slotIndex] = {
      id: playerId,
      username: playerName,
      hand: [],
      isBot: false,
      isHost: false,
      passed: false,
    };
  }

  private handleRemovePlayer(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.gamePhase !== "waiting") return;

    this.state.players[slotIndex] = {
      id: null,
      username: `Slot ${slotIndex + 1}`,
      hand: [],
      isBot: false,
      isHost: false,
      passed: false,
    };
  }

  // ============== Game Flow ==============

  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;

    // Need at least 2 players
    const filledSlots = this.state.players.filter((p) => p.id !== null).length;
    if (filledSlots < 2) return;

    this.dealCards();
    this.state.gamePhase = "playing";

    // Assign random personas to bots
    const personas: BotPersona[] = ["cautious", "aggressive", "balanced"];
    this.state.players.forEach((p) => {
      if (p.isBot) {
        p.persona = personas[Math.floor(Math.random() * personas.length)];
      }
    });

    this.state.currentTurnIndex = this.findStartingPlayer();
    this.state.currentTrick = [];
    this.state.lastCombination = null;
    this.state.lastPlayedBy = null;

    this.checkBotTurn();
  }

  private findStartingPlayer(): number {
    // Player with 3♠ starts (or lowest card if not dealt)
    for (let i = 0; i < 4; i++) {
      const player = this.state.players[i];
      if (
        player.id &&
        player.hand.some((c) => c === encodeCard(Rank.THREE, Suit.SPADE))
      ) {
        return i;
      }
    }
    // Fallback: first player with cards
    return this.state.players.findIndex((p) => p.id !== null);
  }

  private handleNewGameRequest(playerId: string, playerName: string): void {
    if (this.isHost) {
      this.reset();
    } else {
      this.state.newGameRequest = { fromId: playerId, fromName: playerName };
    }
  }

  reset(): void {
    const slots: PlayerSlot[] = this.state.players.map((p, _i) => ({
      id: p.id,
      username: p.username,
      hand: [],
      isBot: p.isBot,
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
      rankings: [],
      gamePhase: "waiting",
      newGameRequest: null,
    };

    this.selectedHandPattern = "random";
  }

  checkGameEnd(): GameResult | null {
    if (this.state.winner) {
      return { winner: this.state.winner };
    }
    return null;
  }

  updatePlayers(players: Player[]): void {
    // Determine which players are currently in slots
    for (let i = 0; i < 4; i++) {
      const slot = this.state.players[i];
      if (!slot.isBot) {
        // Check if this player is still in the room
        const existingPlayer = players.find((p) => p.id === slot.id);
        if (existingPlayer) {
          // Update details if they are still here
          slot.username = existingPlayer.username;
        } else {
          // Player left the room, clear the slot
          slot.id = null;
          slot.username = `Slot ${i + 1}`;
          slot.hand = [];
          slot.passed = false;
        }

        // reset hand pattern if there are real players
        if (!slot.isHost) this.setHandPattern("random");
      }
    }
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
    const validPlay = this.findValidPlay(bot.hand, bot.persona || "balanced");

    if (validPlay) {
      this.handlePlayCards(bot.id, validPlay);
    } else if (this.state.lastCombination) {
      // Pass if can't beat (or chooses to pass based on persona)
      this.handlePass(bot.id);
    } else {
      // Must play if starting new trick
      // Always play lowest (Tẩu rác) unless blocking
      this.handlePlayCards(bot.id, [bot.hand[0]]);
    }
  }

  private findValidPlay(hand: Card[], persona: BotPersona): Card[] | null {
    const lastCombo = this.state.lastCombination;

    // Cautious bot might pass if the table is already quite high
    if (persona === "cautious" && lastCombo) {
      const opponentNearFinish = this.isOpponentNearFinish();

      // If table is Ace or 2, cautious bot usually passes unless it's a finisher
      // OR unless someone is about to win (must defend!)
      if (
        lastCombo.value >= Rank.ACE &&
        hand.length > 3 &&
        !opponentNearFinish
      ) {
        return null; // Voluntary pass
      }
    }

    if (!lastCombo) {
      // Starting new trick - find best opening play
      return this.findBestOpeningPlay(hand, persona);
    }

    // Try to find matching combination that beats the last
    switch (lastCombo.type) {
      case CombinationType.SINGLE: {
        // Special case: Chopping a 2
        const lastCards =
          this.state.currentTrick[this.state.currentTrick.length - 1].cards;
        if (decodeCard(lastCards[0]).rank === Rank.TWO) {
          // Check for 3 consecutive pairs
          const threePairs = this.findThreeConsecutivePairs(hand);
          if (threePairs.length > 0) return threePairs[0];

          // Check for Four of a Kind
          const fourKinds = this.findFourOfAKind(hand);
          if (fourKinds.length > 0) return fourKinds[0];

          // Check for 4 consecutive pairs
          const fourPairs = this.findFourConsecutivePairs(hand);
          if (fourPairs.length > 0) return fourPairs[0];
        }
        return this.findBeatingSingle(hand, lastCombo);
      }
      case CombinationType.PAIR: {
        const lastCards =
          this.state.currentTrick[this.state.currentTrick.length - 1].cards;
        if (decodeCard(lastCards[0]).rank === Rank.TWO) {
          // Check for Four of a Kind
          const fourKinds = this.findFourOfAKind(hand);
          if (fourKinds.length > 0) return fourKinds[0];

          // Check for 4 consecutive pairs
          const fourPairs = this.findFourConsecutivePairs(hand);
          if (fourPairs.length > 0) return fourPairs[0];
        }
        return this.findBeatingPair(hand, lastCombo);
      }
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
    _lastCombo: Combination,
  ): Card[] | null {
    const lastCards =
      this.state.currentTrick[this.state.currentTrick.length - 1].cards;
    const lastValue = lastCards[0];
    for (const card of hand) {
      if (card > lastValue) {
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
    lastCombo: Combination,
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
    lastCombo: Combination,
  ): Card[] | null {
    const requiredLength = lastCombo.cardCount;
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
      const { rank } = decodeCard(card);
      if (!groups[rank]) groups[rank] = [];
      groups[rank].push(card);
    }
    return groups;
  }

  // ============== Bot Strategy ==============

  private isOpponentNearFinish(len = 2): boolean {
    return this.state.players.some(
      (p, index) =>
        index !== this.state.currentTurnIndex &&
        p.id !== null &&
        p.hand.length === len,
    );
  }

  private findBestOpeningPlay(hand: Card[], persona: BotPersona): Card[] {
    const opponentNearFinish = this.isOpponentNearFinish();

    // 1. Try to find straights (longest first)
    const straights = this.findStraights(hand);
    if (straights.length > 0) {
      // Aggressive bot prefers longer straights to gain control
      // Cautious bot might play shorter ones to "tẩu rác" if it has many
      straights.sort((a, b) => b.length - a.length);
      return straights[0];
    }

    // 2. Try to find triples (excluding 2s unless near finish or finishing)
    const isEndGame = hand.length < 5;
    const excludeTwos = !opponentNearFinish && !isEndGame;
    const triples = this.findTriples(hand, excludeTwos);
    if (triples.length > 0) {
      return triples[0];
    }

    // 3. Try to find pairs (excluding 2s unless near finish or finishing)
    const pairs = this.findPairs(hand, excludeTwos);
    if (pairs.length > 0) {
      return pairs[0];
    }

    // 4. Special strong combinations (Hàng)
    // Cautious saves them for the absolute end.
    // Aggressive might use them to lead if it has no sets.
    const shouldPlayHang =
      opponentNearFinish ||
      (persona === "aggressive" && hand.length < 8) ||
      hand.length < 5;

    if (shouldPlayHang) {
      const threePairs = this.findThreeConsecutivePairs(hand);
      if (threePairs.length > 0) return threePairs[0];

      const fourOfKinds = this.findFourOfAKind(hand);
      if (fourOfKinds.length > 0) return fourOfKinds[0];
    }

    // 5. Default to single card (Tẩu rác)
    if (opponentNearFinish) {
      // Chốt
      return [hand[hand.length - 1]];
    }

    // Default: play lowest single to "tẩu rác"
    return [hand[0]];
  }

  // ============== Smart Selection Logic ==============

  /**
   * Suggests the best cards to select based on the user's current selection.
   * prioritizing larger sets (straights, quads, triples, pairs) over smaller ones.
   */
  public getSuggestion(hand: Card[], currentSelection: Card[]): Card[] {
    if (currentSelection.length === 0) return [];

    // Use the last selected card as the "pivot" for suggestion
    const pivotCard = currentSelection[currentSelection.length - 1];

    // Find all valid combinations containing the pivot card
    const candidates = this.findAllCombinationsWithCard(hand, pivotCard);

    // Filter based on game state (must beat last combination if exists)
    const validCandidates = candidates.filter((cards) => {
      // getCombination detects it correctly
      // 1. Must contain the pivot card (already guaranteed)

      // 2. If defending, must beat the last combination
      if (this.state.lastCombination) {
        // Special check: if last combo is 2 (single), we can use 3-pairs or 4-kinds
        // The canBeat logic handles this, but we need to ensure getCombination detects it correctly
        const combo = this.getCombination(cards);
        return combo && this.canBeat(combo, this.state.lastCombination);
      }

      // If attacking (new trick), any valid combo is fine
      return true;
    });

    if (validCandidates.length === 0) return [];

    // Sort candidates by priority:
    // 1. Length (descending)
    // 2. Value (ascending) - weakest valid set first
    validCandidates.sort((a, b) => {
      // Length descending
      if (b.length !== a.length) return b.length - a.length;

      // Value ascending
      const comboA = this.getCombination(a);
      const comboB = this.getCombination(b);
      if (!comboA || !comboB) return 0;
      return comboA.value - comboB.value;
    });

    return validCandidates[0];
  }

  private findAllCombinationsWithCard(hand: Card[], pivotCard: Card): Card[][] {
    const results: Card[][] = [];
    const pivotRank = decodeCard(pivotCard).rank;

    // 1. Straights containing pivot
    // Generate straights dynamically to avoid explosion
    const straights = this.findStraightsWaitCard(hand, pivotCard);
    results.push(...straights);

    // 2. Same Rank Combinations (Pair, Triple, Quad)
    const sameRankCards = hand.filter((c) => decodeCard(c).rank === pivotRank);
    // Sort same rank cards
    sameRankCards.sort((a, b) => a - b);

    // Add the full set (e.g. if 3 cards, add as Triple)
    if (sameRankCards.length === 4) results.push(sameRankCards); // Quad
    if (sameRankCards.length >= 3) {
      // Add all triples containing pivot
      // For simplicity, just add the set of 3 if length is 3.
      // If 4, we have combinations. But priority is Quad.
      // If defending against Triple, we need Triple.

      // Let's generate all subsets containing pivot
      if (sameRankCards.length === 4) {
        // 4 choose 3 containing pivot -> 3 triples
        const others = sameRankCards.filter((c) => c !== pivotCard);
        // others has 3 cards. 3 choose 2 -> 3 pairs.
        // triples = pivot + 2 others.
        for (let i = 0; i < others.length; i++) {
          for (let j = i + 1; j < others.length; j++) {
            results.push(
              [pivotCard, others[i], others[j]].sort((a, b) => a - b),
            );
          }
        }
      } else {
        results.push(sameRankCards); // Triple
      }
    }
    if (sameRankCards.length >= 2) {
      // Add pairs containing pivot
      const others = sameRankCards.filter((c) => c !== pivotCard);
      for (const other of others) {
        results.push([pivotCard, other].sort((a, b) => a - b));
      }
    }

    // 3. Three consecutive pairs containing pivot
    const threePairs = this.findThreeConsecutivePairs(hand);
    for (const tp of threePairs) {
      if (tp.includes(pivotCard)) results.push(tp);
    }

    // 4. Four consecutive pairs containing pivot
    const fourPairs = this.findFourConsecutivePairs(hand);
    for (const fp of fourPairs) {
      if (fp.includes(pivotCard)) results.push(fp);
    }

    // 5. Single
    results.push([pivotCard]);

    return results;
  }

  // Find straights that strictly contain the pivot card
  private findStraightsWaitCard(hand: Card[], pivotCard: Card): Card[][] {
    if (decodeCard(pivotCard).rank === Rank.TWO) return [];

    const straights: Card[][] = [];
    // 1. Group valid cards (no 2s) by rank
    const validCards = hand.filter((c) => decodeCard(c).rank !== Rank.TWO);
    const grouped = this.groupByRank(validCards);
    const ranks = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    // 2. Find all consecutive rank sequences of length >= 3 that include pivotRank
    const pivotRank = decodeCard(pivotCard).rank;

    // Check if pivotRank exists in ranks (it should)
    if (!ranks.includes(pivotRank)) return [];

    for (let i = 0; i < ranks.length; i++) {
      const sequenceRanks = [ranks[i]];
      // Only potential if this sequence *could* reach pivotRank
      // if ranks[i] > pivotRank, stop? No, sorted.

      for (let j = i + 1; j < ranks.length; j++) {
        if (ranks[j] === sequenceRanks[sequenceRanks.length - 1] + 1) {
          sequenceRanks.push(ranks[j]);

          // If sequence length >= 3 and contains pivotRank
          if (sequenceRanks.length >= 3 && sequenceRanks.includes(pivotRank)) {
            // To correctly beat the table, we need to consider all available cards
            // for the HIGHEST rank in the sequence, as that determines the straight's value.
            const highestRank = sequenceRanks[sequenceRanks.length - 1];
            const intermediateRanks = sequenceRanks.slice(0, -1);

            // If the highest rank is the pivot, we only have one option for it
            const highestRankCards =
              highestRank === pivotRank ? [pivotCard] : grouped[highestRank];

            for (const lastCard of highestRankCards) {
              const straight: Card[] = [lastCard];
              let possible = true;

              for (const r of intermediateRanks) {
                if (r === pivotRank) {
                  straight.push(pivotCard);
                } else {
                  // Use the lowest card for intermediate ranks to "save" better cards
                  straight.push(grouped[r][0]);
                }
              }

              if (possible) {
                straights.push(straight.sort((a, b) => a - b));
              }
            }
          }
        } else {
          break;
        }
      }
    }
    return straights;
  }

  // Keep these as they are useful helper but might fail if calling 'this'
  // so we rewrite them cleanly or ensure `this` context is fine

  private findConsecutivePairs(hand: Card[], count: number): Card[][] {
    const grouped = this.groupByRank(hand);
    const ranks = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    const results: Card[][] = [];

    for (let i = 0; i <= ranks.length - count; i++) {
      const currentSet: Card[] = [];

      for (let j = 0; j < count; j++) {
        const r = ranks[i + j];
        // Must be consecutive and no 2s
        if (
          (j > 0 && r !== ranks[i + j - 1] + 1) ||
          r === Rank.TWO ||
          grouped[r].length < 2
        ) {
          break;
        }

        if (j === count - 1) {
          // Highest rank: generate all possible pairs for this rank
          const pairsAtRank: Card[][] = [];
          for (let m = 0; m < grouped[r].length; m++) {
            for (let n = m + 1; n < grouped[r].length; n++) {
              pairsAtRank.push([grouped[r][m], grouped[r][n]]);
            }
          }
          // We'll handle multiple candidates below
          for (const topPair of pairsAtRank) {
            results.push([...currentSet, ...topPair]);
          }
        } else {
          // Intermediate rank: take lowest pair
          currentSet.push(...grouped[r].slice(0, 2));
        }
      }
    }
    return results;
  }

  private findThreeConsecutivePairs(hand: Card[]): Card[][] {
    return this.findConsecutivePairs(hand, 3);
  }

  private findFourConsecutivePairs(hand: Card[]): Card[][] {
    return this.findConsecutivePairs(hand, 4);
  }

  // Helper for bot (legacy/simple)
  private findPairs(hand: Card[], excludeTwos = false): Card[][] {
    const grouped = this.groupByRank(hand);
    const pairs: Card[][] = [];
    for (const [rank, cards] of Object.entries(grouped)) {
      if (excludeTwos && Number(rank) === Rank.TWO) continue;
      if (cards.length >= 2) {
        pairs.push(cards.slice(0, 2)); // Just return the first pair
      }
    }
    return pairs.sort((a, b) => decodeCard(a[0]).rank - decodeCard(b[0]).rank);
  }

  private findTriples(hand: Card[], excludeTwos = false): Card[][] {
    const grouped = this.groupByRank(hand);
    const triples: Card[][] = [];
    for (const [rank, cards] of Object.entries(grouped)) {
      if (excludeTwos && Number(rank) === Rank.TWO) continue;
      if (cards.length >= 3) {
        triples.push(cards.slice(0, 3));
      }
    }
    return triples.sort(
      (a, b) => decodeCard(a[0]).rank - decodeCard(b[0]).rank,
    );
  }

  private findFourOfAKind(hand: Card[]): Card[][] {
    const grouped = this.groupByRank(hand);
    const quads: Card[][] = [];
    for (const cards of Object.values(grouped)) {
      if (cards.length === 4) {
        quads.push(cards);
      }
    }
    return quads.sort((a, b) => decodeCard(a[0]).rank - decodeCard(b[0]).rank);
  }

  private findStraights(hand: Card[]): Card[][] {
    // This is for Bot/Opening play - find ANY good straights
    const straights: Card[][] = [];
    const validCards = hand.filter((c) => decodeCard(c).rank !== Rank.TWO);
    const grouped = this.groupByRank(validCards);
    const ranks = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    // Standard greedy straight finder
    let currentSequence: number[] = [];

    for (let i = 0; i < ranks.length; i++) {
      const r = ranks[i];
      if (currentSequence.length === 0) {
        currentSequence.push(r);
      } else {
        if (r === currentSequence[currentSequence.length - 1] + 1) {
          currentSequence.push(r);
        } else {
          if (currentSequence.length >= 3) {
            // Convert rank sequence to cards
            straights.push(currentSequence.map((rk) => grouped[rk][0]));
          }
          currentSequence = [r];
        }
      }
    }
    if (currentSequence.length >= 3) {
      straights.push(currentSequence.map((rk) => grouped[rk][0]));
    }

    // Sort by length
    straights.sort((a, b) => b.length - a.length);
    return straights;
  }

  // ============== Public API ==============

  requestPlayCards(cards: Card[]): void {
    const action: ThirteenAction = {
      type: "PLAY_CARDS",
      playerId: this.userId,
      cards,
    };
    this.makeAction(action);
  }

  requestPass(): void {
    const action: ThirteenAction = {
      type: "PASS",
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  requestAddBot(slotIndex: number): void {
    const action: ThirteenAction = { type: "ADD_BOT", slotIndex };
    this.makeAction(action);
  }

  requestJoinSlot(slotIndex: number, playerName: string): void {
    const action: ThirteenAction = {
      type: "JOIN_SLOT",
      slotIndex,
      playerId: this.userId,
      playerName,
    };
    this.makeAction(action);
  }

  requestRemovePlayer(slotIndex: number): void {
    const action: ThirteenAction = {
      type: "REMOVE_PLAYER",
      slotIndex,
    };
    this.makeAction(action);
  }

  requestStartGame(): void {
    const action: ThirteenAction = { type: "START_GAME" };
    this.makeAction(action);
  }

  requestNewGame(): void {
    const action: ThirteenAction = {
      type: "REQUEST_NEW_GAME",
      playerId: this.userId,
      playerName: "",
    };
    this.makeAction(action);
  }

  // Note: These need public helpers or fix calls in UI
  acceptNewGame(): void {
    if (!this.isHost) return;
    this.onSocketGameAction({ action: { type: "ACCEPT_NEW_GAME" } });
  }

  declineNewGame(): void {
    if (!this.isHost) return;
    this.onSocketGameAction({ action: { type: "DECLINE_NEW_GAME" } });
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
  validateSelectedCards(cards: Card[]): {
    valid: boolean;
    error?: { vi: string; en: string };
  } {
    if (cards.length === 0) {
      return {
        valid: false,
        error: { vi: "Vui lòng chọn bài để chơi", en: "Select cards to play" },
      };
    }

    const combination = this.getCombination(cards);
    if (!combination) {
      if (cards.length === 2) {
        return {
          valid: false,
          error: {
            vi: "Bài phải là đôi",
            en: "Cards must be a pair (same rank)",
          },
        };
      }
      if (cards.length === 3) {
        return {
          valid: false,
          error: {
            vi: "Bài phải là ba hoặc sảnh",
            en: "Cards must be a triple or straight",
          },
        };
      }
      if (cards.length >= 4) {
        return {
          valid: false,
          error: {
            vi: "Bài không hợp lệ (thử sảnh hoặc tứ quý)",
            en: "Invalid combination (try straight or four-of-a-kind)",
          },
        };
      }
      return {
        valid: false,
        error: { vi: "Bài không hợp lệ", en: "Invalid card selection" },
      };
    }

    const lastCombo = this.state.lastCombination;
    if (!lastCombo) {
      return { valid: true };
    }

    // Check type mismatch
    if (combination.type !== lastCombo.type) {
      const lastCards =
        this.state.currentTrick[this.state.currentTrick.length - 1].cards;
      const lastRank = decodeCard(lastCards[0]).rank;

      // Special case: Single 2 can be beaten by Quad or 3+ Consecutive Pairs
      if (lastCombo.type === CombinationType.SINGLE && lastRank === Rank.TWO) {
        if (
          combination.type === CombinationType.FOUR_OF_KIND ||
          combination.type === CombinationType.THREE_CONSECUTIVE_PAIRS ||
          combination.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
        ) {
          return { valid: true };
        }
      }

      // Special case: Pair of 2s can be beaten by Quad or 4+ Consecutive Pairs
      if (lastCombo.type === CombinationType.PAIR && lastRank === Rank.TWO) {
        if (
          combination.type === CombinationType.FOUR_OF_KIND ||
          combination.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
        ) {
          return { valid: true };
        }
      }

      // Special case: 3 Consecutive Pairs can be beaten by Quad or 4 Consecutive Pairs
      if (lastCombo.type === CombinationType.THREE_CONSECUTIVE_PAIRS) {
        if (
          combination.type === CombinationType.FOUR_OF_KIND ||
          combination.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
        ) {
          return { valid: true };
        }
      }

      // Special case: Quad can be beaten by 4 Consecutive Pairs
      if (
        lastCombo.type === CombinationType.FOUR_OF_KIND &&
        combination.type === CombinationType.FOUR_CONSECUTIVE_PAIRS
      ) {
        return { valid: true };
      }

      return {
        valid: false,
        error: {
          vi: `Phải chơi ${CombinationName[lastCombo.type].vi}`,
          en: `Must play ${CombinationName[lastCombo.type].en}`,
        },
      };
    }

    // Check length mismatch for straights
    if (
      combination.type === CombinationType.STRAIGHT &&
      combination.cardCount !== lastCombo.cardCount
    ) {
      return {
        valid: false,
        error: {
          vi: `Sảnh phải có ${lastCombo.cardCount} lá bài`,
          en: `Straight must have ${lastCombo.cardCount} cards`,
        },
      };
    }

    // Check value
    if (combination.value <= lastCombo.value) {
      return {
        valid: false,
        error: { en: "Your cards are too low", vi: "Bài của bạn quá thấp" },
      };
    }

    return { valid: true };
  }
}
