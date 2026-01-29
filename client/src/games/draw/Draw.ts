import { BaseGame, type GameAction } from "../BaseGame";
import { getWordsByDifficulty, type Difficulty } from "./words";

export interface Point {
  x: number;
  y: number;
}

export interface DrawStroke {
  id: string;
  playerId: string;
  points: number[]; // Flat array: [x1, y1, x2, y2, ...]
  color: string;
  width: number;
  duration: number; // How long it took to draw (ms)
}

export interface GarticRound {
  drawerId: string;
  word: string; // The secret word
  status: "CHOOSING_WORD" | "DRAWING" | "ROUND_END";
  roundEndTime: number;
  maskedWord: string; // e.g., "_ _ _ _"

  // Enhancement state
  isPaused: boolean;
  pausedRemainingTime?: number; // Time left when paused
  playerHints: Record<string, number[]>; // playerId -> list of revealed indices
}

import { calculateSimilarity } from "../../utils/stringUtils";

export interface GameMessage {
  id: string;
  senderId: string;
  content: string | { vi: string; en: string };
  type: "CHAT" | "GUESS" | "SYSTEM";
  subType?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  isCorrect?: boolean;
  similarity?: number;
  timestamp: number;
}

export interface CanvasState {
  mode: "FREE" | "GARTIC";
  strokes: DrawStroke[];

  // Gartic State
  gartic?: GarticRound;
  wordOptions?: string[]; // Options currently offered to drawer
  scores: Record<string, number>; // playerId -> score
  guesses: string[]; // IDs of players who guessed correctly this round
  messages: GameMessage[]; // Chat/Guess log
  wordLanguage?: "en" | "vi"; // Language for secret word
  wordDifficulty?: Difficulty;
}

export interface CanvasAction extends GameAction {
  type:
    | "DRAW"
    | "CLEAR"
    | "UNDO"
    | "START_GARTIC"
    | "CHOOSE_WORD"
    | "SUBMIT_GUESS"
    | "NEXT_ROUND"
    | "SEND_MESSAGE"
    | "REROLL_OPTIONS"
    | "PAUSE_GAME"
    | "BUY_HINT"
    | "SELECT_DIFFICULTY";
  payload?: any;
}

export default class CanvasGame extends BaseGame<CanvasState> {
  private roundTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentRoundDuration = 60000;

  getInitState(): CanvasState {
    return {
      mode: "FREE",
      strokes: [],
      scores: {},
      guesses: [],
      messages: [],
      wordLanguage: "vi",
    };
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as CanvasAction;

    switch (action.type) {
      case "DRAW":
        this.handleDraw(action.payload);
        break;
      case "CLEAR":
        this.handleClear();
        break;
      case "UNDO":
        this.handleUndo(action.payload);
        break;
      case "START_GARTIC":
        this.handleStartGartic();
        break;
      case "CHOOSE_WORD":
        this.handleChooseWord(action.payload);
        break;
      case "SUBMIT_GUESS":
        this.handleSubmitGuess(action.payload);
        break;
      case "NEXT_ROUND":
        this.handleNextRound();
        break;
      case "SEND_MESSAGE":
        this.handleSendMessage(action.payload);
        break;
      case "REROLL_OPTIONS":
        this.handleRerollOptions(action.payload);
        break;
      case "PAUSE_GAME":
        this.handlePauseGame();
        break;
      case "BUY_HINT":
        this.handleBuyHint(action.payload);
        break;
      case "SELECT_DIFFICULTY":
        this.handleSelectDifficulty(action.payload);
        break;
    }
  }

  makeAction(action: CanvasAction): void {
    if (this.isHost) {
      this.onSocketGameAction({ action });
    } else {
      // Client-side prediction for drawing
      if (action.type === "DRAW") {
        this.state.strokes.push(action.payload);
      } else if (action.type === "CLEAR") {
        if (
          this.state.mode === "FREE" ||
          (this.state.gartic && this.state.gartic.drawerId === this.userId)
        ) {
          this.state.strokes = [];
        }
      } else if (action.type === "UNDO") {
        // Find and remove last stroke by this player
        const playerId = action.payload;
        let lastIndex = -1;
        for (let i = this.state.strokes.length - 1; i >= 0; i--) {
          if (this.state.strokes[i].playerId === playerId) {
            lastIndex = i;
            break;
          }
        }
        if (lastIndex !== -1) {
          this.state.strokes.splice(lastIndex, 1);
        }
      }

      // Send to host
      if (this.players.find((p) => p.id === this.userId)) {
        this.sendSocketGameAction(action);
      }
    }
  }

