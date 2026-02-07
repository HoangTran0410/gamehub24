import { useEffect, useState, useRef, useCallback } from "react";
import GunnyWars from "./GunnyWars";
import type { Tank, Projectile, MoveDirection } from "./types";
import { GamePhase, GameMode, WeaponType, type GunnyWarsState } from "./types";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MAX_FUEL,
  SELECTABLE_WEAPONS,
  GRAVITY,
  MAX_POWER,
  WEAPONS,
  PARTICLE_STRIDE,
  DAY_NIGHT_CYCLE_DURATION,
  FIRE_COOLDOWN,
  MAX_PLAYERS,
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
  Maximize,
  Minimize,
  LogOut,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Wind,
  Sword,
  Swords,
  Flame,
  X,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import type { GameUIProps } from "../types";
import useLanguage from "../../stores/languageStore";
import { formatNumber } from "../../utils";
import useGameState from "../../hooks/useGameState";
import { useAlertStore } from "../../stores/alertStore";
import Portal from "../../components/Portal";
import SoundManager from "../../utils/SoundManager";
import usePrevious from "../../hooks/usePrevious";
import WeaponEditorUI from "./WeaponEditorUI";
import { Plus, Sparkles, Settings2, Trash2 } from "lucide-react";
import type { CustomWeapon } from "./types";

const FireButton = ({
  game,
  state,
  myTankInState,
  ts,
}: {
  game: GunnyWars;
  state: GunnyWarsState;
  myTankInState: Tank | undefined;
  ts: (m: { en: string; vi: string }) => string;
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Only need internal timer in Chaos mode to re-enable button
    if (state.selectedMode !== GameMode.CHAOS) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => clearInterval(interval);
  }, [state.selectedMode]);

  const lastFireTime = myTankInState?.lastFireTime || 0;
  const isCoolingDown =
    state.selectedMode === GameMode.CHAOS && now - lastFireTime < FIRE_COOLDOWN;

  const isDisabled =
    (state.phase !== GamePhase.AIMING &&
      state.selectedMode !== GameMode.CHAOS) ||
    isCoolingDown;

  return (
    <button
      onClick={() => game.fire()}
      disabled={isDisabled}
      className="flex-[1.5] @md:flex-none @md:w-28 bg-linear-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 disabled:from-gray-700 disabled:to-gray-800 text-white font-black text-xs tracking-widest rounded-lg shadow-lg active:scale-90 transition-all border-t border-red-300/30 flex flex-col items-center justify-center gap-0.5 group"
    >
      <div className="w-5 h-5 rounded-full border-2 border-white/20 flex items-center justify-center group-active:scale-110 transition-transform">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
      </div>
      <span>{ts({ en: "FIRE", vi: "BẮN" })}</span>
    </button>
  );
};

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

