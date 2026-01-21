import { BaseGame, type GameAction } from "../BaseGame";
import type {
  BauCuaState,
  BauCuaAction,
  BauCuaSymbol,
  PlayerBalance,
} from "./types";
import { INITIAL_BALANCE, ALL_SYMBOLS } from "./types";
import type { Player } from "../../stores/roomStore";

export default class BauCua extends BaseGame<BauCuaState> {
  private botMoveTimeout: ReturnType<typeof setTimeout> | null = null;

  getInitState(): BauCuaState {
    const playerBalances: Record<string, PlayerBalance> = {};

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
    });

    return {
      gamePhase: "waiting",
      playerBalances,
      currentBets: {},
      diceRoll: null,
      currentRound: 0,
      playersReady: {},
      winner: null,
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

    // Get current bets for player
    const currentBets = this.state.currentBets[playerId] || [];
    const totalCurrentBet = currentBets.reduce(
      (sum, bet) => sum + bet.amount,
      0,
    );

    // Check if player has enough balance
    if (totalCurrentBet + amount > playerBalance.currentBalance) return;

    // Find existing bet on this symbol
    const existingBetIndex = currentBets.findIndex(
      (bet) => bet.symbol === symbol,
    );

    if (existingBetIndex >= 0) {
      // Update existing bet
      currentBets[existingBetIndex].amount += amount;
    } else {
      // Add new bet
      currentBets.push({ symbol, amount });
    }

    this.state.currentBets[playerId] = currentBets;
    this.state.playerBalances[playerId].totalBet = totalCurrentBet + amount;

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
    const dice1 = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
    const dice2 = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
    const dice3 = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];

    this.state.diceRoll = [dice1, dice2, dice3];
    this.syncState();

    // After animation, calculate results
    setTimeout(() => {
      this.calculateResults();
    }, 2000);
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

    // Calculate winnings for each player
    Object.keys(this.state.currentBets).forEach((playerId) => {
      const bets = this.state.currentBets[playerId] || [];
      const playerBalance = this.state.playerBalances[playerId];

      if (!playerBalance) return;

      let totalWinnings = 0;
      let totalBetAmount = 0;

      bets.forEach((bet) => {
        totalBetAmount += bet.amount;
        const matches = symbolCounts[bet.symbol];

        if (matches > 0) {
          // Win: bet amount × number of matches
          totalWinnings += bet.amount * matches;
        }
      });

      // Update balance: remove total bet, add total winnings
      const newBalance =
        playerBalance.currentBalance - totalBetAmount + totalWinnings;
      playerBalance.currentBalance = Math.max(0, newBalance);
      playerBalance.balanceHistory.push(playerBalance.currentBalance);
      playerBalance.totalBet = 0;
    });

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

    this.syncState();
    this.checkBotTurn();
  }

  // Reset the entire game
  private handleResetGame(): void {
    // Keep players but reset their balances
    Object.keys(this.state.playerBalances).forEach((playerId) => {
      const pb = this.state.playerBalances[playerId];
      pb.currentBalance = INITIAL_BALANCE;
      pb.balanceHistory = [INITIAL_BALANCE];
      pb.totalBet = 0;
    });

    this.state.gamePhase = "waiting";
    this.state.currentBets = {};
    this.state.diceRoll = null;
    this.state.currentRound = 0;
    this.state.playersReady = {};
    this.state.winner = null;

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
