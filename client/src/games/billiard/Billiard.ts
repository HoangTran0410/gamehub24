import { transString } from "../../stores/languageStore";
import { BaseGame, type GameAction, type GameResult } from "../BaseGame";
import {
  type BilliardState,
  type BilliardAction,
  type Ball,
  type PlayerSlot,
  createInitialBalls,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BALL_RADIUS,
  POCKET_RADIUS,
  POCKETS,
  FRICTION,
  MIN_VELOCITY,
  MAX_POWER,
  getBallType,
} from "./types";

export default class Billiard extends BaseGame<BilliardState> {
  private onFrameUpdate?: (balls: Ball[]) => void; // For 60fps canvas updates
  private animationFrameId: number | null = null;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private pocketedThisShot: Ball[] = []; // Track balls pocketed during current shot

  getInitState(): BilliardState {
    return {
      balls: createInitialBalls(),
      players: {
        1: {
          id: this.players[0]?.id || null,
          username: this.players[0]?.username || null,
          ballType: null,
        },
        2: {
          id: this.players[1]?.id || null,
          username: this.players[1]?.username || null,
          ballType: null,
        },
      },
      currentTurn: 1,
      gamePhase: "waiting",
      winner: null,
      lastShot: null,
      isSimulating: false,
      foul: false,
      turnMessage: null,
    };
  }

  init(): void {
    super.init();

    // IMPORTANT: Disable auto broadcast for billiard
    this.autoBroadcast = false;

    if (this.isHost) {
      // Periodic sync every 5 seconds during simulation
      this.syncIntervalId = setInterval(() => {
        if (this.state.isSimulating) {
          this.broadcastState();
        }
      }, 5000);
    }
  }

  // Register callback for 60fps frame updates (for canvas animation)
  onFrame(callback: (balls: Ball[]) => void): void {
    this.onFrameUpdate = callback;
  }

  setState(state: BilliardState): BilliardState {
    super.setState(state);

    // If receiving a shot action, start local physics simulation
    if (state.lastShot && state.isSimulating && !this.isHost) {
      this.runPhysicsLoop();
    }

    return state;
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as BilliardAction;

    switch (action.type) {
      case "SHOOT":
        if (this.isHost) {
          this.handleShoot(action.angle, action.power, action.playerId);
        } else {
          // Client received shot - run local simulation
          this.state.lastShot = {
            angle: action.angle,
            power: action.power,
            playerId: action.playerId,
          };
          this.state.isSimulating = true;
          this.applyShot(action.angle, action.power);
          this.notifyListeners(this.state);
          this.runPhysicsLoop();
        }
        break;
      case "RESET_GAME":
        if (this.isHost) this.reset();
        break;
      case "START_GAME":
        if (this.isHost) this.handleStartGame();
        break;
      case "ADD_BOT":
        if (this.isHost) this.handleAddBot();
        break;
      case "REMOVE_BOT":
        if (this.isHost) this.handleRemoveBot();
        break;
    }
  }

  private handleShoot(angle: number, power: number, playerId: string): void {
    if (this.state.gamePhase !== "playing") return;
    if (this.state.isSimulating) return;

    // Validate it's the player's turn
    const playerSlot = this.getPlayerSlot(playerId);
    if (playerSlot !== this.state.currentTurn) return;

    // Clear balls pocketed from previous shot
    this.pocketedThisShot = [];

    // Record the shot and broadcast
    this.state.lastShot = { angle, power, playerId };
    this.state.isSimulating = true;
    this.state.foul = false;
    this.state.turnMessage = null;
    this.notifyListeners(this.state);

    // Apply force to cue ball
    this.applyShot(angle, power);

    // Broadcast shot action to all clients
    this.sendSocketGameAction({
      type: "SHOOT",
      angle,
      power,
      playerId,
    });

    // Run physics simulation
    this.runPhysicsLoop();
  }

  private applyShot(angle: number, power: number): void {
    const cueBall = this.state.balls.find((b) => b.id === 0);
    if (!cueBall || cueBall.pocketed) return;

    const velocity = power * MAX_POWER;
    cueBall.vx = Math.cos(angle) * velocity;
    cueBall.vy = Math.sin(angle) * velocity;
  }

  private lastPhysicsTime: number = 0;
  private physicsAccumulator: number = 0;
  private readonly PHYSICS_TIMESTEP: number = 1000 / 60; // 16.67ms for 60 FPS

  private runPhysicsLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.lastPhysicsTime = performance.now();
    this.physicsAccumulator = 0;

