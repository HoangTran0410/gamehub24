import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import type { Socket } from "socket.io-client";

export interface Point {
  x: number;
  y: number;
}

export interface DrawStroke {
  id: string;
  playerId: string;
  points: Point[];
  color: string;
  width: number;
}

export interface CanvasState {
  strokes: DrawStroke[];
}

export interface CanvasAction extends GameAction {
  type: "DRAW" | "CLEAR" | "REQUEST_SYNC";
  payload?: any;
}

export class CanvasGame extends BaseGame {
  private state: CanvasState;
  private onStateChange?: (state: CanvasState) => void;

  constructor(
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    _players: { id: string; username: string }[]
  ) {
    super(roomId, socket, isHost, userId);

    this.state = {
      strokes: [],
    };

    this.init();
  }

  init(): void {
    if (this.isHost) {
      this.broadcastState();
    }
  }

  onUpdate(callback: (state: CanvasState) => void): void {
    this.onStateChange = callback;
    callback(this.state);
  }

  getState(): CanvasState {
    return { ...this.state };
  }

  setState(state: CanvasState): void {
    this.state = state;
    this.onStateChange?.(this.state);
  }

  handleAction(data: { action: GameAction }): void {
    const action = data.action as CanvasAction;

    if (action.type === "DRAW") {
      this.handleDraw(action.payload);
    } else if (action.type === "CLEAR") {
      this.handleClear();
    } else if (action.type === "REQUEST_SYNC") {
      if (this.isHost) {
        this.broadcastState();
      }
    }
  }

  makeMove(action: CanvasAction): void {
    if (this.isHost) {
      if (action.type === "DRAW") this.handleDraw(action.payload);
      if (action.type === "CLEAR") this.handleClear();
    } else {
      this.sendAction(action);
    }
  }

  private handleDraw(stroke: DrawStroke) {
    if (!this.isHost) return;

    // Immutable update to ensure React Effect fires
    this.state.strokes = [...this.state.strokes, stroke];

    this.broadcastState();
    this.setState({ ...this.state });
  }

  private handleClear() {
    if (!this.isHost) return;

    this.state.strokes = [];

    this.broadcastState();
    this.setState({ ...this.state });
  }

  // Public methods
  public draw(stroke: DrawStroke) {
    const action: CanvasAction = {
      type: "DRAW",
      payload: stroke,
    };
    this.makeMove(action);
  }

  public clear() {
    const action: CanvasAction = {
      type: "CLEAR",
    };
    this.makeMove(action);
  }

  public requestSync() {
    const action: CanvasAction = {
      type: "REQUEST_SYNC",
    };
    if (this.isHost) {
      this.broadcastState();
    } else {
      this.sendAction(action);
    }
  }

  checkGameEnd(): GameResult | null {
    return null;
  }

  reset(): void {
    this.handleClear();
  }

  updatePlayers(_players: { id: string; username: string }[]): void {}
}
