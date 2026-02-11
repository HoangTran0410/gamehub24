// Reuse card primitives from poker
export {
  Suit,
  Rank,
  encodeCard,
  decodeCard,
  SUIT_SYMBOLS,
  RANK_DISPLAY,
} from "../poker/types";
export type { Suit as SuitType, Rank as RankType } from "../poker/types";

export type Card = number;

// Hand rankings (same as poker but used independently per chi)
export const HandRank = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
} as const;
export type HandRank = (typeof HandRank)[keyof typeof HandRank];

export const HAND_RANK_NAMES: Record<HandRank, { en: string; vi: string }> = {
  [HandRank.HIGH_CARD]: { en: "High Card", vi: "Mậu Thầu" },
  [HandRank.PAIR]: { en: "Pair", vi: "Đôi" },
  [HandRank.TWO_PAIR]: { en: "Two Pair", vi: "Thú" },
  [HandRank.THREE_OF_A_KIND]: { en: "Three of a Kind", vi: "Sám Cô" },
  [HandRank.STRAIGHT]: { en: "Straight", vi: "Sảnh" },
  [HandRank.FLUSH]: { en: "Flush", vi: "Thùng" },
  [HandRank.FULL_HOUSE]: { en: "Full House", vi: "Cù Lũ" },
  [HandRank.FOUR_OF_A_KIND]: { en: "Four of a Kind", vi: "Tứ Quý" },
  [HandRank.STRAIGHT_FLUSH]: { en: "Straight Flush", vi: "Thùng Phá Sảnh" },
};
export const HAND_RANK_DESC: Record<HandRank, { en: string; vi: string }> = {
  [HandRank.HIGH_CARD]: { en: "Highest card plays", vi: "Lá bài cao nhất" },
  [HandRank.PAIR]: { en: "2 cards of same rank", vi: "2 lá giống nhau" },
  [HandRank.TWO_PAIR]: { en: "2 different pairs", vi: "2 đôi khác nhau" },
  [HandRank.THREE_OF_A_KIND]: {
    en: "3 cards of same rank",
    vi: "3 lá giống nhau",
  },
  [HandRank.STRAIGHT]: { en: "5 consecutive cards", vi: "5 lá liên tiếp" },
  [HandRank.FLUSH]: { en: "5 cards same suit", vi: "5 lá cùng chất" },
  [HandRank.FULL_HOUSE]: {
    en: "3 matching + 2 matching",
    vi: "1 bộ ba + 1 bộ đôi",
  },
  [HandRank.FOUR_OF_A_KIND]: {
    en: "4 cards of same rank",
    vi: "4 lá giống nhau",
  },
  [HandRank.STRAIGHT_FLUSH]: {
    en: "5 consecutive cards same suit",
    vi: "5 lá liên tiếp đồng chất",
  },
};

// Instant-win types (Mậu binh tới trắng)
export const InstantWin = {
  NONE: 0,
  THREE_STRAIGHTS: 1, // 3 sảnh
  THREE_FLUSHES: 2, // 3 thùng
  SIX_PAIRS: 3, // Lục phế bôn
  SAME_COLOR_12: 4, // Đồng màu 2 (12 cards)
  SAME_COLOR_13: 5, // Đồng màu 1 (13 cards)
  DRAGON: 6, // Sảnh rồng (2->A)
} as const;
export type InstantWin = (typeof InstantWin)[keyof typeof InstantWin];

export const INSTANT_WIN_NAMES: Record<InstantWin, { en: string; vi: string }> =
  {
    [InstantWin.NONE]: { en: "None", vi: "Không" },
    [InstantWin.THREE_STRAIGHTS]: { en: "3 Straights", vi: "3 Sảnh" },
    [InstantWin.THREE_FLUSHES]: { en: "3 Flushes", vi: "3 Thùng" },
    [InstantWin.SIX_PAIRS]: { en: "Six Pairs", vi: "Lục Phế Bôn" },
    [InstantWin.SAME_COLOR_12]: { en: "12 Same Color", vi: "Đồng Màu 12" },
    [InstantWin.SAME_COLOR_13]: { en: "13 Same Color", vi: "Đồng Màu 13" },
    [InstantWin.DRAGON]: { en: "Dragon Straight", vi: "Sảnh Rồng" },
  };

export const INSTANT_WIN_DESC: Record<InstantWin, { en: string; vi: string }> =
  {
    [InstantWin.NONE]: { en: "None", vi: "Không có" },
    [InstantWin.THREE_STRAIGHTS]: {
      en: "All 3 hands are straights",
      vi: "3 chi đều là sảnh",
    },
    [InstantWin.THREE_FLUSHES]: {
      en: "All 3 hands are flushes",
      vi: "3 chi đều là thùng",
    },
    [InstantWin.SIX_PAIRS]: {
      en: "6 pairs (or 5 pairs + triple)",
      vi: "6 đôi (hoặc 5 đôi + sám)",
    },
    [InstantWin.SAME_COLOR_12]: {
      en: "12 of 13 same color",
      vi: "12 lá đồng màu",
    },
    [InstantWin.SAME_COLOR_13]: {
      en: "All 13 same color",
      vi: "13 lá đồng màu",
    },
    [InstantWin.DRAGON]: { en: "13 cards 2→A", vi: "13 lá từ 2→A" },
  };

