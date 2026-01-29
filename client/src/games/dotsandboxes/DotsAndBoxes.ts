import { BaseGame, type GameAction } from "../BaseGame";
import { type DotsAndBoxesState, type DotsAndBoxesAction } from "./types";
import type { Player } from "../../stores/roomStore";

const GRID_SIZE = 6; // 6x6 dots = 5x5 boxes

export default class DotsAndBoxes extends BaseGame<DotsAndBoxesState> {
  getInitState(): DotsAndBoxesState {
    return {
      gridSize: GRID_SIZE,
      horizontalLines: Array(GRID_SIZE)
        .fill(null)
        .map(() => Array(GRID_SIZE - 1).fill(false)),
      verticalLines: Array(GRID_SIZE - 1)
        .fill(null)
        .map(() => Array(GRID_SIZE).fill(false)),
      boxes: Array(GRID_SIZE - 1)
        .fill(null)
        .map(() => Array(GRID_SIZE - 1).fill(null)),
      players: [
        { ...this.players[0], color: "red", score: 0 },
        { ...this.players[1], color: "blue", score: 0 },
      ],
      currentPlayerIndex: 0,
      winner: null,
      isGameEnded: false,
      gamePhase: "waiting",
      lastLine: null,
      undoRequest: null,
    };
  }

  private moveHistory: {
    line: { type: "horizontal" | "vertical"; row: number; col: number };
    playerId: string;
    boxesCaptured: { row: number; col: number }[];
    prevPlayerIndex: number;
  }[] = [];

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as DotsAndBoxesAction;
    if (!this.isHost) return;

