import { BaseGame, type GameAction } from "../BaseGame";
import {
  type GunnyWarsState,
  type GunnyWarsAction,
  type Tank,
  type Projectile,
  GamePhase,
  WeaponType,
  type MoveDirection,
  type FireShotData,
  type PlayerInfo,
} from "./types";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  GRAVITY,
  MAX_POWER,
  MAX_FUEL,
  MOVEMENT_SPEED,
  FUEL_CONSUMPTION,
  INITIAL_HEALTH,
  WEAPONS,
  TANK_COLORS,
  type ParticleType,
} from "./constants";
import { TerrainMap, TerrainRenderer } from "./TerrainMap";
import { TerrainShaderRenderer } from "./TerrainShaderRenderer";
import { ParticleShaderRenderer } from "./ParticleShaderRenderer";
import { MAX_PARTICLES, PARTICLE_STRIDE, PARTICLE_TYPES } from "./constants";

export default class GunnyWars extends BaseGame<GunnyWarsState> {
  // TerrainMap - for efficient collision detection
  private terrainMap: TerrainMap | null = null;
  // TerrainRenderer - for chunk-based visual rendering (CPU fallback)
  private terrainRenderer: TerrainRenderer | null = null;
  // TerrainShaderRenderer - for GPU accelerated rendering
  private terrainShaderRenderer: TerrainShaderRenderer | null = null;

  // Sync modifications
  private lastSyncedModCount = 0;

  // LOCAL-ONLY simulation data (not synced over network)
  private _projectiles: Projectile[] = [];
  private _particleData = new Float32Array(MAX_PARTICLES * PARTICLE_STRIDE);
  private _particleCount = 0;
  private _particleShaderRenderer: ParticleShaderRenderer | null = null;

  get projectiles(): Projectile[] {
    return this._projectiles;
  }

  get particleData(): Float32Array {
    return this._particleData;
  }

  get particleCount(): number {
    return this._particleCount;
  }

  // Bot state
  private botState = {
    planned: false,
    moveTimer: 0,
    moveDir: 0 as MoveDirection,
    aimTimer: 0,
    targetWeapon: WeaponType.BASIC as WeaponType,
    targetAngle: 0,
    targetPower: 0,
  };

  getInitState(): GunnyWarsState {
    return {
      phase: GamePhase.WAITING,
      tanks: [],
      currentTurnIndex: 0,
      wind: 0,
      winner: null,
      turnTimeEnd: 0,
      players: this.players.map((p) => ({
        id: p.id || null,
        username: p.username || null,
        tankId: null,
      })),
      terrainSeed: Math.round(Math.random() * 10000),
      terrainMods: [],
      isSimulating: false,
    };
  }

  // Initialize terrain (use chunk-based rendering)
  initTerrain(): void {
    if (
      this.terrainMap &&
      this.terrainMap.getSeed() === this.state.terrainSeed
    ) {
      this.syncTerrain();
      return;
    }

    // Initialize TerrainMap for collision detection
    this.terrainMap = new TerrainMap(this.state.terrainSeed);
    // Initialize TerrainRenderer for chunk-based visual rendering
    this.terrainRenderer = new TerrainRenderer();

    this.lastSyncedModCount = 0;
    this.syncTerrain();
  }

  public onStateUpdate(state: GunnyWarsState): void {
    super.onStateUpdate(state);
    this.syncTerrain();
  }

  protected onSocketGameState(data: {
    state: GunnyWarsState;
    version?: number;
    roomId?: string;
  }): void {
    super.onSocketGameState(data);
    this.initTerrain();
  }

  /**
   * Keep local terrain components (map, renderer, shader) in sync with state.terrainModifications
   */
  private syncTerrain(): void {
    if (!this.terrainMap) return;

    const currentCount = this.state.terrainMods.length;
    if (currentCount === this.lastSyncedModCount) return;

    // Handle full reset or backwards sync
    if (currentCount < this.lastSyncedModCount) {
      this.terrainMap.reset(this.state.terrainSeed);
      if (this.terrainRenderer) this.terrainRenderer.clearCache();
      this.lastSyncedModCount = 0;
    }

    // Apply incremental modifications
    const newMods = this.state.terrainMods.slice(this.lastSyncedModCount);
    if (newMods.length > 0) {
      this.terrainMap.applyModifications(newMods, false); // false = append mode

      // Invalidate visual cache if CPU renderer exists
      if (this.terrainRenderer) {
        for (const mod of newMods) {
          const radius =
            mod.type === "destroy"
              ? mod.radius *
                (WEAPONS[WeaponType.BASIC].terrainDamageMultiplier || 1.2) // Default to BASIC if not found
              : mod.radius;

          if (
            mod.type === "carve" &&
            mod.vx !== undefined &&
            mod.vy !== undefined
          ) {
            this.terrainRenderer.invalidateTunnel(
              mod.x,
              mod.y,
              mod.vx,
              mod.vy,
              mod.radius,
              mod.length || 100,
            );
          } else {
            this.terrainRenderer.invalidateArea(mod.x, mod.y, radius);
          }
        }
      }

      // Update GPU shader renderer
      if (this.terrainShaderRenderer) {
        this.terrainShaderRenderer.uploadModifications(this.state.terrainMods);
      }

      this.lastSyncedModCount = currentCount;
    }
  }

  // Efficient collision check using TerrainMap
  private checkSolid(x: number, y: number): boolean {
    if (this.terrainMap) {
      return this.terrainMap.isSolid(x, y);
    }
    return false;
  }

  // Get terrain height at X position
  private getTerrainHeight(x: number): number {
    if (this.terrainMap) {
      return this.terrainMap.getTerrainHeight(x);
    }
    return WORLD_HEIGHT + 100;
  }

  // Get TerrainMap for UI rendering
  getTerrainMap(): TerrainMap | null {
    return this.terrainMap;
  }

  // Get TerrainRenderer for UI rendering (CPU fallback)
  getTerrainRenderer(): TerrainRenderer | null {
    return this.terrainRenderer;
  }

