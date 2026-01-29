import { BaseGame, type GameAction } from "../BaseGame";
import {
  type GunnyWarsState,
  type GunnyWarsAction,
  type Tank,
  type Projectile,
  type Particle,
  GamePhase,
  WeaponType,
  type MoveDirection,
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
} from "./constants";
import { TerrainMap, TerrainRenderer } from "./TerrainMap";
import { TerrainShaderRenderer } from "./TerrainShaderRenderer";

export default class GunnyWars extends BaseGame<GunnyWarsState> {
  // TerrainMap - for efficient collision detection
  private terrainMap: TerrainMap | null = null;
  // TerrainRenderer - for chunk-based visual rendering (CPU fallback)
  private terrainRenderer: TerrainRenderer | null = null;
  // TerrainShaderRenderer - for GPU accelerated rendering
  private terrainShaderRenderer: TerrainShaderRenderer | null = null;

  // Animation loop
  private animationFrameId: number | null = null;

  // LOCAL-ONLY simulation data (not synced over network)
  private _projectiles: Projectile[] = [];
  private _particles: Particle[] = [];

  get projectiles(): Projectile[] {
    return this._projectiles;
  }

  get particles(): Particle[] {
    return this._particles;
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
      players: {
        1: {
          id: this.players[0]?.id || null,
          username: this.players[0]?.username || null,
          tankId: null,
        },
        2: {
          id: this.players[1]?.id || null,
          username: this.players[1]?.username || null,
          tankId: null,
        },
      },
      terrainSeed: Math.random() * 10000,
      terrainModifications: [],
      isSimulating: false,
    };
  }

  // Initialize terrain (use chunk-based rendering)
  initTerrain(): void {
    // Initialize TerrainMap for collision detection
    this.terrainMap = new TerrainMap(this.state.terrainSeed);
    // Initialize TerrainRenderer for chunk-based visual rendering
    this.terrainRenderer = new TerrainRenderer();

    // Apply any existing modifications (for state sync)
    if (this.state.terrainModifications.length > 0) {
      this.terrainMap.applyModifications(this.state.terrainModifications);
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
    this.terrainShaderRenderer = new TerrainShaderRenderer();
    const success = this.terrainShaderRenderer.init(canvas);
    if (success && this.terrainMap) {
      // Upload initial modifications
      this.terrainShaderRenderer.uploadModifications(
        this.terrainMap.getModifications(),
      );
    }
    return success;
  }

  // Update shader renderer with latest modifications
  updateShaderModifications(): void {
    if (this.terrainShaderRenderer && this.terrainMap) {
      this.terrainShaderRenderer.uploadModifications(
        this.terrainMap.getModifications(),
      );
    }
  }

  // Socket action handler
  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as GunnyWarsAction;

    switch (action.type) {
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

  // --- Action Handlers ---

  // Syncs final angle from UI (called on slider release)
  private handleCommitAngle(angle: number, playerId: string): void {
    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;
    if (!this.isPlayerTurn(playerId)) return;
    if (this.state.phase !== GamePhase.AIMING) return;

    tank.angle = Math.max(0, Math.min(180, angle));
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

    tank.selectedWeapon = weapon;
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
    tank.movingDirection = direction;
    if (direction === -1) {
      tank.angle = Math.max(90, Math.min(180, tank.angle));
    } else {
      tank.angle = Math.max(0, Math.min(90, tank.angle));
    }

    // Run physics
    this.runPhysicsLoop();
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
    tank.movingDirection = undefined;
    tank.x = x;
    tank.y = y;
    tank.fuel = fuel;

    // Clear simulation
    this._tankSimulations.delete(tank.id);
  }

  private handleFire(playerId: string): void {
    if (this.state.phase !== GamePhase.AIMING) return;
    if (!this.isPlayerTurn(playerId)) return;

    const tank = this.getTankByPlayerId(playerId);
    if (!tank) return;

    this.fireTank(tank);

    // Run physics
    this.runPhysicsLoop();
  }

  // --- Game Logic ---

  // Track local position for smooth movement without state updates
  private _tankSimulations = new Map<
    string,
    { x: number; y: number; fuel: number; angle: number }
  >();

  public update(): void {
    if (this.state.phase !== GamePhase.AIMING) return;

    this.state.tanks.forEach((tank) => {
      // If tank is moving (flag from server/local action), simulate it
      if (tank.isMoving && tank.movingDirection) {
        // Get current sim state or init from tank
        let simState = this._tankSimulations.get(tank.id);
        if (!simState) {
          simState = {
            x: tank.x,
            y: tank.y,
            fuel: tank.fuel,
            angle: tank.angle,
          };
          this._tankSimulations.set(tank.id, simState);
        }

        // Create a temp tank with sim properties for calculation
        const simTank = { ...tank, ...simState };
        // const gravityResult = this.gravityTank(simTank);
        // simState.x = gravityResult.x;
        // simState.y = gravityResult.y;

        const moveResult = this.calculateTankMovement(
          simTank,
          tank.movingDirection,
        );

        if (moveResult) {
          // Update SIMULATION state only
          simState.x = moveResult.x;
          simState.y = moveResult.y;
          simState.fuel = moveResult.fuel;
          simState.angle = moveResult.angle;
        } else {
          // Stop moving if logic fails
          tank.isMoving = false; // This is a flag, safe to update locally as it will be synced by Stop action
          tank.movingDirection = undefined;
          this._tankSimulations.delete(tank.id);

          // If this is the local player, tell server we stopped
          if (tank.playerId === this.userId) {
            this.moveStop();
          }
        }
      } else {
        // Not moving, clear sim if exists
        if (this._tankSimulations.has(tank.id)) {
          this._tankSimulations.delete(tank.id);
        }
      }
    });
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

    if (moveDir === -1) {
      angle = Math.max(90, Math.min(180, angle));
    } else {
      angle = Math.max(0, Math.min(90, angle));
    }

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

    return { x, y, fuel, angle };
  }

  private fireTank(tank: Tank): void {
    this.state.phase = GamePhase.FIRING;
    this.state.isSimulating = true;

    const rad = (tank.angle * Math.PI) / 180;
    const speed = (tank.power / 100) * MAX_POWER;

    // Barrel length - spawn projectile at barrel tip to avoid immediate collision
    const barrelLength = 30;

    const createProj = (angleOffset: number = 0): Projectile => {
      const finalRad = rad + (angleOffset * Math.PI) / 180;
      // Spawn at barrel tip position
      const spawnX = tank.x + Math.cos(finalRad) * barrelLength;
      const spawnY = tank.y - 10 - Math.sin(finalRad) * barrelLength;
      return {
        id: Math.random().toString(36),
        x: spawnX,
        y: spawnY,
        vx: Math.cos(finalRad) * speed,
        vy: -Math.sin(finalRad) * speed,
        radius: 5,
        weapon: tank.selectedWeapon,
        ownerId: tank.id,
        active: true,
      };
    };

    const weaponData = WEAPONS[tank.selectedWeapon];
    const count = weaponData.count;
    const spread = weaponData.spread || 0;

    for (let i = 0; i < count; i++) {
      let angleOffset = 0;
      if (count > 1) {
        angleOffset = -(((count - 1) * spread) / 2) + i * spread;
      }
      this._projectiles.push(createProj(angleOffset));
    }

    this.state.phase = GamePhase.PROJECTILE_MOVING;
  }

  private runPhysicsLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const step = () => {
      const allStopped = this.updatePhysics();

      if (!allStopped) {
        this.animationFrameId = requestAnimationFrame(step);
      } else {
        this.animationFrameId = null;
        this.onSimulationEnd();
      }
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  private updatePhysics(): boolean {
    if (!this.terrainMap) return true;

    const state = this.state;
    let tanksMoving = false;
    let projectilesMoving = false;
    let particlesMoving = false;

    // --- Sim Tanks ---
    this._tankSimulations.forEach((sim) => {
      const { x, y, moving } = this.gravityTank(sim.x, sim.y, 100);
      if (moving) {
        sim.x = x;
        sim.y = y;
        tanksMoving = moving;
      }
    });

    // --- Tank Gravity ---
    state.tanks.forEach((tank) => {
      const { x, y, health, moving } = this.gravityTank(
        tank.x,
        tank.y,
        tank.health,
      );
      if (moving) {
        tank.x = x;
        tank.y = y;
        tank.health = health;
        tanksMoving = moving;
      }
    });

    // --- Projectile Physics ---
    this._projectiles.forEach((p) => {
      if (!p.active) return;

      // Landmines don't move
      if (p.weapon === WeaponType.LANDMINE_ARMED) {
        // Check tank collision
        state.tanks.forEach((tank) => {
          if (tank.health <= 0) return;
          const dx = tank.x - p.x;
          const dy = tank.y - 10 - p.y;
          if (Math.sqrt(dx * dx + dy * dy) < 20) {
            this.explode(p);
          }
        });
        return;
      }

      projectilesMoving = true;

      // Apply physics
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GRAVITY;
      p.vx += state.wind;

      // Trail particles
      if (Math.random() > 0.3) {
        this.createTrailParticle(p);
      }

      // Tank collision
      for (const tank of state.tanks) {
        if (tank.health <= 0) continue;
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
          return;
        }
      }

      // Out of bounds
      if (p.x < 0 || p.x > WORLD_WIDTH || p.y > WORLD_HEIGHT) {
        p.active = false;
        return;
      }

      // Terrain collision
      if (this.checkSolid(p.x, p.y)) {
        this.explode(p);
      }
    });

    // --- Particles ---
    this._particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.type === "smoke") {
        p.vy -= 0.05;
        p.size += 0.1;
      }
      particlesMoving = true;
    });
    this._particles = this._particles.filter((p) => p.life > 0);

    // Cleanup projectiles
    this._projectiles = this._projectiles.filter((p) => p.active);

    // Check if any moving projectiles remain
    const activeMovingProjectiles = this._projectiles.filter(
      (p) => p.active && p.weapon !== WeaponType.LANDMINE_ARMED,
    );

    if (
      activeMovingProjectiles.length === 0 &&
      state.phase === GamePhase.PROJECTILE_MOVING
    ) {
      state.phase = GamePhase.IMPACT;
      state.turnTimeEnd = Date.now() + 1000; // 1 seconds delay after impact
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
    if (weapon.type === WeaponType.LANDMINE) {
      projectile.weapon = WeaponType.LANDMINE_ARMED;
      projectile.vx = 0;
      projectile.vy = 0;
      projectile.y -= 2;
      return;
    }

    // Terrain effects - update TerrainMap (collision) and TerrainRenderer (visuals)
    if (weapon.type === WeaponType.BUILDER) {
      this.terrainMap?.addCircle(projectile.x, projectile.y, weapon.radius);
      this.terrainRenderer?.invalidateArea(
        projectile.x,
        projectile.y,
        weapon.radius,
      );
    } else if (weapon.type === WeaponType.DRILL) {
      this.terrainMap?.carveTunnel(
        projectile.x,
        projectile.y,
        projectile.vx,
        projectile.vy,
        weapon.radius,
        150,
      );
      this.terrainRenderer?.invalidateTunnel(
        projectile.x,
        projectile.y,
        projectile.vx,
        projectile.vy,
        weapon.radius,
        150,
      );
    } else if (
      weapon.type !== WeaponType.TELEPORT &&
      weapon.type !== WeaponType.AIRSTRIKE &&
      weapon.type !== WeaponType.HEAL
    ) {
      const destroyRadius = weapon.radius * weapon.terrainDamageMultiplier;
      this.terrainMap?.destroyCircle(projectile.x, projectile.y, destroyRadius);
      this.terrainRenderer?.invalidateArea(
        projectile.x,
        projectile.y,
        destroyRadius,
      );
    }

    // Update GPU shader renderer with new modifications
    this.updateShaderModifications();

    // Visual effects
    this.createExplosionParticles(projectile.x, projectile.y, weapon);

    // Special abilities
    this.handleSpecialWeapons(projectile, weapon);

    // Damage/Heal
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
              tank.health = Math.min(tank.maxHealth, tank.health + magnitude);
              this.createParticles(
                tank.x,
                tank.y - 10,
                8,
                "glow",
                1,
                "#4ade80",
              );
            } else {
              tank.health = Math.max(0, tank.health - magnitude);
              this.createParticles(tank.x, tank.y - 10, 10, "spark", 2);
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
          this.createParticles(owner.x, owner.y, 20, "glow", 2, "#c084fc");
          this.createParticles(target.x, target.y, 20, "glow", 2, "#c084fc");
        } else {
          // Teleport to impact
          this.createParticles(owner.x, owner.y, 20, "smoke", 1);
          owner.x = projectile.x;
          owner.y = projectile.y;
          let safety = 0;
          while (this.checkSolid(owner.x, owner.y) && safety < 50) {
            owner.y--;
            safety++;
          }
          this.createParticles(owner.x, owner.y, 20, "glow", 2, "#c084fc");
        }
      }
    }

    // Airstrike
    if (weapon.type === WeaponType.AIRSTRIKE) {
      for (let i = 0; i < 8; i++) {
        const offset = (Math.random() - 0.5) * 100;
        this._projectiles.push({
          id: Math.random().toString(36),
          x: projectile.x + offset,
          y: -Math.random() * 200,
          vx: 0,
          vy: 5 + Math.random() * 5,
          radius: 5,
          weapon: WeaponType.AIRSTRIKE_BOMB,
          ownerId: projectile.ownerId,
          active: true,
        });
      }
    }
  }

  private createExplosionParticles(
    x: number,
    y: number,
    weapon: (typeof WEAPONS)[WeaponType],
  ): void {
    if (weapon.type === WeaponType.NUKE) {
      this.createParticles(x, y, 100, "fire", 3);
      this.createParticles(x, y, 50, "smoke", 2);
      this.createParticles(x, y, 30, "glow", 4, "#d946ef");
    } else if (weapon.type === WeaponType.TELEPORT) {
      this.createParticles(x, y, 30, "glow", 2, "#c084fc");
      this.createParticles(x, y, 20, "spark", 3, "#ffffff");
    } else if (weapon.type === WeaponType.BUILDER) {
      this.createParticles(x, y, 20, "smoke", 1, "#64748b");
    } else if (weapon.type === WeaponType.LANDMINE_ARMED) {
      this.createParticles(x, y, 40, "fire", 2, "#ef4444");
    } else if (weapon.type === WeaponType.HEAL) {
      this.createParticles(x, y, 20, "glow", 2, "#4ade80");
      this.createParticles(x, y, 15, "spark", 1.5, "#ffffff");
    } else {
      this.createParticles(x, y, 20, "fire", 1.5);
      this.createParticles(x, y, 20, "smoke", 1);
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
    };

    const color = colors[p.weapon];
    if (color) {
      this.createParticles(p.x, p.y, 1, "glow", 0.3, color);
    } else {
      this._particles.push({
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        life: 0.5,
        decay: 0.1,
        size: 2,
        color: "rgba(255,255,255,0.5)",
        type: "smoke",
      });
    }
  }

  private createParticles(
    x: number,
    y: number,
    count: number,
    type: "smoke" | "fire" | "spark" | "glow",
    speedMulti: number = 1,
    colorOverride?: string,
  ): void {
    const limit = 50;
    const actualCount = Math.min(count, limit);

    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 * speedMulti;

      let color = "#fff";
      let decay = 0.02;
      let size = Math.random() * 3 + 1;

      if (type === "fire") {
        color = colorOverride || (Math.random() > 0.5 ? "#fbbf24" : "#ef4444");
        decay = 0.04;
        size = Math.random() * 6 + 4;
      } else if (type === "smoke") {
        color = colorOverride || `rgba(100, 116, 139, ${Math.random()})`;
        decay = 0.02;
        size = Math.random() * 8 + 4;
      } else if (type === "spark") {
        color = colorOverride || "#facc15";
        decay = 0.08;
        size = Math.random() * 2 + 1;
      } else if (type === "glow") {
        color = colorOverride || "#22c55e";
        decay = 0.05;
        size = Math.random() * 5 + 2;
      }

      this._particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay,
        size,
        color,
        type,
      });
    }
  }

  private onSimulationEnd(): void {
    this.state.isSimulating = false;

    // Check winner
    const aliveTanks = this.state.tanks.filter((t) => t.health > 0);
    if (aliveTanks.length <= 1) {
      this.state.phase = GamePhase.GAME_OVER;
      if (aliveTanks.length === 1) {
        const winner = aliveTanks[0];
        const playerInfo =
          winner.playerId === this.state.players[1].id
            ? this.state.players[1]
            : this.state.players[2];
        this.state.winner =
          playerInfo.username || (winner.isBot ? "Bot" : "Player");
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
    this.botState.aimTimer = 20;

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
          WeaponType.LANDMINE,
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
      bot.movingDirection = this.botState.moveDir; // Safe: moveDir is -1 or 1 here
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
          bot.movingDirection = undefined;
        }
        requestAnimationFrame(step);
        return;
      }

      // Aim phase
      if (this.botState.aimTimer > 0) {
        bot.selectedWeapon = this.botState.targetWeapon;

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
    if (!this.state.players[1].id || !this.state.players[2].id) return;

    // Initialize terrain
    this.initTerrain();

    // Create tanks
    const t1X = Math.floor(Math.random() * (WORLD_WIDTH - 100));
    const t2X = WORLD_WIDTH - t1X;
    const t1Y = this.getTerrainHeight(t1X);
    const t2Y = this.getTerrainHeight(t2X);

    this.state.tanks = [
      {
        id: "tank-1",
        playerId: this.state.players[1].id,
        isBot: this.state.players[1].id === "BOT",
        x: t1X,
        y: t1Y,
        angle: 45,
        power: 50,
        health: INITIAL_HEALTH,
        maxHealth: INITIAL_HEALTH,
        color: TANK_COLORS.player1,
        selectedWeapon: WeaponType.BASIC,
        fuel: MAX_FUEL,
      },
      {
        id: "tank-2",
        playerId: this.state.players[2].id,
        isBot: this.state.players[2].id === "BOT",
        x: t2X,
        y: t2Y,
        angle: 45,
        power: 50,
        health: INITIAL_HEALTH,
        maxHealth: INITIAL_HEALTH,
        color: TANK_COLORS.player2,
        selectedWeapon: WeaponType.BASIC,
        fuel: MAX_FUEL,
      },
    ];

    this.state.players[1].tankId = "tank-1";
    this.state.players[2].tankId = "tank-2";

    this.state.phase = GamePhase.AIMING;
    this.state.wind = Math.random() * 0.05 - 0.025;
    this.state.currentTurnIndex = 0;

    this.checkBotTurn();
  }

  reset(): void {
    this.stopSimulation();
    this.state.phase = GamePhase.WAITING;
    this.state.tanks = [];
    this.state.currentTurnIndex = 0;
    this.state.wind = 0;
    this.state.winner = null;
    this.state.turnTimeEnd = 0;
    this.state.players[1].tankId = null;
    this.state.players[2].tankId = null;
    this.state.terrainSeed = Math.random() * 10000;
    this.state.terrainModifications = [];
    this.state.isSimulating = false;
  }

  addBot(): void {
    if (this.state.phase !== GamePhase.WAITING) return;
    this.state.players[2] = { id: "BOT", username: "Bot", tankId: null };
  }

  removeBot(): void {
    if (this.state.phase !== GamePhase.WAITING) return;
    if (this.state.players[2].id !== "BOT") return;
    this.state.players[2] = { id: null, username: null, tankId: null };
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
    if (!tank) return;
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
      x: sim?.x || tank.x,
      y: sim?.y || tank.y,
      fuel: sim?.fuel || tank.fuel,
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
      !!this.state.players[1].id &&
      !!this.state.players[2].id &&
      this.state.phase === GamePhase.WAITING
    );
  }

  updatePlayers(players: { id: string; username: string }[]): void {
    this.state.players[1].id = players[0]?.id || null;
    this.state.players[1].username = players[0]?.username || null;

    if (players[1]) {
      this.state.players[2].id = players[1].id;
      this.state.players[2].username = players[1].username;
    } else if (this.state.players[2].id !== "BOT") {
      this.state.players[2].id = null;
      this.state.players[2].username = null;
    }
  }

  private stopSimulation(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  destroy(): void {
    this.stopSimulation();
    super.destroy();
  }
}
