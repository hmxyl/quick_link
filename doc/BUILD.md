# QuickLink — 链接收藏工具 构建文档（总览）

> 本文档体系为项目构建、架构与功能的唯一权威说明，与代码保持同步。总览（本文）+ 三个业务模块文档：
>
> | 文档 | 内容 |
> | ---- | ---- |
> | **BUILD.md**（本文） | 项目概述、技术选型、目录结构、存储与迁移、安全清单、前端通用架构、桌面版、构建部署、依赖、测试 |
> | [LINKS.md](./LINKS.md) | **链接管理**：链接/标签/关联账号凭据的数据模型、API、业务规则与前端交互 |
> | [NOTES.md](./NOTES.md) | **笔记管理**：文件树存储、排序、附件、zip 导入导出的数据模型、API 与前端交互 |
> | [USER.md](./USER.md) | **用户信息管理**：认证、设置与凭据记忆的模型、API 与前端交互 |

## 1. 项目概述

**项目定位**：支持链接收藏与关联账号密码管理的个人知识管理工具，附带 Markdown 笔记能力。

| 模块 | 功能概览 | 详见 |
| ---- | -------- | ---- |
| 链接管理 | 快速导入（粘贴 URL 自动抓取标题/描述/图标）、搜索、标签筛选、CRUD、本地文件 `file:///` 支持、关联账号密码（支持一个链接多个账号，明文存储直接查看，密码一键生成）、数据清空/导出/导入（JSON/CSV）、标签管理弹窗 | [LINKS.md](./LINKS.md) |
| 笔记管理 | 文件夹树（真实文件目录树存储，左面板可收起/展开并记忆，拖拽自定义排序/跨文件夹移动）、标题+内容搜索、键盘方向键导航、右键菜单/「+」按钮新建、Markdown 双模式编辑（所见即所得 / 源码+预览分栏）、回收站、附件管理、zip 导入/导出 | [NOTES.md](./NOTES.md) |
| 用户信息管理 | 注册/登录（记住密码/自动登录）、登录密码（bcryptjs）；登录密码可凭注册邮箱找回 | [USER.md](./USER.md) |
| 桌面版 | Electron 桌面版（NSIS 安装包 / Portable 单文件 / ZIP 免安装三种格式），内嵌后端，双击即用；最小化/关闭隐藏到系统托盘后台运行；太阳图标统一 | 本文 §9 |
| 数据存储 | 零外部依赖：NeDB 嵌入式 .db 文件 + 笔记文件树，全部统一存于 `user_data/` 目录（桌面版安装时可指定位置，默认用户目录下的 `.quick_link`），便于整体备份/迁移 | 本文 §4 |
| 通用体验 | 全中文界面（Ant Design zhCN）、外观主题（跟随系统/浅色/深色）、侧栏收起记忆、记住密码/自动登录、开机自启（桌面版） | 本文 §8/§9 |

---

## 2. 技术选型

| 层级        | 技术方案                       | 说明                                             |
| ----------- | ------------------------------ | ------------------------------------------------ |
| 前端        | React 18 + TypeScript + Vite   | SPA，响应式，桌面/移动端浏览器均可               |
| UI 框架     | Ant Design 5 + zhCN Locale     | 全中文界面                                       |
| 状态管理    | Zustand                        | 认证态 + 外观主题态                             |
| 后端        | Node.js + Express + TypeScript | 轻量 REST API                                    |
| 数据库      | NeDB (@seald-io/nedb)          | 嵌入式 NoSQL，文件存储，零外部依赖               |
| 迁移 | 自研 migrateService            | 按版本号排序的迁移 runner，无第三方依赖          |
| 笔记/压缩   | marked + @milkdown/crepe + adm-zip | 前端 Markdown 渲染与所见即所得编辑；后端 zip 导入/导出 |
| 加密        | bcryptjs (12 rounds)           | 登录密码哈希，纯 JS 免原生编译；账号凭据明文存储（已移除主密码加密）|
| 认证        | JWT (jsonwebtoken)             | 默认 2h 过期                                     |
| 桌面版      | Electron 31 + electron-builder | 进程内启动后端，Windows 打包三目标（nsis 安装包 / portable 单文件 / zip 免安装） |
| 部署        | 直接运行 / Docker / 桌面安装包 | 单进程前后端一体，无需数据库容器                 |

