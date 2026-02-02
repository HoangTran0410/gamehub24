import { useEffect, useState, useRef, useCallback } from "react";
import GunnyWars from "./GunnyWars";
import type { Tank, Projectile, MoveDirection } from "./types";
import { GamePhase } from "./types";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MAX_FUEL,
  SELECTABLE_WEAPONS,
  GRAVITY,
  MAX_POWER,
  WEAPONS,
  PARTICLE_STRIDE,
} from "./constants";
import {
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  Bot,
  User,
  Play,
  RotateCw,
  UserPlus,
  UserMinus,
  Maximize,
  Minimize,
} from "lucide-react";
import type { GameUIProps } from "../types";
import useLanguage from "../../stores/languageStore";
import { formatNumber } from "../../utils";
import useGameState from "../../hooks/useGameState";

// Star type for background
interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

type CameraMode =
  | "MANUAL"
  | "FOLLOW_PLAYER"
  | "FOLLOW_PROJECTILE"
  | "FOLLOW_TANK";
interface CameraState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  zoom: number;
  targetZoom: number;
  mode: CameraMode;
}

let lastFrameTime = performance.now();
let fps = 0;
let fpsTimer = 0;

export default function GunnyWarsUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as unknown as GunnyWars;
  const { ts, ti } = useLanguage();

  // UI state
  const [state] = useGameState(game);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [forceGpuRender, setForceGpuRender] = useState(true); // Toggle for GPU/CPU rendering

  // Current player info
  const currentTankInState = state.tanks[state.currentTurnIndex];
  const currentTank = currentTankInState
    ? game.getVisualTank(currentTankInState)
    : undefined;
  const isMyTurn = game.isMyTurn();

  // Local angle/power/position for live UI updates (sync on release/stop move)
  const [localAngle, setLocalAngle] = useState<number | null>(45);
  const [localPower, setLocalPower] = useState<number | null>(50);
  const localAngleRef = useRef<number | null>(null);
  const localPowerRef = useRef<number | null>(null);
  useEffect(() => {
    localAngleRef.current = localAngle;
  }, [localAngle]);
  useEffect(() => {
    localPowerRef.current = localPower;
  }, [localPower]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null); // WebGL terrain canvas
  const starsRef = useRef<Star[]>([]);
  const animationRef = useRef<number | null>(null);
  const useGpuRef = useRef<boolean>(true); // Track if GPU rendering is active
  const forceGpuRenderRef = useRef<boolean>(true); // Track toggle state for draw function
  const lastRenderedSizeRef = useRef({ width: 0, height: 0 });

  // Sync forceGpuRender state with ref
  useEffect(() => {
    forceGpuRenderRef.current = forceGpuRender;
  }, [forceGpuRender]);
  const cameraRef = useRef<CameraState>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    zoom: 0.8,
    targetZoom: 0.8,
    mode: "FOLLOW_PLAYER",
  });
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startCamX: 0,
    startCamY: 0,
    // Momentum tracking
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    // Pinch zoom
    startPinchDist: 0,
    startZoom: 1,
  });
  const inputRef = useRef({
    left: false,
    right: false,
  });
  // Store indicator hit areas for click detection
  const indicatorHitAreasRef = useRef<
    Map<string, { x: number; y: number; radius: number }>
  >(new Map());
  // Track which tank camera is focused on (for indicator click)
  const focusedTankIdRef = useRef<string | null>(null);

  // Refs
  const viewportSizeRef = useRef(viewportSize);
  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  // Generate stars
  useEffect(() => {
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 50; i++) {
        starsRef.current.push({
          x: Math.random() * 2000,
          y: Math.random() * 1200,
          size: Math.random() * 2 + 0.5,
          alpha: Math.random() * 0.6 + 0.2,
        });
      }
    }
  }, []);

  // Initialize
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Initialize WebGL shader renderer
  const callInitShaderRef = useRef(false);
  useEffect(() => {
    if (state.phase === "WAITING") {
      callInitShaderRef.current = false;
      return;
    }

    if (callInitShaderRef.current) return;
    callInitShaderRef.current = true;

    const webglCanvas = webglCanvasRef.current;
    if (!webglCanvas) return;

    // Try to initialize GPU rendering
    const success = game.initShaderRenderer(webglCanvas);
    useGpuRef.current = success;

    if (success) {
      console.log("GPU terrain rendering enabled");
    } else {
      console.warn("GPU rendering unavailable, using CPU fallback");
    }
  }, [game, state.phase]);

  // Handle resize (window + container with ResizeObserver)
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const _vh = isFullscreen
          ? containerRef.current.clientHeight
          : window.innerHeight * 0.7;
        setViewportSize({
          width: containerRef.current.clientWidth,
          height: _vh,
        });
      }
    };

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen to window resize as fallback
    window.addEventListener("resize", handleResize);
    handleResize();

    // Fullscreen change listener
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [state.phase, isFullscreen]);

  // Render loop + game tick
  useEffect(() => {
    console.warn("useEffect loop");
    const updateCamera = () => {
      const vpW = viewportSizeRef.current.width;
      const vpH = viewportSizeRef.current.height;

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
        cameraRef.current.mode = "MANUAL";
      } else if (cameraRef.current.mode === "MANUAL") {
        // Apply momentum (Inertia)
        cameraRef.current.x += cameraRef.current.vx;
        cameraRef.current.y += cameraRef.current.vy;

        // Friction (Damping) - User bumped this to 0.99 for longer slides
        cameraRef.current.vx *= 0.95;
        cameraRef.current.vy *= 0.95;

        // Stop if too slow
        if (Math.abs(cameraRef.current.vx) < 0.1) cameraRef.current.vx = 0;
        if (Math.abs(cameraRef.current.vy) < 0.1) cameraRef.current.vy = 0;

        // Reset velocity if too much time passed since last move (flick prevention if held still)
        // const timeSinceLastMove = performance.now() - dragRef.current.lastTime;
        // if (
        //   timeSinceLastMove > 50 &&
        //   (cameraRef.current.vx !== 0 || cameraRef.current.vy !== 0)
        // ) {
        //   cameraRef.current.vx *= 0.99;
        //   cameraRef.current.vy *= 0.99;
        // }

        if (Math.abs(zoom - oldZoom) > 0.0001) {
          const prevCenterX = cameraRef.current.x + vpW / 2 / oldZoom;
          const prevCenterY = cameraRef.current.y + vpH / 2 / oldZoom;
          cameraRef.current.x = prevCenterX - centerOffsetX;
          cameraRef.current.y = prevCenterY - centerOffsetY;
        }
      } else {
        let targetX = cameraRef.current.x;
        let targetY = cameraRef.current.y;

        if (game.state.phase === GamePhase.IMPACT) {
          // Keep current position during impact
          // Shake camera on impact?
          // cameraRef.current.x += Math.random() * 2 - 1;
          // cameraRef.current.y += Math.random() * 2 - 1;
        } else if (
          cameraRef.current.mode === "FOLLOW_PROJECTILE" &&
          game.projectiles.length > 0
        ) {
          const moving = game.projectiles;
          if (moving.length > 0) {
            const avgX =
              moving.reduce((sum: number, p: Projectile) => sum + p.x, 0) /
              moving.length;
            const avgY =
              moving.reduce((sum: number, p: Projectile) => sum + p.y, 0) /
              moving.length;
            targetX = avgX - centerOffsetX;
            targetY = avgY - centerOffsetY;
          } else {
            const activeTank = game.state.tanks[game.state.currentTurnIndex];
            if (activeTank) {
              targetX = activeTank.x - centerOffsetX;
              targetY = activeTank.y - centerOffsetY;
            }
          }
        } else if (cameraRef.current.mode === "FOLLOW_PLAYER") {
          const activeTankBase = game.state.tanks[game.state.currentTurnIndex];
          if (activeTankBase) {
            const activeTank = game.getVisualTank(activeTankBase);
            targetX = activeTank.x - centerOffsetX;
            targetY = activeTank.y - centerOffsetY;
          }
        } else if (
          cameraRef.current.mode === "FOLLOW_TANK" &&
          focusedTankIdRef.current
        ) {
          const targetTankBase = game.state.tanks.find(
            (t: Tank) => t.id === focusedTankIdRef.current,
          );
          if (targetTankBase && targetTankBase.health > 0) {
            const targetTank = game.getVisualTank(targetTankBase);
            targetX = targetTank.x - centerOffsetX;
            targetY = targetTank.y - centerOffsetY;

            // Check if tank is now in viewport, if so clear focus
            const margin = 50;
            if (
              targetTank.x >= cameraRef.current.x + margin &&
              targetTank.x <= cameraRef.current.x + visibleW - margin &&
              targetTank.y >= cameraRef.current.y + margin &&
              targetTank.y <= cameraRef.current.y + visibleH - margin
            ) {
              // Tank is now visible, switch back to manual mode
              focusedTankIdRef.current = null;
              cameraRef.current.mode = "MANUAL";
            }
          } else {
            // Tank not found or dead, clear focus
            focusedTankIdRef.current = null;
            cameraRef.current.mode = "FOLLOW_PLAYER";
          }
        }

        cameraRef.current.x += (targetX - cameraRef.current.x) * 0.08;
        cameraRef.current.y += (targetY - cameraRef.current.y) * 0.08;
      }

      // Clamp camera
      const minX = 0;
      const maxX = Math.max(0, WORLD_WIDTH - visibleW);
      cameraRef.current.x = Math.max(minX, Math.min(cameraRef.current.x, maxX));

      const maxY = WORLD_HEIGHT - visibleH;
      const minY = -WORLD_HEIGHT;
      cameraRef.current.y = Math.max(minY, Math.min(cameraRef.current.y, maxY));
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Get context with alpha support for transparency over WebGL canvas
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return;

      updateCamera();

      const { width: vpW, height: vpH } = viewportSizeRef.current;
      const zoom = cameraRef.current.zoom;
      const camX = cameraRef.current.x;
      const camY = cameraRef.current.y;

      // Check if GPU rendering is active (respects toggle)
      const shaderRenderer = game.getTerrainShaderRenderer();
      const gpuActive =
        forceGpuRenderRef.current &&
        useGpuRef.current &&
        shaderRenderer?.isReady();

      // Clear canvas
      ctx.clearRect(0, 0, vpW, vpH);

      // Only draw background + stars on CPU if GPU is NOT active
      if (!gpuActive) {
        // CPU background gradient
        const grad = ctx.createLinearGradient(0, 0, 0, vpH);
        grad.addColorStop(0, "#020617");
        grad.addColorStop(1, "#172554");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, vpW, vpH);

        // CPU Stars (parallax)
        ctx.fillStyle = "#ffffff";
        for (const star of starsRef.current) {
          const vx = (((star.x - camX * 0.05) % vpW) + vpW) % vpW;
          const vy = (((star.y - camY * 0.05) % vpH) + vpH) % vpH;
          ctx.globalAlpha = star.alpha;
          ctx.beginPath();
          ctx.arc(vx, vy, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // World space
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // Draw terrain
      if (gpuActive && shaderRenderer) {
        // GPU rendering - draw to WebGL canvas
        const webglCanvas = webglCanvasRef.current;
        if (webglCanvas) {
          // Resize if needed
          if (
            lastRenderedSizeRef.current.width !== vpW ||
            lastRenderedSizeRef.current.height !== vpH ||
            webglCanvas.width !== vpW ||
            webglCanvas.height !== vpH
          ) {
            webglCanvas.width = vpW;
            webglCanvas.height = vpH;
            lastRenderedSizeRef.current = { width: vpW, height: vpH };
            shaderRenderer.resize(vpW, vpH);
          }
          // Render terrain with GPU (includes background + stars + terrain)
          shaderRenderer.render(
            game.state.terrainSeed,
            camX,
            camY,
            vpW,
            vpH,
            zoom,
          );
        }
      } else {
        // CPU fallback - chunk-based rendering
        const terrainRenderer = game.getTerrainRenderer();
        const terrainMap = game.getTerrainMap();
        if (terrainRenderer && terrainMap) {
          terrainRenderer.renderVisibleChunks(
            ctx,
            camX,
            camY,
            vpW,
            vpH,
            zoom,
            terrainMap,
          );
        }
      }

      const visibleW = vpW / zoom;
      const visibleH = vpH / zoom;

      // Draw particles (GPU prioritized)
      const particleRenderer = game.getParticleShaderRenderer();
      if (particleRenderer && particleRenderer.isReady()) {
        particleRenderer.render(
          game.particleData,
          game.particleCount,
          camX,
          camY,
          vpW,
          vpH,
          zoom,
        );
      } else {
        // 2D Fallback - Optimized to use the buffer directly
        const particleMargin = 50;
        const data = game.particleData;
        const count = game.particleCount;

        for (let i = 0; i < count; i++) {
          const idx = i * PARTICLE_STRIDE;
          const px = data[idx + 0];
          const py = data[idx + 1];

          // Simple culling
          if (
            px < camX - particleMargin ||
            px > camX + visibleW + particleMargin ||
            py < camY - particleMargin ||
            py > camY + visibleH + particleMargin
          ) {
            continue;
          }

          const plife = data[idx + 4];
          const psize = data[idx + 6];
          const padditive = data[idx + 11];
          const r = Math.round(data[idx + 8] * 255);
          const g = Math.round(data[idx + 9] * 255);
          const b = Math.round(data[idx + 10] * 255);

          ctx.save();
          ctx.globalAlpha = plife;
          if (padditive > 0.5) {
            ctx.globalCompositeOperation = "lighter";
          }
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.beginPath();
          ctx.arc(px, py, psize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw tanks (from live ref + local sim)
      // Margin for tanks (health bars etc)
      const tankMargin = 100;
      for (const tankBase of game.state.tanks) {
        if (tankBase.health <= 0) continue;

        // Use visual tank (includes local simulation)
        const tank = game.getVisualTank(tankBase);

        // Culling for tanks
        if (
          tank.x < camX - tankMargin ||
          tank.x > camX + visibleW + tankMargin ||
          tank.y < camY - tankMargin ||
          tank.y > camY + visibleH + tankMargin
        ) {
          continue;
        }

        const isMyTank = tank.playerId === game.userId;

        drawTank(
          ctx,
          tank,
          isMyTank ? (localAngleRef.current ?? tank.angle) : tank.angle,
          zoom,
        );
      }

      // Draw projectiles
      const projectileMargin = 50;
      for (const p of game.projectiles) {
        if (!p.active) continue;

        // Culling for projectiles
        if (
          p.x < camX - projectileMargin ||
          p.x > camX + visibleW + projectileMargin ||
          p.y < camY - projectileMargin ||
          p.y > camY + visibleH + projectileMargin
        ) {
          continue;
        }

        ctx.save();

        // if (p.weapon === WeaponType.LANDMINE_ARMED) {
        //   ctx.beginPath();
        //   ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        //   ctx.fillStyle = "#ff0000";
        //   ctx.fill();
        //   if (Math.floor(Date.now() / 200) % 2 === 0) {
        //     ctx.fillStyle = "#fff";
        //     ctx.beginPath();
        //     ctx.arc(p.x, p.y - 5, 5, 0, Math.PI * 2);
        //     ctx.fill();
        //   }
        // } else {
        const color =
          SELECTABLE_WEAPONS.find((w) => w.type === p.weapon)?.color ||
          "#38bdf8";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        // }
        ctx.restore();
      }

      // Draw trajectory preview
      const currentTankBase = game.state.tanks[game.state.currentTurnIndex];
      if (
        currentTankBase &&
        // game.isMyTurn() &&
        game.state.phase === GamePhase.AIMING
      ) {
        const currentTank = game.getVisualTank(currentTankBase);
        const isMyTurn = game.isMyTurn();
        drawTrajectory(
          ctx,
          currentTank,
          isMyTurn
            ? (localAngleRef.current ?? currentTankBase.angle)
            : currentTankBase.angle,
          isMyTurn
            ? (localPowerRef.current ?? currentTankBase.power)
            : currentTankBase.power,
        );
      }

      ctx.restore();

      // Draw enemy indicators (screen space)
      drawEnemyIndicators(ctx, camX, camY, zoom, vpW, vpH);

      // Draw FPS
      drawFPS(ctx);
    };

    const drawTank = (
      ctx: CanvasRenderingContext2D,
      tank: Tank,
      angle: number,
      zoom: number,
    ) => {
      ctx.save();
      ctx.translate(tank.x, tank.y);

      // Body
      ctx.fillStyle = tank.color;
      ctx.beginPath();
      ctx.arc(0, -10, 15, 0, Math.PI, true);
      ctx.fillRect(-15, -10, 30, 10);
      ctx.fill();

      // Tracks
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-18, -5, 36, 8);
      ctx.fillStyle = "#475569";
      for (let i = -15; i < 15; i += 6) {
        ctx.beginPath();
        ctx.arc(i + 3, -1, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Barrel
      ctx.save();
      ctx.translate(0, -10);
      const rad = (angle * Math.PI) / 180;
      ctx.rotate(-rad);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(0, -3, 25, 6);
      ctx.restore();

      // UI Overlay (Non-scaling)
      ctx.save();
      // Inverse scale to keep UI size constant on screen
      ctx.scale(1 / zoom, 1 / zoom);

      // Health bar
      ctx.translate(0, -40 * zoom); // Adjust translation by zoom to keep world position relative to tank

      // Tank Name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(tank.name, 0, -10);

      ctx.fillStyle = "#334155";
      ctx.fillRect(-20, 0, 40, 6);
      ctx.fillStyle = tank.health > 30 ? "#4ade80" : "#ef4444";
      ctx.fillRect(-19, 1, 38 * (tank.health / tank.maxHealth), 4);

      // Fuel bar
      ctx.translate(0, 8);
      ctx.fillStyle = "#334155";
      ctx.fillRect(-20, 0, 40, 4);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(-19, 1, 38 * (tank.fuel / MAX_FUEL), 2);

      // Indicators and Labels
      if (game.state.tanks[game.state.currentTurnIndex]?.id === tank.id) {
        // Current turn indicator
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(-6, -23);
        ctx.lineTo(6, -23);
        ctx.fillStyle = "#facc15";
        ctx.fill();

        // Weapon name
        const weapon = WEAPONS[tank.weapon];
        if (weapon) {
          ctx.fillStyle = weapon.color;
          ctx.font = "bold 12px Arial";
          ctx.textAlign = "center";
          ctx.fillText(weapon.name, 0, -35);
        }
      }
      ctx.restore();

      ctx.restore();
    };

    const drawTrajectory = (
      ctx: CanvasRenderingContext2D,
      tank: Tank,
      angle: number,
      power: number,
    ) => {
      ctx.beginPath();
      ctx.moveTo(tank.x, tank.y - 10);

      const rad = (angle * Math.PI) / 180;
      const speed = (power / 100) * MAX_POWER;
      let vx = Math.cos(rad) * speed;
      let vy = -Math.sin(rad) * speed;

      let x = tank.x;
      let y = tank.y - 10;

      for (let i = 0; i < 25; i++) {
        x += vx * 3;
        y += vy * 3;
        vy += GRAVITY * 3;
        vx += game.state.wind * 3;
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]); // Dashed line
      ctx.stroke();
      ctx.setLineDash([]); // Reset to solid
    };

    const drawEnemyIndicators = (
      ctx: CanvasRenderingContext2D,
      camX: number,
      camY: number,
      zoom: number,
      vpW: number,
      vpH: number,
    ) => {
      // Clear hit areas for this frame
      indicatorHitAreasRef.current.clear();

      const viewW = vpW / zoom;
      const viewH = vpH / zoom;
      const margin = 20;

      // Viewport bounds in world space
      const viewLeft = camX + margin;
      const viewRight = camX + viewW - margin;
      const viewTop = camY + margin;
      const viewBottom = camY + viewH - margin;

      for (const tankBase of game.state.tanks) {
        if (tankBase.health <= 0) continue;

        const tank = game.getVisualTank(tankBase);

        // Check if tank is inside viewport
        if (
          tank.x >= viewLeft &&
          tank.x <= viewRight &&
          tank.y >= viewTop &&
          tank.y <= viewBottom
        ) {
          continue;
        }

        // Calculate distance from viewport edge to the tank
        let distX = 0;
        let distY = 0;

        if (tank.x < viewLeft) {
          distX = viewLeft - tank.x;
        } else if (tank.x > viewRight) {
          distX = tank.x - viewRight;
        }

        if (tank.y < viewTop) {
          distY = viewTop - tank.y;
        } else if (tank.y > viewBottom) {
          distY = tank.y - viewBottom;
        }

        const distFromEdge = Math.sqrt(distX * distX + distY * distY);

        // Calculate angle from viewport center to tank
        const viewCenterX = camX + viewW / 2;
        const viewCenterY = camY + viewH / 2;
        const dx = tank.x - viewCenterX;
        const dy = tank.y - viewCenterY;
        const angle = Math.atan2(dy, dx);

        // Calculate screen position (clamped to edges)
        const screenX = Math.max(
          25,
          Math.min(vpW - 25, (tank.x - camX) * zoom),
        );
        const screenY = Math.max(
          25,
          Math.min(vpH - 25, (tank.y - camY) * zoom),
        );

        ctx.save();
        ctx.translate(screenX, screenY);

        // Arrow - use tank color
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = tank.color || "#ef4444";
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-10, 7);
        ctx.lineTo(-10, -7);
        ctx.fill();
        ctx.restore();

        // Distance text (from edge)
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${formatNumber(Math.round(distFromEdge))}m`, 0, 20);

        ctx.restore();

        // Store hit area for click detection
        indicatorHitAreasRef.current.set(tank.id, {
          x: screenX,
          y: screenY,
          radius: 25,
        });
      }
    };

    const drawFPS = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`${fps.toFixed(0)} FPS`, 0, 0);
    };

    function render() {
      const now = performance.now();
      let delta = now - lastFrameTime;
      fpsTimer += delta;
      lastFrameTime = now;

      // Update game logic (movement, etc)
      game.update();

      let _fps = 1000 / delta;
      // lerp fps
      fps = fps + (_fps - fps) * 0.1;

      draw();

      animationRef.current = requestAnimationFrame(render);
    }

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") inputRef.current.left = true;
      if (e.key === "ArrowRight") inputRef.current.right = true;
      if (
        e.key === " " &&
        game.isMyTurn() &&
        game.state.phase === GamePhase.AIMING
      ) {
        e.preventDefault();
        game.fire();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") inputRef.current.left = false;
      if (e.key === "ArrowRight") inputRef.current.right = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [game]);

  // Movement helpers
  const handleMoveStart = useCallback(
    (dir: MoveDirection) => {
      console.log("move start");
      if (game.state.phase !== GamePhase.AIMING || !game.isMyTurn()) return;
      const myTank = game.getMyTank();
      if (!myTank) return;

      if (!myTank.isMoving || myTank.moveDir !== dir) {
        console.log("inside move start");
        myTank.isMoving = true;
        myTank.moveDir = dir;
        game.moveStart(dir);
        cameraRef.current.mode = "FOLLOW_PLAYER";
      }
    },
    [game],
  );

  const handleMoveEnd = useCallback(
    (dir: MoveDirection) => {
      const myTank = game.getMyTank();
      if (!myTank) return;

      if (myTank.isMoving && myTank.moveDir === dir) {
        game.moveStop();
      }
    },
    [game],
  );

  // Movement loop (Keyboard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "ArrowLeft") handleMoveStart(-1);
      if (e.key === "ArrowRight") handleMoveStart(1);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleMoveEnd(-1);
      if (e.key === "ArrowRight") handleMoveEnd(1);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [game, handleMoveStart, handleMoveEnd]);

  // Update camera mode based on game phase
  useEffect(() => {
    if (
      state.phase === GamePhase.PROJECTILE_MOVING ||
      state.phase === GamePhase.FIRING ||
      state.phase === GamePhase.IMPACT
    ) {
      cameraRef.current.mode = "FOLLOW_PROJECTILE";
    } else if (state.phase === GamePhase.AIMING) {
      cameraRef.current.mode = "FOLLOW_PLAYER";
    }
  }, [state.phase]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current.isDragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startCamX = cameraRef.current.x;
    dragRef.current.startCamY = cameraRef.current.y;
    // Momentum init
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.lastTime = performance.now();
    cameraRef.current.vx = 0;
    cameraRef.current.vy = 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current.isDragging) {
      const now = performance.now();
      const dt = Math.max(1, now - dragRef.current.lastTime);
      const zoom = cameraRef.current.zoom;

      const dx = (e.clientX - dragRef.current.startX) / zoom;
      const dy = (e.clientY - dragRef.current.startY) / zoom;

      // Track velocity (World pixels per frame equivalent, normalized to 16ms)
      const instantVx =
        ((dragRef.current.lastX - e.clientX) / zoom) * (16 / dt);
      const instantVy =
        ((dragRef.current.lastY - e.clientY) / zoom) * (16 / dt);

      // Low pass filter for smoother velocity, but less aggressive damping
      cameraRef.current.vx = cameraRef.current.vx * 0.4 + instantVx * 0.6;
      cameraRef.current.vy = cameraRef.current.vy * 0.4 + instantVy * 0.6;

      cameraRef.current.x = dragRef.current.startCamX - dx;
      cameraRef.current.y = dragRef.current.startCamY - dy;

      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      dragRef.current.lastTime = now;
    }
  };

  const handleMouseUp = () => {
    dragRef.current.isDragging = false;
  };

  // Touch handlers for mobile support
  const handleTouchStart = (e: React.TouchEvent) => {
    // Dragging
    const touch = e.touches[0];
    dragRef.current.isDragging = true;
    dragRef.current.startX = touch.clientX;
    dragRef.current.startY = touch.clientY;
    dragRef.current.startCamX = cameraRef.current.x;
    dragRef.current.startCamY = cameraRef.current.y;
    // Momentum init
    dragRef.current.lastX = touch.clientX;
    dragRef.current.lastY = touch.clientY;
    dragRef.current.lastTime = performance.now();
    cameraRef.current.vx = 0;
    cameraRef.current.vy = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragRef.current.isDragging) {
      // Dragging
      const now = performance.now();
      const dt = Math.max(1, now - dragRef.current.lastTime);
      const touch = e.touches[0];
      const zoom = cameraRef.current.zoom;

      const dx = (touch.clientX - dragRef.current.startX) / zoom;
      const dy = (touch.clientY - dragRef.current.startY) / zoom;

      // Track velocity
      const instantVx =
        ((dragRef.current.lastX - touch.clientX) / zoom) * (16 / dt);
      const instantVy =
        ((dragRef.current.lastY - touch.clientY) / zoom) * (16 / dt);

      cameraRef.current.vx = cameraRef.current.vx * 0.4 + instantVx * 0.6;
      cameraRef.current.vy = cameraRef.current.vy * 0.4 + instantVy * 0.6;

      cameraRef.current.x = dragRef.current.startCamX - dx;
      cameraRef.current.y = dragRef.current.startCamY - dy;

      dragRef.current.lastX = touch.clientX;
      dragRef.current.lastY = touch.clientY;
      dragRef.current.lastTime = now;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      dragRef.current.isDragging = false;
    } else {
      // If we went from 2 fingers to 1, we could potentially resume dragging,
      // but it's often safer to just reset to avoid jumps.
      // Or we can start a new drag from current position:
      const touch = e.touches[0];
      dragRef.current.isDragging = true;
      dragRef.current.startX = touch.clientX;
      dragRef.current.startY = touch.clientY;
      dragRef.current.startCamX = cameraRef.current.x;
      dragRef.current.startCamY = cameraRef.current.y;
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Only process click if we didn't drag
    const dragDistance = Math.sqrt(
      Math.pow(e.clientX - dragRef.current.startX, 2) +
        Math.pow(e.clientY - dragRef.current.startY, 2),
    );
    if (dragDistance > 5) return; // Was a drag, not a click

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check if click is on any indicator
    for (const [tankId, hitArea] of indicatorHitAreasRef.current) {
      const dx = clickX - hitArea.x;
      const dy = clickY - hitArea.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hitArea.radius) {
        // Clicked on this indicator, focus camera on this tank
        focusedTankIdRef.current = tankId;
        cameraRef.current.mode = "FOLLOW_TANK";
        return;
      }
    }
  };

  // Touch tap handler for canvas (to click indicators on mobile)
  const handleCanvasTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Only process tap if we didn't drag
    const dragDistance = Math.sqrt(
      Math.pow(
        (e.changedTouches[0]?.clientX || 0) - dragRef.current.startX,
        2,
      ) +
        Math.pow(
          (e.changedTouches[0]?.clientY || 0) - dragRef.current.startY,
          2,
        ),
    );
    if (dragDistance > 10) return; // Was a drag, not a tap

    const canvas = canvasRef.current;
    if (!canvas || !e.changedTouches[0]) return;

    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const tapX = touch.clientX - rect.left;
    const tapY = touch.clientY - rect.top;

    // Check if tap is on any indicator
    for (const [tankId, hitArea] of indicatorHitAreasRef.current) {
      const dx = tapX - hitArea.x;
      const dy = tapY - hitArea.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hitArea.radius) {
        // Tapped on this indicator, focus camera on this tank
        focusedTankIdRef.current = tankId;
        cameraRef.current.mode = "FOLLOW_TANK";
        return;
      }
    }
  };

  const handleZoom = (direction: "in" | "out") => {
    const currentTarget = cameraRef.current.targetZoom;
    const newZoom =
      direction === "in"
        ? Math.min(currentTarget + 0.25, 2.5)
        : Math.max(currentTarget - 0.25, 0.4);
    cameraRef.current.targetZoom = newZoom;
  };

  // Waiting screen
  if (state.phase === GamePhase.WAITING) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 text-white p-4">
        <h1 className="text-4xl font-black mb-8 bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
          GunnyWars
        </h1>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 w-full max-w-md">
          <h2 className="text-lg font-bold mb-4">
            {ts({ en: "Players", vi: "Người chơi" })}
          </h2>

          <div className="space-y-3">
            {state.players.map((p, index) => (
              <div
                key={(p.id || "bot") + index}
                className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
              >
                {p.id === "BOT" ? (
                  <Bot size={18} className="text-red-400" />
                ) : (
                  <User
                    size={18}
                    className={
                      index === 0 ? "text-blue-400" : "text-emerald-400"
                    }
                  />
                )}
                <span className="font-medium">
                  {p.username || ts({ en: "Waiting...", vi: "Đang đợi..." })}
                </span>
                {index === 0 && (
                  <span className="ml-auto text-xs text-gray-500">
                    {ts({ en: "Host", vi: "Chủ phòng" })}
                  </span>
                )}
                {p.id === "BOT" && game.isHost && (
                  <button
                    onClick={() => game.requestRemoveBot()}
                    className="ml-auto text-red-400 hover:text-red-300 transition-colors p-2 bg-red-400/20 rounded-lg"
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            ))}

            {game.isHost && (
              <button
                onClick={() => game.requestAddBot()}
                className="w-full p-3 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-all flex items-center justify-center gap-2"
              >
                <UserPlus size={18} />
                {ts({ en: "Add Bot", vi: "Thêm Bot" })}
              </button>
            )}
          </div>

          {game.isHost && (
            <button
              onClick={() => game.startGame()}
              disabled={!game.canStartGame()}
              className="w-full mt-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold flex items-center justify-center gap-2"
            >
              <Play size={20} />
              {ts({ en: "Start Game", vi: "Bắt đầu" })}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col font-sans bg-gray-950 text-gray-100 select-none overflow-hidden">
      {/* Game Container */}
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 relative cursor-grab active:cursor-grabbing overflow-hidden touch-none ${isFullscreen ? "" : "h-[60vh]!"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* WebGL canvas for GPU terrain rendering (behind main canvas) */}
        <canvas
          ref={webglCanvasRef}
          width={viewportSize.width}
          height={viewportSize.height}
          className="absolute inset-0 block"
          style={{ zIndex: 0 }}
        />
        {/* Main 2D canvas for tanks, projectiles, UI */}
        <canvas
          ref={canvasRef}
          width={viewportSize.width}
          height={viewportSize.height}
          className="absolute inset-0 block"
          onClick={handleCanvasClick}
          onTouchEnd={handleCanvasTouchEnd}
          style={{ zIndex: 1 }}
        />

        <div
          style={{ width: viewportSize.width, height: viewportSize.height }}
        />

        {/* Wind Indicator */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-6 py-2 rounded-full border border-gray-700 flex items-center gap-3 shadow-lg pointer-events-none">
          <span className="text-xs font-bold text-gray-400 tracking-wider">
            {ti({ en: "WIND", vi: "GIÓ" })}
          </span>
          <span
            className={`font-mono font-bold text-lg ${state.wind > 0 ? "text-green-400" : "text-red-400"}`}
          >
            {Math.abs(Math.round(state.wind * 100))}{" "}
            {state.wind > 0 ? "→" : "←"}
          </span>
        </div>

        {/* Zoom Controls & Fullscreen */}
        <div className="absolute bottom-4 right-4 flex flex-row gap-1 z-20 opacity-30 hover:opacity-100 transition-all duration-300">
          {/* Regenerate Map */}
          <button
            onClick={() => game.requestRegenerateMap()}
            className="bg-purple-800/80 hover:bg-purple-700 p-2 rounded-full border border-purple-600 text-purple-200 shadow-lg backdrop-blur-sm transition-transform active:scale-95"
            title="Regenerate Map"
          >
            <RotateCw size={18} />
          </button>
          {/* GPU/CPU Toggle */}
          <button
            onClick={() => setForceGpuRender(!forceGpuRender)}
            className={`px-3 py-2 rounded-full border text-xs font-bold shadow-lg backdrop-blur-sm transition-all active:scale-95 ${
              forceGpuRender
                ? "bg-green-800/80 hover:bg-green-700 border-green-600 text-green-200"
                : "bg-amber-800/80 hover:bg-amber-700 border-amber-600 text-amber-200"
            }`}
          >
            {forceGpuRender ? "GPU" : "CPU"}
          </button>
          <button
            onClick={() => handleZoom("in")}
            className="bg-gray-800/80 hover:bg-gray-700 p-2 rounded-full border border-gray-600 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => handleZoom("out")}
            className="bg-gray-800/80 hover:bg-gray-700 p-2 rounded-full border border-gray-600 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={async () => {
              if (!document.fullscreenElement) {
                await containerRef.current?.parentElement?.requestFullscreen();
                setIsFullscreen(true);
              } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
              }
            }}
            className="bg-gray-800/80 hover:bg-gray-700 p-2 rounded-full border border-gray-600 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>

        {/* Drag Hint */}
        <div className="absolute top-4 right-4 text-gray-500 text-xs flex items-center gap-2 pointer-events-none opacity-50">
          <MoveHorizontal size={14} />{" "}
          {ts({ en: "Drag to pan camera", vi: "Kéo để di chuyển camera" })}
        </div>

        {/* Game Over */}
        {state.phase === GamePhase.GAME_OVER && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
            <h1 className="text-5xl @md:text-7xl font-black mb-6 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 text-transparent bg-clip-text">
              {state.winner} {ts({ en: "WINS", vi: "THẮNG" })}
            </h1>
            <button
              onClick={() => game.requestReset()}
              className="px-10 py-4 bg-white text-black font-black text-xl tracking-widest hover:scale-105 transition-transform flex items-center gap-2"
            >
              <RotateCw size={24} />
              {ts({ en: "PLAY AGAIN", vi: "CHƠI LẠI" })}
            </button>
          </div>
        )}
      </div>

      {/* HUD Controls */}
      <div className="bg-gray-900 border-t border-gray-800 p-2 @md:p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          {/* Row 1: Turn/Fuel + Movement + Fire */}
          <div className="grid grid-cols-12 gap-2 @md:gap-4 items-stretch">
            {/* Status Panel */}
            <div className="col-span-12 @md:col-span-3 bg-gray-800/50 rounded-lg p-2 border border-gray-700 flex items-center justify-center gap-2">
              {/* Turn */}
              <div className="flex items-center gap-2">
                {currentTank?.isBot ? (
                  <Bot size={18} className="text-red-400" />
                ) : (
                  <User
                    size={18}
                    className={isMyTurn ? "text-blue-400" : "text-red-400"}
                  />
                )}
                <span
                  className={`font-bold uppercase tracking-wider text-xs @md:text-sm ${
                    isMyTurn ? "text-blue-400" : "text-red-400"
                  }`}
                >
                  {state.players.find((p) => p.tankId === currentTank?.id)
                    ?.username ||
                    (currentTank?.isBot
                      ? "Bot"
                      : ts({ en: "Turn", vi: "Lượt" }))}
                </span>
              </div>
            </div>

            {/* Movement */}
            <div
              className={`col-span-6 @md:col-span-3 flex gap-1 ${
                !isMyTurn || state.phase !== GamePhase.AIMING
                  ? "opacity-40 pointer-events-none grayscale"
                  : ""
              }`}
            >
              <button
                className="flex-1 bg-gray-800 hover:bg-gray-700 active:bg-blue-600 active:text-white rounded border border-gray-700 flex items-center justify-center transition-colors"
                onMouseDown={() => handleMoveStart(-1)}
                onMouseUp={() => handleMoveEnd(-1)}
                onMouseLeave={() => handleMoveEnd(-1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleMoveStart(-1);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleMoveEnd(-1);
                }}
              >
                <ArrowLeft size={20} />
              </button>
              <button
                className="flex-1 bg-gray-800 hover:bg-gray-700 active:bg-blue-600 active:text-white rounded border border-gray-700 flex items-center justify-center transition-colors"
                onMouseDown={() => handleMoveStart(1)}
                onMouseUp={() => handleMoveEnd(1)}
                onMouseLeave={() => handleMoveEnd(1)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleMoveStart(1);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleMoveEnd(1);
                }}
              >
                <ArrowRight size={20} />
              </button>
            </div>

            {/* Fire Button */}
            <div
              className={`col-span-6 @md:col-span-6 ${
                !isMyTurn || state.phase !== GamePhase.AIMING
                  ? "opacity-40 pointer-events-none grayscale"
                  : ""
              }`}
            >
              <button
                onClick={() => game.fire()}
                className="w-full h-full min-h-[44px] bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-lg tracking-widest rounded-lg shadow-lg active:scale-95 transition-transform border-t border-red-400 flex items-center justify-center"
              >
                {ts({ en: "FIRE", vi: "BẮN" })}
              </button>
            </div>
          </div>

          {/* Row 2: Angle + Power + Weapon */}
          <div
            className={`grid grid-cols-12 gap-2 @md:gap-4 items-center ${
              !isMyTurn || state.phase !== GamePhase.AIMING
                ? "opacity-40 pointer-events-none grayscale"
                : ""
            }`}
          >
            {/* Angle & Power */}
            <div className="col-span-12 @md:col-span-7 grid grid-cols-2 gap-4">
              {/* Angle */}
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-gray-400">
                  <span>{ts({ en: "ANG", vi: "GÓC" })}</span>
                  <span className="text-blue-400">
                    {Math.round(localAngle ?? currentTank?.angle ?? 0)}°
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={180 - (localAngle ?? currentTank?.angle ?? 0)}
                  onChange={(e) => {
                    const val = 180 - parseInt(e.target.value);
                    setLocalAngle(val);
                  }}
                  onMouseUp={() => {
                    if (localAngle !== null) {
                      game.commitAngle(localAngle);
                      setLocalAngle(null);
                    }
                  }}
                  onTouchEnd={() => {
                    if (localAngle !== null) {
                      game.commitAngle(localAngle);
                      setLocalAngle(null);
                    }
                  }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              {/* Power */}
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-gray-400">
                  <span>{ts({ en: "PWR", vi: "LỰC" })}</span>
                  <span className="text-red-400">
                    {Math.round(localPower ?? currentTank?.power ?? 0)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localPower ?? currentTank?.power ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setLocalPower(val);
                  }}
                  onMouseUp={() => {
                    if (localPower !== null) {
                      game.commitPower(localPower);
                      setLocalPower(null);
                    }
                  }}
                  onTouchEnd={() => {
                    if (localPower !== null) {
                      game.commitPower(localPower);
                      setLocalPower(null);
                    }
                  }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>
            </div>

            {/* Weapon Selection */}
            <div className="col-span-12 @md:col-span-5 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
              {SELECTABLE_WEAPONS.map((w) => (
                <button
                  key={w.type}
                  onClick={() => game.selectWeapon(w.type)}
                  className="flex-1 min-w-[60px] py-1.5 text-[10px] font-bold border rounded transition-all whitespace-nowrap cursor-pointer hover:bg-slate-600"
                  style={{
                    backgroundColor:
                      currentTank?.weapon === w.type ? w.color : undefined,
                    borderColor:
                      currentTank?.weapon === w.type ? w.color : undefined,
                    color: currentTank?.weapon === w.type ? "white" : "#9ca3af",
                  }}
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
