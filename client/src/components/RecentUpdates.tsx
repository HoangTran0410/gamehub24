import { useState } from "react";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import useLanguage from "../stores/languageStore";
import { formatTimeAgo } from "../utils";

type UpdateType = "new" | "hot" | "fix";

const UpdateTypeColor: Record<UpdateType, string> = {
  new: "text-green-500",
  hot: "text-red-500",
  fix: "text-yellow-500",
};

const updates: {
  type: UpdateType;
  en: string;
  vi: string;
  timestamp: number;
  link?: string;
}[] = [
  {
    type: "fix",
    en: "New game mode: Draw & Guess",
    vi: "Chế độ game mới: Vẽ & Đoán",
    timestamp: 1769331150517,
  },
  {
    type: "new",
    en: "Emoji in all games",
    vi: "Thả emoji trong mọi game",
    timestamp: 1769331150517,
  },
  {
    type: "fix",
    en: "Optimize server bandwidth",
    vi: "Tối ưu băng thông server",
    timestamp: 1769274000000,
  },
  {
    type: "new",
    en: "New game: Poker",
    vi: "Game mới: Xì tố (Poker)",
    timestamp: 1769274000000,
  },
  {
    type: "hot",
    en: "Welcome to Gamehub24",
    vi: "Chào mừng đến với Gamehub24",
    timestamp: 1769101200000,
    link: "https://www.facebook.com/groups/indiehackervn/posts/2062449634542598",
  },
];

export default function RecentUpdates() {
  const { ti } = useLanguage();
  const [showUpdates, setShowUpdates] = useState(false);

  return (
    <div className="mt-4 flex flex-col justify-center items-center">
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
              {ti({ en: "Last update: ", vi: "Cập nhật cuối: " })}
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
                {/* <span
                  className={`w-1.5 h-1.5 rounded-full ${UpdateTypeColor[update.type]} mt-1.5 shrink-0`}
                /> */}
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
                    className="text-blue-500 hover:underline"
                  >
                    {ti(update)}
                  </a>
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
}