  // --- Actions ---

  private handleDraw(stroke: DrawStroke) {
    if (!this.isHost) return;

    // In Gartic mode, only drawer can draw
    if (this.state.mode === "GARTIC") {
      if (this.state.gartic?.status !== "DRAWING") return;
      if (this.state.gartic.isPaused) return; // Cannot draw while paused

      // Assuming stroke.playerId is reliable (sent by client)
      if (this.state.gartic?.drawerId !== stroke.playerId) return;
    }

    this.state.strokes.push(stroke);
  }

  private handleClear() {
    if (!this.isHost) return;
    this.state.strokes = [];
  }

  private handleUndo(playerId: string) {
    if (!this.isHost) return;

    let lastIndex = -1;
    for (let i = this.state.strokes.length - 1; i >= 0; i--) {
      if (this.state.strokes[i].playerId === playerId) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex === -1) return;

    this.state.strokes.splice(lastIndex, 1);
  }

  private handleStartGartic() {
    if (!this.isHost) return;

    this.state.mode = "GARTIC";
    this.state.scores = {};
    this.players.forEach((p) => (this.state.scores[p.id] = 0));
    this.state.messages = [];
    this.state.wordLanguage = "vi"; // Default to VI

    // Start first round
    this.startNewRound();
  }

  private handleChooseWord(word: string) {
    if (!this.isHost) return;
    if (!this.state.gartic) return;
    if (this.state.gartic.status !== "CHOOSING_WORD") return;

    // Set word
    this.state.gartic.word = word;
    this.state.gartic.maskedWord = word.replace(/\S/g, "_"); // Keep spaces, mask chars
    this.state.gartic.status = "DRAWING";

    this.currentRoundDuration = 60000;
    this.state.gartic.roundEndTime = Date.now() + this.currentRoundDuration; // 60 seconds to draw

    // Clear strokes for new round
    this.state.strokes = [];

    // System message
    this.addSystemMessage(
      {
        en: "Drawer has chosen a word! Start guessing!",
        vi: "Người vẽ đã chọn từ! Bắt đầu đoán!",
      },
      "INFO",
    );

    // Start Timer
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    this.roundTimeout = setTimeout(() => {
      this.endRound({ en: "Time's up!", vi: "Hết thời gian!" });
    }, this.currentRoundDuration);
  }

  private handleSubmitGuess(payload: { playerId: string; text: string }) {
    if (!this.isHost) return;
    const { playerId, text } = payload;

    // Handle normal chat if not Gartic or not in guessing phase
    if (
      this.state.mode !== "GARTIC" ||
      !this.state.gartic ||
      this.state.gartic.status !== "DRAWING"
    ) {
      this.addChatMessage(playerId, text);
      return;
    }

    // Check if Paused
    if (this.state.gartic.isPaused) {
      // Can still chat while paused? Sure.
      this.addChatMessage(playerId, text);
      return;
    }

    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    // If drawer types, it's just chat (or prevent revealing?)
    if (playerId === this.state.gartic.drawerId) {
      this.addChatMessage(playerId, text);
      return;
    }

    // If already guessed correct, treat as chat
    if (this.state.guesses.includes(playerId)) {
      this.addChatMessage(playerId, text);
      return;
    }

    const guess = text.trim().toLowerCase();
    const correctIds = this.state.gartic.word.toLowerCase();

    if (guess === correctIds) {
      // CORRECT GUESS
      this.state.guesses.push(playerId);

      // Calculate Score
      // 1st: 10, 2nd: 8, 3rd: 6, others: 4
      const rank = this.state.guesses.length;
      let points = 0;
      if (rank === 1) points = 10;
      else if (rank === 2) points = 8;
      else if (rank === 3) points = 6;
      else points = 4;

      this.state.scores[playerId] = (this.state.scores[playerId] || 0) + points;

      // Give drawer points too (2 points per correct guess)
      const drawerId = this.state.gartic.drawerId;
      this.state.scores[drawerId] = (this.state.scores[drawerId] || 0) + 2;

      this.addSystemMessage(
        {
          en: `${player.username} guessed correctly!`,
          vi: `${player.username} đoán đúng!`,
        },
        "SUCCESS",
      );

      // Check if everyone guessed (excluding drawer)
      const guessersCount = this.players.length - 1;
      if (this.state.guesses.length >= guessersCount && guessersCount > 0) {
        this.endRound({
          en: "Everyone guessed correctly!",
          vi: "Mọi người đều đoán đúng!",
        });
      } else {
      }
    } else {
      // WRONG GUESS
      const similarity = calculateSimilarity(guess, correctIds);
      this.addChatMessage(playerId, text, similarity);
    }
  }