  // Get TerrainShaderRenderer for GPU rendering
  getTerrainShaderRenderer(): TerrainShaderRenderer | null {
    return this.terrainShaderRenderer;
  }

  // Initialize GPU shader renderer (call from UI with WebGL canvas)
  initShaderRenderer(canvas: HTMLCanvasElement): boolean {
    if (!this.terrainShaderRenderer) {
      this.terrainShaderRenderer = new TerrainShaderRenderer();
    }
    const success = this.terrainShaderRenderer.init(canvas);
    if (success && this.terrainMap) {
      this.terrainShaderRenderer.uploadModifications(this.state.terrainMods);
    }

    // Also init particle renderer
    const gl = canvas.getContext("webgl2");
    if (gl) {
      if (!this._particleShaderRenderer) {
        this._particleShaderRenderer = new ParticleShaderRenderer();
      }
      this._particleShaderRenderer.init(gl);
    }

    return success;
  }

  getParticleShaderRenderer(): ParticleShaderRenderer | null {
    return this._particleShaderRenderer;
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Socket action handler
  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as GunnyWarsAction;

    console.log("onSocketGameAction", data);

    switch (action.type) {
      // guest/host simulate
      case "FIRE_SHOT":
        this.fireTank(action.shot);
        break;
      case "COMMIT_ANGLE":
        this.handleCommitAngle(action.angle, action.playerId);
        break;
      case "COMMIT_POWER":
        this.handleCommitPower(action.power, action.playerId);
        break;
      case "SELECT_WEAPON":
        this.handleSelectWeapon(action.weapon, action.playerId);
        break;
      case "MOVE_START":
        this.handleMoveStart(action.direction, action.x, action.playerId);
        break;
      case "MOVE_STOP":
        this.handleMoveStop(action.x, action.y, action.fuel, action.playerId);
        break;
      case "REGENERATE_MAP":
        this.handleRegenerateMap(action.seed);
        break;

      default:
        if (!this.isHost) return;

        switch (action.type) {
          case "FIRE":
            this.handleFire(action.playerId);
            break;
          case "START_GAME":
            this.handleStartGame();
            break;
          case "RESET_GAME":
            this.reset();
            break;
          case "ADD_BOT":
            this.addBot();
            break;
          case "REMOVE_BOT":
            this.removeBot();
            break;
        }
    }
  }

  // --- Action Handlers ---

  // Syncs final angle from UI (called on slider release)
  private handleCommitAngle(angle: number, playerId: string): void {
    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;
    if (!this.isPlayerTurn(playerId)) return;
    if (this.state.phase !== GamePhase.AIMING) return;

    tank.angle = Math.max(0, Math.min(180, angle));

    // update simulation
    const sim = this._tankSimulations.get(tank.id);
    if (sim) sim.angle = tank.angle;
  }

  // Syncs final power from UI (called on slider release)
  private handleCommitPower(power: number, playerId: string): void {
    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;
    if (!this.isPlayerTurn(playerId)) return;
    if (this.state.phase !== GamePhase.AIMING) return;

    tank.power = Math.max(0, Math.min(100, power));
  }

  private handleSelectWeapon(weapon: WeaponType, playerId: string): void {
    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;
    if (!this.isPlayerTurn(playerId)) return;
    if (this.state.phase !== GamePhase.AIMING) return;

    tank.weapon = weapon;
  }

  // Called when player starts moving - set flags for optimistic sync
  private handleMoveStart(
    direction: MoveDirection,
    _x: number,
    playerId: string,
  ): void {
    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;
    if (!this.isPlayerTurn(playerId)) return;
    if (this.state.phase !== GamePhase.AIMING) return;

    // Set movement flags - all clients will simulate locally
    tank.isMoving = true;
    tank.moveDir = direction;
  }

  // Called when player stops moving - clear flags and sync final position
  private handleMoveStop(
    x: number,
    y: number,
    fuel: number,
    playerId: string,
  ): void {
    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;
    if (!this.isPlayerTurn(playerId)) return;
    if (this.state.phase !== GamePhase.AIMING) return;

    // Clear movement flags and sync final position
    tank.isMoving = false;
    tank.moveDir = undefined;
    tank.x = x;
    tank.y = y;
    tank.fuel = fuel;

    // Clear simulation
    this._tankSimulations.delete(tank.id);
  }

  private handleFire(playerId: string): void {
    if (!this.isHost) return;
    if (this.state.phase !== GamePhase.AIMING) return;
    if (!this.isPlayerTurn(playerId)) return;

    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;

    // Create deterministic shot data
    const shotData: FireShotData = {
      tankId: tank.id,
      x: tank.x,
      y: tank.y,
      angle: tank.angle,
      power: tank.power,
      weapon: tank.weapon,
      wind: this.state.wind,
      seed: Math.random(),
    };

    // Broadcast to all clients (including self)
    this.makeAction({ type: "FIRE_SHOT", shot: shotData });
  }

  // --- Game Logic ---

  // Track local position for smooth movement without state updates
  private _tankSimulations = new Map<
    string,
    {
      x: number;
      y: number;
      fuel: number;
      angle: number;
      health: number;
      falling: boolean;
    }
  >();

