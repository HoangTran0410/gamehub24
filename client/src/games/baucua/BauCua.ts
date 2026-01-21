import { BaseGame, type GameAction } from "../BaseGame";
import type {
  BauCuaState,
  BauCuaAction,
  BauCuaSymbol,
  PlayerBalance,
  PowerUpType,
  PowerUp,
} from "./types";
import {
  INITIAL_BALANCE,
  ALL_SYMBOLS,
  POWERUP_CONFIG,
  MIN_BET,
  MAX_BET,
  JACKPOT_PERCENTAGE,
  MEGA_ROUND_INTERVAL,
} from "./types";
import type { Player } from "../../stores/roomStore";

export default class BauCua extends BaseGame<BauCuaState> {
  private botMoveTimeout: ReturnType<typeof setTimeout> | null = null;

  getInitState(): BauCuaState {
    const playerBalances: Record<string, PlayerBalance> = {};
    const playerPowerUps: BauCuaState["playerPowerUps"] = {};

    // Initialize balances for existing players
    this.players.forEach((player) => {
      playerBalances[player.id] = {
        playerId: player.id,
        username: player.username,
        currentBalance: INITIAL_BALANCE,
        balanceHistory: [INITIAL_BALANCE],
        totalBet: 0,
        isBot: player.isBot || false,
      };
      playerPowerUps[player.id] = this.initializePowerUps();
    });

    return {
      gamePhase: "waiting",
      playerBalances,
      currentBets: {},
      diceRoll: null,
      currentRound: 0,
      playersReady: {},
      winner: null,
      playerPowerUps,
      activePowerUps: {},
      powerUpPredictions: {},
      recentRolls: [],
      isMegaRound: false,
      jackpotPool: 0,
    };
  }