    switch (action.type) {
      case "PLACE_LINE":
        this.handlePlaceLine(
          action.playerId,
          action.lineType,
          action.row,
          action.col,
        );
        break;
      case "START_GAME":
        this.handleStartGame();
        break;
      case "RESET":
        this.reset();
        break;
      case "ADD_BOT":
        this.handleAddBot(action.slotIndex);
        break;
      case "REMOVE_BOT":
        this.handleRemoveBot(action.slotIndex);
        break;
      case "REQUEST_UNDO":
        this.handleRequestUndo(action.playerId);
        break;
      case "APPROVE_UNDO":
        this.handleApproveUndo();
        break;
      case "REJECT_UNDO":
        this.handleRejectUndo();
        break;
    }
  }

  //ByType =======================

  private handleAddBot(slotIndex: number): void {
    if (
      this.state.isGameEnded ||
      this.state.boxes.some((r) => r.some((c) => c !== null)) ||
      slotIndex < 0 ||
      slotIndex >= 2
    )
      return;

    this.state.players[slotIndex] = {
      ...this.state.players[slotIndex],
      id: `BOT_${Date.now()}_${slotIndex}`,
      username: `Bot ${slotIndex + 1}`,
      isHost: false,
      isBot: true,
      color: slotIndex === 0 ? "red" : "blue",
      score: 0,
    };
  }

  private handleRemoveBot(slotIndex: number): void {
    if (
      this.state.isGameEnded ||
      this.state.boxes.some((r) => r.some((c) => c !== null)) ||
      slotIndex < 0 ||
      slotIndex >= 2
    )
      return;
    if (!this.state.players[slotIndex]?.isBot) return;

    this.state.players[slotIndex] = null;
  }

  private handleStartGame(): void {
    if (this.canStartGame()) {
      this.reset();
      this.state.gamePhase = "playing";

      this.checkBotTurn();
    }
  }

  public canStartGame(): boolean {
    return this.state.players.every((p) => p?.id != null);
  }

  private handlePlaceLine(
    playerId: string,
    lineType: "horizontal" | "vertical",
    row: number,
    col: number,
  ): void {
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer?.id !== playerId) return;

    // Validate coordinates
    if (this.state.isGameEnded) return;

    // Validate coordinates
    if (lineType === "horizontal") {
      if (
        row < 0 ||
        row >= this.state.gridSize ||
        col < 0 ||
        col >= this.state.gridSize - 1
      )
        return;
      if (this.state.horizontalLines[row][col]) return; // Already placed
    } else {
      if (
        row < 0 ||
        row >= this.state.gridSize - 1 ||
        col < 0 ||
        col >= this.state.gridSize
      )
        return;
      if (this.state.verticalLines[row][col]) return; // Already placed
    }

    // Place the line
    if (lineType === "horizontal") {
      this.state.horizontalLines[row][col] = true;
    } else {
      this.state.verticalLines[row][col] = true;
    }

    // Check for completed boxes
    const completedBoxes = this.checkCompletedBoxes(lineType, row, col);

    // Record history
    this.moveHistory.push({
      line: { type: lineType, row, col },
      playerId,
      boxesCaptured: completedBoxes,
      prevPlayerIndex: this.state.currentPlayerIndex,
    });

    if (completedBoxes.length > 0) {
      // Player scored!
      completedBoxes.forEach((box) => {
        this.state.boxes[box.row][box.col] = playerId;
        currentPlayer.score++;
      });
      // Player keeps turn
    } else {
      // Next turn
      this.state.currentPlayerIndex =
        (this.state.currentPlayerIndex + 1) % this.state.players.length;
    }

    this.state.lastLine = { type: lineType, row, col };
    this.state.undoRequest = null; // Clear any pending undo requests on new move

    this.updateGameStatus();

    // Check for bot turn
    this.checkBotTurn();
  }

  private checkBotTurn(): void {
    if (this.state.isGameEnded) return;
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];

    if (currentPlayer?.isBot && currentPlayer.id) {
      setTimeout(() => this.executeBotTurn(currentPlayer.id!), 800);
    }
  }

  private executeBotTurn(botId: string): void {
    if (this.state.isGameEnded) return;
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer?.id !== botId) return;

    const move = this.calculateBestMove(botId);
    if (move) {
      this.handlePlaceLine(botId, move.lineType, move.row, move.col);
    }
  }

  private calculateBestMove(
    _botId: string,
  ): { lineType: "horizontal" | "vertical"; row: number; col: number } | null {
    // 1. Check for moves that complete a box
    const scoringMove = this.findScoringMove();
    if (scoringMove) return scoringMove;

    // 2. Check for safe moves (that don't give away a box)
    const safeMove = this.findSafeMove();
    if (safeMove) return safeMove;

    // 3. Random move (sacrifice)
    return this.findRandomMove();
  }

  private findScoringMove() {
    // Check horizontal lines
    for (let r = 0; r < this.state.gridSize; r++) {
      for (let c = 0; c < this.state.gridSize - 1; c++) {
        if (!this.state.horizontalLines[r][c]) {
          // Try simulating placing it
          this.state.horizontalLines[r][c] = true;
          const completed = this.checkCompletedBoxes("horizontal", r, c);
          this.state.horizontalLines[r][c] = false; // Undo
          if (completed.length > 0)
            return { lineType: "horizontal" as const, row: r, col: c };
        }
      }
    }
    // Check vertical lines
    for (let r = 0; r < this.state.gridSize - 1; r++) {
      for (let c = 0; c < this.state.gridSize; c++) {
        if (!this.state.verticalLines[r][c]) {
          // Try simulating
          this.state.verticalLines[r][c] = true;
          const completed = this.checkCompletedBoxes("vertical", r, c);
          this.state.verticalLines[r][c] = false; // Undo
          if (completed.length > 0)
            return { lineType: "vertical" as const, row: r, col: c };
        }
      }
    }
    return null;
  }

  private findSafeMove() {
    const allMoves: {
      lineType: "horizontal" | "vertical";
      row: number;
      col: number;
    }[] = [];
    // Collect all empty lines
    for (let r = 0; r < this.state.gridSize; r++) {
      for (let c = 0; c < this.state.gridSize - 1; c++) {
        if (!this.state.horizontalLines[r][c])
          allMoves.push({ lineType: "horizontal", row: r, col: c });
      }
    }
    for (let r = 0; r < this.state.gridSize - 1; r++) {
      for (let c = 0; c < this.state.gridSize; c++) {
        if (!this.state.verticalLines[r][c])
          allMoves.push({ lineType: "vertical", row: r, col: c });
      }
    }

    // Suffle for randomness
    for (let i = allMoves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allMoves[i], allMoves[j]] = [allMoves[j], allMoves[i]];
    }

    for (const move of allMoves) {
      if (!this.doesMoveGiveAwayBox(move)) {
        return move;
      }
    }

    return null;
  }

  private doesMoveGiveAwayBox(move: {
    lineType: "horizontal" | "vertical";
    row: number;
    col: number;
  }): boolean {
    // Simulate move
    let givesAway = false;

    if (move.lineType === "horizontal") {
      this.state.horizontalLines[move.row][move.col] = true;
      // Check affected boxes - if they end up having 3 sides filled (meaning 4th is open for opponent), it's bad.
      // Actually, if we complete a box, that's GOOD (handled by findScoringMove).
      // But here we assume no scoring move exists. So we check if we create a "3-sided box" state.

      givesAway = this.checkIfAnyBoxHas3Sides(
        move.lineType,
        move.row,
        move.col,
      );

      this.state.horizontalLines[move.row][move.col] = false;
    } else {
      this.state.verticalLines[move.row][move.col] = true;
      givesAway = this.checkIfAnyBoxHas3Sides(
        move.lineType,
        move.row,
        move.col,
      );
      this.state.verticalLines[move.row][move.col] = false;
    }

    return givesAway;
  }

  private checkIfAnyBoxHas3Sides(
    lineType: "horizontal" | "vertical",
    row: number,
    col: number,
  ): boolean {
    // Check neighbors
    if (lineType === "horizontal") {
      // Box above
      if (row > 0 && this.countBoxSides(row - 1, col) === 3) return true;
      // Box below
      if (row < this.state.gridSize - 1 && this.countBoxSides(row, col) === 3)
        return true;
    } else {
      // Box left
      if (col > 0 && this.countBoxSides(row, col - 1) === 3) return true;
      // Box right
      if (col < this.state.gridSize - 1 && this.countBoxSides(row, col) === 3)
        return true;
    }
    return false;
  }

  private countBoxSides(r: number, c: number): number {
    let count = 0;
    if (this.state.horizontalLines[r][c]) count++;
    if (this.state.horizontalLines[r + 1][c]) count++;
    if (this.state.verticalLines[r][c]) count++;
    if (this.state.verticalLines[r][c + 1]) count++;
    return count;
  }

  private findRandomMove() {
    // Just pick the first available
    // Horizontal
    for (let r = 0; r < this.state.gridSize; r++) {
      for (let c = 0; c < this.state.gridSize - 1; c++) {
        if (!this.state.horizontalLines[r][c])
          return { lineType: "horizontal" as const, row: r, col: c };
      }
    }
    // Vertical
    for (let r = 0; r < this.state.gridSize - 1; r++) {
      for (let c = 0; c < this.state.gridSize; c++) {
        if (!this.state.verticalLines[r][c])
          return { lineType: "vertical" as const, row: r, col: c };
      }
    }
    return null;
  }

  private checkCompletedBoxes(
    lineType: "horizontal" | "vertical",
    row: number,
    col: number,
  ): { row: number; col: number }[] {
    const completed: { row: number; col: number }[] = [];

    // Helper to check if a specific box is complete
    const isBoxComplete = (r: number, c: number) => {
      const top = this.state.horizontalLines[r][c];
      const bottom = this.state.horizontalLines[r + 1][c];
      const left = this.state.verticalLines[r][c];
      const right = this.state.verticalLines[r][c + 1];
      return top && bottom && left && right;
    };

    if (lineType === "horizontal") {
      // Check box above (if exists)
      if (row > 0) {
        if (isBoxComplete(row - 1, col)) {
          completed.push({ row: row - 1, col });
        }
      }
      // Check box below (if exists)
      if (row < this.state.gridSize - 1) {
        if (isBoxComplete(row, col)) {
          completed.push({ row, col });
        }
      }
    } else {
      // Vertical line
      // Check box to the left (if exists)
      if (col > 0) {
        if (isBoxComplete(row, col - 1)) {
          completed.push({ row, col: col - 1 });
        }
      }
      // Check box to the right (if exists)
      if (col < this.state.gridSize - 1) {
        if (isBoxComplete(row, col)) {
          completed.push({ row, col });
        }
      }
    }

    return completed;
  }

  private updateGameStatus(): void {
    const totalBoxes = (this.state.gridSize - 1) * (this.state.gridSize - 1);
    const filledBoxes = this.state.players.reduce(
      (sum, p) => sum + (p?.score || 0),
      0,
    );

    if (filledBoxes === totalBoxes) {
      this.state.isGameEnded = true;
      const p1 = this.state.players[0];
      const p2 = this.state.players[1];
      if (!p1 || !p2) return;
      if (p1.score > p2.score) this.state.winner = p1.id;
      else if (p2.score > p1.score) this.state.winner = p2.id;
      else this.state.winner = "draw"; // Or handle draw
    }
  }

  reset(): void {
    this.state.horizontalLines = Array(this.state.gridSize)
      .fill(null)
      .map(() => Array(this.state.gridSize - 1).fill(false));
    this.state.verticalLines = Array(this.state.gridSize - 1)
      .fill(null)
      .map(() => Array(this.state.gridSize).fill(false));
    this.state.boxes = Array(this.state.gridSize - 1)
      .fill(null)
      .map(() => Array(this.state.gridSize - 1).fill(null));
    this.state.currentPlayerIndex = 0;
    this.state.winner = null;
    this.state.isGameEnded = false;
    this.state.gamePhase = "waiting";
    this.state.lastLine = null;
    this.state.undoRequest = null;
    this.state.players.forEach((p) => p && (p.score = 0));
    this.moveHistory = [];
  }

  // Undo Logic
  private handleRequestUndo(playerId: string): void {
    // Can only request undo if there is history
    if (this.moveHistory.length === 0) return;

    // check bot => auto approve
    if (this.state.players.find((p) => p?.isBot)) {
      this.handleApproveUndo();
      return;
    }

    if (this.state.undoRequest) return; // Already requested

    this.state.undoRequest = { requesterId: playerId };
  }

  private handleRejectUndo(): void {
    this.state.undoRequest = null;
  }

  private handleApproveUndo(): void {
    const lastMove = this.moveHistory.pop();
    if (!lastMove) {
      this.state.undoRequest = null; // Should not happen, but safety
      return;
    }

    // Revert line
    if (lastMove.line.type === "horizontal") {
      this.state.horizontalLines[lastMove.line.row][lastMove.line.col] = false;
    } else {
      this.state.verticalLines[lastMove.line.row][lastMove.line.col] = false;
    }

    // Revert boxes
    const player = this.state.players.find((p) => p?.id === lastMove.playerId);
    if (player) {
      player.score -= lastMove.boxesCaptured.length;
    }
    lastMove.boxesCaptured.forEach((box) => {
      this.state.boxes[box.row][box.col] = null;
    });

    // Revert turn
    this.state.currentPlayerIndex = lastMove.prevPlayerIndex;
    this.state.isGameEnded = false;
    this.state.winner = null;

    // Update last line to previous one
    const prevMove = this.moveHistory[this.moveHistory.length - 1];
    this.state.lastLine = prevMove ? prevMove.line : null;

    this.state.undoRequest = null;
  }

  updatePlayers(players: Player[]): void {
    for (let i = 0; i < 2; i++) {
      const roomPlayer = players[i];
      if (roomPlayer) {
        this.state.players[i] = {
          id: roomPlayer.id,
          username: roomPlayer.username,
          isHost: roomPlayer.isHost,
          isBot: roomPlayer.isBot,
          color: i === 0 ? "red" : "blue",
          score: this.state.players[i]?.score || 0,
        };
      } else {
        // No real player for this slot
        // If it was a human, clear it. If it was a bot, keep it.
        if (!this.state.players[i]?.isBot) {
          this.state.players[i] = null;
        }
      }
    }
  }

  // Public API
  requestPlaceLine(
    lineType: "horizontal" | "vertical",
    row: number,
    col: number,
  ): void {
    const action: DotsAndBoxesAction = {
      type: "PLACE_LINE",
      lineType,
      row,
      col,
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  requestAddBot(slotIndex: number): void {
    const action: DotsAndBoxesAction = { type: "ADD_BOT", slotIndex };
    this.makeAction(action);
  }

  requestRemoveBot(slotIndex: number): void {
    const action: DotsAndBoxesAction = { type: "REMOVE_BOT", slotIndex };
    this.makeAction(action);
  }

  requestUndo(): void {
    const action: DotsAndBoxesAction = {
      type: "REQUEST_UNDO",
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  approveUndo(): void {
    const action: DotsAndBoxesAction = { type: "APPROVE_UNDO" };
    this.makeAction(action);
  }

  rejectUndo(): void {
    const action: DotsAndBoxesAction = { type: "REJECT_UNDO" };
    this.makeAction(action);
  }

  requestNewGame(): void {
    const action: DotsAndBoxesAction = { type: "RESET" };
    this.makeAction(action);
  }

  requestStartGame(): void {
    const action: DotsAndBoxesAction = { type: "START_GAME" };
    this.makeAction(action);
  }
}
