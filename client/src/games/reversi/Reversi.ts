import { BaseGame, type GameAction } from "../BaseGame";
import {
  type ReversiState,
  type ReversiAction,
  type MoveHistory,
  ReversiColor,
  ReversiGamePhase,
  ReversiPlayerFlag,
} from "./types";

import { runMCTS } from "./mcts";
import {
  getValidMovesBB,
  getFlipsBB,
  countBitsBB,
  FULL_MASK,
} from "./bitboard";
import type { Player } from "../../stores/roomStore";
import { hasFlag } from "../../utils";

export default class Reversi extends BaseGame<ReversiState> {
  getInitState(): ReversiState {
    const { bb, wb } = this.getInitialBitboards();
    return {
      blackBoard: bb.toString(16),
      whiteBoard: wb.toString(16),
      players: {
        black: this.preparePlayer(this.players[0]),
        white: this.preparePlayer(this.players[1]),
      },
      turn: ReversiColor.BLACK,
      winner: null,
      gamePhase: ReversiGamePhase.WAITING,
      undoRequest: null,
      moveHistory: [],
      lastMove: null,
      flippedCells: [],
    };
  }

  private preparePlayer(player: Player | null) {
    if (!player) return null;
    return {
      ...player,
      flags: player.isBot ? ReversiPlayerFlag.BOT : 0,
    };
  }

  private getInitialBitboards(): { bb: bigint; wb: bigint } {
    // Center 4 pieces: (3,3)=W, (3,4)=B, (4,3)=B, (4,4)=W
    // bit = row * 8 + col
    // (3,3) = 27 -> W
    // (3,4) = 28 -> B
    // (4,3) = 35 -> B
    // (4,4) = 36 -> W
    let bb = (1n << 28n) | (1n << 35n);
    let wb = (1n << 27n) | (1n << 36n);
    return { bb, wb };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as ReversiAction;
    if (!this.isHost) return;

    switch (action.type) {
      case "MAKE_MOVE":
        this.handleMakeMove(action.playerId, action.row, action.col);
        break;
      case "PASS":
        this.handlePass(action.playerId);
        break;
      case "START_GAME":
        this.handleStartGame();
        break;
      case "RESET":
        this.reset();
        break;
      case "ADD_BOT":
        this.handleAddBot();
        break;
      case "REMOVE_BOT":
        this.handleRemoveBot();
        break;
      case "REQUEST_UNDO":
        this.handleRequestUndo(action.playerId, action.playerName);
        break;
      case "ACCEPT_UNDO":
        this.handleAcceptUndo();
        break;
      case "DECLINE_UNDO":
        this.handleDeclineUndo();
        break;
    }
  }

  // ============== Game Logic ==============

  private handleStartGame(): void {
    if (this.state.gamePhase !== ReversiGamePhase.WAITING) return;
    if (!this.state.players.black?.id || !this.state.players.white?.id) return;

    const { bb, wb } = this.getInitialBitboards();
    this.state.gamePhase = ReversiGamePhase.PLAYING;
    this.state.turn = ReversiColor.BLACK;
    this.state.blackBoard = bb.toString(16);
    this.state.whiteBoard = wb.toString(16);
    this.state.moveHistory = [];
    this.state.winner = null;
    this.state.lastMove = null;
    this.state.flippedCells = [];

    this.checkBotTurn();
  }

  private handleMakeMove(playerId: string, row: number, col: number): void {
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const currentTurn = this.state.turn;
    const currentPlayer =
      currentTurn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;

    if (!currentPlayer || currentPlayer.id !== playerId) return;

    const pos = row * 8 + col;
    const moveBit = 1n << BigInt(pos);
    const bb = BigInt("0x" + this.state.blackBoard);
    const wb = BigInt("0x" + this.state.whiteBoard);

    const playerBoard = currentTurn === ReversiColor.BLACK ? bb : wb;
    const opponentBoard = currentTurn === ReversiColor.BLACK ? wb : bb;

    const flips = getFlipsBB(moveBit, playerBoard, opponentBoard);
    if (flips === 0n) return;

    this.saveHistory();

    const newPlayerBoard = playerBoard | moveBit | flips;
    const newOpponentBoard = opponentBoard & ~flips & FULL_MASK;

    if (currentTurn === ReversiColor.BLACK) {
      this.state.blackBoard = newPlayerBoard.toString(16);
      this.state.whiteBoard = newOpponentBoard.toString(16);
    } else {
      this.state.blackBoard = newOpponentBoard.toString(16);
      this.state.whiteBoard = newPlayerBoard.toString(16);
    }

    this.state.lastMove = pos;
    this.state.flippedCells = [];
    for (let i = 0; i < 64; i++) {
      if ((flips >> BigInt(i)) & 1n) {
        this.state.flippedCells.push(i);
      }
    }

    const nextTurn =
      currentTurn === ReversiColor.BLACK
        ? ReversiColor.WHITE
        : ReversiColor.BLACK;
    this.state.turn = nextTurn;

    if (getValidMovesBB(newOpponentBoard, newPlayerBoard) === 0n) {
      if (getValidMovesBB(newPlayerBoard, newOpponentBoard) === 0n) {
        this.endGame();
      } else {
        this.state.turn = currentTurn;
      }
    }

    this.checkBotTurn();
  }

