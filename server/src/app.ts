import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { env } from "./config/env";
import { runMigrations } from "./services/migrateService";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./modules/user/routes";
import linkRoutes from "./modules/links/routes";
import accountRoutes from "./modules/links/accounts.routes";
import tagRoutes from "./modules/links/tags.routes";
import customIconRoutes from "./modules/links/customIcons.routes";
import presetColorRoutes from "./modules/links/presetColors.routes";
import noteRoutes from "./modules/notes/routes";
import apiRoutes from "./modules/api/routes";

const app = express();

// Global middleware
app.use(helmet({
  // Allow inline scripts/styles from Vite-built frontend when served statically
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, error: "Too many requests" },
});
app.use("/api/", limiter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "QuickLink API is running",
    timestamp: new Date().toISOString(),
    // 服务模式 (Windows 服务, session 0) 下无法在用户桌面弹出 GUI, 前端据此隐藏相关入口
    capabilities: { launchNativeGui: !env.SERVICE_MODE },
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/links", linkRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/custom-icons", customIconRoutes);
app.use("/api/preset-colors", presetColorRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/api-manager", apiRoutes);

// Serve built frontend (production / desktop packaged mode)
const staticDir = process.env.STATIC_DIR;
if (staticDir && fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // SPA fallback: non-API routes return index.html for client-side routing
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

// Error handler
app.use(errorHandler);

// Bootstrap
async function bootstrap() {
  try {
    // Run migrations
    await runMigrations();
    console.log("[boot] Database migrations complete");

    const onListening = () => {
      console.log(`[boot] QuickLink server running on ${env.HOST || "0.0.0.0"}:${env.PORT}`);
      console.log(`[boot] Environment: ${env.NODE_ENV}`);
      console.log(`[boot] Data directory: ${env.DATA_DIR}`);
    };

    // Start server (显式指定 HOST 时仅绑定该地址, 否则保持监听全部网卡的原有语义)
    const server = env.HOST
      ? app.listen(env.PORT, env.HOST, onListening)
      : app.listen(env.PORT, onListening);

    // Windows 服务停止/系统关机时 NSSM 发送 CTRL_BREAK (Node 映射为 SIGBREAK);
    // 直接终止进程会丢掉 NeDB 尚未落盘的写入, 因此先关闭 HTTP 服务再退出
    const shutdown = (signal: string) => {
      console.log(`[boot] ${signal} received, shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGBREAK", () => shutdown("SIGBREAK"));
  } catch (err) {
    console.error("[boot] Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap();

export default app;
