import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import { formatNumber } from "../../utils";
import type { BauCuaSymbol, Bet } from "./types";
import { SYMBOL_NAMES, MIN_BET, MAX_SYMBOLS_PER_PLAYER } from "./types";
import useLanguage from "../../stores/languageStore";

interface BettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  onClear: () => void;
  symbol: BauCuaSymbol | null;
  currentBalance: number;
  currentBet: number;
  currentBets: Bet[];
}

export default function BettingModal({
  isOpen,
  onClose,
  onConfirm,
  onClear,
  symbol,
  currentBalance,
  currentBet,
  currentBets,
}: BettingModalProps) {
  const { ti } = useLanguage();
  const [amount, setAmount] = useState(currentBet);

  useEffect(() => {
    if (isOpen) {
      setAmount(currentBet);
    }
  }, [isOpen, currentBet]);

  if (!isOpen || !symbol) return null;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(Number(e.target.value));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = Number(e.target.value);
    if (val > currentBalance) val = currentBalance;
    setAmount(val);
  };

  const handleConfirm = () => {
    if (amount >= MIN_BET && amount <= currentBalance) {
      onConfirm(amount);
      onClose();
    }
  };

  const maxBet = currentBalance;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 glass-blur p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>{SYMBOL_NAMES[symbol].emoji}</span>
            <span>
              {ti({
                vi: `Cược vào ${SYMBOL_NAMES[symbol].vi}`,
                en: `Bet on ${SYMBOL_NAMES[symbol].en}`,
              })}
            </span>
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative">
          {currentBets.length >= MAX_SYMBOLS_PER_PLAYER &&
            !currentBets.find((b) => b[0] === symbol) && (
              <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center text-red-500">
                {ti({
                  en: `Can only have max ${MAX_SYMBOLS_PER_PLAYER} bets`,
                  vi: `Chỉ có thể cược nhiều nhất ${MAX_SYMBOLS_PER_PLAYER} linh vật`,
                })}
              </div>
            )}
          {/* Body */}
          <div className=" p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <label>{ti({ vi: "Số tiền cược", en: "Bet Amount" })}</label>
                <span>
                  {ti({ vi: "Số dư:", en: "Balance:" })}{" "}
                  <span className="text-green-400 font-bold">
                    {formatNumber(currentBalance)}
                  </span>
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={handleInputChange}
                  min={0}
                  max={maxBet}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-xl font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setAmount(maxBet)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors text-sm"
                >
                  {ti({ vi: "XẢ LÁNG", en: "MAX" })}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <input
                type="range"
                min={0}
                max={maxBet}
                step={10}
                value={amount}
                onChange={handleSliderChange}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-500 font-mono">
                <span>{formatNumber(0)}</span>
                <span>{formatNumber(maxBet / 2)}</span>
                <span>{formatNumber(maxBet)}</span>
              </div>
            </div>

            {/* Quick Amounts */}
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 5000].map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setAmount((prev) => Math.min(prev + val, maxBet))
                  }
                  disabled={amount + val > maxBet}
                  className="px-2 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
                >
                  +{formatNumber(val)}
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-800/50 flex gap-3">
            <button
              onClick={onClear}
              className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
            >
              {ti({ vi: "Xoá cược", en: "Clear bet" })}
            </button>
            <button
              onClick={handleConfirm}
              disabled={amount < MIN_BET || amount > maxBet}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              {ti({ vi: "Xác nhận", en: "Confirm" })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
