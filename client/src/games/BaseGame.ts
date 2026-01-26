import { Socket } from "socket.io-client";
import { produce, setAutoFreeze } from "immer";
import { useRoomStore, type Player } from "../stores/roomStore";
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
  public roomId: string;
  public socket: Socket;
  public isHost: boolean;
  public userId: string;
  public players: Player[];

  private _state: T;
  private stateListeners: ((state: T) => void)[] = [];
  private updateScheduled: boolean = false;

  protected get state(): T {
    return this._state;
  }

  protected set state(state: T) {
    this.setState(state);
  }

  // Auto broadcast state to all guests
  // IMPORTANT: Only use for turn based games
  // Realtime game (state updates every frame) should use manual state sync
  public autoBroadcast: boolean = true;

  // Optimization: State syncing
  private lastSyncedState?: T;
  private lastSyncedHash?: string;
  private isOptimizationEnabled: boolean = true;
  private stateVersion: number = 0;

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
    this.players = players;

    const initState = this.getInitState();
    this._state = this.setState(initState);

    // Initialize sync tracking (Host only needs this, but safe to init)
    this.lastSyncedState = JSON.parse(JSON.stringify(this.state));
    this.lastSyncedHash = getHash(this.state);

    // All players listen for game actions
    this.socket.on("game:action", this.onSocketGameAction.bind(this));

    // Bind socket listeners
    if (!this.isHost) {
      // Clients listen for state updates from host
      this.socket.on("game:state", this.onSocketGameState.bind(this));
      this.socket.on(
        "game:state:patch",
        this.onSocketGameStatePatch.bind(this),
      );

      // Client request sync state from host
      this.requestSync();
    }

    // Listen for sync requests (Host)
    if (this.isHost) {
      this.socket.on("game:request_sync", this.onRequestSync.bind(this));
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

    console.log(players);
    this.syncStateInternal();
  }

  public setOptimization(enabled: boolean): void {
    this.isOptimizationEnabled = enabled;
    console.log(`State optimization ${enabled ? "enabled" : "disabled"}`);
  }

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

  protected scheduleUpdate(): void {
    if (!this.updateScheduled) {
      this.updateScheduled = true;
      queueMicrotask(() => {
        this.notifyListeners(this.state);
        if (this.autoBroadcast) {
          this.broadcastState();
        }
        this.updateScheduled = false;
      });
    }
  }

  private syncStateInternal(forceFull = false): void {
    this.notifyListeners(this.state);
    this.broadcastState(forceFull);
  }

  protected syncState(): void {
    // this.syncStateInternal();
    // turn off to test proxy
  }

  public setState(state: T): T {
    this._state =
      typeof state === "object" && state !== null
        ? (createGameProxy(state as object, () =>
            this.scheduleUpdate(),
          ) as unknown as T)
        : state;
    this.scheduleUpdate();

    return this._state;
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
    if (this.isHost) {
      const state = this.getState();
      const currentHash = getHash(state);

      // 1. Optimization: Skip if state hasn't changed (hash check)
      if (
        this.isOptimizationEnabled &&
        !forceFull &&
        this.lastSyncedHash === currentHash
      ) {
        return;
      }

      // Increment version before any update
      this.stateVersion++;

      // 2. Optimization: Send delta (patch) if possible
      if (this.isOptimizationEnabled && !forceFull && this.lastSyncedState) {
        const patch = getDiff(this.lastSyncedState, state);
        // Only send patch if it's not empty and safe to do so
        if (patch && Object.keys(patch).length > 0) {
          if (this.hasSomeoneElseInRoom()) {
            this.socket.emit("game:state:patch", {
              roomId: this.roomId,
              patch,
              version: this.stateVersion,
            });
          }
          this.updateLastSynced(state, currentHash);
          return;
        }
      }

      // 3. Fallback: Send full state
      // only emit if there are someone else in the room
      if (this.hasSomeoneElseInRoom()) {
        this.socket.emit("game:state", {
          roomId: this.roomId,
          state: { ...state },
          version: this.stateVersion,
        });
      }

      // Update tracking and Auto-save
      this.updateLastSynced(state, currentHash);
    }
  }

  private updateLastSynced(state: T, hash: string) {
    this.lastSyncedState = JSON.parse(JSON.stringify(state));
    this.lastSyncedHash = hash;
    this.saveStateToStorage();
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
      this.setState(data.state);
    }
  }

  // Client receives partial state update (patch)
  protected onSocketGameStatePatch(data: {
    patch: any;
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

      // Use immer to apply patch immutably
      const newState = produce(this.state, (draft: any) => {
        applyPatch(draft, data.patch);
      });

      // Update version
      if (typeof data.version === "number") {
        this.stateVersion = data.version;
      }

      this.setState(newState);
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
        this.socket.emit("game:state:direct", {
          roomId: this.roomId,
          targetUser: data.targetUser,
          targetSocketId: data.requesterSocketId,
          state: { ...state },
          version: this.stateVersion,
        });
      } else {
        // Fallback: Broadcast to everyone
        this.syncStateInternal(true);
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
  // Optional: Help GC
  // this.state = null as any;
  // this.lastSyncedState = undefined;
}

// --- Helper Functions ---

function getHash(obj: any): string {
  try {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  } catch (e) {
    return Date.now().toString(); // Fallback
  }
}

const DELETED_VALUE = "__$$DELETED$$__";

function getDiff(oldObj: any, newObj: any): any {
  if (oldObj === newObj) return undefined;
  if (oldObj === null || newObj === null) return newObj; // Handle null explicitly (typeof null === 'object')
  if (typeof oldObj !== typeof newObj) return newObj;
  if (typeof newObj !== "object") return newObj;

  const diff: any = {};
  let changed = false;

  // Check for keys in newObj (Updates & Adds)
  for (const key in newObj) {
    // If key not in oldObj, it's new
    if (!(key in oldObj)) {
      if (newObj[key] === undefined) continue;
      diff[key] = newObj[key];
      changed = true;
      continue;
    }

    // Recursive diff
    const changes = getDiff(oldObj[key], newObj[key]);
    if (changes !== undefined) {
      diff[key] = changes;
      changed = true;
    }
  }

  // Check for deleted keys
  for (const key in oldObj) {
    if (!(key in newObj)) {
      diff[key] = DELETED_VALUE;
      changed = true;
    }
  }

  // Handle Array length mismatch
  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    if (oldObj.length !== newObj.length) {
      diff.length = newObj.length;
      changed = true;
    }
  }

  return changed ? diff : undefined;
}

function applyPatch(draft: any, patch: any) {
  if (!patch || typeof patch !== "object") return;

  for (const key in patch) {
    const value = patch[key];

    if (value === DELETED_VALUE) {
      delete draft[key];
    } else if (
      draft[key] &&
      typeof draft[key] === "object" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      applyPatch(draft[key], value);
    } else {
      // Direct replacement (primitives, arrays, or object overwrites)
      draft[key] = value;
    }
  }
}
