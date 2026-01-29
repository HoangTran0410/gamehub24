import { Socket } from "socket.io-client";
import { produce, setAutoFreeze } from "immer";
import { useRoomStore, type Player, type Room } from "../stores/roomStore";
import { createGameProxy } from "./stateProxy";

// Disable auto-freezing to allow mutable state in games
setAutoFreeze(false);

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
  public room: Room;
  public roomId: string;
  public socket: Socket;
  public isHost: boolean;
  public userId: string;
  public players: Player[];

  private _state: T;
  private stateListeners: ((state: T) => void)[] = [];
  private updateScheduled: boolean = false;

  public get state(): T {
    return this._state;
  }

  protected set state(state: T) {
    this.setState(state);
  }

  // Auto broadcast state to all guests
  // IMPORTANT: Only use for turn based games
  // Realtime game (state updates every frame) should use manual state sync
  protected autoBroadcast: boolean = true;

  // Optimization: State syncing
  private stateVersion: number = 0;
  private pendingPatches: Array<{ path: string[]; value: any }> = [];
  private hasPendingPatch: boolean = false;
  private lastSnapshot: T | null = null;

  constructor(room: Room, socket: Socket, isHost: boolean, userId: string) {
    this.room = room;
    this.roomId = room.id;
    this.players = room.players;
    this.socket = socket;
    this.isHost = isHost;
    this.userId = userId;

    // Initialize state
    const initState = this.getInitState();
    this._state = this.setState(initState);

    // All players listen for game actions
    this.socket.on("game:action", this.onSocketGameAction.bind(this));

    // Listen for sync requests (Host)
    if (this.isHost) {
      this.socket.on("game:request_sync", this.onRequestSync.bind(this));
    }

    // Bind socket listeners
    if (!this.isHost) {
      // Clients listen for state updates from host
      this.socket.on("game:state", this.onSocketGameState.bind(this));
      this.socket.on(
        "game:state:patch",
        this.onSocketGameStatePatch.bind(this),
      );

      // Client request sync state from host
      queueMicrotask(() => {
        this.requestSync();
      });
    }

    this.init();
  }

  protected init(): void {
    // host broadcast initial state
    // if (this.isHost) {
    //   this.broadcastState();
    // }
  }

  // Abstract methods that must be implemented by each game
  abstract getInitState(): T;
  abstract onSocketGameAction(data: { action: GameAction }): void;

  public makeAction(action: GameAction) {
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      this.sendSocketGameAction(action);
    }
  }

  public updatePlayers(players: Player[]) {
    this.players = players;

    this.syncState(false);
  }

  // Game persistent state name (e.g. "tictactoe")
  protected gameName: string = "unknown";
  public setGameName(name: string): void {
    this.gameName = name;
  }

  private getState(): T {
    if (!this.state) {
      throw new Error("Game state is not initialized");
    }
    return this.state;
  }

  public onStateUpdate(state: T): void {
    const isFullUpdate =
      !this.lastSnapshot ||
      !this.hasPendingPatch ||
      (this.hasPendingPatch && this.pendingPatches.length === 0);

    if (isFullUpdate) {
      // Deep clone for initial snapshot or when root state is replaced
      this.lastSnapshot = JSON.parse(JSON.stringify(state));
    } else {
      // Incrementally update the snapshot immutably using Immer
      this.lastSnapshot = produce(this.lastSnapshot, (draft: any) => {
        for (const { path, value } of this.pendingPatches) {
          applyMutation(draft, path, value);
        }
      });
    }

    this.stateListeners.forEach((listener) => listener(this.lastSnapshot!));
  }

  public get snapshot(): T {
    return this.lastSnapshot || (this.state as T);
  }

  private scheduleUpdate(): void {
    if (!this.updateScheduled) {
      this.updateScheduled = true;
      queueMicrotask(() => {
        this.onStateUpdate(this.state);
        if (this.isHost && this.autoBroadcast) {
          this.broadcastState();
        } else {
          this.updateLastSynced();
        }
        this.updateScheduled = false;
      });
    }
  }

  protected syncState(forceFull = true): void {
    if (forceFull) {
      this.lastSnapshot = null; // Force fresh snapshot
    }
    this.onStateUpdate(this.state);
    this.broadcastState(forceFull);
  }

  public setState(state: T): T {
    this._state =
      typeof state === "object" && state !== null
        ? (createGameProxy(state as object, (path, newValue) => {
            this.recordPatch(path, newValue);
            this.scheduleUpdate();
          }) as unknown as T)
        : state;

    this.hasPendingPatch = true;
    this.pendingPatches = []; // Clear any old patches as we have a new root state
    this.scheduleUpdate();

    return this._state;
  }

  private recordPatch(path: string[], value: any) {
    this.hasPendingPatch = true;
    this.pendingPatches.push({
      path,
      value: value === undefined ? DELETED_VALUE : value,
    });
  }

  public onUpdate(callback: (state: T) => void): () => void {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter(
        (listener) => listener !== callback,
      );
    };
  }

  protected hasSomeoneElseInRoom(): boolean {
    const room = useRoomStore.getState().currentRoom;
    const userCount =
      (room?.spectators?.length || 0) + (room?.players?.length || 0);
    return userCount > 1;
  }

  // host broadcast state to all guests
  public broadcastState(forceFull = false): void {
    if (!this.isHost) return;

    // 1. Optimization: Skip if state hasn't changed
    if (!forceFull && !this.hasPendingPatch) return;

    // Increment version before any update
    this.stateVersion++;

    const hasSomeone = this.hasSomeoneElseInRoom();
    if (!hasSomeone) return;

    console.log(this.pendingPatches);

    // 2. Optimization: Send accumulated patch if possible
    if (!forceFull && this.hasPendingPatch && this.pendingPatches.length > 0) {
      // Compact patches to object
      const pathesObject = this.pendingPatches.reduce(
        (acc, patch) => {
          acc[patch.path.join(".")] = patch.value;
          return acc;
        },
        {} as Record<string, any>,
      );

      this.socket.emit("game:state:patch", {
        roomId: this.roomId,
        patch: pathesObject,
        version: this.stateVersion,
      });
    }
    // 3. Fallback: Send full state
    // only emit if there are someone else in the room
    else {
      const state = this.getState();
      console.log("send full state", state);
      this.socket.emit("game:state", {
        roomId: this.roomId,
        state: { ...state },
        version: this.stateVersion,
      });
    }

    this.updateLastSynced();
  }

  private updateLastSynced() {
    this.pendingPatches = [];
    this.hasPendingPatch = false;
    if (this.isHost) this.saveStateToStorage();
  }

  public requestSync(): void {
    this.socket.emit("game:request_sync", { roomId: this.roomId });
  }

  // Send action to all players (including self via server relay)
  protected sendSocketGameAction(action: GameAction): void {
    if (this.hasSomeoneElseInRoom()) {
      this.socket.emit("game:action", {
        roomId: this.roomId,
        action,
      });
    } else {
      this.onSocketGameAction({ action });
    }
  }

  // Client receives state update from host
  protected onSocketGameState(data: {
    state: T;
    version?: number;
    roomId?: string;
  }): void {
    // is guest and room id match
    if (!this.isHost && (!data.roomId || data.roomId === this.roomId)) {
      // Full state always accepted. Update version.
      if (typeof data.version === "number") {
        console.log("updated state version", this.stateVersion, data.version);
        this.stateVersion = data.version;
      }

      console.log("onSocketGameState", data.state);
      this.setState(data.state);
    }
  }

  protected onSocketGameStatePatch(data: {
    patch: any[];
    version?: number;
  }): void {
    if (!this.isHost) {
      // Integrity Check
      if (
        typeof data.version === "number" &&
        data.version !== this.stateVersion + 1
      ) {
        console.warn(
          `Packet loss detected! Expected version ${this.stateVersion + 1} but got ${data.version}. Requesting sync...`,
          data,
        );
        this.requestSync();
        return;
      }

      console.log("onSocketGameStatePatch", data.patch);

      // Apply mutations directly to the Proxy state
      // This triggers recordPatch and onStateUpdate to update the snapshot
      // De-compact patches
      for (const [path, value] of Object.entries(data.patch)) {
        applyMutation(this.state, path.split("."), value);
      }

      // Update version
      if (typeof data.version === "number") {
        this.stateVersion = data.version;
      }
    }
  }

  // Host receives sync request
  protected onRequestSync(data: {
    requesterSocketId?: string;
    targetUser?: string;
  }): void {
    if (this.isHost) {
      if (data.requesterSocketId) {
        // Optimization: Send state ONLY to the requester
        const state = this.getState();
        console.log("onRequestSync -> send state", state);
        this.socket.emit("game:state:direct", {
          roomId: this.roomId,
          targetUser: data.targetUser,
          targetSocketId: data.requesterSocketId,
          state: { ...state },
          version: this.stateVersion,
        });
      } else {
        // Fallback: Broadcast to everyone
        this.syncState(true);
      }
    }
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
    this.socket.off("game:state:patch");
    this.socket.off("game:action");
    if (this.isHost) {
      this.socket.off("game:request_sync");
    }
    // Clean up local listeners to prevent memory leaks or calling on unmounted components
    this.stateListeners.length = 0;
  }
}

// --- Helper Functions ---

const DELETED_VALUE = "__$$DELETED$$__";

function applyMutation(target: any, path: string[], value: any) {
  if (!path || path.length === 0) return;
  let current = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (
      !(key in current) ||
      current[key] === null ||
      typeof current[key] !== "object"
    ) {
      current[key] = {};
    }
    current = current[key];
  }
  const lastKey = path[path.length - 1];
  if (value === DELETED_VALUE) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }
}
