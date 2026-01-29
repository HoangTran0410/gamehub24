import { BaseGame, type GameAction } from "../BaseGame";
import {
  type PokerState,
  type PokerAction,
  type PokerPlayer,
  type Card,
  type HandEvaluation,
  Suit,
  Rank,
  HandRanking,
} from "./types";
import type { Player } from "../../stores/roomStore";

export default class Poker extends BaseGame<PokerState> {
  private deck: Card[] = [];

  getMyPlayerIndex(): number {
    return this.state.players.findIndex((p) => p.id === this.userId);
  }

  getUserId(): string {
    return this.userId;
  }

  getInitState(): PokerState {
    const players: PokerPlayer[] = Array(6) // 6 seats max for now
      .fill(null)
      .map((_, i) => ({
        id: null,
        username: `Seat ${i + 1}`,
        hand: [],
        chips: 1000,
        currentBet: 0,
        isBot: false,
        isGuest: false,
        isHost: false,
        hasFolded: false,
        isAllIn: false,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        isActive: false,
        hasActed: false,
      }));

    // Auto-sit host/existing players
    if (this.players && this.players.length > 0) {
      this.players.forEach((p) => {
        // Find first empty seat
        const emptyIndex = players.findIndex((seat) => seat.id === null);
        if (emptyIndex !== -1) {
          players[emptyIndex] = {
            ...players[emptyIndex],
            id: p.id,
            username: p.username || `Player ${p.id.substr(0, 4)}`,
            isHost: p.id === this.userId, // Initial check, might be wrong if this.userId is just me? No, checking against room host logic is better but specific player host flag is on BaseGame usually? BaseGame has isHost boolean for "me".
            // Better: just set general props. Host flag in PokerPlayer is for visual Crown.
            // We can check if p.isHost if Player type has it? Player from roomStore usually has isHost?
            // Let's assume standard props first.
            chips: 1000,
          };
          // Check if this player is the room host?
          // `this.players` from roomStore might not have `isHost` property directly on Player object depending on store.
          // Usually we deduce host by logic.
          // Let's just set ID and Username. Host visual can be updated later or checked dynamically.
        }
      });
    }

    // Assign host to first seat if available (logic handled in BaseGame/create usually, but here we set initial state)
    // We'll update players when they join.

    return {
      players,
      communityCards: [],
      pot: 0,
      currentBet: 0,
      dealerIndex: 0,
      currentTurnIndex: 0,
      smallBlindAmount: 10,
      bigBlindAmount: 20,
      gamePhase: "waiting",
      winnerIds: [],
      minRaise: 20,
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    if (!this.isHost) return;
    const action = data.action as PokerAction;

    switch (action.type) {
      case "START_GAME":
        this.startGame();
        break;
      case "ADD_BOT":
        this.addBot(action.slotIndex);
        break;
      case "RESET_GAME":
        this.resetGame();
        break;
      case "JOIN_SLOT":
        this.joinSlot(action.slotIndex, action.playerId, action.playerName);
        break;
      case "REMOVE_PLAYER":
        this.removePlayer(action.slotIndex);
        break;

      case "FOLD":
        this.handleFold(action.playerId);
        break;
      case "CHECK":
        this.handleCheck(action.playerId);
        break;
      case "CALL":
        this.handleCall(action.playerId);
        break;
      case "RAISE":
        this.handleRaise(action.playerId, action.amount);
        break;
      case "ALL_IN":
        this.handleAllIn(action.playerId);
        break;
    }
  }

  public updatePlayers(players: Player[]) {
    super.updatePlayers(players);
    if (!this.isHost) return;

    // Reconciliation: Sync Room Players -> Game Seats

    // 1. Identify players who left (Seated, not Bot, not in new list)
    this.state.players.forEach((seat, index) => {
      if (seat.id && !seat.isBot) {
        const stillInRoom = players.find((p) => p.id === seat.id);
        if (!stillInRoom) {
          this.removePlayer(index);
        }
      }
    });

    // 2. Identify new players (In list, not seated)
    players.forEach((p) => {
      const isSeated = this.state.players.some((seat) => seat.id === p.id);
      if (!isSeated) {
        // Find empty slot
        const emptyIndex = this.state.players.findIndex(
          (seat) => seat.id === null,
        );
        if (emptyIndex !== -1) {
          this.joinSlot(emptyIndex, p.id, p.username || `Player`);
          // Update host flag?
          if (p.id === this.userId && this.isHost) {
            this.state.players[emptyIndex].isHost = true;
          }
        }
      }
    });

    // 3. Update metadata (host status etc)
    // Note: roomStore Player object might differ.
    // We can iterate and update names if changed?
  }

  // --- Game Flow ---

  private startGame() {
    // Check min players
    const activeCount = this.state.players.filter((p) => p.id !== null).length;
    if (activeCount < 2) return;

    // Reset game state for new round
    this.deck = this.createDeck();
    this.shuffleDeck(this.deck);
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.winnerIds = [];
    this.state.winningHand = undefined;
    this.state.gamePhase = "pre_flop";
    this.state.lastAction = undefined;

    // Reset player states
    this.state.players.forEach((p) => {
      if (p.id !== null) {
        p.isActive = true;
        p.hand = [];
        p.hasFolded = false;
        p.isAllIn = false;
        p.currentBet = 0;
        p.isSmallBlind = false;
        p.isBigBlind = false;
        p.hasActed = false;
        // Check if bankrupt
        if (p.chips <= 0) {
          p.chips = 1000; // Auto-rebuy for now or kick?
          // For fun, let's give them chips if they are out
        }
      } else {
        p.isActive = false;
      }
    });

    // Move dealer button
    this.moveButton();

    // Post blinds
    this.postBlinds();

    // Deal Hole Cards
    this.dealHoleCards();

    // Set next turn (UTG - Under The Gun, left of Big Blind)
    // Small Blind (1), Big Blind (2), so UTG is (3) relative to Dealer (0)
    // In heads up (2 players), Dealer is SB, Other is BB.

    const activeIndices = this.getActivePlayerIndices();
    const dealerPos = activeIndices.indexOf(this.state.dealerIndex);

    let turnPos;
    if (activeIndices.length === 2) {
      // Heads-up: Dealer is SB, moves first pre-flop
      turnPos = dealerPos;
    } else {
      // Normal: SB(1), BB(2), UTG(3)
      turnPos = (dealerPos + 3) % activeIndices.length;
    }

    this.state.currentTurnIndex = activeIndices[turnPos];
    this.state.minRaise = this.state.bigBlindAmount;

    this.checkBotTurn();
  }

  private moveButton() {
    const activeIndices = this.getActivePlayerIndices();
    if (activeIndices.length === 0) return;

    // Find current dealer in active list
    let currentIdxInActive = activeIndices.indexOf(this.state.dealerIndex);
    if (currentIdxInActive === -1) {
      currentIdxInActive = 0; // Default if lost
    }

    // Move to next
    const nextIdxInActive = (currentIdxInActive + 1) % activeIndices.length;
    this.state.dealerIndex = activeIndices[nextIdxInActive];

    // Reset wrapper props
    this.state.players.forEach((p) => (p.isDealer = false));
    this.state.players[this.state.dealerIndex].isDealer = true;
  }

  private postBlinds() {
    const activeIndices = this.getActivePlayerIndices();
    const dealerPos = activeIndices.indexOf(this.state.dealerIndex);

    let sbPos, bbPos;

    if (activeIndices.length === 2) {
      // Heads-up: Dealer is SB, Opponent is BB
      sbPos = dealerPos;
      bbPos = (dealerPos + 1) % 2;
    } else {
      sbPos = (dealerPos + 1) % activeIndices.length;
      bbPos = (dealerPos + 2) % activeIndices.length;
    }

    // Post SB
    const sbIndex = activeIndices[sbPos];
    const sbPlayer = this.state.players[sbIndex];
    const sbAmount = Math.min(sbPlayer.chips, this.state.smallBlindAmount);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    sbPlayer.isSmallBlind = true;
    this.state.pot += sbAmount;

    // Post BB
    const bbIndex = activeIndices[bbPos];
    const bbPlayer = this.state.players[bbIndex];
    const bbAmount = Math.min(bbPlayer.chips, this.state.bigBlindAmount);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    bbPlayer.isBigBlind = true;
    this.state.pot += bbAmount;

    this.state.currentBet = this.state.bigBlindAmount;
  }

  private dealHoleCards() {
    this.state.players.forEach((p) => {
      if (p.isActive) {
        p.hand = [this.deck.pop()!, this.deck.pop()!];
      }
    });
  }

  private nextPhase() {
    // Gather all bets into pot (already done incrementally, but ensure currentBets are reset)
    // The currentBet attribute on player is "bet in this round".
    // We should keep them to know if they matched the highest bet.
    // But when phase ends, we reset them.

    this.state.players.forEach((p) => {
      p.currentBet = 0;
      p.hasActed = false;
    });
    this.state.currentBet = 0;
    this.state.minRaise = this.state.bigBlindAmount; // Reset min raise? Usually strictly it's at least BB
    this.state.lastAction = undefined;

    switch (this.state.gamePhase) {
      case "pre_flop":
        this.dealCommunityCards(3); // Flop
        this.state.gamePhase = "flop";
        break;
      case "flop":
        this.dealCommunityCards(1); // Turn
        this.state.gamePhase = "turn";
        break;
      case "turn":
        this.dealCommunityCards(1); // River
        this.state.gamePhase = "river";
        break;
      case "river":
        this.showdown();
        return;
    }

    // Set turn to first active player left of Dealer
    const activeIndices = this.getActivePlayerIndices().filter(
      (idx) =>
        !this.state.players[idx].hasFolded && !this.state.players[idx].isAllIn,
    );
    if (activeIndices.length === 0) {
      // Everyone all in? Straight to showdown
      this.runRemainingPhases();
      return;
    }

    // const dealerPos = this.state.players.findIndex(
    //   (p) => p.isActive && p.isDealer,
    // ); // Re-find in case index shifted or using stored index
    // Wait, dealerIndex is stored.

    // Find next active player after dealer
    let nextIndex = (this.state.dealerIndex + 1) % 6;
    while (
      !this.state.players[nextIndex].isActive ||
      this.state.players[nextIndex].hasFolded ||
      this.state.players[nextIndex].isAllIn
    ) {
      nextIndex = (nextIndex + 1) % 6;
      if (nextIndex === this.state.dealerIndex) break; // Should not happen if check above passed
    }

    this.state.currentTurnIndex = nextIndex;

    // Auto-check if everyone is all-in except one? logic handled in advanceTurn

    this.checkBotTurn();
  }

  private runRemainingPhases() {
    // If everyone is all-in, just deal the rest and showdown
    while (this.state.gamePhase !== "ended") {
      if (this.state.gamePhase === "pre_flop") {
        this.dealCommunityCards(3);
        this.state.gamePhase = "flop";
      } else if (this.state.gamePhase === "flop") {
        this.dealCommunityCards(1);
        this.state.gamePhase = "turn";
      } else if (this.state.gamePhase === "turn") {
        this.dealCommunityCards(1);
        this.state.gamePhase = "river";
      } else if (this.state.gamePhase === "river") {
        this.showdown();
        return;
      }

      // sleep logic? No, just run through
    }
  }

  private dealCommunityCards(count: number) {
    for (let i = 0; i < count; i++) {
      if (this.deck.length > 0) {
        // Burn card? usually yes, but let's simplify
        this.state.communityCards.push(this.deck.pop()!);
      }
    }
  }

  private showdown() {
    this.state.gamePhase = "showdown";

    const activePlayers = this.state.players.filter(
      (p) => p.isActive && !p.hasFolded,
    );

    if (activePlayers.length === 0) return; // Should not happen

    if (activePlayers.length === 1) {
      // Only one player left (everyone else folded)
      const winner = activePlayers[0];
      this.state.winnerIds = [winner.id!];
      winner.chips += this.state.pot;
      this.state.pot = 0;
      this.state.gamePhase = "ended";

      return;
    }

    // Evaluate hands
    let bestRankVal = -1;
    let winners: PokerPlayer[] = [];
    let winningEval: HandEvaluation | undefined;

    for (const p of activePlayers) {
      const evaluation = this.evaluateHand(p.hand, this.state.communityCards);
      const val = this.getHandValue(evaluation);

      if (val > bestRankVal) {
        bestRankVal = val;
        winners = [p];
        winningEval = evaluation;
      } else if (val === bestRankVal) {
        winners.push(p);
      }
    }

    this.state.winnerIds = winners.map((p) => p.id!);
    this.state.winningHand = winningEval;

    // Split pot
    const splitAmount = Math.floor(this.state.pot / winners.length);
    winners.forEach((w) => (w.chips += splitAmount));
    // Remainder goes to first?
    const remainder = this.state.pot % winners.length;
    if (remainder > 0 && winners.length > 0) {
      winners[0].chips += remainder;
    }

    this.state.pot = 0;
    this.state.gamePhase = "ended";
  }

  // --- Hand Evaluation (Simplified for now) ---
  // Returns a numerical value for comparison: Rank * 10000000 + TieBreakers
  // Better implementation would use a proper library or standard algo, but let's roll a basic one.

  public evaluateHand(holeCards: Card[], community: Card[]): HandEvaluation {
    const allCards = [...holeCards, ...community];
    // Sort by rank descending
    allCards.sort((a, b) => b.rank - a.rank);

    // Check flushes
    const suitCounts: Record<number, Card[]> = {};
    allCards.forEach((c) => {
      if (!suitCounts[c.suit]) suitCounts[c.suit] = [];
      suitCounts[c.suit].push(c);
    });

    let flushSuit = -1;
    Object.keys(suitCounts).forEach((s) => {
      if (suitCounts[Number(s)].length >= 5) flushSuit = Number(s);
    });

    // Check Straights
    const uniqueRanks = Array.from(new Set(allCards.map((c) => c.rank))).sort(
      (a, b) => b - a,
    );
    let straightHighRank = -1;

    // Check for 5 consecutive
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
        straightHighRank = uniqueRanks[i];
        break;
      }
    }
    // Check Ace low straight (5-4-3-2-A)
    if (
      straightHighRank === -1 &&
      uniqueRanks.includes(Rank.ACE) &&
      uniqueRanks.includes(Rank.TWO) &&
      uniqueRanks.includes(Rank.THREE) &&
      uniqueRanks.includes(Rank.FOUR) &&
      uniqueRanks.includes(Rank.FIVE)
    ) {
      straightHighRank = 5;
    }

