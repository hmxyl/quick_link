// QuickLink desktop shell
// Runs the Express server in-process and opens the web UI in a BrowserWindow.
const { app, BrowserWindow, dialog, shell, ipcMain, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const net = require("net");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const isPackaged = app.isPackaged;

// Resource locations differ between dev and packaged app
const serverDir = isPackaged
  ? path.join(process.resourcesPath, "server")
  : path.join(__dirname, "..", "server");
const publicDir = isPackaged
  ? path.join(process.resourcesPath, "public")
  : path.join(__dirname, "..", "client", "dist");

// 用户数据目录 (笔记/附件/数据库文件): 安装向导可指定存放位置, 选择结果写入 %APPDATA%\QuickLink\data_dir.txt
// (卸载不清理该指针文件, 重装/升级后沿用上次选择); 未选择或指针无效时回退默认目录: 用户目录下的 .quick_link
// userData = %APPDATA%\QuickLink (依赖 package.json 顶层 productName; 早期版本误用包名目录, 见下方 legacyUserData 迁移)
const userData = app.getPath("userData");
const installDir = path.dirname(app.getPath("exe"));

// Persist startup logs for troubleshooting
// (尽早建立日志流, 使下方 resolveDataDir / 数据恢复的日志也能写入 startup.log)
const logFile = path.join(userData, "startup.log");
try {
  fs.mkdirSync(userData, { recursive: true });
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  const writeLog = (prefix, args) => {
    try {
      logStream.write(`[${new Date().toISOString()}] ${prefix} ${args.map((a) => String(a)).join(" ")}\n`);
    } catch { /* ignore */ }
  };
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => { origLog(...args); writeLog("[info]", args); };
  console.error = (...args) => { origErr(...args); writeLog("[error]", args); };
  process.on("uncaughtException", (err) => {
    writeLog("[uncaught]", [err && err.stack || err]);
    origErr(err);
  });
} catch { /* logging is best-effort */ }

// 解析数据目录指针/迁移提示文件内容: 安装器以 UTF-16LE 写入 (FileWriteUTF16LE, 无 BOM, 中文路径正确);
// 同时兼容早期 FileWrite 误写的 "FF FE + 单字节 ANSI" 与纯 UTF-8 内容
function decodeDirText(buf) {
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

function resolveDataDir() {
  // 默认位置: 用户目录下的 .quick_link (与安装向导默认值一致); 安装时可改到任意绝对路径
  const defaultDir = path.join(os.homedir(), ".quick_link");
  const pointer = path.join(userData, "data_dir.txt");
  try {
    if (!fs.existsSync(pointer)) return defaultDir;
    const text = decodeDirText(fs.readFileSync(pointer));
    if (!text || !path.isAbsolute(text) || !/^[A-Za-z]:[\\/]/.test(text)) return defaultDir;
    fs.mkdirSync(text, { recursive: true });
    console.log("[desktop] custom user data dir ->", text);
    return text;
  } catch (err) {
    console.error("[desktop] custom data dir unavailable, fallback to default:", err);
    return defaultDir;
  }
}

const newDataDir = resolveDataDir();
const legacyDataDir = path.join(userData, "data");
// 卸载时由 uninstall-backup.nsh 把安装目录内的 user_data 备份到 %APPDATA%\QuickLink, 重装后首次启动恢复 (卸载不清理 %APPDATA%)
const backupDataDir = path.join(userData, "user_data");
// 早期版本 userData 误用包名 (%APPDATA%\quicklink-desktop), 其中的 secrets.json 与 data 需迁移, 否则密钥丢失导致密文不可解
const legacyUserData = path.join(path.dirname(userData), "quicklink-desktop");
// 早期版本数据目录固定在安装目录下, 指针缺失且数据仍在时迁移到新目录
const legacyInstallDataDir = path.join(installDir, "user_data");

// 重装时更换数据目录: 安装器把旧目录写入 %APPDATA%\QuickLink\pending_migration.txt, 首次启动将其数据迁移到新目录
// (新目录为空且旧目录有数据时复制, 仅复制不删除旧目录; 完成后消费提示文件; 复制失败保留提示文件待下次启动重试)
const migrationHint = path.join(userData, "pending_migration.txt");
try {
  if (fs.existsSync(migrationHint)) {
    const from = decodeDirText(fs.readFileSync(migrationHint));
    const destEmpty = !fs.existsSync(newDataDir) || fs.readdirSync(newDataDir).length === 0;
    const srcHasData = from && from !== newDataDir && fs.existsSync(from) && fs.statSync(from).isDirectory() && fs.readdirSync(from).length > 0;
    if (srcHasData && destEmpty) {
      fs.cpSync(from, newDataDir, { recursive: true });
      console.log("[desktop] migrated data from previous dir ->", from, "->", newDataDir);
    } else {
      console.log("[desktop] migration hint discarded (from:", from, ", dest empty:", destEmpty, ")");
    }
    fs.unlinkSync(migrationHint);
  }
} catch (err) {
  console.error("[desktop] data dir migration failed:", err);
}

try {
  if (fs.existsSync(legacyUserData) && legacyUserData !== userData) {
    const legacySecrets = path.join(legacyUserData, "secrets.json");
    if (!fs.existsSync(path.join(userData, "secrets.json")) && fs.existsSync(legacySecrets)) {
      fs.mkdirSync(userData, { recursive: true });
      fs.copyFileSync(legacySecrets, path.join(userData, "secrets.json"));
      console.log("[desktop] migrated secrets.json from legacy userData ->", userData);
    }
  }
} catch (err) {
  console.error("[desktop] legacy userData migration failed:", err);
}

// 数据目录为空时按优先级恢复: 卸载备份 > 旧版 %APPDATA%\data > 早期包名目录下的 data > 安装目录残留 user_data
// (排除与目标目录相同的来源避免自拷贝; 服务端启动时再做 notes.db 文件化迁移)
try {
  const hasData = fs.existsSync(newDataDir) && fs.readdirSync(newDataDir).length > 0;
  if (!hasData) {
    const sources = [
      [backupDataDir, "uninstall backup"],
      [legacyDataDir, "legacy data dir"],
      [path.join(legacyUserData, "data"), "legacy userData data dir"],
      [legacyInstallDataDir, "legacy install data dir"],
    ];
    for (const [src, label] of sources) {
      if (src === newDataDir) continue;
      if (fs.existsSync(src)) {
        fs.cpSync(src, newDataDir, { recursive: true });
        console.log(`[desktop] restored data from ${label} ->`, newDataDir);
        break;
      }
    }
  }
} catch (err) {
  console.error("[desktop] data dir restore failed:", err);
}

process.env.DATA_DIR = newDataDir;
process.env.STATIC_DIR = publicDir;
process.env.NODE_ENV = "production";

// Persist generated secrets so JWT tokens stay valid across restarts
const secretsFile = path.join(userData, "secrets.json");
try {
  let secrets = {};
  try {
    secrets = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
  } catch {
    /* first launch */
  }
  if (!secrets.JWT_SECRET) {
    secrets.JWT_SECRET = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(secretsFile, JSON.stringify(secrets, null, 2));
  }
  process.env.JWT_SECRET = secrets.JWT_SECRET;
} catch (err) {
  console.error("[desktop] Failed to persist secrets:", err);
}

// Find a free port starting from the preferred one.
// Listen without a host to match Express binding semantics (IPv4 + IPv6).
function findFreePort(preferred = 3000) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      const srv = net.createServer();
      srv.once("error", () => tryPort(p + 1));
      srv.once("listening", () => srv.close(() => resolve(p)));
      srv.listen(p);
    };
    tryPort(preferred);
  });
}

