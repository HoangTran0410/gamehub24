// Cell types
export type Cell = null | "black" | "white";

// Player info
export interface ReversiPlayer {
  id: string | null;
  username: string;
  color: "black" | "white";
  isBot: boolean;
}

// Move history for undo
export interface MoveHistory {
  board: Cell[][];
  currentPlayerIndex: number;
}

// Undo request
export interface UndoRequest {
  fromId: string;
  fromName: string;
}

// Main game state
export interface ReversiState {
  board: Cell[][]; // 8x8
  players: [ReversiPlayer, ReversiPlayer]; // Always 2 players
  currentPlayerIndex: number; // 0 or 1
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

export interface RequestSyncAction {
  type: "REQUEST_SYNC";
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
  | DeclineUndoAction
  | RequestSyncAction;

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
