# QuickLink — 链接收藏工具 构建文档（总览）

> 本文档体系为项目构建、架构与功能的唯一权威说明，与代码保持同步。总览（本文）+ 四个业务模块文档：
>
> | 文档 | 内容 |
> | ---- | ---- |
> | **BUILD.md**（本文） | 项目概述、技术选型、目录结构、存储与迁移、安全清单、前端通用架构、Windows 服务版、构建部署、依赖、测试 |
> | [LINKS.md](./LINKS.md) | **链接管理**：链接/标签/关联账号凭据的数据模型、API、业务规则与前端交互 |
> | [NOTES.md](./NOTES.md) | **笔记管理**：文件树存储、排序、附件、zip 导入导出的数据模型、API 与前端交互 |
> | [USER.md](./USER.md) | **用户信息管理**：认证、设置与凭据记忆的模型、API 与前端交互 |
> | [API.md](./API.md) | **接口管理**：环境配置、集合树、HTTP 请求发送、历史记录、导出导入的数据模型、API 与前端交互 |

## 1. 项目概述

**项目定位**：支持链接收藏与关联账号密码管理的个人知识管理工具，附带 Markdown 笔记能力。

| 模块 | 功能概览 | 详见 |
| ---- | -------- | ---- |
| 链接管理 | 标签分组卡片展示（每标签可配置每行链接数，标签管理可一键统一全部分组列数）、链接卡片背景色（逐链接设置/清除，可从预设色板选取或取色器自定义，预设背景色独立管理）、悬浮操作栏与链接信息同一行（抽屉式：不悬浮完全收起、标题占满行宽无空置，悬浮展开标题省略让位不遮挡；删除确认弹层期间操作栏钉住展开）、搜索（防抖 300ms 前端过滤）、CRUD、本地文件 `file:///` 支持、关联账号密码（支持一个链接多个账号，明文存储直接查看，密码一键生成，支持编辑）、URL 去重提示、数据清空/导出/导入（JSON/CSV，导出含自定义图标、标签、预设背景色与链接背景色）、标签管理弹窗（含每行链接数配置、统一设置、↑/↓ 排序，链接展示顺序与标签排序一致）、背景色管理弹窗、复制并在新标签页打开（`file://` 链接降级为复制本地路径，见 §9.5） | [LINKS.md](./LINKS.md) |
| 笔记管理 | 文件夹树（真实文件目录树存储，展开即显示目录下全部文件与子文件夹，文件名含扩展名，非 Markdown 文件单击交系统默认程序打开；左面板可收起/展开并记忆，拖拽自定义排序/跨文件夹移动）、标题+内容搜索、键盘方向键导航、右键菜单/「+」按钮新建、Markdown 双模式编辑（所见即所得 / 源码+预览分栏，编辑模式停止输入 1.5 秒自动保存）、大纲侧边栏（预览模式自动提取标题层级，点击跳转）、笔记内搜索与替换（Ctrl+F，编辑模式支持替换）、预览区链接系统浏览器打开、右键复制文件路径（打开于 Typora / 资源管理器仅非服务模式可用，见 §9.5；Typora 支持自定义安装路径）、回收站、附件管理、zip 导入/导出 | [NOTES.md](./NOTES.md) |
| 用户信息管理 | 注册/登录（记住密码/自动登录）、登录密码（bcryptjs）；登录密码可凭注册邮箱找回 | [USER.md](./USER.md) |
| 接口管理 | 模仿 Postman 的本地接口管理：环境配置与切换（`{{变量}}` 自动替换）、集合/文件夹/请求三级树形管理（键盘方向键导航）、HTTP 请求发送（7 种方法/Params/Headers/Cookies/Body/Auth，JSON 一键格式化，可编辑接口名称）、响应查看（状态码/耗时/Body/Headers，JSON 格式化/原始切换）、请求历史记录（点击恢复含响应结果）、集合导出/导入（原生格式 + Postman Collection v2.1 双向兼容）、环境 Postman 格式导入/导出、拷贝为 cURL、导入 cURL | [API.md](./API.md) |
| Windows 服务版 | NSIS 安装包把服务端注册为 **Windows 服务**（NSSM + 随包 `node.exe`），开机自动启动，通过浏览器访问 `http://localhost:端口`（安装向导可选端口，默认 3000）；仅监听 `127.0.0.1`，不对局域网开放；开始菜单附「QuickLink Service Control」运维面板 | 本文 §9 |
| 数据存储 | 零外部依赖：NeDB 嵌入式 .db 文件 + 笔记文件树，全部统一存于同一数据目录（开发态 `user_data/`；服务版安装时可指定位置，默认 `%ProgramData%\QuickLink\data`），便于整体备份/迁移 | 本文 §4 |
| 通用体验 | 全中文界面（Ant Design zhCN）、外观主题（跟随系统/浅色/深色）、全局字体选择、侧栏收起记忆、记住密码/自动登录、开机自启（Windows 服务） | 本文 §8/§9 |

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
| Windows 服务 | NSSM + 随包 node.exe v22   | `server/service.js` 作服务入口；独立 NSIS 脚本（非 electron-builder）注册 SCM 服务、开机自启、浏览器访问 |
| 部署        | 直接运行 / Docker / Windows 服务安装包 | 单进程前后端一体，无需数据库容器                 |

---

