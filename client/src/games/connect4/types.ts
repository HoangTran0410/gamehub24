import type { Player } from "../../stores/roomStore";

// Player info
export const Connect4PlayerColor = {
  RED: 0,
  YELLOW: 1,
} as const;
export type Connect4PlayerColor =
  (typeof Connect4PlayerColor)[keyof typeof Connect4PlayerColor];

export const Connect4PlayerFlag = {
  BOT: 1 << 0,
} as const;
export type Connect4PlayerFlag =
  (typeof Connect4PlayerFlag)[keyof typeof Connect4PlayerFlag];

export interface Connect4Player extends Omit<Player, "id"> {
  id: string | null;
  flags: number;
}

// Move history for undo (Host-only)
export interface MoveHistory {
  b: string; // encoded board
  currentPlayerIndex: number;
}

// Undo request
export interface UndoRequest {
  fromId: string;
  fromName: string;
}

export const Connect4GamePhase = {
  WAITING: 0,
  PLAYING: 1,
  ENDED: 2,
} as const;
export type Connect4GamePhase =
  (typeof Connect4GamePhase)[keyof typeof Connect4GamePhase];

// Main game state
export interface Connect4State {
  board: string; // 6 rows x 7 cols = 42 chars (0: empty, 1: red, 2: yellow)
  players: [Connect4Player, Connect4Player];
  currentPlayerIndex: number; // 0 or 1
  winner: string | null;
  gamePhase: Connect4GamePhase;
  undoRequest: UndoRequest | null;
  lastMove: number | null; // Encoded coordinate: row * 7 + col
  winningCells: number[]; // Encoded coordinates
}

// Constants
export const ROWS = 6;
export const COLS = 7;
export const WIN_LENGTH = 4;

// Actions
export interface MakeMoveAction {
  type: "MAKE_MOVE";
  playerId: string;
  col: number;
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

export type Connect4Action =
  | MakeMoveAction
  | ResetAction
  | StartGameAction
  | AddBotAction
  | RemoveBotAction
  | RequestUndoAction
  | AcceptUndoAction
  | DeclineUndoAction;
