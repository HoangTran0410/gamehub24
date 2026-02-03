// Numeric Constants for Optimization
export const BALL_TYPE = {
  CUE: 0,
  SOLID: 1,
  STRIPE: 2,
  EIGHT: 3,
} as const;

export type BallType = (typeof BALL_TYPE)[keyof typeof BALL_TYPE];

export const GAME_PHASE = {
  WAITING: 0,
  PLAYING: 1,
  FINISHED: 2,
} as const;

export type GamePhase = (typeof GAME_PHASE)[keyof typeof GAME_PHASE];

// Ball interface
export interface Ball {
  id: number; // 0 = cue, 1-7 = solids, 8 = eight, 9-15 = stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: BallType;
  pocketed: boolean;
}

// Player type
export type PlayerSlot = 1 | 2;

// Player info in state
export interface PlayerInfo {
  id: string | null;
  username: string | null;
  ballType: BallType | null; // BALL_TYPE.SOLID or BALL_TYPE.STRIPE, assigned after first pocket
}

// Main game state
export interface BilliardState {
  balls: Ball[];
  players: {
    1: PlayerInfo;
    2: PlayerInfo;
  };
  currentTurn: PlayerSlot;
  gamePhase: GamePhase;
  winner: PlayerSlot | null;
  lastShot: {
    angle: number;
    power: number;
    playerId: string;
  } | null;
  isSimulating: boolean; // True while balls are moving
  foul: boolean; // True if cue ball was pocketed
  turnMessage: string | null;
}

// Actions
export interface ShootAction {
  type: "SHOOT";
  angle: number; // radians
  power: number; // 0-1
  playerId: string;
}

export interface ResetGameAction {
  type: "RESET_GAME";
}

export interface StartGameAction {
  type: "START_GAME";
}

export interface AddBotAction {
  type: "ADD_BOT";
}

export interface RemoveBotAction {
  type: "REMOVE_BOT";
}

export type BilliardAction =
  | ShootAction
  | ResetGameAction
  | StartGameAction
  | AddBotAction
  | RemoveBotAction;

// Physics constants
export const TABLE_WIDTH = 800;
export const TABLE_HEIGHT = 400;
export const BALL_RADIUS = 16;
export const POCKET_RADIUS = 20;
export const FRICTION = 0.992;
export const MIN_VELOCITY = 0.1;
export const MAX_POWER = 20;
export const MIN_POWER = 0.01;

// Pocket positions (6 pockets)
export const POCKETS = [
  { x: POCKET_RADIUS, y: POCKET_RADIUS }, // Top-left
  { x: TABLE_WIDTH / 2, y: POCKET_RADIUS }, // Top-center
  { x: TABLE_WIDTH - POCKET_RADIUS, y: POCKET_RADIUS }, // Top-right
  { x: POCKET_RADIUS, y: TABLE_HEIGHT - POCKET_RADIUS }, // Bottom-left
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - POCKET_RADIUS }, // Bottom-center
  { x: TABLE_WIDTH - POCKET_RADIUS, y: TABLE_HEIGHT - POCKET_RADIUS }, // Bottom-right
];

// Ball colors
export const BALL_COLORS: Record<number, string> = {
  0: "#FFFFFF", // Cue
  1: "#FFD700", // 1 - solid yellow
  2: "#0000FF", // 2 - solid blue
  3: "#FF0000", // 3 - solid red
  4: "#800080", // 4 - solid purple
  5: "#FFA500", // 5 - solid orange
  6: "#008000", // 6 - solid green
  7: "#800000", // 7 - solid maroon
  8: "#000000", // 8 - black
  9: "#FFD700", // 9 - stripe yellow
  10: "#0000FF", // 10 - stripe blue
  11: "#FF0000", // 11 - stripe red
  12: "#800080", // 12 - stripe purple
  13: "#FFA500", // 13 - stripe orange
  14: "#008000", // 14 - stripe green
  15: "#800000", // 15 - stripe maroon
};

// Get ball type from id
export function getBallType(id: number): BallType {
  if (id === 0) return BALL_TYPE.CUE;
  if (id === 8) return BALL_TYPE.EIGHT;
  if (id >= 1 && id <= 7) return BALL_TYPE.SOLID;
  return BALL_TYPE.STRIPE;
}

// Initial ball setup (triangle rack)
export function createInitialBalls(): Ball[] {
  const balls: Ball[] = [];

  // Cue ball
  balls.push({
    id: 0,
    x: TABLE_WIDTH * 0.25,
    y: TABLE_HEIGHT / 2,
    vx: 0,
    vy: 0,
    type: BALL_TYPE.CUE,
    pocketed: false,
  });

  // Rack position (apex of triangle)
  const rackX = TABLE_WIDTH * 0.7;
  const rackY = TABLE_HEIGHT / 2;
  const spacing = BALL_RADIUS * 2.1;

  // Standard 8-ball rack order (8-ball in center)
  const rackOrder = [
    [1], // Row 1 (apex)
    [9, 2], // Row 2
    [3, 8, 10], // Row 3 (8-ball center)
    [11, 4, 5, 12], // Row 4
    [6, 13, 14, 7, 15], // Row 5
  ];

  let ballIndex = 1;
  rackOrder.forEach((row, rowIdx) => {
    const rowY = rackY - ((row.length - 1) / 2) * spacing;
    row.forEach((id, colIdx) => {
      balls.push({
        id,
        x: rackX + rowIdx * spacing * 0.866, // cos(30°) for triangle
        y: rowY + colIdx * spacing,
        vx: 0,
        vy: 0,
        type: getBallType(id),
        pocketed: false,
      });
      ballIndex++;
    });
  });

  return balls;
}
