import { BaseGame, type GameAction } from "../BaseGame";
import {
  type MauBinhState,
  type MauBinhAction,
  type MauBinhPlayer,
  type Card,
  type HandEval,
  type RoundResult,
  type ArrangementSuggestion,
  type PostGameAnalysis,
  HandRank,
  InstantWin,
  SpecialBonus,
} from "./types";
import { Suit, Rank, encodeCard, decodeCard } from "../poker/types";
import type { Player } from "../../stores/roomStore";

const MAX_PLAYERS = 4;
const ARRANGE_TIME = 90; // seconds
const TIMER_INTERVAL = 500;

export default class MauBinh extends BaseGame<MauBinhState> {
  private deck: Card[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  protected isGameOver(state: MauBinhState): boolean {
    return state.gamePhase === "ended";
  }

  getMyPlayerIndex(): number {
    return this.state.players.findIndex((p) => p.id === this.userId);
  }

  getUserId(): string {
    return this.userId;
  }

  getInitState(): MauBinhState {
    const players: MauBinhPlayer[] = Array(MAX_PLAYERS)
      .fill(null)
      .map((_, i) => this.createEmptyPlayer(i));

    // Auto-sit existing room players
    if (this.players && this.players.length > 0) {
      this.players.forEach((p) => {
        const emptyIndex = players.findIndex((seat) => seat.id === null);
        if (emptyIndex !== -1) {
          players[emptyIndex] = {
            ...players[emptyIndex],
            id: p.id,
            username: p.username || `Player ${p.id.substr(0, 4)}`,
          };
        }
      });
    }

    return {
      players,
      gamePhase: "waiting",
      timerEndsAt: 0,
      roundResults: [],
      roundNumber: 0,
      postGameAnalysis: [],
    };
  }

  private createEmptyPlayer(index: number): MauBinhPlayer {
    return {
      id: null,
      username: `Seat ${index + 1}`,
      hand: [],
      front: [],
      middle: [],
      back: [],
      isBot: false,
      isReady: false,
      score: 0,
      isFouled: false,
      instantWin: InstantWin.NONE,
      usedAuto: false,
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    if (!this.isHost) return;
    const action = data.action as MauBinhAction;

    switch (action.type) {
      case "START_GAME":
        this.startGame();
        break;
      case "ARRANGE_CARDS":
        this.handleArrangeCards(
          action.playerId,
          action.front,
          action.middle,
          action.back,
        );
        break;
      case "AUTO_ARRANGE":
        this.handleAutoArrange(action.playerId);
        break;
      case "DECLARE_INSTANT_WIN":
        this.handleDeclareInstantWin(action.playerId);
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
    }
  }

  updatePlayers(players: Player[]) {
    console.log("updatePlayers", players);
    if (!this.isHost) return;
    const isWaiting = this.state.gamePhase === "waiting";

    for (const rp of players) {
      const existingIndex = this.state.players.findIndex((p) => p.id === rp.id);
      if (existingIndex !== -1) {
        this.state.players[existingIndex].username =
          rp.username || this.state.players[existingIndex].username;
      } else if (isWaiting) {
        const emptyIndex = this.state.players.findIndex((p) => p.id === null);
        if (emptyIndex !== -1) {
          this.state.players[emptyIndex].id = rp.id;
          this.state.players[emptyIndex].username =
            rp.username || `Player ${rp.id.substr(0, 4)}`;
        }
      }
    }

    // Remove players not in room (only during waiting)
    if (isWaiting) {
      const roomIds = new Set(players.map((p) => p.id));
      this.state.players.forEach((p, i) => {
        if (p.id && !p.isBot && !roomIds.has(p.id)) {
          this.removePlayer(i);
        }
      });
    }
  }

  // ===================== GAME LIFECYCLE =====================

  private startGame() {
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    if (activePlayers.length < 2) return;

    this.state.roundNumber++;
    this.deck = this.createDeck();
    this.shuffleDeck(this.deck);
    this.state.gamePhase = "arranging";
    this.state.timerEndsAt = Date.now() + ARRANGE_TIME * 1000;
    this.state.roundResults = [];
    this.state.postGameAnalysis = [];

    // Reset player states and deal
    this.state.players.forEach((p) => {
      if (p.id !== null) {
        p.hand = [];
        p.front = [];
        p.middle = [];
        p.back = [];
        p.isReady = false;
        p.isFouled = false;
        p.instantWin = InstantWin.NONE;
        p.usedAuto = false;
        // Deal 13 cards
        for (let i = 0; i < 13; i++) {
          p.hand.push(this.deck.pop()!);
        }
        // Sort hand by rank desc
        p.hand.sort((a, b) => decodeCard(b).rank - decodeCard(a).rank);
      }
    });

    // Auto-arrange bots: pick the best strategy
    this.state.players.forEach((p) => {
      if (p.id && p.isBot) {
        const suggestions = this.generateSuggestions(p.hand);
        // Pick strategy with highest combined evaluation
        let best = suggestions[0];
        let bestScore = -Infinity;
        for (const s of suggestions) {
          const bv = this.evaluate5CardHand(s.back).value;
          const mv = this.evaluate5CardHand(s.middle).value;
          const fv = this.evaluate3CardHand(s.front).value;
          const score = bv * 3 + mv * 2 + fv;
          if (score > bestScore) {
            bestScore = score;
            best = s;
          }
        }
        p.front = best.front;
        p.middle = best.middle;
        p.back = best.back;
        p.instantWin = this.checkInstantWin(p.hand, p.front, p.middle, p.back);
        p.isFouled =
          p.instantWin === InstantWin.NONE &&
          !this.isValidArrangement(p.front, p.middle, p.back);
        p.isReady = true;
      }
    });

    // Start timer
    this.startTimer();
  }

  private startTimer() {
    this.clearTimer();
    this.timer = setInterval(() => {
      if (this.state.gamePhase !== "arranging") {
        this.clearTimer();
        return;
      }
      if (Date.now() >= this.state.timerEndsAt) {
        this.clearTimer();
        this.forceSubmitAll();
      }
    }, TIMER_INTERVAL);
  }

  private clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private forceSubmitAll() {
    this.state.players.forEach((p) => {
      if (p.id && !p.isReady) {
        const arranged = this.autoArrange(p.hand);
        p.front = arranged.front;
        p.middle = arranged.middle;
        p.back = arranged.back;
        p.instantWin = this.checkInstantWin(p.hand, p.front, p.middle, p.back);
        p.isFouled =
          p.instantWin === InstantWin.NONE &&
          !this.isValidArrangement(p.front, p.middle, p.back);
        p.isReady = true;
      }
    });
    this.compareHands();
  }

  private handleArrangeCards(
    playerId: string,
    front: Card[],
    middle: Card[],
    back: Card[],
  ) {
    if (this.state.gamePhase !== "arranging") return;
    const pIdx = this.state.players.findIndex((p) => p.id === playerId);
    if (pIdx === -1) return;
    const p = this.state.players[pIdx];
    if (p.isReady) return;

    // Validate cards are from the player's hand
    const allCards = [...front, ...middle, ...back];
    if (
      allCards.length !== 13 ||
      front.length !== 3 ||
      middle.length !== 5 ||
      back.length !== 5
    )
      return;
    const handSet = new Set(p.hand);
    if (!allCards.every((c) => handSet.has(c))) return;

    p.front = front;
    p.middle = middle;
    p.back = back;
    p.instantWin = this.checkInstantWin(p.hand, front, middle, back);
    p.isFouled =
      p.instantWin === InstantWin.NONE &&
      !this.isValidArrangement(front, middle, back);
    p.isReady = true;

    this.checkAllReady();
  }

  private handleAutoArrange(playerId: string) {
    if (this.state.gamePhase !== "arranging") return;
    const pIdx = this.state.players.findIndex((p) => p.id === playerId);
    if (pIdx === -1) return;
    const p = this.state.players[pIdx];
    if (p.isReady) return;

    // Countdown auto uses balanced strategy (safest)
    const arranged = this.autoArrange(p.hand);
    p.front = arranged.front;
    p.middle = arranged.middle;
    p.back = arranged.back;
    p.instantWin = this.checkInstantWin(p.hand, p.front, p.middle, p.back);
    p.isFouled = false;
    p.usedAuto = true;
    p.isReady = true;

    this.checkAllReady();
  }

  private handleDeclareInstantWin(playerId: string) {
    if (this.state.gamePhase !== "arranging") return;
    const pIdx = this.state.players.findIndex((p) => p.id === playerId);
    if (pIdx === -1) return;
    const p = this.state.players[pIdx];
    if (p.isReady) return;

    // Check for instant win with raw hand
    const instantWin = this.checkInstantWinRaw(p.hand);
    if (instantWin === InstantWin.NONE) return;

    // Auto-arrange for display and set instant win
    const arranged = this.autoArrange(p.hand);
    p.front = arranged.front;
    p.middle = arranged.middle;
    p.back = arranged.back;
    p.instantWin = instantWin;
    p.isFouled = false;
    p.isReady = true;

    this.checkAllReady();
  }

  private checkAllReady() {
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    const allReady = activePlayers.every((p) => p.isReady);
    if (allReady) {
      this.clearTimer();
      this.compareHands();
    }
  }

  // ===================== INSTANT WIN DETECTION =====================

  checkInstantWinRaw(hand: Card[]): InstantWin {
    if (hand.length !== 13) return InstantWin.NONE;

    // Dragon: 2->A not same suit
    if (this.isDragon(hand)) return InstantWin.DRAGON;

    // Same color 13
    if (this.isSameColor(hand, 13)) return InstantWin.SAME_COLOR_13;

    // Same color 12
    if (this.isSameColor(hand, 12)) return InstantWin.SAME_COLOR_12;

    // Six pairs
    if (this.isSixPairs(hand)) return InstantWin.SIX_PAIRS;

    return InstantWin.NONE;
  }

  checkInstantWin(
    hand: Card[],
    front: Card[],
    middle: Card[],
    back: Card[],
  ): InstantWin {
    // First check raw-hand instant wins
    const raw = this.checkInstantWinRaw(hand);
    if (raw !== InstantWin.NONE) return raw;

    // Check arrangement-based instant wins
    // 3 flushes/SF
    if (this.isThreeFlushes(front, middle, back))
      return InstantWin.THREE_FLUSHES;

    // 3 straights
    if (this.isThreeStraights(front, middle, back))
      return InstantWin.THREE_STRAIGHTS;

    return InstantWin.NONE;
  }

  private isDragon(hand: Card[]): boolean {
    const ranks = hand.map((c) => decodeCard(c).rank).sort((a, b) => a - b);
    // Must have 2,3,4,5,6,7,8,9,10,J,Q,K,A
    for (let i = 0; i < 13; i++) {
      if (ranks[i] !== i + 2) return false;
    }
    // Not all same suit
    const suits = new Set(hand.map((c) => decodeCard(c).suit));
    return suits.size > 1;
  }

  private isSameColor(hand: Card[], count: number): boolean {
    // Red = Diamond(2), Heart(3); Black = Spade(0), Club(1)
    let red = 0,
      black = 0;
    hand.forEach((c) => {
      const { suit } = decodeCard(c);
      if (suit === Suit.DIAMOND || suit === Suit.HEART) red++;
      else black++;
    });
    return red >= count || black >= count;
  }

  private isSixPairs(hand: Card[]): boolean {
    const rankCounts: Record<number, number> = {};
    hand.forEach((c) => {
      const { rank } = decodeCard(c);
      rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    });
    const counts = Object.values(rankCounts);
    const pairs = counts.filter((c) => c >= 2);
    const triples = counts.filter((c) => c >= 3);
    // 6 pairs + 1 singleton, or 5 pairs + 1 triple
    return pairs.length >= 6 || (pairs.length >= 5 && triples.length >= 1);
  }

  private isThreeFlushes(front: Card[], middle: Card[], back: Card[]): boolean {
    const isFlushLike = (cards: Card[]): boolean => {
      if (cards.length < 3) return false;
      const suits = new Set(cards.map((c) => decodeCard(c).suit));
      return suits.size === 1;
    };
    return isFlushLike(front) && isFlushLike(middle) && isFlushLike(back);
  }

  private isThreeStraights(
    front: Card[],
    middle: Card[],
    back: Card[],
  ): boolean {
    const isStraightLike = (cards: Card[]): boolean => {
      const ranks = cards.map((c) => decodeCard(c).rank).sort((a, b) => a - b);
      if (cards.length === 3) {
        // 3-card straight
        return ranks[2] - ranks[0] === 2 && new Set(ranks).size === 3;
      }
      // 5-card straight (check ace-low too)
      if (ranks[4] - ranks[0] === 4 && new Set(ranks).size === 5) return true;
      // Ace low: A 2 3 4 5
      if (
        ranks[0] === Rank.TWO &&
        ranks[1] === Rank.THREE &&
        ranks[2] === Rank.FOUR &&
        ranks[3] === Rank.FIVE &&
        ranks[4] === Rank.ACE
      )
        return true;
      return false;
    };
    return (
      isStraightLike(front) && isStraightLike(middle) && isStraightLike(back)
    );
  }

  // ===================== ARRANGEMENT VALIDATION =====================

  isValidArrangement(front: Card[], middle: Card[], back: Card[]): boolean {
    if (front.length !== 3 || middle.length !== 5 || back.length !== 5)
      return false;
    const frontVal = this.evaluate3CardHand(front).value;
    const middleVal = this.evaluate5CardHand(middle).value;
    const backVal = this.evaluate5CardHand(back).value;
    // Back >= Middle >= Front
    return backVal >= middleVal && middleVal >= frontVal;
  }

  // ===================== HAND EVALUATION =====================

  evaluate3CardHand(cards: Card[]): HandEval {
    const sorted = [...cards].sort(
      (a, b) => decodeCard(b).rank - decodeCard(a).rank,
    );
    const ranks = sorted.map((c) => decodeCard(c).rank);

    // Three of a kind
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
      return {
        rank: HandRank.THREE_OF_A_KIND,
        value: HandRank.THREE_OF_A_KIND * 1e8 + ranks[0] * 1e4,
        cards: sorted,
      };
    }

    // Pair
    if (ranks[0] === ranks[1]) {
      return {
        rank: HandRank.PAIR,
        value: HandRank.PAIR * 1e8 + ranks[0] * 1e4 + ranks[2],
        cards: sorted,
      };
    }
    if (ranks[1] === ranks[2]) {
      return {
        rank: HandRank.PAIR,
        value: HandRank.PAIR * 1e8 + ranks[1] * 1e4 + ranks[0],
        cards: [sorted[1], sorted[2], sorted[0]],
      };
    }

    // High card
    return {
      rank: HandRank.HIGH_CARD,
      value:
        HandRank.HIGH_CARD * 1e8 + ranks[0] * 1e4 + ranks[1] * 15 + ranks[2],
      cards: sorted,
    };
  }

  evaluate5CardHand(cards: Card[]): HandEval {
    const sorted = [...cards].sort(
      (a, b) => decodeCard(b).rank - decodeCard(a).rank,
    );
    const ranks = sorted.map((c) => decodeCard(c).rank);
    const suits = sorted.map((c) => decodeCard(c).suit);

    const isFlush = new Set(suits).size === 1;
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

    // Check straight
    let isStraight = false;
    let straightHigh = 0;
    if (uniqueRanks.length === 5) {
      if (uniqueRanks[0] - uniqueRanks[4] === 4) {
        isStraight = true;
        straightHigh = uniqueRanks[0];
      }
      // Ace low: A 5 4 3 2
      if (
        !isStraight &&
        uniqueRanks[0] === Rank.ACE &&
        uniqueRanks[1] === Rank.FIVE &&
        uniqueRanks[4] === Rank.TWO
      ) {
        isStraight = true;
        straightHigh = 5; // Low straight
      }
    }

    // Straight flush
    if (isFlush && isStraight) {
      return {
        rank: HandRank.STRAIGHT_FLUSH,
        value: HandRank.STRAIGHT_FLUSH * 1e8 + straightHigh * 1e4,
        cards: sorted,
      };
    }

    // Count ranks
    const rankCounts: Record<number, number> = {};
    ranks.forEach((r) => (rankCounts[r] = (rankCounts[r] || 0) + 1));
    const countEntries = Object.entries(rankCounts)
      .map(([r, c]) => ({ rank: Number(r), count: c }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);

    // Four of a kind
    if (countEntries[0].count === 4) {
      return {
        rank: HandRank.FOUR_OF_A_KIND,
        value:
          HandRank.FOUR_OF_A_KIND * 1e8 +
          countEntries[0].rank * 1e4 +
          countEntries[1].rank,
        cards: sorted,
      };
    }

    // Full house
    if (countEntries[0].count === 3 && countEntries[1].count === 2) {
      return {
        rank: HandRank.FULL_HOUSE,
        value:
          HandRank.FULL_HOUSE * 1e8 +
          countEntries[0].rank * 1e4 +
          countEntries[1].rank,
        cards: sorted,
      };
    }

    // Flush
    if (isFlush) {
      let val = HandRank.FLUSH * 1e8;
      uniqueRanks.forEach((r, i) => (val += r * Math.pow(15, 4 - i)));
      return { rank: HandRank.FLUSH, value: val, cards: sorted };
    }

    // Straight
    if (isStraight) {
      return {
        rank: HandRank.STRAIGHT,
        value: HandRank.STRAIGHT * 1e8 + straightHigh * 1e4,
        cards: sorted,
      };
    }

    // Three of a kind
    if (countEntries[0].count === 3) {
      let val = HandRank.THREE_OF_A_KIND * 1e8 + countEntries[0].rank * 1e4;
      const kickers = countEntries
        .filter((e) => e.count !== 3)
        .sort((a, b) => b.rank - a.rank);
      kickers.forEach((k, i) => (val += k.rank * Math.pow(15, 1 - i)));
      return {
        rank: HandRank.THREE_OF_A_KIND,
        value: val,
        cards: sorted,
      };
    }

    // Two pair
    if (countEntries[0].count === 2 && countEntries[1].count === 2) {
      const p1 = Math.max(countEntries[0].rank, countEntries[1].rank);
      const p2 = Math.min(countEntries[0].rank, countEntries[1].rank);
      const kicker = countEntries.find((e) => e.count === 1)!.rank;
      return {
        rank: HandRank.TWO_PAIR,
        value: HandRank.TWO_PAIR * 1e8 + p1 * 1e4 + p2 * 15 + kicker,
        cards: sorted,
      };
    }

    // One pair
    if (countEntries[0].count === 2) {
      let val = HandRank.PAIR * 1e8 + countEntries[0].rank * 1e4;
      const kickers = countEntries
        .filter((e) => e.count === 1)
        .sort((a, b) => b.rank - a.rank);
      kickers.forEach((k, i) => (val += k.rank * Math.pow(15, 2 - i)));
      return { rank: HandRank.PAIR, value: val, cards: sorted };
    }

    // High card
    let val = HandRank.HIGH_CARD * 1e8;
    uniqueRanks.forEach((r, i) => (val += r * Math.pow(15, 4 - i)));
    return {
      rank: HandRank.HIGH_CARD,
      value: val,
      cards: sorted,
    };
  }

  // ===================== COMPARISON & SCORING =====================

  private compareHands() {
    this.state.gamePhase = "comparing";
    const activePlayers = this.state.players
      .map((p, i) => ({ player: p, index: i }))
      .filter(({ player }) => player.id !== null);

    const results: RoundResult[] = [];

    for (let i = 0; i < activePlayers.length; i++) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        const p1 = activePlayers[i];
        const p2 = activePlayers[j];
        const result = this.compareTwoPlayers(
          p1.player,
          p1.index,
          p2.player,
          p2.index,
        );
        results.push(result);
      }
    }

    this.state.roundResults = results;

    // Compute scores
    for (const r of results) {
      this.state.players[r.p1Index].score += r.p1Total;
      this.state.players[r.p2Index].score += r.p2Total;
    }

    // Check "bắt sập làng" (scoop all) bonus
    for (const ap of activePlayers) {
      const myResults = results.filter(
        (r) => r.p1Index === ap.index || r.p2Index === ap.index,
      );
      const wonAll = myResults.every((r) => {
        if (r.p1Index === ap.index)
          return r.frontResult > 0 && r.middleResult > 0 && r.backResult > 0;
        return r.frontResult < 0 && r.middleResult < 0 && r.backResult < 0;
      });
      if (wonAll && myResults.length > 0 && activePlayers.length > 2) {
        // Bắt sập làng bonus
        const bonus = SpecialBonus.SCOOP_ALL;
        ap.player.score += bonus;
        // Others lose
        for (const other of activePlayers) {
          if (other.index !== ap.index) {
            this.state.players[other.index].score -= Math.floor(
              bonus / (activePlayers.length - 1),
            );
          }
        }
      }
    }

    // Manual bonus: +1 for non-auto winners
    for (const ap of activePlayers) {
      if (!ap.player.usedAuto && !ap.player.isBot && !ap.player.isFouled) {
        const myResults = results.filter(
          (r) => r.p1Index === ap.index || r.p2Index === ap.index,
        );
        const totalScore = myResults.reduce((sum, r) => {
          return sum + (r.p1Index === ap.index ? r.p1Total : r.p2Total);
        }, 0);
        if (totalScore > 0) {
          ap.player.score += 1; // Manual bonus
        }
      }
    }

    // Compute post-game analysis
    this.state.postGameAnalysis = this.computePostGameAnalysis(
      activePlayers.map((a) => a.player),
      activePlayers.map((a) => a.index),
    );

    this.state.gamePhase = "ended";
  }