## 3. 项目目录结构

> 前后端代码均按业务模块（链接管理 `links` / 笔记管理 `notes` / 用户信息管理 `user` / 接口管理 `api`）组织，模块内聚控制器（服务端）或页面与组件（前端）。

```
quick_link/
├── doc/                        # 文档: BUILD.md 总览 + LINKS/NOTES/USER/API 模块文档
├── client/                     # 前端
│   ├── src/
│   │   ├── modules/            # 业务模块 (页面+组件同层)
│   │   │   ├── links/          # 链接管理: LinksPage / LinkIcon / TagManager
│   │   │   ├── notes/          # 笔记管理: NotesPage / NoteViewer / MilkdownEditor / AttachmentManager / imageSize
│   │   │   ├── user/           # 用户信息管理: LoginPage / RegisterPage / SettingsModal
│   │   │   └── api/            # 接口管理: ApiPage / ApiSidebar / RequestBuilder / ResponseViewer / EnvironmentModal / curlParser
│   │   ├── layout/             # AppLayout 侧栏+顶栏 (收起记忆, 底部仅设置/收起展开; 用户信息已并入设置弹窗)
│   │   ├── services/           # api.ts (axios 封装) / settings.ts (本地设置与凭据记忆)
│   │   ├── hooks/              # usePageVisibility (CachedPages 页面可见性 Context + hook)
│   │   ├── stores/authStore.ts # Zustand 认证态; themeStore.ts # 外观主题 (跟随系统/浅/深); capabilityStore.ts # 服务端能力探测 (session 0 下隐藏桌面专属入口)
│   │   ├── styles/markdown.css # Markdown 预览样式 + 深色模式覆盖
│   │   ├── styles/global.css   # 全局基线: 细滚动条 / 列表行悬浮反馈 / 主题切换平滑过渡 / prefers-reduced-motion 适配
│   │   ├── types/              # 共享类型定义
│   │   ├── App.tsx             # 路由 (BrowserRouter, zhCN) + CachedPages 页面缓存
│   │   └── main.tsx
│   ├── public/icon.svg         # 太阳图标 (favicon 矢量源)
│   └── vite.config.ts          # 开发代理 /api → :3000
├── server/
│   ├── src/
│   │   ├── modules/            # 业务模块 (控制器+路由同层)
│   │   │   ├── links/          # 链接管理: linkController / tagController / customIconController(自定义图标库) + routes.ts / tags.routes.ts / accounts.routes.ts / customIcons.routes.ts
│   │   │   ├── notes/          # noteController / attachmentController + routes.ts
│   │   │   ├── api/            # environmentController / collectionController / historyController / proxyController + routes.ts
│   │   │   └── user/           # authController + routes.ts
│   │   ├── config/             # env.ts (DATA_DIR / HOST / SERVICE_MODE 解析) / database.ts (NeDB+索引)
│   │   ├── middleware/         # auth.ts (JWT) / errorHandler.ts
│   │   ├── services/           # cryptoService (generatePassword / isLegacyCipher) / migrateService
│   │   ├── migrations/         # 001-initial-schema / 002-notes-to-filesystem / 003-multi-account
│   │   ├── scripts/            # migrate-up / migrate-down / migrate-status
│   │   ├── types/index.ts
│   │   └── app.ts              # Express 入口 (启动时自动迁移; STATIC_DIR 静态托管; HOST 绑定; SIGINT/SIGTERM/SIGBREAK 优雅退出)
│   ├── service.js              # Windows 服务入口: 解析 %ProgramData%\QuickLink 配置 → 注入环境变量 → 加载 dist/app.js
│   └── scripts/test-notes-api.js  # 笔记模块 API 冒烟测试 (28 项断言)
├── user_data/                  # 全部用户数据 (运行时生成, gitignore)
│   ├── note/<userId>/          # 笔记文件树 (文件夹=目录, 文档=.md, 其他文件原样纳管, 回收站=.trash)
│   ├── attachment/             # 笔记附件文件体 (uuid 文件名)
│   └── *.db                    # users/links/tags/attachments/note_orders/migrations/api_environments/api_collections/api_history
├── installer/                  # Windows 服务版安装包 (独立 NSIS 脚本, 不依赖 electron-builder)
│   ├── quicklink.nsi           # 安装脚本 (UTF-8 带 BOM): 数据目录选择页 / 指针写入 / 密钥交接 / NSSM 注册服务 / 健康校验 / 快捷方式 / 卸载
│   ├── assets/                 # icon.ico + icon.png (gen-icon.js 产物, 已入库) + quicklink-ctl.cmd (服务控制面板)
│   ├── scripts/                # gen-icon.js (icon.svg → ico/png 16/32/48/256) / migrate-legacy.js (交接旧版 JWT 密钥) / check-health.js (安装后 HTTP 探测)
│   ├── vendor/nssm.exe         # 服务包装器 (SHA256 锁定, 已入库)
│   ├── package.json            # png-to-ico (图标生成)
│   └── stage/ .cache/ release/ # 构建中间产物与安装包输出 (gitignore)
├── build-installer.ps1         # Windows 一键打包脚本 (校验/下载 vendor 二进制 → 组装 stage → makensis)
├── Dockerfile.server           # 后端镜像 (node:20-alpine)
├── Dockerfile.client           # 前端镜像 (Vite 构建 + nginx 托管)
├── nginx.conf                  # SPA 回退 + /api 反向代理到 server
├── docker-compose.yml          # server + client 双容器编排
├── .env / .env.example
└── .gitignore
```