// Special comparison bonuses
export const SpecialBonus = {
  THREE_OF_KIND_FRONT: 3, // Sám chi cuối (3-card hand)
  FULL_HOUSE_MIDDLE: 2, // Cù lũ chi giữa
  FOUR_KIND_BACK: 4, // Tứ quý chi đầu
  FOUR_KIND_MIDDLE: 8, // Tứ quý chi giữa
  STRAIGHT_FLUSH_BACK: 5, // Thùng phá sảnh chi đầu
  STRAIGHT_FLUSH_MIDDLE: 10, // Thùng phá sảnh chi giữa
  SCOOP: 3, // Sập 3 chi bonus (on top of 3 wins)
  SCOOP_ALL: 6, // Bắt sập làng (extra on top)
} as const;

export type SpecialBonusKey = keyof typeof SpecialBonus;

export const SPECIAL_BONUS_NAMES: Record<
  SpecialBonusKey,
  { en: string; vi: string }
> = {
  THREE_OF_KIND_FRONT: { en: "Three of a Kind in front", vi: "Sám chi cuối" },
  FULL_HOUSE_MIDDLE: { en: "Full House in middle", vi: "Cù lũ chi giữa" },
  FOUR_KIND_BACK: { en: "Four of a Kind in back", vi: "Tứ quý chi đầu" },
  FOUR_KIND_MIDDLE: { en: "Four of a Kind in middle", vi: "Tứ quý chi giữa" },
  STRAIGHT_FLUSH_BACK: {
    en: "Straight Flush in back",
    vi: "Thùng phá sảnh chi đầu",
  },
  STRAIGHT_FLUSH_MIDDLE: {
    en: "Straight Flush in middle",
    vi: "Thùng phá sảnh chi giữa",
  },
  SCOOP: { en: "Scoop (win all 3)", vi: "Sập 3 chi" },
  SCOOP_ALL: { en: "Scoop All (Whole table)", vi: "Bắt sập làng" },
};

export interface HandEval {
  rank: HandRank;
  value: number; // Numerical value for comparison
  cards: Card[];
}

export interface ArrangementSuggestion {
  label: { en: string; vi: string };
  front: Card[];
  middle: Card[];
  back: Card[];
  frontRank: HandRank;
  middleRank: HandRank;
  backRank: HandRank;
}

export interface PostGameAnalysis {
  playerIndex: number;
  actual: { front: Card[]; middle: Card[]; back: Card[] };
  optimal: { front: Card[]; middle: Card[]; back: Card[] };
  actualScore: number;
  optimalScore: number;
  actualFrontRank: HandRank;
  actualMiddleRank: HandRank;
  actualBackRank: HandRank;
  optimalFrontRank: HandRank;
  optimalMiddleRank: HandRank;
  optimalBackRank: HandRank;
}

export interface MauBinhPlayer {
  id: string | null;
  username: string;
  hand: Card[]; // 13 unsorted cards
  front: Card[]; // 3 cards (chi cuối - weakest)
  middle: Card[]; // 5 cards (chi giữa)
  back: Card[]; // 5 cards (chi đầu - strongest)
  isBot: boolean;
  isReady: boolean; // Has submitted arrangement
  score: number; // Running score
  isFouled: boolean; // Binh lủng
  instantWin: InstantWin;
  usedAuto: boolean; // Whether player used suggestion system
}

export type GamePhase = "waiting" | "arranging" | "comparing" | "ended";

export const GAME_PHASE_NAMES: Record<GamePhase, { en: string; vi: string }> = {
  waiting: { en: "Waiting", vi: "Đang chờ" },
  arranging: { en: "Arranging", vi: "Xếp bài" },
  comparing: { en: "Comparing", vi: "So bài" },
  ended: { en: "Ended", vi: "Kết thúc" },
};

export interface RoundResult {
  p1Index: number;
  p2Index: number;
  // +1 = p1 wins, -1 = p2 wins, 0 = tie
  frontResult: number;
  middleResult: number;
  backResult: number;
  p1Bonus: number;
  p2Bonus: number;
  p1Total: number;
  p2Total: number;
}

export interface MauBinhState {
  players: MauBinhPlayer[];
  gamePhase: GamePhase;
  timerEndsAt: number; // Timestamp when arranging phase ends
  roundResults: RoundResult[];
  roundNumber: number;
  postGameAnalysis: PostGameAnalysis[];
}

// Actions
export interface StartGameAction {
  type: "START_GAME";
}
export interface ArrangeCardsAction {
  type: "ARRANGE_CARDS";
  playerId: string;
  front: Card[];
  middle: Card[];
  back: Card[];
}
export interface AutoArrangeAction {
  type: "AUTO_ARRANGE";
  playerId: string;
}
export interface DeclareInstantWinAction {
  type: "DECLARE_INSTANT_WIN";
  playerId: string;
}
export interface AddBotAction {
  type: "ADD_BOT";
  slotIndex: number;
}
export interface ResetGameAction {
  type: "RESET_GAME";
}
export interface JoinSlotAction {
  type: "JOIN_SLOT";
  slotIndex: number;
  playerId: string;
  playerName: string;
}
export interface RemovePlayerAction {
  type: "REMOVE_PLAYER";
  slotIndex: number;
}

export type MauBinhAction =
  | StartGameAction
  | ArrangeCardsAction
  | AutoArrangeAction
  | DeclareInstantWinAction
  | AddBotAction
  | ResetGameAction
  | JoinSlotAction
  | RemovePlayerAction;
