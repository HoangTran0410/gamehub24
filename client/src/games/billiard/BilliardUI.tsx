import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Billiard from "./Billiard";
import type { Ball } from "./types";
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BALL_RADIUS,
  POCKET_RADIUS,
  POCKETS,
  BALL_COLORS,
  MIN_POWER,
} from "./types";
import {
  Hand,
  MousePointer2,
  BookOpen,
  X,
  Bot,
  RefreshCcw,
  Play,
  Target,
  RotateCw,
} from "lucide-react";
import { useUserStore } from "../../stores/userStore";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { useAlertStore } from "../../stores/alertStore";
import useGameState from "../../hooks/useGameState";

export default function BilliardUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as Billiard;
  const [state] = useGameState(game);

  const { username: myUsername } = useUserStore();
  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();
  const [showRules, setShowRules] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store balls in a ref for 60fps drawing without React re-renders
  const ballsRef = useRef<Ball[]>(state.balls);

  // Ball trails for moving balls
  const trailsRef = useRef<Map<number, { x: number; y: number }[]>>(new Map());

  // Ripple animation for pocketed balls
  interface RippleEffect {
    x: number;
    y: number;
    color: string;
    startTime: number;
    duration: number;
  }
  const ripplesRef = useRef<RippleEffect[]>([]);
  const prevPocketedRef = useRef<Set<number>>(new Set());

  // Aim state
  const [isAiming, setIsAiming] = useState(false);
  const [aimAngle, setAimAngle] = useState(0);
  const [aimPower, setAimPower] = useState(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Canvas scale for responsive
  const [scale, setScale] = useState(1);
  const [isVertical, setIsVertical] = useState(false);
  const [controlMode, setControlMode] = useState<"drag" | "slider">("drag");
  const [isDraggingAngle, setIsDraggingAngle] = useState(false);

  const isMyTurn = game.isMyTurn();

  // Ref to store drawCanvas function for use in callbacks
  const drawCanvasRef = useRef<() => void>(() => {});

  // Ref to track if we're currently aiming (for document event listeners)
  const isAimingRef = useRef(false);
  isAimingRef.current = isAiming;
  const aimAngleRef = useRef(0);
  aimAngleRef.current = aimAngle;
  const aimPowerRef = useRef(0);
  aimPowerRef.current = aimPower;

  // Handle canvas resize - scale to fit container width
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 16; // padding
        const maxHeight = window.innerHeight * 0.8;
        const maxWidth = window.innerWidth * (isVertical ? 0.6 : 0.8);

        const widthToFit = isVertical ? TABLE_HEIGHT : TABLE_WIDTH;
        const heightToFit = isVertical ? TABLE_WIDTH : TABLE_HEIGHT;

        // Constraint by both container width AND max viewport width (80vw)
        const allowedWidth = Math.min(containerWidth, maxWidth);

        const widthScale = allowedWidth / widthToFit;
        const heightScale = maxHeight / heightToFit;

        // Fit to both width and height constraints
        const newScale = Math.min(1, widthScale, heightScale);
        setScale(newScale);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isVertical]);

  // Store refs for aim state to use in drawCanvas without stale closures
  const aimStateRef = useRef({ isAiming, aimAngle, aimPower, mousePos });
  aimStateRef.current = { isAiming, aimAngle, aimPower, mousePos };
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const isVerticalRef = useRef(isVertical);
  isVerticalRef.current = isVertical;
  const controlModeRef = useRef(controlMode);
  controlModeRef.current = controlMode;
  const isDraggingAngleRef = useRef(isDraggingAngle);
  isDraggingAngleRef.current = isDraggingAngle;

  // Cache refs
  const tableCacheRef = useRef<HTMLCanvasElement | null>(null);
  const ballSpritesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Initialize/Update text cache for balls
  useEffect(() => {
    // Generate ball sprites
    const sprites = new Map<number, HTMLCanvasElement>();

    // Helper to create sprite for a ball
    const createBallSprite = (id: number) => {
      const sprite = document.createElement("canvas");
      // Add padding for shadow/glow if needed, but we draw shadow separately usually
      // We will draw the ball at exactly RADIUS size
      const size = BALL_RADIUS * 2;
      sprite.width = size;
      sprite.height = size;
      const ctx = sprite.getContext("2d");
      if (!ctx) return sprite;

      const center = BALL_RADIUS;
      const color = BALL_COLORS[id] || "#FFF";

      // Ball base
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(center, center, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Stripe pattern
      if (id >= 9 && id <= 15) {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(center, center, BALL_RADIUS * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball number
      if (id !== 0) {
        ctx.fillStyle = id >= 9 && id <= 15 ? "black" : "white";
        ctx.font = `bold ${BALL_RADIUS}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Note: We don't rotate text here because the context rotates for the whole view
        // If we want text to stay upright relative to screen while table rotates,
        // we might need separate sprites for vertical mode or apply rotation here.
        // Current logic: View Transform rotates everything.
        // Original code:
        // if (isVerticalRef.current) { rotate 90 deg }
        // This implies the text tries to stay "upright" relative to the user?
        // Actually, if the whole table rotates -90 deg, then text drawn normally also rotates -90 deg (reads sideways).
        // The original code tried to COUNTER-rotate the text so it stays readable?
        // Original: ctx.rotate(Math.PI / 2); (90 deg clockwise)
        // If View is -90, Text +90 = 0 (Upright).
        // So yes, we need to respect isVertical for text orientation.

        ctx.save();
        ctx.translate(center, center);
        if (isVertical) {
          ctx.rotate(Math.PI / 2);
        }
        ctx.fillText(id.toString(), 0, 0);
        ctx.restore();
      }

      // Highlight shine (static on the ball surface)
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.arc(
        center - BALL_RADIUS * 0.3,
        center - BALL_RADIUS * 0.3,
        BALL_RADIUS * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      return sprite;
    };

    for (let i = 0; i <= 15; i++) {
      sprites.set(i, createBallSprite(i));
    }
    ballSpritesRef.current = sprites;
  }, [isVertical]); // Re-generate sprites if orientation changes (for text rotation)

  // Initialize/Update Table Cache
  useEffect(() => {
    if (!tableCacheRef.current) {
      tableCacheRef.current = document.createElement("canvas");
    }
    const canvas = tableCacheRef.current;
    // The cache stores the table in its LOGICAL dimensions (Height/Width irrelevant of rotation)
    // Actually, drawCanvas rotates the context then draws.
    // So we should cache the 'Logical' table (Horizontal).
    canvas.width = TABLE_WIDTH;
    canvas.height = TABLE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw table
    ctx.fillStyle = "#1a472a";
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Draw table border
    ctx.strokeStyle = "#5d3a1a";
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, TABLE_WIDTH - 20, TABLE_HEIGHT - 20);

    // Draw pockets
    ctx.fillStyle = "#111";
    for (const pocket of POCKETS) {
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []); // Static, never changes

  // Draw a single ball using sprite
  const drawBall = useCallback(
    (ctx: CanvasRenderingContext2D, ball: Ball, highlightColor?: string) => {
      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.arc(ball.x + 2, ball.y + 2, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Highlight Glow (behind ball)
      if (highlightColor) {
        ctx.save();
        // Optimize: Use radial gradient or simple alpha circle instead of shadowBlur
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = highlightColor;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS + 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Sprite
      const sprite = ballSpritesRef.current.get(ball.id);
      if (sprite) {
        ctx.drawImage(sprite, ball.x - BALL_RADIUS, ball.y - BALL_RADIUS);
      }
    },
    [],
  );

  // Draw the entire canvas - can be called at 60fps
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentScale = scaleRef.current;
    const {
      isAiming: aiming,
      aimAngle: angle,
      aimPower: power,
    } = aimStateRef.current;

    // Set canvas size
    const vertical = isVerticalRef.current;
    canvas.width = (vertical ? TABLE_HEIGHT : TABLE_WIDTH) * currentScale;
    canvas.height = (vertical ? TABLE_WIDTH : TABLE_HEIGHT) * currentScale;

    ctx.save();
    ctx.scale(currentScale, currentScale);

    if (vertical) {
      // Rotate 90 degrees counter-clockwise and translate to fit
      // "Shooting Up" view: Cue ball area (Left) at Bottom, Rack (Right) at Top
      ctx.translate(0, TABLE_WIDTH);
      ctx.rotate(-Math.PI / 2);
    }

    // Draw Cached Table
    if (tableCacheRef.current) {
      ctx.drawImage(tableCacheRef.current, 0, 0);
    } else {
      // Fallback if cache missing
      ctx.fillStyle = "#1a472a";
      ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    }

    // Draw movement trails
    trailsRef.current.forEach((trail, ballId) => {
      if (trail.length < 2) return;

      const color = BALL_COLORS[ballId] || "#FFF";

      // Draw ghost balls (afterimages)
      for (let i = 0; i < trail.length; i++) {
        const point = trail[i];

        // Calculate opacity: 0 at tail (oldest), up to 0.4 at head (newest)
        const opacity = (i / trail.length) * 0.4;

        ctx.beginPath();
        ctx.arc(point.x, point.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.fill();

        // Add a highlight reflection to make it look more like a ball
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        // Smaller reflection
        ctx.arc(
          point.x - BALL_RADIUS * 0.3,
          point.y - BALL_RADIUS * 0.3,
          BALL_RADIUS * 0.3,
          0,
          Math.PI * 2,
        );
        ctx.globalAlpha = opacity;
        ctx.fill();
      }

      ctx.globalAlpha = 1.0;
    });

    // Get current game state for highlighting
    const currentState = game.state;
    const mySlot = game.getMySlot();
    const canAct =
      mySlot === currentState.currentTurn &&
      currentState.gamePhase === "playing" &&
      !currentState.isSimulating;

    // Determine target ball type for highlighting
    const myBallType = mySlot ? currentState.players[mySlot].ballType : null;
    const allMyBallsPocketed =
      myBallType &&
      ballsRef.current.filter((b) => !b.pocketed && b.type === myBallType)
        .length === 0;

    // Draw balls from ref (updated at 60fps)
    for (const ball of ballsRef.current) {
      if (ball.pocketed) continue;

      let highlightColor: string | undefined;

      if (canAct) {
        // Highlight cue ball (white) when it's my turn
        if (ball.id === 0) {
          highlightColor = "#00ff88"; // Green glow for cue ball
        }
        // Only highlight target balls AFTER ball type is assigned
        else if (myBallType) {
          // If all my balls are pocketed, highlight the 8-ball
          if (allMyBallsPocketed && ball.id === 8) {
            highlightColor = "#ffcc00"; // Gold glow for 8-ball
          }
          // Otherwise highlight my ball type
          else if (ball.type === myBallType) {
            highlightColor = "#00aaff"; // Blue glow for target balls
          }
        }
        // Before ball type assigned - only cue ball glows (already handled above)
      }

      drawBall(ctx, ball, highlightColor);
    }

    // Draw aim line when aiming
    const cueBallForAim = ballsRef.current.find(
      (b) => b.id === 0 && !b.pocketed,
    );
    // In Slider mode, show aim line even if power is 0 so user can see where they are aiming
    const showAim =
      aiming &&
      cueBallForAim &&
      (power > 0 || controlModeRef.current === "slider");

    if (showAim) {
      // Ray casting for trace line (multi-step)
      let rayX = cueBallForAim.x;
      let rayY = cueBallForAim.y;
      let rayAngle = angle;
      let remainingDistance = 2000; // Max Total trace distance
      const MAX_STEPS = 4;

      ctx.beginPath();
      ctx.moveTo(rayX, rayY);

      for (let step = 0; step < MAX_STEPS; step++) {
        let minDist = remainingDistance;
        let collisionPoint = {
          x: rayX + Math.cos(rayAngle) * minDist,
          y: rayY + Math.sin(rayAngle) * minDist,
        };
        let collisionType: "wall" | "ball" | null = null;
        let targetBall: Ball | null = null;
        let wallNormal = { x: 0, y: 0 }; // For reflection

        const cos = Math.cos(rayAngle);
        const sin = Math.sin(rayAngle);

        // Optimizing Wall Check:
        // Width checks
        if (cos > 0) {
          const d = (TABLE_WIDTH - BALL_RADIUS - rayX) / cos;
          if (d < minDist) {
            minDist = d;
            collisionType = "wall";
            wallNormal = { x: -1, y: 0 };
            collisionPoint = {
              x: TABLE_WIDTH - BALL_RADIUS,
              y: rayY + d * sin,
            };
          }
        } else {
          const d = (BALL_RADIUS - rayX) / cos;
          if (d < minDist) {
            minDist = d;
            collisionType = "wall";
            wallNormal = { x: 1, y: 0 };
            collisionPoint = { x: BALL_RADIUS, y: rayY + d * sin };
          }
        }
        // Height checks
        if (sin > 0) {
          const d = (TABLE_HEIGHT - BALL_RADIUS - rayY) / sin;
          if (d < minDist) {
            minDist = d;
            collisionType = "wall";
            wallNormal = { x: 0, y: -1 };
            collisionPoint = {
              x: rayX + d * cos,
              y: TABLE_HEIGHT - BALL_RADIUS,
            };
          }
        } else {
          const d = (BALL_RADIUS - rayY) / sin;
          if (d < minDist) {
            minDist = d;
            collisionType = "wall";
            wallNormal = { x: 0, y: 1 };
            collisionPoint = { x: rayX + d * cos, y: BALL_RADIUS };
          }
        }

        // Check ball collisions
        // Only check ball collisions if we haven't already hit a wall closer than any possible ball
        // Optimization: Use simple distance check first? No, ray intersection is needed.
        for (const ball of ballsRef.current) {
          if (ball.id === 0 || ball.pocketed) continue;

          // Optimization: Bounding box check before complex math
          if (
            Math.abs(ball.x - rayX) > minDist &&
            Math.abs(ball.y - rayY) > minDist
          )
            continue;

          // Quadratic equation for ray-sphere intersection
          const dx = rayX - ball.x;
          const dy = rayY - ball.y;
          const b = 2 * (cos * dx + sin * dy);
          const c = dx * dx + dy * dy - 4 * BALL_RADIUS * BALL_RADIUS;
          const delta = b * b - 4 * c;

          if (delta >= 0) {
            const t1 = (-b - Math.sqrt(delta)) / 2;
            const t2 = (-b + Math.sqrt(delta)) / 2;
            let t = -1;
            if (t1 > 0.001)
              t = t1; // Use small epsilon to avoid self-collision
            else if (t2 > 0.001) t = t2;

            if (t > 0 && t < minDist) {
              minDist = t;
              collisionPoint = {
                x: rayX + t * cos,
                y: rayY + t * sin,
              };
              collisionType = "ball";
              targetBall = ball;
            }
          }
        }

        // Draw segment
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.lineTo(collisionPoint.x, collisionPoint.y);
        ctx.stroke();

        // Start new path for next segment (so we can stroke each one if needed, but continuous line is okay)
        // Actually, let's keep drawing the continuous line.
        ctx.beginPath();
        ctx.moveTo(collisionPoint.x, collisionPoint.y);

        // Draw Ghost Ball at collision
        ctx.save();
        ctx.beginPath();
        ctx.arc(
          collisionPoint.x,
          collisionPoint.y,
          BALL_RADIUS,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)"; // Fainter ghost
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();
        // Add number to ghost ball to indicate step
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.font = "10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (vertical) {
          ctx.save();
          ctx.translate(collisionPoint.x, collisionPoint.y);
          ctx.rotate(Math.PI / 2);
          ctx.fillText((step + 1).toString(), 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(
            (step + 1).toString(),
            collisionPoint.x,
            collisionPoint.y,
          );
        }
        ctx.restore();

        // Handle collision
        if (collisionType === "ball" && targetBall) {
          // Determine bounce for object ball
          const impactAngle = Math.atan2(
            targetBall.y - collisionPoint.y,
            targetBall.x - collisionPoint.x,
          );

          // Draw line for object ball direction
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(targetBall.x, targetBall.y);
          ctx.lineTo(
            targetBall.x + Math.cos(impactAngle) * 75,
            targetBall.y + Math.sin(impactAngle) * 75,
          );
          ctx.stroke();

          // Stop prediction on ball hit
          break;
        } else if (collisionType === "wall") {
          // Reflect ray with physics restitution (0.7) to match game physics
          const CUSHION_RESTITUTION = 0.7;
          let vx = Math.cos(rayAngle);
          let vy = Math.sin(rayAngle);

          if (wallNormal.x !== 0) {
            // Vertical wall: reflect X and apply energy loss
            vx = -vx * CUSHION_RESTITUTION;
          } else {
            // Horizontal wall: reflect Y and apply energy loss
            vy = -vy * CUSHION_RESTITUTION;
          }

          rayAngle = Math.atan2(vy, vx);

          // Update origin for next step (add a tiny bit to avoid sticking to wall)
          rayX = collisionPoint.x + wallNormal.x * 0.1;
          rayY = collisionPoint.y + wallNormal.y * 0.1;
          remainingDistance -= minDist;
          if (remainingDistance <= 0) break;
        } else {
          // No collision (shouldn't happen given table bounds, but safe break)
          break;
        }
      }

      // Draw cue stick (original logic)
      const stickLength = 200;
      const stickDistance = BALL_RADIUS + 5 + power * 50;
      const stickStartX = cueBallForAim.x - Math.cos(angle) * stickDistance;
      const stickStartY = cueBallForAim.y - Math.sin(angle) * stickDistance;
      const stickEndX = stickStartX - Math.cos(angle) * stickLength;
      const stickEndY = stickStartY - Math.sin(angle) * stickLength;

      ctx.strokeStyle = "#8B4513";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(stickStartX, stickStartY);
      ctx.lineTo(stickEndX, stickEndY);
      ctx.stroke();

      // Cue tip
      ctx.fillStyle = "#E6D5B8";
      ctx.beginPath();
      ctx.arc(stickStartX, stickStartY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw ripple effects for pocketed balls
    const now = performance.now();
    const activeRipples: RippleEffect[] = [];

    for (const ripple of ripplesRef.current) {
      const elapsed = now - ripple.startTime;
      const progress = elapsed / ripple.duration;

      if (progress < 1) {
        activeRipples.push(ripple);

        // Draw multiple concentric ripples
        for (let i = 0; i < 5; i++) {
          const rippleProgress = Math.max(0, progress - i * 0.15);
          if (rippleProgress > 0 && rippleProgress < 1) {
            const radius = POCKET_RADIUS + rippleProgress * 40;
            const alpha = (1 - rippleProgress) * 0.6;

            ctx.strokeStyle = "white";
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 3 - rippleProgress * 2;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // Update ripples ref to only keep active ones
    ripplesRef.current = activeRipples;

    ctx.restore();
  }, [drawBall]);

  // Update ref so callbacks always have the latest draw function
  drawCanvasRef.current = drawCanvas;

  // Animation running state
  const animationRef = useRef<number | null>(null);
  const startAnimationLoop = useCallback(() => {
    if (animationRef.current) return;

    console.log("startAnimationLoop");

    const loop = () => {
      let isAnimating = false;
      const balls = ballsRef.current;

      // 1. Update Trails
      for (const ball of balls) {
        const currentTrail = trailsRef.current.get(ball.id) || [];
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        const isMoving = speed > 0.05 && !ball.pocketed;

        if (isMoving) {
          isAnimating = true;
          currentTrail.push({ x: ball.x, y: ball.y });
          if (currentTrail.length > 20) currentTrail.shift();
          trailsRef.current.set(ball.id, currentTrail);
        } else if (currentTrail.length > 0) {
          // Decay trail
          isAnimating = true; // Still animating decay
          currentTrail.shift();
          if (currentTrail.length === 0) {
            trailsRef.current.delete(ball.id);
          } else {
            trailsRef.current.set(ball.id, currentTrail);
          }
        }
      }

      // 2. Check Ripples
      if (ripplesRef.current.length > 0) {
        isAnimating = true;
      }

      // 3. Check Moving Balls (Redundant with Step 1 logic but good to double check simply)
      if (!isAnimating) {
        const moving = balls.some(
          (b) =>
            !b.pocketed && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05),
        );
        if (moving) isAnimating = true;
      }

      drawCanvasRef.current();

      if (isAnimating) {
        animationRef.current = requestAnimationFrame(loop);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(loop);
  }, []);

  // Initial draw and redraw on state changes (STATIC updates)
  useEffect(() => {
    const frameId = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(frameId);
  }, [drawCanvas, isAiming, aimAngle, aimPower, scale]);

  // Subscribe to game updates
  useEffect(() => {
    const unsub = game.onUpdate((newState) => {
      ballsRef.current = newState.balls;

      if (
        newState.gamePhase === "waiting" ||
        (newState.currentTurn === 1 &&
          newState.gamePhase === "playing" &&
          !newState.lastShot)
      ) {
        trailsRef.current.clear();
      }

      if (newState.isSimulating) {
        if (!state.isSimulating) startAnimationLoop();
      } else {
        // Even if not simulating, draw once to reflect state
        drawCanvasRef.current();
      }
    });

    // Subscribe to frame updates for smooth 60fps physics
    game.onFrame((balls) => {
      let shouldAnimate = false;

      // Detect newly pocketed balls and create ripple effects
      const currentPocketed = new Set(
        balls.filter((b) => b.pocketed).map((b) => b.id),
      );

      for (const ball of balls) {
        if (ball.pocketed && !prevPocketedRef.current.has(ball.id)) {
          // New pocket event -> Start animation
          for (const pocket of POCKETS) {
            const dx = ball.x - pocket.x;
            const dy = ball.y - pocket.y;
            if (dx * dx + dy * dy < (POCKET_RADIUS * 2) ** 2) {
              ripplesRef.current.push({
                x: pocket.x,
                y: pocket.y,
                color: BALL_COLORS[ball.id] || "#FFF",
                startTime: performance.now(),
                duration: 2000,
              });
              shouldAnimate = true;
              break;
            }
          }
        }

        // Check for movement to trigger loop
        if (
          !ball.pocketed &&
          (Math.abs(ball.vx) > 0.01 || Math.abs(ball.vy) > 0.01)
        ) {
          shouldAnimate = true;
        }
      }

      prevPocketedRef.current = currentPocketed;
      ballsRef.current = balls;

      if (shouldAnimate) {
        startAnimationLoop();
      } else if (animationRef.current) {
        // If loop is running, let it decide when to stop (it checks trails/ripples too)
      } else {
        // Physics updated but idle? Just draw once to update positions
        drawCanvasRef.current();
      }
    });

    return () => {
      unsub();
    };
  }, [game, startAnimationLoop]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const rawX = (clientX - rect.left) / scale;
      const rawY = (clientY - rect.top) / scale;

      if (isVertical) {
        // Map visual coordinates back to game coordinates based on the transform:
        // VisualX = GameY
        // VisualY = TABLE_WIDTH - GameX
        // => GameY = VisualX
        // => GameX = TABLE_WIDTH - VisualY
        return {
          x: TABLE_WIDTH - rawY,
          y: rawX,
        };
      }

      return {
        x: rawX,
        y: rawY,
      };
    },
    [scale, isVertical],
  );

  // Calculate aim from coordinates
  const updateAim = useCallback(
    (clientX: number, clientY: number) => {
      const cueBallNow = ballsRef.current.find(
        (b) => b.id === 0 && !b.pocketed,
      );
      if (!cueBallNow) return;

      const coords = getCanvasCoords(clientX, clientY);
      if (!coords) return;

      setMousePos(coords);

      // Check Mode
      if (controlModeRef.current === "slider") {
        // Slider Mode: Angle matches cursor direction (Towards)
        const angle = Math.atan2(
          coords.y - cueBallNow.y,
          coords.x - cueBallNow.x,
        );
        setAimAngle(angle);
        // Power is separate
      } else {
        // Drag Mode: Angle is opposite (Pull back)
        const angle =
          Math.atan2(coords.y - cueBallNow.y, coords.x - cueBallNow.x) +
          Math.PI;
        setAimAngle(angle);

        // Power based on distance
        const dx = coords.x - cueBallNow.x;
        const dy = coords.y - cueBallNow.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const power = Math.min(1, dist / 200);
        setAimPower(power);
      }
    },
    [getCanvasCoords],
  );

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMyTurn || state.isSimulating) return;

    const cueBallNow = ballsRef.current.find((b) => b.id === 0 && !b.pocketed);
    if (!cueBallNow) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const coords = getCanvasCoords(clientX, clientY);
    if (!coords) return;

    // Hit Testing
    // In Slider mode, we can click anywhere on table to set aim
    // In Drag mode, must click near ball
    let shouldStart = false;

    if (controlMode === "slider") {
      shouldStart = true;
    } else {
      const dx = coords.x - cueBallNow.x;
      const dy = coords.y - cueBallNow.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < BALL_RADIUS * 5) {
        shouldStart = true;
      }
    }

    if (shouldStart) {
      e.preventDefault();
      setIsAiming(true);
      if (controlMode === "slider") setIsDraggingAngle(true);
      updateAim(clientX, clientY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isAiming) return;

    // In Slider mode, only update if dragging angle
    if (controlMode === "slider" && !isDraggingAngle) return;

    e.preventDefault();

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    updateAim(clientX, clientY);
  };

  const handleShoot = useCallback(() => {
    // Only auto-shoot on release if in Drag mode
    if (controlModeRef.current === "drag") {
      if (aimPowerRef.current >= MIN_POWER) {
        trailsRef.current.clear();
        game.shoot(aimAngleRef.current, aimPowerRef.current);
        setIsAiming(false);
        setAimPower(0);
        setMousePos(null);
      } else {
        // Cancel shot if power too low
        setIsAiming(false);
        setMousePos(null);
      }
    } else {
      // Slider mode: Release just stops dragging angle
      setIsDraggingAngle(false);
    }
  }, [game]);

  const handleSliderShoot = () => {
    if (aimPower >= MIN_POWER) {
      trailsRef.current.clear();
      game.shoot(aimAngle, aimPower);
      // Reset aiming state
      setIsAiming(false);
      // Keep power as is? Or reset? Usually reset for next shot
      setAimPower(0);
      setMousePos(null);
    }
  };

  // Document-level event listeners for mouse/touch up (works even outside canvas)
  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isAimingRef.current) return;
      if (controlModeRef.current === "slider" && !isDraggingAngleRef.current)
        return;
      updateAim(e.clientX, e.clientY);
    };

    const handleDocumentMouseUp = () => {
      if (!isAimingRef.current) return;
      handleShoot();
    };

    const handleDocumentTouchMove = (e: TouchEvent) => {
      if (!isAimingRef.current) return;
      if (e.touches.length > 0) {
        if (!isAimingRef.current) return;
        if (controlModeRef.current === "slider" && !isDraggingAngleRef.current)
          return;
        updateAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleDocumentTouchEnd = () => {
      if (!isAimingRef.current) return;
      handleShoot();
    };

    document.addEventListener("mousemove", handleDocumentMouseMove, {
      passive: false,
    });
    document.addEventListener("mouseup", handleDocumentMouseUp);
    document.addEventListener("touchmove", handleDocumentTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", handleDocumentTouchEnd);

    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
      document.removeEventListener("touchmove", handleDocumentTouchMove);
      document.removeEventListener("touchend", handleDocumentTouchEnd);
    };
  }, [updateAim, handleShoot]);

  // Handle native touch events to allow scrolling when not aiming
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      // Check turn and state
      if (!game.isMyTurn() || game.state.isSimulating) return;

      const cueBallNow = ballsRef.current.find(
        (b) => b.id === 0 && !b.pocketed,
      );
      if (!cueBallNow) return;

      if (e.touches.length === 0) return;
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;

      // Calculate coords manually to avoid stale state in closure if not using current refs
      // But we can use the refs we set up: scaleRef, isVerticalRef
      const rect = canvas.getBoundingClientRect();
      const currentScale = scaleRef.current;
      const vertical = isVerticalRef.current;
      const mode = controlModeRef.current;

      const rawX = (clientX - rect.left) / currentScale;
      const rawY = (clientY - rect.top) / currentScale;

      let x = rawX;
      let y = rawY;

      if (vertical) {
        x = TABLE_WIDTH - rawY;
        y = rawX;
      }

      let shouldCapture = false;

      if (mode === "slider") {
        // Capture all touches on canvas for Slider aiming
        shouldCapture = true;
      } else {
        // Drag mode: Only near ball
        const dx = x - cueBallNow.x;
        const dy = y - cueBallNow.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BALL_RADIUS * 3) {
          shouldCapture = true;
        }
      }

      if (shouldCapture) {
        e.preventDefault(); // STOP SCROLLING
        setIsAiming(true);
        if (mode === "slider") setIsDraggingAngle(true);
        setMousePos({ x, y });
        // Trigger initial update
        updateAim(clientX, clientY);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isAimingRef.current) return;
      if (controlModeRef.current === "slider" && !isDraggingAngleRef.current)
        return;

      e.preventDefault(); // STOP SCROLLING while aiming
    };

    // Passive: false is CRITICAL to allow preventDefault()
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [game, updateAim]);

  const getPlayerName = (slot: 1 | 2): string => {
    const player = state.players[slot];
    if (!player.id)
      return ti({ en: "(waiting...)", vi: "(đang chờ...)" }) as string;
    if (player.id === "BOT") return "Bot 🤖";
    if (player.id === game["userId"])
      return myUsername || (ti({ en: "You", vi: "Bạn" }) as string);
    return (
      player.username ||
      (ti({ en: "Player", vi: "Người chơi" }) as string) + " " + slot
    );
  };

  const getBallTypeLabel = (slot: 1 | 2): string => {
    const ballType = state.players[slot].ballType;
    if (!ballType) return "";
    return ballType === "solid"
      ? (ti({ en: "(Solids 1-7)", vi: "(Trơn 1-7)" }) as string)
      : (ti({ en: "(Stripes 9-15)", vi: "(Sọc 9-15)" }) as string);
  };

  const renderGameRules = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 flex items-center justify-center p-4 text-left">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
        <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-yellow-500" />
            {ti({
              en: "Game Rules: Billiard (8-Ball)",
              vi: "Luật Chơi: Bi-a (8 Bóng)",
            })}
          </h2>
          <button
            onClick={() => setShowRules(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6 text-slate-300 leading-relaxed font-sans text-sm md:text-base">
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-2">
              {ti({ en: "Objective", vi: "Mục tiêu" })}
            </h3>
            <p>
              {ti({
                en: "Pocket all of your assigned balls (Solids or Stripes) and then pocket the 8-Ball to win.",
                vi: "Đưa tất cả các bi mục tiêu của bạn (bi Trơn hoặc bi Sọc) vào lỗ và cuối cùng là bi số 8 để chiến thắng.",
              })}
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-2">
              {ti({ en: "Key Rules", vi: "Quy Tắc Chính" })}
            </h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                {ti({
                  en: "First ball pocketed determines your group (Solids 1-7 or Stripes 9-15).",
                  vi: "Bi đầu tiên vào lỗ sẽ quyết định nhóm bi của bạn (Trơn 1-7 hoặc Sọc 9-15).",
                })}
              </li>
              <li>
                {ti({
                  en: "You must hit your own ball group first.",
                  vi: "Ban phải chạm vào bi thuộc nhóm của mình trước.",
                })}
              </li>
              <li>
                {ti({
                  en: "Pocketing the wrong ball or scratching (white ball in pocket) is a foul.",
                  vi: "Đưa nhầm bi vào lỗ hoặc làm rơi bi trắng là phạm lỗi.",
                })}
              </li>
              <li>
                <strong className="text-red-400">
                  {ti({
                    en: "Do NOT pocket the 8-Ball early!",
                    vi: "KHÔNG được làm rơi bi số 8 sớm!",
                  })}
                </strong>{" "}
                {ti({
                  en: "You lose instantly if the 8-Ball enters a pocket before your other balls are cleared.",
                  vi: "Bạn sẽ thua ngay lập tức nếu bi số 8 vào lỗ trước khi bạn dọn sạch các bi khác.",
                })}
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-2">
              {ti({ en: "Controls", vi: "Điều Khiển" })}
            </h3>
            <div className="space-y-2">
              <div>
                <strong className="text-blue-400">
                  {ti({
                    en: "Drag Mode (Default):",
                    vi: "Chế độ Kéo (Mặc định):",
                  })}
                </strong>
                <p className="ml-2 text-slate-400 text-sm">
                  {ti({
                    en: "Click/Touch near the cue ball and pull back to aim and set power. Release to shoot.",
                    vi: "Nhấp/Chạm gần bi trắng và kéo về phía sau để ngắm và chỉnh lực. Thả tay để bắn.",
                  })}
                </p>
              </div>
              <div>
                <strong className="text-blue-400">
                  {ti({ en: "Slider Mode:", vi: "Chế độ Thanh lực:" })}
                </strong>
                <p className="ml-2 text-slate-400 text-sm">
                  {ti({
                    en: "Click anywhere to place aim stick. Use the slider below to set power, then press SHOOT.",
                    vi: "Nhấp bất kỳ đâu để đặt gậy ngắm. Dùng thanh trượt bên dưới để chỉnh lực, sau đó bấm nút BẮN.",
                  })}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col items-center gap-4 p-4 w-full max-w-4xl mx-auto pb-12!"
      ref={containerRef}
    >
      {/* Player List */}
      <div className="flex flex-col gap-2 p-4 bg-slate-800 rounded-lg w-full max-w-[500px]">
        <h3 className="text-sm font-medium text-gray-400 mb-1">Players</h3>
        {([1, 2] as const).map((slot) => {
          const player = state.players[slot];
          const isCurrentTurn =
            state.currentTurn === slot && state.gamePhase === "playing";
          const isMe = player.id === game["userId"];
          const isBot = player.id === "BOT";

          return (
            <div
              key={slot}
              className={`
                flex items-center justify-between p-3 rounded-lg
                ${
                  isCurrentTurn
                    ? "bg-slate-600 ring-2 ring-blue-400"
                    : "bg-slate-700"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full ${
                    slot === 1 ? "bg-blue-500" : "bg-red-500"
                  }`}
                />
                <div>
                  <span className="text-white font-medium">
                    {getPlayerName(slot)}
                    {isMe && player.id && ti({ en: " (You)", vi: " (Bạn)" })}
                  </span>
                  <span className="text-gray-400 text-sm ml-2">
                    {getBallTypeLabel(slot)}
                  </span>
                </div>
              </div>
              {isBot && game.isHost && state.gamePhase === "waiting" && (
                <button
                  onClick={() => game.removeBot()}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                >
                  {ti({ en: "Remove", vi: "Xóa" })}
                </button>
              )}
              {!player.id &&
                game.isHost &&
                slot === 2 &&
                state.gamePhase === "waiting" && (
                  <button
                    onClick={() => game.addBot()}
                    className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1"
                  >
                    <Bot className="w-3 h-3" />{" "}
                    {ti({ en: "Add Bot", vi: "Thêm Bot" })}
                  </button>
                )}
            </div>
          );
        })}
      </div>

      {/* Game Controls */}
      <div className="flex gap-4">
        {/* Rotation Toggle */}
        <button
          className="flex items-center justify-center p-3 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
          onClick={() => setIsVertical(!isVertical)}
        >
          <RotateCw className="w-5 h-5 text-white" />
          <span className="text-white text-sm ml-2">
            {ti({ en: "Rotate table", vi: "Xoay bàn" })}
          </span>
        </button>

        {/* Control Mode Toggle */}
        <button
          className="flex items-center justify-center p-3 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
          onClick={() =>
            setControlMode(controlMode === "drag" ? "slider" : "drag")
          }
          title={
            ti({
              en: "Switch Control Mode",
              vi: "Đổi kiểu hiện khiển",
            }) as string
          }
        >
          {controlMode === "drag" ? (
            <Hand className="w-5 h-5 text-white" />
          ) : (
            <MousePointer2 className="w-5 h-5 text-white" />
          )}
          <span className="text-white text-sm ml-2">
            {controlMode === "drag"
              ? ti({ en: "Drag Mode", vi: "Kéo thả" })
              : ti({ en: "Slider Mode", vi: "Thanh lực" })}
          </span>
        </button>
      </div>

      {/* Turn Indicator */}
      {state.gamePhase === "playing" && !state.winner && (
        <div className="text-lg text-gray-400">
          {state.isSimulating ? (
            <span className="text-yellow-400">
              {ti({ en: "Balls in motion...", vi: "Bóng đang lăn..." })}
            </span>
          ) : isMyTurn ? (
            <span className="text-green-400 flex items-center gap-2">
              <Target className="w-5 h-5" />
              {controlMode === "drag"
                ? ti({
                    en: "Your turn! Click near the cue ball and drag to aim.",
                    vi: "Lượt của bạn! Nhấp vào bóng trắng và kéo để ngắm.",
                  })
                : ti({
                    en: "Your turn! Click to aim, set power, then Shoot.",
                    vi: "Lượt của bạn! Chọn hướng, chỉnh lực, rồi bấm BẮN.",
                  })}
            </span>
          ) : (
            <span>
              {ti({ en: "Waiting for opponent...", vi: "Đang chờ đối thủ..." })}
            </span>
          )}
        </div>
      )}

      {/* Foul/Turn Message */}
      {state.turnMessage && (
        <div className="text-yellow-400 text-sm">{state.turnMessage}</div>
      )}

      {/* Billiard Table Canvas */}
      <div className="relative bg-slate-800 p-2 rounded-xl shadow-2xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={TABLE_WIDTH * scale}
          height={TABLE_HEIGHT * scale}
          className="rounded-lg cursor-crosshair block"
          style={{ touchAction: "none" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
        />

        {/* Unified Overlay: Waiting or Winner */}
        {(state.winner || state.gamePhase === "waiting") && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] rounded-lg animate-fade-in">
            {/* WINNER STATE */}
            {state.winner && (
              <>
                <div className="text-3xl font-bold text-green-400 mb-6 drop-shadow-lg animate-bounce">
                  🏆 {getPlayerName(state.winner)}{" "}
                  {ti({ en: "wins!", vi: "thắng!" })}
                </div>
                {game.isHost ? (
                  <button
                    onClick={() => game.requestReset()}
                    className="px-8 py-4 bg-green-600 hover:bg-green-500 rounded-full text-white font-bold text-lg transition-transform hover:scale-105 flex items-center gap-2 shadow-lg"
                  >
                    <RefreshCcw className="w-6 h-6" />
                    {ti({ en: "Play Again", vi: "Chơi lại" })}
                  </button>
                ) : (
                  <div className="text-slate-300 animate-pulse">
                    {ti({
                      en: "Waiting for host to restart...",
                      vi: "Đang chờ chủ phòng chơi lại...",
                    })}
                  </div>
                )}
              </>
            )}

            {/* WAITING STATE */}
            {!state.winner && state.gamePhase === "waiting" && (
              <>
                {game.isHost ? (
                  game.canStartGame() ? (
                    <button
                      onClick={() => game.startGame()}
                      className="px-8 py-4 bg-green-600 hover:bg-green-500 rounded-full text-white font-bold text-lg transition-transform hover:scale-105 flex items-center gap-2 shadow-lg"
                    >
                      <Play className="w-6 h-6" />
                      {ti({ en: "Start Game", vi: "Bắt đầu" })}
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-lg text-slate-300 font-medium">
                        {ti({
                          en: "Waiting for opponent...",
                          vi: "Đang chờ đối thủ...",
                        })}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-slate-500 border-t-white rounded-full animate-spin" />
                    <div className="text-lg text-slate-300 font-medium">
                      {ti({
                        en: "Waiting for host to start...",
                        vi: "Đang chờ chủ phòng bắt đầu...",
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Power Controls (Dynamic based on Mode) */}
      {isAiming && controlMode === "drag" && (
        <div className="w-full max-w-xs">
          <div className="text-sm text-gray-400 mb-1">
            {ti({ en: "Power", vi: "Lực" })}: {Math.round(aimPower * 100)}%
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-75"
              style={{
                width: `${aimPower * 100}%`,
                background: `linear-gradient(90deg, #22c55e, #eab308, #ef4444)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Slider Mode Controls */}
      {controlMode === "slider" && (
        // state.gamePhase === "playing" &&
        // !state.isSimulating &&
        // !state.winner &&
        <div className="flex flex-col gap-3 w-full max-w-md p-4 bg-slate-800/80 rounded-xl backdrop-blur-sm border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">
              {ti({ en: "Power", vi: "Lực bắn" })}
            </span>
            <span
              className={`font-bold ${aimPower > 0.8 ? "text-red-500" : aimPower > 0.5 ? "text-yellow-500" : "text-green-500"}`}
            >
              {Math.round(aimPower * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={aimPower}
            disabled={!isMyTurn || state.isSimulating}
            onChange={(e) => {
              setAimPower(parseFloat(e.target.value));
              // If we change power, ensuring we enter aiming mode if not already
              if (!isAiming) setIsAiming(true);
            }}
            className="w-full h-4 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />

          <button
            onClick={handleSliderShoot}
            disabled={aimPower < MIN_POWER || !isMyTurn || state.isSimulating}
            className={`
                    w-full py-3 rounded-lg font-bold text-lg shadow-lg transition-all
                    disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed
                    bg-red-600 hover:bg-red-500 text-white hover:scale-[1.02] active:scale-[0.98]
                `}
          >
            {ti({ en: "SHOOT!", vi: "BẮN!" })}
          </button>
        </div>
      )}

      {/* new game button */}
      {game.isHost && state.gamePhase !== "waiting" && (
        <button
          onClick={async () => {
            if (
              await showConfirm(
                ts({
                  en: "Are you sure you want to reset the game?",
                  vi: "Bạn có chắc chắn muốn chơi lại không?",
                }),
                ts({
                  en: "Reset game",
                  vi: "Chơi lại",
                }),
              )
            )
              game.requestReset();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-full "
        >
          <RefreshCcw className="w-4 h-4" />
          {ti({ en: "New game", vi: "Chơi lại" })}
        </button>
      )}

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-yellow-500 transition-colors z-40 shadow-lg border border-slate-500"
        title={ts({ en: "Game Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={24} />
      </button>
      {showRules && createPortal(renderGameRules(), document.body)}
    </div>
  );
}