  private compareTwoPlayers(
    p1: MauBinhPlayer,
    p1Index: number,
    p2: MauBinhPlayer,
    p2Index: number,
  ): RoundResult {
    const result: RoundResult = {
      p1Index,
      p2Index,
      frontResult: 0,
      middleResult: 0,
      backResult: 0,
      p1Bonus: 0,
      p2Bonus: 0,
      p1Total: 0,
      p2Total: 0,
    };

    // Handle instant wins
    if (
      p1.instantWin !== InstantWin.NONE &&
      p2.instantWin !== InstantWin.NONE
    ) {
      // Both instant win — compare by rank
      if (p1.instantWin > p2.instantWin) {
        result.frontResult = 1;
        result.middleResult = 1;
        result.backResult = 1;
      } else if (p1.instantWin < p2.instantWin) {
        result.frontResult = -1;
        result.middleResult = -1;
        result.backResult = -1;
      }
      // Same instant win type — compare tiebreakers
      // For simplicity, tie
    } else if (p1.instantWin !== InstantWin.NONE) {
      result.frontResult = 1;
      result.middleResult = 1;
      result.backResult = 1;
    } else if (p2.instantWin !== InstantWin.NONE) {
      result.frontResult = -1;
      result.middleResult = -1;
      result.backResult = -1;
    }
    // Handle fouled players
    else if (p1.isFouled && p2.isFouled) {
      // Both fouled — tie
    } else if (p1.isFouled) {
      result.frontResult = -1;
      result.middleResult = -1;
      result.backResult = -1;
    } else if (p2.isFouled) {
      result.frontResult = 1;
      result.middleResult = 1;
      result.backResult = 1;
    }
    // Normal comparison
    else {
      // Compare front (3-card)
      const f1 = this.evaluate3CardHand(p1.front);
      const f2 = this.evaluate3CardHand(p2.front);
      result.frontResult =
        f1.value > f2.value ? 1 : f1.value < f2.value ? -1 : 0;

      // Compare middle (5-card)
      const m1 = this.evaluate5CardHand(p1.middle);
      const m2 = this.evaluate5CardHand(p2.middle);
      result.middleResult =
        m1.value > m2.value ? 1 : m1.value < m2.value ? -1 : 0;

      // Compare back (5-card)
      const b1 = this.evaluate5CardHand(p1.back);
      const b2 = this.evaluate5CardHand(p2.back);
      result.backResult =
        b1.value > b2.value ? 1 : b1.value < b2.value ? -1 : 0;

      // Special bonuses for p1
      if (result.frontResult === 1) {
        if (f1.rank === HandRank.THREE_OF_A_KIND)
          result.p1Bonus += SpecialBonus.THREE_OF_KIND_FRONT;
      }
      if (result.middleResult === 1) {
        if (m1.rank === HandRank.FULL_HOUSE)
          result.p1Bonus += SpecialBonus.FULL_HOUSE_MIDDLE;
        if (m1.rank === HandRank.FOUR_OF_A_KIND)
          result.p1Bonus += SpecialBonus.FOUR_KIND_MIDDLE;
        if (m1.rank === HandRank.STRAIGHT_FLUSH)
          result.p1Bonus += SpecialBonus.STRAIGHT_FLUSH_MIDDLE;
      }
      if (result.backResult === 1) {
        if (b1.rank === HandRank.FOUR_OF_A_KIND)
          result.p1Bonus += SpecialBonus.FOUR_KIND_BACK;
        if (b1.rank === HandRank.STRAIGHT_FLUSH)
          result.p1Bonus += SpecialBonus.STRAIGHT_FLUSH_BACK;
      }

      // Special bonuses for p2
      if (result.frontResult === -1) {
        if (f2.rank === HandRank.THREE_OF_A_KIND)
          result.p2Bonus += SpecialBonus.THREE_OF_KIND_FRONT;
      }
      if (result.middleResult === -1) {
        if (m2.rank === HandRank.FULL_HOUSE)
          result.p2Bonus += SpecialBonus.FULL_HOUSE_MIDDLE;
        if (m2.rank === HandRank.FOUR_OF_A_KIND)
          result.p2Bonus += SpecialBonus.FOUR_KIND_MIDDLE;
        if (m2.rank === HandRank.STRAIGHT_FLUSH)
          result.p2Bonus += SpecialBonus.STRAIGHT_FLUSH_MIDDLE;
      }
      if (result.backResult === -1) {
        if (b2.rank === HandRank.FOUR_OF_A_KIND)
          result.p2Bonus += SpecialBonus.FOUR_KIND_BACK;
        if (b2.rank === HandRank.STRAIGHT_FLUSH)
          result.p2Bonus += SpecialBonus.STRAIGHT_FLUSH_BACK;
      }
    }

    // Calculate totals
    const p1Wins = [
      result.frontResult,
      result.middleResult,
      result.backResult,
    ].filter((r) => r > 0).length;
    const p2Wins = [
      result.frontResult,
      result.middleResult,
      result.backResult,
    ].filter((r) => r < 0).length;
    const base1 = result.frontResult + result.middleResult + result.backResult;

    // Scoop bonus (sập 3 chi)
    let scoopBonus1 = 0,
      scoopBonus2 = 0;
    if (p1Wins === 3) scoopBonus1 = SpecialBonus.SCOOP;
    if (p2Wins === 3) scoopBonus2 = SpecialBonus.SCOOP;

    result.p1Total =
      base1 + result.p1Bonus + scoopBonus1 - result.p2Bonus - scoopBonus2;
    result.p2Total =
      -base1 + result.p2Bonus + scoopBonus2 - result.p1Bonus - scoopBonus1;

    return result;
  }

