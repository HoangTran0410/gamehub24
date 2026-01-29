// import { Player } from '../../stores/roomStore'; // Unused

import type { Player } from "../../stores/roomStore";

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

export interface PlayerState extends Player {
  x: number;
  y: number;
  color: string;

  // Movement State
  // Movement State - Immediate updates with animation catch-up
  currentPath?: { x: number; y: number }[]; // Calculated path including start and end
  moveStart?: number; // Timestamp when move started
  moveEnd?: number; // Timestamp when move completes (locks input until then)
}

export interface MazeConfig {
  rows: number;
  cols: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

export interface MazeState {
  // Config
  config: MazeConfig;
  level: number;
  seed: number;

  // Game Status
  status: "WAITING" | "PLAYING" | "FINISHED";
  startTime?: number;

  // Players
  players: Record<string, PlayerState>;
  winners: string[]; // List of player IDs in order of finishing
}

export type MazeAction =
  | { type: "MOVE"; direction: Direction; playerId?: string }
  | { type: "START_GAME" }
  | { type: "NEXT_LEVEL" }
  | { type: "RESET_GAME" }
  | { type: "UPDATE_SETTINGS"; difficulty: "EASY" | "MEDIUM" | "HARD" }
  | { type: "TELEPORT"; playerId?: string };