---

## 4. 数据存储与模型

> 全部用户数据统一存放于同一数据目录（开发态为项目根 `user_data/`；服务版安装时可指定，默认 `%ProgramData%\QuickLink\data`；Docker 经 volume 挂载）。
> NeDB 集合以独立 `.db` 文件（JSON Lines）直接置于数据目录根下；**笔记不入库**，以真实文件目录树存储（详见 [NOTES.md](./NOTES.md)）。

### 4.1 存储布局

```
<数据目录>/               # 开发态 user_data/; 服务版默认 %ProgramData%\QuickLink\data
├── note/<userId>/      # 文件夹=目录, 文档=.md (UTF-8), 其他文件原样纳管 (二进制安全), 回收站=根下隐藏目录 .trash/
├── attachment/         # 附件文件体 (uuid + 原扩展名)
├── users.db  links.db  accounts.db  tags.db  attachments.db  note_orders.db  custom_icons.db  preset_colors.db  api_environments.db  api_collections.db  api_history.db  migrations.db
```

### 4.2 集合与归属模块

| 集合 | 归属模块 | 文档结构详见 |
| ---- | -------- | ------------ |
| users | 用户信息管理 | [USER.md §2](./USER.md) |
| links / tags / accounts（兼容保留） | 链接管理 | [LINKS.md §2](./LINKS.md) |
| attachments / note_orders | 笔记管理 | [NOTES.md §2](./NOTES.md) |
| custom_icons | 链接管理（自定义图标库） | [LINKS.md §3.2.1](./LINKS.md) |
| preset_colors | 链接管理（预设背景色） | [LINKS.md §3.2.2](./LINKS.md) |
| api_environments / api_collections / api_history | 接口管理 | [API.md §2](./API.md) |
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
apiEnvironments.ensureIndex({ fieldName: "userId" });
apiCollections.ensureIndex({ fieldName: "userId" }); apiCollections.ensureIndex({ fieldName: "parentId" });
apiHistory.ensureIndex({ fieldName: "userId" });
export const db = { users, links, accounts, tags, attachments, noteOrders, migrations, customIcons, apiEnvironments, apiCollections, apiHistory };
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
| /api/links、/api/tags、/api/accounts（兼容保留）、/api/custom-icons、/api/preset-colors | 链接管理 | [LINKS.md §3](./LINKS.md) |
| /api/notes（含 /attachments） | 笔记管理 | [NOTES.md §3](./NOTES.md) |
| /api/api-manager | 接口管理（环境/集合/历史/代理发送） | [API.md §3](./API.md) |
| /api/health | 通用健康检查 + 服务端能力上报（`capabilities.launchNativeGui`，见 §9.5） | — |

---

## 7. 安全措施清单

- [x] JWT 过期时间（默认 2h）；401 前端自动清理并跳登录（登录/注册页豁免跳转）
- [x] 账号凭据仅 `/secrets` 按需返回，列表接口不暴露（[USER.md §3](./USER.md)）；凭据明文存储（已移除主密码加密，可直接查看）
- [x] Helmet；CORS 配置。~~接口限流~~ 已移除（2026-10-30）：单用户本地工具场景下限流弊大于利——URL 去重搜索按击键防抖逐次触发请求、批量录入/编辑链接会击穿配额，之后 15 分钟内**全部** API（含清空）被 429 拒绝且无服务端错误日志，表象为"功能不可用"（当日排查清空不可用时定位并复现，先提阈值后决定整段移除）
- [x] 密码强度校验（登录密码至少 8 位）
- [x] 笔记路径越权校验（禁止逃逸用户根目录）
- [x] Windows 服务版仅监听 `127.0.0.1`，不对局域网开放（无 HTTPS + 凭据明文存储，暴露到网络风险过高，见 §9.4）
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
/api                        # 接口管理
/tags   → /links            # 旧路由兼容
```

### 8.2 布局与通用

- 侧栏底部依次为：设置按钮、收起/展开按钮（`localStorage quicklink:siderCollapsed` 记忆）；账号信息（用户名/注册邮箱）与退出登录均位于设置弹窗内（见 [USER.md §5](./USER.md)）。
- 全局视觉基线（2026-10 整体优化，三轮）：antd token 统一 `borderRadius 8` / 容器 `borderRadiusLG 12`；`styles/global.css`（main.tsx 引入）提供细滚动条、`.ql-hover-row` 可点击列表行悬浮反馈（中性半透明色深浅主题通用）、主题切换平滑过渡与 `prefers-reduced-motion` 适配；`BrandMark`（蓝青渐变圆角方块 + 链接图标）作为登录/注册页与侧栏共用的品牌标识（设置弹窗头像同渐变）；内容卡片为 12px 圆角 + 1px `colorBorderSecondary` 描边；登录/注册页为渐变背景（深色主题为暗底 + 品牌色光晕）；页面底色对齐 antd5 `colorBgLayout`（浅 `#f5f5f5` / 深 `#000`）；笔记/接口等模块面板描边与提示色全部 token 化（先后修复深色主题下硬编码 `#f0f0f0`/`#888`/`#52c41a`/`#1677ff`/`#ff4d4f` 及色板黑色半透明描边不可见的问题）；接口管理 URL 栏的 HTTP 方法下拉按动词着色（浅色 7 级/深色 5 级双套色阶，与树节点方法 Tag 同色系）、历史与环境列表行带悬浮反馈、图标按钮补 tooltip；Modal 统一 `destroyOnHidden`。各页面细节见对应模块文档（链接页见 [LINKS.md §5](./LINKS.md)）。
- 外观主题：设置弹窗选 跟随系统/浅色/深色（默认跟随系统，`prefers-color-scheme` 变化实时切换）；App 据 `isDark` 切换 antd `darkAlgorithm` 并同步 `html[data-theme]`/`color-scheme`/body 背景；自定义样式（markdown 预览、Milkdown Crepe 变量）经 `html[data-theme="dark"]` 覆盖；业务组件一律用 `theme.useToken()` 取色，禁写死浅色值。
- 全局字体：设置弹窗可选预设字体（IBM Plex Mono / Courier New / Consolas / Menlo / Monaco / 系统默认 / 等宽字体）或自定义输入；选中后写入 `AppSettings.fontFamily`（`localStorage quicklink:settings`），App 将其应用到 `document.body.style.fontFamily`、antd `ConfigProvider` token 及 CSS 变量 `--ql-font-family`（供子组件如接口管理代码区继承）；设置页修改后通过自定义事件 `quicklink:settings-changed` 在同标签页内实时同步，无需刷新。
- 请求拦截：自动附加 `Authorization: Bearer`；开发环境 Vite proxy `/api` → `localhost:3000`；服务端错误文案统一简体中文。