  // ===================== AUTO ARRANGE (Multi-Strategy) =====================

  autoArrange(hand: Card[]): { front: Card[]; middle: Card[]; back: Card[] } {
    const suggestions = this.generateSuggestions(hand);
    // Pick balanced (first) strategy as default
    return {
      front: suggestions[0].front,
      middle: suggestions[0].middle,
      back: suggestions[0].back,
    };
  }

  generateSuggestions(hand: Card[]): ArrangementSuggestion[] {
    const results: ArrangementSuggestion[] = [];

    // Strategy 1: Balanced — spread strength evenly
    const balanced = this.arrangeBalanced(hand);
    if (balanced) {
      results.push(
        this.makeSuggestion(balanced, { en: "⚖️ Balanced", vi: "⚖️ Cân bằng" }),
      );
    }

    // Strategy 2: Back Heavy — maximize back hand
    const backHeavy = this.arrangeBackHeavy(hand);
    if (backHeavy) {
      results.push(
        this.makeSuggestion(backHeavy, {
          en: "💪 Strong Back",
          vi: "💪 Mạnh chi đầu",
        }),
      );
    }

    // Strategy 3: Front Heavy — try trips/pair in front for bonus
    const frontHeavy = this.arrangeFrontHeavy(hand);
    if (frontHeavy) {
      results.push(
        this.makeSuggestion(frontHeavy, {
          en: "🎯 Strong Front",
          vi: "🎯 Mạnh chi cuối",
        }),
      );
    }

    // Deduplicate and Filter invalid: remove strategies with identical hands or binh lủng
    const unique: ArrangementSuggestion[] = [];
    const seen = new Set<string>();
    for (const s of results) {
      if (!this.isValidArrangement(s.front, s.middle, s.back)) continue;
      const key = [...s.back, ...s.middle, ...s.front].join(",");
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }

    // Fallback if everything failed
    if (unique.length === 0) {
      const s = [...hand].sort(
        (a, b) => decodeCard(b).rank - decodeCard(a).rank,
      );
      unique.push(
        this.makeSuggestion(
          {
            back: s.slice(0, 5),
            middle: s.slice(5, 10),
            front: s.slice(10, 13),
          },
          { en: "📋 Default", vi: "📋 Mặc định" },
        ),
      );
    }

    return unique;
  }

