import type { Cell } from "./MazeGenerator";
import type { Direction } from "../types";

export class MazeUtils {
  static canMove(
    grid: Cell[][],
    stateConfig: { rows: number; cols: number },
    x: number,
    y: number,
    dir: Direction,
  ): boolean {
    if (
      x < 0 ||
      y < 0 ||
      x >= stateConfig.cols ||
      y >= stateConfig.rows ||
      !grid[y] ||
      !grid[y][x]
    )
      return false;

    const cell = grid[y][x];
    const { rows, cols } = stateConfig;

    switch (dir) {
      case "UP":
        return !cell.walls.top && y > 0;
      case "DOWN":
        return !cell.walls.bottom && y < rows - 1;
      case "LEFT":
        return !cell.walls.left && x > 0;
      case "RIGHT":
        return !cell.walls.right && x < cols - 1;
    }
    return false;
  }

  static getOppositeDir(dir: Direction): Direction {
    switch (dir) {
      case "UP":
        return "DOWN";
      case "DOWN":
        return "UP";
      case "LEFT":
        return "RIGHT";
      case "RIGHT":
        return "LEFT";
    }
  }

  static getDirDelta(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
      case "UP":
        return { dx: 0, dy: -1 };
      case "DOWN":
        return { dx: 0, dy: 1 };
      case "LEFT":
        return { dx: -1, dy: 0 };
      case "RIGHT":
        return { dx: 1, dy: 0 };
    }
  }

  static getAvailableExits(
    grid: Cell[][],
    stateConfig: { rows: number; cols: number },
    x: number,
    y: number,
    incomingDir: Direction,
  ): Direction[] {
    const exits: Direction[] = [];
    const oppositeDir = this.getOppositeDir(incomingDir);

    if (this.canMove(grid, stateConfig, x, y, "UP") && "UP" !== oppositeDir)
      exits.push("UP");
    if (this.canMove(grid, stateConfig, x, y, "DOWN") && "DOWN" !== oppositeDir)
      exits.push("DOWN");
    if (this.canMove(grid, stateConfig, x, y, "LEFT") && "LEFT" !== oppositeDir)
      exits.push("LEFT");
    if (
      this.canMove(grid, stateConfig, x, y, "RIGHT") &&
      "RIGHT" !== oppositeDir
    )
      exits.push("RIGHT");

    return exits;
  }

  static getMazePath(
    grid: Cell[][],
    stateConfig: { rows: number; cols: number },
    startX: number,
    startY: number,
    direction: Direction,
  ): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let x = startX;
    let y = startY;
    let currentDir = direction;

    // 1. Validate Initial Move
    if (!this.canMove(grid, stateConfig, x, y, currentDir)) return path;

    const MAX_MOVES = stateConfig.rows * stateConfig.cols; // Safety break
    let moves = 0;

    while (moves < MAX_MOVES) {
      // Move one step
      const { dx, dy } = this.getDirDelta(currentDir);
      x += dx;
      y += dy;
      moves++;

      path.push({ x, y });

      // Check Portal - Stop here if it's a portal (manual activation)
      if (grid[y][x].portalTo) {
        break;
      }

      // Check Win (Stop at exit)
      if (x === stateConfig.cols - 1 && y === stateConfig.rows - 1) {
        break;
      }

      // Scan for exits (excluding where we came from)
      const possibleExits = this.getAvailableExits(
        grid,
        stateConfig,
        x,
        y,
        currentDir,
      );

      if (possibleExits.length === 1) {
        // Only one way forward (Corner or Corridor) -> Auto turn/continue
        currentDir = possibleExits[0];
      } else {
        // Dead End (0) or Intersection (>1) -> Stop here
        break;
      }
    }

    return path;
  }
}
