import { transString } from "../../stores/languageStore";
import { BaseGame, type GameAction } from "../BaseGame";
import {
  type WerewolfState,
  type WerewolfAction,
  type WerewolfPlayer,
  type WerewolfRole,
  type NightSubPhase,
  type NightResult,
  type ChatMessage,
  type GameLog,
  type PlayerHistoryItem,
  DEFAULT_CONFIG,
  ROLE_SETS,
  ROLE_INFO,
  QUICK_MESSAGES,
} from "./types";

export default class Werewolf extends BaseGame<WerewolfState> {
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  getInitState(): WerewolfState {
    // Create initial player slots
    const initialPlayers: WerewolfPlayer[] = [];
    for (let i = 0; i < 12; i++) {
      initialPlayers.push({
        id: null,
        username: `Slot ${i + 1}`,
        role: null,
        isAlive: true,
        isBot: false,
        loverId: null,
        hasPendingShot: false,
        hasVoted: false,
        messagesRemaining: 3,
        history: [],
      });
    }

    // Add existing room players to slots
    this.players.forEach((player, index) => {
      if (index < 12) {
        initialPlayers[index] = {
          ...initialPlayers[index],
          id: player.id,
          username: player.username,
        };
      }
    });

    return {
      players: initialPlayers,
      minPlayers: 5,
      maxPlayers: 12,

      phase: "setup",
      nightSubPhase: "done",
      day: 0,
      isGameStarted: false,
      isGameOver: false,
      winner: null,

      nightActions: {
        wolfTarget: null,
        wolfVotes: [],
        seerTarget: null,
        bodyguardTarget: null,
        lastBodyguardTarget: null,
        witchHealTarget: null,
        witchKillTarget: null,
        cupidTargets: null,
      },
      witchPotions: {},

      nightResult: null,
      suspicionMarkers: [],
      eliminationVotes: [],
      pendingElimination: null,

      chatMessages: [],
      config: { ...DEFAULT_CONFIG },
      logs: [],
      phaseEndTime: null,
      isPaused: false,
      pausedTimeRemaining: null,
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as WerewolfAction;

    if (this.isHost) {
      // Host processes all actions
      switch (action.type) {
        case "JOIN_SLOT":
          this.handleJoinSlot(
            action.slotIndex,
            action.playerId,
            action.playerName,
          );
          break;
        case "LEAVE_SLOT":
          this.handleLeaveSlot(action.slotIndex);
          break;
        case "ADD_BOT":
          this.handleAddBot(action.slotIndex);
          break;
        case "REMOVE_BOT":
          this.handleRemoveBot(action.slotIndex);
          break;
        case "UPDATE_CONFIG":
          this.handleUpdateConfig(action.config);
          break;
        case "START_GAME":
          this.handleStartGame(action.hostRole);
          break;
        case "NIGHT_ACTION":
          this.handleNightAction(
            action.playerId,
            action.role,
            action.targetId,
            action.useHealPotion,
            action.useKillPotion,
            action.secondTargetId,
          );
          break;
        case "SKIP_NIGHT_ACTION":
          this.handleSkipNightAction(action.playerId, action.role);
          break;
        case "SEND_MESSAGE":
          this.handleSendMessage(
            action.playerId,
            action.content,
            action.messageType,
            action.targetPlayerId,
            action.quickMessageId,
          );
          break;
        case "ADD_SUSPICION":
          this.handleAddSuspicion(action.playerId, action.targetId);
          break;
        case "REMOVE_SUSPICION":
          this.handleRemoveSuspicion(action.playerId, action.targetId);
          break;
        case "CAST_VOTE":
          this.handleCastVote(action.playerId, action.targetId);
          break;
        case "HUNTER_SHOOT":
          this.handleHunterShoot(action.playerId, action.targetId);
          break;
        case "PHASE_TIMEOUT":
          this.handlePhaseTimeout();
          break;
        case "SKIP_PHASE":
          this.handleSkipPhase();
          break;
        case "RESET_GAME":
          this.handleResetGame();
          break;
      }
    }
  }

  public updatePlayers(players: any[]): void {
    super.updatePlayers(players);

    // Only auto-add in setup phase
    if (this.state.isGameStarted) return;

    let stateChanged = false;

    // 1. Handle new players joining
    players.forEach((roomPlayer) => {
      // Check if player is already in a slot
      const existingSlot = this.state.players.find(
        (p) => p.id === roomPlayer.id,
      );

      if (!existingSlot) {
        // Find first empty slot
        const emptySlot = this.state.players.find((p) => p.id === null);
        if (emptySlot) {
          emptySlot.id = roomPlayer.id;
          emptySlot.username = roomPlayer.username;
          // Reset other fields if necessary
          emptySlot.isBot = false;
          emptySlot.role = null;
          stateChanged = true;
        }
      }
    });

    if (stateChanged) {
      this.syncState();
    }
  }

  // === Setup Phase ===

  private handleJoinSlot(
    slotIndex: number,
    playerId: string,
    playerName: string,
  ): void {
    if (this.state.isGameStarted) return;

    const slot = this.state.players[slotIndex];
    if (!slot || slot.id !== null) return; // Slot taken

    // Check if player is already in another slot
    const existingSlot = this.state.players.find((p) => p.id === playerId);
    if (existingSlot) {
      // Remove from existing slot
      existingSlot.id = null;
      existingSlot.username = `Slot ${this.state.players.indexOf(existingSlot) + 1}`;
      existingSlot.isBot = false;
    }

    slot.id = playerId;
    slot.username = playerName;
    slot.isBot = false;

    this.syncState();
  }

  private handleLeaveSlot(slotIndex: number): void {
    if (this.state.isGameStarted) return;

    const slot = this.state.players[slotIndex];
    if (!slot) return;

    slot.id = null;
    slot.username = `Slot ${slotIndex + 1}`;
    slot.isBot = false;

    this.syncState();
  }

  private handleAddBot(slotIndex: number): void {
    if (this.state.isGameStarted) return;

    const slot = this.state.players[slotIndex];
    if (!slot || slot.id !== null) return;

    const botIndex = this.state.players.filter((p) => p.isBot).length;
    const botName = "Bot " + botIndex;

    slot.id = `bot_${Date.now()}_${slotIndex}`;
    slot.username = botName;
    slot.isBot = true;

    this.syncState();
  }

  private handleRemoveBot(slotIndex: number): void {
    if (this.state.isGameStarted) return;

    const slot = this.state.players[slotIndex];
    if (!slot || !slot.isBot) return;

    slot.id = null;
    slot.username = `Slot ${slotIndex + 1}`;
    slot.isBot = false;

    this.syncState();
  }

  private handleUpdateConfig(config: Partial<typeof DEFAULT_CONFIG>): void {
    if (this.state.isGameStarted) return;

    this.state.config = { ...this.state.config, ...config };
    this.syncState();
  }

  private handleStartGame(hostRole?: WerewolfRole): void {
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    if (activePlayers.length < this.state.minPlayers) return;
    if (this.state.isGameStarted) return;

    // Assign roles
    this.assignRoles(activePlayers, hostRole);

    // Initialize witch potions
    const witches = this.state.players.filter((p) => p.role === "witch");
    witches.forEach((witch) => {
      if (witch.id) {
        this.state.witchPotions[witch.id] = {
          hasHealPotion: true,
          hasKillPotion: true,
        };
      }
    });

    // Start game
    this.state.isGameStarted = true;
    this.state.day = 1;

    // Add log
    this.addLog({ en: "Game started!", vi: "Trò chơi bắt đầu!" }, "info");

    // Start night phase
    this.startNightPhase();
  }

  private assignRoles(
    activePlayers: WerewolfPlayer[],
    hostRole?: WerewolfRole,
  ): void {
    const playerCount = activePlayers.length;

    // Get role set based on player count
    let roles = this.state.config.roles;
    if (ROLE_SETS[playerCount.toString()]) {
      roles = [...ROLE_SETS[playerCount.toString()]];
    }

    // Adjust roles if needed
    while (roles.length < playerCount) {
      roles.push("villager");
    }
    while (roles.length > playerCount) {
      const villagerIndex = roles.lastIndexOf("villager");
      if (villagerIndex !== -1) {
        roles.splice(villagerIndex, 1);
      } else {
        roles.pop();
      }
    }

    // Handle Host Role Selection
    if (hostRole) {
      // Find the human player (Host) when playing with bots
      const humans = activePlayers.filter((p) => !p.isBot);
      const targetPlayer = humans.length > 0 ? humans[0] : null;

      if (targetPlayer) {
        // Remove one instance of the requested role from the pool
        const roleIndex = roles.indexOf(hostRole);
        if (roleIndex !== -1) {
          roles.splice(roleIndex, 1);
        } else {
          // Force it: remove a villager or random role to make space
          const villagerIndex = roles.lastIndexOf("villager");
          if (villagerIndex !== -1) {
            roles.splice(villagerIndex, 1);
          } else {
            roles.pop();
          }
        }
        // Assign to target immediately
        targetPlayer.role = hostRole;
      }
    }

    // Shuffle roles
    const shuffledRoles = this.shuffleArray([...roles]);

    // Assign roles to active players
    let roleIndex = 0;
    this.state.players.forEach((player) => {
      // Only assign if not already assigned (host might have role)
      if (player.id !== null && !player.role) {
        player.role = shuffledRoles[roleIndex++];
      }

      // Reset state for new game
      if (player.id !== null) {
        player.isAlive = true;
        player.hasVoted = false;
        player.hasPendingShot = false;
        player.loverId = null;
        player.messagesRemaining = this.state.config.chatLimit;
      }
    });
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // === Night Phase ===

  private startNightPhase(): void {
    this.state.phase = "night";
    this.state.nightActions = {
      wolfTarget: null,
      wolfVotes: [],
      seerTarget: null,
      bodyguardTarget: null,
      lastBodyguardTarget: this.state.nightActions.lastBodyguardTarget,
      witchHealTarget: null,
      witchKillTarget: null,
      cupidTargets: this.state.nightActions.cupidTargets, // Keep cupid targets from night 1
    };

    // Determine first night sub-phase
    if (this.state.day === 1 && this.hasAliveRole("cupid")) {
      this.state.nightSubPhase = "cupid";
    } else if (this.hasAliveRole("seer")) {
      this.state.nightSubPhase = "seer";
    } else if (this.hasAliveRole("bodyguard")) {
      this.state.nightSubPhase = "bodyguard";
    } else if (this.hasAliveRole("wolf")) {
      this.state.nightSubPhase = "wolf";
    } else if (this.hasAliveRole("witch")) {
      this.state.nightSubPhase = "witch";
    } else {
      this.state.nightSubPhase = "done";
    }

    this.startPhaseTimer();
    this.syncState();

    // Process bot actions for current sub-phase
    this.processBotNightAction();
  }

  private hasAliveRole(role: WerewolfRole): boolean {
    return this.state.players.some((p) => p.role === role && p.isAlive);
  }

  private advanceNightSubPhase(): void {
    const order: NightSubPhase[] = [
      "cupid",
      "seer",
      "bodyguard",
      "wolf",
      "witch",
      "done",
    ];
    const currentIndex = order.indexOf(this.state.nightSubPhase);

    for (let i = currentIndex + 1; i < order.length; i++) {
      const nextPhase = order[i];

      if (nextPhase === "done") {
        this.processNightResults();
        return;
      }

      if (nextPhase === "cupid" && this.state.day !== 1) continue;

      if (this.hasAliveRole(nextPhase as WerewolfRole)) {
        this.state.nightSubPhase = nextPhase;
        this.startPhaseTimer();
        this.syncState();
        this.processBotNightAction();
        return;
      }
    }

    // No more phases, process results
    this.processNightResults();
  }

  private handleNightAction(
    playerId: string,
    role: WerewolfRole,
    targetId: string | null,
    useHealPotion?: boolean,
    useKillPotion?: boolean,
    secondTargetId?: string,
  ): void {
    if (this.state.phase !== "night") return;

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.role !== role || !player.isAlive) return;

    switch (role) {
      case "wolf":
        this.handleWolfAction(playerId, targetId);
        break;
      case "seer":
        this.handleSeerAction(playerId, targetId);
        break;
      case "bodyguard":
        this.handleBodyguardAction(playerId, targetId);
        break;
      case "witch":
        this.handleWitchAction(
          playerId,
          targetId,
          useHealPotion,
          useKillPotion,
        );
        break;
      case "cupid":
        this.handleCupidAction(playerId, targetId, secondTargetId);
        break;
    }
  }

  private handleWolfAction(playerId: string, targetId: string | null): void {
    if (this.state.nightSubPhase !== "wolf") return;

    // Record wolf vote
    const existingVoteIndex = this.state.nightActions.wolfVotes.findIndex(
      (v) => v.wolfId === playerId,
    );
    if (existingVoteIndex !== -1) {
      this.state.nightActions.wolfVotes[existingVoteIndex].targetId =
        targetId || "";
    } else if (targetId) {
      this.state.nightActions.wolfVotes.push({ wolfId: playerId, targetId });
    }

    // Check if all wolves have voted
    const aliveWolves = this.state.players.filter(
      (p) => p.role === "wolf" && p.isAlive,
    );
    const allVoted = aliveWolves.every((wolf) =>
      this.state.nightActions.wolfVotes.some((v) => v.wolfId === wolf.id),
    );

    if (allVoted) {
      // Count votes
      const voteCounts: Record<string, number> = {};
      this.state.nightActions.wolfVotes.forEach((v) => {
        voteCounts[v.targetId] = (voteCounts[v.targetId] || 0) + 1;
      });

      // Get target with most votes
      let maxVotes = 0;
      let target: string | null = null;
      Object.entries(voteCounts).forEach(([id, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          target = id;
        }
      });

      this.state.nightActions.wolfTarget = target;
      this.advanceNightSubPhase();
    } else {
      this.syncState();
    }
  }

  private handleSeerAction(playerId: string, targetId: string | null): void {
    if (this.state.nightSubPhase !== "seer") return;
    if (!targetId) return;

    this.state.nightActions.seerTarget = targetId;

    const target = this.state.players.find((p) => p.id === targetId);
    if (target) {
      const isWolf = target.role === "wolf";
      this.addPlayerHistory(
        playerId,
        "info",
        {
          vi: `Kết quả soi: ${target.username} là ${isWolf ? "MA SÓI" : "Dân Làng"}`,
          en: `Seer Result: ${target.username} is ${isWolf ? "a WEREWOLF" : "a Villager"}`,
        },
        true,
      );
    }

    this.advanceNightSubPhase();
  }

  private handleBodyguardAction(
    _playerId: string,
    targetId: string | null,
  ): void {
    if (this.state.nightSubPhase !== "bodyguard") return;
    if (!targetId) return;

    // Can't protect same person twice in a row
    if (targetId === this.state.nightActions.lastBodyguardTarget) {
      console.log(
        `Bodyguard protect failed: Cannot protect ${targetId} twice in a row.`,
      );
      return;
    }

    this.state.nightActions.bodyguardTarget = targetId;
    console.log(`Bodyguard protected ${targetId}`);
    this.advanceNightSubPhase();
  }

  private handleWitchAction(
    playerId: string,
    targetId: string | null,
    useHealPotion?: boolean,
    useKillPotion?: boolean,
  ): void {
    if (this.state.nightSubPhase !== "witch") return;

    const potions = this.state.witchPotions[playerId];
    if (!potions) return;

    if (
      useHealPotion &&
      potions.hasHealPotion &&
      this.state.nightActions.wolfTarget
    ) {
      this.state.nightActions.witchHealTarget =
        this.state.nightActions.wolfTarget;
      potions.hasHealPotion = false;
      console.log(
        "Witch healed:",
        this.state.nightActions.witchHealTarget,
        "Wolf target:",
        this.state.nightActions.wolfTarget,
      );
    } else if (useHealPotion) {
      console.log(
        "Witch heal failed:",
        "Has potion:",
        potions.hasHealPotion,
        "Wolf target:",
        this.state.nightActions.wolfTarget,
      );
    }

    if (useKillPotion && potions.hasKillPotion && targetId) {
      this.state.nightActions.witchKillTarget = targetId;
      potions.hasKillPotion = false;
    }

    this.advanceNightSubPhase();
  }

  private handleCupidAction(
    _playerId: string,
    targetId: string | null,
    secondTargetId?: string,
  ): void {
    if (this.state.nightSubPhase !== "cupid") return;
    if (!targetId || !secondTargetId) return;
    if (this.state.day !== 1) return;

    // Set lovers
    const player1 = this.state.players.find((p) => p.id === targetId);
    const player2 = this.state.players.find((p) => p.id === secondTargetId);

    if (player1 && player2) {
      player1.loverId = secondTargetId;
      player2.loverId = targetId;
      this.state.nightActions.cupidTargets = [targetId, secondTargetId];
    }

    this.advanceNightSubPhase();
  }

  private handleSkipNightAction(playerId: string, role: WerewolfRole): void {
    if (this.state.phase !== "night") return;

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.role !== role || !player.isAlive) return;

    // For some roles, skipping is allowed
    if (role === "witch" || role === "bodyguard") {
      this.advanceNightSubPhase();
    }
  }