  private makeSuggestion(
    arr: { front: Card[]; middle: Card[]; back: Card[] },
    label: { en: string; vi: string },
  ): ArrangementSuggestion {
    const fe = this.evaluate3CardHand(arr.front);
    const me = this.evaluate5CardHand(arr.middle);
    const be = this.evaluate5CardHand(arr.back);
    return {
      label,
      front: arr.front,
      middle: arr.middle,
      back: arr.back,
      frontRank: fe.rank,
      middleRank: me.rank,
      backRank: be.rank,
    };
  }

  // --- Strategy: Balanced ---
  private arrangeBalanced(
    hand: Card[],
  ): { front: Card[]; middle: Card[]; back: Card[] } | null {
    const sorted = [...hand].sort(
      (a, b) => decodeCard(b).rank - decodeCard(a).rank,
    );
    const groups = this.groupByRank(sorted);

    const back: Card[] = [];
    const middle: Card[] = [];
    const front: Card[] = [];
    const pool: Card[] = [];

    // Distribute pairs/trips/quads
    if (groups.quads.length > 0) {
      back.push(...groups.quads[0]);
      for (let i = 1; i < groups.quads.length; i++)
        pool.push(...groups.quads[i]);
    }
    if (groups.trips.length > 0) {
      if (back.length === 0) {
        back.push(...groups.trips[0]);
      } else {
        middle.push(...groups.trips[0]);
      }
      for (let i = 1; i < groups.trips.length; i++)
        pool.push(...groups.trips[i]);
    }
    // Distribute pairs: first to back (full house), second to middle, third to front
    for (let i = 0; i < groups.pairs.length; i++) {
      if (back.length < 5 && back.length >= 3) {
        back.push(...groups.pairs[i]);
      } else if (middle.length < 5) {
        middle.push(...groups.pairs[i]);
      } else if (front.length < 3) {
        front.push(...groups.pairs[i]);
      } else {
        pool.push(...groups.pairs[i]);
      }
    }
    pool.push(...groups.singles);
    pool.sort((a, b) => decodeCard(b).rank - decodeCard(a).rank);

    // Try to find flushes/straights in pool + middle/back
    this.tryUpgrade5(back, pool);
    this.tryUpgrade5(middle, pool);

    // Fill remaining
    while (back.length < 5 && pool.length > 0) back.push(pool.shift()!);
    while (middle.length < 5 && pool.length > 0) middle.push(pool.shift()!);
    while (front.length < 3 && pool.length > 0) front.push(pool.shift()!);

    this.sortHand(back);
    this.sortHand(middle);
    this.sortHand(front);

    // Validate
    if (this.isValidArrangement(front, middle, back))
      return { front, middle, back };
    // Fix: swap if invalid
    return this.fixArrangement(hand);
  }

