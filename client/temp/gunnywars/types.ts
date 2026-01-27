export enum GamePhase {
  AIMING = 'AIMING',
  FIRING = 'FIRING',
  PROJECTILE_MOVING = 'PROJECTILE_MOVING',
  IMPACT = 'IMPACT',
  GAME_OVER = 'GAME_OVER',
}

export enum WeaponType {
  BASIC = 'BASIC',
  SCATTER = 'SCATTER',
  DRILL = 'DRILL',
  NUKE = 'NUKE',
  BARRAGE = 'BARRAGE',
  AIRSTRIKE = 'AIRSTRIKE',
  BUILDER = 'BUILDER',
  TELEPORT = 'TELEPORT',
  LANDMINE = 'LANDMINE',
  HEAL = 'HEAL',
  // Internal
  AIRSTRIKE_BOMB = 'AIRSTRIKE_BOMB',
  LANDMINE_ARMED = 'LANDMINE_ARMED'
}

export interface Vector {
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;     // 0.0 to 1.0
  decay: number;    // How much life to subtract per frame
  size: number;
  color: string;
  type: 'smoke' | 'fire' | 'spark' | 'glow';
}

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

export interface Tank {
  id: string;
  isPlayer: boolean;
  x: number;
  y: number;
  angle: number; // Aim angle in degrees
  power: number; // Power 0-100
  health: number;
  maxHealth: number;
  color: string;
  selectedWeapon: WeaponType;
  fuel: number; // For movement
  facingRight: boolean;
}

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
}

export interface GameState {
  phase: GamePhase;
  tanks: Tank[];
  projectiles: Projectile[];
  particles: Particle[];
  currentTurnIndex: number; // Index in tanks array
  wind: number;
  winner: string | null;
  turnTimer: number;
}