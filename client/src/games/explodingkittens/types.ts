export const PENDING_ACTION_TIMEOUT = 30000;

export const EKCardType = {
  EXPLODING_KITTEN: 0,
  DEFUSE: 1,
  ATTACK: 2,
  SKIP: 3,
  FAVOR: 4,
  SHUFFLE: 5,
  SEE_THE_FUTURE: 6,
  NOPE: 7,
  CAT_1: 8,
  CAT_2: 9,
  CAT_3: 10,
  CAT_4: 11,
  CAT_5: 12,
  // Expansion cards
  REVERSE: 13,
  TARGETED_ATTACK: 14,
  ALTER_THE_FUTURE_3: 15,
  ALTER_THE_FUTURE_5: 16,
} as const;
export type EKCardType = (typeof EKCardType)[keyof typeof EKCardType];

export type EKCard = [EKCardType, number]; // [type, unique_id]

export interface EKDiscardEntry {
  playerId: string;
  cards: EKCard[];
  timestamp: number;
  targetPlayerId?: string;
  nopeChain?: { playerId: string; cardType: EKCardType }[];
  isNoped?: boolean;
}

export const EKGamePhase = {
  WAITING: 0,
  PLAYING: 1,
  DEFUSING: 2,
  INSERTING_KITTEN: 3,
  FAVOR_SELECTING: 4,
  FAVOR_GIVING: 5,
  COMBO_SELECTING: 6, // For 3-card combos
  NOPE_WINDOW: 7,
  ALTER_THE_FUTURE: 8, // For reordering cards
  ENDED: 9,
} as const;
export type EKGamePhase = (typeof EKGamePhase)[keyof typeof EKGamePhase];

export interface PlayerSlot {
  id: string | null;
  username: string;
  hand: EKCard[];
  isExploded: boolean;
  isBot: boolean;
  isHost: boolean;
}

export interface EKState {
  players: PlayerSlot[];
  drawPile: EKCard[];
  discardPile: EKCard[];
  discardHistory: EKDiscardEntry[];
  currentTurnIndex: number;
  attackStack: number; // number of turns remaining
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  gamePhase: EKGamePhase;
  winner: string | null;

  // Alter the Future data
  alterCards: EKCard[] | null; // Cards being reordered
  alterCount: number; // 3 or 5 based on card played

  // Favor data
  favorFrom: string | null; // target player
  favorTo: string | null; // requester

  // Combo data
  comboFrom: string | null; // victim
  comboTo: string | null; // requester
  comboCount: number; // 2 or 3

  // Nope logic
  lastAction: {
    action: EKAction;
    playerId: string;
    timestamp: number;
    isNoped: boolean;
    cardType?: EKCardType; // Optional: specific card type if it was a card play
  } | null;

  newGameRequest: { fromId: string; fromName: string } | null;
  pendingAction: {
    action: EKAction;
    playerId: string;
    timerStart: number;
    nopeCount: number;
    responses: Record<string, "NOPE" | "ALLOW">;
    nopeChain: { playerId: string; cardType: EKCardType }[];
    entryTimestamp?: number; // Timestamp of the original discard history entry
  } | null;
}

export type EKAction =
  | { type: "START_GAME" }
  | { type: "DRAW_CARD"; playerId: string }
  | {
      type: "PLAY_CARD";
      playerId: string;
      cardIndex: number;
      targetPlayerId?: string;
    }
  | {
      type: "PLAY_COMBO";
      playerId: string;
      cardIndices: number[];
      targetPlayerId: string;
      requestedCardType?: EKCardType;
    }
  | { type: "DEFUSE"; playerId: string }
  | { type: "INSERT_KITTEN"; playerId: string; index: number }
  | { type: "GIVE_FAVOR"; playerId: string; cardIndex: number }
  | { type: "ADD_BOT"; slotIndex: number }
  | {
      type: "JOIN_SLOT";
      slotIndex: number;
      playerId: string;
      playerName: string;
    }
  | { type: "REMOVE_PLAYER"; slotIndex: number }
  | { type: "NEW_GAME" }
  | { type: "REQUEST_NEW_GAME"; playerId: string; playerName: string }
  | { type: "ACCEPT_NEW_GAME" }
  | { type: "DECLINE_NEW_GAME" }
  | { type: "RESPOND_NOPE"; playerId: string; response: "NOPE" | "ALLOW" }
  | { type: "REORDER_FUTURE"; playerId: string; newOrder: number[] }; // indices of alterCards in new order