let mainWindow = null;
let tray = null;
let isQuitting = false; // 仅托盘菜单/真实退出时才销毁窗口, 否则关闭只是隐藏到托盘

// 恢复并聚焦主窗口 (托盘单击/菜单/第二实例)
function showMainWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// 系统托盘: 最小化/关闭后应用继续在后台运行, 托盘图标单击恢复窗口
function createTray() {
  // 打包后图标随 extraResources 分发 (resources/icon.ico); 开发模式取 desktop/build 下的生成产物
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "icon.ico")]
    : [path.join(__dirname, "build", "icon.ico"), path.join(__dirname, "build", "icon.png")];
  let image = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      image = nativeImage.createFromPath(p);
      break;
    }
  }
  tray = new Tray(image || nativeImage.createEmpty());
  tray.setToolTip("QuickLink - 后台运行中");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示主窗口", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "退出 QuickLink",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => showMainWindow());
}

async function startServer() {
  const port = await findFreePort(3000);
  process.env.PORT = String(port);
  // Boot the Express server in-process (runs migrations + listen)
  require(path.join(serverDir, "dist", "app.js"));
  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "QuickLink",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  // Open external links in the system browser instead of new Electron windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 最小化 → 隐藏到托盘后台运行 (而非停留在任务栏)
  mainWindow.on("minimize", (e) => {
    e.preventDefault();
    mainWindow.hide();
  });

  // 关闭 → 隐藏到托盘后台运行; 仅真实退出 (托盘菜单/系统关机) 时销毁
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// 开机自启动设置 (渲染进程经 preload 桥接调用)
ipcMain.handle("quicklink:get-auto-launch", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("quicklink:set-auto-launch", (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled });
  return true;
});

// Single instance: focus existing window instead of launching twice
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  // before-quit 覆盖其余退出路径 (app.quit/系统关机等), 确保窗口能被真实销毁
  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.whenReady().then(async () => {
    try {
      const port = await startServer();
      console.log(`[desktop] server started on port ${port}`);
      createTray();
      createWindow(port);
    } catch (err) {
      console.error("[desktop] start failed:", err);
      dialog.showErrorBox("QuickLink 启动失败", String((err && err.stack) || err));
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