    const step = (currentTime: number) => {
      const deltaTime = currentTime - this.lastPhysicsTime;
      this.lastPhysicsTime = currentTime;

      // Cap delta time to prevent spiral of death on slow devices
      const cappedDelta = Math.min(deltaTime, this.PHYSICS_TIMESTEP * 5);
      this.physicsAccumulator += cappedDelta;

      let allStopped = false;
      let physicsRan = false;

      // Run physics updates at fixed 60 FPS timestep
      while (this.physicsAccumulator >= this.PHYSICS_TIMESTEP) {
        allStopped = this.updatePhysics();
        physicsRan = true;
        this.physicsAccumulator -= this.PHYSICS_TIMESTEP;

        // Early exit if simulation ended
        if (allStopped) {
          this.physicsAccumulator = 0;
          break;
        }
      }

      // Call frame callback for smooth canvas animation (no React re-render)
      this.onFrameUpdate?.(this.state.balls);

      // Continue loop if physics hasn't run yet OR balls are still moving
      if (!physicsRan || !allStopped) {
        this.animationFrameId = requestAnimationFrame(step);
      } else {
        this.animationFrameId = null;
        this.onSimulationEnd();
      }
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  private readonly PHYSICS_SUBSTEPS = 8;

  private updatePhysics(): boolean {
    const activeBalls = this.state.balls.filter((b) => !b.pocketed);
    let allStopped = true;

    const dt = 1 / this.PHYSICS_SUBSTEPS;

    // Sub-stepping loop for movement and collisions
    for (let step = 0; step < this.PHYSICS_SUBSTEPS; step++) {
      // Update positions
      for (const ball of activeBalls) {
        if (ball.pocketed) continue;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
      }

      // Ball-to-ball collisions (one pass per sub-step is usually sufficient)
      for (let i = 0; i < activeBalls.length; i++) {
        const a = activeBalls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < activeBalls.length; j++) {
          const b = activeBalls[j];
          if (!b.pocketed) {
            this.handleBallCollision(a, b);
          }
        }
      }

      // Wall collisions
      for (const ball of activeBalls) {
        if (!ball.pocketed) {
          this.handleWallCollision(ball);
        }
      }

      // Pocket detection (check every step to prevent tunneling)
      this.checkPockets();
    }

    // Apply friction and check if stopped (once per frame)
    for (const ball of activeBalls) {
      if (ball.pocketed) continue;

      ball.vx *= FRICTION;
      ball.vy *= FRICTION;

      // Stop if velocity is negligible
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed < MIN_VELOCITY) {
        ball.vx = 0;
        ball.vy = 0;
      } else {
        allStopped = false;
      }
    }

