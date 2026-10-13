// QuickLink Windows 服务入口 —— NSSM 以 LocalSystem 账户启动本文件。
//
// 职责: 解析机器级配置 -> 注入环境变量 -> 加载 dist/app.js (Express 服务)。
//
// 为什么所有状态都放在 %ProgramData%\QuickLink 而不是 %APPDATA%\QuickLink:
// LocalSystem 的 %APPDATA% 解析到 C:\Windows\System32\config\systemprofile\AppData\Roaming,
// 与登录用户的目录无关, 且服务在任何人登录之前就已启动。
//
// 配置来源分工 (两套写入方各自的编码能力不同, 不要混用):
//   data_dir.txt / pending_migration.txt / jwt_secret.txt
//       由 NSIS 安装器写入。Unicode 安装器中 FileWrite 输出 ANSI 单字节, 中文路径会损坏,
//       因此安装器一律用 FileWriteUTF16LE, 本文件按 UTF-16LE 解码 (兼容历史上的错误编码)。
//   config.json
//       由本文件独占读写 (UTF-8), 存放 port / host / jwtSecret。安装器不直接改写它,
//       避免 NSIS 写 JSON 时的编码与转义问题; 安装器要传值就写上面的 txt 文件。
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const installDir = path.resolve(__dirname, "..");
const configDir =
  process.env.QUICKLINK_CONFIG_DIR ||
  path.join(process.env.ProgramData || "C:\\ProgramData", "QuickLink");
const configFile = path.join(configDir, "config.json");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

function log(...args) {
  console.log("[service]", ...args);
}

// 解码安装器写入的指针文件: 正常为 UTF-16LE 无 BOM;
// 同时兼容早期 FileWrite 误写的 "FF FE + 单字节 ANSI" 与纯 UTF-8 内容
function decodeText(buf) {
  const hasNull = buf.subarray(0, Math.min(8, buf.length)).some((b) => b === 0);
  let text;
  if (hasNull) {
    text = buf.toString("utf16le");
  } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.subarray(2).toString("utf8");
  } else {
    text = buf.toString("utf8");
  }
  return text.replace(/^\uFEFF/, "").trim();
}

function readPointerFile(name) {
  const file = path.join(configDir, name);
  try {
    if (!fs.existsSync(file)) return "";
    return decodeText(fs.readFileSync(file));
  } catch (err) {
    log(`failed to read ${name}:`, err.message);
    return "";
  }
}

function isWindowsAbsolutePath(p) {
  return typeof p === "string" && p !== "" && /^[A-Za-z]:[\\/]/.test(p);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

// ---- 数据目录 ----
// 优先级: QUICKLINK_DATA_DIR 环境变量 (nssm AppEnvironmentExtra 可覆盖) > 安装器写入的指针 > 机器级默认目录。
// 默认目录必须落在 ProgramData: LocalSystem 无法使用某个登录用户的 %USERPROFILE%。
function resolveDataDir() {
  const override = process.env.QUICKLINK_DATA_DIR;
  if (isWindowsAbsolutePath(override)) return override;

  const pointer = readPointerFile("data_dir.txt");
  if (isWindowsAbsolutePath(pointer)) return pointer;

  return path.join(configDir, "data");
}

const dataDir = resolveDataDir();

// 重装时更换数据目录: 安装器把旧目录写入 pending_migration.txt, 首次启动迁移 (仅复制不删除旧目录)。
// 复制失败保留提示文件待下次启动重试; 目标目录非空时视为已有数据, 丢弃提示以免覆盖。
function consumePendingMigration() {
  const hintFile = path.join(configDir, "pending_migration.txt");
  try {
    if (!fs.existsSync(hintFile)) return;
    const from = decodeText(fs.readFileSync(hintFile));
    const destEmpty = !fs.existsSync(dataDir) || fs.readdirSync(dataDir).length === 0;
    const srcHasData =
      isWindowsAbsolutePath(from) &&
      from !== dataDir &&
      fs.existsSync(from) &&
      fs.statSync(from).isDirectory() &&
      fs.readdirSync(from).length > 0;

    if (srcHasData && destEmpty) {
      fs.cpSync(from, dataDir, { recursive: true });
      log("migrated data from previous dir:", from, "->", dataDir);
    } else {
      log("migration hint discarded (from:", from, "| dest empty:", destEmpty, ")");
    }
    fs.unlinkSync(hintFile);
  } catch (err) {
    log("data dir migration failed:", err.message);
  }
}

// ---- JWT 密钥 ----
// 必须持久化: 每次启动随机会让已签发的 token 全部失效, 用户每次开机都要重新登录。
// 安装器把旧版 %APPDATA%\QuickLink\secrets.json 里的密钥写成 jwt_secret.txt 交接下来,
// 消费后删除该文件, 之后一律以 config.json 为准。
function resolveJwtSecret(config) {
  if (config.jwtSecret) return config.jwtSecret;

  const handed = readPointerFile("jwt_secret.txt");
  if (handed) {
    try {
      fs.unlinkSync(path.join(configDir, "jwt_secret.txt"));
    } catch {
      /* 删除失败不影响使用, 下次启动仍会被 config.json 短路 */
    }
    log("adopted JWT secret handed over by installer");
    return handed;
  }

  log("generated new JWT secret (existing sessions will need to log in again)");
  return crypto.randomBytes(32).toString("hex");
}

function main() {
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  consumePendingMigration();

  const config = readConfig();
  const jwtSecret = resolveJwtSecret(config);
  const host = process.env.QUICKLINK_HOST || config.host || DEFAULT_HOST;
  const port = parseInt(process.env.QUICKLINK_PORT || config.port || DEFAULT_PORT, 10);

  const next = { ...config, host, port, jwtSecret };
  if (JSON.stringify(next) !== JSON.stringify(config)) writeConfig(next);

  process.env.DATA_DIR = dataDir;
  process.env.STATIC_DIR = path.join(installDir, "public");
  process.env.NODE_ENV = "production";
  process.env.HOST = host;
  process.env.PORT = String(port);
  process.env.JWT_SECRET = jwtSecret;
  // app.ts 据此在 /api/health 中告知前端: 服务处于 session 0, 无法弹出 Typora / 资源管理器
  process.env.QUICKLINK_SERVICE_MODE = "1";

  log("install dir:", installDir);
  log("config dir:", configDir);
  log("data dir:", dataDir);
  log(`listening on ${host}:${port}`);

  require(path.join(__dirname, "dist", "app.js"));
}

try {
  main();
} catch (err) {
  // 写到 stderr 以便 NSSM 的 AppStderr 日志留痕; 退出码非 0 触发 NSSM 按 AppExit 策略重启
  console.error("[service] fatal startup error:", (err && err.stack) || err);
  process.exit(1);
}
