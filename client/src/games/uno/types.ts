// UNO Card Colors
export const CardColor = {
  RED: 0,
  BLUE: 1,
  GREEN: 2,
  YELLOW: 3,
  WILD: 4, // For Wild cards before color is chosen
} as const;
export type CardColor = (typeof CardColor)[keyof typeof CardColor];

// UNO Card Types
export const CardType = {
  NUMBER: "number",
  SKIP: "skip",
  REVERSE: "reverse",
  DRAW_TWO: "draw_two",
  WILD: "wild",
  WILD_DRAW_FOUR: "wild_draw_four",
} as const;
export type CardType = (typeof CardType)[keyof typeof CardType];

export interface UnoCard {
  id: string; // Unique identifier for each card
  color: CardColor;
  type: CardType;
  value?: number; // 0-9 for number cards
}

// Player slot in the game
export interface PlayerSlot {
  id: string | null;
  username: string;
  hand: UnoCard[];
  isBot: boolean;
  isHost: boolean;
  calledUno: boolean; // Has called UNO when down to 1 card
}

export type GamePhase = "waiting" | "playing" | "ended";
export type TurnDirection = 1 | -1; // 1 = clockwise, -1 = counter-clockwise

export interface NewGameRequest {
  fromId: string;
  fromName: string;
}

// Main game state
export interface UnoState {
  players: PlayerSlot[]; // Always 4 slots
  discardPile: UnoCard[]; // Top card is the current card
  drawPile: UnoCard[]; // Remaining deck
  currentTurnIndex: number; // 0-3, whose turn
  turnDirection: TurnDirection;
  currentColor: CardColor; // Current active color (for wild cards)
  pendingDraw: number; // Accumulated draw penalty (Draw Two stacking)
  winner: string | null;
  gamePhase: GamePhase;
  newGameRequest: NewGameRequest | null;
  mustDraw: boolean; // Current player must draw if no playable card
  hasDrawn: boolean; // Current player has drawn this turn
}

// Actions
export interface PlayCardAction {
  type: "PLAY_CARD";
  playerId: string;
  card: UnoCard;
  chosenColor?: CardColor; // For Wild cards
}

export interface DrawCardAction {
  type: "DRAW_CARD";
  playerId: string;
}

export interface CallUnoAction {
  type: "CALL_UNO";
  playerId: string;
}

export interface CatchUnoAction {
  type: "CATCH_UNO";
  playerId: string; // Player calling out someone who didn't say UNO
  targetId: string; // Player who forgot to call UNO
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

export type UnoAction =
  | PlayCardAction
  | DrawCardAction
  | CallUnoAction
  | CatchUnoAction
  | AddBotAction
  | JoinSlotAction
  | RemovePlayerAction
  | StartGameAction
  | NewGameAction
  | RequestNewGameAction
  | AcceptNewGameAction
  | DeclineNewGameAction;

// Display helpers
export const COLOR_NAMES: Record<CardColor, string> = {
  [CardColor.RED]: "Red",
  [CardColor.BLUE]: "Blue",
  [CardColor.GREEN]: "Green",
  [CardColor.YELLOW]: "Yellow",
  [CardColor.WILD]: "Wild",
};

export const COLOR_HEX: Record<CardColor, string> = {
  [CardColor.RED]: "#EF4444",
  [CardColor.BLUE]: "#3B82F6",
  [CardColor.GREEN]: "#22C55E",
  [CardColor.YELLOW]: "#EAB308",
  [CardColor.WILD]: "#1F2937",
};

export const COLOR_BG_CLASSES: Record<CardColor, string> = {
  [CardColor.RED]: "bg-red-500",
  [CardColor.BLUE]: "bg-blue-500",
  [CardColor.GREEN]: "bg-green-500",
  [CardColor.YELLOW]: "bg-yellow-500",
  [CardColor.WILD]: "bg-linear-to-br from-red-500 via-blue-500 to-green-500",
};

export const TYPE_DISPLAY: Record<CardType, string> = {
  [CardType.NUMBER]: "",
  [CardType.SKIP]: "⊘",
  [CardType.REVERSE]: "⟲",
  [CardType.DRAW_TWO]: "+2",
  [CardType.WILD]: "W",
  [CardType.WILD_DRAW_FOUR]: "+4",
};
