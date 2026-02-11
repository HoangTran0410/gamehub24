import { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import MauBinh from "./MauBinh";
import type {
  Card,
  MauBinhPlayer,
  RoundResult,
  ArrangementSuggestion,
  PostGameAnalysis,
} from "./types";
import {
  SUIT_SYMBOLS,
  RANK_DISPLAY,
  Suit,
  decodeCard,
  HAND_RANK_NAMES,
  GAME_PHASE_NAMES,
  INSTANT_WIN_NAMES,
  HandRank,
  InstantWin,
  HAND_RANK_DESC,
  INSTANT_WIN_DESC,
  SPECIAL_BONUS_NAMES,
  SpecialBonus,
  type SpecialBonusKey,
} from "./types";
import {
  User,
  Bot,
  X,
  Play,
  RotateCcw,
  BookOpen,
  Trophy,
  Clock,
  Sparkles,
  Check,
  AlertTriangle,
  Lightbulb,
  Brain,
  BarChart2,
  History as HistoryIcon,
  TrendingUp,
} from "lucide-react";
import type { GameUIProps } from "../types";
import { createPortal } from "react-dom";
import { useAlertStore } from "../../stores/alertStore";
import useGameState from "../../hooks/useGameState";
import useLanguage from "../../stores/languageStore";
import SoundManager, { SOUND_PRESETS } from "../../utils/SoundManager";

const RowKey = {
  BACK: "back",
  MIDDLE: "middle",
  FRONT: "front",
} as const;
type RowKey = (typeof RowKey)[keyof typeof RowKey];

export default function MauBinhUI({ game: baseGame }: GameUIProps) {
  const game = baseGame as MauBinh;
  const [state] = useGameState(game);
  const { ti, ts } = useLanguage();
  const { confirm: showConfirm } = useAlertStore();

  const [showRules, setShowRules] = useState(false);
  const [selectedAnalysisIndex, setSelectedAnalysisIndex] = useState<
    number | null
  >(null);
  const [arrangingRow, setArrangingRow] = useState<RowKey>(RowKey.BACK);
  const [isAuto, setIsAuto] = useState(false);

  // Player slots
  const [tempFront, setTempFront] = useState<Card[]>([]);
  const [tempMiddle, setTempMiddle] = useState<Card[]>([]);
  const [tempBack, setTempBack] = useState<Card[]>([]);

  const myIndex = game.getMyPlayerIndex();
  const mySlot = myIndex >= 0 ? state.players[myIndex] : null;
  const isHost = game.isHost;

  // Cards remaining in hand (not yet placed)
  const remainingCards = useMemo(() => {
    if (!mySlot) return [];
    const placed = new Set([...tempFront, ...tempMiddle, ...tempBack]);
    return mySlot.hand.filter((c) => !placed.has(c));
  }, [mySlot, tempFront, tempMiddle, tempBack]);

  // Check instant win
  const myInstantWin = useMemo(() => {
    if (!mySlot || mySlot.hand.length !== 13) return InstantWin.NONE;
    return game.checkInstantWinRaw(mySlot.hand);
  }, [mySlot, game]);

  // Hand evaluations for temp arrangement
  const frontEval = useMemo(() => {
    if (tempFront.length === 3) return game.evaluate3CardHand(tempFront);
    return null;
  }, [tempFront, game]);

  const middleEval = useMemo(() => {
    if (tempMiddle.length === 5) return game.evaluate5CardHand(tempMiddle);
    return null;
  }, [tempMiddle, game]);

  const backEval = useMemo(() => {
    if (tempBack.length === 5) return game.evaluate5CardHand(tempBack);
    return null;
  }, [tempBack, game]);

  // Arrangement validity
  const isArrangementComplete =
    tempFront.length === 3 && tempMiddle.length === 5 && tempBack.length === 5;
  const isArrangementValid = useMemo(() => {
    if (!isArrangementComplete) return false;
    return game.isValidArrangement(tempFront, tempMiddle, tempBack);
  }, [isArrangementComplete, tempFront, tempMiddle, tempBack, game]);

  // Reset temp on new game
  const prevPhase = useMemo(() => state.gamePhase, [state.gamePhase]);
  if (
    prevPhase === "arranging" &&
    tempFront.length === 0 &&
    tempMiddle.length === 0 &&
    tempBack.length === 0 &&
    mySlot &&
    !mySlot.isReady
  ) {
    // Fresh arranging phase — keep empty to let user arrange
  }

  // Handle card click
  const handleCardClick = useCallback(
    (card: Card) => {
      if (state.gamePhase !== "arranging" || !mySlot || mySlot.isReady) return;

      // Check if card is in a row — remove it
      if (tempFront.includes(card)) {
        setTempFront(tempFront.filter((c) => c !== card));
        return;
      }
      if (tempMiddle.includes(card)) {
        setTempMiddle(tempMiddle.filter((c) => c !== card));
        return;
      }
      if (tempBack.includes(card)) {
        setTempBack(tempBack.filter((c) => c !== card));
        return;
      }

      // Add to current arranging row
      if (arrangingRow === RowKey.BACK && tempBack.length < 5) {
        setTempBack([...tempBack, card]);
        if (tempBack.length + 1 === 5) setArrangingRow(RowKey.MIDDLE);
      } else if (arrangingRow === RowKey.MIDDLE && tempMiddle.length < 5) {
        setTempMiddle([...tempMiddle, card]);
        if (tempMiddle.length + 1 === 5) setArrangingRow(RowKey.FRONT);
      } else if (arrangingRow === RowKey.FRONT && tempFront.length < 3) {
        setTempFront([...tempFront, card]);
      }
      // Overflow: try next available
      else if (tempBack.length < 5) {
        setTempBack([...tempBack, card]);
      } else if (tempMiddle.length < 5) {
        setTempMiddle([...tempMiddle, card]);
      } else if (tempFront.length < 3) {
        setTempFront([...tempFront, card]);
      }

      setIsAuto(false);
      SoundManager.play("click");
    },
    [state.gamePhase, mySlot, arrangingRow, tempFront, tempMiddle, tempBack],
  );

  const handleSubmit = async () => {
    if (!isArrangementComplete) return;

    if (!isArrangementValid) {
      const confirmed = await showConfirm(
        ts({
          en: "Your arrangement is invalid (Fouled). You might lose many points. Submit anyway?",
          vi: "Bài của bạn đang bị Binh Lủng. Bạn có thể bị trừ rất nhiều điểm. Vẫn muốn nộp?",
        }),
        ts({ en: "Submit Anyway?", vi: "Vẫn nộp?" }),
      );
      if (!confirmed) return;
    }

    game.requestArrangeCards(tempFront, tempMiddle, tempBack, isAuto);
    SoundManager.play("click");
  };

  // Suggestion system
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = useMemo(() => {
    if (!mySlot || mySlot.hand.length === 0) return [];
    return game.generateSuggestions(mySlot.hand);
  }, [mySlot?.hand, game]);

  const handleApplySuggestion = useCallback((s: ArrangementSuggestion) => {
    setTempFront(s.front);
    setTempMiddle(s.middle);
    setTempBack(s.back);
    setIsAuto(true);
    setShowSuggestions(false);
    SoundManager.play("click");
  }, []);

  const handleClearArrangement = useCallback(() => {
    setTempFront([]);
    setTempMiddle([]);
    setTempBack([]);
    setArrangingRow(RowKey.BACK);
    setIsAuto(false);
  }, []);

  const handleDeclareInstantWin = useCallback(() => {
    game.requestDeclareInstantWin();
    SoundManager.play("click");
  }, [game]);

  // Arrange players around table (self at bottom)
  const arrangedPlayers = useMemo(() => {
    const arr: { player: MauBinhPlayer; index: number }[] = [];
    const total = state.players.length;
    for (let i = 0; i < total; i++) {
      const actualIndex = myIndex >= 0 ? (myIndex + i) % total : i;
      arr.push({ player: state.players[actualIndex], index: actualIndex });
    }
    return arr;
  }, [state.players, myIndex]);

  const postGameAnalysis = useMemo(() => {
    if (state.gamePhase !== "ended") return [];
    return game.computePostGameAnalysis(
      state.players,
      state.players.map((_, i) => i),
    );
  }, [state.players, state.gamePhase, game]);

  // Render game rules modal
  const renderGameRules = () => (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200"
      onClick={() => setShowRules(false)}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-slate-800 border-b border-slate-700 shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-yellow-500" />
            {ti({ en: "How to Play Mậu Binh", vi: "Luật Chơi Mậu Binh" })}
          </h2>
          <button
            onClick={() => setShowRules(false)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="md:p-6 p-4 overflow-y-auto space-y-8 text-slate-300">
          {/* Objective */}
          <section>
            <p className="text-base text-slate-100 italic border-l-4 border-yellow-500 pl-4 py-1 bg-yellow-500/10 rounded-r">
              {ti({
                en: "Arrange 13 cards into 3 hands (Back ≥ Middle ≥ Front) and compare with opponents.",
                vi: "Xếp 13 lá bài thành 3 chi (Đầu ≥ Giữa ≥ Cuối) rồi so bài với đối thủ.",
              })}
            </p>
          </section>

          {/* Game Rules */}
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              {ti({ en: "Card Arrangement", vi: "Cách Xếp Bài" })}
            </h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex justify-between border-b border-slate-800 pb-1">
                <span>{ti({ en: "Back (Chi đầu)", vi: "Chi đầu" })}</span>
                <span className="font-bold text-red-400">
                  {ti({ en: "5 cards — Strongest", vi: "5 lá — Mạnh nhất" })}
                </span>
              </li>
              <li className="flex justify-between border-b border-slate-800 pb-1">
                <span>{ti({ en: "Middle (Chi giữa)", vi: "Chi giữa" })}</span>
                <span className="font-bold text-blue-400">
                  {ti({ en: "5 cards", vi: "5 lá" })}
                </span>
              </li>
              <li className="flex justify-between border-b border-slate-800 pb-1">
                <span>{ti({ en: "Front (Chi cuối)", vi: "Chi cuối" })}</span>
                <span className="font-bold text-green-400">
                  {ti({ en: "3 cards — Weakest", vi: "3 lá — Yếu nhất" })}
                </span>
              </li>
              <li className="text-xs text-red-400 italic mt-2">
                {ti({
                  en: "⚠ Back ≥ Middle ≥ Front required, or you get Fouled (auto-lose)!",
                  vi: "⚠ Chi đầu ≥ Chi giữa ≥ Chi cuối bắt buộc, nếu không sẽ bị Binh Lủng (thua)!",
                })}
              </li>
            </ul>
          </section>

          {/* Hand Rankings */}
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              {ti({ en: "Hand Rankings", vi: "Thứ Tự Tay Bài" })}
              <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded ml-auto">
                {ti({ en: "Strongest to Weakest", vi: "Từ mạnh đến yếu" })}
              </span>
            </h3>
            <div className="space-y-0 text-sm">
              {Object.values(HandRank)
                .reverse()
                .map((rank, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center p-2 rounded ${i % 2 === 0 ? "bg-slate-800/50" : ""}`}
                  >
                    <div
                      className={`flex items-center gap-2 px-2 py-0.5 rounded-full border ${getHandStyle(rank)}`}
                    >
                      <Trophy className={`w-3 h-3 ${getHandIconColor(rank)}`} />
                      <span className="font-bold">
                        {ti(HAND_RANK_NAMES[rank])}
                      </span>
                    </div>
                    <span className="text-slate-400 text-sm">
                      {ti(HAND_RANK_DESC[rank])}
                    </span>
                  </div>
                ))}
            </div>
          </section>

          {/* Instant Wins */}
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              {ti({ en: "Instant Wins", vi: "Mậu Binh Tới Trắng" })}
            </h3>
            <p className="text-base text-slate-100 italic border-l-4 border-yellow-500 pl-4 py-1 mb-2 bg-yellow-500/10 rounded-r">
              {ti({
                en: "Win immediately if you have one of these hands",
                vi: "Thắng ngay lập tức nếu có 1 trong các tay bài sau",
              })}
            </p>
            <div className="space-y-0 text-sm">
              {Object.values(InstantWin)
                .filter((win) => win !== InstantWin.NONE)
                .map((win, i) => (
                  <div
                    key={i}
                    className={`flex justify-between items-center p-2 rounded ${i % 2 === 0 ? "bg-amber-900/20" : ""}`}
                  >
                    <div className="flex items-center gap-2 px-2 py-0.5 rounded-full border bg-amber-900/50 border-amber-500/30 text-amber-200">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span className="font-bold">
                        {ti(INSTANT_WIN_NAMES[win])}
                      </span>
                    </div>
                    <span className="text-slate-400 text-sm">
                      {ti(INSTANT_WIN_DESC[win])}
                    </span>
                  </div>
                ))}
            </div>
          </section>

          {/* Card Comparison */}
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              {ti({ en: "Comparison", vi: "Cách So Bài" })}
            </h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 font-bold">•</span>
                <span>
                  {ti({
                    en: "Hands are compared one by one: Back vs Back, Middle vs Middle, Front vs Front.",
                    vi: "So sánh từng chi tương ứng: Chi đầu vs Chi đầu, Giữa vs Giữa, Cuối vs Cuối.",
                  })}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-500 font-bold">•</span>
                <span>
                  {ti({
                    en: "Winning a chi grants +1 point, losing a chi takes -1 point.",
                    vi: "Thắng mỗi chi được +1 điểm, thua mỗi chi bị -1 điểm.",
                  })}
                </span>
              </li>
            </ul>
          </section>

          {/* Scoring & Bonuses */}
          <section>
            <h3 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              {ti({ en: "Scoring & Bonuses", vi: "Tính Điểm & Thưởng" })}
            </h3>
            <div className="space-y-4">
              {/* Special Bonuses Table */}
              <div className="space-y-0 text-sm">
                {(Object.keys(SpecialBonus) as SpecialBonusKey[]).map(
                  (key, i) => (
                    <div
                      key={i}
                      className={`flex justify-between items-center p-2 rounded ${i % 2 === 0 ? "bg-slate-800/50" : ""}`}
                    >
                      <span className="text-slate-200">
                        {ti(SPECIAL_BONUS_NAMES[key])}
                      </span>
                      <span className="font-bold text-green-400">
                        +{SpecialBonus[key]}
                      </span>
                    </div>
                  ),
                )}
              </div>

              {/* Extra Rules */}
              <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  <p>
                    <span className="font-bold text-indigo-300 mr-1">
                      {ti({ en: "Scoop (Sập 3 chi):", vi: "Sập 3 chi:" })}
                    </span>
                    {ti({
                      en: "Win all 3 hands against an opponent to get +3 bonus.",
                      vi: "Thắng cả 3 chi trước 1 đối thủ được thưởng thêm +3.",
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Brain className="w-4 h-4 text-indigo-400 shrink-0" />
                  <p>
                    <span className="font-bold text-indigo-300 mr-1">
                      {ti({ en: "Manual Bonus:", vi: "Thưởng thủ công:" })}
                    </span>
                    {ti({
                      en: "Win without using auto-arrange to get +1 extra bonus.",
                      vi: "Thắng mà không dùng gợi ý được thưởng thêm +1.",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col w-full h-full bg-slate-900 text-white relative overflow-hidden select-none mb-16!">
      <div className="flex flex-col gap-2">
        {/* Opponents Row (top) */}
        <div className="flex justify-center gap-2 px-2 py-2 pt-6">
          {arrangedPlayers.slice(1).map((ap) => (
            <PlayerSlot
              key={ap.index}
              player={ap.player}
              isSelf={false}
              isHost={isHost}
              gamePhase={state.gamePhase}
              ti={ti}
              onAddBot={() => game.requestAddBot(ap.index)}
              onRemove={() => game.requestRemovePlayer(ap.index)}
              onShowAnalytics={(() => {
                const analysis = postGameAnalysis.find(
                  (a) => a.playerIndex === ap.index,
                );
                if (analysis && analysis.optimalScore > analysis.actualScore) {
                  return () => {
                    const idx = postGameAnalysis.findIndex(
                      (a) => a.playerIndex === ap.index,
                    );
                    if (idx !== -1) setSelectedAnalysisIndex(idx);
                  };
                }
                return undefined;
              })()}
              game={game}
            />
          ))}
        </div>

        {/* Scoreboard */}
        {state.players.some((p) => p.id !== null && p.score !== 0) && (
          <div className="flex justify-center gap-3 px-2 py-1">
            {state.players
              .filter((p) => p.id !== null)
              .map((p, i) => (
                <div key={i} className="flex items-center gap-1 text-xs">
                  <span className="text-slate-400 truncate max-w-[60px]">
                    {p.username}:
                  </span>
                  <span
                    className={
                      p.score > 0
                        ? "text-green-400 font-bold"
                        : p.score < 0
                          ? "text-red-400 font-bold"
                          : "text-slate-500"
                    }
                  >
                    {p.score > 0 ? "+" : ""}
                    {p.score}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Table area (middle) */}
        <div className="flex flex-col items-center justify-center gap-2 p-2 border border-slate-700 rounded-xl bg-slate-800/50 min-h-40">
          {/* Timer */}
          {state.gamePhase === "arranging" && (
            <Timer
              timerEndsAt={state.timerEndsAt}
              isReady={!!mySlot?.isReady}
            />
          )}

          {/* Phase label */}
          <div className="bg-black/40 px-3 py-1 rounded-full border border-slate-600 text-xs text-slate-300">
            {ti(GAME_PHASE_NAMES[state.gamePhase])}
            {state.roundNumber > 0 && (
              <span className="ml-1.5 text-slate-500">
                {ti({
                  en: `Round ${state.roundNumber}`,
                  vi: `Ván ${state.roundNumber}`,
                })}
              </span>
            )}
          </div>

          {/* Results */}
          {state.gamePhase === "ended" && state.roundResults.length > 0 && (
            <div className="bg-slate-900/80 px-3 py-2 rounded-xl border border-yellow-500/30 w-full max-w-xs">
              <h3 className="text-yellow-400 font-bold text-md mb-1 flex items-center justify-center gap-1">
                <Trophy className="w-3 h-3" />
                {ti({ en: "Results", vi: "Kết quả" })}
              </h3>
              <div className="space-y-0.5">
                {state.roundResults.map((r: RoundResult, i: number) => {
                  const p1 = state.players[r.p1Index];
                  const p2 = state.players[r.p2Index];
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs bg-slate-800/50 px-1.5 py-0.5 rounded"
                    >
                      <span
                        className={
                          r.p1Total > 0
                            ? "text-green-400 font-bold"
                            : r.p1Total < 0
                              ? "text-red-400"
                              : "text-slate-400"
                        }
                      >
                        {p1.username} ({r.p1Total > 0 ? "+" : ""}
                        {r.p1Total})
                      </span>
                      <span className="text-slate-500 mx-1">vs</span>
                      <span
                        className={
                          r.p2Total > 0
                            ? "text-green-400 font-bold"
                            : r.p2Total < 0
                              ? "text-red-400"
                              : "text-slate-400"
                        }
                      >
                        {p2.username} ({r.p2Total > 0 ? "+" : ""}
                        {r.p2Total})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Self player slot */}
        {arrangedPlayers.length > 0 && (
          <div className="flex justify-center px-2 py-1">
            <PlayerSlot
              player={arrangedPlayers[0].player}
              isSelf={true}
              isHost={isHost}
              gamePhase={state.gamePhase}
              ti={ti}
              onAddBot={() => game.requestAddBot(arrangedPlayers[0].index)}
              onRemove={() =>
                game.requestRemovePlayer(arrangedPlayers[0].index)
              }
              onShowAnalytics={(() => {
                const analysis = postGameAnalysis.find(
                  (a) => a.playerIndex === arrangedPlayers[0].index,
                );
                if (analysis && analysis.optimalScore > analysis.actualScore) {
                  return () => {
                    const idx = postGameAnalysis.findIndex(
                      (a) => a.playerIndex === arrangedPlayers[0].index,
                    );
                    if (idx !== -1) setSelectedAnalysisIndex(idx);
                  };
                }
                return undefined;
              })()}
              game={game}
            />
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="w-full shrink-0 bg-slate-900/90 glass-blur z-20">
        {/* Arranging Phase — Card Selection UI */}
        {state.gamePhase === "arranging" && mySlot && !mySlot.isReady && (
          <>
            <div className="px-2 py-3 space-y-3">
              {/* Row indicators */}
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    title: ts({ en: "BACK (5)", vi: "CHI ĐẦU (5)" }),
                    key: RowKey.BACK,
                    cards: tempBack,
                    eval: backEval,
                    size: 5,
                  },
                  {
                    title: ts({ en: "MIDDLE (5)", vi: "CHI GIỮA (5)" }),
                    key: RowKey.MIDDLE,
                    cards: tempMiddle,
                    eval: middleEval,
                    size: 5,
                  },
                  {
                    title: ts({ en: "FRONT (3)", vi: "CHI CUỐI (3)" }),
                    key: RowKey.FRONT,
                    cards: tempFront,
                    eval: frontEval,
                    size: 3,
                  },
                ].map((row) => {
                  return (
                    <div
                      key={row.key}
                      onClick={() => setArrangingRow(row.key)}
                      className={`p-2 px-0 rounded-lg border-2 cursor-pointer transition-all ${arrangingRow === row.key ? "border-red-500 bg-red-500/10" : "border-slate-700 bg-slate-800/50"}`}
                    >
                      <div className="text-[10px] font-bold text-center mb-2">
                        <span>{row.title}</span>
                        <br />
                        {row.eval && (
                          <span
                            className={`mt-2 px-1.5 py-0.5 rounded-full border ${getHandStyle(row.eval.rank)}`}
                          >
                            {ti(HAND_RANK_NAMES[row.eval.rank])}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-center gap-0.5 min-h-[40px] flex-wrap">
                        {row.cards.map((c) => (
                          <motion.div key={c} layoutId={`card-${c}`} layout>
                            <MiniCard
                              card={c}
                              onClick={() => handleCardClick(c)}
                              highlight
                            />
                          </motion.div>
                        ))}
                        {Array(row.size - row.cards.length)
                          .fill(null)
                          .map((_, i) => (
                            <div
                              key={`e-${i}`}
                              className="w-8 h-11 border border-dashed border-slate-600 rounded bg-slate-800/30"
                            />
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Remaining cards */}
              <div className="flex flex-wrap justify-center gap-1 px-1">
                {remainingCards.map((c) => (
                  <motion.div key={c} layoutId={`card-${c}`} layout>
                    <CardDisplay
                      card={c}
                      size="md"
                      onClick={() => handleCardClick(c)}
                      className="cursor-pointer hover:scale-110 hover:-translate-y-1 transition-all"
                    />
                  </motion.div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {/* Instant Win */}
                {myInstantWin !== InstantWin.NONE && (
                  <button
                    onClick={handleDeclareInstantWin}
                    className="px-4 py-2.5 bg-linear-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-900/30 animate-pulse"
                  >
                    <Sparkles className="w-4 h-4" />
                    {ti(INSTANT_WIN_NAMES[myInstantWin])}
                  </button>
                )}

                {/* Suggest */}
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                    showSuggestions
                      ? "bg-purple-500 ring-2 ring-purple-300"
                      : "bg-purple-700 hover:bg-purple-600"
                  }`}
                >
                  <Lightbulb className="w-4 h-4" />
                  {ti({ en: "Suggest", vi: "Gợi ý" })}
                </button>

                {/* Clear */}
                <button
                  onClick={handleClearArrangement}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-sm flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {ti({ en: "Clear", vi: "Xoá" })}
                </button>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!isArrangementComplete}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg ${
                    isArrangementComplete
                      ? isArrangementValid
                        ? "bg-green-600 hover:bg-green-500 shadow-green-900/30"
                        : "bg-orange-600 hover:bg-orange-500 shadow-orange-900/30"
                      : "bg-slate-600 cursor-not-allowed opacity-50"
                  }`}
                >
                  <Check className="w-4 h-4" />
                  {!isArrangementComplete ? (
                    ti({ en: "Place all cards", vi: "Xếp hết bài" })
                  ) : isArrangementValid ? (
                    ti({ en: "Submit", vi: "Xác nhận" })
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {ti({ en: "Submit (Fouled!)", vi: "Xác nhận (Lủng!)" })}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Suggestion Panel */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="px-2 pb-2">
                <div className="flex gap-1 flex-wrap pb-1 justify-center">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleApplySuggestion(s)}
                      className="shrink-0 bg-slate-800 border border-purple-500/40 hover:border-purple-400 rounded-xl p-2.5 text-left transition-all hover:bg-slate-700 min-w-[140px]"
                    >
                      <div className="text-xs font-bold text-purple-300 mb-1.5 text-center">
                        {ti(s.label)}
                      </div>
                      <div className="flex flex-col gap-1.5 ">
                        {/* Back */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border mb-0.5 ${getHandStyle(s.backRank)}`}
                          >
                            <span className="text-xs font-bold">
                              {ti(HAND_RANK_NAMES[s.backRank])}
                            </span>
                          </div>
                          <div className="flex -space-x-1">
                            {s.back.map((c, j) => (
                              <TinyCard key={j} card={c} />
                            ))}
                          </div>
                        </div>

                        {/* Middle */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border mb-0.5 ${getHandStyle(s.middleRank)}`}
                          >
                            <span className="text-xs font-bold">
                              {ti(HAND_RANK_NAMES[s.middleRank])}
                            </span>
                          </div>
                          <div className="flex -space-x-1">
                            {s.middle.map((c, j) => (
                              <TinyCard key={j} card={c} />
                            ))}
                          </div>
                        </div>

                        {/* Front */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border mb-0.5 ${getHandStyle(s.frontRank)}`}
                          >
                            <span className="text-xs font-bold">
                              {ti(HAND_RANK_NAMES[s.frontRank])}
                            </span>
                          </div>
                          <div className="flex -space-x-1">
                            {s.front.map((c, j) => (
                              <TinyCard key={j} card={c} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Arranging — Already submitted */}
        {state.gamePhase === "arranging" && mySlot?.isReady && (
          <div className="flex items-center justify-center p-4 text-slate-400">
            <Check className="w-5 h-5 mr-2 text-green-500" />
            {ti({ en: "Waiting for others...", vi: "Đang chờ người khác..." })}
          </div>
        )}

        {/* Waiting Room */}
        {state.gamePhase === "waiting" && isHost && (
          <div className="w-full flex justify-center p-3">
            {state.players.filter((p) => p.id !== null).length >= 2 ? (
              <button
                onClick={() => game.requestStartGame()}
                className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-lg shadow-lg shadow-green-900/20 w-full @md:w-auto"
              >
                {ti({ en: "Start Game", vi: "Bắt đầu" })}
              </button>
            ) : (
              <div className="px-8 py-3 bg-slate-700/50 rounded-xl font-bold text-lg text-slate-400 border border-slate-600 w-full @md:w-auto text-center cursor-not-allowed">
                {ti({
                  en: "Waiting for players (min 2)...",
                  vi: "Đang chờ người chơi (tối thiểu 2)...",
                })}
              </div>
            )}
          </div>
        )}

        {/* Ended */}
        {state.gamePhase === "ended" && isHost && (
          <div className="w-full flex justify-center items-center gap-4 p-3">
            <button
              onClick={() => {
                handleClearArrangement();
                game.requestStartGame();
              }}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-lg shadow-lg shadow-green-900/40 flex items-center gap-2 transition-all transform hover:scale-105"
            >
              <Play className="w-5 h-5" />
              {ti({ en: "Next Round", vi: "Ván tiếp" })}
            </button>
            <button
              onClick={async () => {
                if (
                  await showConfirm(
                    ts({
                      en: "Reset all scores?",
                      vi: "Reset điểm và chơi lại?",
                    }),
                    ts({ en: "Reset", vi: "Reset" }),
                  )
                ) {
                  handleClearArrangement();
                  game.requestResetGame();
                }
              }}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-lg border border-slate-600 flex items-center gap-2 text-slate-300 hover:text-white transition-all"
            >
              <RotateCcw className="w-5 h-5" />
              {ti({ en: "Reset", vi: "Reset" })}
            </button>
          </div>
        )}
      </div>

      {/* Analytics Modal */}
      {selectedAnalysisIndex !== null &&
        postGameAnalysis &&
        postGameAnalysis[selectedAnalysisIndex] &&
        createPortal(
          <AnalyticsModal
            analysis={postGameAnalysis[selectedAnalysisIndex]}
            player={
              state.players[postGameAnalysis[selectedAnalysisIndex].playerIndex]
            }
            ti={ti}
            ts={ts}
            onClose={() => setSelectedAnalysisIndex(null)}
          />,
          document.body,
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

function Timer({
  timerEndsAt,
  isReady,
}: {
  timerEndsAt: number;
  isReady: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const timeLeft = Math.max(0, Math.floor((timerEndsAt - now) / 1000));

  // Timer sound and visual effect
  useEffect(() => {
    if (timeLeft <= 10 && timeLeft > 0 && !isReady) {
      SoundManager.play(SOUND_PRESETS.tick);
    }
  }, [timeLeft, isReady]);

  return (
    <div
      className={`bg-black/60 px-4 py-2 rounded-xl border flex items-center gap-2 transition-all duration-300 ${
        timeLeft <= 5
          ? "border-red-500 scale-110 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse"
          : timeLeft <= 10
            ? "border-red-500 animate-pulse"
            : "border-yellow-500/30"
      }`}
    >
      <Clock
        className={`w-4 h-4 ${timeLeft <= 10 ? "text-red-500" : "text-yellow-500"}`}
      />
      <span
        className={`font-bold text-xl font-mono ${timeLeft <= 10 ? "text-red-400" : "text-yellow-400"}`}
      >
        {timeLeft}s
      </span>
    </div>
  );
}

// ===================== PLAYER SLOT =====================

function PlayerSlot({
  player,
  isSelf,
  isHost,
  gamePhase,
  ti,
  onAddBot,
  onRemove,
  onShowAnalytics,
  game,
}: {
  player: MauBinhPlayer;
  isSelf: boolean;
  isHost: boolean;
  gamePhase: string;
  ti: (s: { en: string; vi: string }) => React.ReactNode;
  onAddBot: () => void;
  onRemove: () => void;
  onShowAnalytics?: () => void;
  game: MauBinh;
}) {
  const isEmpty = player.id === null;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
        <div className="w-14 h-14 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center bg-black/20 text-slate-400">
          <User className="w-6 h-6" />
        </div>
        {gamePhase === "waiting" && isHost && (
          <button
            onClick={onAddBot}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center gap-1"
          >
            <Bot className="w-3 h-3" /> Bot
          </button>
        )}
      </div>
    );
  }

  const showCards = gamePhase === "comparing" || gamePhase === "ended";

  return (
    <div
      className={`relative flex flex-col items-center p-2 rounded-xl transition-all duration-300 min-w-[100px] @md:min-w-[150px] ${
        player.isReady && gamePhase === "arranging"
          ? "ring-2 ring-green-400 bg-green-900/20"
          : player.isFouled
            ? "ring-2 ring-red-500 bg-red-900/20"
            : player.instantWin !== InstantWin.NONE && showCards
              ? "ring-2 ring-amber-400 bg-amber-900/20 animate-pulse"
              : "bg-slate-900/60 ring-1 ring-slate-700"
      }`}
    >
      {/* Instant Win Badge */}
      {player.instantWin !== InstantWin.NONE && showCards && (
        <div className="absolute -top-5 bg-linear-to-r from-amber-600 to-yellow-500 px-2 py-0.5 rounded-full text-[10px] font-bold text-white flex items-center gap-1 shadow-lg z-30 whitespace-nowrap">
          <Sparkles className="w-3 h-3" />
          {ti(INSTANT_WIN_NAMES[player.instantWin])}
        </div>
      )}

      {/* Fouled Badge */}
      {player.isFouled && showCards && (
        <div className="absolute -top-5 bg-red-600 px-2 py-0.5 rounded-full text-[10px] font-bold text-white flex items-center gap-1 shadow-lg z-30">
          <AlertTriangle className="w-3 h-3" />
          {ti({ en: "Fouled!", vi: "Binh Lủng!" })}
        </div>
      )}

      {/* Player info */}
      <div className="flex items-center gap-1 mb-1 max-w-[150px]">
        {player.isBot && <Bot className="w-3 h-3 text-blue-400" />}
        <span className="text-xs font-bold">{player.username}</span>
      </div>
      {player.isReady && gamePhase === "arranging" && (
        <Check className="w-4 h-4 text-green-500" />
      )}

      {/* Score */}
      {gamePhase !== "arranging" && (
        <div
          className={`text-xs font-mono px-2 py-0.5 rounded-full mb-1 ${
            player.score > 0
              ? "bg-green-900/50 text-green-400"
              : player.score < 0
                ? "bg-red-900/50 text-red-400"
                : "bg-slate-800/50 text-slate-400"
          }`}
        >
          {player.score > 0 ? "+" : ""}
          {player.score}
        </div>
      )}

      {/* Manual Bonus Badge */}
      {showCards &&
        !player.usedAuto &&
        !player.isBot &&
        !player.isFouled &&
        player.score > 0 && (
          <div className="mb-1 bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 px-1.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-0.5">
            🧠 {ti({ en: "Manual +1", vi: "Thủ công +1" })}
          </div>
        )}

      {/* Cards — show when comparing/ended */}
      {showCards && player.back.length > 0 && (
        <div className="flex flex-col gap-0.5 items-center mt-1">
          {[player.back, player.middle, player.front].map((hand) => {
            const rank = game.evaluate5CardHand(hand).rank;
            return (
              <div
                key={hand + ""}
                className="flex flex-col items-center gap-0.5"
              >
                <div
                  className={`flex items-center gap-2 px-2 py-0.5 rounded-full border ${getHandStyle(rank)}`}
                >
                  <span className="text-xs font-bold">
                    {ti(HAND_RANK_NAMES[rank])}
                  </span>
                </div>

                <div className="flex -space-x-1">
                  {hand.map((c, i) => (
                    <TinyCard key={i} card={c} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cards — card backs during arranging */}
      {gamePhase === "arranging" && !isSelf && player.hand.length > 0 && (
        <div className="flex flex-wrap justify-center -space-x-1 max-w-[60px] mt-1">
          {Array(3)
            .fill(null)
            .map((_, i) => (
              <div
                key={i}
                className="w-3.5 h-5 bg-blue-900 rounded-sm border border-white/20"
              />
            ))}
        </div>
      )}

      {/* Analytics Button at the very bottom */}
      {gamePhase === "ended" &&
        (onShowAnalytics ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowAnalytics();
            }}
            className="mt-3 w-full px-3 py-1.5 bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50 hover:ring-indigo-300 animate-pulse-slow group"
          >
            <Sparkles className="w-3 h-3 text-yellow-300 group-hover:scale-125 transition-transform" />
            <span className="text-white drop-shadow-sm">
              {ti({ en: "Better way?", vi: "Cách xếp tốt hơn?" })}
            </span>
          </button>
        ) : null)}

      {/* Host controls */}
      {isHost && gamePhase === "waiting" && player.isBot && (
        <button
          onClick={onRemove}
          className="absolute top-0 right-0 w-5 h-5 bg-red-600/80 rounded-full flex items-center justify-center text-white hover:bg-red-500 z-30"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ===================== CARD COMPONENTS =====================

function CardDisplay({
  card,
  size = "md",
  className = "",
  onClick,
}: {
  card: Card;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
}) {
  const { rank, suit } = decodeCard(card);
  const isRed = suit === Suit.HEART || suit === Suit.DIAMOND;
  const sizeClasses = {
    sm: "w-9 h-13 text-[11px]",
    md: "w-12 h-17 text-sm",
    lg: "w-14 h-20 text-base",
  };

  return (
    <div
      onClick={onClick}
      className={`${sizeClasses[size]} bg-white rounded-md shadow-lg border border-slate-300 flex flex-col items-center justify-between p-0.5 select-none animate-[cardPlay_0.3s_ease-out_forwards] ${className}`}
    >
      <div
        className={`self-start font-bold leading-none ${isRed ? "text-red-600" : "text-slate-900"}`}
      >
        {RANK_DISPLAY[rank]}
      </div>
      <div className={`${isRed ? "text-red-500" : "text-slate-800"} text-lg`}>
        {SUIT_SYMBOLS[suit]}
      </div>
      <div className="h-2" />
    </div>
  );
}

function MiniCard({
  card,
  onClick,
  highlight,
}: {
  card: Card;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const { rank, suit } = decodeCard(card);
  const isRed = suit === Suit.HEART || suit === Suit.DIAMOND;

  return (
    <div
      onClick={onClick}
      className={`w-8 h-11 bg-white rounded-sm shadow border flex flex-col items-center justify-center select-none text-xs font-bold leading-tight animate-[cardPlay_0.3s_ease-out_forwards] ${
        highlight
          ? "ring-1 ring-yellow-400 cursor-pointer hover:scale-110 transition-transform"
          : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <span className={isRed ? "text-red-600" : "text-slate-900"}>
        {RANK_DISPLAY[rank]}
      </span>
      <span className={`text-xs ${isRed ? "text-red-500" : "text-slate-800"}`}>
        {SUIT_SYMBOLS[suit]}
      </span>
    </div>
  );
}

function TinyCard({ card }: { card: Card }) {
  const { rank, suit } = decodeCard(card);
  const isRed = suit === Suit.HEART || suit === Suit.DIAMOND;

  return (
    <div className="w-6 h-10 bg-white rounded-sm border border-slate-300 flex flex-col items-center justify-center select-none leading-none animate-[cardPlay_0.3s_ease-out_forwards]">
      <span
        className={`text-xs font-bold ${isRed ? "text-red-600" : "text-slate-900"}`}
      >
        {RANK_DISPLAY[rank]}
      </span>
      <span className={`text-xs ${isRed ? "text-red-500" : "text-slate-800"}`}>
        {SUIT_SYMBOLS[suit]}
      </span>
    </div>
  );
}

// ===================== HAND STYLE HELPERS =====================

const getHandStyle = (rank?: HandRank) => {
  if (rank === undefined)
    return "bg-slate-900/90 border-slate-500/50 text-slate-200";

  switch (rank) {
    case HandRank.STRAIGHT_FLUSH:
      return "bg-purple-900/90 border-purple-500/50 text-purple-200 shadow-purple-900/50";
    case HandRank.FOUR_OF_A_KIND:
    case HandRank.FULL_HOUSE:
      return "bg-red-900/90 border-red-500/50 text-red-100 shadow-red-900/50";
    case HandRank.FLUSH:
    case HandRank.STRAIGHT:
      return "bg-blue-900/90 border-blue-500/50 text-blue-100 shadow-blue-900/50";
    case HandRank.THREE_OF_A_KIND:
    case HandRank.TWO_PAIR:
      return "bg-green-900/90 border-green-500/50 text-green-100 shadow-green-900/50";
    default:
      return "bg-slate-800/90 border-slate-500/50 text-slate-300 shadow-slate-900/50";
  }
};

const getHandIconColor = (rank?: HandRank) => {
  if (rank === undefined) return "text-slate-400";
  switch (rank) {
    case HandRank.STRAIGHT_FLUSH:
      return "text-purple-400";
    case HandRank.FOUR_OF_A_KIND:
    case HandRank.FULL_HOUSE:
      return "text-red-400";
    case HandRank.FLUSH:
    case HandRank.STRAIGHT:
      return "text-blue-400";
    case HandRank.THREE_OF_A_KIND:
    case HandRank.TWO_PAIR:
      return "text-green-400";
    default:
      return "text-slate-400";
  }
};

// ===================== ANALYTICS COMPONENTS =====================

function PlayerAnalysisContent({
  analysis,
  player,
  ti,
  ts,
}: {
  analysis: PostGameAnalysis;
  player: MauBinhPlayer;
  ti: (s: { en: string; vi: string }) => React.ReactNode;
  ts: (s: { en: string; vi: string }) => string;
}) {
  const strength = Math.round(
    (analysis.actualScore / analysis.optimalScore) * 100,
  );

  return (
    <div className="bg-slate-900/60 rounded-xl p-3 w-full @md:max-w-sm">
      <div className="flex justify-between items-center mb-2">
        <div className="text-md text-white font-bold flex items-center gap-1.5">
          {player.username}
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <div className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-bold border border-orange-500/30">
            {ti({ en: "Better than", vi: "Tốt hơn" })} {100 - strength}%
          </div>
          {analysis.optimalPoints > analysis.actualPoints && (
            <div className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold border border-green-500/30 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />+
              {analysis.optimalPoints - analysis.actualPoints}
              <span className="text-[8px] opacity-70 ml-0.5">pts</span>
            </div>
          )}
        </div>
      </div>

      {/* Arrangements Comparison */}
      <div className="mt-4">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="flex flex-col gap-1">
            <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
              <HistoryIcon className="w-3 h-3" />
              {ti({ en: "Current", vi: "Hiện tại" })}
            </div>
            <div
              className={`text-xs font-mono font-bold ${analysis.actualPoints >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {analysis.actualPoints > 0 ? "+" : ""}
              {analysis.actualPoints} pts
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-xs font-bold text-indigo-400 uppercase flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {ti({ en: "Optimal", vi: "Tối ưu" })}
            </div>
            <div className="text-xs font-mono font-bold text-indigo-300">
              {analysis.optimalPoints > 0 ? "+" : ""}
              {analysis.optimalPoints} pts
            </div>
          </div>
        </div>

        <div className="space-y-1">
          {[
            {
              label: ts({ en: "Back", vi: "Đầu" }),
              actual: analysis.actual.back,
              actualRank: analysis.actualBackRank,
              optimal: analysis.optimal.back,
              optimalRank: analysis.optimalBackRank,
            },
            {
              label: ts({ en: "Middle", vi: "Giữa" }),
              actual: analysis.actual.middle,
              actualRank: analysis.actualMiddleRank,
              optimal: analysis.optimal.middle,
              optimalRank: analysis.optimalMiddleRank,
            },
            {
              label: ts({ en: "Front", vi: "Cuối" }),
              actual: analysis.actual.front,
              actualRank: analysis.actualFrontRank,
              optimal: analysis.optimal.front,
              optimalRank: analysis.optimalFrontRank,
            },
          ].map((row, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2">
              {/* Actual */}
              <div className="bg-slate-800/40 p-1 rounded-lg border border-slate-700/30 relative">
                <span className="absolute -top-1 -left-1 px-1 bg-slate-700 text-[8px] rounded font-bold text-slate-400 z-10 border border-slate-600/50">
                  {row.label}
                </span>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold leading-none ${getHandStyle(row.actualRank)}`}
                  >
                    {ti(HAND_RANK_NAMES[row.actualRank])}
                  </div>
                  <div className="flex -space-x-1.5">
                    {row.actual.map((c, i) => (
                      <TinyCard key={i} card={c} />
                    ))}
                  </div>
                </div>
              </div>
              {/* Optimal */}
              <div className="bg-indigo-900/20 p-1 rounded-lg border border-indigo-500/20 relative">
                <span className="absolute -top-1 -right-1 px-1 bg-indigo-800 text-[8px] rounded font-bold text-indigo-300 z-10 border border-indigo-500/30">
                  {row.label}
                </span>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold leading-none ${getHandStyle(row.optimalRank)}`}
                  >
                    {ti(HAND_RANK_NAMES[row.optimalRank])}
                    {row.optimalRank > row.actualRank && (
                      <span className="ml-0.5 text-green-400">↑</span>
                    )}
                  </div>
                  <div className="flex -space-x-1.5">
                    {row.optimal.map((c, i) => (
                      <TinyCard key={i} card={c} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsModal({
  analysis,
  player,
  ti,
  ts,
  onClose,
}: {
  analysis: PostGameAnalysis;
  player: MauBinhPlayer;
  ti: (s: { en: string; vi: string }) => React.ReactNode;
  ts: (s: { en: string; vi: string }) => string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <h3 className="text-xl font-bold flex items-center gap-2 text-indigo-400">
            <BarChart2 className="w-6 h-6" />
            {ti({ en: "Cards Analytics", vi: "Phân tích xếp bài" })}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-2 overflow-y-auto custom-scrollbar">
          <PlayerAnalysisContent
            analysis={analysis}
            player={player}
            ti={ti}
            ts={ts}
          />
        </div>
      </div>
    </div>
  );
}
