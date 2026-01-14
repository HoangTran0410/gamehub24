export interface TicTacToeState {
  board: (string | null)[];
  currentTurn: "X" | "O";
  winner: "X" | "O" | null;
  /** Indices of the winning line */
  winningLine: number[] | null;
  isDraw: boolean;
  players: {
    X: string | null;
    O: string | null;
  };
  gameOver: boolean;
  /** Index of the last move made */
  lastMoveIndex: number | null;
  /** Game phase: waiting for players or playing */
  gamePhase: "waiting" | "playing";
}

export type CellValue = "X" | "O" | null;

export interface MakeMoveAction {
  type: "MAKE_MOVE";
  cellIndex: number;
  playerId: string;
}

export interface ResetGameAction {
  type: "RESET_GAME";
}

export interface SwitchTurnAction {
  type: "SWITCH_TURN";
}

export interface StartGameAction {
  type: "START_GAME";
}

export type TicTacToeAction =
  | MakeMoveAction
  | ResetGameAction
  | SwitchTurnAction
  | StartGameAction;
