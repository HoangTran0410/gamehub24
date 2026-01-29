import { useEffect, useState } from "react";
import type { BaseGame } from "../games/BaseGame";

export default function useGameState<T>(
  game: BaseGame<T>,
  onUpdate?: (newSnapshot: T, set: (s: T) => void) => void,
): [T, (s: T) => void] {
  const [state, setState] = useState<T>(game.snapshot);

  useEffect(() => {
    const unsubscribe = game.onUpdate((newSnapshot: T) => {
      if (onUpdate) {
        onUpdate(newSnapshot, setState);
      } else {
        setState(newSnapshot);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [game, onUpdate]);

  return [state, setState];
}
