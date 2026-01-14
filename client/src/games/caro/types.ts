export interface CaroState {
  board: Record<string, "X" | "O">;
  currentTurn: "X" | "O";
  winner: "X" | "O" | null;
  winningLine: [number, number][] | null;
  isDraw: boolean;
  players: {
    X: string | null;
    O: string | null;
  };
  gameOver: boolean;
  history: string[]; // List of keys "row,col"
  lastMove: { row: number; col: number } | null; // Added lastMove
  pendingUndoRequest: string | null; // ID of player requesting undo
  gamePhase: "waiting" | "playing";
}

// Actions
export interface CaroMoveAction {
  type: "MAKE_MOVE";
  row: number;
  col: number;
  playerId: string;
}

export interface CaroUndoRequestAction {
  type: "UNDO_REQUEST";
  playerId: string;
}

export interface CaroUndoResponseAction {
  type: "UNDO_RESPONSE";
  accepted: boolean;
}

export interface CaroSwitchTurnAction {
  type: "SWITCH_TURN";
}

export interface CaroResetAction {
  type: "RESET_GAME";
}

export interface CaroStartGameAction {
  type: "START_GAME";
}

export type CaroAction =
  | CaroMoveAction
  | CaroUndoRequestAction
  | CaroUndoResponseAction
  | CaroSwitchTurnAction
  | CaroResetAction
  | CaroStartGameAction;
