import type { ParticleType } from "./constants";

// Game Phase Enum
export const GamePhase = {
  WAITING: "WAITING",
  AIMING: "AIMING",
  FIRING: "FIRING",
  PROJECTILE_MOVING: "PROJECTILE_MOVING",
  IMPACT: "IMPACT",
  GAME_OVER: "GAME_OVER",
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

// Weapon Types
export const WeaponType = {
  BASIC: "BASIC",
  SCATTER: "SCATTER",
  DRILL: "DRILL",
  NUKE: "NUKE",
  BARRAGE: "BARRAGE",
  AIRSTRIKE: "AIRSTRIKE",
  BUILDER: "BUILDER",
  TELEPORT: "TELEPORT",
  // LANDMINE: "LANDMINE",
  HEAL: "HEAL",
  MIRV: "MIRV",
  BOUNCY: "BOUNCY",
  VAMPIRE: "VAMPIRE",
  METEOR: "METEOR",
  // Internal types
  AIRSTRIKE_BOMB: "AIRSTRIKE_BOMB",
  MIRV_MINI: "MIRV_MINI",
  METEOR_STRIKE: "METEOR_STRIKE",
  // LANDMINE_ARMED: "LANDMINE_ARMED",
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

export interface TerrainModification {
  type: "destroy" | "add" | "carve";
  x: number;
  y: number;
  radius: number;

  // For carve
  vx?: number;
  vy?: number;
  length?: number;

  // === Derived cached values (computed once on add, not per-query) ===
  _nx?: number; // Normalized direction X
  _ny?: number; // Normalized direction Y
  _radiusSq?: number; // radius * radius (avoids repeated multiplication)
}

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
  isExploration?: boolean;
}

// Socket Actions
export type GunnyWarsAction =
  | { type: "COMMIT_ANGLE"; angle: number; playerId: string } // Sync final angle on release
  | { type: "COMMIT_POWER"; power: number; playerId: string } // Sync final power on release
  | { type: "SELECT_WEAPON"; weapon: WeaponType; playerId: string }
  | { type: "MOVE_START"; direction: -1 | 1; x: number; playerId: string }
  | { type: "MOVE_STOP"; x: number; y: number; fuel: number; playerId: string }
  | { type: "FIRE"; playerId: string }
  | { type: "FIRE_SHOT"; shot: FireShotData } // Synced fire event for local simulation
  | { type: "START_GAME" }
  | { type: "RESET_GAME" }
  | { type: "REGENERATE_MAP"; seed: number }
  | { type: "ADD_BOT" }
  | { type: "REMOVE_BOT" }
  | { type: "START_EXPLORATION" };
