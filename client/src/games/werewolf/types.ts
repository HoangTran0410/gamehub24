// === Ma Sói (Werewolf) Types ===

// Available roles in the game
export type WerewolfRole =
  | "wolf"
  | "villager"
  | "seer"
  | "bodyguard"
  | "witch"
  | "hunter"
  | "cupid";

// Game phases
export type GamePhase =
  | "setup" // Host configuring game
  | "night" // Night actions
  | "morning" // Morning report
  | "discussion" // Players discuss
  | "voting" // Vote to eliminate
  | "elimination" // Show eliminated player
  | "hunterRevenge" // Hunter's revenge shot
  | "end"; // Game over

// Sub-phases for night actions (order matters)
export type NightSubPhase =
  | "cupid" // Night 1 only
  | "seer"
  | "bodyguard"
  | "wolf"
  | "witch"
  | "done";

// Team/faction
export type Team = "village" | "wolf" | "lovers";

// Player interface
export interface WerewolfPlayer {
  id: string | null;
  username: string;
  avatar?: string;
  role: WerewolfRole | null;
  isAlive: boolean;
  isBot: boolean;
  // Lovers system (Cupid)
  loverId: string | null;
  // Hunter's pending shot
  hasPendingShot: boolean;
  // Voting status
  hasVoted: boolean;
  // Chat messages remaining this discussion
  messagesRemaining: number;
  // Personal history
  history: PlayerHistoryItem[];
}

// Suspicion marker for discussion phase
export interface SuspicionMarker {
  fromPlayerId: string;
  toPlayerId: string;
  timestamp: number;
}

// Player history item
export interface PlayerHistoryItem {
  id: string;
  type: "vote" | "chat" | "action" | "info";
  content: { en: string; vi: string };
  timestamp: number;
  day: number;
  isSecret?: boolean;
}

// Quick message template
export interface QuickMessage {
  id: string;
  icon: string;
  text: { en: string; vi: string };
  type: "accuse" | "defend" | "claim" | "react";
  targetRequired: boolean;
}

// Chat message
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  type: "text" | "quick" | "system" | "reaction";
  timestamp: number;
  // For quick messages with target
  targetPlayerId?: string;
  quickMessageId?: string;
  day: number;
}

// Wolf vote for coordination
export interface WolfVote {
  wolfId: string;
  targetId: string;
}

// Witch potion status
export interface WitchPotions {
  hasHealPotion: boolean;
  hasKillPotion: boolean;
}

// Night action result (for morning report)
export interface NightResult {
  killedByWolves: string | null; // Player who died from wolves
  savedByBodyguard: boolean; // Was the killed player saved?
  savedByWitch: boolean; // Was the killed player saved by witch?
  killedByWitch: string | null; // Player killed by witch poison
  // Seer's info (private to seer)
  seerCheck?: {
    targetId: string;
    isWolf: boolean;
  };
}

// Vote for elimination
export interface EliminationVote {
  voterId: string;
  targetId: string | null; // null = skip vote
}

// Game configuration
export interface GameConfig {
  discussionTime: number; // seconds (60-300)
  nightPhaseTime: number; // seconds (20-60)
  voteTime: number; // seconds (20-60)
  anonymousVoting: boolean;
  revealRolesOnDeath: boolean;
  chatLimit: number; // messages per player per discussion (0-5)
  tieHandling: "revote" | "noElimination";
  // Role configuration
  roles: WerewolfRole[];
}

// Game log entry
export interface GameLog {
  id: string;
  message: { en: string; vi: string };
  type: "info" | "action" | "death" | "vote" | "night";
  timestamp: number;
  day: number;
}

// Main game state
export interface WerewolfState {
  // Players
  players: WerewolfPlayer[];
  minPlayers: number;
  maxPlayers: number;

  // Game progress
  phase: GamePhase;
  nightSubPhase: NightSubPhase;
  day: number; // Current day number (starts at 1)
  isGameStarted: boolean;
  isGameOver: boolean;
  winner: Team | null;

