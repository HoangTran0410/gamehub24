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

export default class ExplodingKittens extends BaseGame<EKState> {
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
        this.handleInsertKitten(action.playerId, action.index);
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

  // ============== Deck Management ==============

  private createDeck(): EKCard[] {
    const deck: EKCard[] = [];
    let nextId = 1;

    // Add cards (excluding Kittens and Defuses for now)
    const addCards = (type: EKCardType, count: number) => {
      for (let i = 0; i < count; i++) deck.push([type, nextId++]);
    };

    addCards(EKCardType.ATTACK, 4);
    addCards(EKCardType.SKIP, 4);
    addCards(EKCardType.FAVOR, 4);
    addCards(EKCardType.SHUFFLE, 4);
    addCards(EKCardType.SEE_THE_FUTURE, 5);
    addCards(EKCardType.NOPE, 5);
    addCards(EKCardType.CAT_1, 4);
    addCards(EKCardType.CAT_2, 4);
    addCards(EKCardType.CAT_3, 4);
    addCards(EKCardType.CAT_4, 4);
    addCards(EKCardType.CAT_5, 4);
    // Expansion cards
    addCards(EKCardType.REVERSE, 4);
    addCards(EKCardType.TARGETED_ATTACK, 3);
    addCards(EKCardType.ALTER_THE_FUTURE_3, 4);
    addCards(EKCardType.ALTER_THE_FUTURE_5, 1);

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

    let deck = this.createDeck();

    // 2. Deal 1 Defuse and 6 cards from the shuffled deck to each player (total 7 cards)
    let nextId = 1000; // Unique IDs for Defuses and Kittens
    for (const player of activePlayers) {
      player.hand = [[EKCardType.DEFUSE, nextId++], ...deck.splice(0, 6)];
    }

    // 3. Add remaining Defuses (if any) and Kittens (n-1) to deck
    // Standard game: 6 total defuses. Let's use 2 extra defuses in the deck.
    const extraDefuses = 2;
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
      this.state.gamePhase = EKGamePhase.DEFUSING;
      // Check if player has defuse
      const player = this.state.players[playerIndex];
      const defuseIndex = player.hand.findIndex(
        (c) => c[0] === EKCardType.DEFUSE,
      );

      if (defuseIndex === -1) {
        // Player explodes!
        this.explodePlayer(playerIndex);
      } else {
        // Player can defuse - waiting for DEFUSE action
        this.checkBotTurn();
      }
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

    // Auto-execute after 10s
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
        this.state.alterCount = 3;
        this.state.gamePhase = EKGamePhase.ALTER_THE_FUTURE;
        this.checkBotTurn();
        break;
      case EKCardType.ALTER_THE_FUTURE_5:
        this.state.alterCards = this.state.drawPile.slice(-5).reverse();
        this.state.alterCount = 5;
        this.state.gamePhase = EKGamePhase.ALTER_THE_FUTURE;
        this.checkBotTurn();
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

  private handleInsertKitten(playerId: string, index: number): void {
    if (this.state.gamePhase !== EKGamePhase.INSERTING_KITTEN) return;
    const playerIndex = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== this.state.currentTurnIndex) return;

    // Put kitten back into deck
    // index is 0 to drawPile.length
    const kIndex = Math.max(0, Math.min(index, this.state.drawPile.length));

    // Find the exploding kitten card (it should be "temporary" or we can just create a new one)
    // In our logic, handleDrawCard didn't remove it from drawPile yet?
    // Wait, drawPile.pop() removed it.
    this.state.drawPile.splice(this.state.drawPile.length - kIndex, 0, [
      EKCardType.EXPLODING_KITTEN,
      999,
    ]);

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

    if (this.state.gamePhase === EKGamePhase.INSERTING_KITTEN) {
      // Bots put kitten at random position
      const index = Math.floor(
        Math.random() * (this.state.drawPile.length + 1),
      );
      this.handleInsertKitten(bot.id!, index);
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