  // Initialize power-ups for a player
  private initializePowerUps(): {
    double_down: PowerUp;
    insurance: PowerUp;
    reveal_one: PowerUp;
  } {
    return {
      double_down: { type: "double_down", cooldown: 0, lastUsedRound: -1 },
      insurance: { type: "insurance", cooldown: 0, lastUsedRound: -1 },
      reveal_one: { type: "reveal_one", cooldown: 0, lastUsedRound: -1 },
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as BauCuaAction;

    // Only host processes actions
    if (!this.isHost) return;

    switch (action.type) {
      case "PLACE_BET":
        this.handlePlaceBet(action.playerId, action.symbol, action.amount);
        break;
      case "CLEAR_BETS":
        this.handleClearBets(action.playerId);
        break;
      case "SYNC_BETS":
        this.handleSyncBets(action.playerId, action.bets);
        break;
      case "TOGGLE_READY":
        this.handleToggleReady(action.playerId);
        break;
      case "ROLL_DICE":
        this.handleRollDice();
        break;
      case "START_NEW_ROUND":
        this.handleStartNewRound();
        break;
      case "RESET_GAME":
        this.handleResetGame();
        break;
      case "ADD_BOT":
        this.handleAddBot();
        break;
      case "REMOVE_BOT":
        this.handleRemoveBot(action.playerId);
        break;
      case "ACTIVATE_POWERUP":
        this.handleActivatePowerUp(action.playerId, action.powerUpType);
        break;
      case "DEACTIVATE_POWERUP":
        this.handleDeactivatePowerUp(action.playerId);
        break;
    }
  }

  // Handle placing a bet
  private handlePlaceBet(
    playerId: string,
    symbol: BauCuaSymbol,
    amount: number,
  ): void {
    if (this.state.gamePhase !== "betting") return;

    const playerBalance = this.state.playerBalances[playerId];
    if (!playerBalance) return;

    // Get current total bet
    const currentBets = this.state.currentBets[playerId] || [];
    const totalCurrentBet = currentBets.reduce(
      (sum, bet) => sum + bet.amount,
      0,
    );

    // Auto-cap to available balance
    const availableBalance = playerBalance.currentBalance - totalCurrentBet;
    const actualAmount = Math.min(amount, availableBalance);

    // Still enforce minimum/maximum
    if (actualAmount < MIN_BET) return;
    if (actualAmount > MAX_BET) return;

    // Find existing bet on this symbol
    const existingBetIndex = currentBets.findIndex(
      (bet) => bet.symbol === symbol,
    );

    if (existingBetIndex >= 0) {
      // Update existing bet
      currentBets[existingBetIndex].amount += actualAmount;
    } else {
      // Add new bet
      currentBets.push({ symbol, amount: actualAmount });
    }

    this.state.currentBets[playerId] = currentBets;
    this.state.playerBalances[playerId].totalBet =
      totalCurrentBet + actualAmount;

    this.syncState();
  }

  // Clear all bets for a player
  private handleClearBets(playerId: string): void {
    if (this.state.gamePhase !== "betting") return;

    this.state.currentBets[playerId] = [];
    this.state.playerBalances[playerId].totalBet = 0;
    this.state.playersReady[playerId] = false;

    this.syncState();
  }

  // Sync all bets from guest (when they click ready)
  private handleSyncBets(
    playerId: string,
    bets: { symbol: BauCuaSymbol; amount: number }[],
  ): void {
    if (this.state.gamePhase !== "betting") return;

    const playerBalance = this.state.playerBalances[playerId];
    if (!playerBalance) return;

    // Calculate total bet amount
    const totalBet = bets.reduce((sum, bet) => sum + bet.amount, 0);

    // Validate total doesn't exceed balance
    if (totalBet > playerBalance.currentBalance) return;

    // Set all bets at once
    this.state.currentBets[playerId] = bets;
    this.state.playerBalances[playerId].totalBet = totalBet;

    this.syncState();
  }

  // Toggle ready status
  private handleToggleReady(playerId: string): void {
    if (this.state.gamePhase !== "betting") return;

    const currentBets = this.state.currentBets[playerId] || [];
    const hasPlacedBets = currentBets.length > 0;

    // Can only ready up if bets are placed
    if (!hasPlacedBets && !this.state.playersReady[playerId]) return;

    this.state.playersReady[playerId] = !this.state.playersReady[playerId];

    this.syncState();
  }

  // Roll the dice (host only)
  private handleRollDice(): void {
    if (this.state.gamePhase !== "betting") return;

    // Check if all players with bets are ready
    const playersWithBets = Object.keys(this.state.currentBets).filter(
      (id) => (this.state.currentBets[id] || []).length > 0,
    );

    if (playersWithBets.length === 0) {
      // No bets placed, just start new round
      this.handleStartNewRound();
      return;
    }

    this.state.gamePhase = "rolling";

    // Generate random dice roll
    let dice1 = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
    let dice2 = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
    let dice3 = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
    const dice = [dice1, dice2, dice3];

    // Apply pre-roll power-up effects (predictions)
    Object.keys(this.state.powerUpPredictions).forEach((playerId) => {
      const prediction = this.state.powerUpPredictions[playerId];
      const powerUpType = this.state.activePowerUps[playerId];

      if (powerUpType === "reveal_one") {
        // Check if prediction matches reality
        const hasMatch = dice.includes(prediction.symbol);
        const willBeCorrect = Math.random() < prediction.accuracy;

        prediction.actuallyCorrect = willBeCorrect;

        // Adjust dice to match prediction accuracy
        if (willBeCorrect && !hasMatch) {
          // Should be correct but isn't - force one die to match
          const randomIndex = Math.floor(Math.random() * 3);
          dice[randomIndex] = prediction.symbol;
        } else if (!willBeCorrect && hasMatch) {
          // Should be wrong but matches - change matching dice
          const matchingIndices = dice
            .map((d, i) => (d === prediction.symbol ? i : -1))
            .filter((i) => i >= 0);
          if (matchingIndices.length > 0) {
            const wrongSymbols = ALL_SYMBOLS.filter(
              (s) => s !== prediction.symbol,
            );
            const indexToChange =
              matchingIndices[
                Math.floor(Math.random() * matchingIndices.length)
              ];
            dice[indexToChange] =
              wrongSymbols[Math.floor(Math.random() * wrongSymbols.length)];
          }
        }
      }
    });

    this.state.diceRoll = [dice[0], dice[1], dice[2]];

    // Track recent rolls for hot streaks (keep last 10)
    this.state.recentRolls.push([dice[0], dice[1], dice[2]]);
    if (this.state.recentRolls.length > 10) {
      this.state.recentRolls.shift();
    }

    this.syncState();

    // After animation, calculate results (increased to match UI animation)
    setTimeout(() => {
      this.calculateResults();
    }, 3500);
  }

  // Calculate payouts and update balances
  private calculateResults(): void {
    if (!this.state.diceRoll) return;

    const diceRoll = this.state.diceRoll;

    // Count occurrences of each symbol in dice roll
    const symbolCounts: Record<BauCuaSymbol, number> = {
      gourd: 0,
      crab: 0,
      shrimp: 0,
      fish: 0,
      chicken: 0,
      deer: 0,
    };

    diceRoll.forEach((symbol) => {
      symbolCounts[symbol]++;
    });

    // Check for mega round jackpot (triple match)
    const isTripleMatch =
      diceRoll[0] === diceRoll[1] && diceRoll[1] === diceRoll[2];
    const jackpotSymbol = isTripleMatch ? diceRoll[0] : null;

    // Calculate total bets for jackpot pool contribution
    let totalAllBets = 0;

    // Calculate winnings for each player
    Object.keys(this.state.currentBets).forEach((playerId) => {
      const bets = this.state.currentBets[playerId] || [];
      const playerBalance = this.state.playerBalances[playerId];

      if (!playerBalance) return;

      let totalWinnings = 0;
      let totalBetAmount = 0;
      let totalLosses = 0;

      bets.forEach((bet) => {
        totalBetAmount += bet.amount;
        const matches = symbolCounts[bet.symbol];

        if (matches > 0) {
          // Win: bet amount × number of matches
          let winAmount = bet.amount * matches;

          // Apply double_down power-up
          const activePowerUp = this.state.activePowerUps[playerId];
          if (activePowerUp === "double_down") {
            winAmount *= 2;
          }

          totalWinnings += winAmount;

          // Mega round jackpot bonus for matching symbol
          if (this.state.isMegaRound && jackpotSymbol === bet.symbol) {
            totalWinnings += Math.floor(
              this.state.jackpotPool /
                Object.keys(this.state.currentBets).filter((id) =>
                  (this.state.currentBets[id] || []).some(
                    (b) => b.symbol === jackpotSymbol,
                  ),
                ).length,
            );
          }
        } else {
          totalLosses += bet.amount;
        }
      });

      totalAllBets += totalBetAmount;

      // Apply insurance power-up (refund 50% of losses)
      const activePowerUp = this.state.activePowerUps[playerId];
      if (activePowerUp === "insurance" && totalLosses > 0) {
        totalWinnings += Math.floor(totalLosses * 0.5);
      }

      // Update balance: remove total bet, add total winnings
      const newBalance =
        playerBalance.currentBalance - totalBetAmount + totalWinnings;
      playerBalance.currentBalance = Math.max(0, newBalance);
      playerBalance.balanceHistory.push(playerBalance.currentBalance);
      playerBalance.totalBet = 0;
    });

    // Add to jackpot pool
    this.state.jackpotPool += Math.floor(totalAllBets * JACKPOT_PERCENTAGE);

    // Reset jackpot if mega round was won
    if (this.state.isMegaRound && isTripleMatch) {
      this.state.jackpotPool = 0;
    }

    // Decrement power-up cooldowns and clear active power-ups
    Object.keys(this.state.playerPowerUps).forEach((playerId) => {
      const powerUps = this.state.playerPowerUps[playerId];
      if (powerUps) {
        Object.values(powerUps).forEach((powerUp) => {
          if (powerUp.cooldown > 0) {
            powerUp.cooldown--;
          }
        });
      }
    });

    // Clear active power-ups and revealed dice
    this.state.activePowerUps = {};
    this.state.powerUpPredictions = {};

    this.state.gamePhase = "results";
    this.state.currentRound++;

    // Check if any player is out of money
    this.checkGameOver();

    this.syncState();
  }

  // Check if game should end
  private checkGameOver(): void {
    const activePlayers = Object.values(this.state.playerBalances).filter(
      (pb) => pb.currentBalance > 0,
    );

    if (activePlayers.length === 1) {
      this.state.gamePhase = "ended";
      this.state.winner = activePlayers[0].playerId;
    }
  }

  // Start a new betting round
  private handleStartNewRound(): void {
    this.state.gamePhase = "betting";
    this.state.currentBets = {};
    this.state.diceRoll = null;
    this.state.playersReady = {};
    // Keep isMegaRound consistent with currentRound (set in calculateResults)
    // or recalculate it here to be safe
    this.state.isMegaRound =
      this.state.currentRound > 0 &&
      this.state.currentRound % MEGA_ROUND_INTERVAL === 0;
    this.state.powerUpPredictions = {};

    this.syncState();
    this.checkBotTurn();
  }

  // Reset the entire game
  private handleResetGame(): void {
    // Keep players but reset their balances and power-ups
    Object.keys(this.state.playerBalances).forEach((playerId) => {
      const pb = this.state.playerBalances[playerId];
      pb.currentBalance = INITIAL_BALANCE;
      pb.balanceHistory = [INITIAL_BALANCE];
      pb.totalBet = 0;
      this.state.playerPowerUps[playerId] = this.initializePowerUps();
    });

    this.state.gamePhase = "waiting";
    this.state.currentBets = {};
    this.state.diceRoll = null;
    this.state.currentRound = 0;
    this.state.playersReady = {};
    this.state.winner = null;
    this.state.activePowerUps = {};
    this.state.powerUpPredictions = {};
    this.state.recentRolls = [];
    this.state.isMegaRound = false;
    this.state.jackpotPool = 0;

    this.syncState();
    this.checkBotTurn();
  }

  // Add a bot player
  private handleAddBot(): void {
    const botId = `BOT_${Date.now()}`;
    const botUsername = `Bot ${Object.keys(this.state.playerBalances).length + 1}`;

    this.state.playerBalances[botId] = {
      playerId: botId,
      username: botUsername,
      currentBalance: INITIAL_BALANCE,
      balanceHistory: [INITIAL_BALANCE],
      totalBet: 0,
      isBot: true,
    };

    this.state.playerPowerUps[botId] = this.initializePowerUps();

    this.syncState();
    this.checkBotTurn();
  }

  // Remove a bot player
  private handleRemoveBot(playerId: string): void {
    const playerBalance = this.state.playerBalances[playerId];
    if (!playerBalance || !playerBalance.isBot) return;

    delete this.state.playerBalances[playerId];
    delete this.state.currentBets[playerId];
    delete this.state.playersReady[playerId];
    delete this.state.playerPowerUps[playerId];
    delete this.state.activePowerUps[playerId];

    this.syncState();
  }

  // Check if it's bot's turn and make them act
  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "betting") return;