  // Night tracking
  nightActions: {
    wolfTarget: string | null;
    wolfVotes: WolfVote[];
    seerTarget: string | null;
    bodyguardTarget: string | null;
    lastBodyguardTarget: string | null; // Can't protect same person twice
    witchHealTarget: string | null;
    witchKillTarget: string | null;
    cupidTargets: [string, string] | null;
  };
  witchPotions: { [playerId: string]: WitchPotions };

  // Day phase
  nightResult: NightResult | null;
  suspicionMarkers: SuspicionMarker[];
  eliminationVotes: EliminationVote[];
  pendingElimination: string | null; // Player to be eliminated

  // Communication
  chatMessages: ChatMessage[];

  // Configuration
  config: GameConfig;

  // Logs
  logs: GameLog[];

  // Timer
  phaseEndTime: number | null; // Unix timestamp when phase ends
  isPaused: boolean; // Is the game timer paused
  pausedTimeRemaining: number | null; // Time remaining when paused (ms)
}

// === Actions ===

export interface JoinSlotAction {
  type: "JOIN_SLOT";
  playerId: string;
  playerName: string;
  slotIndex: number;
}

export interface LeaveSlotAction {
  type: "LEAVE_SLOT";
  slotIndex: number;
}

export interface AddBotAction {
  type: "ADD_BOT";
  slotIndex: number;
}

export interface RemoveBotAction {
  type: "REMOVE_BOT";
  slotIndex: number;
}

export interface UpdateConfigAction {
  type: "UPDATE_CONFIG";
  config: Partial<GameConfig>;
}

export interface StartGameAction {
  type: "START_GAME";
  hostRole?: WerewolfRole;
}

export interface NightActionAction {
  type: "NIGHT_ACTION";
  playerId: string;
  role: WerewolfRole;
  targetId: string | null;
  // For witch
  useHealPotion?: boolean;
  useKillPotion?: boolean;
  // For cupid
  secondTargetId?: string;
}

export interface SkipNightActionAction {
  type: "SKIP_NIGHT_ACTION";
  playerId: string;
  role: WerewolfRole;
}

export interface SendMessageAction {
  type: "SEND_MESSAGE";
  playerId: string;
  content: string;
  messageType: "text" | "quick" | "reaction";
  targetPlayerId?: string;
  quickMessageId?: string;
}

export interface AddSuspicionAction {
  type: "ADD_SUSPICION";
  playerId: string;
  targetId: string;
}

export interface RemoveSuspicionAction {
  type: "REMOVE_SUSPICION";
  playerId: string;
  targetId: string;
}

export interface CastVoteAction {
  type: "CAST_VOTE";
  playerId: string;
  targetId: string | null; // null = skip
}

export interface HunterShootAction {
  type: "HUNTER_SHOOT";
  playerId: string;
  targetId: string;
}

export interface PhaseTimeoutAction {
  type: "PHASE_TIMEOUT";
}

export interface SkipPhaseAction {
  type: "SKIP_PHASE";
}

export interface ResetGameAction {
  type: "RESET_GAME";
}

export type WerewolfAction =
  | JoinSlotAction
  | LeaveSlotAction
  | AddBotAction
  | RemoveBotAction
  | UpdateConfigAction
  | StartGameAction
  | NightActionAction
  | SkipNightActionAction
  | SendMessageAction
  | AddSuspicionAction
  | RemoveSuspicionAction
  | CastVoteAction
  | HunterShootAction
  | PhaseTimeoutAction
  | SkipPhaseAction
  | ResetGameAction;

// === Quick Message Templates ===

