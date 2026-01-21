// Player type from roomStore (not directly used in types.ts)

// The 6 traditional Bầu Cua symbols
export type BauCuaSymbol =
  | "gourd"
  | "crab"
  | "shrimp"
  | "fish"
  | "chicken"
  | "deer";

// Symbol display names
export const SYMBOL_NAMES: Record<BauCuaSymbol, { en: string; vi: string }> = {
  gourd: { en: "Gourd", vi: "Bầu" },
  crab: { en: "Crab", vi: "Cua" },
  shrimp: { en: "Shrimp", vi: "Tôm" },
  fish: { en: "Fish", vi: "Cá" },
  chicken: { en: "Chicken", vi: "Gà" },
  deer: { en: "Deer", vi: "Nai" },
};

// All symbols in order
export const ALL_SYMBOLS: BauCuaSymbol[] = [
  "gourd",
  "crab",
  "shrimp",
  "fish",
  "chicken",
  "deer",
];

// Player's bet on a symbol
export interface Bet {
  symbol: BauCuaSymbol;
  amount: number;
}

// Player balance with history for graphing
export interface PlayerBalance {
  playerId: string;
  username: string;
  currentBalance: number;
  balanceHistory: number[]; // Balance after each round
  totalBet: number; // Current round bets
  isBot: boolean;
}

// Dice roll result (3 dice, each showing one symbol)
export type DiceRoll = [BauCuaSymbol, BauCuaSymbol, BauCuaSymbol];

// Game phases
export type GamePhase = "waiting" | "betting" | "rolling" | "results" | "ended";

// Main game state
export interface BauCuaState {
  gamePhase: GamePhase;

  // Player balances and history
  playerBalances: Record<string, PlayerBalance>;

  // Current round bets (playerId -> bets)
  currentBets: Record<string, Bet[]>;

  // Dice results
  diceRoll: DiceRoll | null;

  // Round tracking
  currentRound: number;

  // Players ready status (for betting phase)
  playersReady: Record<string, boolean>;

  // Winner if game ended
  winner: string | null;
}

// Game constants
export const INITIAL_BALANCE = 1000;
export const MIN_BET = 10;
export const MAX_BET = 500;

// Actions
export interface PlaceBetAction {
  type: "PLACE_BET";
  playerId: string;
  symbol: BauCuaSymbol;
  amount: number;
}

export interface ClearBetsAction {
  type: "CLEAR_BETS";
  playerId: string;
}

export interface ToggleReadyAction {
  type: "TOGGLE_READY";
  playerId: string;
}

export interface SyncBetsAction {
  type: "SYNC_BETS";
  playerId: string;
  bets: Bet[];
}

export interface RollDiceAction {
  type: "ROLL_DICE";
}

export interface StartNewRoundAction {
  type: "START_NEW_ROUND";
}

export interface ResetGameAction {
  type: "RESET_GAME";
}

export interface AddBotAction {
  type: "ADD_BOT";
}

export interface RemoveBotAction {
  type: "REMOVE_BOT";
  playerId: string;
}

export type BauCuaAction =
  | PlaceBetAction
  | ClearBetsAction
  | ToggleReadyAction
  | SyncBetsAction
  | RollDiceAction
  | StartNewRoundAction
  | ResetGameAction
  | AddBotAction
  | RemoveBotAction;
