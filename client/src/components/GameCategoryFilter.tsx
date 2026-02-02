import { useMemo, memo } from "react";
import { Filter, Star } from "lucide-react";
import useLanguage from "../stores/languageStore";
import { getAllCategories, getAllGames } from "../games/registry";
import { CATEGORY_CONFIG, type GameCategory } from "../constants";

interface GameCategoryFilterProps {
  selectedCategory: GameCategory | "favorites" | null;
  onSelectCategory: (category: GameCategory | "favorites" | null) => void;
  favoritesCount: number;
}

const GameCategoryFilter = memo(
  ({
    selectedCategory,
    onSelectCategory,
    favoritesCount,
  }: GameCategoryFilterProps) => {
    const { ti } = useLanguage();

    const games = useMemo(() => getAllGames(), []);
    const allCategories = useMemo(() => getAllCategories(), []);

    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-text-muted" />
        <button
          onClick={() => onSelectCategory(null)}
          className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
            selectedCategory === null
              ? "bg-primary/20 text-primary border-primary/30"
              : "bg-white/5 text-text-secondary border-white/10 hover:bg-white/10"
          }`}
        >
          {ti({ en: "All", vi: "Tất cả" })} ({games.length})
        </button>

        {/* Favorites Filter */}
        <button
          onClick={() => onSelectCategory("favorites")}
          className={`px-3 py-1.5 text-sm rounded-full border transition-all flex items-center gap-1.5 ${
            selectedCategory === "favorites"
              ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
              : "bg-white/5 text-text-secondary border-white/10 hover:bg-white/10"
          }`}
        >
          <Star
            className={`w-3.5 h-3.5 ${selectedCategory === "favorites" ? "fill-current" : ""}`}
          />
          {ti({ en: "Favorites", vi: "Yêu thích" })} ({favoritesCount})
        </button>

        {allCategories.map((category) => {
          const count = games.filter((g) =>
            g.categories.includes(category),
          ).length;
          return (
            <button
              key={category}
              onClick={() => onSelectCategory(category)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                selectedCategory === category
                  ? CATEGORY_CONFIG[category].color
                  : "bg-white/5 text-text-secondary border-white/10 hover:bg-white/10"
              }`}
            >
              {ti(CATEGORY_CONFIG[category].label)} ({count})
            </button>
          );
        })}
      </div>
    );
  },
);

export default GameCategoryFilter;