### 8.3 状态管理

Zustand `authStore`：`user / token / isAuthenticated / login / register / logout / autoLogin`。

Zustand `themeStore`：`mode (system|light|dark) / isDark / setMode`；持久化于 `AppSettings.themeMode`（`localStorage quicklink:settings`）。

### 8.4 页面缓存（CachedPages）

模块页面（链接/笔记/接口）首次访问后通过 CSS `display` 缓存，避免反复卸载/重建：

- `App.tsx` 的 `CachedPages` 组件以 `display: block/none` 切换已访问页面，未访问的页面延迟挂载（`React.lazy` 按需下载）；
- 笔记管理：Milkdown/ProseMirror 重型编辑器保持挂载，切换模块时无需重建（避免卡顿与崩溃）；
- 链接/接口管理：首次挂载后缓存 DOM 与数据，切换模块零延迟；
- `PageVisibilityContext`（`hooks/usePageVisibility.ts`）提供当前路由路径，子组件通过 `usePageVisibility(routePath)` 判断自身是否可见；
- 全局快捷键（↑↓←→ 导航、Ctrl+F 搜索、Ctrl+S 保存等）仅在对应页面可见时生效，隐藏页面的键盘监听器自动跳过；
- 页面从可见变为不可见时，若有未保存的编辑内容则自动触发保存（笔记模块）。

---

## 9. Windows 服务版

> 2026-10 起移除 Electron 桌面壳：安装包把服务端注册为 **Windows 服务**并开机自动启动，日常通过浏览器访问 `http://localhost:端口`（端口在安装向导中可自定义，默认 3000）。安装包体积从约 79MB 降到约 24MB。

### 9.1 运行时结构

```
Windows SCM (服务控制管理器)
└── nssm.exe —— 服务名 QuickLink / LocalSystem / SERVICE_AUTO_START
    └── node.exe "<安装目录>\server\service.js"
        ├── 读取机器级配置 %ProgramData%\QuickLink\
        ├── 注入环境变量后 require dist/app.js
        │     DATA_DIR=<用户数据目录>   STATIC_DIR=<安装目录>\public
        │     NODE_ENV=production       HOST=127.0.0.1  PORT=<安装时所选端口, 默认 3000>
        │     JWT_SECRET=<持久化密钥>   QUICKLINK_SERVICE_MODE=1
        └── Express 监听 127.0.0.1:<端口> (静态 SPA + REST API)
浏览器 → http://localhost:<端口>
```

为什么状态放在 `%ProgramData%\QuickLink` 而不是 `%APPDATA%\QuickLink`：服务以 **LocalSystem** 账户运行，其 `%APPDATA%` 解析到 `C:\Windows\System32\config\systemprofile\AppData\Roaming`，与登录用户无关；且服务在任何用户登录之前就已启动。`%ProgramData%\QuickLink` 内容：