  public update(): void {
    // Keep terrain in sync
    this.syncTerrain();

    if (!this.terrainMap) return;

    if (this.state.phase === GamePhase.AIMING) {
      this.state.tanks.forEach((tank) => {
        // If tank is moving (flag from server/local action), simulate it
        if (tank.isMoving && tank.moveDir) {
          // Get current sim state or init from tank
          let simState = this._tankSimulations.get(tank.id);
          if (!simState) {
            simState = {
              x: tank.x,
              y: tank.y,
              fuel: tank.fuel,
              angle: tank.angle,
              health: tank.health,
              falling: false,
            };
            this._tankSimulations.set(tank.id, simState);
          }

          // Create a temp tank with sim properties for calculation
          const simTank = { ...tank, ...simState };
          const moveResult = this.calculateTankMovement(simTank, tank.moveDir);

          if (moveResult) {
            // Update SIMULATION state only
            simState.x = moveResult.x;
            simState.y = moveResult.y;
            simState.fuel = moveResult.fuel;
          } else {
            // If this is the local player, tell server we stopped
            if (tank.playerId === this.userId) {
              this.moveStop();
            }

            // Stop moving if logic fails
            tank.isMoving = false;
            tank.moveDir = undefined;
            this._tankSimulations.delete(tank.id);
          }
        } else {
          // Not moving, clear sim if exists
          if (this._tankSimulations.has(tank.id)) {
            this._tankSimulations.delete(tank.id);
          }
        }
      });
    }

    // Physics Simulation (Gravity, Projectiles, Particles)
    const tanksMoving = this.updateTankPhysics();
    const projectilesMoving = this.updateProjectilePhysics();
    const particlesMoving = this.updateParticlePhysics();

    const allSettled = this.checkPhaseTransitions(
      tanksMoving,
      projectilesMoving,
      particlesMoving,
    );

    if (allSettled && this.state.isSimulating) {
      this.onSimulationEnd();
    }
  }

  // Helper for UI to get the *visual* tank state (including local simulation)
  public getVisualTank(tank: Tank): Tank {
    const sim = this._tankSimulations.get(tank.id);
    if (sim) {
      return { ...tank, ...sim };
    }
    return tank;
  }

  public gravityTank(x: number, y: number, health: number) {
    const result = {
      x,
      y,
      health,
      moving: false,
    };
    if (result.health <= 0) return result;

    if (!this.checkSolid(result.x, result.y + 1)) {
      result.y += 3; // Fall speed
      result.moving = true;
      if (result.y > WORLD_HEIGHT) result.health = 0;
    } else {
      // Pop up if stuck
      while (this.checkSolid(result.x, result.y)) {
        result.y--;
        result.moving = true;
      }
    }

    return result;
  }

  public calculateTankMovement(
    tank: Tank,
    moveDir: MoveDirection,
  ): {
    x: number;
    y: number;
    fuel: number;
    angle: number;
  } | null {
    if (!this.terrainMap || tank.fuel <= 0) return null;

    let { x, y, fuel, angle } = tank;

    // if (moveDir === -1) {
    //   angle = Math.max(90, Math.min(180, angle));
    // } else {
    //   angle = Math.max(0, Math.min(90, angle));
    // }

    const nextX = Math.max(
      15,
      Math.min(WORLD_WIDTH - 15, x + moveDir * MOVEMENT_SPEED),
    );
    const solidAtFoot = this.checkSolid(nextX, y);

    // Slope Climbing
    if (solidAtFoot) {
      let climbed = false;
      for (let i = 1; i <= 5; i++) {
        if (!this.checkSolid(nextX, y - i)) {
          x = nextX;
          y -= i;
          climbed = true;
          break;
        }
      }
      if (climbed) {
        fuel -= FUEL_CONSUMPTION;
      }
    } else {
      x = nextX;
      fuel -= FUEL_CONSUMPTION;

      // Downward Slope
      for (let i = 1; i <= 5; i++) {
        if (this.checkSolid(x, y + i)) {
          y += i - 1;
          break;
        }
      }
    }

    return { x, y, fuel: Math.max(0, fuel), angle };
  }

  private fireTank(shot: FireShotData): void {
    this.state.phase = GamePhase.FIRING;
    this.state.isSimulating = true;

    const rad = (shot.angle * Math.PI) / 180;
    const speed = (shot.power / 100) * MAX_POWER;

    // Barrel length - spawn projectile at barrel tip to avoid immediate collision
    const barrelLength = 30;

    const createProj = (
      angleOffset: number = 0,
      seedOffset: number = 0,
    ): Projectile => {
      const finalRad = rad + (angleOffset * Math.PI) / 180;
      // Spawn at barrel tip position
      const spawnX = shot.x + Math.cos(finalRad) * barrelLength;
      const spawnY = shot.y - 10 - Math.sin(finalRad) * barrelLength;
      return {
        id: (shot.seed + seedOffset).toString(36),
        x: spawnX,
        y: spawnY,
        vx: Math.cos(finalRad) * speed,
        vy: -Math.sin(finalRad) * speed,
        radius: 5,
        weapon: shot.weapon,
        ownerId: shot.tankId,
        active: true,
        bounces: shot.weapon === WeaponType.BOUNCY ? 3 : undefined,
      };
    };

    const weaponData = WEAPONS[shot.weapon];
    const count = weaponData.count;
    const spread = weaponData.spread || 0;

    for (let i = 0; i < count; i++) {
      let angleOffset = 0;
      if (count > 1) {
        angleOffset = -(((count - 1) * spread) / 2) + i * spread;
      }
      this._projectiles.push(createProj(angleOffset, i * 0.001));
    }

    // Set phase after projectiles are created
    this.state.phase = GamePhase.PROJECTILE_MOVING;
  }

  private updateTankPhysics(): boolean {
    let tanksMoving = false;

    // --- Tank Gravity using LOCAL simulation (no socket sync per frame) ---
    this.state.tanks.forEach((tank) => {
      if (tank.health <= 0) {
        this._tankSimulations.delete(tank.id);
        return;
      }

      // Get or create simulation for this tank
      let sim = this._tankSimulations.get(tank.id);
      if (!sim) {
        sim = {
          x: tank.x,
          y: tank.y,
          fuel: tank.fuel,
          angle: tank.angle,
          health: tank.health,
          falling: false,
        };
        this._tankSimulations.set(tank.id, sim);
      }

      // If sim is not falling, sync position from state (in case state was updated externally)
      if (!sim.falling && !tank.isMoving) {
        sim.x = tank.x;
        sim.y = tank.y;
        sim.health = tank.health;
      }

      // Apply gravity to LOCAL simulation
      const { x, y, health, moving } = this.gravityTank(
        sim.x,
        sim.y,
        sim.health,
      );

      if (moving) {
        sim.x = x;
        sim.y = y;
        sim.health = health;
        sim.falling = true;
        tanksMoving = true;
      } else if (sim.falling) {
        // Tank just stopped falling - sync to state ONCE
        sim.falling = false;
        tank.x = sim.x;
        tank.y = sim.y;
        tank.health = sim.health;
      }
    });

    return tanksMoving;
  }

