import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, Spin, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";
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
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    document.body.style.backgroundColor = isDark ? "#000" : "#f0f2f5";
  }, [isDark]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff" },
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
