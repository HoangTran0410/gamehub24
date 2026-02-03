import { useState, memo } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Play, Star } from "lucide-react";
import useLanguage from "../stores/languageStore";
import { formatTimeAgo } from "../utils";
import { updates, UpdateTypeColor } from "../constants";

const RecentUpdates = memo(
  ({ onOpenGame }: { onOpenGame: (gameId: string) => void }) => {
    const { ti } = useLanguage();
    const [showUpdates, setShowUpdates] = useState(false);

    return (
      <div className="mt-2 flex flex-col justify-center items-center">
        <button
          onClick={() => setShowUpdates(!showUpdates)}
          className="w-full max-w-[350px] flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-200 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Star className="w-4 h-4" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-medium text-text-primary">
                {ti({ en: "Last update: ", vi: "Cập nhật mới: " })}
                <span className="text-text-secondary">
                  {ti(
                    formatTimeAgo(Math.max(...updates.map((u) => u.timestamp))),
                  )}
                </span>
              </h3>
            </div>
          </div>
          {showUpdates ? (
            <ChevronUp className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors" />
          )}
        </button>

        {/* Collapsible Content */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            showUpdates
              ? "max-h-[500px] opacity-100 mt-2"
              : "max-h-0 opacity-0 mt-0"
          }`}
        >
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-left">
            <ul className="space-y-3 text-sm text-text-secondary">
              {updates.map((update, i) => (
                <li
                  key={update.type + update.timestamp + i}
                  className="flex items-center gap-1"
                >
                  <strong
                    className={`text-xs px-1 py-0.5 rounded-full font-mono ${UpdateTypeColor[update.type]}`}
                  >
                    {update.type}
                  </strong>{" "}
                  <span className="text-text-secondary font-mono text-xs bg-slate-500/30 px-1.5 py-0.5 rounded-full">
                    {ti(formatTimeAgo(update.timestamp))}
                  </span>
                  {update.link ? (
                    <a
                      href={update.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline cursor-pointer"
                    >
                      {ti(update)} <ExternalLink className="w-4 h-4 inline" />
                    </a>
                  ) : update.gameId ? (
                    <button
                      onClick={() => onOpenGame(update.gameId || "")}
                      className="text-blue-500 hover:underline cursor-pointer"
                    >
                      {ti(update)} <Play className="w-4 h-4 inline" />
                    </button>
                  ) : (
                    ti(update)
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  },
);

export default RecentUpdates;
