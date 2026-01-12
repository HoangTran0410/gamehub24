// Cell types
export type Cell = null | "red" | "yellow";

// Player info
export interface Connect4Player {
  id: string | null;
  username: string;
  color: "red" | "yellow";
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
export interface Connect4State {
  board: Cell[][]; // 6 rows x 7 columns
  players: [Connect4Player, Connect4Player]; // Always 2 players
  currentPlayerIndex: number; // 0 or 1
  winner: string | null;
  gamePhase: "waiting" | "playing" | "ended";
  undoRequest: UndoRequest | null;
  moveHistory: MoveHistory[];
  lastMove: { row: number; col: number } | null;
  winningCells: { row: number; col: number }[]; // Cells forming the winning line
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

export interface RequestSyncAction {
  type: "REQUEST_SYNC";
}

export type Connect4Action =
  | MakeMoveAction
  | ResetAction
  | StartGameAction
  | AddBotAction
  | RemoveBotAction
  | RequestUndoAction
  | AcceptUndoAction
  | DeclineUndoAction
  | RequestSyncAction;