    return allStopped;
  }

  private handleWallCollision(ball: Ball): void {
    const cushionRestitution = 0.7; // Energy loss on bounce

    // Left wall
    if (ball.x - BALL_RADIUS < 0) {
      ball.x = BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * cushionRestitution;
    }
    // Right wall
    if (ball.x + BALL_RADIUS > TABLE_WIDTH) {
      ball.x = TABLE_WIDTH - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * cushionRestitution;
    }
    // Top wall
    if (ball.y - BALL_RADIUS < 0) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy) * cushionRestitution;
    }
    // Bottom wall
    if (ball.y + BALL_RADIUS > TABLE_HEIGHT) {
      ball.y = TABLE_HEIGHT - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy) * cushionRestitution;
    }
  }

  private handleBallCollision(a: Ball, b: Ball): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;

    const minDist = BALL_RADIUS * 2;
    const minDistSq = minDist * minDist;

    // Prevent divide-by-zero
    if (distSq <= 0.0001) {
      const angle = Math.random() * Math.PI * 2;
      const push = BALL_RADIUS;
      a.x -= Math.cos(angle) * push;
      a.y -= Math.sin(angle) * push;
      b.x += Math.cos(angle) * push;
      b.y += Math.sin(angle) * push;
      return;
    }

    if (distSq >= minDistSq) return;

    const dist = Math.sqrt(distSq);

    // Collision normal (a → b)
    const nx = dx / dist;
    const ny = dy / dist;

    // --- Positional correction (separate balls) ---
    const overlap = minDist - dist;
    const separation = overlap / 2;

    a.x -= separation * nx;
    a.y -= separation * ny;
    b.x += separation * nx;
    b.y += separation * ny;

    // --- Relative velocity (b - a) ---
    const dvx = b.vx - a.vx;
    const dvy = b.vy - a.vy;

    // Velocity along normal
    const dvn = dvx * nx + dvy * ny;

    // If separating, do nothing
    if (dvn > 0) return;

    // --- Impulse (equal mass elastic collision) ---
    const restitution = 0.99;
    const impulse = (-(1 + restitution) * dvn) / 2;

    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }

  private checkPockets(): void {
    for (const ball of this.state.balls) {
      if (ball.pocketed) continue;

      for (const pocket of POCKETS) {
        const dx = ball.x - pocket.x;
        const dy = ball.y - pocket.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < POCKET_RADIUS) {
          ball.pocketed = true;
          ball.vx = 0;
          ball.vy = 0;

          // Track for continue turn logic
          this.pocketedThisShot.push(ball);

          if (ball.id === 0) {
            // Cue ball pocketed - foul
            this.state.foul = true;
          } else {
            // Assign ball type if not yet assigned
            this.assignBallType(ball);
          }
          break;
        }
      }
    }
  }

  private assignBallType(ball: Ball): void {
    if (ball.type === "eight" || ball.type === "cue") return;

    const currentPlayer = this.state.players[this.state.currentTurn];
    const otherSlot: PlayerSlot = this.state.currentTurn === 1 ? 2 : 1;
    const otherPlayer = this.state.players[otherSlot];

    // First pocketed ball assigns types
    if (!currentPlayer.ballType && !otherPlayer.ballType) {
      currentPlayer.ballType = ball.type;
      otherPlayer.ballType = ball.type === "solid" ? "stripe" : "solid";
    }
  }

  private onSimulationEnd(): void {
    this.state.isSimulating = false;
    this.notifyListeners(this.state);

    // Only the HOST determines game end and turn changes
    // Guests will receive the authoritative state via broadcast
    if (!this.isHost) {
      // Guest just updates local UI to show simulation stopped
      // but does NOT change turns - wait for host's state broadcast
      return;
    }

    // HOST ONLY: Handle game logic after simulation

    // Check for game end conditions
    const result = this.checkGameEnd();
    if (result) {
      this.state.gamePhase = "finished";
      if (result.winner) {
        this.state.winner = parseInt(result.winner) as PlayerSlot;
      }
      this.syncState();
      this.clearSavedState();
      return;
    }

    // Handle foul - respawn cue ball
    if (this.state.foul) {
      this.respawnCueBall();
      this.state.turnMessage = transString({
        en: "Foul! Cue ball pocketed.",
        vi: "Lỗi! Bóng trắng vào lỗ.",
      });
    }

    // Check if player pocketed their own ball (continue turn)
    const shouldContinue = this.checkContinueTurn();

    if (!shouldContinue || this.state.foul) {
      // Switch turns
      this.state.currentTurn = this.state.currentTurn === 1 ? 2 : 1;
    }

    // Broadcast authoritative state to all clients
    this.syncState();
    this.checkBotTurn();
  }

  private checkContinueTurn(): boolean {
    // Player continues if they pocketed at least one of their assigned balls
    const currentPlayer = this.state.players[this.state.currentTurn];
    const myBallType = currentPlayer.ballType;

    // If no ball type assigned yet and we pocketed a ball, we get to continue
    // (the ball type was just assigned in checkPockets/assignBallType)
    if (myBallType) {
      // Check if any of the pocketed balls match our assigned type
      const pocketedOwnBall = this.pocketedThisShot.some(
        (b) => b.type === myBallType,
      );

      // Also check if we're at the 8-ball stage and pocketed 8
      const allOwnBallsPocketed =
        this.state.balls.filter((b) => !b.pocketed && b.type === myBallType)
          .length === 0;

      const pocketed8Ball = this.pocketedThisShot.some((b) => b.id === 8);

      if (allOwnBallsPocketed && pocketed8Ball) {
        return true; // Won the game!
      }

      return pocketedOwnBall;
    }

    // If we just got assigned a ball type (first pocket), continue
    if (this.pocketedThisShot.length > 0) {
      const pocketedNonCue = this.pocketedThisShot.filter((b) => b.id !== 0);
      return pocketedNonCue.length > 0;
    }

    return false;
  }

  private respawnCueBall(): void {
    const cueBall = this.state.balls.find((b) => b.id === 0);
    if (cueBall) {
      cueBall.pocketed = false;
      cueBall.x = TABLE_WIDTH * 0.25;
      cueBall.y = TABLE_HEIGHT / 2;
      cueBall.vx = 0;
      cueBall.vy = 0;
    }
  }

  checkGameEnd(): GameResult | null {
    const eightBall = this.state.balls.find((b) => b.id === 8);
    if (!eightBall?.pocketed) return null;

    // 8-ball was pocketed
    const currentPlayer = this.state.players[this.state.currentTurn];

    // Check if player has cleared their balls
    const playerBallType = currentPlayer.ballType;
    if (!playerBallType) {
      // Sunk 8-ball before any balls - loses
      const winner = this.state.currentTurn === 1 ? 2 : 1;
      return { winner: winner.toString() };
    }

    const ownBallsRemaining = this.state.balls.filter(
      (b) => !b.pocketed && getBallType(b.id) === playerBallType,
    );

    if (ownBallsRemaining.length === 0) {
      // Legitimately won
      return { winner: this.state.currentTurn.toString() };
    } else {
      // Sunk 8-ball early - loses
      const winner = this.state.currentTurn === 1 ? 2 : 1;
      return { winner: winner.toString() };
    }
  }

  reset(): void {
    this.stopSimulation();
    this.state = {
      ...this.getInitState(),
      players: {
        1: {
          id: this.state.players[1].id,
          username: this.state.players[1].username,
          ballType: null,
        },
        2: {
          id: this.state.players[2].id,
          username: this.state.players[2].username,
          ballType: null,
        },
      },
      gamePhase: "waiting",
    };
    this.syncState();
  }

  updatePlayers(players: { id: string; username: string }[]): void {
    // Player 1 (Host)
    this.state.players[1].id = players[0]?.id || null;
    this.state.players[1].username = players[0]?.username || null;

    // Player 2 (Guest or Bot)
    if (players[1]) {
      // Human guest overwrites Bot
      this.state.players[2].id = players[1].id;
      this.state.players[2].username = players[1].username;
    } else {
      // No guest. If it was human, clear it. Keep Bot.
      if (this.state.players[2].id !== "BOT") {
        this.state.players[2].id = null;
        this.state.players[2].username = null;
      }
    }

    this.syncState();
  }

  // Public methods for UI

  shoot(angle: number, power: number): void {
    if (this.state.isSimulating) return;
    if (this.state.gamePhase !== "playing") return;

    const action: BilliardAction = {
      type: "SHOOT",
      angle,
      power,
      playerId: this.userId,
    };

    if (this.isHost) {
      this.handleShoot(angle, power, this.userId);
    } else {
      this.sendSocketGameAction(action);
    }
  }

  requestReset(): void {
    if (this.isHost) {
      this.reset();
    } else {
      this.sendSocketGameAction({ type: "RESET_GAME" });
    }
  }

  // Bot management
  addBot(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;

    this.state.players[2] = { id: "BOT", username: "Bot", ballType: null };
    this.syncState();
  }

  removeBot(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;
    if (this.state.players[2].id !== "BOT") return;

    this.state.players[2] = { id: null, username: null, ballType: null };
    this.syncState();
  }

  private handleAddBot(): void {
    this.addBot();
  }

  private handleRemoveBot(): void {
    this.removeBot();
  }

  // Start game
  startGame(): void {
    if (this.isHost) {
      this.handleStartGame();
    } else {
      this.sendSocketGameAction({ type: "START_GAME" });
    }
  }

  private handleStartGame(): void {
    if (this.state.gamePhase !== "waiting") return;
    if (!this.state.players[1].id || !this.state.players[2].id) return;

    this.state.gamePhase = "playing";
    this.state.balls = createInitialBalls();
    this.syncState();

    this.checkBotTurn();
  }

  canStartGame(): boolean {
    return (
      !!this.state.players[1].id &&
      !!this.state.players[2].id &&
      this.state.gamePhase === "waiting"
    );
  }

  // Bot AI
  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;
    if (this.state.isSimulating) return;

    const currentPlayerId = this.state.players[this.state.currentTurn].id;
    if (currentPlayerId === "BOT") {
      setTimeout(() => this.makeBotMove(), 800);
    }
  }

  private makeBotMove(): void {
    if (this.state.gamePhase !== "playing") return;
    if (this.state.isSimulating) return;

    const cueBall = this.state.balls.find((b) => b.id === 0);
    if (!cueBall || cueBall.pocketed) return;

    // Find target ball (any non-pocketed ball except cue)
    const targetBalls = this.state.balls.filter(
      (b) => b.id !== 0 && !b.pocketed,
    );

    if (targetBalls.length === 0) return;

    // Aim at the first available ball
    const target = targetBalls[0];
    const angle = Math.atan2(target.y - cueBall.y, target.x - cueBall.x);
    const power = 0.5 + Math.random() * 0.3; // Random power between 0.5-0.8

    this.handleShoot(angle, power, "BOT");
  }

  // Helpers
  getPlayerSlot(playerId: string): PlayerSlot | null {
    if (this.state.players[1].id === playerId) return 1;
    if (this.state.players[2].id === playerId) return 2;
    return null;
  }

  getMySlot(): PlayerSlot | null {
    return this.getPlayerSlot(this.userId);
  }

  isMyTurn(): boolean {
    const mySlot = this.getMySlot();
    return (
      mySlot === this.state.currentTurn && this.state.gamePhase === "playing"
    );
  }

  getCueBall(): Ball | undefined {
    return this.state.balls.find((b) => b.id === 0 && !b.pocketed);
  }

  private stopSimulation(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  destroy(): void {
    this.stopSimulation();
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    super.destroy();
  }
}
