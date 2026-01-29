import type { Player } from "../../stores/roomStore";

// Cell types
export type Turn = "black" | "white";
export type Cell = null | Turn;

// Move history for undo
export interface MoveHistory {
  b: string; // encoded board
  t: Turn; // turn
}

// Undo request
export interface UndoRequest {
  fromId: string;
  fromName: string;
}

// Main game state
export interface ReversiState {
  board: string; // 8x8 encoded as string of 64 chars (0: empty, 1: black, 2: white)
  players: {
    black: Player | null;
    white: Player | null;
  };
  turn: Turn;
  winner: string | null;
  gamePhase: "waiting" | "playing" | "ended";
  undoRequest: UndoRequest | null;
  moveHistory: MoveHistory[];
  lastMove: { row: number; col: number } | null;
  flippedCells: { row: number; col: number }[]; // Cells flipped in last move
}

// Actions
export interface MakeMoveAction {
  type: "MAKE_MOVE";
  playerId: string;
  row: number;
  col: number;
}

export interface PassAction {
  type: "PASS";
  playerId: string;
}

export interface ResetAction {
  type: "RESET";
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

export interface RequestUndoAction {
  type: "REQUEST_UNDO";
  playerId: string;
  playerName: string;
}

export interface AcceptUndoAction {
  type: "ACCEPT_UNDO";
}

export interface DeclineUndoAction {
  type: "DECLINE_UNDO";
}

export type ReversiAction =
  | MakeMoveAction
  | PassAction
  | ResetAction
  | StartGameAction
  | AddBotAction
  | RemoveBotAction
  | RequestUndoAction
  | AcceptUndoAction
  | DeclineUndoAction;

// Directions for flipping
export const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