| 文件 | 写入方 / 编码 | 作用 |
| ---- | ------------- | ---- |
| `data_dir.txt` | 安装器 / UTF-16LE | 用户数据目录（安装向导选择的绝对路径） |
| `pending_migration.txt` | 安装器 / UTF-16LE | 换目录时待迁移的旧目录；服务首次启动消费后删除 |
| `jwt_secret.txt` | 安装器 / UTF-8 | 交接旧版 `%APPDATA%\QuickLink\secrets.json` 里的密钥；消费后删除 |
| `port.txt` | 安装器 / ASCII | 安装向导选择的服务端口（纯数字）；`service.js` 启动时读取，升级安装预填、`quicklink-ctl.cmd` 打开浏览器也用它 |
| `config.json` | service.js / UTF-8 | `host` / `port` / `jwtSecret`，服务重启后沿用 |
| `logs\service.out.log` / `logs\service.err.log` | NSSM 重定向 | stdout / stderr，单文件超 10MB 在线轮转 |
| `data\` | 服务端 | 默认数据目录（安装时未另选位置） |

编码分工是硬约束：Unicode 安装器中 `FileWrite` 输出 ANSI 单字节，中文路径会损坏，因此安装器一律用 `FileWriteUTF16LE` 写 `.txt` 指针文件、**从不写 JSON**——唯一例外是 `port.txt`（纯 ASCII 数字，单字节与多字节编码结果一致，服务与 ctl 均可直接读回）；`config.json` 由 `service.js` 独占读写（UTF-8）。`service.js` 的 `decodeText()` 兼容 UTF-16LE、早期误写的 "FF FE + 单字节 ANSI" 与纯 UTF-8 三种形态。

### 9.2 安装目录布局

```
C:\Program Files\QuickLink\
├── node\node.exe            # 随包分发的 Node 运行时 (v22.14.0, 仅 exe; 服务端无原生插件)
├── nssm\nssm.exe            # 服务包装器 (2.24-101-g897c7ad win64)
├── server\
│   ├── dist\                # tsc 产物
│   ├── node_modules\        # --omit=dev 生产依赖
│   ├── service.js           # 服务入口: 解析配置 → 注入环境变量 → 加载 dist/app.js
│   ├── migrate-legacy.js    # 安装期一次性交接旧版 JWT 密钥
│   └── check-health.js      # 安装后 HTTP 探测 (比 sc query 更可靠)
├── public\                  # Vite 产物, 由 Express 经 STATIC_DIR 托管
├── quicklink-ctl.cmd        # 服务控制面板 (启动/停止/重启/状态/日志/数据目录)
├── port.txt                 # 所选端口的副本 (ctl 在 ProgramData 丢失时兜底)
├── icon.ico
└── Uninstall QuickLink.exe
```

### 9.3 数据目录解析与迁移

安装向导在「安装目录」页之后有「选择用户数据目录与服务端口」页（数据目录与端口同页选择），数据目录预填值按**越新越优先**解析（目的：升级安装一定能找到既有数据，而不是安静地建一个空目录让人以为数据丢了）：

1. `%ProgramData%\QuickLink\data_dir.txt`（服务版上次的选择）
2. `%APPDATA%\QuickLink\data_dir.txt`（旧版 Electron 桌面版的选择）
3. `%USERPROFILE%\.quick_link`（旧版默认目录，非空才沿用）
4. `<安装目录>\user_data`（更早期布局；非空时把目标改定为 `%ProgramData%\QuickLink\data`，并把旧目录记为迁移源，由服务首次启动**复制出来**——数据不应留在安装目录内，卸载会连带删除）
5. 全新安装：`%ProgramData%\QuickLink\data`（不能用 `%USERPROFILE%`，LocalSystem 读不到登录用户的 profile）

校验：非空、必须是盘符开头的绝对路径（相对路径对 LocalSystem 无从解析）、去掉结尾反斜杠（根目录 `D:\` 保留）。选择结果以 UTF-16LE 写入 `data_dir.txt`；迁移源与最终目录不同时另写 `pending_migration.txt`。

服务首次启动时 `consumePendingMigration()`：仅在新目录为空且旧目录有数据时整体复制（**只复制不删除旧目录**），随后删除提示文件；复制失败保留提示文件下次重试；目标非空视为已有数据，直接丢弃提示以免覆盖。

密钥交接：`migrate-legacy.js` 由安装器以**安装者身份**运行（服务是 LocalSystem，看不到用户的 `%APPDATA%`），从 `%APPDATA%\QuickLink\secrets.json`（或早期 `%APPDATA%\quicklink-desktop\secrets.json`）取出 `JWT_SECRET` 写成 `%ProgramData%\QuickLink\jwt_secret.txt`；`service.js` 首次启动采纳后写入 `config.json` 并删除该文件，之后一律以 `config.json` 为准。脚本幂等，失败不阻断安装（最坏结果只是升级后需重新登录一次）。密钥必须持久化：每次启动随机会让已签发的 token 全部失效，用户每次开机都要重新登录。

卸载不丢数据：卸载只删除安装目录、快捷方式与注册表卸载项，**有意保留 `%ProgramData%\QuickLink`**（默认数据目录就在其中，且保留 `config.json` 可让重装沿用同一 JWT 密钥）；用户自选的数据目录同样保留。极早期把数据放在安装目录内的布局，卸载前会用 `xcopy` 兜底备份到 `%APPDATA%\QuickLink\user_data`。

### 9.4 服务配置与运维

NSSM 注册参数（`InstallService`）：

| 项 | 值 | 说明 |
| -- | -- | ---- |
| `Start` | `SERVICE_AUTO_START` | 开机自动启动，早于任何用户登录 |
| `ObjectName` | `LocalSystem` | |
| `AppDirectory` | `<安装目录>\server` | |
| `AppStdout` / `AppStderr` | `%ProgramData%\QuickLink\logs\service.{out,err}.log` | |
| `AppRotateFiles` / `AppRotateOnline` / `AppRotateBytes` | `1` / `1` / `10485760` | 在线轮转，单文件 10MB 上限 |
| `AppExit Default` | `Restart` | 异常退出后重启 |
| `AppRestartDelay` | `5000` | 5 秒后重启 |
| `AppThrottle` | `10000` | 10 秒内退出视为启动失败，避免"启动即崩溃"无限快速重启 |

监听地址固定 `127.0.0.1`：服务版**不对局域网开放**（无 HTTPS，账号凭据明文存储，且已移除接口限流，无任何请求频次防护）。`env.HOST` 仅在显式设置时生效，Docker 部署仍保持监听全部网卡的原有语义。

端口选择（安装向导「服务端口」数字输入框，与数据目录同页）：

- 预填上次安装写入的 `%ProgramData%\QuickLink\port.txt`，无则默认 3000——升级安装默认沿用用户既有端口，重装换端口也只是一次输入。
- 校验：纯数字（`NSD_CreateNumber` 控件天然挡掉非数字）、长度 1~5 位、数值 1~65535；另做一次 netstat 软性占用检查（`netstat -an | findstr /C:":端口 " | findstr /C:"LISTENING"`，命令经由 `cmd.exe /c` 执行故管道符直接写 `|`——写 `^|` 会被 cmd 转义成字面量导致检查静默失效），命中则弹 YESNO 提示"仍要使用该端口吗"，查不到/命令失败不阻断。
- 确定后写入两份 `port.txt`：`%ProgramData%\QuickLink\port.txt`（权威来源，服务与 ctl 读取）与 `<安装目录>\port.txt`（ctl 在 ProgramData 文件丢失时兜底）。纯 ASCII 数字，`FileWrite` 单字节写入（见 §9.1 编码分工的例外说明）。
- `service.js` 启动解析优先级：`QUICKLINK_PORT` 环境变量（管理员经 nssm `AppEnvironmentExtra` 手动覆盖，最高）> `port.txt`（安装向导选择，每次安装重写，必须压过历史值否则"重装换端口"不生效）> `config.json`（上次启动持久化）> 默认 3000；任一来源非数字或越界（1~65535）即跳过取下一来源，避免一条脏配置让服务起不来。
- 静默安装（`/S`）不经过向导页，端口与数据目录一样按"上次值 → 默认值"兜底解析。
- 快捷方式 `.url`、完成页打开浏览器、服务 Description、注册表 `URLInfoAbout`、`check-health.js` 探测与失败弹窗全部使用运行时拼装的 `http://localhost:<端口>`，不再有编译期写死的 URL。