    // Clear previous timeout
    if (this.botMoveTimeout) {
      clearTimeout(this.botMoveTimeout);
    }

    // Delay bot action for realism
    this.botMoveTimeout = setTimeout(() => {
      this.executeBotActions();
    }, 800);
  }

  // Execute bot betting logic
  private executeBotActions(): void {
    const bots = Object.values(this.state.playerBalances).filter(
      (pb) => pb.isBot,
    );

    bots.forEach((bot) => {
      if (this.state.playersReady[bot.playerId]) return; // Already ready

      // Bot power-up usage (30% chance if available)
      const botPowerUps = this.state.playerPowerUps[bot.playerId];
      if (botPowerUps && Math.random() < 0.3) {
        const availablePowerUps: PowerUpType[] = [];
        if (botPowerUps.double_down.cooldown === 0)
          availablePowerUps.push("double_down");
        if (botPowerUps.insurance.cooldown === 0)
          availablePowerUps.push("insurance");
        // Bots don't use reveal_one (too complex)

        if (availablePowerUps.length > 0) {
          // Prefer double_down if balance is high
          const powerUpToUse =
            bot.currentBalance > 500 &&
            availablePowerUps.includes("double_down")
              ? "double_down"
              : availablePowerUps[
                  Math.floor(Math.random() * availablePowerUps.length)
                ];
          this.handleActivatePowerUp(bot.playerId, powerUpToUse);
        }
      }

      // Bot betting strategy
      const strategy = Math.random();
      let numBets = 1;

      if (strategy < 0.3) {
        // Conservative: 1-2 bets
        numBets = Math.random() < 0.5 ? 1 : 2;
      } else if (strategy < 0.7) {
        // Moderate: 2-3 bets
        numBets = Math.random() < 0.5 ? 2 : 3;
      } else {
        // Aggressive: 3-4 bets
        numBets = Math.random() < 0.5 ? 3 : 4;
      }

      const availableSymbols = [...ALL_SYMBOLS];
      const betAmount = Math.floor(bot.currentBalance / (numBets * 2));

      for (let i = 0; i < numBets && availableSymbols.length > 0; i++) {
        const symbolIndex = Math.floor(Math.random() * availableSymbols.length);
        const symbol = availableSymbols[symbolIndex];
        availableSymbols.splice(symbolIndex, 1);

        this.handlePlaceBet(bot.playerId, symbol, betAmount);
      }

      // Bot is always ready after betting
      this.state.playersReady[bot.playerId] = true;
    });

    this.syncState();
  }

  // Public methods for UI
  public requestPlaceBet(symbol: BauCuaSymbol, amount: number): void {
    this.makeAction({
      type: "PLACE_BET",
      playerId: this.userId,
      symbol,
      amount,
    });
  }

  public requestClearBets(): void {
    this.makeAction({
      type: "CLEAR_BETS",
      playerId: this.userId,
    });
  }

  public requestSyncBets(
    bets: { symbol: BauCuaSymbol; amount: number }[],
  ): void {
    this.makeAction({
      type: "SYNC_BETS",
      playerId: this.userId,
      bets,
    });
  }

  public requestToggleReady(): void {
    this.makeAction({
      type: "TOGGLE_READY",
      playerId: this.userId,
    });
  }

  public requestRollDice(): void {
    this.makeAction({ type: "ROLL_DICE" });
  }

  public requestStartNewRound(): void {
    this.makeAction({ type: "START_NEW_ROUND" });
  }

  public requestResetGame(): void {
    this.makeAction({ type: "RESET_GAME" });
  }

  public requestAddBot(): void {
    this.makeAction({ type: "ADD_BOT" });
  }

  public requestRemoveBot(playerId: string): void {
    this.makeAction({ type: "REMOVE_BOT", playerId });
  }

  public requestActivatePowerUp(powerUpType: PowerUpType): void {
    this.makeAction({
      type: "ACTIVATE_POWERUP",
      playerId: this.userId,
      powerUpType,
    });
  }

  public requestDeactivatePowerUp(): void {
    this.makeAction({
      type: "DEACTIVATE_POWERUP",
      playerId: this.userId,
    });
  }

  private randInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Activate selected power-up
  private handleActivatePowerUp(
    playerId: string,
    powerUpType: PowerUpType,
  ): void {
    if (this.state.gamePhase !== "betting") return;

    const powerUps = this.state.playerPowerUps[playerId];
    if (!powerUps) return;

    const powerUp = powerUps[powerUpType];
    if (!powerUp || powerUp.cooldown > 0) return;

    const config = POWERUP_CONFIG[powerUpType];

    // Handle pre-roll powers (generate prediction)
    if (config.timing === "pre_roll") {
      if (powerUpType === "reveal_one") {
        // Generate prediction with configured accuracy
        const randomSymbol = ALL_SYMBOLS[this.randInRange(0, 5)];
        const accuracy = this.randInRange(
          config.accuracy?.[0] || 0.6,
          config.accuracy?.[1] || 0.9,
        ); // 60-90%

        this.state.powerUpPredictions[playerId] = {
          symbol: randomSymbol,
          accuracy: accuracy,
        };
      }
    }

    // Activate power-up
    this.state.activePowerUps[playerId] = powerUpType;
    powerUp.cooldown = config.cooldown;
    powerUp.lastUsedRound = this.state.currentRound;

    this.syncState();
  }

  // Deactivate power-up (only for post_roll types before dice roll)
  private handleDeactivatePowerUp(playerId: string): void {
    if (this.state.gamePhase !== "betting") return;

    const activePowerUp = this.state.activePowerUps[playerId];
    if (!activePowerUp) return;

    const config = POWERUP_CONFIG[activePowerUp];

    // Only allow deactivation for post_roll power-ups
    if (config.timing !== "post_roll") return;

    const powerUps = this.state.playerPowerUps[playerId];
    if (!powerUps) return;

    const powerUp = powerUps[activePowerUp];
    if (!powerUp) return;

    // Reset cooldown since it wasn't used
    powerUp.cooldown = 0;
    powerUp.lastUsedRound = -1;

    // Clear activation
    this.state.activePowerUps[playerId] = null;

    this.syncState();
  }

  // Update players when room changes
  updatePlayers(players: Player[]): void {
    super.updatePlayers(players);

    // Add new players
    players.forEach((player) => {
      if (!this.state.playerBalances[player.id]) {
        this.state.playerBalances[player.id] = {
          playerId: player.id,
          username: player.username,
          currentBalance: INITIAL_BALANCE,
          balanceHistory: [INITIAL_BALANCE],
          totalBet: 0,
          isBot: player.isBot || false,
        };
        this.state.playerPowerUps[player.id] = this.initializePowerUps();
      }
    });

    // Remove players who left (except bots)
    const playerIds = new Set(players.map((p) => p.id));
    Object.keys(this.state.playerBalances).forEach((id) => {
      const isBot = this.state.playerBalances[id].isBot;
      if (!playerIds.has(id) && !isBot) {
        delete this.state.playerBalances[id];
        delete this.state.currentBets[id];
        delete this.state.playersReady[id];
        delete this.state.playerPowerUps[id];
        delete this.state.activePowerUps[id];
      }
    });

    this.syncState();
  }

  destroy(): void {
    if (this.botMoveTimeout) {
      clearTimeout(this.botMoveTimeout);
    }
    super.destroy();
  }
}
