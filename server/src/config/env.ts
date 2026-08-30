import dotenv from "dotenv";
import path from "path";

// Load .env from project root (3 levels up: server/src/config -> project root)
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

export const env = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  DATA_DIR: path.isAbsolute(process.env.DATA_DIR || "")
    ? path.resolve(process.env.DATA_DIR as string)
    : path.join(PROJECT_ROOT, process.env.DATA_DIR || "user_data"),
  JWT_SECRET: process.env.JWT_SECRET || "default-jwt-secret-change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "2h",
  // 笔记附件存储目录 (数据目录下的 attachment 文件夹)
  get ATTACH_DIR() {
    return path.join(this.DATA_DIR, "attachment");
  },
};