export const QUICK_MESSAGES: QuickMessage[] = [
  // Accusation
  {
    id: "suspect",
    icon: "🎯",
    text: {
      en: "I suspect {target} is a Wolf",
      vi: "Tôi nghi {target} là Sói",
    },
    type: "accuse",
    targetRequired: true,
  },
  {
    id: "very_sus",
    icon: "🔴",
    text: { en: "{target} is VERY suspicious!", vi: "{target} RẤT đáng ngờ!" },
    type: "accuse",
    targetRequired: true,
  },
  // Defense
  {
    id: "trust",
    icon: "🛡️",
    text: { en: "I trust {target}", vi: "Tôi tin {target}" },
    type: "defend",
    targetRequired: true,
  },
  {
    id: "innocent",
    icon: "✅",
    text: { en: "{target} is innocent", vi: "{target} vô tội" },
    type: "defend",
    targetRequired: true,
  },
  // Claims
  {
    id: "claim_seer",
    icon: "🔮",
    text: { en: "I am the Seer!", vi: "Tôi là Tiên Tri!" },
    type: "claim",
    targetRequired: false,
  },
  {
    id: "claim_bodyguard",
    icon: "🛡️",
    text: { en: "I am the Bodyguard!", vi: "Tôi là Bảo Vệ!" },
    type: "claim",
    targetRequired: false,
  },
  {
    id: "claim_witch",
    icon: "🧙",
    text: { en: "I am the Witch!", vi: "Tôi là Phù Thủy!" },
    type: "claim",
    targetRequired: false,
  },
  {
    id: "seer_result_wolf",
    icon: "🐺",
    text: { en: "I checked {target} - WOLF!", vi: "Tôi soi {target} - SÓI!" },
    type: "claim",
    targetRequired: true,
  },
  {
    id: "seer_result_safe",
    icon: "✅",
    text: {
      en: "I checked {target} - NOT wolf",
      vi: "Tôi soi {target} - KHÔNG phải sói",
    },
    type: "claim",
    targetRequired: true,
  },
  // Reactions
  {
    id: "agree",
    icon: "👍",
    text: { en: "Agree", vi: "Đồng ý" },
    type: "react",
    targetRequired: false,
  },
  {
    id: "disagree",
    icon: "👎",
    text: { en: "Disagree", vi: "Không đồng ý" },
    type: "react",
    targetRequired: false,
  },
  {
    id: "thinking",
    icon: "🤔",
    text: { en: "Hmm...", vi: "Hmm..." },
    type: "react",
    targetRequired: false,
  },
  {
    id: "shocked",
    icon: "😱",
    text: { en: "Shocked!", vi: "Sốc!" },
    type: "react",
    targetRequired: false,
  },
  {
    id: "angry",
    icon: "😤",
    text: { en: "No way!", vi: "Không thể!" },
    type: "react",
    targetRequired: false,
  },
  {
    id: "acting",
    icon: "🎭",
    text: { en: "Acting?", vi: "Đang diễn à?" },
    type: "react",
    targetRequired: false,
  },
];

// === Role Info ===

export interface RoleInfo {
  id: WerewolfRole;
  name: { en: string; vi: string };
  description: { en: string; vi: string };
  team: Team;
  icon: string;
  color: string;
  hasNightAction: boolean;
  nightActionDescription?: { en: string; vi: string };
}

