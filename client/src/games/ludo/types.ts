// Player colors
export type PlayerColor = "red" | "blue" | "green" | "yellow";

// Token position types
export type TokenPosition =
  | { type: "home"; index: number } // In home base (0-3)
  | { type: "board"; position: number } // On main board (0-51)
  | { type: "finish"; position: number } // In finish lane (0-5)
  | { type: "finished" }; // Reached center/won

// Token info
export interface Token {
  id: number; // 0-3 for each player
  position: TokenPosition;
}

// Player info
export interface LudoPlayer {
  id: string | null;
  username: string;
  color: PlayerColor;
  isBot: boolean;
  tokens: Token[];
  hasFinished: boolean; // All 4 tokens finished
}

// Main game state
export interface LudoState {
  players: LudoPlayer[];
  currentPlayerIndex: number;
  diceValue: number | null;
  hasRolled: boolean; // Whether current player has rolled
  canRollAgain: boolean; // Got a 6, can roll again after moving
  gamePhase: "waiting" | "playing" | "ended";
  winner: string | null;
  lastMove: {
    playerId: string;
    tokenId: number;
    from: TokenPosition;
    to: TokenPosition;
  } | null;
  consecutiveSixes: number; // Track consecutive 6s (3 = lose turn)
}

// Board constants
export const BOARD_SIZE = 52; // Main track positions
export const FINISH_LANE_SIZE = 6; // Final stretch before center
export const TOKENS_PER_PLAYER = 4;

// Starting positions for each color (where they enter the board)
export const START_POSITIONS: Record<PlayerColor, number> = {
  red: 0,
  blue: 13,
  green: 26,
  yellow: 39,
};

// Safe zone positions (can't be captured here)
export const SAFE_POSITIONS = [0, 8, 13, 21, 26, 34, 39, 47];

// Actions
export interface RollDiceAction {
  type: "ROLL_DICE";
  playerId: string;
}

export interface MoveTokenAction {
  type: "MOVE_TOKEN";
  playerId: string;
  tokenId: number;
}

export interface StartGameAction {
  type: "START_GAME";
}

export interface ResetAction {
  type: "RESET";
}

export interface AddBotAction {
  type: "ADD_BOT";
  slotIndex: number;
}

export interface RemoveBotAction {
  type: "REMOVE_BOT";
  slotIndex: number;
}

export interface RequestSyncAction {
  type: "REQUEST_SYNC";
}

export type LudoAction =
  | RollDiceAction
  | MoveTokenAction
  | StartGameAction
  | ResetAction
  | AddBotAction
  | RemoveBotAction
  | RequestSyncAction;
