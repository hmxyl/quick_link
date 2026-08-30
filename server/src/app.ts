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
import noteRoutes from "./modules/notes/routes";

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
  res.json({ success: true, message: "QuickLink API is running", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/links", linkRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/custom-icons", customIconRoutes);
app.use("/api/notes", noteRoutes);

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

    // Start server
    app.listen(env.PORT, () => {
      console.log(`[boot] QuickLink server running on port ${env.PORT}`);
      console.log(`[boot] Environment: ${env.NODE_ENV}`);
      console.log(`[boot] Data directory: ${env.DATA_DIR}`);
    });
  } catch (err) {
    console.error("[boot] Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap();

export default app;
