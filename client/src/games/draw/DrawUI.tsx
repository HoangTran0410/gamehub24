import React, { useRef, useEffect, useState } from "react";
import CanvasGame, {
  type CanvasState,
  type DrawStroke,
  type Point,
} from "./Draw";
import { WORD_LIST, type Difficulty } from "./words";
import {
  Trash2,
  Undo2,
  Send,
  Trophy,
  Clock,
  Gamepad2,
  Pencil,
  Pause,
  Play,
  Shuffle,
  Languages,
  Lightbulb,
  BookOpen,
  X,
} from "lucide-react";
import { useAlertStore } from "../../stores/alertStore";
import useLanguage from "../../stores/languageStore";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";
import useGameState from "../../hooks/useGameState";

const COLORS = [
  "#f5f5f5", // trắng
  "#6b7280", // xám
  "#ef4444", // đỏ
  "#f97316", // cam
  "#facc15", // vàng
  "#22c55e", // xanh lá
  "#3b82f6", // xanh dương
  "#a855f7", // tím
  "#ec4899", // hồng
  "#92400e", // nâu
  "#06b6d4", // cyan
];

const STROKE_SIZES = [
  { label: "S", value: 3 },
  { label: "M", value: 7 },
  { label: "L", value: 15 },
];

export default function CanvasGameUI({
  game: baseGame,
  currentUserId,
}: GameUIProps) {
  const game = baseGame as CanvasGame;
  const [state] = useGameState(game);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLORS[6]); // Start with black
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState(5); // Medium
  const [currentStroke, setCurrentStroke] = useState<number[]>([]);
  const [showColorModal, setShowColorModal] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showRules, setShowRules] = useState(false);

  const { show: showAlert, confirm: showConfirm } = useAlertStore();
  const { ti, ts } = useLanguage();

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

  // Derived state
  const isGarticMode = state.mode === "GARTIC";
  const isDrawer = isGarticMode && state.gartic?.drawerId === currentUserId;
  const drawer = isGarticMode
    ? game.players.find((p) => p.id === state.gartic?.drawerId)
    : null;
  const isHost = game.isHost;
  const isPaused = state.gartic?.isPaused;

  const canDraw =
    !isGarticMode ||
    (isDrawer && state.gartic?.status === "DRAWING" && !isPaused);

  // Hints logic
  const myHints = state.gartic?.playerHints?.[currentUserId ?? ""] || [];
  const displayWord = React.useMemo(() => {
    if (!state.gartic?.word) return "";
    if (state.gartic.status === "ROUND_END" || isDrawer)
      return state.gartic.word;

    return state.gartic.word
      .split("")
      .map((char, i) => {
        if (char === " ") return " ";
        // Show if revealed by hint OR if user has guessed correctly
        if (myHints.includes(i) || state.guesses.includes(currentUserId ?? ""))
          return char;
        return "_";
      })
      .join(" ");
  }, [
    state.gartic?.word,
    state.gartic?.status,
    state.gartic?.playerHints,
    state.guesses,
    isDrawer,
    currentUserId,
    myHints,
  ]);

  // Update stateRef whenever state changes
  useEffect(() => {
    stateRef.current = state;
    // Auto scroll chat
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [state]);

  // Redraw canvas with optional partial stroke for animation
  const redrawCanvas = (
    animatingStrokeId?: string,
    animatingPointCount?: number,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // fill rect with soft white
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Use stateRef to get latest strokes
    stateRef.current.strokes.forEach((stroke) => {
      if (stroke.points.length < 4) return; // Need at least 2 points (4 numbers)

      // Determine how many points to draw
      let numsToDraw = stroke.points.length;
      if (
        stroke.id === animatingStrokeId &&
        animatingPointCount !== undefined
      ) {
        // animatingPointCount is the number of points (pairs of numbers)
        numsToDraw = Math.max(4, animatingPointCount * 2);
      }

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(stroke.points[0], stroke.points[1]);

      for (let i = 2; i < numsToDraw; i += 2) {
        ctx.lineTo(stroke.points[i], stroke.points[i + 1]);
      }

      ctx.stroke();
    });
  };

  // Animate a single stroke
  const animateStroke = (stroke: DrawStroke): Promise<void> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas || stroke.points.length < 4) {
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
      const pointCount = stroke.points.length / 2;
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
    // Set a grace period for initial sync
    const initTimeout = setTimeout(() => {
      hasInitializedRef.current = true;
    }, 500);

    const unsub = game.onUpdate((newState: CanvasState) => {
      // During initial sync period, mark all strokes as already drawn
      if (!hasInitializedRef.current) {
        newState.strokes.forEach((s) => {
          drawnStrokeIdsRef.current.add(s.id);
          animatedStrokeIdsRef.current.add(s.id);
        });
        return;
      }

      // Detect new strokes from other users
      const newStrokes = newState.strokes.filter(
        (s) =>
          !drawnStrokeIdsRef.current.has(s.id) && s.playerId !== currentUserId,
      );

      // Queue new strokes for animation
      newStrokes.forEach((stroke) => {
        animationQueueRef.current.push(stroke);
        drawnStrokeIdsRef.current.add(stroke.id);
      });

      // Mark own strokes as drawn
      newState.strokes.forEach((s) => {
        if (s.playerId === currentUserId) {
          drawnStrokeIdsRef.current.add(s.id);
        }
      });

      // Trigger animation processing
      setTimeout(() => processAnimationQueue(), 0);
    });

    return () => {
      unsub();
      clearTimeout(initTimeout);
    };
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
      x: Math.floor(x * scaleX),
      y: Math.floor(y * scaleY),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    setIsDrawing(true);
    strokeStartTimeRef.current = performance.now();
    const point = getCanvasPoint(e);
    setCurrentStroke([point.x, point.y]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canDraw) return;

    const point = getCanvasPoint(e);
    setCurrentStroke((prev) => [...prev, point.x, point.y]);

    // Draw current stroke in real-time
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    if (currentStroke.length >= 2) {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentStrokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(
        currentStroke[currentStroke.length - 2],
        currentStroke[currentStroke.length - 1],
      );
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || currentStroke.length < 4) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    const duration = performance.now() - strokeStartTimeRef.current;

    const stroke: DrawStroke = {
      id: `${currentUserId ?? ""}_${Date.now()}`,
      playerId: currentUserId ?? "",
      points: currentStroke,
      color: currentColor,
      width: currentStrokeWidth,
      duration,
    };

    animatedStrokeIdsRef.current.add(stroke.id);
    game.draw(stroke);

    setIsDrawing(false);
    setCurrentStroke([]);
  };

  // Touch handlers (Condensed for brevity, same logic as mouse)
  const getTouchPoint = (e: React.TouchEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: x * scaleX, y: y * scaleY };
  };
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    setIsDrawing(true);
    strokeStartTimeRef.current = performance.now();
    const point = getTouchPoint(e);
    setCurrentStroke([point.x, point.y]);
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canDraw) return;
    const point = getTouchPoint(e);
    setCurrentStroke((prev) => [...prev, point.x, point.y]);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    if (currentStroke.length >= 2) {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentStrokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(
        currentStroke[currentStroke.length - 2],
        currentStroke[currentStroke.length - 1],
      );
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  };
  const handleTouchEnd = () => handleMouseUp();

  const handleClear = async () => {
    if (!canDraw) return;
    if (
      await showConfirm(
        ts({ en: "Clear canvas for everyone", vi: "Xóa canvas cho tất cả" }),
        ts({ en: "Clear canvas?", vi: "Xóa canvas?" }),
      )
    ) {
      game.clear();
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    // If Gartic mode, check if it's a guess
    if (isGarticMode) {
      game.submitGuess(chatInput);
    } else {
      // No chat in Free mode currently? Or just no UI for it.
      // We can allow chat in Free mode too if we add UI.
    }
    setChatInput("");
  };

  // Force re-render for timer every second?
  const [timeLeft, setTimeLeft] = useState(0);
  useEffect(() => {
    // Helper to get remaining time string (approx)
    const getRemainingTime = () => {
      if (!state.gartic?.roundEndTime) return 0;
      if (state.gartic.isPaused) {
        return Math.max(
          0,
          Math.floor((state.gartic.pausedRemainingTime || 0) / 1000),
        );
      }
      const left = Math.max(
        0,
        Math.floor((state.gartic.roundEndTime - Date.now()) / 1000),
      );
      return left;
    };
    const interval = setInterval(() => {
      setTimeLeft(getRemainingTime());
    }, 1000);
    setTimeLeft(getRemainingTime()); // Update immediately
    return () => clearInterval(interval);
  }, [
    state.gartic?.roundEndTime,
    state.gartic?.isPaused,
    state.gartic?.pausedRemainingTime,
  ]);

  const renderGameRules = () => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
          <div className="flex justify-between sticky top-0 p-4 pr-2 bg-slate-900 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-yellow-500" />
              {ti({
                en: "Game Rules: Draw & Guess",
                vi: "Luật Chơi: Vẽ & Đoán",
              })}
            </h2>
            <button
              onClick={() => setShowRules(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4 text-slate-300 leading-relaxed">
            <div className="space-y-4">
              <p>
                {ti({
                  en: "Draw & Guess is a multiplayer drawing game where players take turns drawing a secret word while others try to guess it.",
                  vi: "Vẽ & Đoán là trò chơi vẽ hình nhiều người chơi, trong đó mỗi người sẽ lần lượt vẽ một từ bí mật để những người chươi khác đoán.",
                })}
              </p>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Roles", vi: "Vai trò" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <span className="font-bold text-indigo-400">
                    {ti({ en: "The Drawer", vi: "Người vẽ" })}
                  </span>
                  :{" "}
                  {ti({
                    en: "Chooses a word and draws it on the canvas. Cannot use letters or spell out the word!",
                    vi: "Chọn một từ và vẽ mô tả từ đó. Không được viết chữ hoặc đánh vần!",
                  })}
                </li>
                <li>
                  <span className="font-bold text-green-400">
                    {ti({ en: "The Guessers", vi: "Người đoán" })}
                  </span>
                  :{" "}
                  {ti({
                    en: "Try to guess the word by typing in the chat. Faster guesses earn more points!",
                    vi: "Cố gắng đoán từ bằng cách chat. Đoán càng nhanh càng được nhiều điểm!",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Scoring", vi: "Tính điểm" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "1st Guesser: 10 points",
                    vi: "Người đoán đầu: 10 điểm",
                  })}
                </li>
                <li>
                  {ti({
                    en: "2nd Guesser: 8 points",
                    vi: "Người đoán thứ 2: 8 điểm",
                  })}
                </li>
                <li>
                  {ti({
                    en: "3rd Guesser: 6 points",
                    vi: "Người đoán thứ 3: 6 điểm",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Others: 4 points",
                    vi: "Những người còn lại: 4 điểm",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Drawer: 2 points per correct guess",
                    vi: "Người vẽ: 2 điểm mỗi người đoán đúng",
                  })}
                </li>
              </ul>

              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Tools", vi: "Công cụ" })}
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  {ti({
                    en: "Drawer can Pause the game if needed.",
                    vi: "Người vẽ có thể Tạm dừng trò chơi nếu cần.",
                  })}
                </li>
                <li>
                  {ti({
                    en: "Guessers can buy Hints (-2 points) to reveal a letter.",
                    vi: "Người đoán có thể mua Gợi ý (-2 điểm) để mở một chữ cái.",
                  })}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col @2xl:flex-row gap-4 @md:p-4 p-2 w-full h-full max-w-[1600px] mx-auto overflow-hidden pb-16!">
      {/* Main Canvas Area */}
      <div className="flex flex-col flex-1 h-full min-h-0 gap-2">
        {/* Header / Top Bar */}
        <div className="flex items-center justify-between bg-slate-800 p-2 rounded-lg shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isGarticMode ? (
              <>
                <div
                  className={`flex items-center gap-2 font-bold text-xl bg-slate-900 px-4 py-1 rounded ${timeLeft <= 10 && !isPaused ? "text-red-500 animate-pulse" : "text-yellow-400"}`}
                >
                  {isPaused ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Clock className="w-5 h-5" />
                  )}
                  {timeLeft}s
                </div>
                {isDrawer && (
                  <button
                    onClick={() => game.pauseGame()}
                    className={`p-2 rounded-full transition-colors ${isPaused ? "bg-yellow-500 text-black hover:bg-yellow-400" : "bg-slate-700 text-white hover:bg-slate-600"}`}
                    title={ts({
                      en: isPaused ? "Resume" : "Pause",
                      vi: isPaused ? "Tiếp tục" : "Tạm dừng",
                    })}
                  >
                    {isPaused ? (
                      <Play className="w-4 h-4 fill-current" />
                    ) : (
                      <Pause className="w-4 h-4 fill-current" />
                    )}
                  </button>
                )}
                <div
                  className={`text-white ${displayWord ? "font-mono text-xl tracking-widest" : "font-sans"} pl-4`}
                >
                  {state.gartic?.status === "ROUND_END" ? (
                    <span className="text-green-400">{state.gartic.word}</span>
                  ) : (
                    displayWord || ti({ en: "Waiting...", vi: "Đang chờ..." })
                  )}
                </div>
                {/* Game Language Indicator */}
                <div className="ml-4 px-2 py-0.5 rounded bg-slate-700 text-xs text-slate-300 border border-slate-600">
                  {state.wordLanguage === "vi" ? "Tiếng Việt" : "English"}
                </div>
              </>
            ) : (
              <div className="text-slate-400 px-2 font-medium flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                {ts({ en: "Free Draw", vi: "Vẽ tự do" })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isHost && !isGarticMode && (
              <button
                onClick={() => {
                  if (game.players.length < 2) {
                    showAlert(
                      ts({
                        en: "Need at least 2 players to start Draw & Guess mode!",
                        vi: "Cần ít nhất 2 người chơi để bắt đầu chế độ Vẽ & Đoán!",
                      }),
                      {
                        type: "warning",
                        title: ts({
                          en: "Not enough players",
                          vi: "Không đủ người chơi",
                        }),
                      },
                    );
                    return;
                  }
                  game.startGartic();
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors"
                title={ts({
                  en: "Start Gartic Mode",
                  vi: "Bắt đầu chế độ Gartic",
                })}
              >
                <Gamepad2 className="w-4 h-4" />
                {ts({
                  en: "Draw & Guess Mode",
                  vi: "Chế độ Vẽ & Đoán",
                })}
              </button>
            )}
            {/* {isHost && isGarticMode && (
              <div className="text-xs text-slate-500 mr-2">
                {ti({ en: "Drawer", vi: "Người vẽ" })}
              </div>
            )} */}
          </div>
        </div>

        {/* Toolbar (Only for Drawer) */}
        {canDraw && (
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-800 rounded-lg justify-center shrink-0">
            <button
              onClick={() => setShowColorModal(true)}
              className="w-8 h-8 rounded-full border-2 border-white cursor-pointer"
              style={{ backgroundColor: currentColor }}
            />
            <div className="w-px h-6 bg-slate-700 mx-1" />
            {STROKE_SIZES.map((size) => (
              <button
                key={size.value}
                onClick={() => setCurrentStrokeWidth(size.value)}
                className={`w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center text-xs font-bold ${
                  currentStrokeWidth === size.value
                    ? "border-white bg-slate-600 text-white"
                    : "border-slate-600 bg-slate-700 text-slate-400 hover:border-slate-500"
                }`}
                title={`Stroke size: ${size.label}`}
              >
                {size.label}
              </button>
            ))}
            <div className="w-px h-6 bg-slate-700 mx-1" />
            <button
              onClick={() => game.undo()}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-yellow-400"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleClear}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Canvas Render */}
        <div className="relative flex-1 min-h-0 bg-slate-900 rounded-lg border-2 border-slate-700 overflow-hidden shadow-xl">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: "none" }}
            className={`w-full h-full object-contain bg-slate-900 ${canDraw ? "cursor-crosshair" : "cursor-default"}`}
          />

          {/* Drawer Overlay: Choosing Word */}
          {/* Drawer Overlay: Choosing Word */}
          {isDrawer && state.gartic?.status === "CHOOSING_WORD" && (
            <div className="absolute inset-0 bg-black/80 z-10 animate-in fade-in overflow-y-auto">
              <div className="min-h-full flex flex-col items-center justify-center p-2 gap-2">
                <h2 className="text-xl font-bold text-white text-center">
                  {ti({
                    en: "Choose a word to draw",
                    vi: "Chọn từ để vẽ",
                  })}
                </h2>

                {/* Difficulty Selection Row */}
                <div className="flex flex-wrap justify-center gap-2 w-full max-w-lg">
                  {(Object.keys(WORD_LIST) as Difficulty[]).map((diff) => {
                    const isSelected =
                      (state.wordDifficulty || "easy") === diff;
                    return (
                      <button
                        key={diff}
                        onClick={() => game.selectDifficulty(diff)}
                        className={`px-2 py-1 rounded-lg text-sm font-bold capitalize transition-all transform active:scale-95 border-2 ${
                          isSelected
                            ? "border-white scale-110 shadow-lg relative z-10"
                            : "border-transparent opacity-50 hover:opacity-100 hover:scale-105"
                        } ${
                          diff === "easy"
                            ? "bg-green-500 text-white"
                            : diff === "medium"
                              ? "bg-yellow-500 text-black"
                              : diff === "hard"
                                ? "bg-red-500 text-white"
                                : "bg-purple-500 text-white"
                        }`}
                      >
                        {diff.toUpperCase()}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 mb-2 flex-wrap justify-center">
                  <button
                    onClick={() =>
                      game.rerollOptions(
                        state.wordLanguage === "vi" ? "vi" : "en",
                      )
                    }
                    className="bg-slate-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-600 transition-colors text-sm"
                    title={ts({ en: "Randomize words", vi: "Đổi từ khác" })}
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      game.rerollOptions(
                        state.wordLanguage === "vi" ? "en" : "vi",
                      )
                    }
                    className="bg-slate-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-600 transition-colors text-sm"
                    title={ts({
                      en: "Switch Language",
                      vi: "Đổi ngôn ngữ",
                    })}
                  >
                    <Languages className="w-4 h-4" />
                    {state.wordLanguage === "vi" ? "English" : "Tiếng Việt"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 w-full">
                  {state.wordOptions?.map((word) => (
                    <button
                      key={word}
                      onClick={() => game.chooseWord(word)}
                      className="bg-slate-700 hover:bg-indigo-600 text-white p-2 rounded-xl text-base font-medium transition-all transform hover:scale-105 active:scale-95"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Others Overlay: Waiting for Drawer */}
          {!isDrawer && state.gartic?.status === "CHOOSING_WORD" && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10">
              <div className="animate-bounce">
                <Pencil className="w-12 h-12 text-white mb-2" />
              </div>
              <div className="text-lg text-white font-medium animate-pulse">
                {ti({
                  en: `${drawer?.username || "Drawer"} is choosing a word...`,
                  vi: `${drawer?.username || "Người vẽ"} đang chọn từ...`,
                })}
              </div>
            </div>
          )}

          {/* Paused Overlay */}
          {isPaused && (
            <div className="absolute inset-0 bg-black/10 flex flex-col items-center justify-center z-30">
              <div className="bg-yellow-500 text-black px-6 py-2 rounded-xl font-black text-2xl tracking-widest shadow-xl transform rotate-[-5deg]">
                {ti({ en: "Paused", vi: "Tạm dừng" })}
              </div>
            </div>
          )}

          {/* Result Overlay */}
          {state.gartic?.status === "ROUND_END" && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 animate-in zoom-in-90 duration-300">
              <h2 className="text-sm text-slate-300 uppercase tracking-widest mb-2">
                {ti({ en: "The word was", vi: "Đáp án là" })}
              </h2>
              <h1 className="text-4xl font-black text-green-400 mb-6 bg-black/50 px-6 py-2 rounded-xl border border-green-500/50">
                {state.gartic.word}
              </h1>
              <div className="text-white">
                {ti({
                  en: "Next round starting soon...",
                  vi: "Ván mới sắp bắt đầu...",
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar: Chat & Scores */}
      {isGarticMode && (
        <div className="w-full @2xl:w-80 flex flex-col gap-4 shrink-0 h-[400px] @2xl:h-full">
          {/* Chat / Log */}
          <div className="bg-slate-800 rounded-lg flex-1 min-h-0 max-h-[300px] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-700 bg-slate-900/50">
              <h3 className="text-xs font-bold text-slate-400 uppercase">
                {ti({ en: "Chat & Guesses", vi: "Chat & Đoán" })}
              </h3>
            </div>

            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-3 space-y-2"
            >
              {state.messages.map((msg) => {
                return (
                  <div
                    key={msg.id}
                    className={`text-left text-sm wrap-break-word px-2 py-1 rounded mb-1 ${
                      msg.type === "SYSTEM"
                        ? `font-medium text-center text-xs ${getSystemMessageStyle(msg.subType)}`
                        : msg.type === "GUESS" && msg.isCorrect
                          ? "text-green-400 font-bold bg-green-900/20"
                          : "text-slate-300 hover:bg-slate-700/30"
                    }`}
                  >
                    {msg.type !== "SYSTEM" && (
                      <span className="font-bold text-slate-400 mr-2">
                        {game.players.find((p) => p.id === msg.senderId)
                          ?.username || "Unknown"}
                        :
                      </span>
                    )}
                    <span>{ti(msg.content)}</span>
                    {msg.similarity !== undefined &&
                      msg.similarity > 0 &&
                      msg.similarity < 100 && (
                        <span className="ml-2 text-xs font-mono text-yellow-500">
                          ({msg.similarity}%)
                        </span>
                      )}
                  </div>
                );
              })}
            </div>

            <div className="p-2 border-t border-slate-700 bg-slate-900">
              {/* Hint Button */}
              {!isDrawer &&
                state.gartic?.status === "DRAWING" &&
                !state.guesses.includes(currentUserId ?? "") && (
                  <button
                    onClick={() => game.buyHint()}
                    disabled={(state.scores[currentUserId ?? ""] || 0) < 2}
                    className="w-full mb-2 bg-slate-800 hover:bg-yellow-600/20 text-yellow-500 text-xs py-1.5 rounded border border-slate-700 hover:border-yellow-500/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-slate-800 disabled:hover:border-slate-700"
                    title={ts({
                      en: "Buy a hint (-2 points)",
                      vi: "Mua gợi ý (-2 điểm)",
                    })}
                  >
                    <Lightbulb className="w-3 h-3" />
                    {ti({
                      en: "Reveal Letter (-2 pts)",
                      vi: "Mở ô chữ (-2 điểm)",
                    })}
                  </button>
                )}

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={ts({
                    en: isDrawer
                      ? "Chat with players..."
                      : "Type your guess here...",
                    vi: isDrawer
                      ? "Chat với người chơi..."
                      : "Đoán từ tại đây...",
                  })}
                  className="flex-1 bg-slate-800 text-white border-none rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  maxLength={100}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Scores */}
          <div className="bg-slate-800 rounded-lg p-3 shrink-0 max-h-[150px] overflow-y-auto">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
              <Trophy className="w-3 h-3" />{" "}
              {ti({ en: "Leaderboard", vi: "Bảng xếp hạng" })}
            </h3>
            <div className="space-y-1">
              {game.players
                .sort(
                  (a, b) =>
                    (state.scores[b.id] || 0) - (state.scores[a.id] || 0),
                )
                .map((player, i) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between text-sm p-1.5 rounded bg-slate-700/50"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono font-bold w-4 ${i === 0 ? "text-yellow-400" : "text-slate-500"}`}
                      >
                        #{i + 1}
                      </span>
                      <span
                        className={
                          player.id === currentUserId
                            ? "text-white font-medium"
                            : "text-slate-300"
                        }
                      >
                        {player.username}
                        {state.gartic?.drawerId === player.id && (
                          <span className="text-xs ml-2 text-indigo-400">
                            ({ti({ en: "Drawer", vi: "Người vẽ" })})
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="font-bold text-white">
                      {state.scores[player.id] || 0}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Color Modal (Mobile) */}
      {showColorModal && canDraw && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowColorModal(false)}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-slate-300 mb-3 text-center">
              {ti({ en: "Pick a color", vi: "Chọn màu" })}
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

      {/* Rules Button */}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-yellow-500 transition-colors z-40 shadow-lg border border-slate-500"
        title={ts({ en: "Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={24} />
      </button>

      {showRules && createPortal(renderGameRules(), document.body)}
    </div>
  );
}

const getSystemMessageStyle = (subType?: string) => {
  switch (subType) {
    case "SUCCESS":
      return "text-green-400 bg-green-400/10 border border-green-400/20";
    case "WARNING":
      return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20";
    case "ERROR":
      return "text-red-400 bg-red-400/10 border border-red-400/20";
    case "INFO":
    default:
      return "text-indigo-300 bg-indigo-400/10 border border-indigo-400/20";
  }
};
