import React, { Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ConfigProvider, Spin, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useAuthStore } from "./stores/authStore";
import { useThemeStore } from "./stores/themeStore";
import { getSettings, type AppSettings } from "./services/settings";
import AppLayout from "./layout/AppLayout";
import { PageVisibilityContext } from "./hooks/usePageVisibility";

// 路由级懒加载: 各页面组件仅在访问对应路由时才下载
const LoginPage = React.lazy(() => import("./modules/user/LoginPage"));
const RegisterPage = React.lazy(() => import("./modules/user/RegisterPage"));
const LinksPage = React.lazy(() => import("./modules/links/LinksPage"));
const NotesPage = React.lazy(() => import("./modules/notes/NotesPage"));
const ApiPage = React.lazy(() => import("./modules/api/ApiPage"));

/**
 * 页面缓存组件: 所有模块页面首次访问后通过 CSS display 缓存, 避免反复卸载/重建
 * - 笔记管理: Milkdown/ProseMirror 重型编辑器保持挂载, 避免反复销毁/重建导致卡顿与崩溃
 * - 链接管理/接口管理: 首次挂载后缓存 DOM 与数据, 切换模块时零延迟
 * 不活跃页面通过 display:none 隐藏, 浏览器不渲染不可见元素, 内存开销可忽略
 */
const CachedPages: React.FC = () => {
  const { pathname } = useLocation();
  // 记录已访问页面, 首次访问后保持挂载
  const [visited, setVisited] = React.useState(() => new Set([pathname]));
  if (!visited.has(pathname)) {
    setVisited(new Set(visited).add(pathname));
  }

  const fallback = <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 40 }}><Spin /></div>;

  return (
    <>
      <div style={{ display: pathname === "/notes" ? "block" : "none", width: "100%", height: "100%" }}>
        {visited.has("/notes") && <Suspense fallback={fallback}><NotesPage /></Suspense>}
      </div>
      <div style={{ display: pathname === "/links" ? "block" : "none", width: "100%", height: "100%" }}>
        {visited.has("/links") && <Suspense fallback={fallback}><LinksPage /></Suspense>}
      </div>
      <div style={{ display: pathname === "/api" ? "block" : "none", width: "100%", height: "100%" }}>
        {visited.has("/api") && <Suspense fallback={fallback}><ApiPage /></Suspense>}
      </div>
    </>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

/**
 * 路由与可见性 Context 包装器: 在 BrowserRouter 内部提供当前路径
 * 子组件通过 usePageVisibility() 判断自身是否处于可见状态
 */
const AppRoutes: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <PageVisibilityContext.Provider value={pathname}>
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
        {/* 使用单一 CachedPages 实例处理所有模块路由, 通过 CSS display 缓存已访问页面 */}
        <Route path=":module" element={<CachedPages />} />
        <Route path="tags" element={<Navigate to="/links" replace />} />
      </Route>
    </Routes>
    </PageVisibilityContext.Provider>
  );
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
        <Suspense fallback={
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
            <Spin size="large" />
          </div>
        }>
        <AppRoutes />
        </Suspense>
        </BrowserRouter>
      )}
    </ConfigProvider>
  );
};

export default App;