    // Check Straight Flush
    if (flushSuit !== -1) {
      const flushCards = suitCounts[flushSuit];
      const flushRanks = Array.from(
        new Set(flushCards.map((c) => c.rank)),
      ).sort((a, b) => b - a);
      // Check straight within flush cards
      for (let i = 0; i <= flushRanks.length - 5; i++) {
        if (flushRanks[i] - flushRanks[i + 4] === 4) {
          if (flushRanks[i] === Rank.ACE) {
            return {
              rank: HandRanking.ROYAL_FLUSH,
              cards: flushCards.slice(i, i + 5),
              kickers: [],
              name: "Royal Flush",
            };
          }
          return {
            rank: HandRanking.STRAIGHT_FLUSH,
            cards: flushCards.slice(i, i + 5),
            kickers: [],
            name: "Straight Flush",
          };
        }
      }
      // Ace low straight flush
      if (
        flushRanks.includes(Rank.ACE) &&
        flushRanks.includes(Rank.TWO) &&
        flushRanks.includes(Rank.THREE) &&
        flushRanks.includes(Rank.FOUR) &&
        flushRanks.includes(Rank.FIVE)
      ) {
        // Get the specific cards
        const cards = flushCards
          .filter((c) => [14, 2, 3, 4, 5].includes(c.rank))
          .slice(0, 5); // Rough selection
        return {
          rank: HandRanking.STRAIGHT_FLUSH,
          cards,
          kickers: [],
          name: "Straight Flush (Low)",
        };
      }
    }