  private updateProjectilePhysics(): boolean {
    let projectilesMoving = false;

    this._projectiles.forEach((p) => {
      if (!p.active) return;

      // Landmines don't move after being armed
      // if (p.weapon === WeaponType.LANDMINE_ARMED) {
      //   this.checkLandmineExplosion(p);
      //   return;
      // }

      projectilesMoving = true;

      // Apply physics
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GRAVITY;
      p.vx += this.state.wind;

      // Trail particles
      if (p.weapon === WeaponType.METEOR_STRIKE) {
        for (let i = 0; i < 3; i++) this.createTrailParticle(p);
      } else if (Math.random() > 0.3) {
        this.createTrailParticle(p);
      }

      // Tank collision
      if (this.checkProjectileTankCollision(p)) {
        return;
      }

      // Out of bounds
      if (p.x < 0 || p.x > WORLD_WIDTH || p.y > WORLD_HEIGHT) {
        p.active = false;
        return;
      }

      // Terrain collision
      if (this.checkSolid(p.x, p.y)) {
        if (p.weapon === WeaponType.BOUNCY && (p.bounces || 0) > 0) {
          // Bounce!
          p.vy = -p.vy * 0.6; // Reverse and lose some energy
          p.vx *= 0.8; // Friction
          p.bounces = (p.bounces || 0) - 1;

          // Push out of terrain to avoid sticking
          let safety = 0;
          while (this.checkSolid(p.x, p.y) && safety < 10) {
            p.y -= 2;
            safety++;
          }

          // Visual spark effect
          this.createParticles(p.x, p.y, 5, PARTICLE_TYPES.spark, 1);
        } else {
          this.explode(p);
        }
      }
    });

    // Cleanup inactive projectiles
    this._projectiles = this._projectiles.filter((p) => p.active);

    return projectilesMoving;
  }

