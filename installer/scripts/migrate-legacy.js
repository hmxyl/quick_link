// 安装期一次性迁移脚本, 由安装器在复制文件之后、注册服务之前调用。
//
// 为什么必须由安装器而不是服务自己来做: 服务以 LocalSystem 运行, 它的 %APPDATA% 指向
// C:\Windows\System32\config\systemprofile\AppData\Roaming, 根本看不到登录用户的目录;
// 而安装器以安装用户身份运行, 能读到旧版 Electron 桌面版留下的 secrets.json。
//
// 作用: 把旧版 %APPDATA%\QuickLink\secrets.json 里的 JWT 密钥交接到
// %ProgramData%\QuickLink\jwt_secret.txt, 由 service.js 首次启动时采用,
// 避免升级到服务版后所有已签发 token 失效、用户被强制重新登录。
//
// 幂等: 目标已就绪时直接退出, 重复安装不会产生副作用。
const fs = require("fs");
const path = require("path");

const configDir =
  process.env.QUICKLINK_CONFIG_DIR ||
  path.join(process.env.ProgramData || "C:\\ProgramData", "QuickLink");
const targetFile = path.join(configDir, "jwt_secret.txt");

function log(...args) {
  console.log("[migrate-legacy]", ...args);
}

function alreadyDone() {
  if (fs.existsSync(targetFile)) return true;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf8"));
    return !!config.jwtSecret;
  } catch {
    return false;
  }
}

// 早期版本的 userData 误用了包名目录 (%APPDATA%\quicklink-desktop), 两处都要找
function legacySecretFiles() {
  const appData = process.env.APPDATA;
  if (!appData) return [];
  return [
    path.join(appData, "QuickLink", "secrets.json"),
    path.join(appData, "quicklink-desktop", "secrets.json"),
  ];
}

function main() {
  if (alreadyDone()) {
    log("JWT secret already present, nothing to migrate");
    return;
  }

  for (const file of legacySecretFiles()) {
    let secret;
    try {
      secret = JSON.parse(fs.readFileSync(file, "utf8")).JWT_SECRET;
    } catch {
      continue;
    }
    if (typeof secret !== "string" || !secret) continue;

    fs.mkdirSync(configDir, { recursive: true });
    // 写 UTF-8 即可: service.js 的 decodeText 在无 NUL 字节且无 FF FE 前缀时按 UTF-8 解析
    fs.writeFileSync(targetFile, secret);
    log("handed over JWT secret from", file);
    return;
  }

  log("no legacy secrets.json found, service will generate a fresh JWT secret");
}

try {
  main();
} catch (err) {
  // 迁移失败不应阻断安装: 最坏结果是用户升级后需要重新登录一次
  log("migration failed (non-fatal):", (err && err.message) || err);
}