---

## 3. 项目目录结构

> 前后端代码均按业务模块（链接管理 `links` / 笔记管理 `notes` / 用户信息管理 `user`）组织，模块内聚控制器（服务端）或页面与组件（前端）。

```
quick_link/
├── doc/                        # 文档: BUILD.md 总览 + LINKS/NOTES/USER 模块文档
├── client/                     # 前端
│   ├── src/
│   │   ├── modules/            # 业务模块 (页面+组件同层)
│   │   │   ├── links/          # 链接管理: LinksPage / LinkIcon / TagManager
│   │   │   ├── notes/          # 笔记管理: NotesPage / NoteViewer / MilkdownEditor / AttachmentManager / imageSize
│   │   │   └── user/           # 用户信息管理: LoginPage / RegisterPage / SettingsModal
│   │   ├── layout/             # AppLayout 侧栏+顶栏 (收起记忆, 用户下拉仅退出登录)
│   │   ├── services/           # api.ts (axios 封装) / settings.ts (本地设置与凭据记忆)
│   │   ├── stores/authStore.ts # Zustand 认证态; themeStore.ts # 外观主题 (跟随系统/浅/深)
│   │   ├── styles/markdown.css # Markdown 预览样式 + 深色模式覆盖
│   │   ├── types/              # 共享类型定义
│   │   ├── App.tsx             # 路由 (BrowserRouter, zhCN)
│   │   └── main.tsx
│   ├── public/icon.svg         # 太阳图标 (favicon 矢量源)
│   └── vite.config.ts          # 开发代理 /api → :3000
├── server/
│   ├── src/
│   │   ├── modules/            # 业务模块 (控制器+路由同层)
│   │   │   ├── links/          # 链接管理: linkController / tagController / customIconController(自定义图标库) + routes.ts / tags.routes.ts / accounts.routes.ts / customIcons.routes.ts
│   │   │   ├── notes/          # noteController / attachmentController + routes.ts
│   │   │   └── user/           # authController + routes.ts
│   │   ├── config/             # env.ts (DATA_DIR 解析) / database.ts (NeDB+索引)
│   │   ├── middleware/         # auth.ts (JWT) / errorHandler.ts
│   │   ├── services/           # cryptoService (generatePassword / isLegacyCipher) / migrateService
│   │   ├── migrations/         # 001-initial-schema / 002-notes-to-filesystem / 003-multi-account
│   │   ├── scripts/            # migrate-up / migrate-down / migrate-status
│   │   ├── types/index.ts
│   │   └── app.ts              # Express 入口 (启动时自动迁移; STATIC_DIR 静态托管)
│   └── scripts/test-notes-api.js  # 笔记模块 API 冒烟测试 (19 项断言)
├── user_data/                  # 全部用户数据 (运行时生成, gitignore)
│   ├── note/<userId>/          # 笔记文件树 (文件夹=目录, 文档=.md, 回收站=.trash)
│   ├── attachment/             # 笔记附件文件体 (uuid 文件名)
│   └── *.db                    # users/links/tags/attachments/note_orders/migrations
├── desktop/                    # Electron 桌面壳
│   ├── main.js                 # 主进程: 内嵌 Express + 托盘 + 自启 IPC + 数据目录解析/恢复/迁移
│   ├── preload.js              # contextBridge 暴露开机自启 API
│   ├── scripts/gen-icon.js     # icon.svg → icon.ico/icon.png (16/32/48/256)
│   ├── build/                  # 生成产物 (icon.ico/icon.png, gitignore) + uninstall-backup.nsh (NSIS 钩子: 数据目录选择页/指针与迁移提示/卸载前备份)
│   └── package.json            # electron-builder 配置 (nsis/portable/zip 三目标)
├── build-desktop.ps1           # Windows 一键打包脚本
├── Dockerfile.server           # 后端镜像 (node:20-alpine)
├── Dockerfile.client           # 前端镜像 (Vite 构建 + nginx 托管)
├── nginx.conf                  # SPA 回退 + /api 反向代理到 server
├── docker-compose.yml          # server + client 双容器编排
├── .env / .env.example
└── .gitignore
```

