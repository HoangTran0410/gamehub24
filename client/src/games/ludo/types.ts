// Player colors
export const PlayerColor = {
  RED: 0,
  GREEN: 1,
  YELLOW: 2,
  BLUE: 3,
} as const;
export type PlayerColor = (typeof PlayerColor)[keyof typeof PlayerColor];

export const LudoGamePhase = {
  WAITING: 0,
  PLAYING: 1,
  ENDED: 2,
} as const;
export type LudoGamePhase = (typeof LudoGamePhase)[keyof typeof LudoGamePhase];

export const LudoPlayerFlag = {
  FINISHED: 1 << 0,
  BOT: 1 << 1,
} as const;
export type LudoPlayerFlag =
  (typeof LudoPlayerFlag)[keyof typeof LudoPlayerFlag];

/**
 * Token position encoded as a single number:
 * - 0 - 51: Board position
 * - 100 - 103: Home index
 * - 200 - 205: Finish lane position
 * - 300: Finished (reached center)
 */
export type TokenPosition = number;

export const TOKEN_POS = {
  HOME_BASE: 100,
  FINISH_LANE: 200,
  FINISHED: 300,
} as const;

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
  flags: number; // bitfield of LudoPlayerFlag
  tokens: Token[];
}

// Main game state
export interface LudoState {
  players: LudoPlayer[];
  currentPlayerIndex: number;
  diceValue: number | null;
  hasRolled: boolean; // Whether current player has rolled
  canRollAgain: boolean; // Got a 6, can roll again after moving
  gamePhase: LudoGamePhase;
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
// Board layout: Red=top-left, Green=top-right, Yellow=bottom-right, Blue=bottom-left
export const START_POSITIONS: Record<number, number> = {
  [PlayerColor.RED]: 0, // Left arm, row 6 (enters from top-left home)
  [PlayerColor.GREEN]: 13, // Top arm, col 8 (enters from top-right home)
  [PlayerColor.YELLOW]: 26, // Right arm, row 8 (enters from bottom-right home)
  [PlayerColor.BLUE]: 39, // Bottom arm, col 6 (enters from bottom-left home)
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

export type LudoAction =
  | RollDiceAction
  | MoveTokenAction
  | StartGameAction
  | ResetAction
  | AddBotAction
  | RemoveBotAction;
