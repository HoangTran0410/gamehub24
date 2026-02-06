import fs from "fs";
import path from "path";

interface GameStats {
  plays: Record<string, number>;
  dataTransfer: Record<string, number>;
}

export class StatsManager {
  private readonly STATS_FILE = path.resolve("data", "stats.json");
  private gameStats: GameStats = {
    plays: {},
    dataTransfer: {},
  };

  private stateChanged: boolean = false;

  constructor() {
    this.loadStats();
    setInterval(() => {
      if (this.stateChanged) {
        this.saveStats();
        this.stateChanged = false;
      }
    }, 30000); // Check every 30 seconds
  }

  private loadStats() {
    try {
      const dir = path.dirname(this.STATS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.STATS_FILE)) {
        const data = fs.readFileSync(this.STATS_FILE, "utf-8");
        this.gameStats = JSON.parse(data);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  private saveStats() {
    try {
      fs.writeFileSync(
        this.STATS_FILE,
        JSON.stringify(this.gameStats, null, 2),
      );
    } catch (error) {
      console.error("Error saving stats:", error);
    }
  }

  public trackPlay(gameType: string) {
    if (!gameType) return;
    this.gameStats.plays[gameType] = (this.gameStats.plays[gameType] || 0) + 1;
    this.stateChanged = true;
  }

  public trackDataTransfer(gameType: string, size: number) {
    if (!gameType) return;
    this.gameStats.dataTransfer[gameType] =
      (this.gameStats.dataTransfer[gameType] || 0) + size;
    this.stateChanged = true;
  }

  public getStats() {
    return this.gameStats;
  }
}

export const statsManager = new StatsManager();
