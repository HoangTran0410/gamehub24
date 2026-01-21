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
export const SYMBOL_NAMES: Record<
  BauCuaSymbol,
  { en: string; vi: string; emoji: string }
> = {
  gourd: { en: "Gourd", vi: "Bầu", emoji: "🎃" },
  crab: { en: "Crab", vi: "Cua", emoji: "🦀" },
  shrimp: { en: "Shrimp", vi: "Tôm", emoji: "🦐" },
  fish: { en: "Fish", vi: "Cá", emoji: "🐟" },
  chicken: { en: "Chicken", vi: "Gà", emoji: "🐔" },
  deer: { en: "Deer", vi: "Nai", emoji: "🦌" },
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

// Power-up types
export type PowerUpType = "double_down" | "insurance" | "reveal_one";

export interface PowerUp {
  type: PowerUpType;
  cooldown: number; // Rounds until available again
  lastUsedRound: number; // Track when it was last used
}

// Power-up activation timing
export type PowerUpTiming = "pre_roll" | "post_roll";

// Power-up prediction (for pre-roll powers like reveal_one)
export interface PowerUpPrediction {
  symbol: BauCuaSymbol;
  accuracy: number; // Probability (0.5 to 0.9)
  actuallyCorrect?: boolean; // Set after roll completes
}

// Power-up full configuration
export interface PowerUpConfig {
  cooldown: number;
  timing: PowerUpTiming;
  accuracy?: [number, number]; // For prediction-based powers
}

// Power-up configuration (centralized)
export const POWERUP_CONFIG: Record<PowerUpType, PowerUpConfig> = {
  double_down: { cooldown: 3, timing: "post_roll" },
  insurance: { cooldown: 2, timing: "post_roll" },
  reveal_one: { cooldown: 3, timing: "pre_roll", accuracy: [0.6, 0.9] },
};

// Power-up display names
export const POWERUP_NAMES: Record<PowerUpType, { en: string; vi: string }> = {
  double_down: { en: "Double Down", vi: "Nhân Đôi" },
  insurance: { en: "Insurance", vi: "Bảo Hiểm" },
  reveal_one: { en: "God Eyes", vi: "Mắt Thần" },
};

// Power-up descriptions
export const POWERUP_DESCRIPTIONS: Record<
  PowerUpType,
  { en: string; vi: string }
> = {
  double_down: {
    en: `2x payout if you win. Cooldown: ${POWERUP_CONFIG.double_down.cooldown} rounds`,
    vi: `Gấp đôi tiền thắng. Hồi chiêu: ${POWERUP_CONFIG.double_down.cooldown} vòng`,
  },
  insurance: {
    en: `50% refund if you lose. Cooldown: ${POWERUP_CONFIG.insurance.cooldown} rounds`,
    vi: `Hoàn 50% nếu thua. Hồi chiêu: ${POWERUP_CONFIG.insurance.cooldown} vòng`,
  },
  reveal_one: {
    en: `Predict result (60-90% accuracy). Cooldown: ${POWERUP_CONFIG.reveal_one.cooldown} rounds`,
    vi: `Dự đoán kết quả (60-90% chính xác). Hồi chiêu: ${POWERUP_CONFIG.reveal_one.cooldown} vòng`,
  },
};

// Hot streak tracking
export interface HotStreak {
  symbol: BauCuaSymbol;
  count: number; // Times appeared in last 10 rounds
}

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

  // Power-ups per player
  playerPowerUps: Record<
    string,
    {
      double_down: PowerUp;
      insurance: PowerUp;
      reveal_one: PowerUp;
    }
  >;

  // Active power-ups this round (playerId -> powerUpType)
  activePowerUps: Record<string, PowerUpType | null>;

  // Power-up predictions (for pre-roll powers)
  powerUpPredictions: Record<string, PowerUpPrediction>;

  // Last 10 rounds dice results for hot streaks
  recentRolls: DiceRoll[];

  // Mega roll tracking
  isMegaRound: boolean;
  jackpotPool: number;
}

// Game constants
export const INITIAL_BALANCE = 1000;
export const MIN_BET = 10;
export const MAX_BET = 500;
export const JACKPOT_PERCENTAGE = 0.1;
export const MEGA_ROUND_INTERVAL = 5;

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

export interface ActivatePowerUpAction {
  type: "ACTIVATE_POWERUP";
  playerId: string;
  powerUpType: PowerUpType;
}

export interface DeactivatePowerUpAction {
  type: "DEACTIVATE_POWERUP";
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
  | RemoveBotAction
  | ActivatePowerUpAction
  | DeactivatePowerUpAction;