  private processNightResults(): void {
    const result: NightResult = {
      killedByWolves: null,
      savedByBodyguard: false,
      savedByWitch: false,
      killedByWitch: null,
    };

    // Process wolf kill
    if (this.state.nightActions.wolfTarget) {
      const isProtected =
        this.state.nightActions.bodyguardTarget ===
        this.state.nightActions.wolfTarget;
      const isHealed =
        !!this.state.nightActions.witchHealTarget &&
        this.state.nightActions.witchHealTarget ===
          this.state.nightActions.wolfTarget;

      console.log("Process Night Result:", {
        wolfTarget: this.state.nightActions.wolfTarget,
        healTarget: this.state.nightActions.witchHealTarget,
        isHealed,
      });

      if (isProtected) {
        result.savedByBodyguard = true;
      } else if (isHealed) {
        result.savedByWitch = true;
      } else {
        result.killedByWolves = this.state.nightActions.wolfTarget;
      }
    }

    // Process witch kill
    if (this.state.nightActions.witchKillTarget) {
      result.killedByWitch = this.state.nightActions.witchKillTarget;
    }

    // Process seer check
    if (this.state.nightActions.seerTarget) {
      const target = this.state.players.find(
        (p) => p.id === this.state.nightActions.seerTarget,
      );
      if (target && target.role) {
        result.seerCheck = {
          targetId: target.id!,
          isWolf: target.role === "wolf",
        };
      }
    }

    // Update last bodyguard target
    this.state.nightActions.lastBodyguardTarget =
      this.state.nightActions.bodyguardTarget;

    // Store result
    this.state.nightResult = result;

    // Move to morning phase
    this.startMorningPhase();
  }

