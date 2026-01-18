import { Socket } from "socket.io-client";
import type { Player } from "../stores/roomStore";

export interface GameAction {
  // type: string;
  [key: string]: any;
}

export interface GameResult {
  winner?: string;
  isDraw?: boolean;
  [key: string]: any;
}

export abstract class BaseGame<T> {
  protected roomId: string;
  protected socket: Socket;
  protected isHost: boolean;
  protected userId: string;
  protected players: Player[];
  protected state: T;
  protected stateListeners: ((state: T) => void)[] = [];

  constructor(
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    players: Player[] = [],
  ) {
    this.roomId = roomId;
    this.socket = socket;
    this.isHost = isHost;
    this.userId = userId;
    this.players = players;
    this.state = this.getInitState();

    // Bind socket listeners
    if (!this.isHost) {
      // Clients listen for state updates from host
      this.socket.on("game:state", this.handleStateSync.bind(this));
    }

    // All players listen for game actions
    this.socket.on("game:action", this.handleAction.bind(this));

    this.init();
  }

  protected init(): void {
    // host broadcast initial state
    // if (this.isHost) {
    //   this.broadcastState();
    // }
  }

  public get isHostUser(): boolean {
    return this.isHost;
  }

  public get getRoomId(): string {
    return this.roomId;
  }

  // Abstract methods that must be implemented by each game
  abstract getInitState(): T;
  abstract handleAction(data: { action: GameAction }): void;
  abstract makeMove(action: GameAction): void;
  abstract checkGameEnd(): GameResult | null;
  abstract reset(): void;
  abstract updatePlayers(players: { id: string; username: string }[]): void;

  // Game persistent state name (e.g. "tictactoe")
  protected gameName: string = "unknown";
  public setGameName(name: string): void {
    this.gameName = name;
  }

  public getState(): T {
    if (!this.state) {
      throw new Error("Game state is not initialized");
    }
    return this.state;
  }

  public notifyListeners(state: T): void {
    this.stateListeners.forEach((listener) => listener({ ...state }));
  }

  public syncState(): void {
    this.notifyListeners(this.state);
    this.broadcastState();
  }

  public setState(state: T): void {
    this.state = state;
    this.notifyListeners(state);
    this.broadcastState(); // TODO: check if this is needed
  }

  public onUpdate(callback: (state: T) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter(
        (listener) => listener !== callback,
      );
    };
  }

  // host broadcast state to all guests
  public broadcastState(): void {
    if (this.isHost) {
      const state = this.getState();
      this.socket.emit("game:state", {
        roomId: this.roomId,
        state: { ...state },
      });

      // Auto-save state to localStorage
      this.saveStateToStorage();
    }
  }

  // Send action to all players (including self via server relay)
  protected sendAction(action: GameAction): void {
    this.socket.emit("game:action", {
      roomId: this.roomId,
      action,
    });
  }

  // Client receives state update from host
  protected handleStateSync(data: { state: T }): void {
    if (!this.isHost) {
      this.setState(data.state);
    }
  }

  // Broadcast game end
  protected broadcastGameEnd(result: GameResult): void {
    this.socket.emit("game:end", {
      roomId: this.roomId,
      result,
    });

    // Clear saved state on game end
    this.clearSavedState();
  }

  // Persist state to localStorage (Host only)
  protected saveStateToStorage(): void {
    if (this.isHost && this.gameName !== "unknown") {
      try {
        const key = `saved_game_${this.gameName}`;
        const payload = {
          state: this.getState(),
          timestamp: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (e) {
        console.error("Failed to save game state:", e);
      }
    }
  }

  // Clear saved state (Host only)
  protected clearSavedState(): void {
    if (this.isHost && this.gameName !== "unknown") {
      try {
        localStorage.removeItem(`saved_game_${this.gameName}`);
      } catch (e) {
        console.error("Failed to clear game state:", e);
      }
    }
  }

  // Cleanup socket listeners
  destroy(): void {
    this.socket.off("game:state");
    this.socket.off("game:action");
  }
}
