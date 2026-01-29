import { BaseGame, type GameAction } from "../BaseGame";
import type { MazeState, MazeAction, Direction, PlayerState } from "./types";
import { MazeGenerator, type Cell } from "./utils/MazeGenerator";
import { MazeUtils } from "./utils/MazeUtils";

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { rows: number; cols: number }
> = {
  EASY: { rows: 10, cols: 10 },
  MEDIUM: { rows: 20, cols: 20 },
  HARD: { rows: 30, cols: 30 },
};

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export default class Maze extends BaseGame<MazeState> {
  // Cache the maze grid to avoid regenerating it constantly
  // The grid is deterministic based on seed + config
  private mazeGrid: Cell[][] | null = null;
  private seed: number | null = null;

  constructor(room: any, socket: any, isHost: boolean, userId: string) {
    super(room, socket, isHost, userId);
    this.setGameName("maze");
  }

  getInitState(): MazeState {
    return {
      config: {
        rows: 10,
        cols: 10,
        difficulty: "EASY",
      },
      level: 1,
      seed: this.isHost ? Math.floor(Math.random() * 1000000) : null,
      status: "WAITING",
      players: {
        [this.players[0].id]: {
          ...this.players[0],
          x: 0,
          y: 0,
          color: this.getPlayerColor(this.players[0].username),
        },
      },
      winners: [],
    };
  }

  public onStateUpdate(
    state: MazeState,
    prop?: string | symbol | null,
    newValue?: MazeState | undefined,
    oldValue?: MazeState | undefined,
  ): void {
    super.onStateUpdate(state, prop, newValue, oldValue);

    // reset maze if seed changed
    if (state.seed != this.seed) {
      this.mazeGrid = null;
    }
  }

  // Helper to ensure maze grid exists and matches current state
  public getMazeGrid(): Cell[][] | null {
    if (!this.mazeGrid && this.state.seed) {
      const { rows, cols } = this.state.config;
      const generator = new MazeGenerator(rows, cols, this.state.seed);
      this.mazeGrid = generator.generate();
      this.seed = this.state.seed;
    }
    return this.mazeGrid ?? null;
  }

  onSocketGameAction(data: { action: GameAction }): void {
    if (!this.isHost) return;

    const action = data.action as MazeAction & { playerId?: string }; // Allow optional playerId

    switch (action.type) {
      case "MOVE":
        if (action.direction && action.playerId) {
          this.handleMove({
            type: "MOVE",
            direction: action.direction,
            playerId: action.playerId,
          });
        }
        break;

      case "TELEPORT":
        if (action.playerId) {
          this.handleTeleport(action.playerId);
        }
        break;

      case "START_GAME":
        this.state.status = "PLAYING";
        this.state.startTime = Date.now();
        this.resetPlayers();

        break;

      case "NEXT_LEVEL":
        this.nextLevel();
        break;

      case "RESET_GAME":
        this.resetGame();
        break;

      case "UPDATE_SETTINGS":
        if (
          action.difficulty &&
          ["EASY", "MEDIUM", "HARD"].includes(action.difficulty)
        ) {
          const config = DIFFICULTY_CONFIG[action.difficulty];
          if (config) {
            this.state.config = {
              ...this.state.config,
              ...config,
              difficulty: action.difficulty,
            };
            this.state.seed = Math.floor(Math.random() * 1000000);
            this.mazeGrid = null; // Clear cache to force regenerate
          }
        }
        break;
    }
  }

  // Override to handle player updates
  updatePlayers(players: any[]) {
    super.updatePlayers(players);

    // Sync players map
    const newPlayersMap: Record<string, PlayerState> = {};
    players.forEach((p) => {
      // Preserve existing state if possible
      if (this.state.players[p.id]) {
        newPlayersMap[p.id] = this.state.players[p.id];
      } else {
        // New player
        newPlayersMap[p.id] = {
          isHost: false,

          id: p.id,
          username: p.username,
          x: 0,
          y: 0,
          color: this.getPlayerColor(p.username),
        };
      }
    });
    this.state.players = newPlayersMap;
  }

  private handleMove(action: {
    type: "MOVE";
    direction: Direction;
    playerId: string;
  }) {
    if (this.state.status !== "PLAYING") return;

    const player = this.state.players[action.playerId];
    if (!player || this.state.winners.includes(player.id)) return; // Ignore if finished

    // Ignore if already moving (locked by timestamp)
    if (player.moveEnd && Date.now() < player.moveEnd) return;

    const { x, y } = player;
    const currentDir = action.direction;
    const grid = this.getMazeGrid();
    if (!grid) return;

    // 1. Calculate Path
    const path = MazeUtils.getMazePath(
      grid,
      this.state.config,
      x,
      y,
      currentDir,
    );

    if (path.length === 0) return; // Cannot move

    const destination = path[path.length - 1];

    // 2. Set Movement State Immediately
    const CELLS_PER_SECOND = 10; // Speed
    const duration = (path.length / CELLS_PER_SECOND) * 1000;

    // Update position immediately to the destination
    player.x = destination.x;
    player.y = destination.y;

    // Set animation metadata
    player.currentPath = [{ x, y }, ...path]; // Path includes start and destination
    player.moveStart = Date.now();
    player.moveEnd = Date.now() + duration;

    // 3. Check Condition Immediately
    if (
      destination.x === this.state.config.cols - 1 &&
      destination.y === this.state.config.rows - 1
    ) {
      this.finishPlayer(player, destination.x, destination.y);
    }
  }

  private finishPlayer(player: PlayerState, x: number, y: number) {
    player.x = x;
    player.y = y;
    // player.finishedRank = this.state.winners.length + 1;
    this.state.winners.push(player.id);

    const allFinished = Object.keys(this.state.players).every((id) =>
      this.state.winners.includes(id),
    );
    if (allFinished) {
      this.state.status = "FINISHED";
    }
  }

  private handleTeleport(playerId: string) {
    if (this.state.status !== "PLAYING") return;
    const player = this.state.players[playerId];
    if (!player) return;

    // Ignore if already moving
    if (player.moveEnd && Date.now() < player.moveEnd) return;

    const grid = this.getMazeGrid();
    if (!grid) return;
    const cell = grid[player.y][player.x];

    if (cell.portalTo) {
      const dest = cell.portalTo;

      // Teleport
      player.x = dest.x;
      player.y = dest.y;

      // Small delay/animation metadata if needed, but instant is fine for now
      // Since it's a teleport, we can just update x/y.
      // Current path is cleared to stop any previous movement visualization
      player.currentPath = undefined;
      player.moveStart = undefined;
      player.moveEnd = undefined;
    }
  }

  private nextLevel() {
    this.state.level++;

    // Increase difficulty logic
    // Every 3 levels, increase size
    const levelStep = 3;
    const difficultyKeys: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
    const diffIndex = Math.min(
      Math.floor((this.state.level - 1) / levelStep),
      difficultyKeys.length - 1,
    );
    const difficulty = difficultyKeys[diffIndex];

    this.state.config = {
      ...DIFFICULTY_CONFIG[difficulty],
      difficulty,
    };

    // Add some organic growth for higher levels beyond HARD default?
    // if (this.state.level > 6) {
    //   this.state.config.rows += 5;
    //   this.state.config.cols += 5;
    // }

    this.state.seed = Math.floor(Math.random() * 1000000);
    this.state.winners = [];
    this.state.status = "WAITING"; // Auto start next level? or WAITING? Let's auto start for flow
    this.state.startTime = Date.now();

    this.mazeGrid = null; // Invalidate cache
    this.resetPlayers();
  }

  private resetGame() {
    this.state.level = 1;
    this.state.config = { ...DIFFICULTY_CONFIG.EASY, difficulty: "EASY" };
    this.state.seed = Math.floor(Math.random() * 1000000);
    this.state.winners = [];
    this.state.status = "WAITING";
    this.mazeGrid = null;
    this.resetPlayers();
  }

  private resetPlayers() {
    Object.values(this.state.players).forEach((p) => {
      p.x = 0;
      p.y = 0;
      // p.finishedRank = undefined;
      p.currentPath = undefined;
      p.moveStart = undefined;
      p.moveEnd = undefined;
    });
  }

  private getPlayerColor(id: string): string {
    // Simple hash to color
    const colors = [
      "#ef4444",
      "#3b82f6",
      "#22c55e",
      "#eab308",
      "#a855f7",
      "#ec4899",
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const res = colors[Math.abs(hash) % colors.length];
    console.log(id, res);
    return res;
  }
}