优雅退出：NSSM 停止服务 / 系统关机时发送 CTRL_BREAK（Node 映射为 `SIGBREAK`），`app.ts` 捕获 `SIGINT`/`SIGTERM`/`SIGBREAK` 后先 `server.close()` 再退出（5 秒兜底强退），避免直接终止进程丢掉 NeDB 尚未落盘的写入。

安装后校验用 `check-health.js` 走 HTTP 而不是解析 `sc query`：服务可能显示 RUNNING 而 Express 已经崩在 `listen` 上（所选端口被占用就是如此），NSSM 会按 `AppExit` 策略不停重启，界面上看着"正常"实则完全不可用。探测失败弹窗提示端口占用并指向 `service.err.log`。

日常运维：开始菜单「QuickLink Service Control」（`quicklink-ctl.cmd`，需管理员）提供 启动 / 停止 / 重启 / 详细状态（`sc qc` + `sc query`）/ 打开浏览器 / 打开日志目录 / 跟踪错误日志（`Get-Content -Tail 40 -Wait`）/ 显示数据目录；菜单头部显示当前 URL，端口号从 `%ProgramData%\QuickLink\port.txt` 读回（缺失/损坏回退安装目录副本，再回退 3000，非纯数字一律按损坏处理）。

快捷方式：开始菜单与桌面各放一个 `QuickLink.url`（`[InternetShortcut]`，双击用默认浏览器打开 `http://localhost:<所选端口>`，图标取 `icon.ico`）；安装完成页的「立即在浏览器中打开 QuickLink」勾选框走 `ExecShell open`。

### 9.5 session 0 限制（已知功能降级）

Windows 服务运行在 **session 0**，与用户桌面隔离：服务端 `spawn` 出来的 `explorer.exe` / `Typora.exe` 窗口无法出现在用户桌面上。相关 API（`POST /api/notes/:id/open-folder`、`/open-in-typora`、`/api/notes/attachments/:id/open-folder`、`/open-file`）仍然保留，但服务模式下调用无效果。

处理方式：`GET /api/health` 返回 `capabilities.launchNativeGui`（值为 `!env.SERVICE_MODE`），前端 `capabilityStore` 启动时探测一次并据此隐藏入口——笔记右键菜单的「打开于 Typora」「打开于资源管理器」、非 md 文件节点的「用系统默认程序打开」（连同单击打开行为，改为提示服务模式无法打开）、附件管理的「打开所在文件夹」按钮。「复制文件路径」保留（服务模式下依然有效，是用户的替代手段）。开发态 `npm run dev` 的服务端在用户会话内，该能力为 `true`，入口照常显示。

`file://` 链接同样降级：浏览器安全策略禁止从 `http://` 页面打开 `file://` URL，原先依赖的 Electron `shell.openExternal` 已随桌面版移除。链接管理点击 `file://` 链接改为把真实本地路径复制到剪贴板并提示（`file:///C:/x` → `C:/x`，`file:////server/share` → `//server/share`，资源管理器地址栏可识别），用户粘贴即可。