    // Check Quads, Full House, Triples, Two Pair, Pair
    const rankCounts: Record<number, Card[]> = {};
    allCards.forEach((c) => {
      if (!rankCounts[c.rank]) rankCounts[c.rank] = [];
      rankCounts[c.rank].push(c);
    });

    const keys = Object.keys(rankCounts)
      .map(Number)
      .sort((a, b) => b - a);
    const quads = keys.filter((k) => rankCounts[k].length === 4);
    const triples = keys.filter((k) => rankCounts[k].length === 3);
    const pairs = keys.filter((k) => rankCounts[k].length === 2);

    if (quads.length > 0) {
      const qRank = quads[0];
      const main = rankCounts[qRank];
      const kicker = allCards.find((c) => c.rank !== qRank)!;
      return {
        rank: HandRanking.FOUR_OF_A_KIND,
        cards: [...main, kicker],
        kickers: [kicker],
        name: "Four of a Kind",
      };
    }

    if ((triples.length > 0 && pairs.length > 0) || triples.length > 1) {
      const tRank = triples[0];
      const pRank = triples.length > 1 ? triples[1] : pairs[0];
      return {
        rank: HandRanking.FULL_HOUSE,
        cards: [...rankCounts[tRank], ...rankCounts[pRank].slice(0, 2)],
        kickers: [],
        name: "Full House",
      };
    }

