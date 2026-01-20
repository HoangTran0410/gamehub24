import React, { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { GameUIProps } from "../types";
import Werewolf from "./Werewolf";
import type {
  WerewolfState,
  WerewolfPlayer,
  WerewolfRole,
  GamePhase,
} from "./types";
import { ROLE_INFO, QUICK_MESSAGES, DEFAULT_CONFIG } from "./types";
import {
  Moon,
  Sun,
  MessageSquare,
  Vote,
  Pause,
  Skull,
  Users,
  Timer,
  Send,
  Target,
  Heart,
  X,
  Check,
  Bot,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Calendar,
  Star,
  Shield,
  User,
  Home,
  HeartHandshake,
  History,
  Gamepad2,
  Info,
  MoonStar,
  SkipForward,
  ThumbsDown,
  BookOpen,
  Eye,
  Pointer,
} from "lucide-react";
import { useAlertStore } from "../../stores/alertStore";
import useLanguage from "../../stores/languageStore";
import { useUserStore } from "../../stores/userStore";

const getPhaseIcon = (phase: GamePhase) => {
  switch (phase) {
    case "night":
      return <Moon className="w-5 h-5" />;
    case "morning":
      return <Sun className="w-5 h-5" />;
    case "discussion":
      return <MessageSquare className="w-5 h-5" />;
    case "voting":
      return <ThumbsDown className="w-5 h-5" />;
    case "elimination":
    case "hunterRevenge":
      return <Skull className="w-5 h-5" />;
    default:
      return <Users className="w-5 h-5" />;
  }
};

const getPhaseLabel = (phase: GamePhase): { en: string; vi: string } => {
  const labels: Record<GamePhase, { en: string; vi: string }> = {
    setup: { en: "Setup", vi: "Thiết lập" },
    night: { en: "Night", vi: "Đêm" },
    morning: { en: "Morning", vi: "Sáng" },
    discussion: { en: "Discussion", vi: "Thảo luận" },
    voting: { en: "Voting", vi: "Bình chọn" },
    elimination: { en: "Elimination", vi: "Loại bỏ" },
    hunterRevenge: { en: "Hunter's Revenge", vi: "Thợ Săn trả thù" },
    end: { en: "Game Over", vi: "Kết thúc" },
  };
  return labels[phase] || phase;
};

// Dynamic background based on phase
const getPhaseBackground = (phase: GamePhase): string => {
  switch (phase) {
    case "setup":
      return "bg-gradient-to-b from-slate-900 to-slate-800";
    case "night":
      return "bg-gradient-to-b from-slate-950 to-indigo-950";
    case "voting":
      return "bg-gradient-to-b from-orange-950 to-blue-800";
    case "elimination":
      return "bg-gradient-to-b from-red-950 to-brown-800";
    default:
      // Day phases - slightly brighter but still dark theme
      return "bg-gradient-to-b from-slate-800 to-slate-700";
  }
};

// Timer Component
const TimerDisplay: React.FC<{
  endTime: number | null;
  isPaused?: boolean;
  pausedTimeRemaining?: number | null;
}> = ({ endTime, isPaused, pausedTimeRemaining }) => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (isPaused && pausedTimeRemaining != null) {
      setRemaining(Math.max(0, Math.floor(pausedTimeRemaining / 1000)));
      return;
    }

    if (!endTime) return;
    const update = () =>
      setRemaining(Math.max(0, Math.floor((endTime - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime, isPaused, pausedTimeRemaining]);

  if (!endTime && !pausedTimeRemaining) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-lg font-bold font-mono transition-colors ${
        isPaused
          ? "bg-yellow-500/30 text-yellow-400"
          : remaining <= 15
            ? "bg-red-500/30 text-red-400 animate-bounce"
            : "bg-white/15 text-white"
      }`}
    >
      {isPaused ? <Pause className="w-5 h-5" /> : <Timer className="w-5 h-5" />}
      {minutes}:{seconds.toString().padStart(2, "0")}
    </div>
  );
};

const GameHistoryPanel: React.FC<{
  state: WerewolfState;
  currentUserId: string;
}> = ({ state, currentUserId }) => {
  const { ti } = useLanguage();

  // Group logs and chats by day
  const historyByDay = useMemo(() => {
    const grouped: Record<
      number,
      Array<{ type: "log" | "chat"; data: any }>
    > = {};

    // Add logs
    state.logs.forEach((log) => {
      if (!grouped[log.day]) grouped[log.day] = [];
      grouped[log.day].push({ type: "log", data: log });
    });

    // Add chats
    state.chatMessages.forEach((msg) => {
      const day = msg.day || 1; // Fallback for legacy messages
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push({ type: "chat", data: msg });
    });

    // Add personal history
    const myPlayer = state.players.find((p) => p.id === currentUserId);
    if (myPlayer?.history) {
      myPlayer.history.forEach((hist) => {
        if (!grouped[hist.day]) grouped[hist.day] = [];
        // Map personal history to log format for rendering
        grouped[hist.day].push({
          type: "log",
          data: {
            id: hist.id,
            message: hist.content,
            type: hist.type,
            timestamp: hist.timestamp,
            day: hist.day,
          },
        });
      });
    }

    // Sort each day - REVERSE ORDER (Newest first)
    Object.keys(grouped).forEach((key) => {
      const k = Number(key);
      grouped[k].sort((a, b) => b.data.timestamp - a.data.timestamp);
    });

    return grouped;
  }, [state.logs, state.chatMessages, state.players, currentUserId]);

  const days = Object.keys(historyByDay)
    .map(Number)
    .sort((a, b) => b - a); // Newest day first

  if (state.logs.length === 0 && state.chatMessages.length === 0) return null;

  return (
    <div className="h-full overflow-y-auto pb-16 px-2 pt-0">
      {days.map((day) => {
        // Group consecutive chat messages
        const rawItems = historyByDay[day];
        const groupedItems: any[] = [];

        rawItems.forEach((item) => {
          const last = groupedItems[groupedItems.length - 1];
          if (
            item.type === "chat" &&
            last?.type === "chat" &&
            last.data[0].playerName === item.data.playerName
          ) {
            last.data.push(item.data);
          } else if (item.type === "chat") {
            groupedItems.push({ type: "chat", data: [item.data] });
          } else {
            groupedItems.push(item);
          }
        });

        return (
          <div key={day} className="mb-4 relative">
            {/* Day Header */}
            <div className="sticky top-0 z-10 py-1.5 bg-slate-900/95 backdrop-blur border-b border-white/10 mb-2 flex items-center gap-2">
              <div className="p-1 rounded bg-blue-500/20 text-blue-400">
                {day === 0 ? (
                  <Gamepad2 className="w-4 h-4" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
              </div>
              <span className="font-bold text-blue-100">
                {day === 0
                  ? ti({ vi: "Bắt đầu game", en: "Start game" })
                  : ti({ vi: `Ngày ${day}`, en: `Day ${day}` })}
              </span>
            </div>

            {/* Timeline */}
            <div className="ml-2 pl-4 border-l-2 border-white/10 space-y-1">
              {groupedItems.map((item, idx) => {
                if (item.type === "chat") {
                  const messages = item.data;
                  const firstMsg = messages[0];
                  return (
                    <div key={`chat-group-${idx}`} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 bg-blue-500" />

                      <div className="bg-white/5 rounded-lg ml-1 overflow-hidden">
                        <div className="px-2 py-1 bg-white/5 border-b border-white/5 flex items-center justify-between">
                          <span className="text-blue-400 font-bold text-xs">
                            {firstMsg.playerName}
                          </span>
                        </div>
                        <div className="p-1 space-y-0.5">
                          {messages.map((msg: any) => (
                            <div
                              key={msg.id}
                              className="px-2 py-1 hover:bg-white/5 rounded transition-colors"
                            >
                              <div className="flex justify-between items-baseline gap-2">
                                <p className="text-sm text-white/90 break-words leading-tight flex-1">
                                  {msg.content}
                                </p>
                                <span className="text-[10px] text-white/40 shrink-0">
                                  {new Date(msg.timestamp).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Render Logs
                const log = item.data;
                let Icon = Info;
                let colorClass = "text-gray-400 bg-gray-500/10";
                let borderClass = "border-gray-500/20";

                if (log.type === "death") {
                  Icon = Skull;
                  colorClass = "text-red-400 bg-red-500/10";
                  borderClass = "border-red-500/20";
                } else if (log.type === "vote") {
                  Icon = Vote;
                  colorClass = "text-orange-400 bg-orange-500/10";
                  borderClass = "border-orange-500/20";
                }

                return (
                  <div key={log.id} className="relative">
                    {/* Timeline dot */}
                    <div
                      className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                        log.type === "death"
                          ? "bg-red-500"
                          : log.type === "vote"
                            ? "bg-orange-500"
                            : "bg-gray-500"
                      }`}
                    />

                    <div
                      className={`p-2 rounded-lg border flex flex-col gap-1 ${borderClass} ${colorClass}`}
                    >
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-sm leading-tight text-white/90">
                          {ti(log.message)}
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <span className="text-[10px] text-white/40">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Player Personal History Modal
const PlayerHistoryModal: React.FC<{
  player: WerewolfPlayer;
  onClose: () => void;
}> = ({ player, onClose }) => {
  const { ti } = useLanguage();
  const userId = useUserStore((state) => state.userId);
  const isMe = userId === player.id;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-base">
              {player.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                {player.username}
              </h3>
              <p className="text-[10px] text-white/60">
                {ti({ vi: "Lịch sử hoạt động", en: "Activity History" })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {player.history.length === 0 ? (
            <div className="text-center text-white/40 py-8 italic text-xs">
              {ti({ vi: "Chưa có hoạt động nào", en: "No activity recorded" })}
            </div>
          ) : (
            [...player.history]
              .filter((item) => !item.isSecret || isMe)
              .reverse()
              .map((item) => (
                <div
                  key={item.id}
                  className="relative pl-3 border-l border-white/10 py-0.5"
                >
                  <div className="absolute -left-[5px] top-3 w-2.5 h-2.5 rounded-full bg-slate-600 border-2 border-slate-800" />
                  <div className="bg-white/5 p-2 rounded-lg">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                          item.type === "chat"
                            ? "bg-blue-500/20 text-blue-400"
                            : item.type === "vote"
                              ? "bg-orange-500/20 text-orange-400"
                              : item.type === "action"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {item.type}{" "}
                        {item.isSecret &&
                          ti({ vi: "(bí mật)", en: "(secret)" })}
                      </span>
                      <span className="text-[10px] text-white/40">
                        {ti({ vi: `Ngày ${item.day}`, en: `Day ${item.day}` })}{" "}
                        •{" "}
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-white/90 leading-tight">
                      {ti(item.content)}
                    </p>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};

// Unified Player Card - shows all status indicators consistently
const UnifiedPlayerCard: React.FC<{
  player: WerewolfPlayer;
  isMe: boolean;
  isSelected: boolean;
  canSelect: boolean;
  showRole: boolean;
  suspicionCount: number;
  voteCount: number;
  phase: GamePhase;
  isWolfTarget?: boolean;
  isProtected?: boolean;
  onViewHistory?: () => void;
  onClick?: () => void;
}> = ({
  player,
  isMe,
  isSelected,
  canSelect,
  showRole,
  suspicionCount,
  voteCount,
  phase,
  isWolfTarget,
  isProtected,
  onViewHistory,
  onClick,
}) => {
  const { ti, ts } = useLanguage();
  const roleInfo = player.role ? ROLE_INFO[player.role] : null;
  const isDead = !player.isAlive;

  return (
    <div className="relative group/card">
      <button
        onClick={onClick}
        disabled={!canSelect}
        className={`relative flex flex-col items-center p-2 rounded-xl transition-all w-[100px] min-h-[120px] border border-slate-700 ${
          isDead ? "opacity-80" : "bg-white/5"
        } ${
          isSelected
            ? "ring-2 ring-yellow-400 bg-yellow-400/20"
            : "" + (canSelect ? " hover:bg-white/10" : "")
        } ${canSelect ? "cursor-pointer" : "cursor-default"} ${
          isMe ? "ring-2 ring-blue-400" : ""
        }`}
      >
        {/* Avatar */}
        <div
          className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xl ${
            isDead
              ? "bg-gray-700"
              : "bg-gradient-to-br from-green-500 to-blue-500"
          }`}
        >
          {showRole && roleInfo ? (
            roleInfo.icon
          ) : player.isBot ? (
            <Bot className="w-5 h-5" />
          ) : (
            <User className="w-5 h-5" />
          )}

          {/* Death overlay */}
          {isDead && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full hover:opacity-10 transition-opacity">
              <Skull className="w-6 h-6 text-red-400" />
            </div>
          )}
        </div>

        {/* Name */}
        <span className="mt-1 text-xs font-medium max-w-full text-center flex items-center justify-center">
          {player.username}
          {isMe && <Star className="w-4 h-4 text-blue-400 ml-1 inline" />}
        </span>

        {/* Role badge (if visible) */}
        {showRole && roleInfo && (
          <span
            className="text-xs mt-0.5 px-1.5 py-0.5 rounded-full max-w-full"
            style={{
              backgroundColor: roleInfo.color + "30",
              color: roleInfo.color,
            }}
          >
            {ti(roleInfo.name)}
          </span>
        )}

        {/* Status bar */}
        <div className="flex flex-wrap justify-center gap-1 mt-1">
          {player.loverId && (
            <span className="text-[10px] bg-pink-500/30 text-pink-400 px-1.5 py-0.5 rounded flex items-center gap-1">
              <HeartHandshake className="w-3 h-3" />
              <span className="max-w-0 overflow-hidden opacity-0 group-hover/card:max-w-[80px] group-hover/card:opacity-100 transition-all duration-300 ease-out whitespace-nowrap">
                {ti({ vi: "Cặp đôi", en: "Lover" })}
              </span>
            </span>
          )}
          {isProtected && (
            <span className="text-[10px] bg-green-500/30 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Shield className="w-3 h-3" />
              <span className="max-w-0 overflow-hidden opacity-0 group-hover/card:max-w-[80px] group-hover/card:opacity-100 transition-all duration-300 ease-out whitespace-nowrap">
                {ti({ vi: "Được bảo vệ", en: "Protected" })}
              </span>
            </span>
          )}
          {isWolfTarget && (
            <span className="text-[10px] bg-red-500/30 text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Target className="w-3 h-3" />
              <span className="max-w-0 overflow-hidden opacity-0 group-hover/card:max-w-[100px] group-hover/card:opacity-100 transition-all duration-300 ease-out whitespace-nowrap">
                {ti({ vi: "Mục tiêu của sói", en: "Wolf target" })}
              </span>
            </span>
          )}
          {suspicionCount > 0 && (
            <span className="text-[10px] bg-red-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span className="max-w-0 overflow-hidden opacity-0 group-hover/card:max-w-[80px] group-hover/card:opacity-100 transition-all duration-300 ease-out whitespace-nowrap">
                {ti({ vi: "Bị nghi ngờ", en: "Suspicion" })}
              </span>
              {suspicionCount}
            </span>
          )}
          {voteCount > 0 && (
            <span className="text-[10px] bg-orange-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
              <ThumbsDown className="w-3 h-3" />
              <span className="max-w-0 overflow-hidden opacity-0 group-hover/card:max-w-[80px] group-hover/card:opacity-100 transition-all duration-300 ease-out whitespace-nowrap">
                {ti({ vi: "Số phiếu", en: "Vote count" })}
              </span>
              {voteCount}
            </span>
          )}
          {player.hasVoted && phase === "voting" && (
            <span className="text-[10px] bg-green-500/30 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Check className="w-3 h-3" />
              <span className="max-w-0 overflow-hidden opacity-0 group-hover/card:max-w-[60px] group-hover/card:opacity-100 transition-all duration-300 ease-out whitespace-nowrap">
                {ti({ vi: "Đã vote", en: "Voted" })}
              </span>
            </span>
          )}
        </div>
      </button>

      {/* History Button (Small info icon bottom right) */}
      {player.history.length > 0 && (
        <button
          onClick={(e) => {
            onViewHistory?.();
            e.stopPropagation();
          }}
          className="absolute -top-1 -right-1 p-1 bg-slate-600/80 rounded-full hover:bg-slate-500 transition-colors flex items-center justify-center w-6 h-6"
          title={ts({ vi: "Xem lịch sử", en: "View history" })}
        >
          {/* <Search className="w-4 h-4 text-blue-300" /> */}

          <span className="text-xs text-white/70">{player.history.length}</span>
        </button>
      )}
    </div>
  );
};

// Player Grid - always visible, shows all players with their statuses
const PlayerGrid: React.FC<{
  state: WerewolfState;
  currentUserId: string;
  selectedTargetIds: (string | null)[];
  onPlayerClick?: (playerId: string) => void;
  canSelectPlayer?: (player: WerewolfPlayer) => boolean;
  showRoles?: boolean;
}> = ({
  state,
  currentUserId,
  selectedTargetIds,
  onPlayerClick,
  canSelectPlayer,
  showRoles = false,
}) => {
  const [historyPlayer, setHistoryPlayer] = useState<WerewolfPlayer | null>(
    null,
  );

  const activePlayers = state.players.filter((p) => p.id !== null);
  const myPlayer = state.players.find((p) => p.id === currentUserId);
  const iAmWolf = myPlayer?.role === "wolf";

  const getSuspicionCount = (playerId: string) =>
    state.suspicionMarkers.filter((m) => m.toPlayerId === playerId).length;

  const getVoteCount = (playerId: string) => {
    // Show wolf votes to wolves at night
    if (state.phase === "night" && iAmWolf) {
      return state.nightActions.wolfVotes.filter((v) => v.targetId === playerId)
        .length;
    }
    // Show elimination votes during voting phases
    if (state.phase === "voting" || state.phase === "hunterRevenge") {
      return state.eliminationVotes.filter((v) => v.targetId === playerId)
        .length;
    }
    return 0;
  };

  return (
    <div className="relative flex flex-wrap justify-center gap-1 md:gap-2 md:p-2">
      {/* Player History Modal */}
      {historyPlayer && (
        <PlayerHistoryModal
          player={historyPlayer}
          onClose={() => setHistoryPlayer(null)}
        />
      )}

      {activePlayers.map((player) => {
        const canSelect = canSelectPlayer ? canSelectPlayer(player) : false;
        const isSelected = selectedTargetIds.includes(player.id);
        const isWolfTarget =
          iAmWolf && state.nightActions.wolfTarget === player.id;
        const isProtected =
          state.nightActions.bodyguardTarget === player.id &&
          (myPlayer?.role === "bodyguard" || state.phase === "end");

        return (
          <UnifiedPlayerCard
            key={player.id}
            player={player}
            isMe={player.id === currentUserId}
            isSelected={isSelected}
            canSelect={canSelect}
            showRole={
              showRoles ||
              state.phase === "end" ||
              (state.config.revealRolesOnDeath && !player.isAlive) ||
              (iAmWolf && player.role === "wolf") ||
              (myPlayer?.role === "seer" &&
                myPlayer.history.some(
                  (h) =>
                    h.type === "info" &&
                    h.content.en.startsWith("Seer Result:") &&
                    h.content.en.includes(player.username),
                ))
            }
            suspicionCount={getSuspicionCount(player.id!)}
            voteCount={getVoteCount(player.id!)}
            phase={state.phase}
            isWolfTarget={isWolfTarget}
            isProtected={isProtected}
            onViewHistory={() => {
              setHistoryPlayer(player);
            }}
            onClick={() => canSelect && player.id && onPlayerClick?.(player.id)}
          />
        );
      })}
    </div>
  );
};

// Setup Phase Component
const SetupPhase: React.FC<{
  game: Werewolf;
  state: WerewolfState;
  currentUserId: string;
  isHost: boolean;
}> = ({ game, state, currentUserId, isHost }) => {
  const { ti } = useLanguage();
  const username = useUserStore((state) => state.username);
  const [selectedRole, setSelectedRole] = useState<WerewolfRole | "">("");

  const mySlotIndex = state.players.findIndex((p) => p.id === currentUserId);
  const activeCount = state.players.filter((p) => p.id !== null).length;

  return (
    <div className="flex flex-col h-full items-center">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold flex items-center justify-center gap-2">
          <Moon className="w-6 h-6" />{" "}
          {ti({ vi: "Ma Sói Online", en: "Werewolf Online" })}
        </h2>
        <p
          className="text-white/60 text-sm pt-2"
          style={{
            color: activeCount < state.minPlayers ? "#ee5555" : "white",
          }}
        >
          {ti({ vi: "Chờ người chơi...", en: "Waiting for players..." })} (
          {activeCount}/{state.minPlayers}{" "}
          {ti({ vi: "tối thiểu", en: "minimum" })})
        </p>
      </div>

      {/* Player Slots */}
      <div className="flex flex-wrap justify-center gap-1 md:gap-2 mb-4">
        {state.players.slice(0, 12).map((player, index) => (
          <div
            key={index}
            className={`p-2 rounded-xl flex flex-col items-center justify-center w-[100px] min-h-[120px] ${
              player.id
                ? "bg-white/10"
                : "bg-white/5 border-2 border-dashed border-white/20"
            }`}
          >
            {player.id ? (
              <>
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
                  {player.isBot ? (
                    <Bot className="w-5 h-5" />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </div>
                <p className="text-sm mt-1 truncate">{player.username}</p>
                {isHost && player.id !== currentUserId && (
                  <button
                    onClick={() =>
                      player.isBot
                        ? game.requestRemoveBot(index)
                        : game.requestLeaveSlot(index)
                    }
                    className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2 py-1 rounded-lg mt-1 flex items-center justify-center gap-1"
                  >
                    <X className="w-3 h-3" /> {ti({ vi: "Xóa", en: "Remove" })}
                  </button>
                )}
              </>
            ) : (
              <div className="py-2">
                {mySlotIndex === -1 ? (
                  <button
                    onClick={() =>
                      game.requestJoinSlot(
                        index,
                        username || `Guest ${Date.now().toString().slice(-4)}`,
                      )
                    }
                    className="text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1"
                  >
                    <User className="w-3 h-3 inline" />{" "}
                    {ti({ vi: "Tham gia", en: "Join" })}
                  </button>
                ) : isHost ? (
                  <button
                    onClick={() => game.requestAddBot(index)}
                    className="text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1"
                  >
                    <Bot className="w-3 h-3" />{" "}
                    {ti({ vi: "Thêm Bot", en: "Add Bot" })}
                  </button>
                ) : (
                  <span className="text-xs text-white/40">
                    {ti({ vi: "Trống", en: "Empty" })}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Start Button */}
      {isHost && (
        <div className="w-full max-w-[300px] flex flex-col gap-2">
          {/* Role Selection for Host */}
          <div className="flex items-center gap-2 bg-white/5 p-2 rounded-lg">
            <label className="text-xs text-white/60 whitespace-nowrap">
              {ti({ vi: "Chọn vai trò:", en: "Select Role:" })}
            </label>
            <select
              value={selectedRole}
              onChange={(e) =>
                setSelectedRole(e.target.value as WerewolfRole | "")
              }
              className="flex-1 bg-white/10 text-white text-sm rounded outline-none p-1 border border-white/10"
            >
              <option value="">{ti({ vi: "Ngẫu nhiên", en: "Random" })}</option>
              {(Object.keys(ROLE_INFO) as WerewolfRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_INFO[role]?.icon} {ti(ROLE_INFO[role]?.name)}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() =>
              game.requestStartGame(
                selectedRole === "" ? undefined : selectedRole,
              )
            }
            disabled={!game.canStartGame()}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${
              game.canStartGame()
                ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                : "bg-gray-600 text-gray-400 cursor-not-allowed"
            }`}
          >
            <Play className="w-5 h-5" />{" "}
            {ti({ vi: "Bắt đầu game", en: "Start game" })}
          </button>
        </div>
      )}
    </div>
  );
};

// Night Phase Component
const NightPhase: React.FC<{
  game: Werewolf;
  state: WerewolfState;
  currentUserId: string;
  selectedTarget: string | null;
  secondSelectedTarget: string | null;
}> = ({ game, state, currentUserId, selectedTarget, secondSelectedTarget }) => {
  const { ti } = useLanguage();

  const [useHeal, setUseHeal] = useState(false);
  const [useKill, setUseKill] = useState(false);

  const myPlayer = state.players.find((p) => p.id === currentUserId);
  const myRole = myPlayer?.role;
  const isMyTurn =
    myRole === state.nightSubPhase ||
    (myRole === "wolf" && state.nightSubPhase === "wolf");

  const roleInfo = myRole ? ROLE_INFO[myRole] : null;
  const witchPotions =
    myRole === "witch" && currentUserId
      ? state.witchPotions[currentUserId]
      : null;

  const victim = state.nightActions.wolfTarget
    ? state.players.find((p) => p.id === state.nightActions.wolfTarget)
    : null;

  const target = state.players.find((p) => p.id === selectedTarget);

  const handleConfirm = () => {
    if (!myRole) return;

    if (myRole === "cupid" && selectedTarget && secondSelectedTarget) {
      game.requestNightAction(
        myRole,
        selectedTarget,
        false,
        false,
        secondSelectedTarget,
      );
    } else if (myRole === "witch") {
      game.requestNightAction(
        myRole,
        useKill ? selectedTarget : null,
        useHeal,
        useKill,
        undefined,
      );
    } else if (selectedTarget) {
      game.requestNightAction(myRole, selectedTarget, false, false, undefined);
    }
  };

  if (!myPlayer) {
    // guest user
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 pt-10">
        {ti({
          vi: "Bạn là khách, không thể tham gia hành động",
          en: "You are a guest, you cannot participate in actions",
        })}
      </div>
    );
  }

  if (!myPlayer?.isAlive) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50">
        <Skull className="w-16 h-16 mb-4" />
        <p>
          {ti({ vi: "Bạn đã chết", en: "You are dead" })}.{" "}
          {ti({
            vi: "Đang chờ đêm kết thúc...",
            en: "Waiting for night to end...",
          })}
        </p>
      </div>
    );
  }

  if (!roleInfo?.hasNightAction || !isMyTurn) {
    const lastSeerResult =
      myRole === "seer"
        ? myPlayer.history.find((h) => h.type === "info" && h.day === state.day)
        : null;

    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Moon className="w-16 h-16 text-indigo-400 mb-4 animate-pulse" />
        <p className="text-white/70 flex items-center justify-center gap-2">
          <Moon className="w-4 h-4" />{" "}
          {ti({ vi: "Làng đang ngủ", en: "Village is sleeping" })}
        </p>
        <p className="text-white/50 text-sm mt-2">
          {ti({
            vi: "Chờ các vai trò khác hành động",
            en: "Waiting for other roles to act",
          })}
          ...
        </p>
        {lastSeerResult && (
          <div className="mt-6 p-4 bg-indigo-500/20 rounded-xl border border-indigo-500/50 max-w-xs">
            <p className="text-indigo-300 font-bold mb-1 flex items-center justify-center gap-2">
              <Eye className="w-4 h-4" />
              {ti({ vi: "Kết quả soi:", en: "Seer Result:" })}
            </p>
            <p className="text-white font-medium text-center">
              {ti(lastSeerResult.content)}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-center mb-4">
        <span className="text-3xl">{roleInfo.icon}</span>
        <h3 className="text-lg font-bold" style={{ color: roleInfo.color }}>
          {ti(roleInfo.name)}
        </h3>
        <p className="text-sm text-white/60">
          {ti(roleInfo.nightActionDescription)}
        </p>
        {selectedTarget && (
          <p className="text-sm mt-2 text-yellow-400 flex items-center justify-center gap-1">
            <Target className="w-4 h-4" />{" "}
            {state.players.find((p) => p.id === selectedTarget)?.username}
            {secondSelectedTarget && (
              <span>
                {" "}
                &{" "}
                {
                  state.players.find((p) => p.id === secondSelectedTarget)
                    ?.username
                }
              </span>
            )}
          </p>
        )}
      </div>

      {/* Witch special UI */}
      {myRole === "witch" && witchPotions && (
        <div className="flex flex-col gap-2 mb-4">
          {state.nightActions.wolfTarget && (
            <div className="p-2 bg-red-500/20 rounded-lg text-center mb-1">
              <p className="text-sm text-red-200">
                {ti({ vi: "Nạn nhân đêm nay:", en: "Tonight's victim:" })}{" "}
                <span className="font-bold">{victim?.username}</span>
              </p>
            </div>
          )}
          <div className="flex gap-2">
            {witchPotions.hasHealPotion && state.nightActions.wolfTarget && (
              <button
                onClick={() => {
                  setUseHeal(!useHeal);
                  if (!useHeal) {
                    setUseKill(false);
                  }
                }}
                className={`flex-1 p-3 rounded-xl flex flex-col items-center transition-all ${
                  useHeal
                    ? "bg-green-500/30 ring-2 ring-green-400"
                    : "bg-white/10 hover:bg-white/30"
                }`}
              >
                <Heart className="w-6 h-6 text-green-400" />
                <span className="text-xs mt-1">
                  {ti({ vi: "Cứu nạn nhân", en: "Heal victim" })}:{" "}
                  {victim?.username}
                </span>
              </button>
            )}
            {witchPotions.hasKillPotion && (
              <button
                onClick={() => {
                  setUseKill(!useKill);
                  if (!useKill) {
                    setUseHeal(false);
                  }
                }}
                disabled={!selectedTarget}
                className={`flex-1 p-3 rounded-xl flex flex-col items-center transition-all ${
                  useKill
                    ? "bg-red-500/30 ring-2 ring-red-400"
                    : selectedTarget
                      ? "bg-white/10 hover:bg-white/30"
                      : "bg-slate-500/10 cursor-not-allowed"
                }`}
              >
                <Skull className="w-6 h-6 text-red-400" />
                <span className="text-xs mt-1">
                  {ti({ vi: "Giết người được chọn", en: "Kill selected" })}:{" "}
                  {target?.username ||
                    ti({ vi: "[Chưa chọn]", en: "[Please select]" })}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={
          myRole === "cupid"
            ? !selectedTarget || !secondSelectedTarget
            : myRole !== "witch" && !selectedTarget
        }
        className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Check className="w-5 h-5 inline mr-2" />
        {ti({ vi: "Xác nhận", en: "Confirm" })}
      </button>
    </div>
  );
};

// Discussion Phase Component
const DiscussionPhase: React.FC<{
  game: Werewolf;
  state: WerewolfState;
  currentUserId: string;
  selectedTarget: string | null;
}> = ({ game, state, currentUserId, selectedTarget }) => {
  const [message, setMessage] = useState("");
  const [showQuickMessages, setShowQuickMessages] = useState(false);
  const { ti, ts } = useLanguage();

  const myPlayer = state.players.find((p) => p.id === currentUserId);
  const targetPlayer = state.players.find((p) => p.id === selectedTarget);

  const handleSendMessage = () => {
    if (!message.trim() || !myPlayer?.isAlive) return;
    game.requestSendMessage(message.trim(), "text");
    setMessage("");
  };

  const handleQuickMessage = (qm: (typeof QUICK_MESSAGES)[0]) => {
    if (!myPlayer?.isAlive) return;
    if (qm.targetRequired && !selectedTarget) return;

    const content =
      qm.targetRequired && selectedTarget
        ? ts(qm.text).replace(
            "{target}",
            state.players.find((p) => p.id === selectedTarget)?.username || "",
          )
        : ts(qm.text);

    game.requestSendMessage(
      content,
      "quick",
      selectedTarget || undefined,
      qm.id,
    );
  };

  const alreadySuspected = state.suspicionMarkers.some(
    (m) => m.fromPlayerId === currentUserId && m.toPlayerId === selectedTarget,
  );

  return (
    <div className="flex flex-col h-full p-2">
      {/* Selected target indicator */}
      {selectedTarget && (
        <div className="text-center mb-2 text-sm text-yellow-400 flex items-center justify-center gap-1">
          <Pointer className="w-4 h-4" />{" "}
          {ti({ vi: "Đang chọn:", en: "Selected:" })}{" "}
          {state.players.find((p) => p.id === selectedTarget)?.username}
        </div>
      )}

      {/* Suspicion button */}
      {selectedTarget && myPlayer?.isAlive && (
        <button
          onClick={() => game.requestAddSuspicion(selectedTarget)}
          className={`w-full mb-2 py-2 rounded-lg text-sm transition-colors ${
            alreadySuspected
              ? "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"
              : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          }`}
        >
          <Info className="w-4 h-4 inline mr-1" />
          {alreadySuspected
            ? ti({ vi: "Bỏ nghi ngờ", en: "Unsuspect" })
            : ti({ vi: "Nghi ngờ", en: "Suspect" })}{" "}
          {targetPlayer?.username}
        </button>
      )}

      {/* Quick messages */}
      <button
        onClick={() => setShowQuickMessages(!showQuickMessages)}
        className="flex items-center justify-between w-full p-2 bg-white/5 rounded-lg mb-2 text-sm"
      >
        <span className="flex items-center gap-1">
          <MessageSquare className="w-4 h-4" />{" "}
          {ti({ vi: "Tin nhắn nhanh", en: "Quick messages" })}
        </span>
        {showQuickMessages ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {showQuickMessages && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          {QUICK_MESSAGES.map((qm) => (
            <button
              key={qm.id}
              onClick={() => handleQuickMessage(qm)}
              disabled={qm.targetRequired && !selectedTarget}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-left flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="text-lg">{qm.icon}</span>
              <span className="">
                {qm.targetRequired
                  ? ts(qm.text).replace(
                      "{target}",
                      selectedTarget
                        ? state.players.find((p) => p.id === selectedTarget)
                            ?.username || "..."
                        : ts({ vi: "[chọn người]", en: "[select]" }),
                    )
                  : ts(qm.text)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-auto bg-black/20 rounded-lg p-2 mb-2 min-h-[100px] max-h-[200px]">
        {state.chatMessages.slice(-20).map((msg) => (
          <div key={msg.id} className="mb-1 text-sm text-left">
            <span className="font-medium text-blue-400">{msg.playerName}:</span>{" "}
            <span className="text-white/80">{msg.content}</span>
          </div>
        ))}
      </div>

      {/* Input */}
      {myPlayer?.isAlive && (myPlayer.messagesRemaining || 0) > 0 && (
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 100))}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder={ts({
              vi: `Nhập tin nhắn... (${myPlayer.messagesRemaining}/${DEFAULT_CONFIG.chatLimit})`,
              en: `Type message... (${myPlayer.messagesRemaining}/${DEFAULT_CONFIG.chatLimit})`,
            })}
            className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={handleSendMessage}
            className="p-2 bg-blue-500 rounded-lg"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

// Voting Phase Component
const VotingPhase: React.FC<{
  game: Werewolf;
  state: WerewolfState;
  currentUserId: string;
  selectedTarget: string | null;
}> = ({ game, state, currentUserId, selectedTarget }) => {
  const { ti } = useLanguage();

  const myPlayer = state.players.find((p) => p.id === currentUserId);

  // Hunter revenge logic
  const isHunterRevenge = state.phase === "hunterRevenge";
  const isHunterTurn =
    isHunterRevenge &&
    myPlayer?.role === "hunter" &&
    state.pendingElimination === myPlayer.id; // pendingElimination reused for active hunter ID

  if (isHunterRevenge && !isHunterTurn) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Target className="w-16 h-16 text-red-500 mb-4 animate-pulse" />
        <p className="text-white/70 text-center">
          {ti({
            vi: "Thợ săn đang tìm mục tiêu...",
            en: "Hunter is choosing a target...",
          })}
        </p>
      </div>
    );
  }

  // Hide controls if already voted (or shot in hunter case)
  if (myPlayer?.hasVoted) {
    const myVote = state.eliminationVotes?.find(
      (v) => v.voterId === currentUserId,
    );
    const votedTarget = myVote?.targetId
      ? state.players.find((p) => p.id === myVote.targetId)
      : null;

    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Check className="w-16 h-16 text-green-400 mb-4" />
        <p className="text-white/70">
          {isHunterRevenge
            ? ti({ vi: "Đã bắn!", en: "Shot fired!" })
            : ti({
                vi: "Đã bình chọn! Đang chờ người khác...",
                en: "Voted! Waiting for others...",
              })}
        </p>
        {votedTarget && !isHunterRevenge && (
          <p className="text-yellow-400 mt-2 text-sm font-medium">
            {ti({
              vi: `Bạn đã chọn: ${votedTarget.username}`,
              en: `You voted for: ${votedTarget.username}`,
            })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-center mb-4">
        {isHunterRevenge ? (
          <Target className="w-10 h-10 mx-auto text-red-500 mb-2" />
        ) : (
          <ThumbsDown className="w-10 h-10 mx-auto text-orange-400 mb-2" />
        )}
        <h3 className="text-lg font-bold">
          {isHunterRevenge
            ? ti({ vi: "Kéo ai đi cùng?", en: "Who to take with you?" })
            : ti({ vi: "Bình chọn loại ai?", en: "Who do you vote?" })}
        </h3>
        {selectedTarget && (
          <p className="text-sm mt-2 text-yellow-400 flex items-center justify-center gap-1">
            <Target className="w-4 h-4" />{" "}
            {state.players.find((p) => p.id === selectedTarget)?.username}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            if (isHunterRevenge) {
              // Skip shooting
              game.requestHunterShoot("");
            } else {
              game.requestCastVote(null);
            }
          }}
          className="flex-1 py-3 bg-gray-600 rounded-xl font-bold"
        >
          {ti({ vi: "Bỏ qua", en: "Skip" })}
        </button>
        <button
          onClick={() => {
            if (isHunterRevenge) {
              if (selectedTarget) game.requestHunterShoot(selectedTarget);
            } else {
              if (selectedTarget) game.requestCastVote(selectedTarget);
            }
          }}
          disabled={!selectedTarget}
          className={`flex-1 py-3 rounded-xl font-bold disabled:opacity-50 ${
            isHunterRevenge
              ? "bg-gradient-to-r from-red-600 to-red-800"
              : "bg-gradient-to-r from-orange-500 to-red-500"
          }`}
        >
          {isHunterRevenge
            ? ti({ vi: "Bắn!", en: "Shoot!" })
            : ti({ vi: "Bình chọn", en: "Vote" })}
        </button>
      </div>
    </div>
  );
};

// Game End Component
const GameEnd: React.FC<{
  game: Werewolf;
  state: WerewolfState;
  showResetButton?: boolean;
}> = ({ game, state, showResetButton }) => {
  const { ts } = useLanguage();

  const winnerLabel =
    state.winner === "wolf"
      ? ts({ vi: "Ma Sói thắng!", en: "Wolf wins!" })
      : state.winner === "village"
        ? ts({ vi: "Dân Làng thắng!", en: "Village wins!" })
        : ts({ vi: "Tình Nhân thắng!", en: "Lover wins!" });

  const WinnerIcon =
    state.winner === "wolf"
      ? Skull
      : state.winner === "village"
        ? Home
        : HeartHandshake;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-xl font-bold flex items-center justify-center gap-2">
        <WinnerIcon className="w-8 h-8" /> {winnerLabel}
      </h2>

      {showResetButton && (
        <button
          onClick={() => game.requestResetGame()}
          className="mt-4 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl font-bold flex items-center gap-2"
        >
          <RotateCcw className="w-5 h-5" /> Chơi lại
        </button>
      )}
    </div>
  );
};

// Main Component
const WerewolfUI: React.FC<GameUIProps> = ({ game, currentUserId = "" }) => {
  const { confirm: showConfirm } = useAlertStore();
  const { ti, ts } = useLanguage();

  const werewolf = game as Werewolf;
  const [state, setState] = useState<WerewolfState>(werewolf.getState());
  const [showRules, setShowRules] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [secondSelectedTarget, setSecondSelectedTarget] = useState<
    string | null
  >(null);

  // Sticky Header State
  const [isHeaderFixed, setIsHeaderFixed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderFixed(
          !entry.isIntersecting && entry.boundingClientRect.top < 0,
        );
      },
      { threshold: 0 },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [state.isGameStarted]);

  // Background animation state
  const [currentBg, setCurrentBg] = useState("");
  const [animatingBg, setAnimatingBg] = useState<string | null>(null);

  const myPlayer = state.players.find((p) => p.id === currentUserId);
  const myRole = myPlayer?.role ? ROLE_INFO[myPlayer.role] : null;

  useEffect(() => {
    return werewolf.onUpdate(setState);
  }, [werewolf]);

  // Reset selection when phase changes
  useEffect(() => {
    setSelectedTarget(null);
    setSecondSelectedTarget(null);
  }, [state.phase, state.nightSubPhase]);

  // Handle background transition
  useEffect(() => {
    const targetBg = getPhaseBackground(state.phase);
    if (currentBg === "") {
      setCurrentBg(targetBg);
    } else if (targetBg !== currentBg && targetBg !== animatingBg) {
      setAnimatingBg(targetBg);
    }
  }, [state.phase]);

  const renderPhase = () => {
    switch (state.phase) {
      case "setup":
        return (
          <SetupPhase
            game={werewolf}
            state={state}
            currentUserId={currentUserId}
            isHost={werewolf.isHost}
          />
        );
      case "night":
        return (
          <NightPhase
            game={werewolf}
            state={state}
            currentUserId={currentUserId}
            selectedTarget={selectedTarget}
            secondSelectedTarget={secondSelectedTarget}
          />
        );
      case "morning":
      case "elimination":
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <Sun className="w-16 h-16 text-yellow-400 mb-4" />
            {state.logs.slice(-3).map((log) => (
              <p key={log.id} className="text-center mb-2">
                {ti(log.message)}
              </p>
            ))}
            {/* Seer Result */}
            {state.phase === "morning" &&
              myPlayer?.role === "seer" &&
              state.nightResult?.seerCheck && (
                <div className="mt-4 p-4 bg-indigo-500/20 rounded-xl border border-indigo-500/50">
                  <p className="text-center text-indigo-300 font-bold mb-1">
                    {ti({ vi: "Kết quả soi:", en: "Seer Result:" })}
                  </p>
                  <p className="text-center">
                    <span className="font-bold text-white">
                      {
                        state.players.find(
                          (p) =>
                            p.id === state.nightResult?.seerCheck?.targetId,
                        )?.username
                      }
                    </span>{" "}
                    {state.nightResult.seerCheck.isWolf ? (
                      <span className="text-red-400 font-bold">
                        {ti({ vi: "là MA SÓI!", en: "is a WEREWOLF!" })}
                      </span>
                    ) : (
                      <span className="text-green-400 font-bold">
                        {ti({ vi: "là Dân Làng", en: "is a Villager" })}
                      </span>
                    )}
                  </p>
                </div>
              )}
          </div>
        );
      case "discussion":
        return (
          <DiscussionPhase
            game={werewolf}
            state={state}
            currentUserId={currentUserId}
            selectedTarget={selectedTarget}
          />
        );
      case "voting":
      case "hunterRevenge":
        return (
          <VotingPhase
            game={werewolf}
            state={state}
            currentUserId={currentUserId}
            selectedTarget={selectedTarget}
          />
        );
      case "end":
        return (
          <GameEnd
            game={werewolf}
            state={state}
            showResetButton={werewolf.isHost}
          />
        );
      default:
        return null;
    }
  };

  const renderHeader = (fixed: boolean) => (
    <div
      className={`${
        fixed
          ? "fixed top-0 left-0 right-0 z-[100] bg-slate-900/95 backdrop-blur-md border-b border-white/10 py-2 animate-in slide-in-from-top duration-300 shadow-2xl"
          : "mb-3"
      } flex justify-center w-full`}
    >
      <div
        className={`flex justify-between w-full max-w-[450px] ${
          fixed
            ? "px-4"
            : "bg-slate-900/60 backdrop-blur-md p-2 px-4 rounded-xl border border-white/10 shadow-lg"
        }`}
      >
        <div className="flex items-center gap-2">
          {getPhaseIcon(state.phase)}
          <div className="flex flex-col md:flex-row md:items-center md:gap-2">
            <span className="font-bold">{ti(getPhaseLabel(state.phase))}</span>
            {state.day > 0 && (
              <span className="text-white/60 text-sm">
                {ti({ vi: "Ngày", en: "Day" })} {state.day}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {state.phase !== "end" ? (
            <TimerDisplay
              endTime={state.phaseEndTime}
              isPaused={state.isPaused}
              pausedTimeRemaining={state.pausedTimeRemaining}
            />
          ) : (
            <GameEnd game={werewolf} state={state} showResetButton={false} />
          )}
          {werewolf.isHost && state.phase !== "end" && (
            <>
              {/* Play/Pause btn */}
              <button
                onClick={() =>
                  state.isPaused
                    ? werewolf.requestResumeGame()
                    : werewolf.requestPauseGame()
                }
                className={`p-2 rounded-full transition-colors ${
                  state.isPaused
                    ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
                title={state.isPaused ? "Resume" : "Pause"}
              >
                {state.isPaused ? (
                  <Play className="w-5 h-5" />
                ) : (
                  <Pause className="w-5 h-5" />
                )}
              </button>
              {/* Skip btn */}
              <button
                onClick={async () => {
                  if (
                    await showConfirm(
                      ts({
                        vi: "Đếm ngược sẽ được đặt về 5 giây",
                        en: "The countdown will be reset to 5 seconds",
                      }),
                      ts({
                        vi: "Tăng tốc giai đoạn?",
                        en: "Skip phase?",
                      }),
                    )
                  ) {
                    werewolf.requestSkipPhase();
                  }
                }}
                className="p-2 rounded-full transition-colors bg-white/10 text-white/60 hover:bg-white/20"
                title="Skip"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderHistoryModal = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-lg w-full h-[80vh] max-h-[90%] overflow-hidden shadow-2xl flex flex-col">
        {/* Header matching PlayerHistoryModal */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-bold text-base">
              <History className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                {ti({ en: "Game History", vi: "Lịch sử ván đấu" })}
              </h3>
              <p className="text-[10px] text-white/60">
                {ti({ vi: "Nhật ký trò chơi", en: "Game Log" })}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowHistory(false)}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-2">
          <GameHistoryPanel state={state} currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );

  const renderGameRules = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl relative">
        <button
          onClick={() => setShowRules(false)}
          className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-yellow-500" />
            {ti({ en: "Werewolf Rules", vi: "Luật Ma Sói" })}
          </h2>

          <div className="space-y-4 text-slate-300 leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Objective", vi: "Mục tiêu" })}
              </h3>
              <ul className="space-y-2 list-disc pl-4 text-sm">
                <li>
                  <strong className="text-red-400">
                    🐺 {ti({ en: "Werewolves", vi: "Ma Sói" })}
                  </strong>
                  :{" "}
                  {ti({
                    en: "Kill villagers until wolves equal villagers.",
                    vi: "Giết dân làng cho đến khi số sói bằng số dân.",
                  })}
                </li>
                <li>
                  <strong className="text-blue-400">
                    👤 {ti({ en: "Villagers", vi: "Dân Làng" })}
                  </strong>
                  :{" "}
                  {ti({
                    en: "Find and eliminate all wolves.",
                    vi: "Tìm và loại bỏ tất cả ma sói.",
                  })}
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Roles", vi: "Vai Trò" })}
              </h3>
              <ul className="space-y-2 list-disc pl-4 text-sm">
                <li>
                  <strong>🔮 {ti({ en: "Seer", vi: "Tiên Tri" })}</strong>:{" "}
                  {ti({
                    en: "Check one player's role each night.",
                    vi: "Soi vai trò của một người chơi mỗi đêm.",
                  })}
                </li>
                <li>
                  <strong>🛡️ {ti({ en: "Bodyguard", vi: "Bảo Vệ" })}</strong>:{" "}
                  {ti({
                    en: "Protect one player from wolves each night.",
                    vi: "Bảo vệ một người khỏi sói mỗi đêm.",
                  })}
                </li>
                <li>
                  <strong>🧙 {ti({ en: "Witch", vi: "Phù Thủy" })}</strong>:{" "}
                  {ti({
                    en: "Has one healing potion and one killing potion.",
                    vi: "Có một bình thuốc cứu và một bình thuốc độc.",
                  })}
                </li>
                <li>
                  <strong>🏹 {ti({ en: "Hunter", vi: "Thợ Săn" })}</strong>:{" "}
                  {ti({
                    en: "Can shoot one person when dying.",
                    vi: "Có thể bắn một người khi chết.",
                  })}
                </li>
                <li>
                  <strong>💘 {ti({ en: "Cupid", vi: "Thần Tình Yêu" })}</strong>
                  :{" "}
                  {ti({
                    en: "Links two lovers. If one dies, the other follows.",
                    vi: "Kết đôi hai người. Nếu một người chết, người kia chết theo.",
                  })}
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-yellow-400 mt-4">
                {ti({ en: "Phases", vi: "Giai Đoạn" })}
              </h3>
              <ul className="space-y-2 list-disc pl-4 text-sm">
                <li>
                  <strong>🌙 {ti({ en: "Night", vi: "Đêm" })}</strong>:{" "}
                  {ti({
                    en: "Special roles wake up and perform actions.",
                    vi: "Các vai trò đặc biệt thức dậy và hành động.",
                  })}
                </li>
                <li>
                  <strong>☀️ {ti({ en: "Morning", vi: "Sáng" })}</strong>:{" "}
                  {ti({
                    en: "Announce who died last night.",
                    vi: "Thông báo ai đã chết đêm qua.",
                  })}
                </li>
                <li>
                  <strong>
                    💬 {ti({ en: "Discussion", vi: "Thảo Luận" })}
                  </strong>
                  :{" "}
                  {ti({
                    en: "Players discuss to find the wolves.",
                    vi: "Người chơi thảo luận để tìm ra sói.",
                  })}
                </li>
                <li>
                  <strong>👎 {ti({ en: "Voting", vi: "Bình Chọn" })}</strong>:{" "}
                  {ti({
                    en: "Vote to eliminate one suspect.",
                    vi: "Bình chọn để treo cổ một kẻ tình nghi.",
                  })}
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`relative flex flex-col h-full ${currentBg} rounded-lg text-white overflow-hidden`}
    >
      {showRules && renderGameRules()}

      {/* Background Animation Curtain */}
      {animatingBg && (
        <div
          className={`absolute inset-0 ${animatingBg} animate-slide-in z-0`}
          onAnimationEnd={() => {
            setCurrentBg(animatingBg);
            setAnimatingBg(null);
          }}
        />
      )}

      {/* Main Content - Raise z-index to sit above potential background animation */}
      <div className="relative z-10 flex flex-col h-full w-full pb-20 overflow-y-auto min-h-[500px] pt-2">
        {/* Moon/Sun icon top-left */}
        {state.phase === "night" ? (
          <MoonStar className="w-16 h-16 text-white absolute top-4 left-4 z-[-1]" />
        ) : state.phase == "voting" ? (
          <ThumbsDown className="w-16 h-16 text-yellow-500 absolute top-4 left-4 z-[-1]" />
        ) : state.phase != "setup" ? (
          <Sun className="w-16 h-16 text-yellow-500 absolute top-4 left-4 z-[-1]" />
        ) : null}

        {/* Header */}
        <div className="flex items-center gap-2 w-full justify-center">
          {/* New Game button for host */}
          {werewolf.isHost && state.isGameStarted && (
            <button
              onClick={async () => {
                if (
                  await showConfirm(
                    ts({
                      vi: "Bạn có chắc chắn muốn chơi lại ván này?",
                      en: "Are you sure you want to reset this game?",
                    }),
                    ts({
                      vi: "Chơi lại",
                      en: "Play again",
                    }),
                  )
                ) {
                  werewolf.requestResetGame();
                }
              }}
              className="p-2 bg-slate-500/20 text-slate-400 hover:bg-slate-500/30 rounded-lg text-xs flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />{" "}
              {ti({ vi: "Ván mới", en: "New Game" })}
            </button>
          )}
        </div>

        {/* Role Display - Centered, prominent */}
        {state.isGameStarted && myRole && (
          <div className="flex flex-col items-center justify-center gap-4 mb-3 py-2">
            <div
              className="px-4 py-2 rounded-xl flex flex-col items-center gap-2"
              style={{
                backgroundColor: myRole.color + "30",
                // color: myRole.color,
                border: `2px solid ${myRole.color}`,
              }}
            >
              <span className="text-sm text-white/60">
                {ti({ en: "You are", vi: "Bạn là:" })}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{myRole.icon}</span>
                <span
                  className="font-bold text-lg"
                  style={{ color: myRole.color }}
                >
                  {ti(myRole.name)}
                </span>
              </div>
              <span className="text-sm text-white/60">
                {ti(myRole.description)}
              </span>
            </div>
          </div>
        )}

        {/* Sticky Phase/Timer Header */}
        {state.isGameStarted && (
          <>
            <div
              ref={sentinelRef}
              className="w-full h-px -mt-2 pointer-events-none"
            />
            {isHeaderFixed && createPortal(renderHeader(true), document.body)}
            {renderHeader(false)}
            {/* {isHeaderFixed && <div className="w-full h-[80px] mb-3" />} */}
          </>
        )}

        {/* Persistent Player Grid - always visible when game started */}
        {state.isGameStarted && state.phase !== "setup" && (
          <PlayerGrid
            state={state}
            currentUserId={currentUserId}
            selectedTargetIds={[selectedTarget, secondSelectedTarget]}
            showRoles={state.phase === "end"}
            canSelectPlayer={(player) => {
              const myPlayer = state.players.find(
                (p) => p.id === currentUserId,
              );

              const isHunterRevenge =
                state.phase === "hunterRevenge" &&
                myPlayer?.role === "hunter" &&
                state.pendingElimination === myPlayer.id;

              if (!myPlayer?.isAlive && !isHunterRevenge) return false;

              if (!player.isAlive && state.phase !== "night") return false;
              if (state.phase === "night") {
                // Night phase selection logic
                if (myPlayer?.role === "cupid") return player.isAlive;
                if (myPlayer?.role === "seer")
                  return player.id !== currentUserId && player.isAlive;
                if (myPlayer?.role === "bodyguard")
                  return (
                    player.isAlive &&
                    player.id !== state.nightActions.lastBodyguardTarget
                  );
                if (myPlayer?.role === "wolf") return player.isAlive;
                if (myPlayer?.role === "witch") return player.isAlive;
                return false;
              }
              if (
                state.phase === "discussion" ||
                state.phase === "voting" ||
                state.phase === "hunterRevenge"
              ) {
                // If voted, disable selection
                if (
                  (state.phase === "voting" ||
                    state.phase === "hunterRevenge") &&
                  myPlayer?.hasVoted
                )
                  return false;

                return player.isAlive && player.id !== currentUserId;
              }
              return false;
            }}
            onPlayerClick={(playerId) => {
              const myPlayer = state.players.find(
                (p) => p.id === currentUserId,
              );
              // Cupid selects 2 targets
              if (state.phase === "night" && myPlayer?.role === "cupid") {
                if (!selectedTarget) {
                  setSelectedTarget(playerId);
                } else if (selectedTarget === playerId) {
                  setSelectedTarget(null);
                } else if (!secondSelectedTarget) {
                  setSecondSelectedTarget(playerId);
                } else if (secondSelectedTarget === playerId) {
                  setSecondSelectedTarget(null);
                }
              } else {
                // Toggle selection
                setSelectedTarget(
                  selectedTarget === playerId ? null : playerId,
                );
              }
            }}
          />
        )}

        {/* Main content */}
        <div className="flex-1">{renderPhase()}</div>
      </div>

      {/* History Button - Replaces inline panel */}
      {state.isGameStarted && (
        <button
          onClick={() => setShowHistory(true)}
          className="fixed bottom-4 left-4 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-blue-400 transition-colors z-40 shadow-lg border border-slate-500"
          title={ts({ en: "History", vi: "Lịch sử" })}
        >
          <History size={24} />
        </button>
      )}

      {showHistory && renderHistoryModal()}

      {/* Rules Button */}
      {showRules && renderGameRules()}
      <button
        onClick={() => setShowRules(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-700 hover:bg-slate-600 rounded-full text-yellow-500 transition-colors z-40 shadow-lg border border-slate-500"
        title={ts({ en: "Game Rules", vi: "Luật chơi" })}
      >
        <BookOpen size={24} />
      </button>
    </div>
  );
};

export default WerewolfUI;
