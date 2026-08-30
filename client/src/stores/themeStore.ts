import { create } from "zustand";
import { getSettings, saveSettings, type ThemeMode } from "../services/settings";

// 外观主题状态: 跟随系统 / 浅色 / 深色
// 持久化于 localStorage (AppSettings.themeMode); system 模式下监听系统外观变化实时切换

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

function resolveIsDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && systemPrefersDark());
}

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  // 系统外观变化时, 若当前为跟随系统模式则同步刷新
  window.matchMedia(DARK_QUERY).addEventListener("change", () => {
    if (get().mode === "system") set({ isDark: systemPrefersDark() });
  });

  const mode = getSettings().themeMode;
  return {
    mode,
    isDark: resolveIsDark(mode),
    setMode: (m) => {
      saveSettings({ themeMode: m });
      set({ mode: m, isDark: resolveIsDark(m) });
    },
  };
});