  private handleNextRound() {
    if (!this.isHost) return;
    this.startNewRound();
  }

  private handleSendMessage(payload: { playerId: string; text: string }) {
    if (!this.isHost) return;
    this.addChatMessage(payload.playerId, payload.text);
  }

  private handleRerollOptions(payload: { language: "en" | "vi" }) {
    if (!this.isHost) return;
    if (this.state.gartic?.status !== "CHOOSING_WORD") return;

    this.state.wordLanguage = payload.language;
    // Use current difficulty or default to easy
    const difficulty = this.state.wordDifficulty || "easy";
    const words = getWordsByDifficulty(difficulty, 3, payload.language);
    this.state.wordOptions = words;
  }

  private handleSelectDifficulty(payload: { difficulty: Difficulty }) {
    if (!this.isHost) return;
    if (this.state.gartic?.status !== "CHOOSING_WORD") return;

    this.state.wordDifficulty = payload.difficulty;
    const lang = this.state.wordLanguage || "vi";
    const words = getWordsByDifficulty(payload.difficulty, 3, lang);
    this.state.wordOptions = words;

    // Timeout is already running from startNewRound, no need to reset it unless we want to give more time?
    // Let's keep the original timeout to keep rounds brisk.
  }

  private handlePauseGame() {
    if (!this.isHost) return;
    if (
      !this.state.gartic ||
      (this.state.gartic.status !== "DRAWING" &&
        this.state.gartic.status !== "CHOOSING_WORD")
    )
      return;

    if (this.state.gartic.isPaused) {
      // RESUME
      this.state.gartic.isPaused = false;
      const remaining = this.state.gartic.pausedRemainingTime || 0;
      this.state.gartic.roundEndTime = Date.now() + remaining;
      this.state.gartic.pausedRemainingTime = undefined;

      // Restart timer
      if (this.roundTimeout) clearTimeout(this.roundTimeout);

      if (this.state.gartic.status === "CHOOSING_WORD") {
        // Resume picking word timeout
        this.roundTimeout = setTimeout(() => {
          if (this.state.gartic?.status === "CHOOSING_WORD") {
            this.handleChooseWord(this.state.wordOptions?.[0] || "apple");
          }
        }, remaining);
      } else {
        // Resume drawing timeout
        this.roundTimeout = setTimeout(() => {
          this.endRound({ en: "Time's up!", vi: "Hết thời gian!" });
        }, remaining);
      }

      // this.addSystemMessage("Game Resumed!", "INFO");
    } else {
      // PAUSE
      this.state.gartic.isPaused = true;
      const remaining = Math.max(
        0,
        this.state.gartic.roundEndTime - Date.now(),
      );
      this.state.gartic.pausedRemainingTime = remaining;

      // Clear timer
      if (this.roundTimeout) clearTimeout(this.roundTimeout);

      // this.addSystemMessage("Game Paused!", "WARNING");
    }
  }

