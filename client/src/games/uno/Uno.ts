import type { Player } from "../../stores/roomStore";
import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import {
  type UnoState,
  type UnoAction,
  type UnoCard,
  type PlayerSlot,
  CardColor,
  CardType,
} from "./types";

export default class Uno extends BaseGame<UnoState> {
  getInitState(): UnoState {
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
          isHost: player?.id === this.userId,
          calledUno: false,
        };
      });

    return {
      players: slots,
      discardPile: [],
      drawPile: [],
      currentTurnIndex: 0,
      turnDirection: 1,
      currentColor: CardColor.RED,
      pendingDraw: 0,
      winner: null,
      gamePhase: "waiting",
      newGameRequest: null,
      mustDraw: false,
      hasDrawn: false,
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as UnoAction;

    if (!this.isHost) return;

    switch (action.type) {
      case "PLAY_CARD":
        this.handlePlayCard(action.playerId, action.card, action.chosenColor);
        break;
      case "DRAW_CARD":
        this.handleDrawCard(action.playerId);
        break;
      case "CALL_UNO":
        this.handleCallUno(action.playerId);
        break;
      case "CATCH_UNO":
        this.handleCatchUno(action.playerId, action.targetId);
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

  // ============== Deck Creation ==============

  private createDeck(): UnoCard[] {
    const deck: UnoCard[] = [];
    let cardId = 0;

    // For each color (Red, Blue, Green, Yellow)
    for (const color of [
      CardColor.RED,
      CardColor.BLUE,
      CardColor.GREEN,
      CardColor.YELLOW,
    ]) {
      // One 0 card per color
      deck.push({
        id: `card_${cardId++}`,
        color,
        type: CardType.NUMBER,
        value: 0,
      });

      // Two of each 1-9 per color
      for (let num = 1; num <= 9; num++) {
        deck.push({
          id: `card_${cardId++}`,
          color,
          type: CardType.NUMBER,
          value: num,
        });
        deck.push({
          id: `card_${cardId++}`,
          color,
          type: CardType.NUMBER,
          value: num,
        });
      }

      // Two Skip cards per color
      deck.push({ id: `card_${cardId++}`, color, type: CardType.SKIP });
      deck.push({ id: `card_${cardId++}`, color, type: CardType.SKIP });

      // Two Reverse cards per color
      deck.push({ id: `card_${cardId++}`, color, type: CardType.REVERSE });
      deck.push({ id: `card_${cardId++}`, color, type: CardType.REVERSE });

      // Two Draw Two cards per color
      deck.push({ id: `card_${cardId++}`, color, type: CardType.DRAW_TWO });
      deck.push({ id: `card_${cardId++}`, color, type: CardType.DRAW_TWO });
    }

    // Four Wild cards
    for (let i = 0; i < 4; i++) {
      deck.push({
        id: `card_${cardId++}`,
        color: CardColor.WILD,
        type: CardType.WILD,
      });
    }

    // Four Wild Draw Four cards
    for (let i = 0; i < 4; i++) {
      deck.push({
        id: `card_${cardId++}`,
        color: CardColor.WILD,
        type: CardType.WILD_DRAW_FOUR,
      });
    }

    return deck;
  }

  private shuffleDeck(deck: UnoCard[]): UnoCard[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private dealCards(): void {
    const deck = this.shuffleDeck(this.createDeck());
    const cardsPerPlayer = 7;

    let cardIndex = 0;
    for (const player of this.state.players) {
      if (player.id !== null) {
        player.hand = deck.slice(cardIndex, cardIndex + cardsPerPlayer);
        cardIndex += cardsPerPlayer;
      }
    }

    // Find first non-wild card for discard pile
    let startCardIndex = cardIndex;
    while (
      startCardIndex < deck.length &&
      (deck[startCardIndex].type === CardType.WILD ||
        deck[startCardIndex].type === CardType.WILD_DRAW_FOUR)
    ) {
      startCardIndex++;
    }

    // Put the starting card on discard pile
    const startCard = deck[startCardIndex];
    this.state.discardPile = [startCard];
    this.state.currentColor = startCard.color;

    // Remove the start card and put remaining cards in draw pile
    const remainingCards = [
      ...deck.slice(cardIndex, startCardIndex),
      ...deck.slice(startCardIndex + 1),
    ];
    this.state.drawPile = remainingCards;
  }

  // ============== Card Validation ==============

  private canPlayCard(card: UnoCard): boolean {
    const topCard = this.state.discardPile[this.state.discardPile.length - 1];

    // If there's pending draw, must play Draw Two to stack (optional rule - disabled)
    // For simplicity, player must draw if there's pending draw
    if (this.state.pendingDraw > 0) {
      return false;
    }

    // Wild cards can always be played
    if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
      return true;
    }

    // Match by color
    if (card.color === this.state.currentColor) {
      return true;
    }

    // Match by number/type
    if (card.type === CardType.NUMBER && topCard.type === CardType.NUMBER) {
      return card.value === topCard.value;
    }

    if (card.type === topCard.type) {
      return true;
    }

    return false;
  }

  private hasPlayableCard(hand: UnoCard[]): boolean {
    return hand.some((card) => this.canPlayCard(card));
  }

  // ============== Game Actions ==============

  private handlePlayCard(
    playerId: string,
    card: UnoCard,
    chosenColor?: CardColor,
  ): void {
    if (this.state.gamePhase !== "playing") return;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex)
      return;

    const player = this.state.players[playerIndex];

    // Find card in hand
    const cardIndex = player.hand.findIndex((c) => c.id === card.id);
    if (cardIndex === -1) return;

    // Validate play
    if (!this.canPlayCard(card)) return;

    // Remove card from hand
    player.hand.splice(cardIndex, 1);

    // Add to discard pile
    this.state.discardPile.push(card);

    // Reset UNO call status only if player doesn't have exactly 1 card left
    if (player.hand.length !== 1) {
      player.calledUno = false;
    }

    // Handle card effects
    this.applyCardEffect(card, chosenColor);

    // Check win condition
    if (player.hand.length === 0) {
      this.state.winner = playerId;
      this.state.gamePhase = "ended";

      this.clearSavedState();
      return;
    }

    // Reset draw state for next player
    this.state.hasDrawn = false;
    this.state.mustDraw = false;

    // Advance turn (unless Skip happened)
    if (card.type !== CardType.SKIP) {
      this.advanceTurn();
    } else {
      // Skip next player
      this.advanceTurn();
      this.advanceTurn();
    }

    this.checkBotTurn();
  }

  private applyCardEffect(card: UnoCard, chosenColor?: CardColor): void {
    // Set current color
    if (card.type === CardType.WILD || card.type === CardType.WILD_DRAW_FOUR) {
      this.state.currentColor = chosenColor ?? CardColor.RED;
    } else {
      this.state.currentColor = card.color;
    }

    // Apply special effects
    switch (card.type) {
      case CardType.REVERSE:
        const activePlayers = this.state.players.filter(
          (p) => p.id !== null && p.hand.length > 0,
        ).length;
        if (activePlayers === 2) {
          // In 2-player game, Reverse acts like Skip
          this.advanceTurn();
        } else {
          this.state.turnDirection = this.state.turnDirection === 1 ? -1 : 1;
        }
        break;

      case CardType.DRAW_TWO:
        this.state.pendingDraw += 2;
        break;

      case CardType.WILD_DRAW_FOUR:
        this.state.pendingDraw += 4;
        break;
    }
  }

  private handleDrawCard(playerId: string): void {
    if (this.state.gamePhase !== "playing") return;

    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1 || playerIndex !== this.state.currentTurnIndex)
      return;

    const player = this.state.players[playerIndex];

    // Reset UNO status on draw
    player.calledUno = false;

    // If there's pending draw penalty
    if (this.state.pendingDraw > 0) {
      this.drawCards(player, this.state.pendingDraw);
      this.state.pendingDraw = 0;
      this.state.hasDrawn = false;
      this.advanceTurn();
    } else if (!this.state.hasDrawn) {
      // Normal draw - player draws one card
      this.drawCards(player, 1);
      this.state.hasDrawn = true;

      // Check if drawn card can be played
      const drawnCard = player.hand[player.hand.length - 1];
      if (!this.canPlayCard(drawnCard)) {
        // Auto-pass if can't play
        this.state.hasDrawn = false;
        this.advanceTurn();
      }
      // Otherwise player can choose to play the drawn card or pass
    } else {
      // Player already drew, now passing
      this.state.hasDrawn = false;
      this.advanceTurn();
    }

    this.checkBotTurn();
  }

  private drawCards(player: PlayerSlot, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.state.drawPile.length === 0) {
        this.reshuffleDiscardPile();
      }
      if (this.state.drawPile.length > 0) {
        const card = this.state.drawPile.pop()!;
        player.hand.push(card);
      }
    }
  }

  private reshuffleDiscardPile(): void {
    if (this.state.discardPile.length <= 1) return;

    // Keep top card
    const topCard = this.state.discardPile.pop()!;

    // Shuffle remaining discards into draw pile
    this.state.drawPile = this.shuffleDeck(this.state.discardPile);
    this.state.discardPile = [topCard];
  }

  private handleCallUno(playerId: string): void {
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return;

    const player = this.state.players[playerIndex];
    if (player.hand.length <= 2) {
      player.calledUno = true;
    }
  }

  private handleCatchUno(_callerId: string, targetId: string): void {
    const targetIndex = this.state.players.findIndex((p) => p.id === targetId);
    if (targetIndex === -1) return;

    const target = this.state.players[targetIndex];

    // Target has 1 card and didn't call UNO
    if (target.hand.length === 1 && !target.calledUno) {
      // Penalty: draw 2 cards
      this.drawCards(target, 2);
    }
  }

  private advanceTurn(): void {
    let nextIndex = this.state.currentTurnIndex;
    let attempts = 0;

    do {
      nextIndex = (nextIndex + this.state.turnDirection + 4) % 4;
      attempts++;
    } while (
      attempts < 4 &&
      (this.state.players[nextIndex].id === null ||
        this.state.players[nextIndex].hand.length === 0)
    );

    this.state.currentTurnIndex = nextIndex;
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
      isHost: false,
      calledUno: false,
    };
    this.state.players = newPlayers;
  }

  private handleJoinSlot(
    slotIndex: number,
    playerId: string,
    playerName: string,
  ): void {
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players[slotIndex].id !== null) return;
    if (this.state.players.some((p) => p.id === playerId)) return;

    const newPlayers = [...this.state.players];
    newPlayers[slotIndex] = {
      id: playerId,
      username: playerName,
      hand: [],
      isBot: false,
      isHost: false,
      calledUno: false,
    };
    this.state.players = newPlayers;
  }

  private handleRemovePlayer(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.gamePhase !== "waiting") return;

    const player = this.state.players[slotIndex];
    if (!player.isBot) return;

    const newPlayers = [...this.state.players];
    newPlayers[slotIndex] = {
      id: null,
      username: `Slot ${slotIndex + 1}`,
      hand: [],
      isBot: false,
      isHost: false,
      calledUno: false,
    };
    this.state.players = newPlayers;
  }

  // ============== Game Flow ==============

  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;

    const filledSlots = this.state.players.filter((p) => p.id !== null).length;
    if (filledSlots < 2) return;

    this.dealCards();
    this.state.gamePhase = "playing";
    this.state.currentTurnIndex = 0;
    this.state.turnDirection = 1;
    this.state.pendingDraw = 0;
    this.state.hasDrawn = false;
    this.state.mustDraw = false;

    // Find first active player
    while (this.state.players[this.state.currentTurnIndex].id === null) {
      this.state.currentTurnIndex = (this.state.currentTurnIndex + 1) % 4;
    }

    // Handle if starting card is an action card
    const startCard = this.state.discardPile[this.state.discardPile.length - 1];
    if (startCard.type === CardType.SKIP) {
      this.advanceTurn();
    } else if (startCard.type === CardType.REVERSE) {
      this.state.turnDirection = -1;
    } else if (startCard.type === CardType.DRAW_TWO) {
      this.state.pendingDraw = 2;
    }

    this.checkBotTurn();
  }

  private handleNewGameRequest(playerId: string, playerName: string): void {
    this.state.newGameRequest = { fromId: playerId, fromName: playerName };
  }

  reset(): void {
    const slots: PlayerSlot[] = this.state.players.map((p, _i) => ({
      id: p.id,
      username: p.username,
      hand: [],
      isBot: p.isBot,
      isHost: p.isHost,
      calledUno: false,
    }));

    this.state = {
      players: slots,
      discardPile: [],
      drawPile: [],
      currentTurnIndex: 0,
      turnDirection: 1,
      currentColor: CardColor.RED,
      pendingDraw: 0,
      winner: null,
      gamePhase: "waiting",
      newGameRequest: null,
      mustDraw: false,
      hasDrawn: false,
    };
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
      if (!slot.isBot && slot.id) {
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
          slot.calledUno = false;
        }
      }
    }
  }

  // ============== Bot AI ==============

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    if (currentPlayer.isBot && currentPlayer.id) {
      setTimeout(() => this.makeBotMove(currentPlayer), 1000);
    }
  }

  private makeBotMove(bot: PlayerSlot): void {
    if (this.state.gamePhase !== "playing") return;
    if (!bot.id) return;

    // If there's pending draw, must draw
    if (this.state.pendingDraw > 0) {
      this.handleDrawCard(bot.id);
      return;
    }

    // Find playable cards
    const playableCards = bot.hand.filter((card) => this.canPlayCard(card));

    if (playableCards.length > 0) {
      // Strategy: Prioritize action cards, then high numbers
      const card = this.selectBotCard(playableCards);

      // Call UNO if down to 2 cards
      if (bot.hand.length === 2) {
        this.handleCallUno(bot.id);
      }

      // Choose color for wild cards
      let chosenColor: CardColor | undefined;
      if (
        card.type === CardType.WILD ||
        card.type === CardType.WILD_DRAW_FOUR
      ) {
        chosenColor = this.chooseBotColor(bot.hand);
      }

      this.handlePlayCard(bot.id, card, chosenColor);
    } else {
      // No playable card - draw
      this.handleDrawCard(bot.id);
    }
  }

  private selectBotCard(playableCards: UnoCard[]): UnoCard {
    // Prioritize: Draw Four > Draw Two > Skip > Reverse > Wild > Numbers (high to low)
    const priority = [
      CardType.WILD_DRAW_FOUR,
      CardType.DRAW_TWO,
      CardType.SKIP,
      CardType.REVERSE,
      CardType.WILD,
      CardType.NUMBER,
    ];

    for (const type of priority) {
      const cards = playableCards.filter((c) => c.type === type);
      if (cards.length > 0) {
        if (type === CardType.NUMBER) {
          // Play highest number
          return cards.sort((a, b) => (b.value || 0) - (a.value || 0))[0];
        }
        return cards[0];
      }
    }

    return playableCards[0];
  }

  private chooseBotColor(hand: UnoCard[]): CardColor {
    // Count colors in hand (excluding wilds)
    const colorCounts: Record<number, number> = {
      [CardColor.RED]: 0,
      [CardColor.BLUE]: 0,
      [CardColor.GREEN]: 0,
      [CardColor.YELLOW]: 0,
    };

    for (const card of hand) {
      if (card.color !== CardColor.WILD) {
        colorCounts[card.color]++;
      }
    }

    // Choose most common color
    let maxColor: number = CardColor.RED;
    let maxCount = 0;
    for (const [color, count] of Object.entries(colorCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxColor = parseInt(color);
      }
    }

    return maxColor as CardColor;
  }

  // ============== Public API ==============

  requestPlayCard(card: UnoCard, chosenColor?: CardColor): void {
    const action: UnoAction = {
      type: "PLAY_CARD",
      playerId: this.userId,
      card,
      chosenColor,
    };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestDrawCard(): void {
    const action: UnoAction = {
      type: "DRAW_CARD",
      playerId: this.userId,
    };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestCallUno(): void {
    const action: UnoAction = {
      type: "CALL_UNO",
      playerId: this.userId,
    };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestCatchUno(targetId: string): void {
    const action: UnoAction = {
      type: "CATCH_UNO",
      playerId: this.userId,
      targetId,
    };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestAddBot(slotIndex: number): void {
    const action: UnoAction = { type: "ADD_BOT", slotIndex };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestJoinSlot(slotIndex: number, playerName: string): void {
    const action: UnoAction = {
      type: "JOIN_SLOT",
      slotIndex,
      playerId: this.userId,
      playerName,
    };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestRemovePlayer(slotIndex: number): void {
    const action: UnoAction = { type: "REMOVE_PLAYER", slotIndex };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestStartGame(): void {
    const action: UnoAction = { type: "START_GAME" };
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestNewGame(): void {
    if (this.isHost) {
      this.onSocketGameAction({ action: { type: "NEW_GAME" } });
    } else {
      const action: UnoAction = {
        type: "REQUEST_NEW_GAME",
        playerId: this.userId,
        playerName:
          this.state.players.find((p) => p.id === this.userId)?.username ||
          "Player",
      };
      this.sendSocketGameAction(action);
    }
  }

  acceptNewGame(): void {
    const action: UnoAction = { type: "ACCEPT_NEW_GAME" };
    this.onSocketGameAction({ action });
  }

  declineNewGame(): void {
    const action: UnoAction = { type: "DECLINE_NEW_GAME" };
    this.onSocketGameAction({ action });
  }

  // ============== Helper Methods ==============

  getMyPlayerIndex(): number {
    return this.state.players.findIndex((p) => p.id === this.userId);
  }

  getUserId(): string {
    return this.userId;
  }

  canStartGame(): boolean {
    const filledSlots = this.state.players.filter((p) => p.id !== null).length;
    return filledSlots >= 2;
  }

  canPlayCardCheck(card: UnoCard): boolean {
    return this.canPlayCard(card);
  }

  hasPlayableCardCheck(): boolean {
    const myIndex = this.getMyPlayerIndex();
    if (myIndex === -1) return false;
    return this.hasPlayableCard(this.state.players[myIndex].hand);
  }
}
