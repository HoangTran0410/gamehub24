import type { Player } from "../../stores/roomStore";

// Cell and Turn types
export const ReversiColor = {
  BLACK: 0,
  WHITE: 1,
} as const;
export type ReversiColor = (typeof ReversiColor)[keyof typeof ReversiColor];

export type Turn = ReversiColor;
export type CellValue = number; // 0: empty, 1: black, 2: white

export const ReversiGamePhase = {
  WAITING: 0,
  PLAYING: 1,
  ENDED: 2,
} as const;
export type ReversiGamePhase =
  (typeof ReversiGamePhase)[keyof typeof ReversiGamePhase];

export const ReversiPlayerFlag = {
  BOT: 1 << 0,
} as const;
export type ReversiPlayerFlag =
  (typeof ReversiPlayerFlag)[keyof typeof ReversiPlayerFlag];

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

export interface ReversiPlayer extends Player {
  flags: number;
}

// Main game state
export interface ReversiState {
  board: string; // 8x8 encoded as string of 64 chars (0: empty, 1: black, 2: white)
  players: {
    black: ReversiPlayer | null;
    white: ReversiPlayer | null;
  };
  turn: Turn;
  winner: string | null;
  gamePhase: ReversiGamePhase;
  undoRequest: UndoRequest | null;
  moveHistory: MoveHistory[];
  lastMove: number | null; // Encoded coordinate: row * 8 + col
  flippedCells: number[]; // Encoded coordinates
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
