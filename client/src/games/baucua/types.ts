// Game constants
export const INITIAL_BALANCE = 1000;
export const MIN_BET = 10;
export const JACKPOT_PERCENTAGE = 0.1;
export const MEGA_ROUND_INTERVAL = 5;
export const MAX_SYMBOLS_PER_PLAYER = 3;
export const RICH_MODE_TARGETS = [
  10000, 100000, 1000000, 100000000, 500000000, 1000000000, 2000000000,
];
export const MAX_HISTORY_LENGTH = 50;

// The 6 traditional Bầu Cua symbols
export const BAU_CUA_SYMBOL = {
  GOURD: 0,
  CRAB: 1,
  SHRIMP: 2,
  FISH: 3,
  CHICKEN: 4,
  DEER: 5,
} as const;

export type BauCuaSymbol = (typeof BAU_CUA_SYMBOL)[keyof typeof BAU_CUA_SYMBOL];

// Symbol display names
export const SYMBOL_NAMES: Record<
  BauCuaSymbol,
  { en: string; vi: string; emoji: string }
> = {
  [BAU_CUA_SYMBOL.GOURD]: { en: "Gourd", vi: "Bầu", emoji: "🎃" },
  [BAU_CUA_SYMBOL.CRAB]: { en: "Crab", vi: "Cua", emoji: "🦀" },
  [BAU_CUA_SYMBOL.SHRIMP]: { en: "Shrimp", vi: "Tôm", emoji: "🦐" },
  [BAU_CUA_SYMBOL.FISH]: { en: "Fish", vi: "Cá", emoji: "🐟" },
  [BAU_CUA_SYMBOL.CHICKEN]: { en: "Chicken", vi: "Gà", emoji: "🐔" },
  [BAU_CUA_SYMBOL.DEER]: { en: "Deer", vi: "Nai", emoji: "🦌" },
};

// All symbols in order
export const ALL_SYMBOLS: BauCuaSymbol[] = [
  BAU_CUA_SYMBOL.GOURD,
  BAU_CUA_SYMBOL.CRAB,
  BAU_CUA_SYMBOL.SHRIMP,
  BAU_CUA_SYMBOL.FISH,
  BAU_CUA_SYMBOL.CHICKEN,
  BAU_CUA_SYMBOL.DEER,
];

// Player's bet on a symbol: [symbol, amount]
export type Bet = [BauCuaSymbol, number];

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
export const GAME_PHASE = {
  WAITING: 0,
  BETTING: 1,
  ROLLING: 2,
  RESULTS: 3,
  ENDED: 4,
} as const;

export type GamePhase = (typeof GAME_PHASE)[keyof typeof GAME_PHASE];

// Power-up types
export const POWERUP_TYPE = {
  DOUBLE_DOWN: 0,
  INSURANCE: 1,
  REVEAL_ONE: 2,
  LUCKY_STAR: 3,
} as const;

export type PowerUpType = (typeof POWERUP_TYPE)[keyof typeof POWERUP_TYPE];

export interface PowerUp {
  type: PowerUpType;
  cooldown: number; // Rounds until available again
  lastUsedRound: number; // Track when it was last used
  lastMultiplier?: number; // For lucky_star
}

// Power-up activation timing
export const POWERUP_TIMING = {
  PRE_ROLL: 0,
  POST_ROLL: 1,
} as const;

export type PowerUpTiming =
  (typeof POWERUP_TIMING)[keyof typeof POWERUP_TIMING];

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
  name: { en: string; vi: string };
  description: { en: string; vi: string };
  emoji: string;

  accuracy?: [number, number]; // For prediction-based powers
  luckyMultiplier?: [number, number]; // For lucky_star
}

// Power-up configuration (centralized)
export const POWERUP_CONFIG: Record<PowerUpType, PowerUpConfig> = {
  [POWERUP_TYPE.DOUBLE_DOWN]: {
    cooldown: 3,
    timing: POWERUP_TIMING.POST_ROLL,
    emoji: "2️⃣",
    name: { en: "Double Down", vi: "Nhân Đôi" },
    description: {
      en: "2x payout if win, 2x bet lost if lose. Cooldown: 3 rounds",
      vi: "Thắng x2 tiền thưởng, thua x2 tiền phạt. Hồi chiêu: 3 vòng",
    },
  },
  [POWERUP_TYPE.INSURANCE]: {
    cooldown: 2,
    timing: POWERUP_TIMING.POST_ROLL,
    emoji: "🛡️",
    name: { en: "Insurance", vi: "Bảo Hiểm" },
    description: {
      en: "Refund 50% if lose, but only 50% profit if win. Cooldown: 2 rounds",
      vi: "Hoàn 50% nếu thua, nhưng mất 50% nếu thắng. Hồi chiêu: 2 vòng",
    },
  },
  [POWERUP_TYPE.REVEAL_ONE]: {
    cooldown: 3,
    timing: POWERUP_TIMING.PRE_ROLL,
    accuracy: [0.6, 0.9],
    emoji: "👁️",
    name: { en: "God Eyes", vi: "Mắt Thần" },
    description: {
      en: "Predict result (60-90% accuracy). Cooldown: 3 rounds",
      vi: "Dự đoán kết quả (60-90% chính xác). Hồi chiêu: 3 vòng",
    },
  },
  [POWERUP_TYPE.LUCKY_STAR]: {
    cooldown: 4,
    timing: POWERUP_TIMING.POST_ROLL,
    luckyMultiplier: [0.5, 3],
    emoji: "⭐️",
    name: { en: "Lucky Star", vi: "Sao May Mắn" },
    description: {
      en: "Multiply winnings by 0.5x - 3x. Cooldown: 4 rounds",
      vi: "Nhân tiền thắng ngẫu nhiên 0.5x - 3x. Hồi chiêu: 4 vòng",
    },
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

  // Winners if game ended (can be multiple in case of tie)
  winners: string[];

  // Power-ups per player
  playerPowerUps: Record<
    string,
    {
      [POWERUP_TYPE.DOUBLE_DOWN]: PowerUp;
      [POWERUP_TYPE.INSURANCE]: PowerUp;
      [POWERUP_TYPE.REVEAL_ONE]: PowerUp;
      [POWERUP_TYPE.LUCKY_STAR]: PowerUp;
    }
  >;

  // Active power-ups this round (playerId -> powerUpType)
  activePowerUps: Record<string, PowerUpType | null>;

  // Power-up predictions (for pre-roll powers)
  powerUpPredictions: Record<string, PowerUpPrediction>;

  // Last 10 rounds dice results for hot streaks
  recentRolls: Record<string, DiceRoll>;

  // Mega roll tracking
  isMegaRound: boolean;
  jackpotPool: number;

  // Win condition: 0 = Survival (Last man standing), > 0 = Target Balance
  minBalanceToWin: number;
}

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

export interface SetGameModeAction {
  type: "SET_GAME_MODE";
  minBalance: number;
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
  | SetGameModeAction
  | AddBotAction
  | RemoveBotAction
  | ActivatePowerUpAction
  | DeactivatePowerUpAction;
