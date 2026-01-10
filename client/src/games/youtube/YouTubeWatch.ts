import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import type { Socket } from "socket.io-client";

export interface YouTubeWatchState {
  videoId: string;
  isPlaying: boolean;
  timestamp: number;
  lastUpdate: number;
  allowGuestControl: boolean;
}

export interface YouTubeWatchAction extends GameAction {
  type: "SET_VIDEO" | "SYNC_STATE" | "REQUEST_SYNC" | "TOGGLE_GUEST_CONTROL";
  payload?: any;
}

export class YouTubeWatch extends BaseGame {
  private state: YouTubeWatchState;
  private onStateChange?: (state: YouTubeWatchState) => void;

  constructor(
    roomId: string,
    socket: Socket,
    isHost: boolean,
    userId: string,
    _players: { id: string; username: string }[]
  ) {
    super(roomId, socket, isHost, userId);

    this.state = {
      videoId: "",
      isPlaying: false,
      timestamp: 0,
      lastUpdate: Date.now(),
      allowGuestControl: false,
    };

    this.init();
  }

  init(): void {
    if (this.isHost) {
      this.broadcastState();
    }
  }

  onUpdate(callback: (state: YouTubeWatchState) => void): void {
    this.onStateChange = callback;
    // Immediately fire with current state
    callback(this.state);
  }

  getState(): YouTubeWatchState {
    return { ...this.state };
  }

  setState(state: YouTubeWatchState): void {
    this.state = state;
    this.onStateChange?.(this.state);
  }

  handleAction(data: { action: GameAction }): void {
    const action = data.action as YouTubeWatchAction;

    if (action.type === "SET_VIDEO") {
      this.handleSetVideo(action.payload);
    } else if (action.type === "SYNC_STATE") {
      // Only allow sync if Host or Guest Control is enabled
      // Note: Host calls handleSyncState directly in makeMove, so this path is for Remote Actions.
      // Remote Actions come from Clients.
      if (this.isHost) {
        // I am Host, receiving a request from a Client
        if (this.state.allowGuestControl) {
          this.handleSyncState(action.payload);
        }
        // Else ignore guest attempt
      }
    } else if (action.type === "REQUEST_SYNC") {
      if (this.isHost) {
        this.broadcastState();
      }
    } else if (action.type === "TOGGLE_GUEST_CONTROL") {
      if (this.isHost) {
        this.handleToggleGuestControl(action.payload);
      }
    }
  }

  makeMove(action: YouTubeWatchAction): void {
    if (this.isHost) {
      if (action.type === "SET_VIDEO") this.handleSetVideo(action.payload);
      if (action.type === "SYNC_STATE") this.handleSyncState(action.payload);
      if (action.type === "TOGGLE_GUEST_CONTROL")
        this.handleToggleGuestControl(action.payload);
    } else {
      this.sendAction(action);
    }
  }

  private handleSetVideo(videoId: string) {
    if (!this.isHost) return;
    this.state.videoId = videoId;
    this.state.isPlaying = true;
    this.state.timestamp = 0;
    this.state.lastUpdate = Date.now();

    this.broadcastState();
    this.setState({ ...this.state });
  }

  private handleSyncState(payload: { isPlaying: boolean; timestamp: number }) {
    if (!this.isHost) return;

    this.state.isPlaying = payload.isPlaying;
    this.state.timestamp = payload.timestamp;
    this.state.lastUpdate = Date.now();

    this.broadcastState();
    this.setState({ ...this.state });
  }

  private handleToggleGuestControl(allow: boolean) {
    if (!this.isHost) return;
    this.state.allowGuestControl = allow;
    this.broadcastState();
    this.setState({ ...this.state });
  }

  // Public methods

  public setVideo(urlOrId: string) {
    const videoId = this.extractVideoId(urlOrId);
    if (!videoId) return;

    const action: YouTubeWatchAction = {
      type: "SET_VIDEO",
      payload: videoId,
    };
    this.makeMove(action);
  }

  public sync(isPlaying: boolean, timestamp: number) {
    const action: YouTubeWatchAction = {
      type: "SYNC_STATE",
      payload: { isPlaying, timestamp },
    };
    this.makeMove(action);
  }

  public requestSync() {
    const action: YouTubeWatchAction = {
      type: "REQUEST_SYNC",
    };
    if (this.isHost) {
      this.broadcastState();
    } else {
      this.sendAction(action);
    }
  }

  public toggleGuestControl(allow: boolean) {
    const action: YouTubeWatchAction = {
      type: "TOGGLE_GUEST_CONTROL",
      payload: allow,
    };
    this.makeMove(action);
  }

  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  checkGameEnd(): GameResult | null {
    return null;
  }

  reset(): void {
    this.state = {
      videoId: "",
      isPlaying: false,
      timestamp: 0,
      lastUpdate: Date.now(),
      allowGuestControl: false,
    };
    this.broadcastState();
    this.setState({ ...this.state });
  }

  updatePlayers(_players: { id: string; username: string }[]): void {}
}