  // --- Strategy: Back Heavy ---
  private arrangeBackHeavy(
    hand: Card[],
  ): { front: Card[]; middle: Card[]; back: Card[] } | null {
    const sorted = [...hand].sort(
      (a, b) => decodeCard(b).rank - decodeCard(a).rank,
    );

    // Try flush in back
    const flush = this.findFlush(sorted, 5);
    if (flush) {
      const rest = sorted.filter((c) => !flush.includes(c));
      const mid = rest.slice(0, 5);
      const fro = rest.slice(5, 8);
      this.sortHand(flush);
      this.sortHand(mid);
      this.sortHand(fro);
      if (this.isValidArrangement(fro, mid, flush))
        return { front: fro, middle: mid, back: flush };
    }

    // Try straight in back
    const straight = this.findStraight(sorted, 5);
    if (straight) {
      const rest = sorted.filter((c) => !straight.includes(c));
      const mid = rest.slice(0, 5);
      const fro = rest.slice(5, 8);
      this.sortHand(straight);
      this.sortHand(mid);
      this.sortHand(fro);
      if (this.isValidArrangement(fro, mid, straight))
        return { front: fro, middle: mid, back: straight };
    }

    // Fallback: put 5 strongest in back
    const groups = this.groupByRank(sorted);
    const back: Card[] = [];
    const pool: Card[] = [];

    // Put strongest groups in back
    for (const q of groups.quads) {
      back.push(...q);
    }
    for (const t of groups.trips) {
      if (back.length < 5) back.push(...t);
      else pool.push(...t);
    }
    for (const p of groups.pairs) {
      if (back.length < 5) back.push(...p);
      else pool.push(...p);
    }
    pool.push(...groups.singles);
    pool.sort((a, b) => decodeCard(b).rank - decodeCard(a).rank);
    while (back.length < 5 && pool.length > 0) back.push(pool.shift()!);
    while (back.length > 5) pool.unshift(back.pop()!);

    const middle = pool.splice(0, 5);
    const front = pool.splice(0, 3);
    this.sortHand(back);
    this.sortHand(middle);
    this.sortHand(front);

    if (this.isValidArrangement(front, middle, back))
      return { front, middle, back };
    return this.fixArrangement(hand);
  }

