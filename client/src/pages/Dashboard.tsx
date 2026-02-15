import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Clock,
  RefreshCw,
  TrendingUp,
  Database,
  CheckCircle,
  Trash2,
  Lock,
  RotateCcw,
  Server,
  BarChart2,
  Key,
  AlertTriangle,
  Activity,
  Users,
  Search,
  Layout,
  ExternalLink,
  MessageSquare,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { getServerUrl } from "../services/socket";
import { formatTimeAgo } from "../utils";
import { Link } from "react-router-dom";

interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
  type: "system" | "user";
  gameType?: string;
  reports?: string[];
  isDeleted?: boolean;
}

interface DashboardData {
  server: {
    online: number;
    uptime: string;
    startTime: string;
    // @ts-ignore
    memory: NodeJS.MemoryUsage;
  };
  rooms: {
    id: string;
    name: string;
    gameType: string;
    playerCount: number;
    spectatorCount: number;
    isPublic: boolean;
    password?: string;
    createdAt: string;
    ownerId: string;
  }[];
  stats: {
    plays: Record<string, number>;
    dataTransfer: Record<string, number>;
    daily: Record<
      string,
      {
        plays: Record<string, number>;
        dataTransfer: Record<string, number>;
      }
    >;
  };
  chats: {
    totalMessages: number;
    messagesByDate: Record<string, number>;
    messagesByRoom: Record<string, number>;
    messagesByUser: Record<string, number>;
    rooms: Record<string, { lastMessage: ChatMessage; count: number }>;
    lastSynced: string;
  };
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("dashboard_token"),
  );
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  // Daily Stats State
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>("");

  // Security State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [selectedMessengerRoom, setSelectedMessengerRoom] = useState<
    string | null
  >(null);
  const [securityMessage, setSecurityMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [analyticsRange, setAnalyticsRange] = useState<
    "today" | "yesterday" | "7d" | "14d" | "30d" | "all"
  >("7d");

  const [gameStatsSort, setGameStatsSort] = useState<{
    key: "game" | "plays" | "dataTransfer";
    direction: "asc" | "desc";
  }>({ key: "plays", direction: "desc" });

  const [activeTab, setActiveTab] = useState<
    "overview" | "rooms" | "messenger" | "moderation" | "security"
  >("overview");

  const [reportedMessages, setReportedMessages] = useState<ChatMessage[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const [roomMessages, setRoomMessages] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [loadingMessages, setLoadingMessages] = useState<
    Record<string, boolean>
  >({});
  const [messengerSearch, setMessengerSearch] = useState("");
  const [chatSortMode, setChatSortMode] = useState<"recent" | "count">(
    "recent",
  );
  const [moderationSubTab, setModerationSubTab] = useState<
    "reported" | "deleted"
  >("reported");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const baseUrl = getServerUrl();
      const response = await fetch(`${baseUrl}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await response.json();
      if (response.ok) {
        setToken(json.token);
        localStorage.setItem("dashboard_token", json.token);
      } else {
        setLoginError(json.error || "Login failed");
      }
    } catch (err) {
      setLoginError("Connection failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("dashboard_token");
    setData(null);
  };

  const fetchData = async () => {
    if (!token) return;
    try {
      const baseUrl = getServerUrl();
      const response = await fetch(`${baseUrl}/api/admin/dashboard-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch dashboard data");
      const json = await response.json();
      setData(json);
      if (json.stats?.daily && !selectedDailyDate) {
        const dates = Object.keys(json.stats.daily).sort().reverse();
        if (dates.length > 0) {
          setSelectedDailyDate(dates[0]);
        }
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Connection to server failed. Retrying...");
    } finally {
      setLoading(false);
    }
  };

  const fetchRoomMessages = async (roomId: string) => {
    if (!token || !roomId) return;
    setLoadingMessages((prev) => ({ ...prev, [roomId]: true }));
    try {
      const baseUrl = getServerUrl();
      const response = await fetch(
        `${baseUrl}/api/admin/logs/recent-messages?roomId=${roomId}&limit=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error("Failed to fetch messages");
      const messages = await response.json();
      setRoomMessages((prev) => ({ ...prev, [roomId]: messages }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMessages((prev) => ({ ...prev, [roomId]: false }));
    }
  };

  const fetchModerationReports = async () => {
    if (!token) return;
    setLoadingReports(true);
    try {
      const baseUrl = getServerUrl();
      const response = await fetch(`${baseUrl}/api/admin/moderation/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch reports");
      const messages = await response.json();
      setReportedMessages(messages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  const handleModerationAction = async (messageId: string, action: string) => {
    if (!token) return;
    try {
      const baseUrl = getServerUrl();
      const response = await fetch(`${baseUrl}/api/admin/moderation/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageId, action }),
      });
      if (response.ok) {
        fetchModerationReports();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sortedRooms = useMemo(() => {
    if (!data?.chats.rooms) return [];
    return Object.keys(data.chats.rooms).sort((a, b) => {
      if (chatSortMode === "count") {
        return data.chats.rooms[b].count - data.chats.rooms[a].count;
      }
      const lastA = data.chats.rooms[a].lastMessage.timestamp;
      const lastB = data.chats.rooms[b].lastMessage.timestamp;
      return lastB - lastA;
    });
  }, [data?.chats.rooms, chatSortMode]);

  const filteredRooms = useMemo(() => {
    if (!messengerSearch.trim()) return sortedRooms;
    const term = messengerSearch.toLowerCase();
    return sortedRooms.filter((roomId) => {
      const isGlobalMatch = roomId === "global" && "global chat".includes(term);
      return roomId.toLowerCase().includes(term) || isGlobalMatch;
    });
  }, [sortedRooms, messengerSearch]);

  useEffect(() => {
    if (sortedRooms.length > 0 && !selectedMessengerRoom) {
      setSelectedMessengerRoom(sortedRooms[0]);
    }
  }, [sortedRooms]);

  useEffect(() => {
    if (selectedMessengerRoom && !roomMessages[selectedMessengerRoom]) {
      fetchRoomMessages(selectedMessengerRoom);
    }
  }, [selectedMessengerRoom]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setSecurityMessage({
        type: "error",
        text: "New password must be at least 6 characters",
      });
      return;
    }
    setIsChangingPassword(true);
    setSecurityMessage(null);
    try {
      const baseUrl = getServerUrl();
      const response = await fetch(`${baseUrl}/api/admin/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await response.json();
      if (response.ok) {
        setSecurityMessage({
          type: "success",
          text: "Password updated successfully! Redirecting...",
        });
        setCurrentPassword("");
        setNewPassword("");
        // Update local token and current session password if needed
        // Since the token IS the password in this simple implementation:
        setTimeout(() => {
          setToken(null);
          localStorage.removeItem("dashboard_token");
          setSecurityMessage(null);
        }, 2000);
      } else {
        setSecurityMessage({
          type: "error",
          text: json.error || "Update failed",
        });
      }
    } catch (err) {
      setSecurityMessage({ type: "error", text: "Connection failed" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
      fetchModerationReports();
    }
  }, [token]);

  const filteredDailyData = useMemo(() => {
    if (!data?.stats.daily) return {};
    if (analyticsRange === "all") return data.stats.daily;

    const now = new Date();
    let startDate: Date;

    if (analyticsRange === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (analyticsRange === "yesterday") {
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
      );
      const endDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      return Object.fromEntries(
        Object.entries(data.stats.daily).filter(([date]) => {
          const d = new Date(date);
          return d >= startDate && d < endDate;
        }),
      );
    } else {
      const days = parseInt(analyticsRange);
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - days,
      );
    }

    return Object.fromEntries(
      Object.entries(data.stats.daily).filter(
        ([date]) => new Date(date) >= startDate,
      ),
    );
  }, [data?.stats.daily, analyticsRange]);

  const aggregatedGameStats = useMemo(() => {
    const stats: Record<string, { plays: number; dataTransfer: number }> = {};

    Object.values(filteredDailyData).forEach((day) => {
      Object.entries(day.plays).forEach(([game, count]) => {
        if (!stats[game]) stats[game] = { plays: 0, dataTransfer: 0 };
        stats[game].plays += count;
      });
      Object.entries(day.dataTransfer).forEach(([game, bytes]) => {
        if (!stats[game]) stats[game] = { plays: 0, dataTransfer: 0 };
        stats[game].dataTransfer += bytes;
      });
    });

    return Object.entries(stats).sort(([gameA, statsA], [gameB, statsB]) => {
      const { key, direction } = gameStatsSort;
      let comparison = 0;

      if (key === "game") {
        comparison = gameA.localeCompare(gameB);
      } else {
        comparison = (statsA as any)[key] - (statsB as any)[key];
      }

      return direction === "asc" ? comparison : -comparison;
    });
  }, [filteredDailyData, gameStatsSort]);

  // Login Screen
  if (!token) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-background-secondary/50 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="p-4 bg-primary/20 rounded-2xl text-primary mb-4">
              <Server className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-text-muted text-sm mt-1">
              Please enter your credentials
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted ml-1">
                Password
              </label>
              <div className="relative">
                <Database className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  autoFocus
                />
              </div>
            </div>

            {loginError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center"
              >
                {loginError}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {isLoggingIn ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                "Access Dashboard"
              )}
            </button>

            <Link
              to="/"
              className="block text-center text-xs text-text-muted hover:text-white transition-colors"
            >
              Back to Lobby
            </Link>
          </form>
        </motion.div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-text-secondary animate-pulse">
            Initializing Dashboard...
          </p>
        </div>
      </div>
    );
  }

  // Safe checks for data mapping
  const sortedUsers = data?.chats?.messagesByUser
    ? Object.entries(data.chats.messagesByUser)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
    : [];

  const topChatRooms = data?.chats?.messagesByRoom
    ? Object.entries(data.chats.messagesByRoom)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
    : [];

  return (
    <div className="min-h-screen bg-background-primary text-text-primary p-4 lg:p-10 font-body overflow-x-hidden">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">
            Server <span className="text-primary">Dashboard</span>
          </h1>
          <p className="text-text-muted flex items-center gap-2 text-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Live monitoring and moderation system for Gamehub24
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* to lobby button */}
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            <Layout className="w-4 h-4" />
            To Lobby
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Syncing..." : "Reload"}
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto mb-8 pt-3 border-b border-white/10 flex gap-4 md:gap-8 overflow-x-auto flex-nowrap custom-scrollbar pb-1">
        {[
          {
            id: "overview",
            label: "Overview",
            icon: <Server className="w-4 h-4" />,
          },
          {
            id: "rooms",
            label: "Active Rooms",
            icon: <Layout className="w-4 h-4" />,
          },
          {
            id: "messenger",
            label: "Chat Explorer",
            icon: <MessageSquare className="w-4 h-4" />,
          },

          {
            id: "moderation",
            label: "Moderation",
            icon: (
              <div className="relative">
                <Shield className="w-4 h-4" />
                {reportedMessages.some(
                  (m) => m.reports && m.reports.length > 0 && !m.isDeleted,
                ) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </div>
            ),
          },
          {
            id: "security",
            label: "Security",
            icon: <Lock className="w-4 h-4" />,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 transition-all relative whitespace-nowrap shrink-0 ${
              activeTab === t.id
                ? "text-primary border-b-2 border-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="max-w-7xl mx-auto mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-400 text-sm overflow-hidden"
          >
            <Activity className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="max-w-7xl mx-auto">
        {/* Dynamic Content Based on Tabs */}
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <StatCard
                  icon={<Users className="w-5 h-5" />}
                  label="Online Users"
                  value={data?.server.online || 0}
                  subtext="Connected clients"
                  color="blue"
                />
                <StatCard
                  icon={<Layout className="w-5 h-5" />}
                  label="Active Rooms"
                  value={data?.rooms.length || 0}
                  subtext={`${data?.rooms.reduce((acc, r) => acc + r.playerCount, 0)} total players`}
                  color="purple"
                />
                <StatCard
                  icon={<MessageSquare className="w-5 h-5" />}
                  label="Total Messages"
                  value={data?.chats.totalMessages.toLocaleString() || 0}
                  subtext="Persisted logs"
                  color="emerald"
                />
                <StatCard
                  icon={<Clock className="w-5 h-5" />}
                  label="Uptime"
                  value={data?.server.uptime || "0s"}
                  subtext={`Started: ${data ? new Date(data.server.startTime).toLocaleTimeString() : "-"}`}
                  color="amber"
                />
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  <BarChart2 className="w-6 h-6 text-primary" />
                  Analytics Overview
                </h2>
                <div className="flex bg-white/5 p-1 rounded-xl self-start">
                  {(
                    ["today", "yesterday", "7d", "14d", "30d", "all"] as const
                  ).map((range) => (
                    <button
                      key={range}
                      onClick={() => setAnalyticsRange(range)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        analyticsRange === range
                          ? "bg-primary text-white shadow-lg"
                          : "text-text-muted hover:text-white"
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {data?.stats.daily && (
                <DailyGraph
                  data={filteredDailyData}
                  days={
                    analyticsRange === "all"
                      ? Object.keys(data.stats.daily).length
                      : analyticsRange === "today" ||
                          analyticsRange === "yesterday"
                        ? 1
                        : parseInt(analyticsRange)
                  }
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-background-secondary/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col h-[500px]">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
                    <BarChart2 className="w-5 h-5 text-amber-400" />
                    Game Statistics
                  </h2>
                  <div className="overflow-x-auto border border-white/5 rounded-xl bg-white/2 flex-1 custom-scrollbar">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-white/5 text-text-muted font-bold uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                        <tr>
                          <th
                            className="px-4 py-3 border-b border-white/5 cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              const dir =
                                gameStatsSort.key === "game" &&
                                gameStatsSort.direction === "asc"
                                  ? "desc"
                                  : "asc";
                              setGameStatsSort({ key: "game", direction: dir });
                            }}
                          >
                            <div className="flex items-center gap-1">
                              Game
                              {gameStatsSort.key === "game" &&
                                (gameStatsSort.direction === "asc" ? (
                                  <ChevronUp className="w-3 h-3 text-primary" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-primary" />
                                ))}
                            </div>
                          </th>
                          <th
                            className="px-4 py-3 border-b border-white/5 cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              const dir =
                                gameStatsSort.key === "plays" &&
                                gameStatsSort.direction === "desc"
                                  ? "asc"
                                  : "desc";
                              setGameStatsSort({
                                key: "plays",
                                direction: dir,
                              });
                            }}
                          >
                            <div className="flex items-center gap-1">
                              Plays
                              {gameStatsSort.key === "plays" &&
                                (gameStatsSort.direction === "asc" ? (
                                  <ChevronUp className="w-3 h-3 text-primary" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-primary" />
                                ))}
                            </div>
                          </th>
                          <th
                            className="px-4 py-3 border-b border-white/5 cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                              const dir =
                                gameStatsSort.key === "dataTransfer" &&
                                gameStatsSort.direction === "desc"
                                  ? "asc"
                                  : "desc";
                              setGameStatsSort({
                                key: "dataTransfer",
                                direction: dir,
                              });
                            }}
                          >
                            <div className="flex items-center gap-1">
                              Usage
                              {gameStatsSort.key === "dataTransfer" &&
                                (gameStatsSort.direction === "asc" ? (
                                  <ChevronUp className="w-3 h-3 text-primary" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-primary" />
                                ))}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {aggregatedGameStats.map(([game, stats]) => (
                          <tr
                            key={game}
                            className="hover:bg-white/5 transition-colors group"
                          >
                            <td className="px-4 py-3 capitalize text-white/90 font-bold group-hover:text-primary transition-colors">
                              {game}
                            </td>
                            <td className="px-4 py-3 text-primary font-bold">
                              {stats.plays.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-emerald-400 font-bold">
                              {formatBytes(stats.dataTransfer)}
                            </td>
                          </tr>
                        ))}
                        {aggregatedGameStats.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-10 text-center text-text-muted italic opacity-30 text-xs"
                            >
                              No game data for this period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-background-secondary/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-3">
                    <Database className="w-5 h-5 text-slate-400" />
                    Machine Resources
                  </h2>
                  <div className="space-y-6">
                    <ResourceBar
                      label="RSS Memory"
                      value={formatBytes(data?.server.memory.rss || 0)}
                      percent={Math.min(
                        100,
                        ((data?.server.memory.rss || 0) /
                          (2 * 1024 * 1024 * 1024)) *
                          100,
                      )}
                      color="blue"
                    />
                    <ResourceBar
                      label="Heap Used"
                      value={formatBytes(data?.server.memory.heapUsed || 0)}
                      percent={
                        ((data?.server.memory.heapUsed || 0) /
                          (data?.server.memory.heapTotal || 1)) *
                        100
                      }
                      color="emerald"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "rooms" && (
            <motion.div
              key="rooms"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-background-secondary/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                {/* ... existing Active Rooms Table code ... */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                      <Layout className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold">Active Game Rooms</h2>
                  </div>
                  <span className="text-xs text-text-muted font-mono uppercase tracking-widest px-3 py-1 bg-white/5 rounded-full">
                    {data?.rooms.length} Rooms Total
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-xs uppercase text-text-muted">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Room Name</th>
                        <th className="px-6 py-4 font-semibold">Game</th>
                        <th className="px-6 py-4 font-semibold text-center">
                          Players
                        </th>
                        <th className="px-6 py-4 font-semibold text-center">
                          Password
                        </th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data?.rooms.map((room) => (
                        <tr
                          key={room.id}
                          className="hover:bg-white/2 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div className="font-medium text-sm group-hover:text-primary transition-colors">
                              {room.name}
                            </div>
                            <div className="text-[10px] text-text-muted font-mono">
                              {room.id}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold uppercase text-slate-300">
                              {room.gameType || "Idle"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-sm font-bold text-white">
                                {room.playerCount}
                              </span>
                              <span className="text-text-muted text-xs">/</span>
                              <span className="text-text-muted text-xs">
                                {room.spectatorCount} specs
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {room.password ? (
                              <div className="inline-flex items-center gap-2 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-mono text-amber-400">
                                <Key className="w-3 h-3" />
                                {room.password}
                              </div>
                            ) : (
                              <span className="text-[10px] text-text-muted italic opacity-30">
                                -
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`flex items-center gap-1.5 text-xs ${room.isPublic ? "text-emerald-400" : "text-amber-400"}`}
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${room.isPublic ? "bg-emerald-400" : "bg-amber-400"}`}
                              />
                              {room.isPublic ? "Public" : "Private"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(!data?.rooms || data.rooms.length === 0) && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-10 text-center text-text-muted text-sm italic"
                          >
                            No active rooms at the moment
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "messenger" && (
            <motion.div
              key="messenger"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-background-secondary/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[600px]">
                {/* Rooms Sidebar */}
                <div
                  className={`w-full md:w-64 border-r border-white/10 flex-col bg-white/2 ${
                    selectedMessengerRoom ? "hidden md:flex" : "flex"
                  }`}
                >
                  <div className="p-4 border-b border-white/10 bg-white/2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                        Conversations
                      </h3>
                      <div className="flex bg-white/5 rounded-lg p-0.5">
                        <button
                          onClick={() => setChatSortMode("recent")}
                          className={`p-1 rounded-md transition-all ${chatSortMode === "recent" ? "bg-primary text-white shadow-lg" : "text-text-muted hover:text-white"}`}
                          title="Sort by Recent"
                        >
                          <Clock className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setChatSortMode("count")}
                          className={`p-1 rounded-md transition-all ${chatSortMode === "count" ? "bg-primary text-white shadow-lg" : "text-text-muted hover:text-white"}`}
                          title="Sort by Message Count"
                        >
                          <TrendingUp className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        value={messengerSearch}
                        onChange={(e) => setMessengerSearch(e.target.value)}
                        placeholder="Search rooms..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredRooms.length > 0 ? (
                      filteredRooms.map((roomId) => {
                        const roomInfo = data?.chats.rooms[roomId];
                        if (!roomInfo) return null;
                        const lastMsg = roomInfo.lastMessage;
                        const isSelected = selectedMessengerRoom === roomId;

                        return (
                          <button
                            key={roomId}
                            onClick={() => setSelectedMessengerRoom(roomId)}
                            className={`w-full p-4 flex flex-col gap-1 border-b border-white/5 transition-all text-left group ${
                              isSelected
                                ? "bg-primary/10 border-r-2 border-r-primary"
                                : "hover:bg-white/5"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-sm font-bold truncate ${
                                  isSelected ? "text-primary" : "text-slate-200"
                                }`}
                              >
                                {roomId === "global" ? "Global Chat" : roomId}
                              </span>
                              <div className="flex flex-col items-end shrink-0">
                                <span className="text-[10px] text-text-muted font-mono opacity-60">
                                  {new Date(lastMsg.timestamp).toLocaleString(
                                    [],
                                    {
                                      year: "2-digit",
                                      month: "2-digit",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    },
                                  )}
                                </span>
                                <span className="text-[9px] text-primary font-bold">
                                  {formatTimeAgo(lastMsg.timestamp).en}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] text-text-muted truncate opacity-60 italic">
                                {lastMsg.username}: {lastMsg.message}
                              </p>
                              <span className="text-[10px] px-2 py-0.5 bg-primary/20 border border-primary/30 rounded-full text-primary font-bold shadow-sm shadow-primary/10">
                                {roomInfo.count}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center opacity-30">
                        <Search className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-[10px] italic">
                          No conversations found
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat View */}
                <div
                  className={`flex-1 flex-col overflow-hidden ${
                    selectedMessengerRoom ? "flex" : "hidden md:flex"
                  }`}
                >
                  {selectedMessengerRoom ? (
                    <>
                      <div className="p-4 border-b border-white/10 bg-white/2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setSelectedMessengerRoom(null)}
                            className="md:hidden p-1 -ml-2 text-text-muted hover:text-white"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xs">
                            {selectedMessengerRoom.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-white">
                              {selectedMessengerRoom === "global"
                                ? "Global Chat"
                                : selectedMessengerRoom}
                            </h2>
                            <p className="text-[10px] text-text-muted">
                              {data?.chats.rooms[selectedMessengerRoom]
                                ?.count || 0}{" "}
                              messages in log
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            fetchRoomMessages(selectedMessengerRoom)
                          }
                          className="p-2 hover:bg-white/5 rounded-lg text-text-muted transition-colors"
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${loadingMessages[selectedMessengerRoom] ? "animate-spin" : ""}`}
                          />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar bg-slate-900/40">
                        {loadingMessages[selectedMessengerRoom] &&
                        !roomMessages[selectedMessengerRoom] ? (
                          <div className="h-full flex flex-col items-center justify-center gap-3 text-text-muted">
                            <RefreshCw className="w-8 h-8 animate-spin" />
                            <p className="text-sm">Loading messages...</p>
                          </div>
                        ) : (
                          <>
                            {roomMessages[selectedMessengerRoom]?.map(
                              (msg, i) => {
                                const isSystem = msg.type === "system";

                                return (
                                  <div
                                    key={msg.id || i}
                                    className={`flex flex-col relative group/msg ${
                                      isSystem ? "items-center" : "items-start"
                                    } ${msg.isDeleted ? "opacity-50" : ""}`}
                                  >
                                    {!isSystem && (
                                      <div className="flex items-center gap-2 mb-1 px-1">
                                        <span className="text-xs font-black text-primary/80">
                                          {msg.username}
                                        </span>
                                        {msg.gameType && (
                                          <span className="text-[8px] px-1 bg-white/5 border border-white/10 rounded text-text-muted/60">
                                            {msg.gameType}
                                          </span>
                                        )}
                                        {msg.isDeleted && (
                                          <span className="text-[8px] px-1 bg-red-500/20 border border-red-500/30 rounded text-red-400 font-bold uppercase">
                                            Deleted
                                          </span>
                                        )}
                                        {msg.reports &&
                                          msg.reports.length > 0 && (
                                            <span className="text-[8px] px-1 bg-amber-500/20 border border-amber-500/30 rounded text-amber-400 font-bold uppercase">
                                              Reported ({msg.reports.length})
                                            </span>
                                          )}
                                        <span className="text-[10px] text-text-muted font-mono opacity-60">
                                          {new Date(
                                            msg.timestamp,
                                          ).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "2-digit",
                                            hour12: false,
                                          })}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3 w-full group">
                                      <div
                                        className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                                          isSystem
                                            ? "bg-white/5 border border-white/5 text-amber-400 italic text-xs py-1.5"
                                            : (msg.reports?.length || 0) > 0
                                              ? "bg-red-500/5 border border-red-500/20 text-slate-200 shadow-[0_0_15px_-5px_rgba(239,68,68,0.2)]"
                                              : "bg-white/5 border border-white/10 text-slate-200"
                                        }`}
                                      >
                                        {msg.message}
                                      </div>
                                      <div className="flex items-center gap-2 group-hover:opacity-100 opacity-0 transition-opacity">
                                        {!isSystem && (
                                          <>
                                            {/* Clear Reports Button */}
                                            {msg.reports &&
                                              msg.reports.length > 0 && (
                                                <button
                                                  onClick={() =>
                                                    handleModerationAction(
                                                      msg.id,
                                                      "clear",
                                                    ).then(() =>
                                                      fetchRoomMessages(
                                                        selectedMessengerRoom,
                                                      ),
                                                    )
                                                  }
                                                  className="p-1.5 hover:bg-emerald-500/20 text-emerald-400/50 hover:text-emerald-400 rounded-lg transition-all border border-transparent hover:border-emerald-500/20"
                                                  title="Clear Reports"
                                                >
                                                  <CheckCircle className="w-3.5 h-3.5" />
                                                </button>
                                              )}

                                            {/* Delete/Restore Toggle */}
                                            {!msg.isDeleted ? (
                                              <button
                                                onClick={() =>
                                                  handleModerationAction(
                                                    msg.id,
                                                    "delete",
                                                  ).then(() =>
                                                    fetchRoomMessages(
                                                      selectedMessengerRoom,
                                                    ),
                                                  )
                                                }
                                                className="p-1.5 hover:bg-red-500/20 text-red-400/50 hover:text-red-400 rounded-lg transition-all border border-transparent hover:border-red-500/20"
                                                title="Quick Delete"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            ) : (
                                              <button
                                                onClick={() =>
                                                  handleModerationAction(
                                                    msg.id,
                                                    "restore",
                                                  ).then(() =>
                                                    fetchRoomMessages(
                                                      selectedMessengerRoom,
                                                    ),
                                                  )
                                                }
                                                className="p-1.5 hover:bg-blue-500/20 text-blue-400/50 hover:text-blue-400 rounded-lg transition-all border border-transparent hover:border-blue-500/20"
                                                title="Restore Message"
                                              >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                            <div className="h-4" />
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-40">
                      <MessageSquare className="w-12 h-12 mb-4" />
                      <p>Select a conversation to view logs</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <AnalyticsCard
                  title="Top Chatters"
                  icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                  data={sortedUsers}
                  total={data?.chats.totalMessages || 1}
                  color="emerald"
                />
                <AnalyticsCard
                  title="Hot Rooms"
                  icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
                  data={topChatRooms}
                  total={data?.chats.totalMessages || 1}
                  color="blue"
                />
              </div>
            </motion.div>
          )}

          {activeTab === "moderation" && (
            <motion.div
              key="moderation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-background-secondary/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/2">
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-500/20 rounded-lg text-red-400">
                        <Shield className="w-5 h-5" />
                      </div>
                      <h2 className="text-xl font-bold text-white">
                        Moderation center
                      </h2>
                    </div>

                    <div className="flex bg-white/5 rounded-xl p-1">
                      {[
                        { id: "reported", label: "Reported" },
                        { id: "deleted", label: "Deleted msg" },
                      ].map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => setModerationSubTab(sub.id as any)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            moderationSubTab === sub.id
                              ? "bg-primary text-white shadow-lg"
                              : "text-text-muted hover:text-white"
                          }`}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={fetchModerationReports}
                    className="p-2 hover:bg-white/5 rounded-lg text-text-muted transition-colors"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loadingReports ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-xs uppercase text-text-muted">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Message</th>
                        <th className="px-6 py-4 font-semibold">User</th>
                        <th className="px-6 py-4 font-semibold">Reports</th>
                        <th className="px-6 py-4 font-semibold">Room</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {reportedMessages
                        .filter((m) =>
                          moderationSubTab === "reported"
                            ? (m.reports?.length || 0) > 0 && !m.isDeleted
                            : m.isDeleted,
                        )
                        .sort(
                          (a, b) =>
                            (b.reports?.length || 0) - (a.reports?.length || 0),
                        )
                        .map((msg) => (
                          <tr
                            key={msg.id}
                            className={`hover:bg-white/2 transition-colors ${msg.isDeleted ? "opacity-50" : ""}`}
                          >
                            <td className="px-6 py-4 max-w-md">
                              <p className="text-sm text-white wrap-break-word line-clamp-2">
                                {msg.message}
                              </p>
                              <span className="text-[10px] text-text-muted font-mono">
                                {new Date(msg.timestamp).toLocaleString()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm font-bold text-slate-300">
                                {msg.username}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-red-400">
                                  {msg.reports?.length || 0}
                                </span>
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400/50" />
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold uppercase text-text-muted">
                                {msg.roomId}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {msg.isDeleted ? (
                                <span className="px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-[10px] font-bold">
                                  DELETED
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">
                                  ACTIVE
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setActiveTab("messenger");
                                    setSelectedMessengerRoom(msg.roomId);
                                    fetchRoomMessages(msg.roomId);
                                  }}
                                  className="p-2 hover:bg-primary/20 text-primary rounded-lg transition-colors border border-primary/20"
                                  title="Navigate to Chat"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                                {!msg.isDeleted ? (
                                  <>
                                    <button
                                      onClick={() =>
                                        handleModerationAction(msg.id, "clear")
                                      }
                                      className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
                                      title="Dismiss Reports"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleModerationAction(msg.id, "delete")
                                      }
                                      className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                                      title="Delete Message"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() =>
                                      handleModerationAction(msg.id, "restore")
                                    }
                                    className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors border border-blue-500/20"
                                    title="Restore Message"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      {reportedMessages.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-10 text-center text-text-muted text-sm italic"
                          >
                            No reports found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "security" && (
            <motion.div
              key="security"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 max-w-2xl"
            >
              {/* Security Form relocated code */}
              <div className="bg-background-secondary/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
                <h2 className="text-lg font-bold mb-6 flex items-center gap-3">
                  <Shield className="w-5 h-5 text-primary" />
                  Security Settings
                </h2>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted ml-0.5">
                      Current Password
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current"
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted ml-0.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Key className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New (min 6 chars)"
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                      />
                    </div>
                  </div>

                  {securityMessage && (
                    <div
                      className={`p-2 rounded text-[10px] text-center font-medium ${securityMessage.type === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
                    >
                      {securityMessage.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      isChangingPassword || !currentPassword || !newPassword
                    }
                    className="w-full py-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-white transition-all rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isChangingPassword ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      "Update Password"
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DailyGraph({
  data,
  days = 7,
}: {
  data: Record<
    string,
    { plays: Record<string, number>; dataTransfer: Record<string, number> }
  >;
  days?: number;
}) {
  const chartData = useMemo(() => {
    const dates = Object.keys(data).sort();
    const lastDates = dates.slice(-days);

    return lastDates.map((date) => {
      const dayData = data[date];
      return {
        date,
        plays: Object.values(dayData.plays).reduce((a, b) => a + b, 0),
        dataTransfer: Object.values(dayData.dataTransfer).reduce(
          (a, b) => a + b,
          0,
        ),
        raw: dayData,
      };
    });
  }, [data, days]);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const toggleExpand = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  if (chartData.length < 2) return null;

  const maxPlays = Math.max(...chartData.map((d) => d.plays), 1);
  const maxData = Math.max(...chartData.map((d) => d.dataTransfer), 1);

  const width = 800;
  const height = 200;
  const padding = 20;

  const getX = (index: number) =>
    padding + (index * (width - padding * 2)) / (chartData.length - 1);
  const getYPlays = (value: number) =>
    height - padding - (value * (height - padding * 2)) / maxPlays;
  const getYData = (value: number) =>
    height - padding - (value * (height - padding * 2)) / maxData;

  const playsPath = chartData
    .map(
      (d: any, i: number) =>
        `${i === 0 ? "M" : "L"} ${getX(i)} ${getYPlays(d.plays)}`,
    )
    .join(" ");

  const dataPath = chartData
    .map(
      (d: any, i: number) =>
        `${i === 0 ? "M" : "L"} ${getX(i)} ${getYData(d.dataTransfer)}`,
    )
    .join(" ");

  return (
    <div className="bg-background-secondary/30 backdrop-blur-md border border-white/5 rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Growth Trends (Last {days} Days)
        </h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-[10px] font-bold text-text-muted">Plays</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-bold text-text-muted">Data</span>
          </div>
        </div>
      </div>

      <div className="relative aspect-4/1 w-full mb-10">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <line
              key={p}
              x1={padding}
              y1={padding + p * (height - padding * 2)}
              x2={width - padding}
              y2={padding + p * (height - padding * 2)}
              stroke="white"
              strokeOpacity="0.05"
              strokeDasharray="4 4"
            />
          ))}

          {/* Plays Line */}
          <motion.path
            d={playsPath}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />

          {/* Data Line */}
          <motion.path
            d={dataPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut", delay: 0.3 }}
          />

          {/* Points */}
          {chartData.map((d: any, i: number) => (
            <g key={i}>
              <motion.circle
                cx={getX(i)}
                cy={getYPlays(d.plays)}
                r="4"
                fill="var(--color-primary)"
                className="drop-shadow-[0_0_8px_var(--color-primary)]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1 + i * 0.1 }}
              />
              <motion.circle
                cx={getX(i)}
                cy={getYData(d.dataTransfer)}
                r="4"
                fill="#10b981"
                className="drop-shadow-[0_0_8px_#10b981]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.3 + i * 0.1 }}
              />
            </g>
          ))}
        </svg>

        {/* Date Labels */}
        <div className="flex justify-between mt-4 px-[20px]">
          {chartData.map((d: any, i: number) => {
            // Only show labels for every few days if the range is large
            const showLabel =
              chartData.length <= 7 ||
              i % Math.ceil(chartData.length / 7) === 0 ||
              i === chartData.length - 1;
            return (
              <div
                key={i}
                className={`text-[10px] text-text-muted font-mono ${!showLabel ? "opacity-0" : ""}`}
              >
                {d.date.split("-").slice(1).join("/")}
              </div>
            );
          })}
        </div>
      </div>

      {/* Numerical Data Table */}
      <div className="overflow-x-auto border border-white/5 rounded-xl bg-white/2">
        <table className="w-full text-left text-[10px]">
          <thead className="bg-white/5 text-text-muted font-bold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 border-b border-white/5">Date</th>
              <th className="px-4 py-2 border-b border-white/5">Plays</th>
              <th className="px-4 py-2 border-b border-white/5">
                Data Transfer
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            {chartData
              .slice()
              .reverse()
              .map((d) => (
                <React.Fragment key={d.date}>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2 text-white/70 flex items-center gap-2">
                      <button
                        onClick={() => toggleExpand(d.date)}
                        className="p-1 hover:bg-white/10 rounded-md transition-colors"
                      >
                        <ChevronLeft
                          className={`w-3 h-3 transition-transform ${expandedDates.has(d.date) ? "-rotate-90" : ""}`}
                        />
                      </button>
                      {new Date(d.date).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2 text-primary font-bold">
                      {d.plays.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-emerald-400 font-bold">
                      {formatBytes(d.dataTransfer)}
                    </td>
                  </tr>
                  {expandedDates.has(d.date) && (
                    <tr className="bg-white/5 border-l-2 border-primary/30">
                      <td colSpan={3} className="px-8 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-tighter text-primary/80 border-b border-primary/10 pb-1.5 flex items-center gap-2">
                              <TrendingUp className="w-3 h-3" />
                              Plays Distribution
                            </h4>
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                              {Object.entries(d.raw.plays)
                                .sort(([, a], [, b]) => b - a)
                                .map(([game, count]) => (
                                  <div
                                    key={game}
                                    className="flex justify-between items-center text-[10px] group/item"
                                  >
                                    <span className="capitalize text-text-muted group-hover/item:text-white/80 transition-colors">
                                      {game}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-primary/40"
                                          style={{
                                            width: `${(count / d.plays) * 100}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="font-bold text-white/90 min-w-[30px] text-right">
                                        {count.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-tighter text-emerald-400/80 border-b border-emerald-400/10 pb-1.5 flex items-center gap-2">
                              <Database className="w-3 h-3" />
                              Data Usage Breakdown
                            </h4>
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                              {Object.entries(d.raw.dataTransfer)
                                .sort(([, a], [, b]) => b - a)
                                .map(([game, bytes]) => (
                                  <div
                                    key={game}
                                    className="flex justify-between items-center text-[10px] group/item"
                                  >
                                    <span className="capitalize text-text-muted group-hover/item:text-white/80 transition-colors">
                                      {game}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-emerald-500/40"
                                          style={{
                                            width: `${(bytes / d.dataTransfer) * 100}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="font-bold text-white/90 min-w-[40px] text-right">
                                        {formatBytes(bytes)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/20 shadow-blue-500/5",
    purple:
      "from-purple-500/20 to-purple-600/5 text-purple-400 border-purple-500/20 shadow-purple-500/5",
    emerald:
      "from-emerald-500/20 to-emerald-600/5 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5",
    amber:
      "from-amber-500/20 to-amber-600/5 text-amber-400 border-amber-500/20 shadow-amber-500/5",
  };

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, scale: 0.9 },
        visible: { opacity: 1, scale: 1 },
      }}
      className={`bg-linear-to-br ${colors[color]} border backdrop-blur-md rounded-2xl p-6 relative overflow-hidden group shadow-lg`}
    >
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        {React.isValidElement(icon) &&
          React.cloneElement(icon as React.ReactElement<any>, {
            className: "w-16 h-16",
          })}
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4 opacity-80">
          {icon}
          <span className="text-xs font-bold uppercase tracking-widest">
            {label}
          </span>
        </div>
        <div className="text-3xl font-black text-white mb-1">{value}</div>
        <div className="text-white/60 text-xs font-medium">{subtext}</div>
      </div>
    </motion.div>
  );
}

function ResourceBar({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
}) {
  const bgClasses: Record<string, string> = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-semibold text-text-muted">{label}</span>
        <span className="text-xs font-bold text-white font-mono">{value}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, percent)}%` }}
          className={`h-full ${bgClasses[color]} shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
        />
      </div>
    </div>
  );
}

function AnalyticsCard({
  title,
  icon,
  data,
  total,
  color,
}: {
  title: string;
  icon: React.ReactNode;
  data: [string, number][];
  total: number;
  color: string;
}) {
  const barColors: Record<string, string> = {
    emerald: "bg-emerald-500/40 border-emerald-500/50",
    blue: "bg-blue-500/40 border-blue-500/50",
  };

  return (
    <div className="bg-background-secondary/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col h-full shadow-lg">
      <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted mb-6 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar pr-1">
        {data.map(([label, count]) => (
          <div key={label} className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="truncate max-w-[150px]">{label}</span>
              <span className="font-mono text-text-muted">{count}</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(count / total) * 100}%` }}
                className={`h-full ${barColors[color]} border-r shadow-sm`}
              />
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-center py-6 text-xs text-text-muted italic opacity-50 font-medium">
              No data points available
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
