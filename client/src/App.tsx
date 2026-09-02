import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, Spin, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";
import { getSettings, type AppSettings } from "./services/settings";
import AppLayout from "./layout/AppLayout";
import LoginPage from "./modules/user/LoginPage";
import RegisterPage from "./modules/user/RegisterPage";
import LinksPage from "./modules/links/LinksPage";
import NotesPage from "./modules/notes/NotesPage";
import ApiPage from "./modules/api/ApiPage";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  // 启动时尝试自动登录 (未登录且开启自动登录时静默登录, 避免登录页闪烁)
  const [ready, setReady] = useState(() => useAuthStore.getState().isAuthenticated);
  useEffect(() => {
    if (ready) return;
    useAuthStore.getState().autoLogin().finally(() => setReady(true));
  }, [ready]);

  // 外观主题: 跟随系统/浅色/深色; data-theme 驱动自定义 CSS (markdown.css) 的深色覆盖
  const isDark = useThemeStore((s) => s.isDark);
  // 全局字体: 从 localStorage 读取, 设置页修改后通过 storage 事件实时同步
  const [fontFamily, setFontFamily] = useState(() => getSettings().fontFamily);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    document.body.style.backgroundColor = isDark ? "#000" : "#f0f2f5";
  }, [isDark]);
  const resolvedFont = fontFamily
    ? `${fontFamily}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
    : "";
  useEffect(() => {
    document.body.style.fontFamily = resolvedFont;
    // CSS 变量供子组件 (如接口管理代码区) 继承用户字体
    document.documentElement.style.setProperty("--ql-font-family", resolvedFont);
  }, [resolvedFont]);
  // 监听设置页修改字体: 通过自定义事件实时同步
  useEffect(() => {
    const handler = (e: Event) => {
      const s = (e as CustomEvent<AppSettings>).detail;
      setFontFamily(s.fontFamily);
    };
    window.addEventListener("quicklink:settings-changed", handler);
    return () => window.removeEventListener("quicklink:settings-changed", handler);
  }, []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff", ...(fontFamily ? { fontFamily: `${fontFamily}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` } : {}) },
      }}
    >
      {!ready ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
          <Spin size="large" />
        </div>
      ) : (
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/links" replace />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="api" element={<ApiPage />} />
            <Route path="tags" element={<Navigate to="/links" replace />} />
          </Route>
        </Routes>
        </BrowserRouter>
      )}
    </ConfigProvider>
  );
};

export default App;
