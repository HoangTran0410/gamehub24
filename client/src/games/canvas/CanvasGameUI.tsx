import React, { useRef, useEffect, useState } from "react";
import {
  CanvasGame,
  type CanvasState,
  type DrawStroke,
  type Point,
} from "./CanvasGame";
import { Palette, Trash2 } from "lucide-react";

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
];

export const CanvasGameUI: React.FC<CanvasGameUIProps> = ({
  game,
  currentUserId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<CanvasState>(game.getState());
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLORS[6]); // Start with black
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);

  useEffect(() => {
    const handleStateChange = (newState: CanvasState) => {
      setState(newState);
    };
    game.onUpdate(handleStateChange);
    setState(game.getState());
    game.requestSync();
  }, [game]);

  // Redraw canvas when strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all strokes
    state.strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      ctx.stroke();
    });
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
      ctx.lineWidth = 3;
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

    // Send completed stroke
    const stroke: DrawStroke = {
      id: `${currentUserId}_${Date.now()}`,
      playerId: currentUserId,
      points: currentStroke,
      color: currentColor,
      width: 3,
    };

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
      ctx.lineWidth = 3;
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

    const stroke: DrawStroke = {
      id: `${currentUserId}_${Date.now()}`,
      playerId: currentUserId,
      points: currentStroke,
      color: currentColor,
      width: 3,
    };

    game.draw(stroke);

    setIsDrawing(false);
    setCurrentStroke([]);
  };

  const handleClear = () => {
    if (confirm("Clear the entire canvas?")) {
      game.clear();
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 md:gap-4 p-2 md:p-4 w-full h-full max-w-full md:max-w-2xl mx-auto">
      {/* Color Palette */}
      <div className="flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 bg-slate-800 rounded-lg w-full justify-center">
        <Palette className="w-3 h-3 md:w-4 md:h-4 text-slate-400 hidden md:block" />
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => setCurrentColor(color)}
            className={`w-7 h-7 md:w-8 md:h-8 rounded-full border-2 transition-all ${
              currentColor === color
                ? "border-white scale-110"
                : "border-slate-600 hover:scale-105"
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        <div className="w-px h-6 md:h-8 bg-slate-700 mx-0.5 md:mx-1" />
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
    </div>
  );
};