### 9.6 打包

```powershell
# 项目根目录一键执行
powershell -ExecutionPolicy Bypass -File build-installer.ps1 -Version 2.0.0
# -SkipBuild 跳过 tsc / vite / 生产依赖安装, 仅重新组装载荷并编译 NSIS
# 产物 (installer/release/):
#   QuickLink-Setup-<version>.exe   (约 24MB)
```

流程：`gen-icon.js` 生成图标 → server `tsc` → client `vite build` → `--omit=dev` 安装生产依赖到 `server/prod_modules`（robocopy `/MOVE`，比 `Move-Item` 更能容忍瞬时文件锁）→ 解析 vendor 二进制 → 组装 `installer/stage/`（`node/` `nssm/` `server/` `public/`）→ `makensis /INPUTCHARSET UTF8` 编译 → 删除 stage。`makensis.exe` 查找顺序：`installer/.cache/nsis/` → PATH → `%LOCALAPPDATA%\electron-builder\Cache\nsis\`。

供应链：三个二进制全部 SHA256 锁定，校验失败即删除文件并退出（下次重新下载）。哈希均经**两个独立镜像交叉验证**——NSSM 取自 Chocolatey 包，其内嵌 zip 的校验值与包内 `legal/VERIFICATION.txt` 公布的官方值一致，`win64/nssm.exe` 又与 npm `nssm-bin@2.24.102` 一致；Node 取自 npmmirror 的官方发行 zip。

| 二进制 | 版本 | SHA256 |
| ------ | ---- | ------ |
| `installer/vendor/nssm.exe`（已入库） | 2.24-101-g897c7ad win64 | `eee9c44c…16d848` |
| `node-v22.14.0-win-x64.zip`（构建期下载） | v22.14.0 | `55b63929…95f217` |
| `node.exe`（从上述 zip 提取） | v22.14.0 | `33b1bc1a…6771b` |

NSIS 脚本注意事项：源文件必须 **UTF-8 带 BOM**（无 BOM 时 makensis 按系统 ANSI 代码页读取，中文乱码）；NSIS **没有 `$PROGRAMDATA` 常量**，机器级目录须在 `InitPaths` 中运行时解析（`ReadEnvStr` → 注册表 `ProfileList\ProgramData` + `ExpandEnvStrings` → `$WINDIR\..\ProgramData`）；卸载段只能调用 `un.` 前缀函数，安装/卸载共用的实现体须放进 `!macro` 各展开一份；MUI2 完成页的勾选框只在定义了 `MUI_FINISHPAGE_RUN` 时才创建，单独定义 `MUI_FINISHPAGE_RUN_FUNCTION` 不生效（且会触发 warning 6010）。

其他要点：

- 服务端依赖全为纯 JS（bcryptjs / NeDB），零 `.node` 原生插件，因此随包只需一个 `node.exe`，目标机无需 Node 环境。
- 安装顺序为 停服务 → 复制文件 → 交接密钥 / 写指针 → 注册并启动服务 → 健康校验 → 建快捷方式。停服务必须在复制之前：运行中的 `node.exe` 会锁住自身与 `.db` 文件。
- `RequestExecutionLevel admin`：注册 Windows 服务无法在 per-user 安装下完成。
- helmet 关闭 CSP 以支持 Vite 产物内联资源。
- 安装包未签名，可能被 SmartScreen / 应用程序控制策略拦截（见 §13.3）。

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

### 10.3 Windows 服务安装包

见 §9.6。安装完成后服务已注册为开机自动启动，浏览器访问 `http://localhost:<安装时所选端口>`（默认 3000，开始菜单 / 桌面均有 `QuickLink.url` 快捷方式，已按所选端口生成）。

---

## 11. 依赖清单

### server

| 依赖 | 用途 |
| ---- | ---- |
| express / cors / helmet / express-validator | Web 框架与安全 |
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

### installer

`png-to-ico`（devDependencies，图标生成）。二进制依赖：`installer/vendor/nssm.exe` 已入库；Node v22.14.0 win-x64 由构建脚本下载并缓存于 `installer/.cache/`（仅取 `node.exe`）——两者均 SHA256 锁定，见 §9.6。服务端运行时依赖由打包脚本以 `--omit=dev` 安装至 `server/prod_modules` 随包分发。

---

## 12. 测试与验证

- **API 冒烟**：`node server/scripts/test-notes-api.js`（默认打后端 :3000，可用环境变量 `API_BASE` 覆盖；脚本首尾各 wipe 一次笔记数据，勿指向生产实例）：覆盖登录、文件夹/文档创建、内容更新、附件上传、重命名及附件 noteId 重映射、列表/下载、zip 导出/导入、软删除→回收站→还原、彻底删除、清空，以及非 Markdown 文件纳管（`type: "file"` 不带正文、内容更新不破坏原始字节、重命名沿用原扩展名、`open-file` 拒绝文件夹与不存在项、Typora 拒绝非 md）等 28 项断言。
- **单元框架**：server 配 jest/ts-jest，client 配 vitest/@testing-library/react（`npm test`）。
- **服务版验证**：安装后核对 `sc qc QuickLink` 为 `AUTO_START` 且 `sc query` 为 `RUNNING`；`GET /api/health` 返回 `capabilities.launchNativeGui=false`；`netstat -ano -p tcp` 只应看到 `127.0.0.1:3000` 监听，用局域网 IP 访问应被拒绝；浏览器完成注册/登录/链接与笔记读写；笔记右键菜单不出现「打开于 Typora」「打开于资源管理器」「用系统默认程序打开」，附件管理不出现「打开所在文件夹」，设置弹窗无「开机自启动」。数据目录指针解析与迁移结果按 `%ProgramData%\QuickLink\logs\service.out.log` 核对。
- **免安装冒烟**：不装服务也能验证服务端本体——把 `server/dist` + `server/prod_modules`（改名 `node_modules`）+ `service.js` + `client/dist`（改名 `public`）按 §9.2 布局拼到一个目录，设 `QUICKLINK_CONFIG_DIR` 指向临时目录后用任意 `node.exe` 跑 `server/service.js` 即可。

