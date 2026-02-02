import { type Weapon, WeaponType } from "./types";

// World Dimensions (Large Map)
export const WORLD_WIDTH = 15000;
export const WORLD_HEIGHT = 1000;

// Biome System
export const BIOME_TYPES = [
  "plains",
  "mountains",
  "valley",
  "desert",
  "tundra",
] as const;
export type BiomeType = (typeof BIOME_TYPES)[number];

// Biome generation parameters
export const BIOME_SCALE = 0.0001; // Controls biome zone size (higher = smaller zones, more variety)
export const BIOME_BLEND_WIDTH = 500; // Pixels for smooth biome transitions

// Snow cap threshold (Y position, lower = higher on screen)
export const SNOW_THRESHOLD_HEIGHT = 280; // Snow appears above this Y

// Physics Constants
export const GRAVITY = 0.2;
export const MAX_POWER = 25;
export const MOVEMENT_SPEED = 2;
export const FUEL_CONSUMPTION = 1;
export const MAX_FUEL = 300;

// Tank Constants
export const INITIAL_HEALTH = 100;
export const TANK_WIDTH = 30;
export const TANK_HEIGHT = 20;

// Particle Constants
export const MAX_PARTICLES = 5000;
export const PARTICLE_STRIDE = 12; // x, y, vx, vy, life, decay, size, type, r, g, b, additive
export const PARTICLE_TYPES = {
  smoke: 0,
  fire: 1,
  spark: 2,
  glow: 3,
};
export type ParticleType = (typeof PARTICLE_TYPES)[keyof typeof PARTICLE_TYPES];

// Weapon Definitions
export const WEAPONS: Record<WeaponType, Weapon> = {
  [WeaponType.BASIC]: {
    type: WeaponType.BASIC,
    name: "Bazooka",
    damage: 25,
    radius: 40,
    color: "#38bdf8", // Neon Sky Blue
    count: 1,
    terrainDamageMultiplier: 1,
  },
  [WeaponType.SCATTER]: {
    type: WeaponType.SCATTER,
    name: "Shotgun",
    damage: 10,
    radius: 30,
    color: "#facc15", // Neon Yellow
    count: 3,
    spread: 10,
    terrainDamageMultiplier: 0.5,
  },
  [WeaponType.BARRAGE]: {
    type: WeaponType.BARRAGE,
    name: "Barrage",
    damage: 15,
    radius: 30,
    color: "#fb923c", // Orange
    count: 5,
    spread: 5,
    terrainDamageMultiplier: 0.8,
  },
  [WeaponType.DRILL]: {
    type: WeaponType.DRILL,
    name: "Digger",
    damage: 15,
    radius: 40, // Radius determines tunnel width
    color: "#a3e635", // Neon Lime
    count: 1,
    terrainDamageMultiplier: 1, // Handled via carveTunnel
  },
  [WeaponType.NUKE]: {
    type: WeaponType.NUKE,
    name: "Nuke",
    damage: 60,
    radius: 120,
    color: "#d946ef", // Neon Fuchsia
    count: 1,
    terrainDamageMultiplier: 1.5,
  },
  [WeaponType.HEAL]: {
    type: WeaponType.HEAL,
    name: "Medic",
    damage: 40, // Healing amount
    radius: 60,
    color: "#4ade80", // Green
    count: 1,
    terrainDamageMultiplier: 0,
  },
  [WeaponType.AIRSTRIKE]: {
    type: WeaponType.AIRSTRIKE,
    name: "Airstrike",
    damage: 0,
    radius: 10,
    color: "#ef4444",
    count: 1,
    terrainDamageMultiplier: 0,
  },
  [WeaponType.AIRSTRIKE_BOMB]: {
    // Internal
    type: WeaponType.AIRSTRIKE_BOMB,
    name: "Rain",
    damage: 20,
    radius: 30,
    color: "#ef4444",
    count: 1,
    terrainDamageMultiplier: 1,
  },
  [WeaponType.BUILDER]: {
    type: WeaponType.BUILDER,
    name: "Builder",
    damage: 0,
    radius: 100,
    color: "#60a5fa",
    count: 1,
    terrainDamageMultiplier: 0,
  },
  [WeaponType.TELEPORT]: {
    type: WeaponType.TELEPORT,
    name: "Teleport",
    damage: 0,
    radius: 20,
    color: "#c084fc",
    count: 1,
    terrainDamageMultiplier: 0,
  },
  [WeaponType.MIRV]: {
    type: WeaponType.MIRV,
    name: "MIRV",
    damage: 15,
    radius: 30,
    color: "#a78bfa", // Purple
    count: 1,
    terrainDamageMultiplier: 0.8,
  },
  [WeaponType.MIRV_MINI]: {
    type: WeaponType.MIRV_MINI,
    name: "Cluster",
    damage: 15,
    radius: 25,
    color: "#a78bfa",
    count: 1,
    terrainDamageMultiplier: 1,
  },
  [WeaponType.BOUNCY]: {
    type: WeaponType.BOUNCY,
    name: "Bouncy",
    damage: 30,
    radius: 40,
    color: "#4ade80", // Emerald
    count: 1,
    terrainDamageMultiplier: 1,
  },
  [WeaponType.VAMPIRE]: {
    type: WeaponType.VAMPIRE,
    name: "Vampire",
    damage: 25,
    radius: 35,
    color: "#f43f5e", // Rose
    count: 1,
    terrainDamageMultiplier: 0.5,
  },
  [WeaponType.METEOR]: {
    type: WeaponType.METEOR,
    name: "Meteor",
    damage: 0,
    radius: 10,
    color: "#f87171", // Red
    count: 1,
    terrainDamageMultiplier: 0,
  },
  [WeaponType.METEOR_STRIKE]: {
    type: WeaponType.METEOR_STRIKE,
    name: "Meteor Strike",
    damage: 50,
    radius: 100,
    color: "#fb923c", // Orange
    count: 1,
    terrainDamageMultiplier: 2.5,
  },
};

// Get user-selectable weapons (exclude internal types)
export const SELECTABLE_WEAPONS = Object.values(WEAPONS).filter(
  (w) =>
    w.type !== WeaponType.AIRSTRIKE_BOMB &&
    w.type !== WeaponType.MIRV_MINI &&
    w.type !== WeaponType.METEOR_STRIKE,
);

// Tank Colors
export const TANK_COLORS = [
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
];