---

## 4. 数据存储与模型

> 全部用户数据统一存放于 `user_data/`（开发态在项目根；桌面版安装时可指定目录，默认用户目录下的 `.quick_link`；Docker 经 volume 挂载）。
> NeDB 集合以独立 `.db` 文件（JSON Lines）直接置于 `user_data/` 根下；**笔记不入库**，以真实文件目录树存储（详见 [NOTES.md](./NOTES.md)）。

### 4.1 存储布局

```
user_data/
├── note/<userId>/      # 文件夹=目录, 文档=.md (UTF-8), 回收站=根下隐藏目录 .trash/
├── attachment/         # 附件文件体 (uuid + 原扩展名)
├── users.db  links.db  accounts.db  tags.db  attachments.db  note_orders.db  custom_icons.db  migrations.db
```

### 4.2 集合与归属模块

| 集合 | 归属模块 | 文档结构详见 |
| ---- | -------- | ------------ |
| users | 用户信息管理 | [USER.md §2](./USER.md) |
| links / tags / accounts（兼容保留） | 链接管理 | [LINKS.md §2](./LINKS.md) |
| attachments / note_orders | 笔记管理 | [NOTES.md §2](./NOTES.md) |
| custom_icons | 链接管理（自定义图标库） | [LINKS.md §3.2.1](./LINKS.md) |
| migrations | 通用（自动管理）：`{ _id, version, name, appliedAt }` | 本文 §5 |

### 4.3 索引初始化

```typescript
// server/src/config/database.ts
users.ensureIndex({ fieldName: "username", unique: true });
users.ensureIndex({ fieldName: "email", unique: true });
links.ensureIndex({ fieldName: "userId" });  links.ensureIndex({ fieldName: "tags" });
accounts.ensureIndex({ fieldName: "userId" }); accounts.ensureIndex({ fieldName: "platform" }); accounts.ensureIndex({ fieldName: "tags" });
tags.ensureIndex({ fieldName: "userId" });   tags.ensureIndex({ fieldName: "name", unique: true });
attachments.ensureIndex({ fieldName: "userId" }); attachments.ensureIndex({ fieldName: "noteId" });
noteOrders.ensureIndex({ fieldName: "userId" }); noteOrders.ensureIndex({ fieldName: "parentId" });
customIcons.ensureIndex({ fieldName: "userId" }); customIcons.ensureIndex({ fieldName: "url", unique: true });
export const db = { users, links, accounts, tags, attachments, noteOrders, migrations, customIcons };
```

---

## 5. 数据库迁移

自研轻量迁移器：脚本按版本号升序存放于 `server/src/migrations/`，应用启动时自动执行未应用项，记录写入 `migrations.db`。

命名规范：`NNN-描述.ts`（三位版本号）。现有迁移：

| 版本 | 名称 | 说明 |
| ---- | ---- | ---- |
| 001 | initial-schema | 初始集合/索引 |
| 002 | notes-to-filesystem | 旧 `notes.db`（NeDB）一次性转为文件目录树（不可逆）：父级优先建目录/写 .md，回收站项丢弃，附件 `noteId` 由旧 uuid 重写为新相对路径，完成后删除 notes.db |
| 003 | multi-account-per-link | （未注册）链接内嵌单账号字段（`accountUsername/Email/Password/Notes`）→ `accounts` 数组（每账号独立 `_id`，字段值原样搬运），设 `hasAccount: true`；回退取首账号还原旧字段 |