  private handlePass(playerId: string): void {
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const currentTurn = this.state.turn;
    const currentPlayer =
      currentTurn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;

    if (!currentPlayer || currentPlayer.id !== playerId) return;

    const bb = BigInt("0x" + this.state.blackBoard);
    const wb = BigInt("0x" + this.state.whiteBoard);
    const playerBoard = currentTurn === ReversiColor.BLACK ? bb : wb;
    const opponentBoard = currentTurn === ReversiColor.BLACK ? wb : bb;

    if (getValidMovesBB(playerBoard, opponentBoard) !== 0n) return;

    this.state.turn =
      currentTurn === ReversiColor.BLACK
        ? ReversiColor.WHITE
        : ReversiColor.BLACK;

    this.checkBotTurn();
  }

  private endGame(): void {
    this.state.gamePhase = ReversiGamePhase.ENDED;

    const counts = this.getPieceCount();
    if (counts.black > counts.white) {
      this.state.winner = this.state.players.black?.id || null;
    } else if (counts.white > counts.black) {
      this.state.winner = this.state.players.white?.id || null;
    } else {
      this.state.winner = "draw";
    }

    this.clearSavedState();
  }

  // ============== Public API ==============

  public getValidMoves(color: ReversiColor): [number, number][] {
    const bb = BigInt("0x" + this.state.blackBoard);
    const wb = BigInt("0x" + this.state.whiteBoard);
    const p = color === ReversiColor.BLACK ? bb : wb;
    const o = color === ReversiColor.BLACK ? wb : bb;

    const movesBitboard = getValidMovesBB(p, o);
    const moves: [number, number][] = [];
    for (let i = 0; i < 64; i++) {
      if ((movesBitboard >> BigInt(i)) & 1n) {
        moves.push([Math.floor(i / 8), i % 8]);
      }
    }
    return moves;
  }

  // ============== Undo System ==============

  private saveHistory(): void {
    const history: MoveHistory = {
      bb: this.state.blackBoard,
      wb: this.state.whiteBoard,
      t: this.state.turn,
    };
    this.state.moveHistory.push(history);
    if (this.state.moveHistory.length > 5) {
      this.state.moveHistory.shift();
    }
  }

  private handleRequestUndo(playerId: string, playerName: string): void {
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;
    if (this.state.moveHistory.length === 0) return;
    if (this.state.undoRequest) return;

    const playerColor = this.state.turn;
    const opponentColor =
      playerColor === ReversiColor.BLACK
        ? ReversiColor.WHITE
        : ReversiColor.BLACK;
    const opponent =
      opponentColor === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;

    if (opponent && hasFlag(opponent.flags, ReversiPlayerFlag.BOT)) {
      this.applyUndo();
    } else {
      this.state.undoRequest = { fromId: playerId, fromName: playerName };
    }
  }

  private handleAcceptUndo(): void {
    if (!this.state.undoRequest) return;
    this.applyUndo();
  }

  private applyUndo(): void {
    if (this.state.moveHistory.length === 0) return;

    const lastState = this.state.moveHistory.pop()!;
    this.state.blackBoard = lastState.bb;
    this.state.whiteBoard = lastState.wb;
    this.state.turn = lastState.t;
    this.state.undoRequest = null;
    this.state.lastMove = null;
    this.state.flippedCells = [];
  }

  private handleDeclineUndo(): void {
    this.state.undoRequest = null;
  }

  // ============== Bot AI ==============

  private handleAddBot(): void {
    if (this.state.players.white?.id) return;
    this.state.players.white = {
      id: `BOT_${Date.now()}`,
      username: "Bot",
      isHost: false,
      isBot: true,
      flags: ReversiPlayerFlag.BOT,
    };
  }