---

## 13. 设计决策记录（通用/服务版）

> 模块相关设计决策已随文档拆分移入各模块文档：链接管理 [LINKS.md §6](./LINKS.md)、笔记管理 [NOTES.md §5](./NOTES.md)、用户信息管理 [USER.md §6](./USER.md)、接口管理 [API.md §6](./API.md)。

### 13.1 服务化选型与数据目录演进

2026-10 从 Electron 桌面壳改为 Windows 服务：不再随包分发约 200MB 的 Chromium，安装包从约 79MB 降到约 24MB；服务开机即起，无需登录、无需手动启动，也不再依赖托盘常驻。代价是失去桌面能力（见 §13.2）。

服务包装器选 NSSM，而非 `node-windows` 或自写 SCM 胶水：NSSM 是单个约 360KB 的 exe，无运行时依赖，支持日志重定向 + 在线轮转、异常重启与启动节流，且全部配置都能用命令行完成（安装器无需交互界面）。二进制入库到 `installer/vendor/` 并 SHA256 锁定，避免构建期依赖外网可达性——当时官方 `nssm.cc` 返回 HTTP 503、`www.nssm.cc` 证书吊销检查离线失败，最终从 Chocolatey 取包并与 npm `nssm-bin` 交叉校验（§9.6）。

数据目录演进：早期 `%APPDATA%` → 安装路径下 `user_data/` → Electron 期「安装时可指定，默认 `%USERPROFILE%\.quick_link`」（指针 `%APPDATA%\QuickLink\data_dir.txt`）→ 现为**安装时可指定，默认 `%ProgramData%\QuickLink\data`**（指针 `%ProgramData%\QuickLink\data_dir.txt`）。迁到 ProgramData 的原因见 §9.1。升级安装按 §9.3 的五级顺序解析预填值，历史上任一布局的数据都能被找到；旧版 `%APPDATA%\QuickLink\secrets.json` 里的 JWT 密钥经 `migrate-legacy.js` 交接到 `config.json`，密钥跨安装稳定。卸载保留 `%ProgramData%\QuickLink` 与用户自选数据目录，重装沿用同一密钥与目录。（曾因卸载默认清理 `$INSTDIR` 导致重装丢数据，2026-08 修复；服务版从设计上就把数据放在安装目录之外。）

### 13.2 session 0 隔离与浏览器访问的取舍

Windows 服务运行在 session 0，与用户桌面隔离，服务端 `spawn` 的 GUI 进程（`explorer.exe` / `Typora.exe` / `cmd /c start`）不会出现在用户桌面上。另一种做法是再装一个跑在用户会话里的 helper 进程（登录时启动 + 命名管道通信），但那会重新引入"必须登录才可用"，外加一套 IPC 与生命周期管理，与"开机即起、后台常驻"的初衷冲突。故选择**接受降级 + 前端隐藏入口**：`/api/health` 上报 `capabilities.launchNativeGui`，前端 `capabilityStore` 据此隐藏相关菜单项与按钮，保留「复制文件路径」作为替代。API 本身不删——开发态（`npm run dev`，服务端在用户会话内）该能力为 `true`，入口照常显示。

访问方式改为浏览器，开始菜单/桌面放 `.url` 快捷方式。随之而来的两个具体降级——`file://` 链接无法从 `http://` 页面打开（改为复制本地路径到剪贴板）、失去系统托盘的"最小化到后台"（服务本就常驻后台，关掉浏览器标签即可）——记录在 §9.5。

监听范围固定 `127.0.0.1`：项目无 HTTPS，账号凭据明文存储，且接口限流已移除（登录接口无请求频次防护），因此不对局域网开放。`env.HOST` 只在显式设置时生效，Docker 部署（nginx 反代到 `server:3000`）保持监听全部网卡的原有语义不受影响。

### 13.3 安装包签名与安全策略（2026-08 记录，2026-10 更新）

NSIS 安装包未签名，在部分机器上会被 Windows 应用程序控制策略 / SmartScreen 拦截（启动即拒绝，无法放行）。Electron 期曾以 `portable` 与 `zip` 免安装格式绕行；服务版**无法沿用该绕行**——注册 SCM 服务本身就需要管理员权限与安装器，不存在"解压即用"的等价形态。当前缓解手段是安装包仅约 24MB、内含二进制全部 SHA256 锁定（§9.6）；被拦截时需由管理员放行，长期方案仍是购买代码签名证书。