  // === Morning Phase ===

  private startMorningPhase(): void {
    this.state.phase = "morning";
    this.state.nightSubPhase = "done";

    const deaths: string[] = [];

    // Process deaths
    if (this.state.nightResult?.killedByWolves) {
      deaths.push(this.state.nightResult.killedByWolves);
    }
    if (this.state.nightResult?.killedByWitch) {
      deaths.push(this.state.nightResult.killedByWitch);
    }

    // Kill players and handle lovers
    deaths.forEach((playerId) => {
      this.killPlayer(playerId);
    });

    // Add logs for deaths
    if (deaths.length === 0) {
      this.addLog(
        { en: "No one died last night!", vi: "Không ai chết đêm qua!" },
        "death",
      );
    } else {
      deaths.forEach((playerId) => {
        const player = this.state.players.find((p) => p.id === playerId);
        if (player) {
          this.addLog(
            {
              en: `${player.username} was killed last night!`,
              vi: `${player.username} đã bị giết đêm qua!`,
            },
            "death",
          );

          if (this.state.config.revealRolesOnDeath && player.role) {
            const roleInfo = ROLE_INFO[player.role];
            this.addLog(
              {
                en: `${player.username} was a ${roleInfo.name.en}`,
                vi: `${player.username} là ${roleInfo.name.vi}`,
              },
              "info",
            );
          }
        }
      });
    }

    // Check for hunter pending shot
    const hunterWithPendingShot = this.state.players.find(
      (p) => p.role === "hunter" && p.hasPendingShot && !p.isAlive,
    );
    if (hunterWithPendingShot) {
      this.state.phase = "hunterRevenge";
      this.state.pendingElimination = hunterWithPendingShot.id;

      // Reset voted flag so UI shows controls
      hunterWithPendingShot.hasVoted = false;

      this.startPhaseTimer();
      this.syncState();
      this.processBotHunterAction();
      return;
    }

    // Check win condition
    if (this.checkWinCondition()) {
      this.endGame();
      return;
    }

    // Auto-advance to discussion after brief pause
    this.startPhaseTimer();
    this.syncState();
  }

