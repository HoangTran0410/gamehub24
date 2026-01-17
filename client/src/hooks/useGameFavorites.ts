import { useState } from "react";

const STORAGE_KEY = "gamehub24_favorites";

export function useGameFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse favorites", e);
      return [];
    }
  });

  const toggleFavorite = (gameId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    setFavorites((prev) => {
      const newFavorites = prev.includes(gameId)
        ? prev.filter((id) => id !== gameId)
        : [...prev, gameId];

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
      return newFavorites;
    });
  };

  const isFavorite = (gameId: string) => favorites.includes(gameId);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    favoritesCount: favorites.length,
  };
}
