export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 0xffffffff;
    return this.seed / 0xffffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export interface Cell {
  x: number;
  y: number;
  walls: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
  visited: boolean;
  portalTo?: { x: number; y: number; color: string };
}

export class MazeGenerator {
  public grid: Cell[][] = [];
  private random: SeededRandom;
  private rows: number;
  private cols: number;

  constructor(rows: number, cols: number, seed: number) {
    this.rows = rows;
    this.cols = cols;
    this.random = new SeededRandom(seed);
    this.initGrid();
  }

  private initGrid() {
    this.grid = Array.from({ length: this.rows }, (_, y) =>
      Array.from(
        { length: this.cols },
        (_, x): Cell => ({
          x,
          y,
          walls: { top: true, right: true, bottom: true, left: true },
          visited: false,
        }),
      ),
    );
  }

  generate(): Cell[][] {
    this.generateDFS();
    this.addLoops(0.03); // 3% loop chance
    this.addPortals(2); // Add 2 pairs of portals
    this.resetVisited();
    return this.grid;
  }

  private addPortals(pairs: number) {
    const portalColors = ["#f472b6", "#a78bfa", "#34d399", "#fbbf24"];

    for (let i = 0; i < pairs; i++) {
      const color = portalColors[i % portalColors.length];

      let p1: Cell | null = null;
      let p2: Cell | null = null;

      // Find first random cell
      let attempts = 0;
      while (!p1 && attempts < 100) {
        const rx = this.random.nextInt(0, this.cols - 1);
        const ry = this.random.nextInt(0, this.rows - 1);

        // Avoid Start (0,0) and End (cols-1, rows-1)
        const isStart = rx === 0 && ry === 0;
        const isEnd = rx === this.cols - 1 && ry === this.rows - 1;

        if (!isStart && !isEnd && !this.grid[ry][rx].portalTo) {
          p1 = this.grid[ry][rx];
        }
        attempts++;
      }

      // Find second random cell
      attempts = 0;
      while (!p2 && attempts < 100) {
        const rx = this.random.nextInt(0, this.cols - 1);
        const ry = this.random.nextInt(0, this.rows - 1);

        // Avoid Start, End, and p1
        const isStart = rx === 0 && ry === 0;
        const isEnd = rx === this.cols - 1 && ry === this.rows - 1;
        const isP1 = p1 && rx === p1.x && ry === p1.y;

        if (!isStart && !isEnd && !isP1 && !this.grid[ry][rx].portalTo) {
          p2 = this.grid[ry][rx];
        }
        attempts++;
      }

      if (p1 && p2) {
        p1.portalTo = { x: p2.x, y: p2.y, color };
        p2.portalTo = { x: p1.x, y: p1.y, color };
      }
    }
  }

  // ===== DFS ITERATIVE (NO RECURSION) =====
  private generateDFS() {
    const stack: Cell[] = [];
    const start = this.grid[0][0];
    start.visited = true;
    stack.push(start);

    while (stack.length) {
      const cell = stack[stack.length - 1];
      const neighbors = this.getUnvisitedNeighbors(cell);

      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }

      const next = neighbors[this.random.nextInt(0, neighbors.length - 1)];
      this.removeWalls(cell, next);
      next.visited = true;
      stack.push(next);
    }
  }

  private getUnvisitedNeighbors(cell: Cell): Cell[] {
    const { x, y } = cell;
    const neighbors: Cell[] = [];

    if (y > 0 && !this.grid[y - 1][x].visited)
      neighbors.push(this.grid[y - 1][x]);
    if (x < this.cols - 1 && !this.grid[y][x + 1].visited)
      neighbors.push(this.grid[y][x + 1]);
    if (y < this.rows - 1 && !this.grid[y + 1][x].visited)
      neighbors.push(this.grid[y + 1][x]);
    if (x > 0 && !this.grid[y][x - 1].visited)
      neighbors.push(this.grid[y][x - 1]);

    return this.random.shuffle(neighbors);
  }

  private removeWalls(a: Cell, b: Cell) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (dx === 1) {
      a.walls.right = false;
      b.walls.left = false;
    } else if (dx === -1) {
      a.walls.left = false;
      b.walls.right = false;
    }

    if (dy === 1) {
      a.walls.bottom = false;
      b.walls.top = false;
    } else if (dy === -1) {
      a.walls.top = false;
      b.walls.bottom = false;
    }
  }

  // ===== ADD LOOPS (CONTROLLED) =====
  private addLoops(chance: number) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cell = this.grid[y][x];

        if (
          x < this.cols - 1 &&
          cell.walls.right &&
          this.random.next() < chance
        ) {
          this.removeWalls(cell, this.grid[y][x + 1]);
        }

        if (
          y < this.rows - 1 &&
          cell.walls.bottom &&
          this.random.next() < chance
        ) {
          this.removeWalls(cell, this.grid[y + 1][x]);
        }
      }
    }
  }

  private resetVisited() {
    for (const row of this.grid) {
      for (const cell of row) {
        cell.visited = false;
      }
    }
  }
}