```typescript
// server/src/app.ts — 启动时自动迁移
await runMigrations();
app.listen(PORT, ...);
```

手动操作（server 目录）：

```bash
npm run migrate:up        # 执行所有待执行迁移
npm run migrate:down      # 回滚最近一次
npm run migrate:status    # 查看状态
```

---

## 6. API 总览

各模块接口明细见对应模块文档；所有接口（除标注外）需 JWT（`Authorization: Bearer`），统一响应 `{ success, data?, error?, message? }`，错误文案简体中文。

- JSON body 限制 10MB，笔记附件上传/导入使用 `express.raw`（不限 Content-Type，限制 200MB）。

| 前缀 | 模块 | 明细 |
| ---- | ---- | ---- |
| /api/auth | 用户信息管理 | [USER.md §4](./USER.md) |
| /api/links、/api/tags、/api/accounts（兼容保留）、/api/custom-icons | 链接管理 | [LINKS.md §3](./LINKS.md) |
| /api/notes（含 /attachments） | 笔记管理 | [NOTES.md §3](./NOTES.md) |
| /api/health | 通用健康检查 | — |

---

## 7. 安全措施清单

- [x] JWT 过期时间（默认 2h）；401 前端自动清理并跳登录（登录/注册页豁免跳转）
- [x] 账号凭据仅 `/secrets` 按需返回，列表接口不暴露（[USER.md §3](./USER.md)）；凭据明文存储（已移除主密码加密，可直接查看）
- [x] 接口限流（200 req / 15min）；Helmet；CORS 配置
- [x] 密码强度校验（登录密码至少 8 位）
- [x] 笔记路径越权校验（禁止逃逸用户根目录）
- [ ] HTTPS（生产环境需自行配置）

---

## 8. 前端通用架构

页面级交互明细：链接管理页见 [LINKS.md §5](./LINKS.md)，笔记管理页见 [NOTES.md §4](./NOTES.md)，登录/设置见 [USER.md §5](./USER.md)。

### 8.1 路由

```
/login  /register           # 登录(含忘记密码)/注册
/       → /links            # 重定向
/links  /links?tag=X        # 链接管理 (标签管理弹窗内置)
/notes                      # 笔记管理
/tags   → /links            # 旧路由兼容
```

### 8.2 布局与通用

- 侧栏底部依次为：设置按钮、用户下拉（退出登录）、收起/展开按钮（`localStorage quicklink:siderCollapsed` 记忆）。
- 外观主题：设置弹窗选 跟随系统/浅色/深色（默认跟随系统，`prefers-color-scheme` 变化实时切换）；App 据 `isDark` 切换 antd `darkAlgorithm` 并同步 `html[data-theme]`/`color-scheme`/body 背景；自定义样式（markdown 预览、Milkdown Crepe 变量）经 `html[data-theme="dark"]` 覆盖；业务组件一律用 `theme.useToken()` 取色，禁写死浅色值。
- 请求拦截：自动附加 `Authorization: Bearer`；开发环境 Vite proxy `/api` → `localhost:3000`；服务端错误文案统一简体中文。

### 8.3 状态管理

Zustand `authStore`：`user / token / isAuthenticated / login / register / logout / autoLogin`。

Zustand `themeStore`：`mode (system|light|dark) / isDark / setMode`；持久化于 `AppSettings.themeMode`（`localStorage quicklink:settings`）。

---

## 9. Windows 桌面版（Electron）

### 9.1 运行时结构