  private handleBuyHint(playerId: string) {
    if (!this.isHost) return;
    if (!this.state.gartic || this.state.gartic.status !== "DRAWING") return;
    if (this.state.guesses.includes(playerId)) return; // Already guessed
    if (this.state.gartic.drawerId === playerId) return; // Drawer knows already

    const COST = 2;
    const currentScore = this.state.scores[playerId] || 0;

    // Assuming you can go below 0? Or restriction? Let's allow negative for fun or restrict to > 0?
    // User requirement: "lose some score to buy it"

    this.state.scores[playerId] = currentScore - COST;

    // Reveal a character
    const word = this.state.gartic.word;
    const revealedIndices = this.state.gartic.playerHints[playerId] || [];

    // Find unrevealed indices (ignoring spaces)
    const availableIndices = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] !== " " && !revealedIndices.includes(i)) {
        availableIndices.push(i);
      }
    }

    if (availableIndices.length > 0) {
      const randomIndex =
        availableIndices[Math.floor(Math.random() * availableIndices.length)];
      revealedIndices.push(randomIndex);

      // Update state
      this.state.gartic.playerHints[playerId] = revealedIndices;

      const player = this.players.find((p) => p.id === playerId);
      this.addSystemMessage(
        {
          en: `${player?.username} used a hint!`,
          vi: `${player?.username} đã sử dụng gợi ý!`,
        },
        "INFO",
      );
    }
  }

  // --- Helpers ---

  private startNewRound() {
    // Pick next drawer
    let nextDrawerIndex = 0;
    if (this.state.gartic) {
      const currentDrawerId = this.state.gartic.drawerId;
      const currentIndex = this.players.findIndex(
        (p) => p.id === currentDrawerId,
      );
      nextDrawerIndex = (currentIndex + 1) % this.players.length;
    }

    const drawer = this.players[nextDrawerIndex];
    if (!drawer) return; // Should not happen

    // Generate words - Default to Easy or previous difficulty
    const difficulty = this.state.wordDifficulty || "easy";
    const lang = this.state.wordLanguage || "vi"; // Use stored game language
    const words = getWordsByDifficulty(difficulty, 3, lang);

    this.state.wordOptions = words;
    this.state.guesses = [];

    this.state.gartic = {
      drawerId: drawer.id,
      word: "",
      status: "CHOOSING_WORD",
      roundEndTime: Date.now() + 15000,
      maskedWord: "",
      isPaused: false,
      playerHints: {},
    };

    this.addSystemMessage(
      {
        en: `Round starting! ${drawer.username} is choosing a word.`,
        vi: `Vòng mới bắt đầu! ${drawer.username} đang chọn từ.`,
      },
      "INFO",
    );

    // Timeout for choosing word
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    this.roundTimeout = setTimeout(() => {
      // Auto-pick if not chosen
      if (this.state.gartic?.status === "CHOOSING_WORD") {
        this.handleChooseWord(this.state.wordOptions?.[0] || "apple");
      }
    }, 15000);
  }

  private endRound(reason: { en: string; vi: string }) {
    if (this.roundTimeout) clearTimeout(this.roundTimeout);
    if (!this.state.gartic) return;

    this.state.gartic.status = "ROUND_END";
    this.state.gartic.maskedWord = this.state.gartic.word; // Reveal word
    this.state.gartic.roundEndTime = Date.now() + 5000; // 5s break

    this.addSystemMessage(
      {
        en: `Round Ended: ${reason.en}. The word was: ${this.state.gartic.word}`,
        vi: `Vòng kết thúc: ${reason.vi}. Từ cần đoán là: ${this.state.gartic.word}`,
      },
      "WARNING",
    );

    // Auto start next round after break
    this.roundTimeout = setTimeout(() => {
      this.startNewRound();
    }, 5000);
  }

  private addChatMessage(
    playerId: string,
    content: string,
    similarity?: number,
  ) {
    const msg: GameMessage = {
      id: Date.now().toString() + Math.random(),
      senderId: playerId,
      content,
      type: "CHAT",
      similarity,
      timestamp: Date.now(),
    };
    this.state.messages.push(msg);
    if (this.state.messages.length > 50) {
      this.state.messages.shift();
    }
  }

  private addSystemMessage(
    content: string | { en: string; vi: string },
    subType: "INFO" | "SUCCESS" | "WARNING" | "ERROR" = "INFO",
  ) {
    const msg: GameMessage = {
      id: Date.now().toString() + Math.random(),
      senderId: "SYSTEM",
      content,
      type: "SYSTEM",
      subType,
      timestamp: Date.now(),
    };
    this.state.messages.push(msg);
    if (this.state.messages.length > 50) {
      this.state.messages.shift();
    }
  }

  // Public methods for UI
  public startGartic() {
    this.makeAction({ type: "START_GARTIC" });
  }

  public chooseWord(word: string) {
    this.makeAction({ type: "CHOOSE_WORD", payload: word });
  }

  public submitGuess(text: string) {
    this.makeAction({
      type: "SUBMIT_GUESS",
      payload: { playerId: this.userId, text },
    });
  }

  public draw(stroke: DrawStroke) {
    this.makeAction({ type: "DRAW", payload: stroke });
  }

  public clear() {
    this.makeAction({ type: "CLEAR" });
  }

  public undo() {
    this.makeAction({ type: "UNDO", payload: this.userId });
  }

  public rerollOptions(language: "en" | "vi") {
    this.makeAction({ type: "REROLL_OPTIONS", payload: { language } });
  }

  public pauseGame() {
    this.makeAction({ type: "PAUSE_GAME" });
  }

  public buyHint() {
    this.makeAction({ type: "BUY_HINT", payload: this.userId });
  }

  public selectDifficulty(difficulty: Difficulty) {
    this.makeAction({ type: "SELECT_DIFFICULTY", payload: { difficulty } });
  }
}