  private checkProjectileTankCollision(p: Projectile): boolean {
    for (const tank of this.state.tanks) {
      if (tank.health <= 0) continue;

      // Prevent self-collision immediately after firing
      if (
        tank.id === p.ownerId &&
        Math.abs(p.x - tank.x) < 20 &&
        Math.abs(p.y - tank.y) < 20
      )
        continue;

      const dx = tank.x - p.x;
      const dy = tank.y - 10 - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < 15) {
        this.explode(p);
        return true;
      }
    }
    return false;
  }

  private updateParticlePhysics(): boolean {
    if (this._particleCount === 0) return false;

    for (let i = 0; i < this._particleCount; i++) {
      const idx = i * PARTICLE_STRIDE;

      // Update basic physics
      this._particleData[idx + 0] += this._particleData[idx + 2]; // x += vx
      this._particleData[idx + 1] += this._particleData[idx + 3]; // y += vy
      this._particleData[idx + 4] -= this._particleData[idx + 5]; // life -= decay

      // Special smoke behavior
      const type = this._particleData[idx + 7];
      if (type === PARTICLE_TYPES.smoke) {
        this._particleData[idx + 3] -= 0.05; // vy -= 0.05 (rising)
        this._particleData[idx + 6] += 0.1; // size += 0.1
      }

      // Check for death
      if (this._particleData[idx + 4] <= 0) {
        // Swap with last active particle
        if (this._particleCount > 1) {
          const lastIdx = (this._particleCount - 1) * PARTICLE_STRIDE;
          this._particleData.copyWithin(
            idx,
            lastIdx,
            lastIdx + PARTICLE_STRIDE,
          );
        }
        this._particleCount--;
        i--; // Re-check this index as it now contains the swapped particle
      }
    }

    return this._particleCount > 0;
  }

  private checkPhaseTransitions(
    tanksMoving: boolean,
    projectilesMoving: boolean,
    particlesMoving: boolean,
  ): boolean {
    const state = this.state;

    // Check if any moving projectiles remain (excluding landmines)
    const activeMovingProjectilesCount = this._projectiles.filter(
      (p) => p.active,

      // && p.weapon !== WeaponType.LANDMINE_ARMED,
    ).length;

    if (
      activeMovingProjectilesCount === 0 &&
      state.phase === GamePhase.PROJECTILE_MOVING
    ) {
      state.phase = GamePhase.IMPACT;
      state.turnTimeEnd = Date.now() + 1000; // 1 second delay after impact
    }

    // Handle impact delay
    if (state.phase === GamePhase.IMPACT) {
      if (state.turnTimeEnd <= Date.now()) {
        // Only end simulation if tanks have settled
        if (!tanksMoving) {
          return true; // End simulation
        }
      }
    }

    // Standard stop check
    return (
      !tanksMoving &&
      !projectilesMoving &&
      !particlesMoving &&
      !state.tanks.some((t) => t.isMoving) && // Check if any tank is walking
      state.phase !== GamePhase.IMPACT &&
      state.phase !== GamePhase.PROJECTILE_MOVING
    );
  }

  private explode(projectile: Projectile): void {
    const weapon = WEAPONS[projectile.weapon] || WEAPONS[WeaponType.BASIC];

    // Landmine deployment
    // if (weapon.type === WeaponType.LANDMINE) {
    //   projectile.weapon = WeaponType.LANDMINE_ARMED;
    //   projectile.vx = 0;
    //   projectile.vy = 0;
    //   projectile.y -= 2;
    //   return;
    // }

    // Terrain effects - Push to state (Host only)
    if (this.isHost) {
      if (weapon.type === WeaponType.BUILDER) {
        this.state.terrainMods.push({
          type: "add",
          x: Math.round(projectile.x),
          y: Math.round(projectile.y),
          radius: Math.round(weapon.radius),
        });
      } else if (weapon.type === WeaponType.DRILL) {
        this.state.terrainMods.push({
          type: "carve",
          x: Math.round(projectile.x),
          y: Math.round(projectile.y),
          vx: projectile.vx,
          vy: projectile.vy,
          radius: Math.round(weapon.radius),
          length: 150,
        });
      } else if (
        weapon.type !== WeaponType.TELEPORT &&
        weapon.type !== WeaponType.AIRSTRIKE &&
        weapon.type !== WeaponType.HEAL
      ) {
        const destroyRadius = weapon.radius * weapon.terrainDamageMultiplier;
        this.state.terrainMods.push({
          type: "destroy",
          x: Math.round(projectile.x),
          y: Math.round(projectile.y),
          radius: Math.round(destroyRadius),
        });
      }
    }

    // Sync local map immediately for the next step of simulation
    this.syncTerrain();

    // Visual effects
    this.createExplosionParticles(projectile.x, projectile.y, weapon);

    // Special abilities
    this.handleSpecialWeapons(projectile, weapon);

    // Damage/Heal - Host only
    if (this.isHost && weapon.damage > 0) {
      this.state.tanks.forEach((tank) => {
        const dx = tank.x - projectile.x;
        const dy = tank.y - 10 - projectile.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < weapon.radius + 20) {
          const magnitude = Math.floor(
            weapon.damage * (1 - dist / (weapon.radius + 50)),
          );
          if (magnitude > 0) {
            if (weapon.type === WeaponType.HEAL) {
              tank.health = Math.min(tank.maxHealth, tank.health + magnitude);
            } else if (weapon.type === WeaponType.VAMPIRE) {
              tank.health = Math.max(0, tank.health - magnitude);
              // Heal the owner
              const owner = this.state.tanks.find(
                (t) => t.id === projectile.ownerId,
              );
              if (owner) {
                owner.health = Math.min(
                  owner.maxHealth,
                  owner.health + magnitude,
                );
              }
            } else {
              tank.health = Math.max(0, tank.health - magnitude);
            }
          }
        }
      });
    }

    // Visual effects (Local to all clients)
    if (weapon.damage > 0) {
      this.state.tanks.forEach((tank) => {
        const dx = tank.x - projectile.x;
        const dy = tank.y - 10 - projectile.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < weapon.radius + 20) {
          const magnitude = Math.floor(
            weapon.damage * (1 - dist / (weapon.radius + 50)),
          );
          if (magnitude > 0) {
            if (weapon.type === WeaponType.HEAL) {
              this.createParticles(
                tank.x,
                tank.y - 10,
                8,
                PARTICLE_TYPES.glow,
                1,
                "#4ade80",
              );
            } else {
              this.createParticles(
                tank.x,
                tank.y - 10,
                10,
                PARTICLE_TYPES.spark,
                2,
              );
            }
          }
        }
      });
    }

    projectile.active = false;
  }

  private handleSpecialWeapons(
    projectile: Projectile,
    weapon: (typeof WEAPONS)[WeaponType],
  ): void {
    // Teleport
    if (weapon.type === WeaponType.TELEPORT) {
      if (!this.isHost) return; // Host only handles teleport movement
      const owner = this.state.tanks.find((t) => t.id === projectile.ownerId);
      if (owner) {
        let target: Tank | null = null;
        let closestDist = weapon.radius + 15;

        for (const t of this.state.tanks) {
          if (t.id === owner.id || t.health <= 0) continue;
          const dist = Math.sqrt(
            Math.pow(t.x - projectile.x, 2) +
              Math.pow(t.y - 10 - projectile.y, 2),
          );
          if (dist < closestDist) {
            closestDist = dist;
            target = t;
          }
        }

        if (target) {
          // Swap positions
          const tx = target.x;
          const ty = target.y;
          target.x = owner.x;
          target.y = owner.y;
          owner.x = tx;
          owner.y = ty;
        } else {
          // Teleport to impact
          owner.x = projectile.x;
          owner.y = projectile.y;
          let safety = 0;
          while (this.checkSolid(owner.x, owner.y) && safety < 50) {
            owner.y--;
            safety++;
          }
        }
      }
    }

    // Airstrike - Semi-deterministic
    if (weapon.type === WeaponType.AIRSTRIKE) {
      // Use projectile ID as base for seed
      const baseSeed = Number(projectile.id) || 0;

      for (let i = 0; i < 8; i++) {
        const seed = baseSeed + i * 0.1;
        const offset = (this.seededRandom(seed) - 0.5) * 100;
        const yOffset = -this.seededRandom(seed + 0.05) * 200;

        this._projectiles.push({
          id: (baseSeed + 1 + i * 0.1).toString(),
          x: projectile.x + offset,
          y: yOffset,
          vx: 0,
          vy: 5 + this.seededRandom(seed + 0.07) * 5,
          radius: 5,
          weapon: WeaponType.AIRSTRIKE_BOMB,
          ownerId: projectile.ownerId,
          active: true,
        });
      }
    }

    // MIRV Spawning
    if (weapon.type === WeaponType.MIRV) {
      // Use projectile position/id as seed base
      const baseSeed = Number(projectile.id) || projectile.x;

      for (let i = 0; i < 5; i++) {
        const seed = baseSeed + i * 0.13;
        // Spawn slightly above impact to avoid getting stuck
        const vx = (this.seededRandom(seed) - 0.5) * 12;
        const vy = -3 - this.seededRandom(seed + 0.05) * 8;

        this._projectiles.push({
          id: (baseSeed + i + 100).toString(36),
          x: projectile.x,
          y: projectile.y - 10,
          vx,
          vy,
          radius: 5,
          weapon: WeaponType.MIRV_MINI,
          ownerId: projectile.ownerId,
          active: true,
        });
      }
    }

    // Meteor Strike Trigger
    if (weapon.type === WeaponType.METEOR) {
      this._projectiles.push({
        id: (Number(projectile.id) + 1000).toString(),
        x: projectile.x,
        y: -1000,
        vx: projectile.vx * 0.1 + this.state.wind * 10,
        vy: 6, // Slower fall
        radius: 40, // Larger visual size
        weapon: WeaponType.METEOR_STRIKE,
        ownerId: projectile.ownerId,
        active: true,
      });
    }
  }

  private createExplosionParticles(
    x: number,
    y: number,
    weapon: (typeof WEAPONS)[WeaponType],
  ): void {
    if (weapon.type === WeaponType.NUKE) {
      this.createParticles(x, y, 100, PARTICLE_TYPES.smoke, 3);
      this.createParticles(x, y, 50, PARTICLE_TYPES.smoke, 2);
      this.createParticles(x, y, 30, PARTICLE_TYPES.glow, 4, "#d946ef");
    } else if (weapon.type === WeaponType.TELEPORT) {
      this.createParticles(x, y, 30, PARTICLE_TYPES.glow, 2, "#c084fc");
      this.createParticles(x, y, 20, PARTICLE_TYPES.spark, 3, "#ffffff");
    } else if (weapon.type === WeaponType.METEOR_STRIKE) {
      this.createParticles(x, y, 150, PARTICLE_TYPES.fire, 6, undefined, 0.3); // 5x longer life
      this.createParticles(x, y, 50, PARTICLE_TYPES.smoke, 3, undefined, 0.3);
      this.createParticles(x, y, 50, PARTICLE_TYPES.glow, 8, "#ff4500", 0.4);
      // Column of fire
      // for (let i = 0; i < 5; i++) {
      //   this.createParticles(x, y - i * 15, 10, PARTICLE_TYPES.fire, 2, undefined, 0.4);
      // }
    } else if (weapon.type === WeaponType.BUILDER) {
      this.createParticles(x, y, 20, PARTICLE_TYPES.smoke, 1, "#64748b");
    }
    // else if (weapon.type === WeaponType.LANDMINE_ARMED) {
    //   this.createParticles(x, y, 40, PARTICLE_TYPES.fire, 2, "#ef4444");
    // }
    else if (weapon.type === WeaponType.HEAL) {
      this.createParticles(x, y, 20, PARTICLE_TYPES.glow, 2, "#4ade80");
      this.createParticles(x, y, 15, PARTICLE_TYPES.spark, 1.5, "#ffffff");
    } else {
      this.createParticles(x, y, 20, PARTICLE_TYPES.fire, 1.5);
      this.createParticles(x, y, 20, PARTICLE_TYPES.smoke, 1);
    }
  }

  private createTrailParticle(p: Projectile): void {
    const colors: Partial<Record<WeaponType, string>> = {
      [WeaponType.NUKE]: "#d946ef",
      [WeaponType.DRILL]: "#94a3b8",
      [WeaponType.TELEPORT]: "#c084fc",
      [WeaponType.AIRSTRIKE]: "#ef4444",
      [WeaponType.AIRSTRIKE_BOMB]: "#ef4444",
      [WeaponType.BUILDER]: "#60a5fa",
      [WeaponType.HEAL]: "#4ade80",
      [WeaponType.METEOR_STRIKE]: "#fb923c",
    };

    const color = colors[p.weapon];
    if (color) {
      this.createParticles(p.x, p.y, 1, PARTICLE_TYPES.glow, 0.3, color);
    } else {
      this.createParticles(
        p.x,
        p.y,
        1,
        PARTICLE_TYPES.smoke,
        0,
        "rgba(255,255,255,0.5)",
        5,
      );
    }
  }

  private createParticles(
    x: number,
    y: number,
    count: number,
    type: ParticleType,
    speedMulti: number = 1,
    colorOverride?: string,
    decayMulti: number = 1,
  ): void {
    const limit = 100; // Increased limit because it's much faster now
    const actualCount = Math.min(count, limit);

    for (let i = 0; i < actualCount; i++) {
      if (this._particleCount >= MAX_PARTICLES) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 * speedMulti;

      let colorStr = "#fff";
      let decay = 0.02;
      let size = Math.random() * 3 + 1;
      let typeNum = PARTICLE_TYPES.smoke;
      let additive = 0;

      if (type === PARTICLE_TYPES.fire) {
        colorStr =
          colorOverride || (Math.random() > 0.5 ? "#fbbf24" : "#ef4444");
        decay = 0.04 * decayMulti;
        size = Math.random() * 6 + 4;
        typeNum = PARTICLE_TYPES.fire;
        additive = 1;
      } else if (type === PARTICLE_TYPES.smoke) {
        colorStr = colorOverride || "#64748b"; // Simplified for default
        decay = 0.02 * decayMulti;
        size = Math.random() * 8 + 4;
        typeNum = PARTICLE_TYPES.smoke;
      } else if (type === PARTICLE_TYPES.spark) {
        colorStr = colorOverride || "#facc15";
        decay = 0.08 * decayMulti;
        size = Math.random() * 2 + 1;
        typeNum = PARTICLE_TYPES.spark;
        additive = 1;
      } else if (type === PARTICLE_TYPES.glow) {
        colorStr = colorOverride || "#22c55e";
        decay = 0.05 * decayMulti;
        size = Math.random() * 5 + 2;
        typeNum = PARTICLE_TYPES.glow;
        additive = 1;
      }

      // Parse color to RGB
      const r = parseInt(colorStr.slice(1, 3), 16) / 255 || 1;
      const g = parseInt(colorStr.slice(3, 5), 16) / 255 || 1;
      const b = parseInt(colorStr.slice(5, 7), 16) / 255 || 1;

      const idx = this._particleCount * PARTICLE_STRIDE;
      this._particleData[idx + 0] = x;
      this._particleData[idx + 1] = y;
      this._particleData[idx + 2] = Math.cos(angle) * speed;
      this._particleData[idx + 3] = Math.sin(angle) * speed;
      this._particleData[idx + 4] = 1.0; // life
      this._particleData[idx + 5] = decay;
      this._particleData[idx + 6] = size;
      this._particleData[idx + 7] = typeNum;
      this._particleData[idx + 8] = r;
      this._particleData[idx + 9] = g;
      this._particleData[idx + 10] = b;
      this._particleData[idx + 11] = additive;

      this._particleCount++;
    }
  }

  private onSimulationEnd(): void {
    if (!this.state.isSimulating) return;

    this.state.isSimulating = false;

    // Check winner
    const aliveTanks = this.state.tanks.filter((t) => t.health > 0);
    if (aliveTanks.length <= 1) {
      this.state.phase = GamePhase.GAME_OVER;
      if (aliveTanks.length === 1) {
        const winner = aliveTanks[0];
        const winnerPlayer = this.state.players.find(
          (p) => p.id === winner.playerId,
        );
        this.state.winner =
          winnerPlayer?.username || (winner.isBot ? "Bot" : "Player");
      } else {
        this.state.winner = "Draw";
      }
      return;
    }

    // Next turn
    this.nextTurn();

    // Check bot turn
    this.checkBotTurn();
  }

  private nextTurn(): void {
    const state = this.state;
    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.tanks.length;

    // Skip dead tanks
    while (state.tanks[state.currentTurnIndex].health <= 0) {
      state.currentTurnIndex =
        (state.currentTurnIndex + 1) % state.tanks.length;
    }

    const nextTank = state.tanks[state.currentTurnIndex];
    nextTank.fuel = MAX_FUEL;

    // Reset bot plan
    this.botState.planned = false;

    state.phase = GamePhase.AIMING;
    state.wind = Math.random() * 0.05 - 0.025;
  }

  // --- Bot AI ---

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.phase !== GamePhase.AIMING) return;
    if (this.state.isSimulating) return;

    const currentTank = this.state.tanks[this.state.currentTurnIndex];
    if (currentTank?.isBot) {
      setTimeout(() => this.runBotTurn(), 500);
    }
  }

  private runBotTurn(): void {
    const bot = this.state.tanks[this.state.currentTurnIndex];
    if (!bot || !bot.isBot || this.state.phase !== GamePhase.AIMING) return;

    // Planning
    if (!this.botState.planned) {
      this.planBotMove(bot);
      this.botState.planned = true;
    }

    // Execute with delay for visual effect
    this.executeBotPlan(bot);
  }

  private planBotMove(bot: Tank): void {
    this.botState.moveDir = Math.random() > 0.5 ? 1 : -1;
    this.botState.moveTimer = Math.floor(Math.random() * 30);
    this.botState.aimTimer = 1; // instant aim

    const target = this.state.tanks.find(
      (t) => t.id !== bot.id && t.health > 0,
    );
    if (!target) return;

    // Health critical -> Heal
    if (bot.health < 35) {
      this.botState.targetWeapon = WeaponType.HEAL;
      this.botState.targetAngle = 90;
      this.botState.targetPower = 15;
    }
    // Falling / bad position -> Teleport
    else if (bot.y > WORLD_HEIGHT - 300) {
      this.botState.targetWeapon = WeaponType.TELEPORT;
      const dx = WORLD_WIDTH / 2 - bot.x;
      this.botState.targetAngle = dx > 0 ? 60 : 120;
      this.botState.targetPower = 80;
    }
    // Attack
    else {
      const dx = target.x - bot.x;
      const dist = Math.abs(dx);
      const direction = dx > 0 ? 1 : -1;

      // Select weapon based on distance
      if (dist < 400) {
        this.botState.targetWeapon =
          Math.random() > 0.5 ? WeaponType.SCATTER : WeaponType.DRILL;
      } else if (dist > 800) {
        this.botState.targetWeapon =
          Math.random() > 0.6 ? WeaponType.NUKE : WeaponType.BASIC;
      } else {
        const options = [
          WeaponType.BASIC,
          WeaponType.BARRAGE,
          // WeaponType.LANDMINE,
        ];
        this.botState.targetWeapon =
          options[Math.floor(Math.random() * options.length)];
      }

      // Calculate angle and power
      const baseAngle = direction > 0 ? 45 : 135;
      this.botState.targetAngle = baseAngle + (Math.random() * 10 - 5);

      const idealVel = Math.sqrt(dist * GRAVITY);
      const idealPower = (idealVel / MAX_POWER) * 100;
      const heightDiff = target.y - bot.y;
      const heightAdjustment = heightDiff * 0.1;

      this.botState.targetPower = Math.max(
        10,
        Math.min(100, idealPower + heightAdjustment + (Math.random() * 10 - 5)),
      );
    }
  }

  private executeBotPlan(bot: Tank): void {
    // Set movement flags at start (if bot needs to move)
    if (this.botState.moveTimer > 0 && !bot.isMoving) {
      bot.isMoving = true;
      bot.moveDir = this.botState.moveDir; // Safe: moveDir is -1 or 1 here
      if (this.botState.moveDir === -1) {
        bot.angle = Math.max(90, Math.min(180, bot.angle));
      } else {
        bot.angle = Math.max(0, Math.min(90, bot.angle));
      }
    }

    const step = () => {
      console.log("step");

      // Move phase - done locally by UI/game loop
      if (this.botState.moveTimer > 0) {
        this.botState.moveTimer--;
        if (this.botState.moveTimer <= 0) {
          // Movement finished - clear flag, position already updated by local sim
          bot.isMoving = false;
          bot.moveDir = undefined;
        }
        requestAnimationFrame(step);
        return;
      }

      // Aim phase
      if (this.botState.aimTimer > 0) {
        bot.weapon = this.botState.targetWeapon;

        // Faster interpolation
        const angDiff = this.botState.targetAngle - bot.angle;
        bot.angle += angDiff * 0.4;

        const pwrDiff = this.botState.targetPower - bot.power;
        bot.power += pwrDiff * 0.4;

        this.botState.aimTimer--;
        requestAnimationFrame(step);
        return;
      }

      // Fire!
      bot.angle = this.botState.targetAngle;
      bot.power = this.botState.targetPower;
      this.handleFire(bot.playerId || "BOT");
    };

    requestAnimationFrame(step);
  }

  // --- Public API ---

  startGame(): void {
    this.handleStartGame();
  }

  private handleStartGame(): void {
    if (this.state.phase !== GamePhase.WAITING) return;

    // Initialize terrain
    this.initTerrain();

    // Create tanks - spread them out across the world
    const playerCount = this.state.players.length;
    const spacing = WORLD_WIDTH / (playerCount + 1);

    this.state.tanks = this.state.players.map((player, index) => {
      const tankId = `tank-${index + 1}`;
      player.tankId = tankId;

      const x = Math.floor(spacing * (index + 1));
      const y = this.getTerrainHeight(x);

      return {
        id: tankId,
        name: player.username || (player.id === "BOT" ? "Bot" : "Player"),
        playerId: player.id,
        isBot: player.id === "BOT",
        x,
        y,
        angle: 45,
        power: 50,
        health: INITIAL_HEALTH,
        maxHealth: INITIAL_HEALTH,
        color: TANK_COLORS[index % TANK_COLORS.length],
        weapon: WeaponType.BASIC,
        fuel: MAX_FUEL,
      };
    });

    this.state.phase = GamePhase.AIMING;
    this.state.wind = Math.random() * 0.05 - 0.025;
    this.state.currentTurnIndex = 0;

    this.checkBotTurn();
  }

  reset(): void {
    this.state.phase = GamePhase.WAITING;
    this.state.tanks = [];
    this.state.currentTurnIndex = 0;
    this.state.wind = 0;
    this.state.winner = null;
    this.state.turnTimeEnd = 0;
    this.state.players.forEach((p) => {
      p.tankId = null;
    });
    this.state.terrainSeed = Math.round(Math.random() * 10000);
    this.state.terrainMods = [];
    this.state.isSimulating = false;

    this._tankSimulations.clear();
    this.initTerrain();
  }

  addBot(): void {
    if (!this.isHost) return;
    if (this.state.phase !== GamePhase.WAITING) return;
    this.state.players.push({
      id: "BOT",
      username: `Bot ${this.state.players.filter((p) => p.id === "BOT").length + 1}`,
      tankId: null,
    });
  }

  removeBot(): void {
    if (!this.isHost) return;
    if (this.state.phase !== GamePhase.WAITING) return;
    const lastBotIndex = [...this.state.players]
      .reverse()
      .findIndex((p) => p.id === "BOT");
    if (lastBotIndex !== -1) {
      const actualIndex = this.state.players.length - 1 - lastBotIndex;
      this.state.players.splice(actualIndex, 1);
    }
  }

  requestAddBot(): void {
    this.makeAction({ type: "ADD_BOT" });
  }

  requestRemoveBot(): void {
    this.makeAction({ type: "REMOVE_BOT" });
  }

  requestReset(): void {
    this.makeAction({ type: "RESET_GAME" });
  }

  requestRegenerateMap(): void {
    const newSeed = Math.round(Math.random() * 10000);
    this.makeAction({ type: "REGENERATE_MAP", seed: newSeed });
  }

  private handleRegenerateMap(seed: number): void {
    // if (this.state.phase !== GamePhase.WAITING) return;

    // Update terrain seed
    this.state.terrainSeed = seed;
    this.state.terrainMods = [];

    // Clear tank simulations so they re-check gravity against new terrain
    this._tankSimulations.clear();

    // Re-initialize terrain with new seed
    this.initTerrain();

    console.log("Map regenerated with seed:", seed);
  }

  // Player actions - syncs final values on release
  commitAngle(angle: number): void {
    const action: GunnyWarsAction = {
      type: "COMMIT_ANGLE",
      angle,
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  commitPower(power: number): void {
    const action: GunnyWarsAction = {
      type: "COMMIT_POWER",
      power,
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  selectWeapon(weapon: WeaponType): void {
    const action: GunnyWarsAction = {
      type: "SELECT_WEAPON",
      weapon,
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  // Movement - called when movement starts
  moveStart(direction: MoveDirection): void {
    const tank = this.getMyTank();
    if (!tank || tank.fuel <= 0) return;
    const action: GunnyWarsAction = {
      type: "MOVE_START",
      direction,
      x: tank.x,
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  // Movement - called when movement stops
  moveStop(): void {
    const tank = this.getMyTank();
    if (!tank) return;
    const sim = this._tankSimulations.get(tank.id);
    const action: GunnyWarsAction = {
      type: "MOVE_STOP",
      x: sim?.x ?? tank.x,
      y: sim?.y ?? tank.y,
      fuel: sim?.fuel ?? tank.fuel,
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  fire(): void {
    const action: GunnyWarsAction = {
      type: "FIRE",
      playerId: this.userId,
    };
    this.makeAction(action);
  }

  // --- Helpers ---

  private getTankByPlayerId(playerId: string): Tank | undefined {
    return this.state.tanks.find((t) => t.playerId === playerId);
  }

  private isPlayerTurn(playerId: string): boolean {
    const currentTank = this.state.tanks[this.state.currentTurnIndex];
    return currentTank?.playerId === playerId;
  }

  getMyTank(): Tank | undefined {
    return this.state.tanks.find((t) => t.playerId === this.userId);
  }

  isMyTurn(): boolean {
    return this.isPlayerTurn(this.userId);
  }

  getCurrentTank(): Tank | undefined {
    return this.state.tanks[this.state.currentTurnIndex];
  }

  canStartGame(): boolean {
    return (
      this.state.players.length > 1 && this.state.phase === GamePhase.WAITING
    );
  }

  updatePlayers(players: { id: string; username: string }[]): void {
    const isHost = this.players[0]?.id === this.userId;
    if (!isHost) return;

    const currentPlayers = [...this.state.players];
    const bots = currentPlayers.filter((p) => p.id === "BOT");

    // Rebuild players array: matched room players + existing bots
    const newPlayers: PlayerInfo[] = players.map((p) => {
      const existing = currentPlayers.find((ep) => ep.id === p.id);
      return {
        id: p.id,
        username: p.username,
        tankId: existing?.tankId || null,
      };
    });

    // Add bots back
    newPlayers.push(...bots);

    this.state.players = newPlayers;
  }

  destroy(): void {
    super.destroy();
  }
}