```
Electron 主进程 (desktop/main.js)
├── 启动日志 %APPDATA%\QuickLink\startup.log (console 输出落盘, 尽早建立以覆盖数据目录解析/恢复/迁移日志)
├── 生成/持久化 JWT_SECRET (%APPDATA%\QuickLink\secrets.json, 跨安装稳定)
├── 系统托盘 (太阳图标; 最小化/关闭→隐藏后台运行; 单击恢复; 菜单: 显示主窗口/退出)
├── 探测空闲端口 (默认 3000 起递增)
├── 进程内 require 启动 Express (resources/server/dist/app.js)
│     ├── STATIC_DIR → resources/public (Vite 产物, SPA 回退)
│     └── DATA_DIR   → 用户数据目录 (见下: 安装向导可选择)
│           重装更换目录: 按 %APPDATA%\QuickLink\pending_migration.txt 把旧目录数据复制到新目录 (先于恢复链)
│           首次启动自动恢复 (数据目录为空时, 按优先级): 卸载备份 %APPDATA%\QuickLink\user_data
│             > 旧版 %APPDATA%\data > 早期包名目录 quicklink-desktop\data > 安装目录残留 user_data
└── BrowserWindow 加载 http://127.0.0.1:<port>/
```

安装时可指定用户数据目录：NSIS 安装向导在安装目录页之后新增「选择用户数据目录」页（`customPageAfterChangeDir` 钩子），默认值为**用户目录下的 `.quick_link`**（重装时回读上次选择预填），可输入或「浏览…」选择任意绝对路径；选择结果由 `customInstall` 写入 `%APPDATA%\QuickLink\data_dir.txt`，main.js 的 `resolveDataDir()` 启动时读取该指针（`decodeDirText()` 统一解析 UTF-16LE / 早期误写 "FF FE + 单字节 ANSI" / 纯 UTF-8；路径无效/目录不可用时回退默认目录并记日志）。静默安装（/S）不出现该页也不改写指针，重装/升级沿用上次选择。重装更换目录：`customInstall` 把旧目录写入 `%APPDATA%\QuickLink\pending_migration.txt`，main.js 首次启动时（恢复链之前）若新目录为空且旧目录有数据则整体复制到新目录（仅复制不删除旧目录），完成后消费提示文件；复制失败保留提示文件，下次启动重试。

卸载不丢数据：NSIS 自定义钩子 `desktop/build/uninstall-backup.nsh`（`customUnInit`，在删除安装文件前执行）将 `user_data` 整目录备份到 `%APPDATA%\QuickLink\user_data`；重装后首次启动由 main.js 自动拷回。用户数据目录在安装目录之外（自定义位置）时，安装目录下无 user_data，卸载自动跳过备份且外部数据不随卸载删除；指针文件 `data_dir.txt` 也不随卸载清理，重装后沿用上次选择。`secrets.json` 本就存于 `%APPDATA%\QuickLink`，卸载不清理，密钥跨安装稳定。覆盖安装/升级会先静默运行旧卸载器（此时触发上述备份），重装后首次启动自动恢复，数据不丢。注意：`desktop/package.json` 顶层必须保留 `productName`，否则 Electron 以包名定位 `userData`（`%APPDATA%\quicklink-desktop`）导致备份/恢复路径错位；main.js 内置旧包名目录的 secrets/data 迁移兼容。`uninstall-backup.nsh` 含中文字符串，必须保持 UTF-8 带 BOM 编码（makensis 无 BOM 时按 ANSI 读取会乱码）；自定义 include 被置于生成脚本最前（早于 MUI2.nsh），页面函数（含 `!insertmacro MUI_HEADER_TEXT`）必须定义在 `customPageAfterChangeDir` 宏内部、随宏在 MUI2 加载后展开，且数据目录变量仅在安装器构建中声明（`!ifndef BUILD_UNINSTALLER`，否则卸载器构建触发 NSIS warning 6001 导致打包失败）。另注意 Unicode 安装器中 `FileWrite` 实际输出单字节 ANSI（手写 `FF FE` 前缀得到的是 "BOM + ANSI" 坏格式，实测确认），写指针/迁移提示必须用 `FileWriteUTF16LE`（输出无 BOM 的 UTF-16LE，中文路径正确）；页面预填读取优先 `FileReadUTF16LE`，旧坏格式按字节重建回退（`FileRead` 按 ANSI 代码页解码会产生乱码，不可用）。