export const ROLE_INFO: Record<WerewolfRole, RoleInfo> = {
  wolf: {
    id: "wolf",
    name: { en: "Werewolf", vi: "Ma Sói" },
    description: {
      en: "Kill one villager each night. Win when wolves equal or outnumber villagers.",
      vi: "Giết một dân làng mỗi đêm. Thắng khi số sói bằng hoặc nhiều hơn dân.",
    },
    team: "wolf",
    icon: "🐺",
    color: "#dc2626",
    hasNightAction: true,
    nightActionDescription: {
      en: "Choose a villager to kill",
      vi: "Chọn một dân làng để giết",
    },
  },
  villager: {
    id: "villager",
    name: { en: "Villager", vi: "Dân Làng" },
    description: {
      en: "Find and eliminate all wolves to win.",
      vi: "Tìm và loại bỏ tất cả sói để thắng.",
    },
    team: "village",
    icon: "👤",
    color: "#22c55e",
    hasNightAction: false,
  },
  seer: {
    id: "seer",
    name: { en: "Seer", vi: "Tiên Tri" },
    description: {
      en: "Each night, check if one player is a wolf.",
      vi: "Mỗi đêm, kiểm tra xem một người có phải sói không.",
    },
    team: "village",
    icon: "🔮",
    color: "#8b5cf6",
    hasNightAction: true,
    nightActionDescription: {
      en: "Choose a player to check their role",
      vi: "Chọn một người để kiểm tra vai trò",
    },
  },
  bodyguard: {
    id: "bodyguard",
    name: { en: "Bodyguard", vi: "Bảo Vệ" },
    description: {
      en: "Protect one player each night (can't protect same player twice in a row).",
      vi: "Bảo vệ một người mỗi đêm (không thể bảo vệ cùng người 2 đêm liên tiếp).",
    },
    team: "village",
    icon: "🛡️",
    color: "#3b82f6",
    hasNightAction: true,
    nightActionDescription: {
      en: "Choose a player to protect tonight",
      vi: "Chọn một người để bảo vệ đêm nay",
    },
  },
  witch: {
    id: "witch",
    name: { en: "Witch", vi: "Phù Thủy" },
    description: {
      en: "Has one heal potion (save wolf victim) and one kill potion (kill anyone).",
      vi: "Có một bình cứu (cứu nạn nhân sói) và một bình độc (giết ai đó).",
    },
    team: "village",
    icon: "🧙",
    color: "#10b981",
    hasNightAction: true,
    nightActionDescription: {
      en: "Use heal potion to save victim, or kill potion to eliminate someone",
      vi: "Dùng bình cứu để cứu nạn nhân, hoặc bình độc để giết ai đó",
    },
  },
  hunter: {
    id: "hunter",
    name: { en: "Hunter", vi: "Thợ Săn" },
    description: {
      en: "When killed, can shoot one player to take with you.",
      vi: "Khi bị giết, có thể bắn một người đi cùng.",
    },
    team: "village",
    icon: "🏹",
    color: "#f59e0b",
    hasNightAction: false,
  },
  cupid: {
    id: "cupid",
    name: { en: "Cupid", vi: "Thần Tình Yêu" },
    description: {
      en: "On Night 1, pair two players as lovers. If one dies, the other dies too.",
      vi: "Đêm 1, ghép đôi 2 người thành tình nhân. Nếu một người chết, người kia cũng chết.",
    },
    team: "village",
    icon: "💘",
    color: "#ec4899",
    hasNightAction: true,
    nightActionDescription: {
      en: "Choose two players to become lovers",
      vi: "Chọn 2 người để trở thành tình nhân",
    },
  },
};

// Default game config
export const DEFAULT_CONFIG: GameConfig = {
  discussionTime: 120, // 2 minutes
  nightPhaseTime: 30,
  voteTime: 30,
  anonymousVoting: false,
  revealRolesOnDeath: true,
  chatLimit: 10,
  tieHandling: "noElimination",
  roles: ["wolf", "wolf", "seer", "bodyguard", "villager", "villager"],
};

// Role sets for different player counts
export const ROLE_SETS: Record<string, WerewolfRole[]> = {
  "5": ["wolf", "seer", "villager", "villager", "villager"],
  "6": ["wolf", "wolf", "seer", "villager", "villager", "villager"],
  "7": ["wolf", "wolf", "seer", "witch", "villager", "villager", "villager"],
  "8": [
    "wolf",
    "wolf",
    "seer",
    "bodyguard",
    "witch",
    "villager",
    "villager",
    "villager",
  ],
  "9": [
    "wolf",
    "wolf",
    "wolf",
    "seer",
    "bodyguard",
    "witch",
    "hunter",
    "villager",
    "villager",
  ],
  "10": [
    "wolf",
    "wolf",
    "wolf",
    "seer",
    "bodyguard",
    "witch",
    "hunter",
    "cupid",
    "villager",
    "villager",
  ],
  "11": [
    "wolf",
    "wolf",
    "wolf",
    "seer",
    "bodyguard",
    "witch",
    "hunter",
    "cupid",
    "villager",
    "villager",
    "villager",
  ],
  "12": [
    "wolf",
    "wolf",
    "wolf",
    "wolf",
    "seer",
    "bodyguard",
    "witch",
    "hunter",
    "cupid",
    "villager",
    "villager",
    "villager",
  ],
};
