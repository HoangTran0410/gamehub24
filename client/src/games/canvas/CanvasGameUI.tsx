import React, { useRef, useEffect, useState } from "react";
import CanvasGame, {
  type CanvasState,
  type DrawStroke,
  type Point,
} from "./CanvasGame";
import { Palette, Trash2, Undo2 } from "lucide-react";
import { useAlertStore } from "../../stores/alertStore";

interface CanvasGameUIProps {
  game: CanvasGame;
  currentUserId: string;
}

const COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // purple
  "#ec4899", // pink
  "#000000", // black
  // "#ffffff", // white (eraser-like)
];

const STROKE_SIZES = [
  { label: "S", value: 3 },
  { label: "M", value: 7 },
  { label: "L", value: 15 },
];

export default function CanvasGameUI({
  game,
  currentUserId,
}: CanvasGameUIProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<CanvasState>(game.getState());
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLORS[6]); // Start with black
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState(5); // Medium
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [showColorModal, setShowColorModal] = useState(false);

  const { confirm: showConfirm } = useAlertStore();

  // Track strokes we've already drawn (for animation detection)
  const drawnStrokeIdsRef = useRef<Set<string>>(new Set());
  // Track strokes that have been animated (prevent re-animation)
  const animatedStrokeIdsRef = useRef<Set<string>>(new Set());
  // Animation queue for other users' strokes
  const animationQueueRef = useRef<DrawStroke[]>([]);
  const isAnimatingRef = useRef(false);
  // Keep latest state in ref for animation access
  const stateRef = useRef<CanvasState>(state);
  // Track when user starts drawing (for duration calculation)
  const strokeStartTimeRef = useRef<number>(0);
  // Track if initial sync has happened (skip animation for pre-existing strokes)
  const hasInitializedRef = useRef(false);

  // Update stateRef whenever state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Redraw canvas with optional partial stroke for animation
  const redrawCanvas = (
    animatingStrokeId?: string,
    animatingPointCount?: number
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Use stateRef to get latest strokes
    stateRef.current.strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      // Determine how many points to draw
      let pointsToDraw = stroke.points.length;
      if (
        stroke.id === animatingStrokeId &&
        animatingPointCount !== undefined
      ) {
        pointsToDraw = Math.max(2, animatingPointCount);
      }

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < pointsToDraw; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      ctx.stroke();
    });
  };

  // Animate a single stroke
  const animateStroke = (stroke: DrawStroke): Promise<void> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas || stroke.points.length < 2) {
        resolve();
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve();
        return;
      }

      // Use stroke's actual duration (minimum 200ms for very fast strokes)
      const duration = Math.max(stroke.duration || 500, 200);
      const pointCount = stroke.points.length;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const pointsToShow = Math.floor(progress * pointCount);

        // Redraw all completed strokes + partial current stroke
        redrawCanvas(stroke.id, pointsToShow);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  };

  // Process animation queue one by one
  const processAnimationQueue = async () => {
    if (isAnimatingRef.current) return;
    if (animationQueueRef.current.length === 0) return;

    isAnimatingRef.current = true;

    while (animationQueueRef.current.length > 0) {
      const stroke = animationQueueRef.current.shift()!;
      // Skip if already animated
      if (animatedStrokeIdsRef.current.has(stroke.id)) continue;
      animatedStrokeIdsRef.current.add(stroke.id);
      await animateStroke(stroke);
    }

    isAnimatingRef.current = false;
    // Final redraw to ensure all strokes are complete
    redrawCanvas();
  };

  useEffect(() => {
    // Set a grace period for initial sync - any strokes received in first 500ms are considered pre-existing
    const initTimeout = setTimeout(() => {
      hasInitializedRef.current = true;
    }, 500);

    const handleStateChange = (newState: CanvasState) => {
      // During initial sync period, mark all strokes as already drawn (no animation)
      if (!hasInitializedRef.current) {
        newState.strokes.forEach((s) => {
          drawnStrokeIdsRef.current.add(s.id);
          animatedStrokeIdsRef.current.add(s.id);
        });
        setState(newState);
        return;
      }

      // Detect new strokes from other users
      const newStrokes = newState.strokes.filter(
        (s) =>
          !drawnStrokeIdsRef.current.has(s.id) && s.playerId !== currentUserId
      );

      // Queue new strokes for animation
      newStrokes.forEach((stroke) => {
        animationQueueRef.current.push(stroke);
        drawnStrokeIdsRef.current.add(stroke.id);
      });

      // Mark own strokes as drawn (no animation needed)
      newState.strokes.forEach((s) => {
        if (s.playerId === currentUserId) {
          drawnStrokeIdsRef.current.add(s.id);
        }
      });

      setState(newState);

      // Trigger animation processing after state is set
      setTimeout(() => processAnimationQueue(), 0);
    };
    game.onUpdate(handleStateChange);
    setState(game.getState());
    game.requestSync();

    return () => clearTimeout(initTimeout);
  }, [game, currentUserId]);

  // Redraw canvas when strokes change (for own strokes)
  useEffect(() => {
    if (!isAnimatingRef.current) {
      redrawCanvas();
    }
  }, [state.strokes]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: x * scaleX,
      y: y * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    strokeStartTimeRef.current = performance.now();
    const point = getCanvasPoint(e);
    setCurrentStroke([point]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const point = getCanvasPoint(e);
    setCurrentStroke((prev) => [...prev, point]);

    // Draw current stroke in real-time (preview)
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    if (currentStroke.length > 0) {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentStrokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(
        currentStroke[currentStroke.length - 1].x,
        currentStroke[currentStroke.length - 1].y
      );
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || currentStroke.length < 2) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    // Calculate stroke duration
    const duration = performance.now() - strokeStartTimeRef.current;

    // Send completed stroke
    const stroke: DrawStroke = {
      id: `${currentUserId}_${Date.now()}`,
      playerId: currentUserId,
      points: currentStroke,
      color: currentColor,
      width: currentStrokeWidth,
      duration,
    };

    // Mark our own stroke as animated (no animation needed)
    animatedStrokeIdsRef.current.add(stroke.id);

    game.draw(stroke);

    setIsDrawing(false);
    setCurrentStroke([]);
  };

  // Touch event handlers for mobile
  const getTouchPoint = (e: React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];

    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: x * scaleX,
      y: y * scaleY,
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    strokeStartTimeRef.current = performance.now();
    const point = getTouchPoint(e);
    setCurrentStroke([point]);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const point = getTouchPoint(e);
    setCurrentStroke((prev) => [...prev, point]);

    // Draw current stroke in real-time (preview)
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    if (currentStroke.length > 0) {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentStrokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(
        currentStroke[currentStroke.length - 1].x,
        currentStroke[currentStroke.length - 1].y
      );
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  };

  const handleTouchEnd = () => {
    if (!isDrawing || currentStroke.length < 2) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    // Calculate stroke duration
    const duration = performance.now() - strokeStartTimeRef.current;

    const stroke: DrawStroke = {
      id: `${currentUserId}_${Date.now()}`,
      playerId: currentUserId,
      points: currentStroke,
      color: currentColor,
      width: currentStrokeWidth,
      duration,
    };

    // Mark our own stroke as animated (no animation needed)
    animatedStrokeIdsRef.current.add(stroke.id);

    game.draw(stroke);

    setIsDrawing(false);
    setCurrentStroke([]);
  };

  const handleClear = async () => {
    if (await showConfirm("Clear canvas for everyone", "Clear canvas?")) {
      game.clear();
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 md:gap-4 p-2 md:p-4 w-full h-full max-w-full md:max-w-2xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 bg-slate-800 rounded-lg w-full justify-center">
        {/* Mobile: Color picker button */}
        <button
          onClick={() => setShowColorModal(true)}
          className="md:hidden w-8 h-8 rounded-full border-2 border-white"
          style={{ backgroundColor: currentColor }}
          title="Pick color"
        />
        {/* Desktop: Inline color palette */}
        <Palette className="w-4 h-4 text-slate-400 hidden md:block" />
        <div className="hidden md:flex items-center gap-1.5">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setCurrentColor(color)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                currentColor === color
                  ? "border-white scale-110"
                  : "border-slate-600 hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
        <div className="w-px h-6 md:h-8 bg-slate-700 mx-0.5 md:mx-1" />
        {/* Stroke Size Selector */}
        {STROKE_SIZES.map((size) => (
          <button
            key={size.value}
            onClick={() => setCurrentStrokeWidth(size.value)}
            className={`w-7 h-7 md:w-8 md:h-8 rounded-lg border-2 transition-all flex items-center justify-center text-xs font-bold ${
              currentStrokeWidth === size.value
                ? "border-white bg-slate-600 text-white"
                : "border-slate-600 bg-slate-700 text-slate-400 hover:border-slate-500"
            }`}
            title={`Stroke size: ${size.label}`}
          >
            {size.label}
          </button>
        ))}
        <div className="w-px h-6 md:h-8 bg-slate-700 mx-0.5 md:mx-1" />
        <button
          onClick={() => game.undo()}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-yellow-400"
          title="Undo last stroke"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleClear}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-red-400"
          title="Clear canvas"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={800} // Increased base resolution for better quality
        height={600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full flex-1 md:flex-none border-2 border-slate-700 rounded-lg bg-white cursor-crosshair touch-none shadow-lg"
        style={{ aspectRatio: "4/3", minHeight: "200px" }} // Changed Aspect Ratio to 4:3
      />

      {/* Stats */}
      <div className="text-xs text-slate-500">
        {state.strokes.length} strokes
      </div>

      {/* Color Picker Modal (Mobile) */}
      {showColorModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowColorModal(false)}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-slate-300 mb-3 text-center">
              Pick a color
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setCurrentColor(color);
                    setShowColorModal(false);
                  }}
                  className={`w-12 h-12 rounded-full border-3 transition-all ${
                    currentColor === color
                      ? "border-white scale-110 ring-2 ring-white/50"
                      : "border-slate-600"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
