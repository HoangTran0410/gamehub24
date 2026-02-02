import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  enableGlassEffects: boolean;
  setEnableGlassEffects: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      enableGlassEffects: false,
      setEnableGlassEffects: (enabled) => set({ enableGlassEffects: enabled }),
    }),
    {
      name: "gamehub_settings",
    },
  ),
);
