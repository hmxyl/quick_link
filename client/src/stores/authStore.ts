import { create } from "zustand";
import type { User } from "../types";
import { authApi } from "../services/api";
import { getSettings, getSavedCredentials, saveCredentials, clearCredentials } from "../services/settings";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  /** 启动时凭已保存凭据静默登录 (自动登录开关开启时) */
  autoLogin: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token"),
  isAuthenticated: !!localStorage.getItem("token"),
  loading: false,

  login: async (username, password) => {
    set({ loading: true });
    try {
      const res = await authApi.login({ username, password });
      if (res.success && res.data) {
        localStorage.setItem("token", res.data.token);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        // 记住密码: 保存/清除本地凭据
        if (getSettings().rememberPassword) saveCredentials(username, password);
        else clearCredentials();
        set({ user: res.data.user, token: res.data.token, isAuthenticated: true, loading: false });
      }
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  register: async (username, email, password) => {
    set({ loading: true });
    try {
      const res = await authApi.register({ username, email, password });
      if (res.success && res.data) {
        localStorage.setItem("token", res.data.token);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        set({ user: res.data.user, token: res.data.token, isAuthenticated: true, loading: false });
      }
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ user: null, token: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      const res = await authApi.getMe();
      if (res.success && res.data) {
        localStorage.setItem("user", JSON.stringify(res.data));
        set({ user: res.data });
      }
    } catch {
      // Token invalid, will be handled by interceptor
    }
  },

  autoLogin: async () => {
    if (!getSettings().autoLogin) return false;
    const cred = getSavedCredentials();
    if (!cred) return false;
    try {
      await get().login(cred.username, cred.password);
      return true;
    } catch {
      return false;
    }
  },
}));
