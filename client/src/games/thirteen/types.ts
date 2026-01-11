// Card Suits - ranked from lowest to highest
export const Suit = {
  SPADE: 0, // ♠ - Bích (lowest)
  CLUB: 1, // ♣ - Tép
  DIAMOND: 2, // ♦ - Rô
  HEART: 3, // ♥ - Cơ (highest)
} as const;
export type Suit = (typeof Suit)[keyof typeof Suit];

// Card Ranks - 3 is lowest, 2 is highest
export const Rank = {
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
  JACK: 11,
  QUEEN: 12,
  KING: 13,
  ACE: 14,
  TWO: 15, // Highest rank
} as const;
export type Rank = (typeof Rank)[keyof typeof Rank];

export interface Card {
  suit: Suit;
  rank: Rank;
}

// Combination types for playing cards
export const CombinationType = {
  SINGLE: "single",
  PAIR: "pair",
  TRIPLE: "triple",
  STRAIGHT: "straight", // 3+ consecutive cards
  FOUR_OF_KIND: "four_of_kind",
  THREE_CONSECUTIVE_PAIRS: "three_consecutive_pairs", // Sám cô: 334455, 778899, etc.
} as const;
export type CombinationType =
  (typeof CombinationType)[keyof typeof CombinationType];

export interface Combination {
  type: CombinationType;
  cards: Card[];
  // For comparison - higher value beats lower
  value: number;
}

// Player slot in the game
export interface PlayerSlot {
  id: string | null; // null if empty
  username: string;
  hand: Card[];
  isBot: boolean;
  isGuest: boolean;
  isHost: boolean;
  passed: boolean; // Has passed in current trick
}

export type GamePhase = "waiting" | "playing" | "ended";

export interface NewGameRequest {
  fromId: string;
  fromName: string;
}

// Main game state
export interface ThirteenState {
  players: PlayerSlot[]; // Always 4 slots
  currentTrick: { playerId: string; cards: Card[] }[]; // Cards played in current trick
  currentTurnIndex: number; // 0-3, whose turn
  lastPlayedBy: string | null; // Who made the last valid play
  lastCombination: Combination | null; // Last played combination for comparison
  winner: string | null; // Winner's player ID
  gamePhase: GamePhase;
  newGameRequest: NewGameRequest | null; // Pending new game request from guest
}

// Actions
export interface PlayCardsAction {
  type: "PLAY_CARDS";
  playerId: string;
  cards: Card[];
}

export interface PassAction {
  type: "PASS";
  playerId: string;
}

export interface AddBotAction {
  type: "ADD_BOT";
  slotIndex: number;
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

export interface StartGameAction {
  type: "START_GAME";
}

export interface NewGameAction {
  type: "NEW_GAME";
}

export interface RequestNewGameAction {
  type: "REQUEST_NEW_GAME";
  playerId: string;
  playerName: string;
}

export interface AcceptNewGameAction {
  type: "ACCEPT_NEW_GAME";
}

export interface DeclineNewGameAction {
  type: "DECLINE_NEW_GAME";
}

export type ThirteenAction =
  | PlayCardsAction
  | PassAction
  | AddBotAction
  | JoinSlotAction
  | RemovePlayerAction
  | StartGameAction
  | NewGameAction
  | RequestNewGameAction
  | AcceptNewGameAction
  | DeclineNewGameAction;

// Helper type for card display
export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.SPADE]: "♠",
  [Suit.CLUB]: "♣",
  [Suit.DIAMOND]: "♦",
  [Suit.HEART]: "♥",
};

export const RANK_DISPLAY: Record<Rank, string> = {
  [Rank.THREE]: "3",
  [Rank.FOUR]: "4",
  [Rank.FIVE]: "5",
  [Rank.SIX]: "6",
  [Rank.SEVEN]: "7",
  [Rank.EIGHT]: "8",
  [Rank.NINE]: "9",
  [Rank.TEN]: "10",
  [Rank.JACK]: "J",
  [Rank.QUEEN]: "Q",
  [Rank.KING]: "K",
  [Rank.ACE]: "A",
  [Rank.TWO]: "2",
};