  private killPlayer(playerId: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.isAlive) return;

    player.isAlive = false;

    // Hunter gets pending shot
    if (player.role === "hunter") {
      player.hasPendingShot = true;
    }

    // Check for lover death
    if (player.loverId) {
      const lover = this.state.players.find((p) => p.id === player.loverId);
      if (lover && lover.isAlive) {
        this.addLog(
          {
            en: `${lover.username} died of a broken heart!`,
            vi: `${lover.username} chết vì đau tim!`,
          },
          "death",
        );
        lover.isAlive = false;

        // Hunter lover gets pending shot too
        if (lover.role === "hunter") {
          lover.hasPendingShot = true;
        }
      }
    }
  }

  // === Discussion Phase ===

  private startDiscussionPhase(): void {
    this.state.phase = "discussion";
    this.state.suspicionMarkers = [];

    // Reset message counts
    this.state.players.forEach((p) => {
      if (p.isAlive) {
        p.messagesRemaining = this.state.config.chatLimit;
      }
    });

    this.startPhaseTimer();
    this.syncState();

    // Bot auto actions during discussion
    this.processBotDiscussion();
  }

  private handleSendMessage(
    playerId: string,
    content: string,
    messageType: "text" | "quick" | "reaction",
    targetPlayerId?: string,
    quickMessageId?: string,
  ): void {
    if (this.state.phase !== "discussion") return;

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.isAlive) return;

    // Check message limit for text messages
    if (messageType === "text" && player.messagesRemaining <= 0) return;

    // Validate message length
    if (messageType === "text" && content.length > 100) {
      content = content.substring(0, 100);
    }

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      playerId,
      playerName: player.username,
      content,
      type: messageType,
      timestamp: Date.now(),
      targetPlayerId,
      quickMessageId,
      day: this.state.day,
    };

    this.state.chatMessages.push(message);

    if (messageType === "text") {
      player.messagesRemaining--;

      this.addPlayerHistory(playerId, "chat", {
        en: `Chat: "${content}"`,
        vi: `Chat: "${content}"`,
      });
    }

    // Keep last 500 messages
    if (this.state.chatMessages.length > 500) {
      this.state.chatMessages = this.state.chatMessages.slice(-500);
    }

    this.syncState();
  }

  private handleAddSuspicion(playerId: string, targetId: string): void {
    if (this.state.phase !== "discussion") return;

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.isAlive) return;

    // Check if already suspected
    const alreadySuspected = this.state.suspicionMarkers.some(
      (m) => m.fromPlayerId === playerId && m.toPlayerId === targetId,
    );

    if (alreadySuspected) {
      // Remove suspicion (Toggle OFF)
      this.state.suspicionMarkers = this.state.suspicionMarkers.filter(
        (m) => !(m.fromPlayerId === playerId && m.toPlayerId === targetId),
      );

      this.addPlayerHistory(playerId, "action", {
        en: `Removed suspicion on ${this.state.players.find((p) => p.id === targetId)?.username}`,
        vi: `Bỏ nghi ngờ ${this.state.players.find((p) => p.id === targetId)?.username}`,
      });
    } else {
      // Add new suspicion (Toggle ON)
      this.state.suspicionMarkers.push({
        fromPlayerId: playerId,
        toPlayerId: targetId,
        timestamp: Date.now(),
      });

      // Add history
      this.addPlayerHistory(playerId, "action", {
        en: `Suspects ${this.state.players.find((p) => p.id === targetId)?.username}`,
        vi: `Nghi ngờ ${this.state.players.find((p) => p.id === targetId)?.username}`,
      });

      // Add incoming history to target
      this.addPlayerHistory(targetId, "info", {
        en: `${player.username} suspects you`,
        vi: `${player.username} nghi ngờ bạn`,
      });
    }

    this.syncState();
  }

  private handleRemoveSuspicion(playerId: string, targetId: string): void {
    if (this.state.phase !== "discussion") return;

    this.state.suspicionMarkers = this.state.suspicionMarkers.filter(
      (m) => !(m.fromPlayerId === playerId && m.toPlayerId === targetId),
    );

    this.syncState();
  }

  // === Voting Phase ===

  private startVotingPhase(): void {
    this.state.phase = "voting";
    this.state.eliminationVotes = [];

    // Reset vote status
    this.state.players.forEach((p) => {
      p.hasVoted = false;
    });

    this.startPhaseTimer();
    this.syncState();

    // Bot auto voting
    this.processBotVoting();
  }

  private handleCastVote(playerId: string, targetId: string | null): void {
    if (this.state.phase !== "voting") return;

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || !player.isAlive || player.hasVoted) return;

    // Can't vote for dead players
    if (targetId) {
      const target = this.state.players.find((p) => p.id === targetId);
      if (!target || !target.isAlive) return;
    }

    player.hasVoted = true;

    // Remove any existing vote
    this.state.eliminationVotes = this.state.eliminationVotes.filter(
      (v) => v.voterId !== playerId,
    );

    // Add vote
    this.state.eliminationVotes.push({
      voterId: playerId,
      targetId,
    });

    // Add incoming history to target (if not null)
    if (targetId) {
      this.addPlayerHistory(targetId, "vote", {
        en: `${player.username} voted for you`,
        vi: `${player.username} đã bình chọn bạn`,
      });
    }

    // Check if all alive players have voted
    const alivePlayers = this.state.players.filter(
      (p) => p.isAlive && p.id !== null,
    );
    const allVoted = alivePlayers.every((p) => p.hasVoted);

    if (allVoted) {
      this.processVotes();
    } else {
      this.syncState();
    }
  }

  private processVotes(): void {
    // Count votes
    const voteCounts: Record<string, number> = {};
    this.state.eliminationVotes.forEach((v) => {
      if (v.targetId) {
        voteCounts[v.targetId] = (voteCounts[v.targetId] || 0) + 1;
      }
    });

    // Find player with most votes
    let maxVotes = 0;
    let eliminatedId: string | null = null;
    let isTie = false;

    Object.entries(voteCounts).forEach(([id, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = id;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    });

    // Handle tie
    if (isTie && this.state.config.tieHandling === "noElimination") {
      eliminatedId = null;
      this.addLog(
        {
          en: "Vote was tied - no one eliminated!",
          vi: "Bình chọn hòa - không ai bị loại!",
        },
        "vote",
      );
    }

    if (eliminatedId) {
      this.state.pendingElimination = eliminatedId;
      this.startEliminationPhase();
    } else {
      // No elimination, start next night
      this.state.day++;
      this.startNightPhase();
    }
  }

  // === Elimination Phase ===

  private startEliminationPhase(): void {
    this.state.phase = "elimination";

    const eliminatedId = this.state.pendingElimination;
    if (!eliminatedId) {
      this.state.day++;
      this.startNightPhase();
      return;
    }

    const eliminated = this.state.players.find((p) => p.id === eliminatedId);
    if (eliminated) {
      this.addLog(
        {
          en: `${eliminated.username} was voted out!`,
          vi: `${eliminated.username} bị bình chọn loại!`,
        },
        "vote",
      );

      this.killPlayer(eliminatedId);

      if (this.state.config.revealRolesOnDeath && eliminated.role) {
        const roleInfo = ROLE_INFO[eliminated.role];
        this.addLog(
          {
            en: `${eliminated.username} was a ${roleInfo.name.en}`,
            vi: `${eliminated.username} là ${roleInfo.name.vi}`,
          },
          "info",
        );
      }
    }

    // Check for hunter pending shot
    const hunterWithPendingShot = this.state.players.find(
      (p) => p.role === "hunter" && p.hasPendingShot && !p.isAlive,
    );
    if (hunterWithPendingShot) {
      this.state.phase = "hunterRevenge";
      this.state.pendingElimination = hunterWithPendingShot.id;

      // Reset voted flag so UI shows controls
      hunterWithPendingShot.hasVoted = false;

      this.startPhaseTimer();
      this.syncState();
      this.processBotHunterAction();
      return;
    }

    // Check win condition
    if (this.checkWinCondition()) {
      this.endGame();
      return;
    }

    // Pause then start next night
    this.startPhaseTimer();
    this.syncState();
  }

  // === Hunter Revenge ===

  private handleHunterShoot(playerId: string, targetId: string): void {
    if (this.state.phase !== "hunterRevenge") return;

    const hunter = this.state.players.find((p) => p.id === playerId);
    if (!hunter || hunter.role !== "hunter" || !hunter.hasPendingShot) return;

    const target = this.state.players.find((p) => p.id === targetId);

    // Valid shot
    if (target && target.isAlive) {
      this.addLog(
        {
          en: `${hunter.username} took ${target.username} with them!`,
          vi: `${hunter.username} kéo ${target.username} đi cùng!`,
        },
        "death",
      );

      this.killPlayer(targetId);

      if (this.state.config.revealRolesOnDeath && target.role) {
        const roleInfo = ROLE_INFO[target.role];
        this.addLog(
          {
            en: `${target.username} was a ${roleInfo.name.en}`,
            vi: `${target.username} là ${roleInfo.name.vi}`,
          },
          "info",
        );
      }
    } else {
      // Missed shot or timeout
      this.addLog(
        {
          en: `${hunter.username} didn't shoot anyone.`,
          vi: `${hunter.username} không bắn ai cả.`,
        },
        "info",
      );
    }

    // Check for another hunter
    const anotherHunter = this.state.players.find(
      (p) =>
        p.role === "hunter" &&
        p.hasPendingShot &&
        !p.isAlive &&
        p.id !== playerId,
    );
    if (anotherHunter) {
      this.state.pendingElimination = anotherHunter.id;
      this.syncState();
      return;
    }

    // Check win condition
    if (this.checkWinCondition()) {
      this.endGame();
      return;
    }

    // Continue to next phase
    if (
      this.state.nightResult &&
      (this.state.nightResult.killedByWolves ||
        this.state.nightResult.killedByWitch)
    ) {
      // It was morning, continue to discussion
      this.state.pendingElimination = null;
      this.startDiscussionPhase();
    } else {
      // It was after voting, start next night
      this.state.pendingElimination = null;
      this.state.day++;
      this.startNightPhase();
    }
  }

  // === Win Condition ===

  private checkWinCondition(): boolean {
    const alivePlayers = this.state.players.filter(
      (p) => p.isAlive && p.id !== null,
    );
    const aliveWolves = alivePlayers.filter((p) => p.role === "wolf");
    const aliveVillagers = alivePlayers.filter((p) => p.role !== "wolf");

    // Check lovers win (both survives and one is wolf)
    const lovers = this.state.players.filter((p) => p.loverId && p.isAlive);
    if (lovers.length === 2 && alivePlayers.length === 2) {
      const hasWolfLover = lovers.some((p) => p.role === "wolf");
      if (hasWolfLover) {
        this.state.winner = "lovers";
        return true;
      }
    }

    // Wolves win when equal or more than villagers
    if (aliveWolves.length >= aliveVillagers.length) {
      this.state.winner = "wolf";
      return true;
    }

    // Village wins when all wolves are dead
    if (aliveWolves.length === 0) {
      this.state.winner = "village";
      return true;
    }

    return false;
  }

  private endGame(): void {
    this.state.phase = "end";
    this.state.isGameOver = true;
    this.clearTimer();

    const winnerLabel =
      this.state.winner === "wolf"
        ? { en: "Werewolves win!", vi: "Ma Sói thắng!" }
        : this.state.winner === "village"
          ? { en: "Village wins!", vi: "Dân Làng thắng!" }
          : { en: "Lovers win!", vi: "Tình Nhân thắng!" };

    this.addLog(winnerLabel, "info");
    this.syncState();

    this.broadcastGameEnd({
      winner: this.state.winner || undefined,
    });
  }

  // === Timer ===

  private startPhaseTimer(): void {
    this.clearTimer();

    let duration: number;
    switch (this.state.phase) {
      case "night":
        duration = this.state.config.nightPhaseTime * 1000;
        break;
      case "discussion":
        duration = this.state.config.discussionTime * 1000;
        break;
      case "voting":
        duration = this.state.config.voteTime * 1000;
        break;
      case "hunterRevenge":
        duration = 15000; // 15 seconds for hunter shot
        break;
      case "morning":
      case "elimination":
        duration = 10000; // 10 seconds for reading results
        break;
      default:
        duration = 30000;
    }

    this.state.phaseEndTime = Date.now() + duration;

    if (this.isHost) {
      this.timerInterval = setInterval(() => {
        if (
          !this.state.isPaused &&
          this.state.phaseEndTime !== null &&
          Date.now() >= this.state.phaseEndTime
        ) {
          this.handlePhaseTimeout();
        }
      }, 1000);
    }
  }

  requestPauseGame(): void {
    if (!this.isHost || !this.state.phaseEndTime || this.state.isPaused) return;

    const now = Date.now();
    const remaining = Math.max(0, this.state.phaseEndTime - now);

    this.state.isPaused = true;
    this.state.pausedTimeRemaining = remaining;
    this.state.phaseEndTime = null;

    this.clearTimer();
    this.syncState();
  }

  requestResumeGame(): void {
    if (
      !this.isHost ||
      !this.state.isPaused ||
      this.state.pausedTimeRemaining === null
    )
      return;

    this.state.isPaused = false;
    this.state.phaseEndTime = Date.now() + this.state.pausedTimeRemaining;
    this.state.pausedTimeRemaining = null;

    this.timerInterval = setInterval(() => {
      if (
        !this.state.isPaused &&
        this.state.phaseEndTime !== null &&
        Date.now() >= this.state.phaseEndTime
      ) {
        this.handlePhaseTimeout();
      }
    }, 1000);

    this.syncState();
  }

  private clearTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private handlePhaseTimeout(): void {
    if (
      this.state.isGameOver ||
      this.state.isPaused ||
      !this.state.phaseEndTime
    )
      return;

    // Logic to end current phase and move to next
    switch (this.state.phase) {
      case "discussion":
        this.startVotingPhase();
        break;
      case "voting":
        this.processVotes();
        break;
      case "night":
        this.advanceNightSubPhase();
        break;
      case "hunterRevenge":
        this.handleHunterShoot(
          this.state.players.find((p) => p.hasPendingShot)?.id || "",
          "", // Empty target = miss shot/timeout
        );
        break;
      case "morning":
        this.startDiscussionPhase();
        break;
      case "elimination":
        this.state.pendingElimination = null;
        this.state.day++;
        this.startNightPhase();
        break;
    }
  }

  private handleSkipPhase(): void {
    if (this.state.isGameOver || this.state.isPaused) return;

    // Set timeout to 5 seconds from now
    this.state.phaseEndTime = Date.now() + 5000;
    this.state.isPaused = false;
    this.state.pausedTimeRemaining = null;

    this.syncState();
  }

  // === Bot AI ===

  private processBotNightAction(): void {
    if (!this.isHost) return;

    const delay = 1000 + Math.random() * 2000; // 1-3 second delay

    setTimeout(() => {
      if (this.state.phase !== "night") return;

      switch (this.state.nightSubPhase) {
        case "wolf":
          this.processBotWolfAction();
          break;
        case "seer":
          this.processBotSeerAction();
          break;
        case "bodyguard":
          this.processBotBodyguardAction();
          break;
        case "witch":
          this.processBotWitchAction();
          break;
        case "cupid":
          this.processBotCupidAction();
          break;
      }
    }, delay);
  }

  private processBotWolfAction(): void {
    const botWolves = this.state.players.filter(
      (p) => p.role === "wolf" && p.isAlive && p.isBot,
    );

    botWolves.forEach((wolf) => {
      if (!wolf.id) return;

      // Check if already voted
      const hasVoted = this.state.nightActions.wolfVotes.some(
        (v) => v.wolfId === wolf.id,
      );
      if (hasVoted) return;

      // Pick random alive non-wolf player
      const targets = this.state.players.filter(
        (p) => p.isAlive && p.role !== "wolf" && p.id !== null,
      );
      if (targets.length === 0) return;

      // 80% change to follow existing votes (coordinate attack)
      let targetId = "";

      const existingVotes = this.state.nightActions.wolfVotes;
      if (existingVotes.length > 0 && Math.random() < 0.8) {
        // Find most voted target
        const voteCounts: Record<string, number> = {};
        existingVotes.forEach((v) => {
          voteCounts[v.targetId] = (voteCounts[v.targetId] || 0) + 1;
        });

        let maxVotes = 0;
        let bestTarget = "";

        Object.entries(voteCounts).forEach(([tid, count]) => {
          if (count > maxVotes) {
            maxVotes = count;
            bestTarget = tid;
          }
        });

        if (bestTarget) {
          targetId = bestTarget;
        }
      }

      // If no target selected (no existing votes or 20% independent), pick random
      if (!targetId) {
        // Prefer targets with low suspicion (villagers who are trusted)
        // or high suspicion (to blend in)? Wolves usually kill confirmed good players.
        // For now, random is fine, but let's ensure we don't pick null
        const randomTarget =
          targets[Math.floor(Math.random() * targets.length)];
        if (randomTarget?.id) targetId = randomTarget.id;
      }

      if (targetId) {
        this.handleNightAction(
          wolf.id,
          "wolf",
          targetId,
          false,
          false,
          undefined,
        );
      }
    });
  }

  private processBotSeerAction(): void {
    const botSeer = this.state.players.find(
      (p) => p.role === "seer" && p.isAlive && p.isBot,
    );
    if (!botSeer?.id) return;

    const targets = this.state.players.filter(
      (p) => p.isAlive && p.id !== botSeer.id && p.id !== null,
    );

    // Filter out already checked targets using history
    const uncheckedTargets = targets.filter((target) => {
      return !botSeer.history.some(
        (h) =>
          h.type === "info" &&
          h.content.en.startsWith("Seer Result:") &&
          h.content.en.includes(target.username),
      );
    });

    const targetPool = uncheckedTargets.length > 0 ? uncheckedTargets : targets;

    if (targetPool.length === 0) return;

    const target = targetPool[Math.floor(Math.random() * targetPool.length)];
    this.handleNightAction(
      botSeer.id,
      "seer",
      target.id,
      false,
      false,
      undefined,
    );
  }

  private processBotBodyguardAction(): void {
    const botBodyguard = this.state.players.find(
      (p) => p.role === "bodyguard" && p.isAlive && p.isBot,
    );
    if (!botBodyguard?.id) return;

    const targets = this.state.players.filter(
      (p) =>
        p.isAlive &&
        p.id !== null &&
        p.id !== this.state.nightActions.lastBodyguardTarget,
    );
    if (targets.length === 0) return;

    const target = targets[Math.floor(Math.random() * targets.length)];
    this.handleNightAction(
      botBodyguard.id,
      "bodyguard",
      target.id,
      false,
      false,
      undefined,
    );
  }

  private processBotWitchAction(): void {
    const botWitch = this.state.players.find(
      (p) => p.role === "witch" && p.isAlive && p.isBot,
    );
    if (!botWitch?.id) return;

    const potions = this.state.witchPotions[botWitch.id];
    if (!potions) {
      this.advanceNightSubPhase();
      return;
    }

    // 50% chance to use heal if available and someone was targeted
    const useHeal =
      potions.hasHealPotion &&
      this.state.nightActions.wolfTarget &&
      Math.random() > 0.5;

    // 30% chance to use kill if available, but only after night 1
    let killTarget: string | null = null;
    if (potions.hasKillPotion && this.state.day > 1 && Math.random() > 0.7) {
      // Kill suspicious players (those with suspicion markers)
      const suspiciousTargets = this.state.players.filter(
        (p) =>
          p.isAlive &&
          p.id !== botWitch.id &&
          p.id !== null &&
          this.state.suspicionMarkers.some((m) => m.toPlayerId === p.id),
      );

      const targets =
        suspiciousTargets.length > 0
          ? suspiciousTargets
          : this.state.players.filter(
              (p) => p.isAlive && p.id !== botWitch.id && p.id !== null,
            );

      if (targets.length > 0) {
        killTarget = targets[Math.floor(Math.random() * targets.length)].id;
      }
    }

    this.handleNightAction(
      botWitch.id,
      "witch",
      killTarget,
      useHeal || false,
      !!killTarget,
      undefined,
    );
  }

  private processBotCupidAction(): void {
    const botCupid = this.state.players.find(
      (p) => p.role === "cupid" && p.isAlive && p.isBot,
    );
    if (!botCupid?.id) return;

    const targets = this.state.players.filter(
      (p) => p.isAlive && p.id !== null,
    );
    if (targets.length < 2) return;

    const shuffled = this.shuffleArray(targets);
    this.handleNightAction(
      botCupid.id,
      "cupid",
      shuffled[0].id,
      false,
      false,
      shuffled[1].id || undefined,
    );
  }

  private processBotHunterAction(): void {
    const hunterRevenge = this.state.players.find(
      (p) =>
        p.role === "hunter" &&
        p.id === this.state.pendingElimination &&
        p.isBot &&
        !p.isAlive,
    );

    if (!hunterRevenge?.id) return;

    // Delay shot
    setTimeout(
      () => {
        if (this.state.phase !== "hunterRevenge") return;
        if (this.state.pendingElimination !== hunterRevenge.id) return;

        const targets = this.state.players.filter(
          (p) => p.isAlive && p.id && p.id !== hunterRevenge.id,
        );

        if (targets.length === 0) {
          this.handleHunterShoot(hunterRevenge.id!, "SKIP");
          return;
        }

        // Prioritize previous voters or suspicious players?
        // For now, random
        const target = targets[Math.floor(Math.random() * targets.length)];
        if (target.id) {
          this.handleHunterShoot(hunterRevenge.id!, target.id);
        }
      },
      3000 + Math.random() * 2000,
    );
  }

  // === Bot Discussion & Voting AI ===

  private processBotDiscussion(): void {
    if (!this.isHost) return;
    if (this.state.phase !== "discussion") return;

    const aliveBots = this.state.players.filter(
      (p) => p.isBot && p.isAlive && p.id,
    );

    // Each bot adds suspicion and sends quick messages with random delays
    aliveBots.forEach((bot, index) => {
      // Delay each bot's actions to make it feel more natural
      const delay = 2000 + index * 1500 + Math.random() * 3000;

      setTimeout(() => {
        if (this.state.phase !== "discussion") return;
        if (!bot.id) return;

        // Add suspicion to a random alive non-wolf player (if bot is wolf)
        // or random player (if bot is villager)
        const potentialTargets = this.state.players.filter(
          (p) => p.isAlive && p.id && p.id !== bot.id,
        );

        if (potentialTargets.length > 0) {
          // Wolves prefer to not accuse each other
          let suspectTargets = potentialTargets;
          if (bot.role === "wolf") {
            suspectTargets = potentialTargets.filter((p) => p.role !== "wolf");
            if (suspectTargets.length === 0) suspectTargets = potentialTargets;
          }

          const target =
            suspectTargets[Math.floor(Math.random() * suspectTargets.length)];

          // 70% chance to add suspicion
          if (Math.random() < 0.7 && target.id) {
            this.handleAddSuspicion(bot.id, target.id);
          }

          // 40% chance to send a quick message
          if (Math.random() < 0.4) {
            this.handleBotQuickMessage(bot, potentialTargets);
          }
        }
      }, delay);
    });
  }

  private handleBotQuickMessage(
    bot: WerewolfPlayer,
    potentialTargets: WerewolfPlayer[],
  ): void {
    if (!bot.id) return;

    // Filter relevant messages based on role and context
    let messages = QUICK_MESSAGES.filter((msg) => {
      // Role claims
      if (msg.type === "claim") {
        if (msg.id === "claim_seer" && bot.role === "seer")
          return Math.random() < 0.3; // Low chance to claim real role early
        if (msg.id === "claim_bodyguard" && bot.role === "bodyguard")
          return Math.random() < 0.2;
        if (
          bot.role === "wolf" &&
          (msg.id === "claim_seer" || msg.id === "claim_bodyguard")
        ) {
          return Math.random() < 0.1; // Wolves rarely claim roles randomly
        }
        return false;
      }

      // Seer results
      if (msg.id.startsWith("seer_result")) {
        return (
          bot.role === "seer" || (bot.role === "wolf" && Math.random() < 0.2)
        );
      }

      // Default to accusation/defense/reaction
      return true;
    });

    if (messages.length === 0) return;

    const messageTemplate =
      messages[Math.floor(Math.random() * messages.length)];
    let targetId: string | undefined;

    if (messageTemplate.targetRequired) {
      // Pick a target
      let targetPool = potentialTargets;

      // Wolves try to frame non-wolves
      if (bot.role === "wolf" && messageTemplate.type === "accuse") {
        targetPool = potentialTargets.filter((p) => p.role !== "wolf");
        if (targetPool.length === 0) targetPool = potentialTargets;
      }

      // Seer checks
      if (
        bot.role === "seer" &&
        (messageTemplate.id === "seer_result_wolf" ||
          messageTemplate.id === "seer_result_safe")
      ) {
        // Try to report actual check result if available (simplified for now as bot memory isn't fully implemented)
        // For now, random target from pool
      }

      const target = targetPool[Math.floor(Math.random() * targetPool.length)];
      if (target && target.id) {
        targetId = target.id;
      } else {
        return; // No valid target
      }
    }

    // construct message content for display (fallback/log)
    // The actual UI uses the template ID, but we store a string rep for logs
    let content = transString(messageTemplate.text); // Default to EN for log, UI handles translation
    if (targetId) {
      const targetName =
        this.state.players.find((p) => p.id === targetId)?.username ||
        "Unknown";
      content = content.replace("{target}", targetName);
    }

    this.handleSendMessage(
      bot.id,
      content,
      "quick",
      targetId,
      messageTemplate.id,
    );
  }

  private processBotVoting(): void {
    if (!this.isHost) return;
    if (this.state.phase !== "voting") return;

    const aliveBots = this.state.players.filter(
      (p) => p.isBot && p.isAlive && p.id && !p.hasVoted,
    );

    // Each bot votes with random delay
    aliveBots.forEach((bot, index) => {
      const delay = 1000 + index * 1000 + Math.random() * 2000;

      setTimeout(() => {
        if (this.state.phase !== "voting") return;
        if (!bot.id || bot.hasVoted) return;

        // Get potential vote targets (alive players except self)
        const potentialTargets = this.state.players.filter(
          (p) => p.isAlive && p.id && p.id !== bot.id,
        );

        if (potentialTargets.length === 0) {
          // Skip vote
          this.handleCastVote(bot.id, null);
          return;
        }

        // Wolves try not to vote for each other
        let voteTargets = potentialTargets;
        if (bot.role === "wolf") {
          voteTargets = potentialTargets.filter((p) => p.role !== "wolf");
          if (voteTargets.length === 0) voteTargets = potentialTargets;
        }

        // Prefer players with suspicion markers
        const suspectedPlayers = voteTargets.filter((p) =>
          this.state.suspicionMarkers.some((m) => m.toPlayerId === p.id),
        );

        let targetPool =
          suspectedPlayers.length > 0 ? suspectedPlayers : voteTargets;

        // 10% chance to skip vote
        if (Math.random() < 0.1) {
          this.handleCastVote(bot.id, null);
          return;
        }

        const target =
          targetPool[Math.floor(Math.random() * targetPool.length)];
        if (target.id) {
          this.handleCastVote(bot.id, target.id);
        }
      }, delay);
    });
  }

  // === Utility ===

  private addLog(
    message: { en: string; vi: string },
    type: GameLog["type"],
  ): void {
    this.state.logs.push({
      id: `log_${Date.now()}_${Math.random()}`,
      message,
      type,
      timestamp: Date.now(),
      day: this.state.day,
    });

    // Keep only last 100 logs
    if (this.state.logs.length > 100) {
      this.state.logs = this.state.logs.slice(-100);
    }

    this.syncState();
  }

  private addPlayerHistory(
    playerId: string,
    type: PlayerHistoryItem["type"],
    content: { en: string; vi: string },
    isSecret?: boolean,
  ): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;

    player.history.push({
      id: `hist_${Date.now()}_${Math.random()}`,
      type,
      content,
      timestamp: Date.now(),
      day: this.state.day,
      isSecret,
    });

    this.syncState();
  }

  private handleResetGame(): void {
    this.clearTimer();
    const newState = this.getInitState();

    // Preserve player slots
    this.state.players.forEach((player, index) => {
      if (player.id !== null) {
        newState.players[index] = {
          ...newState.players[index],
          id: player.id,
          username: player.username,
          isBot: player.isBot,
        };
      }
    });

    this.state = newState;
    this.syncState();
  }

  // === Public API ===

  requestJoinSlot(slotIndex: number, playerName: string): void {
    this.makeAction({
      type: "JOIN_SLOT",
      playerId: this.userId,
      playerName,
      slotIndex,
    });
  }

  requestLeaveSlot(slotIndex: number): void {
    this.makeAction({
      type: "LEAVE_SLOT",
      slotIndex,
    });
  }

  requestAddBot(slotIndex: number): void {
    if (!this.isHost) return;
    this.handleAddBot(slotIndex);
  }

  requestRemoveBot(slotIndex: number): void {
    if (!this.isHost) return;
    this.handleRemoveBot(slotIndex);
  }

  requestUpdateConfig(config: Partial<typeof DEFAULT_CONFIG>): void {
    if (!this.isHost) return;
    this.handleUpdateConfig(config);
  }

  requestStartGame(hostRole?: WerewolfRole): void {
    if (!this.isHost) return;
    this.handleStartGame(hostRole);
  }

  requestNightAction(
    role: WerewolfRole,
    targetId: string | null,
    useHealPotion?: boolean,
    useKillPotion?: boolean,
    secondTargetId?: string,
  ): void {
    this.makeAction({
      type: "NIGHT_ACTION",
      playerId: this.userId,
      role,
      targetId,
      useHealPotion,
      useKillPotion,
      secondTargetId,
    });
  }

  requestSkipNightAction(role: WerewolfRole): void {
    this.makeAction({
      type: "SKIP_NIGHT_ACTION",
      playerId: this.userId,
      role,
    });
  }

  requestSendMessage(
    content: string,
    messageType: "text" | "quick" | "reaction",
    targetPlayerId?: string,
    quickMessageId?: string,
  ): void {
    this.makeAction({
      type: "SEND_MESSAGE",
      playerId: this.userId,
      content,
      messageType,
      targetPlayerId,
      quickMessageId,
    });
  }

  requestAddSuspicion(targetId: string): void {
    this.makeAction({
      type: "ADD_SUSPICION",
      playerId: this.userId,
      targetId,
    });
  }

  requestRemoveSuspicion(targetId: string): void {
    this.makeAction({
      type: "REMOVE_SUSPICION",
      playerId: this.userId,
      targetId,
    });
  }

  requestCastVote(targetId: string | null): void {
    this.makeAction({
      type: "CAST_VOTE",
      playerId: this.userId,
      targetId,
    });
  }

  requestHunterShoot(targetId: string): void {
    this.makeAction({
      type: "HUNTER_SHOOT",
      playerId: this.userId,
      targetId,
    });
  }

  requestResetGame(): void {
    if (!this.isHost) return;
    this.handleResetGame();
  }

  requestSkipPhase(): void {
    if (!this.isHost) return;
    this.makeAction({
      type: "SKIP_PHASE",
    });
  }

  getMyPlayer(): WerewolfPlayer | null {
    return this.state.players.find((p) => p.id === this.userId) || null;
  }

  getMyRole(): WerewolfRole | null {
    return this.getMyPlayer()?.role || null;
  }

  canStartGame(): boolean {
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    return (
      activePlayers.length >= this.state.minPlayers && !this.state.isGameStarted
    );
  }

  // Cleanup
  destroy(): void {
    this.clearTimer();
    super.destroy();
  }
}
