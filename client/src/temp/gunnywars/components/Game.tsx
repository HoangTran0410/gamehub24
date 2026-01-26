import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  WORLD_HEIGHT, 
  WORLD_WIDTH, 
  FUEL_CONSUMPTION,
  GRAVITY, 
  INITIAL_HEALTH, 
  MAX_FUEL, 
  MAX_POWER, 
  MOVEMENT_SPEED, 
  WEAPONS 
} from '../constants';
import { 
  GamePhase, 
  GameState, 
  Tank, 
  Projectile, 
  WeaponType,
  Particle
} from '../types';
import { generateTerrain, destroyTerrain, addTerrain, carveTunnel, getTerrainHeightAt } from '../services/terrainGen';
import { BotIcon, UserIcon, ArrowLeft, ArrowRight, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Input State
  const inputRef = useRef({
    left: false,
    right: false,
    up: false,
    down: false,
    fire: false
  });

  // Bot State
  const botStateRef = useRef({
    planned: false,
    moveTimer: 0,
    moveDir: 0, // -1, 0, 1
    aimTimer: 0,
    targetWeapon: WeaponType.BASIC,
    targetAngle: 0,
    targetPower: 0,
  });

  // Camera State
  const cameraRef = useRef({ 
    x: 0, 
    y: 0, 
    zoom: 0.8, 
    targetZoom: 0.8 
  });
  const cameraModeRef = useRef<'MANUAL' | 'FOLLOW_PLAYER' | 'FOLLOW_PROJECTILE'>('FOLLOW_PLAYER');
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startCamX: 0, startCamY: 0 });
  
  // Performance: Throttling UI updates
  const lastUiUpdateRef = useRef(0);
  // Visuals: Stars
  const starsRef = useRef<Array<{x: number, y: number, size: number, alpha: number}>>([]);

  // Game State Ref
  const stateRef = useRef<GameState>({
    phase: GamePhase.AIMING,
    tanks: [],
    projectiles: [],
    particles: [],
    currentTurnIndex: 0,
    wind: Math.random() * 0.05 - 0.025,
    winner: null,
    turnTimer: 0,
  });

  // React State for UI
  const [uiState, setUiState] = useState<{
    currentPlayer: Tank | null;
    wind: number;
    winner: string | null;
    viewportWidth: number;
    viewportHeight: number;
  }>({
    currentPlayer: null,
    wind: 0,
    winner: null,
    viewportWidth: 800,
    viewportHeight: 600,
  });

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setUiState(prev => ({
          ...prev,
          viewportWidth: containerRef.current!.clientWidth,
          viewportHeight: containerRef.current!.clientHeight,
        }));
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Game & Stars
  useEffect(() => {
    // Generate Stars once with better randomization
    if (starsRef.current.length === 0) {
        for(let i=0; i<150; i++) {
            starsRef.current.push({
                x: Math.random() * 2000, 
                y: Math.random() * 1200, // Varied Y height
                size: Math.random() * 2 + 0.5,
                alpha: Math.random() * 0.6 + 0.2
            });
        }
    }

    // Force new terrain generation on reload
    if (terrainCanvasRef.current) {
       const ctx = terrainCanvasRef.current.getContext('2d');
       if (ctx) generateTerrain(ctx);
    } else {
      const offscreen = document.createElement('canvas');
      offscreen.width = WORLD_WIDTH;
      offscreen.height = WORLD_HEIGHT;
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        generateTerrain(ctx);
        terrainCanvasRef.current = offscreen;
      }
    }

    if (stateRef.current.tanks.length === 0 && terrainCanvasRef.current) {
      const ctx = terrainCanvasRef.current.getContext('2d')!;
      const t1X = 500;
      const t2X = WORLD_WIDTH - 500;
      
      const t1Y = getTerrainHeightAt(ctx, t1X);
      const t2Y = getTerrainHeightAt(ctx, t2X);

      stateRef.current.tanks = [
        {
          id: 'player-1',
          isPlayer: true,
          x: t1X,
          y: t1Y,
          angle: 45,
          power: 50,
          health: INITIAL_HEALTH,
          maxHealth: INITIAL_HEALTH,
          color: '#3b82f6',
          selectedWeapon: WeaponType.BASIC,
          fuel: MAX_FUEL,
          facingRight: true,
        },
        {
          id: 'cpu-1',
          isPlayer: false,
          x: t2X,
          y: t2Y,
          angle: 135,
          power: 50,
          health: INITIAL_HEALTH,
          maxHealth: INITIAL_HEALTH,
          color: '#ef4444', 
          selectedWeapon: WeaponType.BASIC,
          fuel: MAX_FUEL,
          facingRight: false,
        }
      ];
      updateUI(true);
    }
    
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [uiState.viewportWidth]);

  const updateUI = (force = false) => {
    // Throttle UI updates to save performance on mobile
    const now = performance.now();
    if (!force && now - lastUiUpdateRef.current < 33) return; // ~30 FPS cap for UI

    lastUiUpdateRef.current = now;
    const currentTank = stateRef.current.tanks[stateRef.current.currentTurnIndex];
    setUiState(prev => ({
      ...prev,
      currentPlayer: { ...currentTank },
      wind: stateRef.current.wind,
      winner: stateRef.current.winner,
    }));
  };

  const createParticles = (x: number, y: number, count: number, type: 'smoke' | 'fire' | 'spark' | 'glow', speedMulti: number = 1, colorOverride?: string) => {
    // Limit particle count for performance
    const limit = 50; 
    const actualCount = Math.min(count, limit);
    
    for (let i = 0; i < actualCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 * speedMulti;
        
        let color = '#fff';
        let decay = 0.02;
        let size = Math.random() * 3 + 1;

        if (type === 'fire') {
            color = Math.random() > 0.5 ? '#fbbf24' : '#ef4444'; // Orange/Red
            decay = 0.04; // Faster decay for performance
            size = Math.random() * 6 + 4;
        } else if (type === 'smoke') {
            color = `rgba(100, 116, 139, ${Math.random()})`; // Gray slate
            decay = 0.02;
            size = Math.random() * 8 + 4;
        } else if (type === 'spark') {
            color = '#facc15';
            decay = 0.08;
            size = Math.random() * 2 + 1;
        } else if (type === 'glow') {
            color = colorOverride || '#22c55e';
            decay = 0.05;
            size = Math.random() * 5 + 2;
        }

        stateRef.current.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            decay,
            size,
            color,
            type
        });
    }
  };

  const gameLoop = () => {
    update();
    draw();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const checkPixelSolid = (ctx: CanvasRenderingContext2D, x: number, y: number): boolean => {
      if (x < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return false;
      if (y < 0) return false;
      const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      return pixel[3] > 0;
  };

  // Reusable movement logic for Player and Bot
  const processTankMovement = (tank: Tank, moveDir: number, tCtx: CanvasRenderingContext2D) => {
     if (moveDir === 0 || tank.fuel <= 0) return;

     if (moveDir === -1) {
        tank.facingRight = false;
        tank.angle = Math.max(90, Math.min(180, tank.angle));
     } else {
        tank.facingRight = true;
        tank.angle = Math.max(0, Math.min(90, tank.angle));
     }

     const nextX = Math.max(15, Math.min(WORLD_WIDTH - 15, tank.x + moveDir * MOVEMENT_SPEED));
     const solidAtFoot = checkPixelSolid(tCtx, nextX, tank.y);
     
     // Slope Climbing
     if (solidAtFoot) {
         let climbed = false;
         for(let i=1; i<=5; i++) {
             if (!checkPixelSolid(tCtx, nextX, tank.y - i)) {
                 tank.x = nextX;
                 tank.y -= i;
                 climbed = true;
                 break;
             }
         }
         if (climbed) {
             tank.fuel -= FUEL_CONSUMPTION;
         }
     } else {
          tank.x = nextX;
          tank.fuel -= FUEL_CONSUMPTION;
          
          // Downward Slope
          for(let i=1; i<=5; i++) {
              if (checkPixelSolid(tCtx, tank.x, tank.y + i)) {
                  tank.y += (i - 1); 
                  break;
              }
          }
     }

     if (Math.random() > 0.8) {
        stateRef.current.particles.push({
            x: tank.x + (moveDir > 0 ? -10 : 10), y: tank.y, 
            vx: -moveDir * Math.random(), vy: -Math.random() * 2, 
            life: 1, decay: 0.1, size: 2, color: '#a16207', type: 'smoke'
        });
    }
  };

  const update = () => {
    const state = stateRef.current;
    if (state.winner) return;

    const currentPlayer = state.tanks[state.currentTurnIndex];

    // --- PLAYER Input Processing ---
    if (currentPlayer && currentPlayer.isPlayer && state.phase === GamePhase.AIMING && terrainCanvasRef.current) {
      const tCtx = terrainCanvasRef.current.getContext('2d')!;
      
      let moveDir = 0;
      if (inputRef.current.left) moveDir = -1;
      if (inputRef.current.right) moveDir = 1;

      if (moveDir !== 0) {
          processTankMovement(currentPlayer, moveDir, tCtx);
          cameraModeRef.current = 'FOLLOW_PLAYER';
          updateUI();
      }
    }

    // --- BOT Input Processing ---
    if (currentPlayer && !currentPlayer.isPlayer && state.phase === GamePhase.AIMING && terrainCanvasRef.current) {
        runBotLogic(currentPlayer, terrainCanvasRef.current.getContext('2d')!);
    }

    // --- Physics (Gravity for tanks) ---
    const aliveTanks = state.tanks.filter(t => t.health > 0);
    if (aliveTanks.length === 1) {
      state.winner = aliveTanks[0].isPlayer ? 'Player' : 'Bot';
      updateUI(true);
      return;
    }

    if (terrainCanvasRef.current) {
      const tCtx = terrainCanvasRef.current.getContext('2d')!;
      state.tanks.forEach(tank => {
        // Simple gravity: Check if 1px below is solid
        if (!checkPixelSolid(tCtx, tank.x, tank.y + 1)) {
           tank.y += 3; // Fall speed
           if (tank.y > WORLD_HEIGHT) tank.health = 0;
        } else {
           // Ensure not stuck inside ground (pop up)
           while(checkPixelSolid(tCtx, tank.x, tank.y)) {
               tank.y--;
           }
        }
      });
    }

    // Projectiles
    // Allow projectiles to update even in AIMING phase if they are mines or lingering effects
    const movingProjectiles = state.projectiles.filter(p => p.active && (p.weapon !== WeaponType.LANDMINE_ARMED));
    if (movingProjectiles.length > 0) {
        if(state.phase !== GamePhase.FIRING && state.phase !== GamePhase.IMPACT) state.phase = GamePhase.PROJECTILE_MOVING;
    } else if (state.projectiles.some(p => p.weapon === WeaponType.LANDMINE_ARMED) && state.phase === GamePhase.PROJECTILE_MOVING) {
         // If only mines are left, end turn
         nextTurn();
    }

    // Handle Projectile Movement
    if (state.phase === GamePhase.PROJECTILE_MOVING || state.phase === GamePhase.FIRING) {
      cameraModeRef.current = 'FOLLOW_PROJECTILE';
      
      state.projectiles.forEach(p => {
        if (!p.active) return;
        
        // ARMED MINES don't move physics-wise
        if (p.weapon === WeaponType.LANDMINE_ARMED) {
            // Check collision with tanks
            state.tanks.forEach(tank => {
                const dx = tank.x - p.x;
                const dy = (tank.y - 10) - p.y;
                if (Math.sqrt(dx*dx + dy*dy) < 20) {
                    explode(p); // Explode if tank touches
                }
            });
            return;
        }

        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY;
        p.vx += state.wind;

        // --- Bullet Trail Effects ---
        // Reduced frequency of trails for performance
        const shouldSpawnTrail = Math.random() > 0.5;

        if (shouldSpawnTrail) {
            if (p.weapon === WeaponType.NUKE) {
                createParticles(p.x, p.y, 1, 'glow', 0.5, '#d946ef');
            } else if (p.weapon === WeaponType.DRILL) {
                createParticles(p.x, p.y, 1, 'smoke', 0.2);
            } else if (p.weapon === WeaponType.TELEPORT) {
                createParticles(p.x, p.y, 1, 'glow', 0.3, '#c084fc');
            } else if (p.weapon === WeaponType.AIRSTRIKE || p.weapon === WeaponType.AIRSTRIKE_BOMB) {
                createParticles(p.x, p.y, 1, 'smoke', 0.5, '#ef4444');
            } else if (p.weapon === WeaponType.BUILDER) {
                createParticles(p.x, p.y, 1, 'spark', 0.5, '#60a5fa');
            } else if (p.weapon === WeaponType.HEAL) {
                createParticles(p.x, p.y, 1, 'glow', 0.2, '#4ade80');
            } else {
                // Basic
                state.particles.push({
                    x: p.x, y: p.y, 
                    vx: 0, vy: 0, 
                    life: 0.5, decay: 0.1, size: 2, color: 'rgba(255,255,255,0.5)', type: 'smoke'
                });
            }
        }

        // Check Collision with Tanks (Direct Hit)
        // TELEPORT logic is now handled in explode() to support ground splash hits
        for (const tank of state.tanks) {
            if (tank.health <= 0) continue;
            // Don't hit self immediately (grace distance)
            if (tank.id === p.ownerId && Math.abs(p.x - tank.x) < 20 && Math.abs(p.y - tank.y) < 20) continue;

            const dx = tank.x - p.x;
            const dy = (tank.y - 10) - p.y;
            if (Math.sqrt(dx*dx + dy*dy) < 15) {
                // Direct Hit
                explode(p);
                return;
            }
        }

        if (terrainCanvasRef.current) {
          const tCtx = terrainCanvasRef.current.getContext('2d')!;
          if (p.x < 0 || p.x > WORLD_WIDTH || p.y > WORLD_HEIGHT) {
             p.active = false;
             return;
          }
          const pixel = tCtx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
          if (pixel[3] > 0) explode(p);
        }
      });

      state.projectiles = state.projectiles.filter(p => p.active);

      // Check if we need to transition turn
      const activeMoving = state.projectiles.some(p => p.active && p.weapon !== WeaponType.LANDMINE_ARMED);
      if (!activeMoving && state.phase === GamePhase.PROJECTILE_MOVING) {
         state.phase = GamePhase.IMPACT;
         state.turnTimer = 120; // Wait 2 seconds (assuming 60fps)
      }
    }

    // Handle Impact Delay
    if (state.phase === GamePhase.IMPACT) {
        state.turnTimer--;
        if (state.turnTimer <= 0) {
            nextTurn();
        }
    }
    
    // Update Particles
    state.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        
        // Smoke rises
        if (p.type === 'smoke') {
            p.vy -= 0.05; 
            p.size += 0.1;
        }
    });
    // Cleanup dead particles
    state.particles = state.particles.filter(p => p.life > 0);

    updateCamera();
  };

  const runBotLogic = (bot: Tank, tCtx: CanvasRenderingContext2D) => {
      const bState = botStateRef.current;
      
      // 1. Planning Phase
      if (!bState.planned) {
          // Default Plan
          bState.moveDir = Math.random() > 0.5 ? 1 : -1;
          bState.moveTimer = Math.floor(Math.random() * 50); // Move for 0-50 frames
          bState.aimTimer = 30; // Aiming delay
          
          const target = stateRef.current.tanks.find(t => t.id !== bot.id && t.health > 0);
          
          if (!target) return; // Should not happen

          // A. Health Critical -> Heal
          if (bot.health < 35 && bot.health > 0) {
              bState.targetWeapon = WeaponType.HEAL;
              bState.targetAngle = 90; // Shoot straight up
              bState.targetPower = 15; // Low power to fall on head
          }
          // B. Falling / Bad Position -> Teleport
          else if (bot.y > WORLD_HEIGHT - 300) {
              bState.targetWeapon = WeaponType.TELEPORT;
              // Aim for center map, high up
              const targetX = WORLD_WIDTH / 2;
              const targetY = 200;
              // Simple calculation for Teleport logic
              const dx = targetX - bot.x;
              bState.targetAngle = dx > 0 ? 60 : 120;
              bState.targetPower = 80; // High power to escape
          }
          // C. Attack
          else {
              const dx = target.x - bot.x;
              const dist = Math.abs(dx);
              const direction = dx > 0 ? 1 : -1;
              
              // Select Weapon based on Distance
              if (dist < 400) {
                  // Close Range
                  bState.targetWeapon = Math.random() > 0.5 ? WeaponType.SCATTER : WeaponType.DRILL;
              } else if (dist > 800) {
                  // Long Range
                  bState.targetWeapon = Math.random() > 0.6 ? WeaponType.NUKE : WeaponType.BASIC;
              } else {
                  // Mid Range
                  const options = [WeaponType.BASIC, WeaponType.BARRAGE, WeaponType.LANDMINE];
                  bState.targetWeapon = options[Math.floor(Math.random() * options.length)];
              }

              // Calculate Angle & Power
              // Basic trajectory approximation (v^2 = dist * g)
              // We'll stick to 45/135 degree arcs for simplicity as it's efficient
              const baseAngle = direction > 0 ? 45 : 135;
              
              // Add randomness to aim
              bState.targetAngle = baseAngle + (Math.random() * 10 - 5);
              
              // Calculate required velocity
              // Range R = (v^2 * sin(2*theta)) / g
              // v = sqrt(R * g / sin(2*theta))
              // Since theta is close to 45, sin(2*theta) is close to 1.
              const idealVel = Math.sqrt(dist * GRAVITY);
              const idealPower = (idealVel / MAX_POWER) * 100;
              
              // Adjust for height difference roughly
              const heightDiff = (target.y - bot.y);
              const heightAdjustment = heightDiff * 0.1;

              bState.targetPower = Math.max(10, Math.min(100, idealPower + heightAdjustment + (Math.random() * 10 - 5)));
          }

          bState.planned = true;
      }

      // 2. Execution Phases
      if (bState.moveTimer > 0) {
          // Moving
          processTankMovement(bot, bState.moveDir, tCtx);
          bState.moveTimer--;
          updateUI(); // Reflect movement on HUD
      } else if (bState.aimTimer > 0) {
          // Aiming (Setting values visually)
          bot.selectedWeapon = bState.targetWeapon;
          
          // Smoothly interpolate aim for visual effect
          const angDiff = bState.targetAngle - bot.angle;
          bot.angle += angDiff * 0.2;
          
          const pwrDiff = bState.targetPower - bot.power;
          bot.power += pwrDiff * 0.2;
          
          bState.aimTimer--;
          updateUI();
      } else {
          // Fire!
          bot.angle = bState.targetAngle;
          bot.power = bState.targetPower;
          fire(bot);
      }
  };

  const updateCamera = () => {
    const vpW = uiState.viewportWidth;
    const vpH = uiState.viewportHeight;

    const oldZoom = cameraRef.current.zoom;
    const targetZoom = cameraRef.current.targetZoom;
    let zoom = oldZoom;
    
    if (Math.abs(targetZoom - oldZoom) > 0.0001) {
      zoom = oldZoom + (targetZoom - oldZoom) * 0.1;
      cameraRef.current.zoom = zoom;
    }

    const visibleW = vpW / zoom;
    const visibleH = vpH / zoom;
    const centerOffsetX = visibleW / 2;
    const centerOffsetY = visibleH / 2;

    if (dragRef.current.isDragging) {
      cameraModeRef.current = 'MANUAL';
    } else if (cameraModeRef.current === 'MANUAL') {
      if (Math.abs(zoom - oldZoom) > 0.0001) {
        const prevCenterX = cameraRef.current.x + (vpW / 2) / oldZoom;
        const prevCenterY = cameraRef.current.y + (vpH / 2) / oldZoom;
        cameraRef.current.x = prevCenterX - centerOffsetX;
        cameraRef.current.y = prevCenterY - centerOffsetY;
      }
    } else {
      let targetX = cameraRef.current.x;
      let targetY = cameraRef.current.y;

      // During IMPACT phase, don't move camera so user can see what happened
      if (stateRef.current.phase === GamePhase.IMPACT) {
          // Keep current target
      } 
      else if (cameraModeRef.current === 'FOLLOW_PROJECTILE' && stateRef.current.projectiles.length > 0) {
        // Only follow moving projectiles, not mines
        const moving = stateRef.current.projectiles.filter(p => p.weapon !== WeaponType.LANDMINE_ARMED);
        if (moving.length > 0) {
            const avgX = moving.reduce((sum, p) => sum + p.x, 0) / moving.length;
            const avgY = moving.reduce((sum, p) => sum + p.y, 0) / moving.length;
            targetX = avgX - centerOffsetX;
            targetY = avgY - centerOffsetY;
        } else {
             // Fallback to player if only mines are left
             const activeTank = stateRef.current.tanks[stateRef.current.currentTurnIndex];
             if (activeTank) {
                targetX = activeTank.x - centerOffsetX;
                targetY = activeTank.y - centerOffsetY;
             }
        }
      } else if (cameraModeRef.current === 'FOLLOW_PLAYER') {
        const activeTank = stateRef.current.tanks[stateRef.current.currentTurnIndex];
        if (activeTank) {
          targetX = activeTank.x - centerOffsetX;
          targetY = activeTank.y - centerOffsetY;
        }
      }

      cameraRef.current.x += (targetX - cameraRef.current.x) * 0.08;
      cameraRef.current.y += (targetY - cameraRef.current.y) * 0.08;
    }

    const minX = 0;
    const maxX = Math.max(0, WORLD_WIDTH - visibleW);
    cameraRef.current.x = Math.max(minX, Math.min(cameraRef.current.x, maxX));

    const maxY = WORLD_HEIGHT - visibleH;
    const minY = -WORLD_HEIGHT; 
    cameraRef.current.y = Math.max(minY, Math.min(cameraRef.current.y, maxY));
  };

  const explode = (projectile: Projectile) => {
    const state = stateRef.current;
    // Safety check if we have a valid weapon (internal projectiles might need mapping)
    const weapon = WEAPONS[projectile.weapon] || WEAPONS[WeaponType.BASIC];
    const tCtx = terrainCanvasRef.current!.getContext('2d')!;

    // Special Case: LANDMINE deployment
    if (weapon.type === WeaponType.LANDMINE) {
        // Transform into armed mine
        projectile.weapon = WeaponType.LANDMINE_ARMED;
        projectile.vx = 0;
        projectile.vy = 0;
        // Adjust position slightly up to sit on surface
        projectile.y -= 2;
        // Don't deactivate, it remains as a trap
        return;
    }

    // 1. Terrain Effect
    if (weapon.type === WeaponType.BUILDER) {
        addTerrain(tCtx, projectile.x, projectile.y, weapon.radius);
    } else if (weapon.type === WeaponType.DRILL) {
        // Directional Tunneling
        carveTunnel(tCtx, projectile.x, projectile.y, projectile.vx, projectile.vy, weapon.radius, 150);
    } else if (weapon.type !== WeaponType.TELEPORT && weapon.type !== WeaponType.AIRSTRIKE && weapon.type !== WeaponType.HEAL) {
        // Teleport, Airstrike marker, and HEAL don't destroy terrain
        destroyTerrain(tCtx, projectile.x, projectile.y, weapon.radius * weapon.terrainDamageMultiplier);
    }

    // 2. Visual Effects
    if (weapon.type === WeaponType.NUKE) {
        createParticles(projectile.x, projectile.y, 100, 'fire', 3);
        createParticles(projectile.x, projectile.y, 50, 'smoke', 2);
        createParticles(projectile.x, projectile.y, 30, 'glow', 4, '#d946ef');
    } else if (weapon.type === WeaponType.TELEPORT) {
        createParticles(projectile.x, projectile.y, 30, 'glow', 2, '#c084fc');
        createParticles(projectile.x, projectile.y, 20, 'spark', 3, '#ffffff');
    } else if (weapon.type === WeaponType.BUILDER) {
        createParticles(projectile.x, projectile.y, 20, 'smoke', 1, '#64748b');
    } else if (weapon.type === WeaponType.LANDMINE_ARMED) {
        createParticles(projectile.x, projectile.y, 40, 'fire', 2, '#ef4444');
    } else if (weapon.type === WeaponType.HEAL) {
        createParticles(projectile.x, projectile.y, 20, 'glow', 2, '#4ade80');
        createParticles(projectile.x, projectile.y, 15, 'spark', 1.5, '#ffffff');
    } else {
        createParticles(projectile.x, projectile.y, 20, 'fire', 1.5);
        createParticles(projectile.x, projectile.y, 20, 'smoke', 1);
    }

    // 3. Special Ability Logic
    if (weapon.type === WeaponType.TELEPORT) {
        const owner = state.tanks.find(t => t.id === projectile.ownerId);
        
        if (owner) {
             // Search for a target to swap with
             let target: Tank | null = null;
             let closestDist = weapon.radius + 15; // 35px radius for swapping (generous)
             
             for(const t of state.tanks) {
                 if (t.id === owner.id || t.health <= 0) continue;
                 const dist = Math.sqrt(Math.pow(t.x - projectile.x, 2) + Math.pow((t.y - 10) - projectile.y, 2));
                 if (dist < closestDist) {
                     closestDist = dist;
                     target = t;
                 }
             }

             if (target) {
                 // Swap
                 const tx = target.x; 
                 const ty = target.y;
                 target.x = owner.x;
                 target.y = owner.y;
                 owner.x = tx;
                 owner.y = ty;
                 
                 createParticles(owner.x, owner.y, 20, 'glow', 2, '#c084fc');
                 createParticles(target.x, target.y, 20, 'glow', 2, '#c084fc');
             } else {
                 // Teleport to impact
                 createParticles(owner.x, owner.y, 20, 'smoke', 1); 
                 owner.x = projectile.x;
                 // Ensure we don't teleport into ground
                 owner.y = projectile.y;
                 // Pop up if stuck in ground
                 let safety = 0;
                 while(checkPixelSolid(tCtx, owner.x, owner.y) && safety < 50) {
                     owner.y--;
                     safety++;
                 }
                 createParticles(owner.x, owner.y, 20, 'glow', 2, '#c084fc');
             }
        }
    } else if (weapon.type === WeaponType.AIRSTRIKE) {
        // Spawn rain
        for(let i=0; i<8; i++) {
             const offset = (Math.random() - 0.5) * 100;
             state.projectiles.push({
                 id: Math.random().toString(36),
                 x: projectile.x + offset,
                 y: -Math.random() * 200, // Start high up
                 vx: 0,
                 vy: 5 + Math.random() * 5,
                 radius: 5,
                 weapon: WeaponType.AIRSTRIKE_BOMB,
                 ownerId: projectile.ownerId,
                 active: true
             });
        }
    }

    // 4. Damage / Heal Logic
    if (weapon.damage > 0) {
        state.tanks.forEach(tank => {
          const dx = tank.x - projectile.x;
          const dy = (tank.y - 10) - projectile.y; 
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < weapon.radius + 20) {
            const magnitude = Math.floor(weapon.damage * (1 - dist / (weapon.radius + 50)));
            
            if (magnitude > 0) {
                if (weapon.type === WeaponType.HEAL) {
                    // Heal (Ally or Enemy)
                    tank.health = Math.min(tank.maxHealth, tank.health + magnitude);
                    createParticles(tank.x, tank.y - 10, 8, 'glow', 1, '#4ade80');
                } else {
                    // Damage
                    tank.health = Math.max(0, tank.health - magnitude);
                    createParticles(tank.x, tank.y - 10, 10, 'spark', 2);
                }
            }
          }
        });
    }

    projectile.active = false;
  };

  const nextTurn = () => {
    const state = stateRef.current;
    state.currentTurnIndex = (state.currentTurnIndex + 1) % state.tanks.length;
    
    while (state.tanks[state.currentTurnIndex].health <= 0) {
       state.currentTurnIndex = (state.currentTurnIndex + 1) % state.tanks.length;
    }

    const nextTank = state.tanks[state.currentTurnIndex];
    nextTank.fuel = MAX_FUEL; 
    
    // Reset Bot Plan
    botStateRef.current.planned = false;
    
    state.phase = GamePhase.AIMING;
    state.wind = (Math.random() * 0.05 - 0.025);
    cameraModeRef.current = 'FOLLOW_PLAYER';
    updateUI(true);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { viewportWidth, viewportHeight } = uiState;
    const zoom = cameraRef.current.zoom;
    const camX = cameraRef.current.x;
    const camY = cameraRef.current.y;

    // Clear with Viewport dimensions
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    
    const grad = ctx.createLinearGradient(0, 0, 0, viewportHeight);
    grad.addColorStop(0, '#020617'); 
    grad.addColorStop(1, '#172554'); 
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    // Stars (Screen space - Optimized)
    // Use pre-generated stars to avoid random pattern per frame
    ctx.fillStyle = '#ffffff';
    const stars = starsRef.current;
    const len = stars.length;
    
    for(let i=0; i<len; i++) {
        const star = stars[i];
        
        // Parallax effect
        const vx = ((star.x - camX * 0.05) % viewportWidth + viewportWidth) % viewportWidth;
        const vy = ((star.y - camY * 0.05) % viewportHeight + viewportHeight) % viewportHeight;

        ctx.globalAlpha = star.alpha;
        ctx.beginPath();
        ctx.arc(vx, vy, star.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // --- World Space ---
    ctx.save();
    
    // Apply Zoom
    ctx.scale(zoom, zoom);
    // Apply Camera Translate
    ctx.translate(-camX, -camY);

    if (terrainCanvasRef.current) {
      ctx.drawImage(terrainCanvasRef.current, 0, 0);
    }

    // Draw Particles
    stateRef.current.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        if (p.type === 'fire' || p.type === 'spark' || p.type === 'glow') {
            ctx.globalCompositeOperation = 'lighter'; // Additive blending
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    stateRef.current.tanks.forEach(tank => {
       if (tank.health <= 0) return;
       drawTank(ctx, tank);
    });

    stateRef.current.projectiles.forEach(p => {
       const weapon = WEAPONS[p.weapon] || WEAPONS[WeaponType.BASIC];
       ctx.save();
       // Performance: Removed expensive shadowBlur
       
       if (p.weapon === WeaponType.LANDMINE_ARMED) {
           // Draw Mine
           ctx.beginPath();
           ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
           ctx.fillStyle = '#ff0000';
           ctx.fill();
           // Blinking light
           if (Math.floor(Date.now() / 200) % 2 === 0) {
              ctx.fillStyle = '#fff';
              ctx.beginPath();
              ctx.arc(p.x, p.y-2, 1, 0, Math.PI*2);
              ctx.fill();
           }
       } else {
           // Normal Projectile
           ctx.beginPath();
           ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
           ctx.fillStyle = weapon.color;
           ctx.fill();
           ctx.fillStyle = '#fff';
           ctx.beginPath();
           ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
           ctx.fill();
       }
       ctx.restore();
    });

    const currentTank = stateRef.current.tanks[stateRef.current.currentTurnIndex];
    if (currentTank && currentTank.isPlayer && stateRef.current.phase === GamePhase.AIMING) {
        drawTrajectory(ctx, currentTank);
    }

    ctx.restore();

    // --- Overlay UI (Screen Space) ---
    // Draw Enemy Arrows
    const playerTank = stateRef.current.tanks.find(t => t.isPlayer);
    
    if (playerTank && playerTank.health > 0) {
        stateRef.current.tanks.forEach(target => {
            if (target.isPlayer || target.health <= 0) return;

            // Viewport World Bounds
            const viewW = viewportWidth / zoom;
            const viewH = viewportHeight / zoom;
            const viewX = camX;
            const viewY = camY;

            // Check if target is visible on screen
            const margin = 20;
            if (target.x >= viewX + margin && target.x <= viewX + viewW - margin &&
                target.y >= viewY + margin && target.y <= viewY + viewH - margin) {
                return; // Visible, don't show arrow
            }

            // Calculate Intersection of Line (Player -> Target) with Viewport Rect
            const p1 = { x: playerTank.x, y: playerTank.y };
            const p2 = { x: target.x, y: target.y };
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;

            const intersections: {t: number, x: number, y: number}[] = [];
            
            // Left Edge (x = viewX)
            if (dx !== 0) {
               const t = (viewX - p1.x) / dx;
               const y = p1.y + t * dy;
               if (t >= 0 && t <= 1 && y >= viewY && y <= viewY + viewH) intersections.push({t, x: viewX, y});
            }
            // Right Edge (x = viewX + viewW)
            if (dx !== 0) {
               const t = (viewX + viewW - p1.x) / dx;
               const y = p1.y + t * dy;
               if (t >= 0 && t <= 1 && y >= viewY && y <= viewY + viewH) intersections.push({t, x: viewX + viewW, y});
            }
            // Top Edge (y = viewY)
            if (dy !== 0) {
               const t = (viewY - p1.y) / dy;
               const x = p1.x + t * dx;
               if (t >= 0 && t <= 1 && x >= viewX && x <= viewX + viewW) intersections.push({t, x, y: viewY});
            }
            // Bottom Edge (y = viewY + viewH)
            if (dy !== 0) {
               const t = (viewY + viewH - p1.y) / dy;
               const x = p1.x + t * dx;
               if (t >= 0 && t <= 1 && x >= viewX && x <= viewX + viewW) intersections.push({t, x, y: viewY + viewH});
            }

            // We want the intersection point closest to the Target (Highest t)
            intersections.sort((a, b) => b.t - a.t);
            const best = intersections[0];

            if (best) {
                const screenX = (best.x - camX) * zoom;
                const screenY = (best.y - camY) * zoom;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const angle = Math.atan2(dy, dx);
                
                // Clamp slightly to ensure drawing is visible
                const padding = 25;
                const drawX = Math.max(padding, Math.min(viewportWidth - padding, screenX));
                const drawY = Math.max(padding, Math.min(viewportHeight - padding, screenY));

                ctx.save();
                ctx.translate(drawX, drawY);
                
                // Arrow
                ctx.save();
                ctx.rotate(angle);
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(-10, 7);
                ctx.lineTo(-10, -7);
                ctx.fill();
                ctx.restore();

                // Text
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Performance: ShadowBlur removed
                ctx.fillText(`${Math.round(dist)}m`, 0, 20);

                ctx.restore();
            }
        });
    }
  };

  const drawTank = (ctx: CanvasRenderingContext2D, tank: Tank) => {
    ctx.save();
    ctx.translate(tank.x, tank.y);
    
    // Performance: removed shadowBlur for tank body
    
    ctx.fillStyle = tank.color;
    ctx.beginPath();
    ctx.arc(0, -10, 15, 0, Math.PI, true);
    ctx.fillRect(-15, -10, 30, 10);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-18, -5, 36, 8);
    ctx.fillStyle = '#475569';
    for(let i=-15; i<15; i+=6) {
        ctx.beginPath(); ctx.arc(i+3, -1, 2, 0, Math.PI*2); ctx.fill();
    }
    
    ctx.save();
    ctx.translate(0, -10);
    const rad = tank.angle * (Math.PI / 180);
    ctx.rotate(-rad);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, -3, 25, 6);
    ctx.restore();

    ctx.translate(0, -40);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-20, 0, 40, 6);
    ctx.fillStyle = tank.health > 30 ? '#4ade80' : '#ef4444';
    ctx.fillRect(-19, 1, 38 * (tank.health / tank.maxHealth), 4);

    if (stateRef.current.tanks[stateRef.current.currentTurnIndex].id === tank.id) {
       ctx.beginPath();
       ctx.moveTo(0, -10);
       ctx.lineTo(-6, -18);
       ctx.lineTo(6, -18);
       ctx.fillStyle = '#facc15'; 
       ctx.fill();
    }

    ctx.restore();
  };

  const drawTrajectory = (ctx: CanvasRenderingContext2D, tank: Tank) => {
    ctx.beginPath();
    ctx.moveTo(tank.x, tank.y - 10);
    
    const rad = tank.angle * (Math.PI / 180);
    const speed = (tank.power / 100) * MAX_POWER;
    let vx = Math.cos(rad) * speed;
    let vy = -Math.sin(rad) * speed;
    
    let x = tank.x;
    let y = tank.y - 10;
    
    for (let i = 0; i < 25; i++) {
        x += vx * 3;
        y += vy * 3;
        vy += GRAVITY * 3;
        vx += stateRef.current.wind * 3;
        ctx.lineTo(x, y);
    }
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const fire = (tank: Tank) => {
    if (stateRef.current.phase !== GamePhase.AIMING) return;

    stateRef.current.phase = GamePhase.FIRING;
    cameraModeRef.current = 'FOLLOW_PROJECTILE';

    const rad = tank.angle * (Math.PI / 180);
    const speed = (tank.power / 100) * MAX_POWER;

    const createProj = (angleOffset: number = 0) => {
        const finalRad = rad + (angleOffset * (Math.PI / 180));
        return {
            id: Math.random().toString(36),
            x: tank.x,
            y: tank.y - 15,
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
        // Calculate offset to center the spread
        // If count is 1, offset is 0.
        // If count is 3, spread 10: -10, 0, 10
        let angleOffset = 0;
        if (count > 1) {
            angleOffset = (-((count - 1) * spread) / 2) + (i * spread);
        }
        stateRef.current.projectiles.push(createProj(angleOffset));
    }

    stateRef.current.phase = GamePhase.PROJECTILE_MOVING;
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key;
    if (key === 'ArrowLeft') inputRef.current.left = true;
    if (key === 'ArrowRight') inputRef.current.right = true;
    if (key === 'ArrowUp') handleAngleChange((uiState.currentPlayer?.angle || 0) + 1);
    if (key === 'ArrowDown') handleAngleChange((uiState.currentPlayer?.angle || 0) - 1);
    if (key === ' ' && !inputRef.current.fire) {
        inputRef.current.fire = true;
        if (uiState.currentPlayer && uiState.currentPlayer.isPlayer) {
            fire(uiState.currentPlayer);
        }
    }
  }, [uiState.currentPlayer]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key;
    if (key === 'ArrowLeft') inputRef.current.left = false;
    if (key === 'ArrowRight') inputRef.current.right = false;
    if (key === ' ') inputRef.current.fire = false;
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Updated Mouse Handlers for Zoom compatibility
  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startCamX: cameraRef.current.x,
        startCamY: cameraRef.current.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (dragRef.current.isDragging) {
          const zoom = cameraRef.current.zoom;
          const dx = (e.clientX - dragRef.current.startX) / zoom;
          const dy = (e.clientY - dragRef.current.startY) / zoom;
          
          let newX = dragRef.current.startCamX - dx;
          let newY = dragRef.current.startCamY - dy;
          
          // We can just set it here, clamp logic in updateCamera will handle bounds
          cameraRef.current.x = newX;
          cameraRef.current.y = newY;
      }
  };

  const handleMouseUp = () => {
      dragRef.current.isDragging = false;
  };

  const handleZoom = (direction: 'in' | 'out') => {
      const currentTarget = cameraRef.current.targetZoom;
      const newZoom = direction === 'in' 
         ? Math.min(currentTarget + 0.25, 2.5)
         : Math.max(currentTarget - 0.25, 0.4);
      cameraRef.current.targetZoom = newZoom;
      // Note: We don't need to trigger a react re-render, the loop handles smoothing
  };

  const handleWeaponSelect = (type: WeaponType) => {
    const tank = stateRef.current.tanks[stateRef.current.currentTurnIndex];
    if (tank.isPlayer && stateRef.current.phase === GamePhase.AIMING) {
        tank.selectedWeapon = type;
        updateUI(true);
    }
  };

  const handlePowerChange = (val: number) => {
    const tank = stateRef.current.tanks[stateRef.current.currentTurnIndex];
    if (tank.isPlayer && stateRef.current.phase === GamePhase.AIMING) {
        tank.power = val;
        updateUI(true);
    }
  };

  const handleAngleChange = (val: number) => {
    const tank = stateRef.current.tanks[stateRef.current.currentTurnIndex];
    if (tank.isPlayer && stateRef.current.phase === GamePhase.AIMING) {
        const clamped = Math.max(0, Math.min(180, val));
        tank.angle = clamped;
        updateUI(true);
    }
  };

  const restartGame = () => {
    window.location.reload();
  };

  return (
    <div className="w-full h-[100dvh] flex flex-col font-sans bg-gray-950 text-gray-100 select-none overflow-hidden">
        
        {/* Game Container */}
        <div 
            ref={containerRef}
            className="flex-1 min-h-0 relative cursor-crosshair active:cursor-grabbing overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <canvas 
                ref={canvasRef} 
                width={uiState.viewportWidth} 
                height={uiState.viewportHeight}
                className="block"
            />
            
            {/* Wind Indicator */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-6 py-2 rounded-full border border-gray-700 flex items-center gap-3 shadow-lg shadow-purple-900/20 pointer-events-none">
                <span className="text-xs font-bold text-gray-400 tracking-wider">WIND</span>
                <span className={`font-mono font-bold text-lg ${uiState.wind > 0 ? "text-green-400" : "text-red-400"}`}>
                    {Math.abs(Math.round(uiState.wind * 100))} {uiState.wind > 0 ? '→' : '←'}
                </span>
            </div>

            {/* Zoom Controls */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
                <button 
                    onClick={() => handleZoom('in')}
                    className="bg-gray-800/80 hover:bg-gray-700 p-3 rounded-full border border-gray-600 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
                >
                    <ZoomIn size={24} />
                </button>
                <button 
                    onClick={() => handleZoom('out')}
                    className="bg-gray-800/80 hover:bg-gray-700 p-3 rounded-full border border-gray-600 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
                >
                    <ZoomOut size={24} />
                </button>
            </div>

            {/* Drag Hint */}
            <div className="absolute top-4 right-4 text-gray-500 text-xs flex items-center gap-2 pointer-events-none opacity-50">
                <MoveHorizontal size={14} /> Drag to pan
            </div>

             {/* Game Over */}
             {uiState.winner && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-in fade-in duration-500">
                    <h1 className="text-7xl font-black mb-6 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 text-transparent bg-clip-text drop-shadow-[0_0_35px_rgba(168,85,247,0.5)]">
                        {uiState.winner} WINS
                    </h1>
                    <button 
                        onClick={restartGame}
                        className="px-10 py-4 bg-white text-black font-black text-xl tracking-widest hover:scale-105 transition-transform"
                    >
                        PLAY AGAIN
                    </button>
                </div>
            )}
        </div>

        {/* HUD Controls */}
        <div className="bg-gray-900 border-t border-gray-800 p-2 md:p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10 shrink-0">
            <div className="max-w-7xl mx-auto">
                
                {/* Responsive Grid */}
                <div className="grid grid-cols-12 gap-2 md:gap-4 items-center">
                    
                    {/* Status (Compact row on mobile, panel on desktop) */}
                    <div className="col-span-12 md:col-span-3 lg:col-span-2 bg-gray-800/50 rounded-lg p-2 border border-gray-700 flex flex-row md:flex-col items-center md:items-stretch justify-between gap-2 md:gap-4">
                        <div className="flex items-center gap-2">
                           {uiState.currentPlayer?.isPlayer ? <UserIcon size={18} className="text-blue-400"/> : <BotIcon size={18} className="text-red-400"/>}
                           <span className={`font-bold uppercase tracking-wider text-sm md:text-base ${uiState.currentPlayer?.isPlayer ? 'text-blue-400' : 'text-red-400'}`}>
                               {uiState.currentPlayer?.isPlayer ? 'Player' : 'Enemy'}
                           </span>
                        </div>
                        <div className="flex flex-col md:block items-end md:items-start min-w-[100px]">
                            <div className="flex justify-between w-full text-[10px] text-gray-400 uppercase font-bold">
                                <span>Fuel</span>
                                <span>{Math.floor(uiState.currentPlayer?.fuel || 0)}</span>
                            </div>
                            <div className="w-24 md:w-full bg-gray-700 h-1.5 rounded-full overflow-hidden mt-1">
                                <div className="bg-gradient-to-r from-yellow-500 to-orange-500 h-full transition-all" style={{ width: `${(uiState.currentPlayer?.fuel || 0) / MAX_FUEL * 100}%`}}></div>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className={`col-span-12 md:col-span-9 lg:col-span-10 grid grid-cols-12 gap-2 transition-all duration-300 ${(!uiState.currentPlayer?.isPlayer || uiState.winner) ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                        
                        {/* Movement (Left on mobile) */}
                        <div className="col-span-3 md:col-span-2 flex flex-col justify-center h-full">
                            <div className="flex gap-1 h-full max-h-16">
                                <button 
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 active:bg-blue-600 active:text-white rounded border border-gray-700 flex items-center justify-center transition-colors"
                                    onMouseDown={() => inputRef.current.left = true}
                                    onMouseUp={() => inputRef.current.left = false}
                                    onMouseLeave={() => inputRef.current.left = false}
                                    onTouchStart={(e) => { e.preventDefault(); inputRef.current.left = true; }}
                                    onTouchEnd={(e) => { e.preventDefault(); inputRef.current.left = false; }}
                                >
                                    <ArrowLeft size={20} />
                                </button>
                                <button 
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 active:bg-blue-600 active:text-white rounded border border-gray-700 flex items-center justify-center transition-colors"
                                    onMouseDown={() => inputRef.current.right = true}
                                    onMouseUp={() => inputRef.current.right = false}
                                    onMouseLeave={() => inputRef.current.right = false}
                                    onTouchStart={(e) => { e.preventDefault(); inputRef.current.right = true; }}
                                    onTouchEnd={(e) => { e.preventDefault(); inputRef.current.right = false; }}
                                >
                                    <ArrowRight size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Sliders & Weapons (Center on mobile) */}
                        <div className="col-span-6 md:col-span-7 lg:col-span-8 flex flex-col justify-center gap-2">
                             <div className="flex gap-4">
                                 <div className="flex-1 space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                        <span>ANG</span>
                                        <span className="text-blue-400">{uiState.currentPlayer?.angle}°</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="180" 
                                        value={180 - (uiState.currentPlayer?.angle || 0)} 
                                        onChange={(e) => handleAngleChange(180 - parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                 </div>
                                 <div className="flex-1 space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                        <span>PWR</span>
                                        <span className="text-red-400">{uiState.currentPlayer?.power}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="100" 
                                        value={uiState.currentPlayer?.power || 0} 
                                        onChange={(e) => handlePowerChange(parseInt(e.target.value))}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                                    />
                                 </div>
                            </div>
                            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                                {Object.values(WEAPONS)
                                    .filter(w => w.type !== WeaponType.AIRSTRIKE_BOMB && w.type !== WeaponType.LANDMINE_ARMED)
                                    .map((w) => (
                                    <button 
                                        key={w.type}
                                        onClick={() => handleWeaponSelect(w.type)}
                                        className={`flex-1 min-w-[60px] py-1 text-[10px] md:text-xs font-bold border rounded transition-all whitespace-nowrap
                                            ${uiState.currentPlayer?.selectedWeapon === w.type 
                                                ? `bg-${w.color} text-white shadow-[0_0_10px_${w.color}]` 
                                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}
                                        `}
                                        style={{ 
                                            backgroundColor: uiState.currentPlayer?.selectedWeapon === w.type ? w.color : undefined,
                                            borderColor: uiState.currentPlayer?.selectedWeapon === w.type ? w.color : undefined 
                                        }}
                                    >
                                        {w.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Fire (Right on mobile) */}
                        <div className="col-span-3 md:col-span-3 lg:col-span-2">
                            <button 
                                onClick={() => uiState.currentPlayer && fire(uiState.currentPlayer)}
                                className="w-full h-full min-h-[60px] bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-lg md:text-2xl tracking-widest rounded-lg shadow-lg shadow-red-900/40 active:scale-95 transition-transform border-t border-red-400 flex items-center justify-center"
                            >
                                FIRE
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default Game;