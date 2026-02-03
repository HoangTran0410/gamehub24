import type { ParticleType } from "./constants";

// Game Phase Enum (Optimized: Numeric)
export const GamePhase = {
  WAITING: 0,
  AIMING: 1,
  FIRING: 2,
  PROJECTILE_MOVING: 3,
  IMPACT: 4,
  GAME_OVER: 5,
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export const GameMode = {
  TURN_BASED: 0,
  CHAOS: 1,
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

// Weapon Types (Optimized: Numeric)
export const WeaponType = {
  BASIC: 0,
  SCATTER: 1,
  DRILL: 2,
  NUKE: 3,
  BARRAGE: 4,
  AIRSTRIKE: 5,
  BUILDER: 6,
  TELEPORT: 7,
  HEAL: 8,
  MIRV: 9,
  BOUNCY: 10,
  VAMPIRE: 11,
  METEOR: 12,
  // Internal types
  AIRSTRIKE_BOMB: 13,
  MIRV_MINI: 14,
  METEOR_STRIKE: 15,
} as const;
export type WeaponType = (typeof WeaponType)[keyof typeof WeaponType];

// Vector interface
export interface Vector {
  x: number;
  y: number;
}

// Particle for visual effects (LOCAL ONLY - not synced)
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0.0 to 1.0
  decay: number; // How much life to subtract per frame
  size: number;
  color: string;
  type: ParticleType;
}

// Weapon definition
export interface Weapon {
  type: WeaponType;
  name: string;
  damage: number;
  radius: number;
  color: string;
  count: number; // Projectile count per shot
  spread?: number; // Spread angle for multiple projectiles
  terrainDamageMultiplier: number;
  description: string;
  descriptionVi: string;
}

export type MoveDirection = -1 | 1;

// Tank (Player)
export interface Tank {
  id: string;
  name: string;
  playerId: string | null; // null for bot, or the player's userId
  isBot: boolean;
  x: number;
  y: number;
  angle: number; // Aim angle in degrees
  power: number; // Power 0-100
  health: number;
  maxHealth: number;
  color: string;
  weapon: WeaponType;
  fuel: number; // For movement
  isMoving?: boolean;
  moveDir?: MoveDirection;
  lastFireTime: number;
}

// Projectile (LOCAL ONLY - not synced, simulated from fire event)
export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  weapon: WeaponType;
  ownerId: string;
  active: boolean;
  bounces?: number; // For bouncy weapons
}

// Fire shot data (synced to all clients)
export interface FireShotData {
  tankId: string;
  x: number;
  y: number;
  angle: number;
  power: number;
  weapon: WeaponType;
  wind: number;
  seed: number;
}

// Player info
export interface PlayerInfo {
  id: string | null; // unique bot ID or user ID
  username: string | null;
  tankId: string | null;
  isBot?: boolean;
}

// Terrain Modification Types (Optimized: Numeric)
export const TerrainModType = {
  DESTROY: 0,
  ADD: 1,
  CARVE: 2,
} as const;
export type TerrainModType =
  (typeof TerrainModType)[keyof typeof TerrainModType];

/**
 * TerrainModification as a compact tuple:
 * [type, x, y, radius, vx?, vy?, length?]
 */
export type TerrainModification = [
  type: TerrainModType,
  x: number,
  y: number,
  radius: number,
  vx?: number,
  vy?: number,
  length?: number,
];

/**
 * Centralized helpers for TerrainModification to avoid direct index access
 */
export const TerrainMod = {
  create: (
    type: TerrainModType,
    x: number,
    y: number,
    radius: number,
    vx?: number,
    vy?: number,
    length?: number,
  ): TerrainModification => {
    // Round to 1 decimal place to save bandwidth
    const r = (val: number) => Math.round(val * 10) / 10;
    const mod: TerrainModification = [type, r(x), r(y), r(radius)];
    if (vx !== undefined) mod.push(r(vx));
    if (vy !== undefined) mod.push(r(vy));
    if (length !== undefined) mod.push(r(length));
    return mod;
  },

  getType: (mod: TerrainModification) => mod[0],
  getX: (mod: TerrainModification) => mod[1],
  getY: (mod: TerrainModification) => mod[2],
  getRadius: (mod: TerrainModification) => mod[3],
  getVx: (mod: TerrainModification) => mod[4],
  getVy: (mod: TerrainModification) => mod[5],
  getLength: (mod: TerrainModification) => mod[6],
};

// Main Game State (synced between players)
// NOTE: projectiles and particles are LOCAL ONLY - simulated from fire events
export interface GunnyWarsState {
  phase: GamePhase;
  tanks: Tank[];
  currentTurnIndex: number; // Index in tanks array
  wind: number;
  winner: string | null; // "Player 1", "Player 2", etc.
  turnTimeEnd: number;
  players: PlayerInfo[];
  terrainSeed: number; // For synchronized terrain generation
  terrainMods: TerrainModification[];
  isSimulating: boolean;
  selectedMode?: GameMode;
  gameStartTime: number;
}

// Socket Actions
export type GunnyWarsAction =
  | { type: "COMMIT_ANGLE"; angle: number; playerId: string } // Sync final angle on release
  | { type: "COMMIT_POWER"; power: number; playerId: string } // Sync final power on release
  | { type: "SELECT_WEAPON"; weapon: WeaponType; playerId: string }
  | { type: "MOVE_START"; direction: -1 | 1; x: number; playerId: string }
  | { type: "MOVE_STOP"; x: number; y: number; fuel: number; playerId: string }
  | { type: "FIRE"; playerId: string; x?: number; y?: number }
  | { type: "FIRE_SHOT"; shot: FireShotData } // Synced fire event for local simulation
  | { type: "START_GAME" }
  | { type: "RESET_GAME" }
  | { type: "REGENERATE_MAP"; seed: number }
  | { type: "ADD_BOT" }
  | { type: "REMOVE_BOT" }
  | { type: "START_EXPLORATION" }
  | { type: "SELECT_MODE"; mode: GameMode };