  // --- Strategy: Front Heavy ---
  private arrangeFrontHeavy(
    hand: Card[],
  ): { front: Card[]; middle: Card[]; back: Card[] } | null {
    const sorted = [...hand].sort(
      (a, b) => decodeCard(b).rank - decodeCard(a).rank,
    );
    const groups = this.groupByRank(sorted);

    const front: Card[] = [];
    const pool: Card[] = [];

    // Try to put trips in front
    if (groups.trips.length >= 2) {
      front.push(...groups.trips[groups.trips.length - 1]); // weakest trips in front
      for (let i = 0; i < groups.trips.length - 1; i++)
        pool.push(...groups.trips[i]);
    } else if (groups.pairs.length >= 3) {
      // Put a pair in front
      front.push(...groups.pairs[groups.pairs.length - 1]);
      for (let i = 0; i < groups.pairs.length - 1; i++)
        pool.push(...groups.pairs[i]);
      for (const t of groups.trips) pool.push(...t);
    } else {
      // Not enough to make front strong, fallback
      return null;
    }

    for (const q of groups.quads) pool.push(...q);
    pool.push(...groups.singles);
    pool.sort((a, b) => decodeCard(b).rank - decodeCard(a).rank);

    while (front.length < 3 && pool.length > 0) front.push(pool.shift()!);
    // Construct back and middle from remaining
    const back = pool.splice(0, 5);
    const middle = pool.splice(0, 5);

    this.sortHand(back);
    this.sortHand(middle);
    this.sortHand(front);

    if (this.isValidArrangement(front, middle, back))
      return { front, middle, back };
    return null; // Can't make valid front-heavy
  }

