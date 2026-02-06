"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsManager = exports.StatsManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class StatsManager {
    constructor() {
        this.STATS_FILE = path_1.default.resolve("data", "stats.json");
        this.gameStats = {
            plays: {},
            dataTransfer: {},
        };
        this.stateChanged = false;
        this.loadStats();
        setInterval(() => {
            if (this.stateChanged) {
                this.saveStats();
                this.stateChanged = false;
            }
        }, 30000); // Check every 30 seconds
    }
    loadStats() {
        try {
            const dir = path_1.default.dirname(this.STATS_FILE);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            if (fs_1.default.existsSync(this.STATS_FILE)) {
                const data = fs_1.default.readFileSync(this.STATS_FILE, "utf-8");
                this.gameStats = JSON.parse(data);
            }
        }
        catch (error) {
            console.error("Error loading stats:", error);
        }
    }
    saveStats() {
        try {
            fs_1.default.writeFileSync(this.STATS_FILE, JSON.stringify(this.gameStats, null, 2));
        }
        catch (error) {
            console.error("Error saving stats:", error);
        }
    }
    trackPlay(gameType) {
        if (!gameType)
            return;
        this.gameStats.plays[gameType] = (this.gameStats.plays[gameType] || 0) + 1;
        this.stateChanged = true;
    }
    trackDataTransfer(gameType, size) {
        if (!gameType)
            return;
        this.gameStats.dataTransfer[gameType] =
            (this.gameStats.dataTransfer[gameType] || 0) + size;
        this.stateChanged = true;
    }
    getStats() {
        return this.gameStats;
    }
}
exports.StatsManager = StatsManager;
exports.statsManager = new StatsManager();
