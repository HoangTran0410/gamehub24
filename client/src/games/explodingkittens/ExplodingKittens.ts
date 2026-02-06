import type { Socket } from "socket.io-client";
import type { Room } from "../../stores/roomStore";
import { BaseGame, type GameAction } from "../BaseGame";
import {
  type EKState,
  type EKAction,
  type EKCard,
  type PlayerSlot,
  EKCardType,
  EKGamePhase,
  PENDING_ACTION_TIMEOUT,
} from "./types";

export const DEFAULT_DECK_CONFIG = Object.values(EKCardType).reduce(
  (acc, type) => ({ ...acc, [type]: true }),
  {} as Record<EKCardType, boolean>,
);

export default class ExplodingKittens extends BaseGame<EKState> {
  // Local config (Host only)
  private static readonly DECK_CONFIG_KEY = "ek_deck_config";
  private deckConfig: Record<EKCardType, boolean>;

  constructor(room: Room, socket: Socket, isHost: boolean, userId: string) {
    super(room, socket, isHost, userId);

    // Load from localStorage if available
    let savedConfig = {};
    try {
      if (typeof localStorage !== "undefined") {
        const saved = localStorage.getItem(ExplodingKittens.DECK_CONFIG_KEY);
        if (saved) savedConfig = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load deck config", e);
    }

    this.deckConfig = DEFAULT_DECK_CONFIG;
    Object.entries(savedConfig).forEach(([key, value]) => {
      if (key in this.deckConfig) {
        // @ts-ignore
        this.deckConfig[key as EKCardType] = value;
      }
    });
  }

  protected isGameOver(state: EKState): boolean {
    return state.gamePhase === EKGamePhase.ENDED;
  }

  getInitState(): EKState {
    const slots: PlayerSlot[] = Array(5)
      .fill(null)
      .map((_, i) => {
        const player = this.players[i];
        return {
          id: player?.id || null,
          username: player?.username || `Slot ${i + 1}`,
          hand: [],
          isExploded: false,
          isBot: false,
          isHost: player?.id === this.userId,
        };
      });

    return {
      players: slots,
      drawPile: [],
      discardPile: [],
      discardHistory: [],
      currentTurnIndex: 0,
      attackStack: 1,
      direction: 1,
      gamePhase: EKGamePhase.WAITING,
      winner: null,
      alterCards: null,
      alterCount: 0,
      buryCard: null,
      favorFrom: null,
      favorTo: null,
      comboFrom: null,
      comboTo: null,
      comboCount: 0,
      lastAction: null,
      newGameRequest: null,
      pendingAction: null,
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as EKAction;
    if (!this.isHost) return;

    switch (action.type) {
      case "START_GAME":
        this.handleStartGame();
        break;
      case "DRAW_CARD":
        this.handleDrawCard(action.playerId);
        break;
      case "PLAY_CARD":
        this.handlePlayCard(
          action.playerId,
          action.cardIndex,
          action.targetPlayerId,
        );
        break;
      case "PLAY_COMBO":
        this.handlePlayCombo(
          action.playerId,
          action.cardIndices,
          action.targetPlayerId,
          action.requestedCardType,
        );
        break;
      case "DEFUSE":
        this.handleDefuse(action.playerId);
        break;
      case "INSERT_KITTEN":
        this.handleInsertCard(action.playerId, action.index);
        break;
      case "GIVE_FAVOR":
        this.handleGiveFavor(action.playerId, action.cardIndex);
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
      case "RESPOND_NOPE":
        this.handleRespondNope(action.playerId, action.response);
        break;
      case "REORDER_FUTURE":
        this.handleReorderFuture(action.playerId, action.newOrder);
        break;
    }
  }

  public getDeckConfig(): Record<EKCardType, boolean> {
    return { ...this.deckConfig };
  }

  public setDeckConfig(config: Record<EKCardType, boolean>) {
    this.deckConfig = { ...config };
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          ExplodingKittens.DECK_CONFIG_KEY,
          JSON.stringify(this.deckConfig),
        );
      }
    } catch (e) {
      console.warn("Failed to save deck config", e);
    }
  }

  public getCardCountForType(type: EKCardType, numPlayers: number): number {
    if (type === EKCardType.EXPLODING_KITTEN) return numPlayers - 1;
    if (type === EKCardType.DEFUSE) {
      // 1 per player + extra
      const extra = numPlayers === 2 ? 1 : 2;
      return numPlayers + extra;
    }

    const getCount = (base: number, min: number = 2) => {
      if (numPlayers >= 4) return base;
      if (numPlayers === 3) return Math.max(min, Math.ceil(base * 0.75));
      return Math.max(min, Math.ceil(base * 0.6)); // 2 players
    };

    switch (type) {
      case EKCardType.ATTACK:
        return getCount(4);
      case EKCardType.SKIP:
        return getCount(4);
      case EKCardType.FAVOR:
        return getCount(4);
      case EKCardType.SHUFFLE:
        return getCount(4);
      case EKCardType.SEE_THE_FUTURE:
        return getCount(5);
      case EKCardType.NOPE:
        return getCount(5);
      case EKCardType.CAT_1:
      case EKCardType.CAT_2:
      case EKCardType.CAT_3:
      case EKCardType.CAT_4:
      case EKCardType.CAT_5:
        return getCount(4, 3);

      // Expansion cards
      case EKCardType.REVERSE:
        return getCount(4);
      case EKCardType.TARGETED_ATTACK:
        return getCount(3);
      case EKCardType.ALTER_THE_FUTURE_3:
        return getCount(4);
      case EKCardType.ALTER_THE_FUTURE_5:
        return getCount(2, 1);
      case EKCardType.PERSONAL_ATTACK:
        return getCount(3);
      case EKCardType.CATOMIC_BOMB:
        return 1; // Very powerful, only 1
      case EKCardType.DRAW_BOTTOM:
        return getCount(4);
      case EKCardType.BURY:
        return getCount(4);

      default:
        return 0;
    }
  }

  private createDeck(numPlayers: number): EKCard[] {
    const deck: EKCard[] = [];
    let nextId = 1;

    // Helper to add cards
    const addCards = (type: EKCardType, count: number) => {
      if (!this.deckConfig[type]) return;
      for (let i = 0; i < count; i++) deck.push([type, nextId++]);
    };

    // Standard cards
    addCards(
      EKCardType.ATTACK,
      this.getCardCountForType(EKCardType.ATTACK, numPlayers),
    );
    addCards(
      EKCardType.SKIP,
      this.getCardCountForType(EKCardType.SKIP, numPlayers),
    );
    addCards(
      EKCardType.FAVOR,
      this.getCardCountForType(EKCardType.FAVOR, numPlayers),
    );
    addCards(
      EKCardType.SHUFFLE,
      this.getCardCountForType(EKCardType.SHUFFLE, numPlayers),
    );
    addCards(
      EKCardType.SEE_THE_FUTURE,
      this.getCardCountForType(EKCardType.SEE_THE_FUTURE, numPlayers),
    );
    addCards(
      EKCardType.NOPE,
      this.getCardCountForType(EKCardType.NOPE, numPlayers),
    );

    // Cats
    addCards(
      EKCardType.CAT_1,
      this.getCardCountForType(EKCardType.CAT_1, numPlayers),
    );
    addCards(
      EKCardType.CAT_2,
      this.getCardCountForType(EKCardType.CAT_2, numPlayers),
    );
    addCards(
      EKCardType.CAT_3,
      this.getCardCountForType(EKCardType.CAT_3, numPlayers),
    );
    addCards(
      EKCardType.CAT_4,
      this.getCardCountForType(EKCardType.CAT_4, numPlayers),
    );
    addCards(
      EKCardType.CAT_5,
      this.getCardCountForType(EKCardType.CAT_5, numPlayers),
    );

    // Expansion cards
    addCards(
      EKCardType.REVERSE,
      this.getCardCountForType(EKCardType.REVERSE, numPlayers),
    );
    addCards(
      EKCardType.TARGETED_ATTACK,
      this.getCardCountForType(EKCardType.TARGETED_ATTACK, numPlayers),
    );
    addCards(
      EKCardType.ALTER_THE_FUTURE_3,
      this.getCardCountForType(EKCardType.ALTER_THE_FUTURE_3, numPlayers),
    );
    addCards(
      EKCardType.ALTER_THE_FUTURE_5,
      this.getCardCountForType(EKCardType.ALTER_THE_FUTURE_5, numPlayers),
    );
    addCards(
      EKCardType.PERSONAL_ATTACK,
      this.getCardCountForType(EKCardType.PERSONAL_ATTACK, numPlayers),
    );
    addCards(
      EKCardType.CATOMIC_BOMB,
      this.getCardCountForType(EKCardType.CATOMIC_BOMB, numPlayers),
    );
    addCards(
      EKCardType.DRAW_BOTTOM,
      this.getCardCountForType(EKCardType.DRAW_BOTTOM, numPlayers),
    );
    addCards(
      EKCardType.BURY,
      this.getCardCountForType(EKCardType.BURY, numPlayers),
    );

    // Check for minimum deck size (User request: min 6-7 cards per player)
    // We deal 6 cards to each player initially. Plus we need a draw pile.
    // Let's ensure at least 10 cards per player total.
    const minSize = numPlayers * 10;

    if (deck.length < minSize) {
      const enabledTypes = Object.entries(this.deckConfig)
        .filter(([_, enabled]) => enabled)
        .map(([type]) => Number(type) as EKCardType);

      // If nothing enabled (weird), enable Cats
      if (enabledTypes.length === 0) {
        enabledTypes.push(
          EKCardType.CAT_1,
          EKCardType.CAT_2,
          EKCardType.CAT_3,
          EKCardType.CAT_4,
          EKCardType.CAT_5,
        );
      }

      let typeIndex = 0;
      while (deck.length < minSize) {
        const type = enabledTypes[typeIndex % enabledTypes.length];
        // Don't add more Defuse/Exploding Kittens/Catomic here as they have specific logic
        // (Defuse/Kitten handles separately in handleStartGame, Catomic is 1 per game)
        if (
          type !== EKCardType.DEFUSE &&
          type !== EKCardType.EXPLODING_KITTEN &&
          type !== EKCardType.CATOMIC_BOMB
        ) {
          deck.push([type, nextId++]);
        }
        typeIndex++;
      }
    }

    return this.shuffle(deck);
  }

  private shuffle(deck: EKCard[]): EKCard[] {
    const result = [...deck];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private handleStartGame(): void {
    if (this.state.gamePhase !== EKGamePhase.WAITING) return;
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    if (activePlayers.length < 2) return;

    let deck = this.createDeck(activePlayers.length);

    // 2. Deal 1 Defuse and 6 cards from the shuffled deck to each player (total 7 cards)
    let nextId = 1000; // Unique IDs for Defuses and Kittens
    for (const player of activePlayers) {
      player.hand = [[EKCardType.DEFUSE, nextId++], ...deck.splice(0, 6)];
    }

    // 3. Add remaining Defuses (if any) and Kittens (n-1) to deck
    // Standard game: 6 total defuses. Let's use 2 extra defuses in the deck.
    // Scale extra defuses: 2 players -> 1 extra, 3-5 players -> 2 extra
    const extraDefuses = activePlayers.length === 2 ? 1 : 2;
    for (let i = 0; i < extraDefuses; i++)
      deck.push([EKCardType.DEFUSE, nextId++]);

    // N-1 Kittens
    for (let i = 0; i < activePlayers.length - 1; i++)
      deck.push([EKCardType.EXPLODING_KITTEN, nextId++]);

    // 4. Shuffle again
    this.state.drawPile = this.shuffle(deck);
    this.state.gamePhase = EKGamePhase.PLAYING;
    this.state.direction = 1; // Reset direction
    this.state.currentTurnIndex = this.state.players.findIndex(
      (p) => p.id !== null,
    );
    this.state.attackStack = 1;
    this.state.discardPile = [];

    this.checkBotTurn();
  }

  // ============== Game Actions ==============

  private handleDrawCard(playerId: string): void {
    if (this.state.gamePhase !== EKGamePhase.PLAYING) return;
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    if (this.state.drawPile.length === 0) return; // Should not happen

    const card = this.state.drawPile.pop()!;
    if (card[0] === EKCardType.EXPLODING_KITTEN) {
      this.handleExplode(playerId);
    } else {
      this.state.players[playerIndex].hand.push(card);
      const timestamp = Date.now();
      this.state.discardHistory.push({
        playerId,
        cards: [], // No cards discarded for draw
        timestamp,
      });
      this.state.lastAction = {
        action: { type: "DRAW_CARD", playerId },
        playerId,
        timestamp,
        isNoped: false,
      };
      this.finishTurnAction();
    }
  }

  private handlePlayCard(
    playerId: string,
    cardIndex: number,
    targetPlayerId?: string,
  ): void {
    if (this.state.gamePhase !== EKGamePhase.PLAYING) return;
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    const player = this.state.players[playerIndex];
    if (cardIndex < 0 || cardIndex >= player.hand.length) return;

    const card = player.hand[cardIndex];
    // Block NOPE, DEFUSE, EXPLODING_KITTEN and Cat cards (which are combos only)
    if (
      card[0] === EKCardType.NOPE ||
      card[0] === EKCardType.DEFUSE ||
      card[0] === EKCardType.EXPLODING_KITTEN ||
      (card[0] >= EKCardType.CAT_1 && card[0] <= EKCardType.CAT_5)
    ) {
      return;
    }

    player.hand.splice(cardIndex, 1);
    this.state.discardPile.push(card);
    const timestamp = Date.now();
    let computedTargetId = targetPlayerId;

    if (card[0] === EKCardType.ATTACK) {
      computedTargetId = this.getNextPlayerId(playerIndex);
    }

    this.state.discardHistory.push({
      playerId,
      cards: [card],
      timestamp,
      targetPlayerId: computedTargetId,
    });

    this.startNopeWindow(
      {
        type: "PLAY_CARD",
        playerId,
        cardIndex,
        targetPlayerId: computedTargetId,
      },
      playerId,
      timestamp,
    );
  }

  private handlePlayCombo(
    playerId: string,
    cardIndices: number[],
    targetPlayerId: string,
    requestedCardType?: EKCardType,
  ): void {
    if (this.state.gamePhase !== EKGamePhase.PLAYING) return;
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    const player = this.state.players[playerIndex];
    if (cardIndices.length < 2) return;

    // Validate indices and same type
    const sortedIndices = Array.from(new Set(cardIndices))
      .filter((idx) => idx >= 0 && idx < player.hand.length)
      .sort((a, b) => b - a);

    if (sortedIndices.length < 2) return;

    const cards = sortedIndices.map((idx) => player.hand[idx]);
    if (cards.some((c) => !c)) return;
    const firstType = cards[0][0];
    if (firstType === EKCardType.NOPE) return; // Nopes cannot be played in combos
    if (!cards.every((c) => c[0] === firstType)) return;

    // Remove cards from hand
    const playedCards: EKCard[] = [];
    for (const idx of sortedIndices) {
      playedCards.push(player.hand.splice(idx, 1)[0]);
    }
    this.state.discardPile.push(...playedCards);
    const timestamp = Date.now();
    this.state.discardHistory.push({
      playerId,
      cards: playedCards,
      timestamp,
      targetPlayerId,
    });

    this.startNopeWindow(
      {
        type: "PLAY_COMBO",
        playerId,
        cardIndices,
        targetPlayerId,
        requestedCardType,
      },
      playerId,
      timestamp,
    );
  }

  private startNopeWindow(
    action: EKAction,
    playerId: string,
    entryTimestamp?: number,
  ): void {
    const topCard = this.state.discardPile[this.state.discardPile.length - 1];

    this.state.pendingAction = {
      action,
      playerId,
      timerStart: Date.now(),
      nopeCount: 0,
      responses: {},
      nopeChain: [{ playerId, cardType: topCard[0] }],
      entryTimestamp,
    };

    // Auto-allow for players who can't Nope
    this.state.players.forEach((p) => {
      if (p.id) {
        if (
          p.isExploded ||
          !p.hand.some((c) => c[0] === EKCardType.NOPE) ||
          p.id === playerId
        ) {
          this.state.pendingAction!.responses[p.id] = "ALLOW";
        }
      }
    });

    // Check if everyone already allowed (no one can block)
    const activePlayers = this.state.players.filter(
      (p) => p.id && !p.isExploded,
    );
    if (
      activePlayers.every(
        (p) => this.state.pendingAction!.responses[p.id!] === "ALLOW",
      )
    ) {
      this.executePendingAction();
      return;
    }

    this.state.gamePhase = EKGamePhase.NOPE_WINDOW;

    // Auto-execute after timeout
    const currentTimerStart = this.state.pendingAction.timerStart;
    setTimeout(() => {
      if (
        this.state.pendingAction &&
        this.state.pendingAction.timerStart === currentTimerStart
      ) {
        this.executePendingAction();
      }
    }, PENDING_ACTION_TIMEOUT);

    this.checkBotTurn();
  }

  private handleRespondNope(
    playerId: string,
    response: "NOPE" | "ALLOW",
  ): void {
    if (
      this.state.gamePhase !== EKGamePhase.NOPE_WINDOW ||
      !this.state.pendingAction
    )
      return;

    if (response === "NOPE") {
      const playerIndex = this.state.players.findIndex(
        (p) => p.id === playerId,
      );
      if (playerIndex === -1) return;
      const player = this.state.players[playerIndex];
      const nopeIndex = player.hand.findIndex((c) => c[0] === EKCardType.NOPE);
      if (nopeIndex === -1) return;

      // Use Nope card
      const nopeCard = player.hand.splice(nopeIndex, 1)[0];
      this.state.discardPile.push(nopeCard);

      this.state.pendingAction.nopeCount++;
      this.state.pendingAction.nopeChain.push({
        playerId,
        cardType: EKCardType.NOPE,
      });
      this.state.pendingAction.timerStart = Date.now();
      this.state.pendingAction.responses = { [playerId]: "ALLOW" };

      // Re-populate auto-allows for current state
      this.state.players.forEach((p) => {
        if (p.id && p.id !== playerId) {
          if (p.isExploded || !p.hand.some((c) => c[0] === EKCardType.NOPE)) {
            this.state.pendingAction!.responses[p.id] = "ALLOW";
          }
        }
      });

      // Check if everyone already allowed
      const activePlayers = this.state.players.filter(
        (p) => p.id && !p.isExploded,
      );
      if (
        activePlayers.every(
          (p) => this.state.pendingAction!.responses[p.id!] === "ALLOW",
        )
      ) {
        this.executePendingAction();
        return;
      }
      // Reset timeout
      const currentTimerStart = this.state.pendingAction.timerStart;
      setTimeout(() => {
        if (
          this.state.pendingAction &&
          this.state.pendingAction.timerStart === currentTimerStart
        ) {
          this.executePendingAction();
        }
      }, PENDING_ACTION_TIMEOUT);

      this.checkBotTurn();
    } else {
      this.state.pendingAction.responses[playerId] = "ALLOW";

      // If everyone (who is alive) responded ALLOW, execute immediately
      const activePlayers = this.state.players.filter(
        (p) => p.id && !p.isExploded,
      );
      if (
        activePlayers.every(
          (p) => this.state.pendingAction!.responses[p.id!] === "ALLOW",
        )
      ) {
        this.executePendingAction();
      }
    }
  }

  private executePendingAction(): void {
    if (!this.state.pendingAction) return;

    const { action, nopeCount, playerId, nopeChain, entryTimestamp } =
      this.state.pendingAction;
    const isNoped = nopeCount % 2 === 1;

    this.state.gamePhase = EKGamePhase.PLAYING;
    this.state.pendingAction = null;

    // Update discard history with final result if applicable
    if (entryTimestamp) {
      const entry = this.state.discardHistory.find(
        (e) => e.timestamp === entryTimestamp,
      );
      if (entry) {
        entry.nopeChain = nopeChain;
        entry.isNoped = isNoped;
      }
    }

    // Get original card type from nopeChain[0] - this is the actual action card, not NOPE cards
    let cardType: EKCardType | undefined;
    if (action.type === "PLAY_CARD" && nopeChain.length > 0) {
      cardType = nopeChain[0].cardType;
    }

    this.state.lastAction = {
      action,
      playerId,
      timestamp: Date.now(),
      isNoped,
      cardType,
    };

    if (!isNoped) {
      if (action.type === "PLAY_CARD") {
        const topCard =
          this.state.discardPile[this.state.discardPile.length - 1];
        this.executeCardAction(topCard, action.playerId, action.targetPlayerId);
      } else if (action.type === "PLAY_COMBO") {
        this.executeComboAction(
          action.playerId,
          action.cardIndices.length,
          action.targetPlayerId,
          action.requestedCardType,
        );
      }
    }

    this.checkBotTurn();
  }

  private executeCardAction(
    card: EKCard,
    playerId: string,
    targetPlayerId?: string,
  ): void {
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);

    switch (card[0]) {
      case EKCardType.ATTACK:
        this.state.attackStack =
          (this.state.attackStack > 1 ? this.state.attackStack : 0) + 2;
        this.advanceTurn(true);
        break;
      case EKCardType.SKIP:
        this.finishTurnAction();
        break;
      case EKCardType.SHUFFLE:
        this.state.drawPile = this.shuffle(this.state.drawPile);
        break;
      case EKCardType.SEE_THE_FUTURE:
        // Handled by UI watching lastAction
        break;
      case EKCardType.FAVOR:
        if (targetPlayerId) {
          const targetIndex = this.state.players.findIndex(
            (p) => p.id === targetPlayerId,
          );
          if (
            targetIndex !== -1 &&
            targetIndex !== playerIndex &&
            !this.state.players[targetIndex].isExploded
          ) {
            this.state.gamePhase = EKGamePhase.FAVOR_GIVING;
            this.state.favorFrom = targetPlayerId;
            this.state.favorTo = playerId;
          }
        }
        break;
      // Expansion cards
      case EKCardType.REVERSE:
        this.state.direction *= -1;
        this.finishTurnAction();
        break;
      case EKCardType.TARGETED_ATTACK:
        if (targetPlayerId) {
          const targetIndex = this.state.players.findIndex(
            (p) => p.id === targetPlayerId,
          );
          if (
            targetIndex !== -1 &&
            targetIndex !== playerIndex &&
            !this.state.players[targetIndex].isExploded
          ) {
            this.state.attackStack =
              (this.state.attackStack > 1 ? this.state.attackStack : 0) + 2;
            this.state.currentTurnIndex = targetIndex;
            this.checkBotTurn();
          }
        }
        break;
      case EKCardType.ALTER_THE_FUTURE_3:
        this.state.alterCards = this.state.drawPile.slice(-3).reverse();
        this.state.alterCount = this.state.alterCards.length;
        this.state.gamePhase = EKGamePhase.ALTER_THE_FUTURE;
        this.checkBotTurn();
        break;
      case EKCardType.ALTER_THE_FUTURE_5:
        this.state.alterCards = this.state.drawPile.slice(-5).reverse();
        this.state.alterCount = this.state.alterCards.length;
        this.state.gamePhase = EKGamePhase.ALTER_THE_FUTURE;
        this.checkBotTurn();
        break;

      // NEW CARDS
      case EKCardType.PERSONAL_ATTACK:
        // "Same as Attack but only for yourself".
        // Attack ends current turn without drawing, and gives next player 2 turns.
        // Personal Attack ends current turn without drawing, and gives *self* 3 turns.
        // So, set attackStack to 3, and then call finishTurnAction to end the current "action" turn.
        // finishTurnAction will decrement attackStack to 2, and since it's > 0, the current player (self) will continue.
        this.state.attackStack = 3;
        this.finishTurnAction(); // This will decrement attackStack to 2 and keep current player
        break;

      case EKCardType.CATOMIC_BOMB:
        // Remove all Exploding Kittens
        const kittens = this.state.drawPile.filter(
          (c) => c[0] === EKCardType.EXPLODING_KITTEN,
        );
        const others = this.state.drawPile.filter(
          (c) => c[0] !== EKCardType.EXPLODING_KITTEN,
        );

        // Shuffle others
        const shuffled = this.shuffle(others);

        // Put kittens on top
        this.state.drawPile = [...shuffled, ...kittens]; // pop() takes from end, so end is "top"

        // End turn immediately (no draw)
        this.finishTurnAction();
        break;

      case EKCardType.DRAW_BOTTOM:
        // Draw from bottom (index 0)
        if (this.state.drawPile.length > 0) {
          const card = this.state.drawPile.shift()!; // Remove from bottom
          if (card[0] === EKCardType.EXPLODING_KITTEN) {
            this.handleExplode(playerId);
          } else {
            const player = this.state.players.find((p) => p.id === playerId);
            if (player) {
              player.hand.push(card);
              // End turn (successfully drew)
              this.finishTurnAction();
            }
          }
        } else {
          // If draw pile is empty, still end turn
          this.finishTurnAction();
        }
        break;

      case EKCardType.BURY:
        // Draw top card secretly, then insert it anywhere in the deck.
        // This action replaces the normal draw for the turn.
        if (this.state.drawPile.length > 0) {
          const card = this.state.drawPile.pop()!;
          this.state.buryCard = card; // Store the card to be buried
          this.state.gamePhase = EKGamePhase.BURYING_CARD;
          // Wait for user to insert
          this.checkBotTurn();
        } else {
          // If draw pile is empty, still end turn
          this.finishTurnAction();
        }
        break;
    }
  }

  private executeComboAction(
    playerId: string,
    count: number,
    targetPlayerId: string,
    requestedCardType?: EKCardType,
  ): void {
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    const player = this.state.players[playerIndex];
    const targetIndex = this.state.players.findIndex(
      (p) => p.id === targetPlayerId,
    );
    if (
      targetIndex === -1 ||
      targetIndex === playerIndex ||
      this.state.players[targetIndex].isExploded
    )
      return;

    const target = this.state.players[targetIndex];

    if (count === 2) {
      if (target.hand.length > 0) {
        const randIdx = Math.floor(Math.random() * target.hand.length);
        const stolen = target.hand.splice(randIdx, 1)[0];
        if (stolen) {
          player.hand.push(stolen);
        }
      }
    } else if (count === 3) {
      if (requestedCardType !== undefined) {
        const foundIdx = target.hand.findIndex(
          (c) => c[0] === requestedCardType,
        );
        if (foundIdx !== -1) {
          const stolen = target.hand.splice(foundIdx, 1)[0];
          if (stolen) {
            player.hand.push(stolen);
          }
        }
      }
    }
  }

  // Refactored Explode Logic
  private handleExplode(playerId: string): void {
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return;

    this.state.gamePhase = EKGamePhase.DEFUSING;
    const player = this.state.players[playerIndex];
    const defuseIndex = player.hand.findIndex(
      (c) => c[0] === EKCardType.DEFUSE,
    );

    if (defuseIndex === -1) {
      this.explodePlayer(playerIndex);
    } else {
      this.checkBotTurn();
    }
  }

  private handleDefuse(playerId: string): void {
    if (this.state.gamePhase !== EKGamePhase.DEFUSING) return;
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    const player = this.state.players[playerIndex];
    const defuseIndex = player.hand.findIndex(
      (c) => c[0] === EKCardType.DEFUSE,
    );
    if (defuseIndex === -1) return;

    // Use defuse card
    const defuseCard = player.hand.splice(defuseIndex, 1)[0];
    this.state.discardPile.push(defuseCard);
    const timestamp = Date.now();
    this.state.discardHistory.push({
      playerId,
      cards: [defuseCard],
      timestamp,
    });
    this.state.lastAction = {
      action: { type: "DEFUSE", playerId },
      playerId,
      timestamp,
      isNoped: false,
      cardType: EKCardType.DEFUSE,
    };

    // Player must now choose where to put the kitten
    this.state.gamePhase = EKGamePhase.INSERTING_KITTEN;
    this.checkBotTurn();
  }

  private handleInsertCard(playerId: string, index: number): void {
    if (
      this.state.gamePhase !== EKGamePhase.INSERTING_KITTEN &&
      this.state.gamePhase !== EKGamePhase.BURYING_CARD
    )
      return;
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    let cardToInsert: EKCard | null = null;

    if (this.state.gamePhase === EKGamePhase.INSERTING_KITTEN) {
      // Create a new Exploding Kitten card with strict ID if possible or unique
      cardToInsert = [EKCardType.EXPLODING_KITTEN, Date.now()];
    } else if (this.state.gamePhase === EKGamePhase.BURYING_CARD) {
      cardToInsert = this.state.buryCard;
      this.state.buryCard = null;
    }

    if (!cardToInsert) return;

    // index is depth from top (0 = top of deck, length = bottom)
    const safeIndex = Math.max(0, Math.min(index, this.state.drawPile.length));
    // splice index logic:
    // array is [bottom, ..., top]
    // index 0 (top) means insert at array length
    // index length (bottom) means insert at 0
    const spliceIndex = this.state.drawPile.length - safeIndex;

    this.state.drawPile.splice(spliceIndex, 0, cardToInsert);

    // Reset phase and end turn
    this.state.gamePhase = EKGamePhase.PLAYING;
    this.finishTurnAction();
  }

  private handleGiveFavor(playerId: string, cardIndex: number): void {
    if (this.state.gamePhase !== EKGamePhase.FAVOR_GIVING) return;
    if (playerId !== this.state.favorFrom) return;

    const target = this.state.players.find(
      (p) => p.id === this.state.favorFrom,
    );
    const requester = this.state.players.find(
      (p) => p.id === this.state.favorTo,
    );

    if (
      target &&
      requester &&
      cardIndex >= 0 &&
      cardIndex < target.hand.length
    ) {
      const card = target.hand.splice(cardIndex, 1)[0];
      if (card) {
        requester.hand.push(card);
      }

      this.state.gamePhase = EKGamePhase.PLAYING;
      this.state.favorFrom = null;
      this.state.favorTo = null;

      this.checkBotTurn();
    }
  }

  private handleReorderFuture(playerId: string, newOrder: number[]): void {
    if (this.state.gamePhase !== EKGamePhase.ALTER_THE_FUTURE) return;
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;
    if (!this.state.alterCards) return;

    const count = this.state.alterCount;
    // Validate newOrder
    if (
      newOrder.length !== count ||
      !newOrder.every(
        (idx, i, arr) => idx >= 0 && idx < count && arr.indexOf(idx) === i,
      )
    ) {
      return;
    }

    // Apply new order: alterCards[0] = top of deck (will be drawn first)
    const reordered = newOrder.map((idx) => this.state.alterCards![idx]);
    // Remove old top cards and push reordered back
    this.state.drawPile.splice(this.state.drawPile.length - count, count);
    // Push in reverse so reordered[0] is on top (end of array)
    for (let i = reordered.length - 1; i >= 0; i--) {
      this.state.drawPile.push(reordered[i]);
    }

    this.state.alterCards = null;
    this.state.alterCount = 0;
    this.state.lastAction = {
      action: { type: "REORDER_FUTURE", playerId, newOrder },
      playerId,
      timestamp: Date.now(),
      isNoped: false,
    };
    this.state.gamePhase = EKGamePhase.PLAYING;
    this.checkBotTurn();
  }

  private finishTurnAction(): void {
    this.state.attackStack--;
    if (this.state.attackStack <= 0) {
      this.advanceTurn();
    } else {
      this.checkBotTurn();
    }
  }

  private advanceTurn(nextStack = false): void {
    const nextIndex = this.getNextPlayerIndex(this.state.currentTurnIndex);
    this.state.currentTurnIndex = nextIndex;
    if (!nextStack) {
      this.state.attackStack = 1;
    }

    this.checkBotTurn();
  }

  private getNextPlayerIndex(fromIndex: number): number {
    const numPlayers = this.state.players.length;
    let nextIndex = fromIndex;
    do {
      nextIndex = (nextIndex + this.state.direction + numPlayers) % numPlayers;
    } while (
      this.state.players[nextIndex].id === null ||
      this.state.players[nextIndex].isExploded
    );
    return nextIndex;
  }

  private getNextPlayerId(fromIndex: number): string {
    const nextIndex = this.getNextPlayerIndex(fromIndex);
    return this.state.players[nextIndex].id!;
  }

  private explodePlayer(index: number): void {
    const player = this.state.players[index];

    // Add to discard history for tracking
    this.state.discardHistory.push({
      playerId: player.id!,
      cards: [[EKCardType.EXPLODING_KITTEN, 0]],
      timestamp: Date.now(),
      isNoped: false,
    });

    // Set lastAction to trigger toast
    this.state.lastAction = {
      action: { type: "EXPLODE" as any, playerId: player.id! },
      playerId: player.id!,
      timestamp: Date.now(),
      isNoped: false,
      cardType: EKCardType.EXPLODING_KITTEN,
    };

    this.state.players[index].isExploded = true;
    this.state.players[index].hand = []; // Discard everything

    // Check if only one player left
    const alivePlayers = this.state.players.filter(
      (p) => p.id !== null && !p.isExploded,
    );
    if (alivePlayers.length === 1) {
      this.state.winner = alivePlayers[0].id;
      this.state.gamePhase = EKGamePhase.ENDED;
      this.clearSavedState();
    } else {
      this.state.gamePhase = EKGamePhase.PLAYING;
      this.advanceTurn();
    }
  }

  // ============== Bot Logic ==============

  private checkBotTurn(): void {
    if (!this.isHost || this.state.gamePhase === EKGamePhase.ENDED) return;

    if (this.state.gamePhase === EKGamePhase.FAVOR_GIVING) {
      const target = this.state.players.find(
        (p) => p.id === this.state.favorFrom,
      );
      if (target?.isBot) {
        setTimeout(() => this.makeBotFavor(target), 1000);
      }
      return;
    }

    if (this.state.gamePhase === EKGamePhase.ALTER_THE_FUTURE) {
      const currentPlayer = this.state.players[this.state.currentTurnIndex];
      if (currentPlayer?.isBot && this.state.alterCards) {
        // Bot just confirms current order after a delay
        setTimeout(() => {
          if (this.state.gamePhase === EKGamePhase.ALTER_THE_FUTURE) {
            const order = Array.from(
              { length: this.state.alterCount },
              (_, i) => i,
            );
            this.handleReorderFuture(currentPlayer.id!, order);
          }
        }, 1500);
      }
      return;
    }

    if (this.state.gamePhase === EKGamePhase.NOPE_WINDOW) {
      if (!this.state.pendingAction) return;
      this.state.players.forEach((p) => {
        if (
          p.isBot &&
          !p.isExploded &&
          this.state.pendingAction!.responses[p.id!] === undefined
        ) {
          // Check if bot has Nope card
          const hasNope = p.hand.some((c) => c[0] === EKCardType.NOPE);
          if (hasNope) {
            // 20% chance to Nope, otherwise Allow after some delay
            setTimeout(
              () => {
                if (this.state.gamePhase === EKGamePhase.NOPE_WINDOW) {
                  if (Math.random() < 0.2) {
                    this.handleRespondNope(p.id!, "NOPE");
                  } else {
                    this.handleRespondNope(p.id!, "ALLOW");
                  }
                }
              },
              1000 + Math.random() * 2000,
            );
          } else {
            // Just allow after some delay
            setTimeout(
              () => {
                if (this.state.gamePhase === EKGamePhase.NOPE_WINDOW) {
                  this.handleRespondNope(p.id!, "ALLOW");
                }
              },
              500 + Math.random() * 1000,
            );
          }
        }
      });
      return;
    }

    const currentPlayer = this.state.players[this.state.currentTurnIndex];
    if (currentPlayer?.isBot && !currentPlayer.isExploded) {
      setTimeout(() => this.makeBotMove(currentPlayer), 1500);
    }
  }

  private makeBotMove(bot: PlayerSlot): void {
    if (
      !this.isHost ||
      this.state.currentTurnIndex !== this.state.players.indexOf(bot)
    )
      return;

    if (this.state.gamePhase === EKGamePhase.DEFUSING) {
      this.handleDefuse(bot.id!);
      return;
    }

    if (
      this.state.gamePhase === EKGamePhase.INSERTING_KITTEN ||
      this.state.gamePhase === EKGamePhase.BURYING_CARD
    ) {
      // Bots put kitten/card at random position
      const index = Math.floor(
        Math.random() * (this.state.drawPile.length + 1),
      );
      this.handleInsertCard(bot.id!, index);
      return;
    }

    if (this.state.gamePhase === EKGamePhase.ALTER_THE_FUTURE) {
      // Bots just confirm current order
      if (this.state.alterCards) {
        const count = this.state.alterCount;
        const order = Array.from({ length: count }, (_, i) => i);
        this.handleReorderFuture(bot.id!, order);
      }
      return;
    }

    if (this.state.gamePhase !== EKGamePhase.PLAYING) return;

    // 1. Try to play combos first (if bot has them)
    // Only use CAT cards for combos - expansion cards are better played individually
    const combos = new Map<EKCardType, number[]>();
    bot.hand.forEach((c, i) => {
      // Only CAT_1 to CAT_5 can be used for combos
      if (c[0] >= EKCardType.CAT_1 && c[0] <= EKCardType.CAT_5) {
        if (!combos.has(c[0])) combos.set(c[0], []);
        combos.get(c[0])!.push(i);
      }
    });

    for (const [_type, indices] of combos.entries()) {
      if (indices.length >= 2 && Math.random() < 0.4) {
        // Play pair or triplet
        const count = indices.length >= 3 && Math.random() < 0.5 ? 3 : 2;
        const potentialTargets = this.state.players.filter(
          (p) => p.id !== null && p.id !== bot.id && !p.isExploded,
        );
        if (potentialTargets.length > 0) {
          const targetId =
            potentialTargets[
              Math.floor(Math.random() * potentialTargets.length)
            ].id!;
          const playingIndices = indices.slice(0, count);
          const requestedType =
            count === 3
              ? [
                  EKCardType.ATTACK,
                  EKCardType.SKIP,
                  EKCardType.FAVOR,
                  EKCardType.SHUFFLE,
                  EKCardType.SEE_THE_FUTURE,
                  // Expansion cards - valuable targets
                  EKCardType.REVERSE,
                  EKCardType.TARGETED_ATTACK,
                  EKCardType.ALTER_THE_FUTURE_3,
                ][Math.floor(Math.random() * 8)]
              : undefined;

          this.handlePlayCombo(
            bot.id!,
            playingIndices,
            targetId,
            requestedType,
          );
          return;
        }
      }
    }

    // 2. Try to play single action cards
    const playableIndices = bot.hand
      .map((_, i) => i)
      .filter((i) => {
        const type = bot.hand[i][0];
        // Exclude: DEFUSE (save for emergency), EXPLODING_KITTEN, NOPE (for defense), CAT cards (for combos)
        if (type === EKCardType.DEFUSE) return false;
        if (type === EKCardType.EXPLODING_KITTEN) return false;
        if (type === EKCardType.NOPE) return false;
        if (type >= EKCardType.CAT_1 && type <= EKCardType.CAT_5) return false;
        return true; // Allow action cards + expansion cards
      });

    if (playableIndices.length > 0 && Math.random() < 0.3) {
      const idx =
        playableIndices[Math.floor(Math.random() * playableIndices.length)];
      const cardType = bot.hand[idx][0];

      let targetId: string | undefined;
      // Cards that need a target
      if (
        cardType === EKCardType.FAVOR ||
        cardType === EKCardType.TARGETED_ATTACK
      ) {
        const potentialTargets = this.state.players.filter(
          (p) => p.id !== null && p.id !== bot.id && !p.isExploded,
        );
        if (potentialTargets.length > 0) {
          targetId =
            potentialTargets[
              Math.floor(Math.random() * potentialTargets.length)
            ].id!;
        } else if (cardType === EKCardType.TARGETED_ATTACK) {
          // No valid target, skip this card
          this.handleDrawCard(bot.id!);
          return;
        }
      }

      this.handlePlayCard(bot.id!, idx, targetId);
    } else {
      this.handleDrawCard(bot.id!);
    }
  }

  private makeBotFavor(bot: PlayerSlot): void {
    if (bot.hand.length > 0) {
      const idx = Math.floor(Math.random() * bot.hand.length);
      this.handleGiveFavor(bot.id!, idx);
    }
  }

  // ============== Slot Management ==============

  private handleAddBot(slotIndex: number): void {
    if (
      slotIndex < 0 ||
      slotIndex >= 5 ||
      this.state.gamePhase !== EKGamePhase.WAITING
    )
      return;
    if (this.state.players[slotIndex].id !== null) return;

    this.state.players[slotIndex] = {
      id: `BOT_${slotIndex}_${Date.now()}`,
      username: `Bot ${slotIndex + 1}`,
      hand: [],
      isExploded: false,
      isBot: true,
      isHost: false,
    };
  }

  private handleJoinSlot(
    slotIndex: number,
    playerId: string,
    playerName: string,
  ): void {
    if (
      slotIndex < 0 ||
      slotIndex >= 5 ||
      this.state.gamePhase !== EKGamePhase.WAITING
    )
      return;
    if (this.state.players[slotIndex].id !== null) return;
    if (this.state.players.some((p) => p.id === playerId)) return;

    this.state.players[slotIndex] = {
      id: playerId,
      username: playerName,
      hand: [],
      isExploded: false,
      isBot: false,
      isHost: false,
    };
  }

  private handleRemovePlayer(slotIndex: number): void {
    if (
      slotIndex < 0 ||
      slotIndex >= 5 ||
      this.state.gamePhase !== EKGamePhase.WAITING
    )
      return;
    const player = this.state.players[slotIndex];
    if (!player.isBot) return;

    this.state.players[slotIndex] = {
      id: null,
      username: `Slot ${slotIndex + 1}`,
      hand: [],
      isExploded: false,
      isBot: false,
      isHost: false,
    };
  }

  // ============== Public API ==============

  requestDrawCard(): void {
    this.makeAction({ type: "DRAW_CARD", playerId: this.userId });
  }

  requestPlayCard(cardIndex: number, targetPlayerId?: string): void {
    this.makeAction({
      type: "PLAY_CARD",
      playerId: this.userId,
      cardIndex,
      targetPlayerId,
    });
  }

  requestDefuse(): void {
    this.makeAction({ type: "DEFUSE", playerId: this.userId });
  }

  requestInsertKitten(index: number): void {
    this.makeAction({ type: "INSERT_KITTEN", playerId: this.userId, index });
  }

  requestGiveFavor(cardIndex: number): void {
    this.makeAction({ type: "GIVE_FAVOR", playerId: this.userId, cardIndex });
  }

  requestPlayCombo(
    cardIndices: number[],
    targetPlayerId: string,
    requestedCardType?: EKCardType,
  ): void {
    this.makeAction({
      type: "PLAY_COMBO",
      playerId: this.userId,
      cardIndices,
      targetPlayerId,
      requestedCardType,
    });
  }

  requestAddBot(slotIndex: number): void {
    this.makeAction({ type: "ADD_BOT", slotIndex });
  }

  requestJoinSlot(slotIndex: number, playerName: string): void {
    this.makeAction({
      type: "JOIN_SLOT",
      slotIndex,
      playerId: this.userId,
      playerName,
    });
  }

  requestRemovePlayer(slotIndex: number): void {
    this.makeAction({ type: "REMOVE_PLAYER", slotIndex });
  }

  requestStartGame(): void {
    this.makeAction({ type: "START_GAME" });
  }

  requestRespondNope(response: "NOPE" | "ALLOW"): void {
    this.makeAction({ type: "RESPOND_NOPE", playerId: this.userId, response });
  }

  requestReorderFuture(newOrder: number[]): void {
    this.makeAction({
      type: "REORDER_FUTURE",
      playerId: this.userId,
      newOrder,
    });
  }

  requestNewGame(): void {
    if (this.isHost) {
      this.onSocketGameAction({ action: { type: "NEW_GAME" } });
    } else {
      this.sendSocketGameAction({
        type: "REQUEST_NEW_GAME",
        playerId: this.userId,
        playerName:
          this.state.players.find((p) => p.id === this.userId)?.username ||
          "Player",
      });
    }
  }

  acceptNewGame(): void {
    this.onSocketGameAction({ action: { type: "ACCEPT_NEW_GAME" } });
  }

  declineNewGame(): void {
    this.onSocketGameAction({ action: { type: "DECLINE_NEW_GAME" } });
  }

  private handleNewGameRequest(playerId: string, playerName: string): void {
    this.state.newGameRequest = { fromId: playerId, fromName: playerName };
  }

  reset(): void {
    const slots = this.state.players.map((p) => ({
      ...p,
      hand: [],
      isExploded: false,
    }));
    this.state = {
      ...this.getInitState(),
      players: slots,
    };
  }
}