const GameTimeClock = ({ game }: { game: GunnyWars }) => {
  const [gameTime, setGameTime] = useState<{
    hh: string;
    mm: string;
    icon: any;
  }>({
    hh: "12",
    mm: "00",
    icon: Sun,
  });

  useEffect(() => {
    const updateTime = () => {
      // Use synchronized game start time
      const msSinceStart = Date.now() - game.state.gameStartTime;
      const progress =
        (msSinceStart % DAY_NIGHT_CYCLE_DURATION) / DAY_NIGHT_CYCLE_DURATION;
      const totalMinutes = (progress * 24 * 60 + 6 * 60) % (24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.floor(totalMinutes % 60);

      let Icon = Sun;
      if (hours >= 5 && hours < 8) Icon = Sunrise;
      else if (hours >= 8 && hours < 17) Icon = Sun;
      else if (hours >= 17 && hours < 20) Icon = Sunset;
      else Icon = Moon;

      setGameTime({
        hh: hours.toString().padStart(2, "0"),
        mm: minutes.toString().padStart(2, "0"),
        icon: Icon,
      });
    };

    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="glass-blur px-2 py-1 rounded-sm flex items-center gap-2 ">
      <div className="p-1.5 bg-gray-800/80 rounded-lg text-amber-400">
        <gameTime.icon size={18} />
      </div>
      <div className="flex flex-col">
        <span className="font-mono font-bold text-lg text-gray-100 leading-none">
          {gameTime.hh}:{gameTime.mm}
        </span>
      </div>
    </div>
  );
};

const WeaponSelectModal = ({
  show,
  onClose,
  currentTank,
  game,
  ts,
  openWeaponEditor,
}: {
  show: boolean;
  onClose: () => void;
  currentTank: any;
  game: GunnyWars;
  ts: (m: { en: string; vi: string }) => string;
  openWeaponEditor: (w?: CustomWeapon) => void;
}) => {
  if (!show) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sword size={20} className="text-blue-400" />
              {ts({ en: "Select Weapon", vi: "Chọn vũ khí" })}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 no-scrollbar">
            {/* Standard Weapons */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2">
                {ts({ en: "Standard Arsenal", vi: "Kho vũ khí cơ bản" })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SELECTABLE_WEAPONS.map((w) => {
                  const isDisabled = game.state.disabledWeaponIds.includes(
                    w.type,
                  );
                  return (
                    <div key={w.type} className="relative group">
                      <button
                        onClick={() => {
                          if (isDisabled) return;
                          game.selectWeapon(w.type);
                          onClose();
                        }}
                        disabled={isDisabled}
                        className={`w-full flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                          !isDisabled
                            ? "hover:scale-[1.02] active:scale-95"
                            : "opacity-30 cursor-not-allowed grayscale"
                        } ${
                          currentTank?.weapon === w.type
                            ? "bg-blue-600/20 border-blue-500"
                            : "bg-gray-800/50 border-gray-700 hover:border-gray-600"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span
                            className="font-bold text-lg"
                            style={{ color: w.color }}
                          >
                            {w.name}
                          </span>
                          {currentTank?.weapon === w.type && (
                            <div className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-tighter">
                              {ts({ en: "Selected", vi: "Đã chọn" })}
                            </div>
                          )}
                          {isDisabled && (
                            <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] px-2 py-0.5 rounded-full uppercase font-black tracking-tighter flex items-center gap-1">
                              <Lock size={10} />
                              {ts({ en: "Disabled", vi: "Đã tắt" })}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 leading-tight">
                          {ts({ en: w.description, vi: w.descriptionVi })}
                        </p>
                        <div className="flex gap-4 mt-1 text-[10px] font-mono text-gray-500 uppercase">
                          <span>
                            {ts({ en: "Dmg", vi: "St" })}:{" "}
                            <b className="text-gray-300">
                              {w.type === WeaponType.HEAL
                                ? `+${w.damage}`
                                : w.damage}
                            </b>
                          </span>
                          <span>
                            {ts({ en: "Rad", vi: "Bk" })}:{" "}
                            <b className="text-gray-300">{w.radius}</b>
                          </span>
                        </div>
                      </button>

                      {isDisabled && (
                        <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
                          <div
                            className="absolute inset-0 opacity-10"
                            style={{
                              backgroundImage: `repeating-linear-gradient(45deg, #000, #000 10px, transparent 10px, transparent 20px)`,
                            }}
                          />
                        </div>
                      )}

                      {game.isHost && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            game.toggleWeapon(w.type);
                          }}
                          className={`absolute -top-1 -right-1 p-3 rounded-lg shadow-lg z-10 transition-all ${
                            isDisabled
                              ? "bg-red-500 text-white hover:bg-red-400"
                              : "bg-gray-800 text-gray-400 hover:text-green-400 opacity-50 md:opacity-0 group-hover:opacity-100"
                          }`}
                          title={
                            isDisabled
                              ? ts({ en: "Enable", vi: "Bật" })
                              : ts({ en: "Disable", vi: "Tắt" })
                          }
                        >
                          {isDisabled ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Weapons */}
            <div className="space-y-3 pb-4">
              <div className="flex justify-between items-center px-2">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest ">
                  {ts({ en: "Custom Prototypes", vi: "Vũ khí chế tạo" })}
                </h3>
                {game.isHost && (
                  <button
                    onClick={() => (onClose(), openWeaponEditor())}
                    className="text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-400/10 px-2 py-1 rounded-lg transition-all"
                  >
                    <Plus size={12} />
                    {ts({ en: "New Prototype", vi: "Chế tạo mới" })}
                  </button>
                )}
              </div>

              {game.state.customWeapons.length === 0 ? (
                <div className="py-8 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center text-gray-600 gap-2">
                  <Sparkles size={24} className="opacity-20" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {ts({
                      en: "No custom prototypes",
                      vi: "Chưa có vũ khí chế tạo",
                    })}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {game.state.customWeapons.map((w: any) => (
                    <CustomWeaponItem
                      key={w.id}
                      weapon={w}
                      isSelected={currentTank?.weapon === w.id}
                      isDisabled={game.state.disabledWeaponIds.includes(w.id)}
                      onSelect={() => {
                        game.selectWeapon(w.id);
                        onClose();
                      }}
                      onToggle={() => {
                        game.toggleWeapon(w.id);
                      }}
                      onEdit={() => {
                        onClose();
                        openWeaponEditor(w);
                      }}
                      onDelete={() => {
                        game.deleteCustomWeapon(w.id);
                      }}
                      isHost={game.isHost}
                      ts={ts}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};

const CustomWeaponItem = ({
  weapon,
  isSelected,
  isDisabled,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  isHost,
  ts,
}: {
  weapon: CustomWeapon;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isHost: boolean;
  ts: (m: { en: string; vi: string }) => string;
}) => {
  return (
    <div
      className={`relative group flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
        !isDisabled
          ? "hover:scale-[1.02] active:scale-95"
          : "opacity-30 cursor-not-allowed grayscale"
      } ${
        isSelected
          ? "bg-blue-600/20 border-blue-500"
          : "bg-gray-800/50 border-gray-700 hover:border-gray-600"
      }`}
    >
      <div
        className="flex justify-between items-center"
        onClick={() => !isDisabled && onSelect()}
      >
        <span className="font-bold text-lg" style={{ color: weapon.color }}>
          {weapon.name}
        </span>
        {isSelected && (
          <div className="bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase tracking-tighter">
            {ts({ en: "Selected", vi: "Đã chọn" })}
          </div>
        )}
        {isDisabled && (
          <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] px-2 py-0.5 rounded-full uppercase font-black tracking-tighter flex items-center gap-1">
            <Lock size={10} />
            {ts({ en: "Disabled", vi: "Đã tắt" })}
          </div>
        )}
      </div>
      <p
        className="text-sm text-gray-400 leading-tight"
        onClick={() => !isDisabled && onSelect()}
      >
        {ts({ en: weapon.description, vi: weapon.descriptionVi })}
      </p>
      <div
        className="flex gap-4 mt-1 text-[10px] font-mono text-gray-500 uppercase"
        onClick={() => !isDisabled && onSelect()}
      >
        <span>
          {ts({ en: "Dmg", vi: "St" })}:{" "}
          <b className="text-gray-300">{weapon.damage}</b>
        </span>
        <span>
          {ts({ en: "Rad", vi: "Bk" })}:{" "}
          <b className="text-gray-300">{weapon.radius}</b>
        </span>
        {weapon.effects.length > 0 && (
          <span className="text-blue-400">
            {weapon.effects.length} {ts({ en: "Effects", vi: "Hiệu ứng" })}
          </span>
        )}
      </div>

      {isDisabled && (
        <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, #000, #000 10px, transparent 10px, transparent 20px)`,
            }}
          />
        </div>
      )}

      {isHost && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`p-1.5 rounded-lg shadow-lg transition-all ${
              isDisabled
                ? "bg-red-500 text-white hover:bg-red-400"
                : "bg-gray-700 text-gray-400 hover:text-green-400"
            }`}
          >
            {isDisabled ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300"
          >
            <Settings2 size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 bg-red-900/50 hover:bg-red-800 rounded-lg text-red-300"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default function GunnyWarsUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as unknown as GunnyWars;
  const { ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();

  // UI state
  const [state] = useGameState(game);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [forceGpuRender, setForceGpuRender] = useState(true); // Toggle for GPU/CPU rendering

  // Current player info
  const myTankInState = state.tanks.find((t) => t.playerId === game.userId);
  const currentTankInState =
    state.selectedMode === GameMode.CHAOS
      ? state.tanks.find((t) => t.playerId === game.userId)
      : state.tanks[state.currentTurnIndex];
  const currentTank = currentTankInState
    ? game.getVisualTank(currentTankInState)
    : undefined;
  const isMyTurn =
    state.selectedMode === GameMode.CHAOS ? !!myTankInState : game.isMyTurn();
  const canStartGame = game.canStartGame();

  usePrevious(state.currentTurnIndex, (prev, _current) => {
    if (state.phase !== GamePhase.AIMING) return;
    if (prev !== null) SoundManager.playTurnSwitch(isMyTurn);
  });

  // Local angle/power/position for live UI updates (sync on release/stop move)
  const [showWeaponModal, setShowWeaponModal] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingWeapon, setEditingWeapon] = useState<
    CustomWeapon | undefined
  >();

  const openWeaponEditor = (w?: CustomWeapon) => {
    setEditingWeapon(w);
    setShowEditor(true);
  };

  const [localAngle, setLocalAngle] = useState<number | null>(null);
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
  const lastSentMoveDirRef = useRef<number | null>(null);
  // Store indicator hit areas for click detection
  const indicatorHitAreasRef = useRef<
    Map<string, { x: number; y: number; radius: number }>
  >(new Map());
  // Persistence for Point Lights to avoid GC on mobile
  const MAX_LIGHTS = 10;
  const lightPosRef = useRef(new Float32Array(MAX_LIGHTS * 2));
  const lightColRef = useRef(new Float32Array(MAX_LIGHTS * 3));
  const lightRadRef = useRef(new Float32Array(MAX_LIGHTS));
  const lingeringLightsRef = useRef<
    Array<{
      id: string;
      x: number;
      y: number;
      color: [number, number, number];
      radius: number;
      life: number;
    }>
  >([]);
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
    if (state.phase === GamePhase.WAITING) {
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
        // if (Math.abs(cameraRef.current.vx) < 0.1) cameraRef.current.vx = 0;
        // if (Math.abs(cameraRef.current.vy) < 0.1) cameraRef.current.vy = 0;

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
          const activeTankBase =
            game.state.selectedMode === GameMode.CHAOS
              ? game.state.tanks.find((t) => t.playerId === game.userId)
              : game.state.tanks[game.state.currentTurnIndex];
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
          // 1. Update lingering lights (decay)
          const lingering = lingeringLightsRef.current;
          for (let i = lingering.length - 1; i >= 0; i--) {
            lingering[i].life -= 0.05; // Fade over ~20 frames
            if (lingering[i].life <= 0) lingering.splice(i, 1);
          }

          // 2. Collect current "real" light sources
          // Projectiles
          for (const p of game.projectiles) {
            const existing = lingering.find((l) => l.id === p.id);
            if (existing) {
              existing.x = p.x;
              existing.y = p.y;
              existing.life = 1.0;
            } else {
              let col: [number, number, number] = [1.0, 0.9, 0.7];
              if (p.weapon === WeaponType.NUKE) col = [0.8, 0.3, 1.0];
              else if (p.weapon === WeaponType.HEAL) col = [0.3, 1.0, 0.5];
              lingering.push({
                id: p.id,
                x: p.x,
                y: p.y,
                color: col,
                radius: 200.0,
                life: 1.0,
              });
            }
          }

          // Fire particles (just a few samples to avoid bloat)
          if (game.particleCount > 0) {
            const data = game.particleData;
            for (
              let i = game.particleCount - 1;
              i >= Math.max(0, game.particleCount - 20);
              i--
            ) {
              const idx = i * PARTICLE_STRIDE;
              if (data[idx + 11] > 0.5) {
                // Additive
                const pId = `part-${i}`;
                const existing = lingering.find((l) => l.id === pId);
                if (existing) {
                  existing.life = 1.0;
                  existing.x = data[idx + 0];
                  existing.y = data[idx + 1];
                } else if (lingering.length < 20) {
                  // Limit total tracked lights
                  lingering.push({
                    id: pId,
                    x: data[idx + 0],
                    y: data[idx + 1],
                    color: [
                      data[idx + 8] * 1.5,
                      data[idx + 9] * 1.5,
                      data[idx + 10] * 1.5,
                    ],
                    radius: data[idx + 6] * 15.0,
                    life: 1.0,
                  });
                }
              }
            }
          }

          // 3. Fill the Float32Arrays for the shader (Top 10 by brightness)
          lingering.sort((a, b) => b.radius * b.life - a.radius * a.life);

          const lightPos = lightPosRef.current;
          const lightCol = lightColRef.current;
          const lightRad = lightRadRef.current;
          let lightCount = 0;
          for (const l of lingering) {
            if (lightCount >= MAX_LIGHTS) break;
            const idx2 = lightCount * 2;
            const idx3 = lightCount * 3;
            lightPos[idx2] = l.x;
            lightPos[idx2 + 1] = l.y;
            lightCol[idx3] = l.color[0] * l.life;
            lightCol[idx3 + 1] = l.color[1] * l.life;
            lightCol[idx3 + 2] = l.color[2] * l.life;
            lightRad[lightCount] = l.radius * (0.5 + 0.5 * l.life);
            lightCount++;
          }

          shaderRenderer.setLights(lightPos, lightCol, lightRad, lightCount);

          // Narrow down modifications to current viewport for GPU performance
          shaderRenderer.uploadModifications(
            game.state.terrainMods,
            camX,
            camY,
            vpW,
            vpH,
            zoom,
          );

          // Render terrain with GPU (includes background + stars + terrain)
          shaderRenderer.render(
            game.state.terrainSeed,
            camX,
            camY,
            vpW,
            vpH,
            zoom,
            Date.now() - game.state.gameStartTime,
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
      const currentTankBase =
        game.state.selectedMode === GameMode.CHAOS
          ? game.state.tanks.find((t) => t.playerId === game.userId)
          : game.state.tanks[game.state.currentTurnIndex];
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

      // Fuel/Energy bar
      ctx.translate(0, 8);
      ctx.fillStyle = "#334155";
      ctx.fillRect(-20, 0, 40, 4);

      if (game.state.selectedMode === GameMode.CHAOS) {
        // Show Cooldown bar in Chaos
        const now = Date.now();
        const timePassed = now - tank.lastFireTime;
        const progress = Math.min(1, timePassed / FIRE_COOLDOWN);
        ctx.fillStyle = progress >= 1 ? "#facc15" : "#64748b"; // Yellow when ready, slate when cooling down
        ctx.fillRect(-19, 1, 38 * progress, 2);
      } else {
        // Show Fuel bar in Normal mode
        ctx.fillStyle = "#f59e0b"; // Orange for Fuel
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

      // Keyboard/UI movement processing for exploration (Real-time polling)
      if (game.state.selectedMode === GameMode.CHAOS) {
        const left = inputRef.current.left;
        const right = inputRef.current.right;
        const myTank = game.state.tanks.find((t) => t.playerId === game.userId);

        if (myTank) {
          if (left && lastSentMoveDirRef.current !== -1) {
            lastSentMoveDirRef.current = -1;
            myTank.isMoving = true;
            myTank.moveDir = -1;
            game.moveStart(-1);
            cameraRef.current.mode = "FOLLOW_PLAYER";
          } else if (right && lastSentMoveDirRef.current !== 1) {
            lastSentMoveDirRef.current = 1;
            myTank.isMoving = true;
            myTank.moveDir = 1;
            game.moveStart(1);
            cameraRef.current.mode = "FOLLOW_PLAYER";
          } else if (!left && !right && lastSentMoveDirRef.current !== null) {
            lastSentMoveDirRef.current = null;
            myTank.isMoving = false;
            myTank.moveDir = undefined;
            game.moveStop();
          }
        }
      }

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
      const myTank = game.state.tanks.find((t) => t.playerId === game.userId);
      const isMyTurnInState =
        game.state.selectedMode === GameMode.CHAOS ? !!myTank : game.isMyTurn();

      const canAct =
        (game.state.phase === GamePhase.AIMING ||
          game.state.selectedMode === GameMode.CHAOS) &&
        (!(game.state.selectedMode === GameMode.CHAOS) ||
          Date.now() - (myTank?.lastFireTime || 0) >= FIRE_COOLDOWN);

      if (e.key === " " && isMyTurnInState && canAct) {
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
      if (dir === -1) inputRef.current.left = true;
      if (dir === 1) inputRef.current.right = true;

      if (game.state.selectedMode !== GameMode.CHAOS) {
        const myTank = game.getMyTank();
        if (myTank && (!myTank.isMoving || myTank.moveDir !== dir)) {
          game.moveStart(dir);
        }
      }

      cameraRef.current.mode = "FOLLOW_PLAYER";
    },
    [game],
  );

  const handleMoveEnd = useCallback(
    (dir: MoveDirection) => {
      if (dir === -1) inputRef.current.left = false;
      if (dir === 1) inputRef.current.right = false;

      if (game.state.selectedMode !== GameMode.CHAOS) {
        const myTank = game.getMyTank();
        if (myTank && myTank.isMoving && myTank.moveDir === dir) {
          game.moveStop();
        }
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
      <>
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 text-white p-4">
          <h1 className="text-4xl font-black mb-8 bg-linear-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
            GunnyWars
          </h1>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">
              {ts({ en: "Players", vi: "Người chơi" })}
              <span className="text-xs text-gray-500 ml-2">
                ({ts({ en: "Max: ", vi: "Tối đa: " })}
                {MAX_PLAYERS})
              </span>
            </h2>

            <div className="space-y-3">
              {state.players.map((p, index) => (
                <div
                  key={(p.id || "bot") + index}
                  className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
                >
                  {p.isBot ? (
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
                  {p.isBot && game.isHost && (
                    <button
                      onClick={() => game.requestRemoveBot()}
                      className="ml-auto text-red-400 hover:text-red-300 transition-colors p-2 bg-red-400/20 rounded-lg"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}

              {game.isHost && state.players.length < MAX_PLAYERS && (
                <button
                  onClick={() => game.requestAddBot()}
                  className="w-full p-3 border border-dashed border-green-500/50 rounded-xl text-green-500 hover:border-green-500/80 hover:bg-green-500/10 transition-all flex items-center justify-center gap-2"
                >
                  <Bot size={18} />
                  {ts({ en: "Add Bot", vi: "Thêm Bot" })}
                </button>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1">
                {ts({ en: "Game Mode", vi: "Chế độ chơi" })}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    game.isHost && game.selectMode(GameMode.TURN_BASED)
                  }
                  disabled={!game.isHost}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                    state.selectedMode === GameMode.TURN_BASED ||
                    !state.selectedMode
                      ? "bg-green-500/10 border-green-500/50 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                      : "bg-white/5 border-white/5 text-gray-500 hover:border-white/10"
                  } ${!game.isHost ? "cursor-default" : "cursor-pointer active:scale-95"}`}
                >
                  <div
                    className={`p-2 rounded-xl ${state.selectedMode === GameMode.TURN_BASED || !state.selectedMode ? "bg-green-500/20" : "bg-white/5"}`}
                  >
                    <Swords size={20} />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-sm">
                      {ts({ en: "Turn-based", vi: "Theo lượt" })}
                    </div>
                    <div className="text-[10px] opacity-60 font-medium">
                      {ts({ en: "Strategy", vi: "Chiến thuật" })}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => game.isHost && game.selectMode(GameMode.CHAOS)}
                  disabled={!game.isHost}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                    state.selectedMode === GameMode.CHAOS
                      ? "bg-orange-500/10 border-orange-500/50 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.1)]"
                      : "bg-white/5 border-white/5 text-gray-500 hover:border-white/10"
                  } ${!game.isHost ? "cursor-default" : "cursor-pointer active:scale-95"}`}
                >
                  <div
                    className={`p-2 rounded-xl ${state.selectedMode === GameMode.CHAOS ? "bg-orange-500/20" : "bg-white/5"}`}
                  >
                    <Flame size={20} />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-sm">
                      {ts({ en: "Chaos Mode", vi: "Tự do" })}
                    </div>
                    <div className="text-[10px] opacity-60 font-medium">
                      {ts({ en: "Real-time", vi: "Hỗn loạn" })}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {game.isHost && (
              <div className="mt-8 flex flex-col gap-4">
                <button
                  onClick={() => setShowWeaponModal(true)}
                  className="w-full py-4 rounded-2xl font-black text-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-blue-400 flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-blue-500/5"
                >
                  <Swords size={24} />
                  <span className="uppercase tracking-widest">
                    {ts({ en: "Manage Arsenal", vi: "Quản lý kho vũ khí" })}
                  </span>
                </button>

                <button
                  onClick={() => game.startGame()}
                  disabled={!canStartGame}
                  className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg ${
                    state.selectedMode === GameMode.CHAOS
                      ? "bg-linear-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 shadow-orange-500/20"
                      : "bg-linear-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-green-500/20"
                  } disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed text-white`}
                >
                  <Play size={24} fill="currentColor" />
                  <span className="uppercase tracking-widest">
                    {state.selectedMode === GameMode.TURN_BASED && !canStartGame
                      ? ts({ en: "Need 2+ players", vi: "Cần 2+ người chơi" })
                      : ts({ en: "Start Game", vi: "Bắt đầu" })}
                  </span>
                </button>

                {!canStartGame && (
                  <p className="text-center text-[10px] text-gray-500 mt-3 font-medium uppercase tracking-tighter">
                    {state.selectedMode === GameMode.CHAOS
                      ? ts({
                          en: "Press start to explore",
                          vi: "Nhấn bắt đầu để khám phá",
                        })
                      : ts({
                          en: "Requires 2+ players or bots to start",
                          vi: "Cần tối thiểu 2 người hoặc bot để bắt đầu",
                        })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <WeaponSelectModal
          show={showWeaponModal}
          onClose={() => setShowWeaponModal(false)}
          currentTank={null}
          game={game}
          ts={ts}
          openWeaponEditor={openWeaponEditor}
        />

        <WeaponEditorUI
          show={showEditor}
          onClose={() => setShowEditor(false)}
          onSave={(w) => game.createCustomWeapon(w)}
          initialWeapon={editingWeapon}
          userId={game.userId}
        />
      </>
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

        <div className="absolute top-0 left-0 pointer-events-none z-20">
          {/* Time of Day Indicator */}
          <GameTimeClock game={game} />

          {/* Wind Indicator */}
          <div className="glass-blur px-2 py-1 rounded-sm flex items-center gap-2 ">
            <div className="p-1.5 bg-gray-800/80 rounded-lg">
              <Wind size={18} />
            </div>
            <div className="flex flex-col">
              <span
                className={`font-mono font-bold text-lg leading-none ${state.wind >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {Math.abs(Math.round(state.wind * 100))}{" "}
                {state.wind >= 0 ? "→" : "←"}
              </span>
            </div>
          </div>
        </div>

        {/* Zoom Controls & Fullscreen */}
        <div className="absolute bottom-4 right-4 flex flex-row gap-1 z-20 opacity-30 hover:opacity-100 transition-all duration-300">
          {/* Return to Menu */}
          <button
            onClick={async () => {
              if (
                await showConfirm(
                  ts({
                    en: "Return to main menu?",
                    vi: "Quay lại màn hình menu?",
                  }),
                  ts({
                    en: "Back to Menu",
                    vi: "Quay lại Menu",
                  }),
                )
              )
                game.requestReset();
            }}
            className="bg-red-800/80 hover:bg-red-700 p-2 rounded-full border border-red-600 text-red-200 shadow-lg glass-blur transition-transform active:scale-95"
            title="Exit to Menu"
          >
            <LogOut size={18} />
          </button>
          {/* Regenerate Map */}
          {game.isHost && (
            <button
              onClick={async () => {
                if (
                  await showConfirm(
                    ts({
                      en: "Map will be randomly regenerated",
                      vi: "Bản đồ sẽ được tạo mới ngẫu nhiên",
                    }),
                    ts({
                      en: "Regenerate map?",
                      vi: "Tạo map mới?",
                    }),
                  )
                )
                  game.requestRegenerateMap();
              }}
              className="bg-purple-800/80 hover:bg-purple-700 p-2 rounded-full border border-purple-600 text-purple-200 shadow-lg glass-blur transition-transform active:scale-95"
              title="Regenerate Map"
            >
              <RotateCw size={18} />
            </button>
          )}
          {/* GPU/CPU Toggle */}
          <button
            onClick={() => setForceGpuRender(!forceGpuRender)}
            className={`px-3 py-2 rounded-full border text-xs font-bold shadow-lg glass-blur transition-all active:scale-95 ${
              forceGpuRender
                ? "bg-green-800/80 hover:bg-green-700 border-green-600 text-green-200"
                : "bg-amber-800/80 hover:bg-amber-700 border-amber-600 text-amber-200"
            }`}
          >
            {forceGpuRender ? "GPU" : "CPU"}
          </button>
          <button
            onClick={() => handleZoom("in")}
            className="bg-gray-800/80 hover:bg-gray-700 p-2 rounded-full border border-gray-600 text-white shadow-lg glass-blur transition-transform active:scale-95"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => handleZoom("out")}
            className="bg-gray-800/80 hover:bg-gray-700 p-2 rounded-full border border-gray-600 text-white shadow-lg glass-blur transition-transform active:scale-95"
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
            className="bg-gray-800/80 hover:bg-gray-700 p-2 rounded-full border border-gray-600 text-white shadow-lg glass-blur transition-transform active:scale-95"
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
            <h1 className="text-5xl @md:text-7xl font-black mb-6 bg-linear-to-r from-yellow-400 via-pink-500 to-purple-600 text-transparent bg-clip-text">
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
      <div className="bg-gray-900 border-t border-gray-800 p-2 @md:p-3 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10 shrink-0 select-none">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          {/* Row 1: Angle + Power + Weapon Button + Fire */}
          <div className="flex flex-wrap items-stretch gap-2">
            {/* Status & Movement Group */}
            <div className="flex-1 flex gap-2 min-w-[280px]">
              {/* Turn/Status */}
              <div
                className={`flex-1 min-w-[120px] glass-blur rounded-lg p-2 border border-gray-700 flex flex-col justify-center items-center gap-0.5 cursor-pointer hover:bg-gray-700/50 transition-colors ${!isMyTurn ? "opacity-60" : ""}`}
                onClick={() => {
                  if (currentTank) {
                    focusedTankIdRef.current = currentTank.id;
                    cameraRef.current.mode = "FOLLOW_TANK";
                  }
                }}
              >
                <div className="flex items-center gap-1.5 overflow-hidden w-full justify-center">
                  {currentTank?.isBot ? (
                    <Bot
                      size={14}
                      style={{ color: currentTank?.color || "#f87171" }}
                    />
                  ) : (
                    <User
                      size={14}
                      style={{
                        color:
                          currentTank?.color ||
                          (isMyTurn ? "#60a5fa" : "#f87171"),
                      }}
                    />
                  )}
                  <span
                    className="font-black uppercase tracking-tighter text-[10px] @md:text-xs truncate"
                    style={{
                      color:
                        currentTank?.color ||
                        (isMyTurn ? "#60a5fa" : "#f87171"),
                    }}
                  >
                    {currentTankInState?.name ||
                      (currentTank?.isBot
                        ? "Bot"
                        : ts({ en: "Guest", vi: "Khách" }))}
                  </span>
                </div>
                {state.selectedMode === GameMode.TURN_BASED && isMyTurn && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full animate-pulse bg-blue-500" />
                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest leading-none">
                      {ts({ en: "Your Turn", vi: "Lượt bạn" })}
                    </span>
                  </div>
                )}
              </div>

              {/* Movement Controls */}
              <div
                className={`flex items-stretch gap-1 ${!isMyTurn || (state.phase !== GamePhase.AIMING && state.selectedMode !== GameMode.CHAOS) ? "opacity-30 pointer-events-none grayscale" : ""}`}
              >
                <button
                  className="w-12 bg-gray-800 hover:bg-gray-700 active:bg-blue-600 active:text-white rounded-lg border border-gray-700 flex items-center justify-center transition-all"
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
                  className="w-12 bg-gray-800 hover:bg-gray-700 active:bg-blue-600 active:text-white rounded-lg border border-gray-700 flex items-center justify-center transition-all"
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
            </div>

            {/* Precision Controls Group */}
            <div
              className={`flex-[1.5] flex flex-col justify-center gap-1.5 min-w-[300px] ${!isMyTurn || (state.phase !== GamePhase.AIMING && state.selectedMode !== GameMode.CHAOS) ? "opacity-30 pointer-events-none grayscale" : ""}`}
            >
              {/* Angle */}
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-gray-500 w-8 tracking-tighter uppercase">
                  {ts({ en: "Angle", vi: "Góc" })}
                </span>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={180 - (localAngle ?? currentTank?.angle ?? 0)}
                  onChange={(e) =>
                    setLocalAngle(180 - parseInt(e.target.value))
                  }
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
                  className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs font-mono font-bold text-blue-400 w-10 text-right">
                  {Math.round(localAngle ?? currentTank?.angle ?? 0)}°
                </span>
              </div>
              {/* Power */}
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-gray-500 w-8 tracking-tighter uppercase">
                  {ts({ en: "Power", vi: "Lực" })}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localPower ?? currentTank?.power ?? 0}
                  onChange={(e) => setLocalPower(parseInt(e.target.value))}
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
                  className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
                <span className="text-xs font-mono font-bold text-red-400 w-10 text-right">
                  {Math.round(localPower ?? currentTank?.power ?? 0)}
                </span>
              </div>
            </div>

            {/* Fire & Weapon Group */}
            <div className="flex flex-1 gap-2 min-w-[180px]">
              {/* Weapon Toggle */}
              {(() => {
                const weaponData = game.getWeaponData(
                  currentTank?.weapon ?? WeaponType.BASIC,
                );
                return (
                  <button
                    onClick={() => setShowWeaponModal(true)}
                    className={`flex-1 @md:flex-none @md:w-32 flex flex-col items-center justify-center rounded-lg border-2 transition-all p-1.5 hover:scale-105 active:scale-95 ${!isMyTurn || (state.phase !== GamePhase.AIMING && state.selectedMode !== GameMode.CHAOS) ? "opacity-30 pointer-events-none grayscale" : ""}`}
                    style={{
                      backgroundColor: `${weaponData.color}15`,
                      borderColor: weaponData.color,
                    }}
                  >
                    <Sword
                      size={14}
                      style={{
                        color: weaponData.color,
                      }}
                      className="mb-0.5"
                    />
                    <span
                      className="text-[10px] font-black uppercase truncate w-full text-center"
                      style={{
                        color: weaponData.color,
                      }}
                    >
                      {weaponData.name}
                    </span>
                  </button>
                );
              })()}

              {/* Fire Button (Reactive) */}
              <FireButton
                game={game}
                state={state}
                myTankInState={myTankInState}
                ts={ts}
              />
            </div>
          </div>
        </div>
      </div>

      <WeaponSelectModal
        show={showWeaponModal}
        onClose={() => setShowWeaponModal(false)}
        currentTank={currentTank}
        game={game}
        ts={ts}
        openWeaponEditor={openWeaponEditor}
      />

      <WeaponEditorUI
        show={showEditor}
        onClose={() => setShowEditor(false)}
        onSave={(w) => game.createCustomWeapon(w)}
        initialWeapon={editingWeapon}
        userId={game.userId}
      />
    </div>
  );
}