    if (flushSuit !== -1) {
      const flushCards = suitCounts[flushSuit];
      return {
        rank: HandRanking.FLUSH,
        cards: flushCards.slice(0, 5),
        kickers: [],
        name: "Flush",
      };
    }

    if (straightHighRank !== -1) {
      // Construct straight cards
      let straightCards: Card[] = [];
      if (straightHighRank === 5) {
        // Ace low straight (5, 4, 3, 2, A)
        const ranks = [5, 4, 3, 2, Rank.ACE];
        straightCards = ranks.map((r) => allCards.find((c) => c.rank === r)!);
      } else {
        // Normal straight
        for (let i = 0; i < 5; i++) {
          straightCards.push(
            allCards.find((c) => c.rank === straightHighRank - i)!,
          );
        }
      }

      return {
        rank: HandRanking.STRAIGHT,
        cards: straightCards,
        kickers: [],
        name: "Straight",
      };
    }

    if (triples.length > 0) {
      const tRank = triples[0];
      const kickers = allCards.filter((c) => c.rank !== tRank).slice(0, 2);
      return {
        rank: HandRanking.THREE_OF_A_KIND,
        cards: [...rankCounts[tRank], ...kickers],
        kickers,
        name: "Three of a Kind",
      };
    }

    if (pairs.length > 0) {
      if (pairs.length >= 2) {
        const p1 = pairs[0];
        const p2 = pairs[1];
        const kicker = allCards.find((c) => c.rank !== p1 && c.rank !== p2)!;
        return {
          rank: HandRanking.TWO_PAIR,
          cards: [...rankCounts[p1], ...rankCounts[p2], kicker],
          kickers: [kicker],
          name: "Two Pair",
        };
      } else {
        const p1 = pairs[0];
        const kickers = allCards.filter((c) => c.rank !== p1).slice(0, 3);
        return {
          rank: HandRanking.PAIR,
          cards: [...rankCounts[p1], ...kickers],
          kickers,
          name: "Pair",
        };
      }
    }