  private handleRemoveBot(): void {
    if (
      !this.state.players.white ||
      !hasFlag(this.state.players.white.flags, ReversiPlayerFlag.BOT)
    )
      return;
    this.state.players.white = null;
  }

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const currentPlayer =
      this.state.turn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;
    if (
      currentPlayer &&
      hasFlag(currentPlayer.flags, ReversiPlayerFlag.BOT) &&
      currentPlayer.id
    ) {
      setTimeout(() => this.makeBotMove(currentPlayer.id!), 800);
    }
  }

  private makeBotMove(botId: string): void {
    if (this.state.gamePhase !== ReversiGamePhase.PLAYING) return;

    const turn = this.state.turn;
    const currentPlayer =
      turn === ReversiColor.BLACK
        ? this.state.players.black
        : this.state.players.white;
    if (currentPlayer?.id != botId) return;

    const validMoves = this.getValidMoves(turn);
    if (validMoves.length === 0) {
      this.handlePass(botId);
      return;
    }

    const bb = BigInt("0x" + this.state.blackBoard);
    const wb = BigInt("0x" + this.state.whiteBoard);

    const mctsMove = runMCTS(
      bb,
      wb,
      (turn === ReversiColor.BLACK ? 0 : 1) as 0 | 1,
      500,
    );

    if (mctsMove) {
      this.handleMakeMove(botId, mctsMove[0], mctsMove[1]);
    } else {
      const randomMove =
        validMoves[Math.floor(Math.random() * validMoves.length)];
      this.handleMakeMove(botId, randomMove[0], randomMove[1]);
    }
  }

  // ============== Public API ==============

  requestMove(row: number, col: number): void {
    this.makeAction({ type: "MAKE_MOVE", playerId: this.userId, row, col });
  }

  requestPass(): void {
    this.makeAction({ type: "PASS", playerId: this.userId });
  }

  requestStartGame(): void {
    this.makeAction({ type: "START_GAME" });
  }

  requestAddBot(): void {
    this.makeAction({ type: "ADD_BOT" });
  }

  requestRemoveBot(): void {
    this.makeAction({ type: "REMOVE_BOT" });
  }

  requestUndo(): void {
    const player =
      this.state.players.black?.id === this.userId
        ? this.state.players.black
        : this.state.players.white;
    this.makeAction({
      type: "REQUEST_UNDO",
      playerId: this.userId,
      playerName: player?.username || "Player",
    });
  }

  acceptUndo(): void {
    this.makeAction({ type: "ACCEPT_UNDO" });
  }

  declineUndo(): void {
    this.makeAction({ type: "DECLINE_UNDO" });
  }

  requestNewGame(): void {
    this.makeAction({ type: "RESET" });
  }

  reset(): void {
    const { bb, wb } = this.getInitialBitboards();
    this.state.blackBoard = bb.toString(16);
    this.state.whiteBoard = wb.toString(16);
    this.state.turn = ReversiColor.BLACK;
    this.state.winner = null;
    this.state.gamePhase = ReversiGamePhase.WAITING;
    this.state.undoRequest = null;
    this.state.moveHistory = [];
    this.state.lastMove = null;
    this.state.flippedCells = [];
  }

  updatePlayers(players: Player[]): void {
    if (this.state.gamePhase !== ReversiGamePhase.WAITING) return;
    this.state.players.black = this.preparePlayer(players[0]);
    if (
      !this.state.players.white ||
      !hasFlag(this.state.players.white.flags, ReversiPlayerFlag.BOT)
    ) {
      this.state.players.white = this.preparePlayer(players[1]);
    }
  }

  getMyColor(): ReversiColor | null {
    if (this.state.players.black?.id === this.userId) return ReversiColor.BLACK;
    if (this.state.players.white?.id === this.userId) return ReversiColor.WHITE;
    return null;
  }

  getMyPlayerIndex(): number {
    const color = this.getMyColor();
    return color === ReversiColor.BLACK
      ? 0
      : color === ReversiColor.WHITE
        ? 1
        : -1;
  }

  canStartGame(): boolean {
    return this.state.players.black != null && this.state.players.white != null;
  }

  getPieceCount(): { black: number; white: number } {
    const bb = BigInt("0x" + this.state.blackBoard);
    const wb = BigInt("0x" + this.state.whiteBoard);
    return {
      black: countBitsBB(bb),
      white: countBitsBB(wb),
    };
  }
}