  // --- Helpers for multi-strategy ---
  private groupByRank(sorted: Card[]) {
    const rankGroups: Record<number, Card[]> = {};
    sorted.forEach((c) => {
      const { rank } = decodeCard(c);
      if (!rankGroups[rank]) rankGroups[rank] = [];
      rankGroups[rank].push(c);
    });

    const quads: Card[][] = [];
    const trips: Card[][] = [];
    const pairs: Card[][] = [];
    const singles: Card[] = [];

    Object.entries(rankGroups)
      .sort(([a], [b]) => Number(b) - Number(a))
      .forEach(([, cards]) => {
        if (cards.length === 4) quads.push(cards);
        else if (cards.length === 3) trips.push(cards);
        else if (cards.length === 2) pairs.push(cards);
        else singles.push(...cards);
      });

    return { quads, trips, pairs, singles };
  }

  private findFlush(cards: Card[], count: number): Card[] | null {
    const bySuit: Record<number, Card[]> = {};
    cards.forEach((c) => {
      const { suit } = decodeCard(c);
      if (!bySuit[suit]) bySuit[suit] = [];
      bySuit[suit].push(c);
    });
    for (const suited of Object.values(bySuit)) {
      if (suited.length >= count) {
        return suited.slice(0, count);
      }
    }
    return null;
  }

  private findStraight(cards: Card[], count: number): Card[] | null {
    const uniqueByRank = new Map<number, Card>();
    cards.forEach((c) => {
      const { rank } = decodeCard(c);
      if (!uniqueByRank.has(rank)) uniqueByRank.set(rank, c);
    });
    const ranks = [...uniqueByRank.keys()].sort((a, b) => b - a);

    for (let i = 0; i <= ranks.length - count; i++) {
      if (ranks[i] - ranks[i + count - 1] === count - 1) {
        return ranks.slice(i, i + count).map((r) => uniqueByRank.get(r)!);
      }
    }
    // Ace-low: A-2-3-4-5
    if (
      count === 5 &&
      uniqueByRank.has(Rank.ACE) &&
      uniqueByRank.has(Rank.TWO) &&
      uniqueByRank.has(Rank.THREE) &&
      uniqueByRank.has(Rank.FOUR) &&
      uniqueByRank.has(Rank.FIVE)
    ) {
      return [Rank.ACE, Rank.FIVE, Rank.FOUR, Rank.THREE, Rank.TWO].map(
        (r) => uniqueByRank.get(r)!,
      );
    }
    return null;
  }

  private tryUpgrade5(hand: Card[], pool: Card[]) {
    // If hand already has 5 cards, try swapping to get flush or straight
    if (hand.length !== 5) return;
    const all = [...hand, ...pool];
    const flush = this.findFlush(all, 5);
    if (flush) {
      const used = new Set(flush);
      const newPool = all.filter((c) => !used.has(c));
      hand.length = 0;
      hand.push(...flush);
      pool.length = 0;
      pool.push(...newPool);
      return;
    }
  }

  private fixArrangement(hand: Card[]): {
    front: Card[];
    middle: Card[];
    back: Card[];
  } {
    // Safe fallback: sort by rank descending and split
    const s = [...hand].sort((a, b) => decodeCard(b).rank - decodeCard(a).rank);
    return {
      back: s.slice(0, 5),
      middle: s.slice(5, 10),
      front: s.slice(10, 13),
    };
  }

  private sortHand(cards: Card[]) {
    cards.sort((a, b) => decodeCard(b).rank - decodeCard(a).rank);
  }

  // ===================== POST-GAME ANALYSIS =====================

