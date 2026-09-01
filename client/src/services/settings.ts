// 客户端本地设置与凭据记忆 (localStorage)

/** 外观主题: system=跟随系统 / light=浅色 / dark=深色 */
export type ThemeMode = "system" | "light" | "dark";

export interface AppSettings {
  /** 开机自启动 (仅桌面版生效, 由 Electron 主进程落地) */
  autoLaunch: boolean;
  /** 记住密码: 本地保存凭据并在登录页回填 */
  rememberPassword: boolean;
  /** 自动登录: 启动时若存在已保存凭据则静默登录 */
  autoLogin: boolean;
  /** 外观主题, 默认跟随系统 */
  themeMode: ThemeMode;
}

export interface SavedCredentials {
  username: string;
  password: string;
}

const SETTINGS_KEY = "quicklink:settings";
const CRED_KEY = "quicklink:savedCredentials";

const DEFAULT_SETTINGS: AppSettings = {
  autoLaunch: false,
  rememberPassword: false,
  autoLogin: false,
  themeMode: "system",
};

export function getSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ---- 凭据记忆 (base64 轻度混淆, 仅本机使用) ----

function encode(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function decode(text: string): string {
  return decodeURIComponent(escape(atob(text)));
}

export function getSavedCredentials(): SavedCredentials | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CRED_KEY) || "null");
    if (!raw || !raw.username || !raw.password) return null;
    return { username: decode(raw.username), password: decode(raw.password) };
  } catch {
    return null;
  }
}

export function saveCredentials(username: string, password: string): void {
  localStorage.setItem(
    CRED_KEY,
    JSON.stringify({ username: encode(username), password: encode(password) })
  );
}

export function clearCredentials(): void {
  localStorage.removeItem(CRED_KEY);
}

// ---- Electron 桌面桥接 (preload 注入, Web 环境不存在) ----

export interface QuickLinkBridge {
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    quicklink?: QuickLinkBridge;
  }
}

export const isDesktop = (): boolean => typeof window !== "undefined" && !!window.quicklink;