### 9.2 打包

```powershell
# 项目根目录一键执行
powershell -ExecutionPolicy Bypass -File build-desktop.ps1
# 产物 (desktop/release/):
#   QuickLink-Setup-<version>.exe   (NSIS 安装包, 约 79MB)
#   QuickLink <version>.exe         (Portable 单文件免安装, 约 79MB)
#   QuickLink-<version>-win.zip     (免安装压缩包, 约 107MB, 解压即 win-unpacked 内容)
```

流程：gen-icon 生成图标 → server `tsc` → client `vite build` → `--omit=dev` 安装生产依赖到 `server/prod_modules` → electron-builder 打包（nsis/portable/zip 三目标；electron/NSIS 二进制走 npmmirror 镜像）。

### 9.3 要点

- 服务端依赖全为纯 JS（bcryptjs/NeDB），免原生重建，目标机无需 Node 环境。
- 单实例锁：重复启动聚焦已有窗口；外链经系统浏览器打开。
- 后台运行：最小化与关闭均隐藏到托盘；托盘菜单「退出 QuickLink」/系统关机（`before-quit` 置位）才真实销毁窗口。
- 图标统一：矢量源 `client/public/icon.svg`；`gen-icon.js` 光栅化 16/32/48/256 并经 png-to-ico 生成 `build/icon.ico`（NSIS 仅接受 BMP 格式 ICO 条目）；electron-builder 用于 exe/安装包/快捷方式，另经 extraResources 分发 `resources/icon.ico` 供运行时托盘加载（app.asar 不含 build/ 目录）。
- 开机自启：preload.js（contextBridge）暴露 `window.quicklink.getAutoLaunch/setAutoLaunch`，主进程 `app.setLoginItemSettings`。
- 分发格式：未签名 exe 可能被 Windows 应用程序控制策略/SmartScreen 拦截，故同时提供 Portable 单文件与 ZIP 免安装格式（不经过安装器，双击/解压即用，见 §13.3）；安装向导能力（数据目录选择/卸载备份）仅 NSIS 格式具备。
- helmet 关闭 CSP 以支持 Vite 产物内联资源。

---

## 10. 构建与部署

### 10.1 本地开发

```bash
cd server && npm install && npm run dev      # 后端 :3000 (无需任何数据库服务)
cd client && npm install && npm run dev      # 前端 :5173 (proxy /api → :3000)
cp .env.example .env                          # 填入 JWT_SECRET
# 访问 http://localhost:5173 注册即用; 数据自动创建于 user_data/
```

### 10.2 Docker

双容器编排（零中间件，无数据库容器）：

```yaml
# docker-compose.yml
services:
  server:   # Dockerfile.server (node:20-alpine, DATA_DIR=/app/user_data)
    volumes: [app_data:/app/user_data]
  client:   # Dockerfile.client (Vite 构建 + nginx, 5173→80)
    ports: ["5173:80"]
    depends_on: [server]
```

nginx.conf：`/api` 反代到 `server:3000`，其余 SPA 回退。数据经命名卷 `app_data` 持久化。

### 10.3 桌面安装包

见 §9.2。

---

## 11. 依赖清单

### server

| 依赖 | 用途 |
| ---- | ---- |
| express / cors / helmet / express-rate-limit | Web 框架与安全 |
| @seald-io/nedb | 嵌入式数据库 |
| jsonwebtoken / bcryptjs | 认证与哈希 |
| adm-zip | 笔记 zip 导入/导出 |
| uuid / dotenv | 工具 |

devDependencies：typescript / ts-node / ts-node-dev / jest / ts-jest / 各 @types。

### client