  private computePostGameAnalysis(
    players: MauBinhPlayer[],
    indices: number[],
  ): PostGameAnalysis[] {
    const analysis: PostGameAnalysis[] = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.isBot || !p.id || p.hand.length === 0) continue;

      // If player already has Instant Win, there's no "improvement" needed in terms of normal hands
      if (p.instantWin !== InstantWin.NONE) continue;

      const suggestions = this.generateSuggestions(p.hand);

      // Check if any suggestion could have been an Instant Win that the player missed
      const missedInstantWin = suggestions.find(
        (s) =>
          this.checkInstantWin(p.hand, s.front, s.middle, s.back) !==
          InstantWin.NONE,
      );

      // Find the "optimal" = arrangement with highest total evaluation
      let bestSuggestion = suggestions[0];
      let bestScore = -Infinity;

      if (missedInstantWin) {
        bestSuggestion = missedInstantWin;
        // Give Instant Win a very high score to ensure it's picked as optimal
        bestScore = 1e12;
      } else {
        for (const s of suggestions) {
          const bv = this.evaluate5CardHand(s.back).value;
          const mv = this.evaluate5CardHand(s.middle).value;
          const fv = this.evaluate3CardHand(s.front).value;
          const score = bv + mv + fv;
          if (score > bestScore) {
            bestScore = score;
            bestSuggestion = s;
          }
        }
      }

      const actualFe = this.evaluate3CardHand(p.front);
      const actualMe = this.evaluate5CardHand(p.middle);
      const actualBe = this.evaluate5CardHand(p.back);
      const actualScore = actualFe.value + actualMe.value + actualBe.value;

      // Only include if optimal is different from actual
      const optFe = this.evaluate3CardHand(bestSuggestion.front);
      const optMe = this.evaluate5CardHand(bestSuggestion.middle);
      const optBe = this.evaluate5CardHand(bestSuggestion.back);

      // If missed instant win, it's a huge difference (1e12 vs normal score)
      if (Math.abs(bestScore - actualScore) > 1e4) {
        analysis.push({
          playerIndex: indices[i],
          actual: { front: p.front, middle: p.middle, back: p.back },
          optimal: {
            front: bestSuggestion.front,
            middle: bestSuggestion.middle,
            back: bestSuggestion.back,
          },
          // Cap score at optimal for normal UI display
          actualScore: Math.round(actualScore / 1e4),
          optimalScore: Math.round(Math.min(bestScore, 1e7) / 1e4), // Don't show 1e12 in UI
          actualFrontRank: actualFe.rank,
          actualMiddleRank: actualMe.rank,
          actualBackRank: actualBe.rank,
          optimalFrontRank: optFe.rank,
          optimalMiddleRank: optMe.rank,
          optimalBackRank: optBe.rank,
        });
      }
    }
    return analysis;
  }

  // ===================== DECK HELPERS =====================

  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of [Suit.SPADE, Suit.CLUB, Suit.DIAMOND, Suit.HEART]) {
      for (let rank = Rank.TWO; rank <= Rank.ACE; rank++) {
        deck.push(encodeCard(rank as any, suit as any));
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

  // ===================== SLOT MANAGEMENT =====================

  private addBot(slotIndex: number) {
    const player = this.state.players[slotIndex];
    if (player.id !== null) return;
    player.id = `BOT_${Date.now()}_${slotIndex}`;
    player.username = `Bot ${slotIndex + 1}`;
    player.isBot = true;
  }

  private resetGame() {
    this.clearTimer();
    this.state.gamePhase = "waiting";
    this.state.roundResults = [];
    this.state.postGameAnalysis = [];
    this.state.timerEndsAt = 0;

    this.state.players.forEach((p) => {
      p.hand = [];
      p.front = [];
      p.middle = [];
      p.back = [];
      p.isReady = false;
      p.isFouled = false;
      p.instantWin = InstantWin.NONE;
      p.usedAuto = false;
      if (p.id !== null) p.score = 0;
    });
  }

  private joinSlot(slotIndex: number, playerId: string, playerName: string) {
    if (this.state.players[slotIndex].id !== null) return;
    const existing = this.state.players.findIndex((p) => p.id === playerId);
    if (existing !== -1) this.removePlayer(existing);

    const player = this.state.players[slotIndex];
    player.id = playerId;
    player.username = playerName;
    player.isBot = false;
  }

  private removePlayer(slotIndex: number) {
    const p = this.state.players[slotIndex];
    Object.assign(p, this.createEmptyPlayer(slotIndex));
  }

  // ===================== PUBLIC REQUESTS =====================

  requestStartGame() {
    this.makeAction({ type: "START_GAME" });
  }
  requestResetGame() {
    this.makeAction({ type: "RESET_GAME" });
  }
  requestAddBot(slotIndex: number) {
    this.makeAction({ type: "ADD_BOT", slotIndex });
  }
  requestRemovePlayer(slotIndex: number) {
    this.makeAction({ type: "REMOVE_PLAYER", slotIndex });
  }

  requestJoinSlot(slotIndex: number, playerName: string) {
    this.makeAction({
      type: "JOIN_SLOT",
      slotIndex,
      playerId: this.userId,
      playerName,
    });
  }

  requestArrangeCards(front: Card[], middle: Card[], back: Card[]) {
    this.makeAction({
      type: "ARRANGE_CARDS",
      playerId: this.userId,
      front,
      middle,
      back,
    });
  }

  requestAutoArrange() {
    this.makeAction({ type: "AUTO_ARRANGE", playerId: this.userId });
  }

  requestDeclareInstantWin() {
    this.makeAction({ type: "DECLARE_INSTANT_WIN", playerId: this.userId });
  }

  // ===================== CLEANUP =====================

  destroy() {
    this.clearTimer();
    super.destroy();
  }
}