    return {
      rank: HandRanking.HIGH_CARD,
      cards: allCards.slice(0, 5),
      kickers: allCards.slice(1, 5),
      name: "High Card",
    };
  }

  private getHandValue(evaluation: HandEvaluation): number {
    // Create a large number based on rank and card values
    // Rank (0-9) * 10^10 ...
    let val = evaluation.rank * 10000000000;

    // Add card values in order of significance
    // Specifically for standard comparisons, we look at main cards then kickers
    // But evaluation.cards already has meaningful order usually?
    // Actually 'cards' in my logic above combines main components + kickers for display
    // Let's rely on that order

    // e.g. Four of a kind: QQQQ K -> Rank * .. + Q*.. + K
    // Full House: KKK 22 -> Rank * .. + K*.. + 2

    evaluation.cards.forEach((c, i) => {
      val += c.rank * Math.pow(15, 4 - i);
    });

    return val;
  }

  // --- Deck Helper ---
  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of [Suit.SPADE, Suit.CLUB, Suit.DIAMOND, Suit.HEART]) {
      for (let rank = Rank.TWO; rank <= Rank.ACE; rank++) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  private shuffleDeck(deck: Card[]): Card[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // --- Slot Management ---

  private addBot(slotIndex: number) {
    const player = this.state.players[slotIndex];
    if (player.id !== null) return;
    player.id = `BOT_${Date.now()}_${slotIndex}`;
    player.username = `Bot ${slotIndex + 1}`;
    player.isBot = true;
    player.chips = 1000;
  }

  private resetGame() {
    this.state.gamePhase = "waiting";
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.currentBet = 0;
    this.state.winnerIds = [];
    this.state.winningHand = undefined;
    this.state.lastAction = undefined;

    this.state.players.forEach((p) => {
      p.hand = [];
      p.isActive = false;
      p.hasFolded = false;
      p.isAllIn = false;
      p.currentBet = 0;
      p.hasActed = false;
      p.isDealer = false;
      p.isSmallBlind = false;
      p.isBigBlind = false;
      // Reset chips for all players
      if (p.id !== null) {
        p.chips = 1000;
      }
    });
  }

  private joinSlot(slotIndex: number, playerId: string, playerName: string) {
    if (this.state.players[slotIndex].id !== null) return;
    // Remove from other slots
    const existing = this.state.players.findIndex((p) => p.id === playerId);
    if (existing !== -1) {
      this.removePlayer(existing);
    }

    const player = this.state.players[slotIndex];
    player.id = playerId;
    player.username = playerName;
    player.isBot = false;
    player.isGuest = false; // Assume proper player
    player.chips = 1000;
  }

  private removePlayer(slotIndex: number) {
    const player = this.state.players[slotIndex];
    player.id = null;
    player.username = `Seat ${slotIndex + 1}`;
    player.hand = [];
    player.chips = 1000;
    player.currentBet = 0;
    player.isBot = false;
    player.isGuest = false;
    player.isHost = false;
    player.hasFolded = false;
    player.isAllIn = false;
    player.isDealer = false;
    player.isSmallBlind = false;
    player.isBigBlind = false;
    player.isActive = false;
    player.hasActed = false;
  }

  // --- Public Requests ---

  requestStartGame() {
    this.makeAction({ type: "START_GAME" });
  }

  requestResetGame() {
    this.makeAction({ type: "RESET_GAME" });
  }

  requestAddBot(slotIndex: number) {
    this.makeAction({ type: "ADD_BOT", slotIndex });
  }

  requestJoinSlot(slotIndex: number, playerName: string) {
    this.makeAction({
      type: "JOIN_SLOT",
      slotIndex,
      playerId: this.userId,
      playerName,
    });
  }

  requestRemovePlayer(slotIndex: number) {
    this.makeAction({ type: "REMOVE_PLAYER", slotIndex });
  }

  requestFold() {
    this.makeAction({ type: "FOLD", playerId: this.userId });
  }

  requestCheck() {
    this.makeAction({ type: "CHECK", playerId: this.userId });
  }

  requestCall() {
    this.makeAction({ type: "CALL", playerId: this.userId });
  }

  requestRaise(amount: number) {
    this.makeAction({ type: "RAISE", playerId: this.userId, amount });
  }

  requestAllIn() {
    this.makeAction({ type: "ALL_IN", playerId: this.userId });
  }

  // --- Actions ---

  private handleFold(playerId: string) {
    if (!this.isPlayerTurn(playerId)) return;

    const p = this.state.players[this.state.currentTurnIndex];
    p.hasFolded = true;
    p.hasActed = true;
    p.isActive = false; // "Active in current hand" = false

    // Check if everyone else folded
    const activeSurvivors = this.state.players.filter(
      (pl) => pl.isActive && !pl.hasFolded,
    );
    if (activeSurvivors.length === 1) {
      this.endHandWithWinner(activeSurvivors[0]);
    } else {
      this.advanceTurn();
    }
  }

  private handleCheck(playerId: string) {
    if (!this.isPlayerTurn(playerId)) return;
    const p = this.state.players[this.state.currentTurnIndex];

    // Can only check if currentBet == p.currentBet
    if (this.state.currentBet > p.currentBet) return;

    p.hasActed = true;
    this.advanceTurn();
  }

  private handleCall(playerId: string) {
    if (!this.isPlayerTurn(playerId)) return;
    const p = this.state.players[this.state.currentTurnIndex];

    const callAmt = this.state.currentBet - p.currentBet;
    if (callAmt > p.chips) {
      // treat as all-in logic (but triggered via call)
      this.handleAllIn(playerId);
      return;
    }

    p.chips -= callAmt;
    p.currentBet += callAmt;
    this.state.pot += callAmt;
    p.hasActed = true;

    this.advanceTurn();
  }

  private handleRaise(playerId: string, amount: number) {
    if (!this.isPlayerTurn(playerId)) return;
    const p = this.state.players[this.state.currentTurnIndex];

    // Amount is total bet or add-on? Usually raise UI sends total desired bet or add-on.
    // Let's assume input is "raise TO X" or "raise BY X". Standard is often "Raise To".
    // But simpler for Logic if we just check amounts.
    // Let's assume 'amount' is the TOTAL bet they want to be at.

    // Valid raise?
    if (amount < this.state.currentBet + this.state.minRaise) return;
    if (amount > p.chips + p.currentBet) return; // Not enough chips

    const diff = amount - p.currentBet;
    p.chips -= diff;
    p.currentBet = amount;
    this.state.pot += diff;

    // Update Raise info
    const raiseAmt = amount - this.state.currentBet;
    if (raiseAmt >= this.state.minRaise) {
      this.state.minRaise = raiseAmt;
    }
    this.state.currentBet = amount;
    this.state.lastAction = { playerId, action: "Raise", amount };
    p.hasActed = true;

    // Reset other players 'acted' state?
    // In advanceTurn, we check if everyone has matched currentBet.

    this.advanceTurn();
  }

  private handleAllIn(playerId: string) {
    if (!this.isPlayerTurn(playerId)) return;
    const p = this.state.players[this.state.currentTurnIndex];

    const allInAmt = p.chips;
    p.chips = 0;
    p.currentBet += allInAmt;
    this.state.pot += allInAmt;
    p.isAllIn = true;

    if (p.currentBet > this.state.currentBet) {
      const raiseAmt = p.currentBet - this.state.currentBet;
      if (raiseAmt > this.state.minRaise) {
        this.state.minRaise = raiseAmt;
      }
      this.state.currentBet = p.currentBet;
      this.state.lastAction = {
        playerId,
        action: "All In",
        amount: p.currentBet,
      };
    }
    p.hasActed = true;

    this.advanceTurn();
  }

  // --- Turn Management ---

  private advanceTurn() {
    // Check if round should end
    // Round ends if:
    // 1. All active players (not folded) have acted AND matched the current bet (or are all in).

    // Note: checking "have acted" is tricky. We can check if everyone matches currentBet.
    // Special case: Big Blind pre-flop has "option" to check even if matched.
    // Simplify: compare currentTurn to "last aggressor"?
    // Better: iterate players starting from left of button. If anyone hasn't matched and is active/not-allin, it's their turn.

    // BUT, checking alone isn't enough (player might have matched earlier but someone raised).
    // We need to track who was the last to Raise. If it gets back to them, and everyone called, we are done.
    // OR: track "tickets" or just cycle until everyone satisfies condition:
    // (p.currentBet == state.currentBet || p.isAllIn || p.hasFolded) AND everyone has had at least one chance.

    // Let's rely on a simpler "Check if betting round complete" function first.

    if (this.checkBettingRoundComplete()) {
      this.nextPhase();
      return;
    }

    // Find next active player
    let nextIndex = (this.state.currentTurnIndex + 1) % 6;
    let loops = 0;
    while (
      (this.state.players[nextIndex].id === null ||
        this.state.players[nextIndex].hasFolded ||
        this.state.players[nextIndex].isAllIn) &&
      loops < 6
    ) {
      nextIndex = (nextIndex + 1) % 6;
      loops++;
    }

    this.state.currentTurnIndex = nextIndex;

    this.checkBotTurn();
  }

  private checkBettingRoundComplete(): boolean {
    // 1. Everyone must match the bet or be all-in/folded
    const activePlayers = this.state.players.filter(
      (p) => p.isActive && !p.hasFolded,
    );
    const allMatched = activePlayers.every(
      (p) => p.currentBet === this.state.currentBet || p.isAllIn,
    );

    if (!allMatched) return false;

    // 2. Everyone must have had a chance to act.
    // If we just raised, we can't end immediately.
    // For simplicity, let's track "lastAction" or imply it.
    // If the current player (who just acted) matched the bet, and everyone else matches...
    // AND the current player wasn't the one who set the high bet that forced others to act?
    // Actually, if everyone matches, we are good?
    // pre-flop: BB has option. If UTG calls, SB calls, BB checks -> Done.
    // If UTG raises, ... gets back to UTG? No, valid raise re-opens.

    // We need a flag "playersYetToAct" count?
    // Or: if last action was "Check" or "Call" and equality holds -> Done.
    // If last action was "Raise", we need to go around again.
    // But we just handled the current action.

    // Quick hack: Store `lastAggressorIndex`. If turn reaches `lastAggressorIndex` and they match/check -> Done?
    // No, because if P1 raises, P2 calls, P3 calls... when P3 calls, everyone matches. P1 doesn't act again.

    // Correct Logic:
    // When a phase starts, `currentBet` = 0 (except preflop).
    // We need to ensure everyone checked, OR everyone matched the last raise.

    // Let's assume we maintain a set of "pendingPlayers" in future.
    // For MVP: If current Player calls/checks and checking this returns true, and we consider if Big Blind logic Pre-flop?

    // Let's rely on `currentBet` matching.
    // Issue: Start of pre-flop, SB=10, BB=20. Pot=30. CurrentBet=20.
    // Players match 20.
    // SB calls (10+10). BB checks.
    // We need to verify that BB played.

    // Let's add `hasActedThisRound` to Player?
    // Yes.

    return activePlayers.every(
      (p) =>
        (p.currentBet === this.state.currentBet || p.isAllIn) &&
        this.hasPlayerActed(p),
    );
  }

  private hasPlayerActed(p: PokerPlayer): boolean {
    // We can reset a "acted" flag on phase change.
    // Let's add it to state or logic.
    // "p.currentBet > 0" isn't enough (checking).

    // Let's create a temporary set in class (not synced state?) or just add to State for robustness
    // adding `hasActed` to PokerPlayer type is safest.
    return p.isActive && (p.hasFolded || p.isAllIn || p.hasActed);
  }

  // Need to patch State type or use local tracking?
  // Let's check type definition. It doesn't have `hasActed`.
  // I should update type definition to include `hasActed`.
  // For now, I'll update it in `types.ts` before continuing or just cast it.

  // --- Helpers ---
  private isPlayerTurn(playerId: string): boolean {
    const p = this.state.players[this.state.currentTurnIndex];
    return p && p.id === playerId;
  }

  private getActivePlayerIndices(): number[] {
    return this.state.players
      .map((p, i) => ({ p, i }))
      .filter((item) => item.p.id !== null)
      .map((item) => item.i);
  }

  private endHandWithWinner(winner: PokerPlayer) {
    this.state.winnerIds = [winner.id!];
    winner.chips += this.state.pot;
    this.state.pot = 0;
    this.state.gamePhase = "ended";
  }

  // --- Bot ---
  private checkBotTurn() {
    if (!this.isHost) return;
    const p = this.state.players[this.state.currentTurnIndex];
    if (p && p.isBot && p.isActive && !p.hasFolded && !p.isAllIn) {
      setTimeout(() => {
        this.handleBotMove(p);
      }, 1000);
    }
  }

  private handleBotMove(bot: PokerPlayer) {
    if (this.state.gamePhase === "ended") return;

    // Simple logic:
    // If high card value, raise.
    // If medium, call.
    // If bad, check/fold.

    const evalHand = this.evaluateHand(bot.hand, this.state.communityCards);
    // const strength = this.getHandValue(evalHand);

    // Determine cost
    const cost = this.state.currentBet - bot.currentBet;

    if (cost === 0) {
      this.handleCheck(bot.id!);
      return;
    }

    // If cost is small relative to stack (< 5%), always call?
    const ratio = cost / bot.chips;

    // If very good hand (Two pair or better)
    if (evalHand.rank >= HandRanking.TWO_PAIR) {
      // Raise if possible
      if (bot.chips > cost * 2) {
        const raiseAmt =
          this.state.currentBet + Math.min(bot.chips, this.state.minRaise);
        this.handleRaise(bot.id!, raiseAmt);
        return;
      } else {
        this.handleAllIn(bot.id!);
        return;
      }
    }

    // If pair or high cards on pre-flop
    if (
      evalHand.rank >= HandRanking.PAIR ||
      (this.state.gamePhase === "pre_flop" &&
        bot.hand[0].rank + bot.hand[1].rank > 20)
    ) {
      this.handleCall(bot.id!);
      return;
    }

    // Fold if expensive
    if (ratio > 0.02) {
      this.handleFold(bot.id!);
    } else {
      this.handleCall(bot.id!);
    }
  }
}