| 依赖 | 用途 |
| ---- | ---- |
| react / react-dom / react-router-dom | UI 与路由 |
| antd / @ant-design/icons | 组件库（zhCN） |
| axios | HTTP |
| zustand | 认证态 + 外观主题态 |
| marked | Markdown 渲染（预览/源码模式） |
| @milkdown/crepe | 所见即所得编辑器（懒加载） |
| mdast-util-to-markdown | 表格单元格换行序列化 handler（defaultHandlers） |
| dayjs | 日期 |

devDependencies：vite / @vitejs/plugin-react / typescript / vitest / @testing-library/react。

### desktop

electron ^31 / electron-builder ^24 / png-to-ico（devDependencies）。服务端运行时依赖由打包脚本以 `--omit=dev` 安装至 `server/prod_modules` 随包分发。

---

## 12. 测试与验证

- **API 冒烟**：`node server/scripts/test-notes-api.js`（需后端运行于 :3000）：覆盖登录、文件夹/文档创建、内容更新、附件上传、重命名及附件 noteId 重映射、列表/下载、zip 导出/导入、软删除→回收站→还原、彻底删除、清空等 19 项断言。
- **单元框架**：server 配 jest/ts-jest，client 配 vitest/@testing-library/react（`npm test`）。
- **桌面验证**：打包后启动 win-unpacked 冒烟（health 接口、user_data 自动创建、托盘后台运行、托盘太阳图标）；数据目录指针解析/恢复/迁移按启动日志 `%APPDATA%\QuickLink\startup.log` 核对。

---

## 13. 设计决策记录（通用/桌面）

> 模块相关设计决策已随文档拆分移入各模块文档：链接管理 [LINKS.md §6](./LINKS.md)、笔记管理 [NOTES.md §5](./NOTES.md)、用户信息管理 [USER.md §6](./USER.md)。

### 13.1 桌面版选型与数据目录演进
Electron 进程内 `require()` 启动编译后 Express（依赖纯 JS 免重建，共享环境变量注入）。数据目录演进：早期 `%APPDATA%` → 安装路径下 `user_data/`（指针默认值） → 现为**安装时可指定、默认用户目录下 `.quick_link`**（指针文件 `%APPDATA%\QuickLink\data_dir.txt` 记录选择，重装/升级沿用）。数据目录为空时按优先级自动恢复：卸载备份 `%APPDATA%\QuickLink\user_data` > 旧版 `%APPDATA%\data` > 早期包名目录 `quicklink-desktop\data` > 安装目录残留 `user_data`；重装更换目录时按 `pending_migration.txt` 提示把旧目录数据复制到新目录（仅复制不删除）。`secrets.json` 存 `%APPDATA%\QuickLink` 保证密钥跨安装稳定。卸载前经 `customUnInit` 钩子把安装目录内 `user_data` 备份至 `%APPDATA%\QuickLink`（曾因卸载默认清理 `$INSTDIR` 导致重装丢数据，2026-08 修复）。

### 13.2 托盘后台运行与图标分发
最小化/关闭均隐藏到托盘（服务持续运行），托盘菜单提供恢复/退出；托盘图标经 extraResources 分发 `resources/icon.ico`（app.asar 不含 build/ 目录），与快捷方式共用同一太阳图标。

### 13.3 分发格式与安全策略绕行（2026-08）
NSIS 安装包未签名，在部分机器上被 Windows 应用程序控制策略拦截（启动即拒绝，无法放行），故在 electron-builder 的 win 目标中追加 `portable` 与 `zip`（`npx electron-builder --win` 一次产出三种格式）：Portable 单文件双击即用不经过安装器，ZIP 解压后与 `win-unpacked` 内容一致。免安装格式不带安装向导，数据目录指针 `%APPDATA%\QuickLink\data_dir.txt` 不存在时回退默认目录 `%USERPROFILE%\.quick_link`（其余恢复/迁移链路与 NSIS 安装版一致）。长期方案为购买代码签名证书并配置 `win.sign`。
