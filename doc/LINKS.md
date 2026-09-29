# QuickLink — 链接管理模块

> 模块文档之一。总览见 [BUILD.md](./BUILD.md)，其余模块：[笔记管理](./NOTES.md) / [用户信息管理](./USER.md) / [接口管理](./API.md)。

## 1. 功能概览

标签分组卡片展示（每个标签可配置每行链接数）、搜索（防抖 300ms 前端过滤）、CRUD、本地文件 `file:///` 支持、URL 去重提示、关联账号密码（支持一个链接多个账号，明文存储直接查看，支持编辑）、数据清空/导出/导入（JSON/CSV，导出含自定义图标与标签）、标签管理弹窗（含每行链接数配置、↑/↓ 上下移动排序，链接展示顺序与标签排序一致）、复制并用系统浏览器打开（所有 URL）。

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/links/` | `linkController.ts` / `tagController.ts` / `accountController.ts`(兼容保留) + `routes.ts` / `tags.routes.ts` / `accounts.routes.ts` |
| 前端 | `client/src/modules/links/` | `LinksPage.tsx`（列表/导入/搜索/凭据弹窗）、`LinkIcon.tsx`（内置图标库+图标选择器）、`TagManager.tsx`（标签管理弹窗） |

## 2. 数据模型

### links（合并账号密码）

```json
{ "_id": "uuid", "userId": "ref", "url": "http/https/file", "title": "required",
  "description": "optional", "icon": "内置图标名 或 官方图标 URL",
  "tag": "单个标签名 (新字段, 主用)", "tags": ["旧字段, 兼容已有数据"],
  "isFavorite": false, "isArchived": false, "clickCount": 0, "lastVisitedAt": "ISO?",
  "hasAccount": "boolean (= accounts.length > 0)",
  "accounts": [ { "_id": "uuid", "username?": "明文", "email?": "明文",
                  "password": "明文", "notes?": "明文", "createdAt": "ISO" } ],
  "passwordUpdatedAt": "ISO?", "createdAt": "ISO", "updatedAt": "ISO" }
```

> 一个链接可关联多个账号，每个账号条目独立 `_id`（用于定向删除），四个字段明文存储。凭据仅 `GET /api/links/:id/secrets` 按需返回、前端可直接查看，列表接口不暴露凭据内容（仅返回 `accountCount`）。存量旧版密文转为占位提示，见 [USER.md §3](./USER.md)。
> `tag` 为新的单标签字段（主用），`tags` 为旧版多标签数组（兼容保留）。创建/更新时以 `tag` 为准，列表展示优先 `tag`，其次 `tags[0]`，默认 `"其他"`。

### tags

```json
{ "_id": "uuid", "userId": "ref", "name": "unique per user",
  "color": "optional", "columns": 5, "sortOrder": 0, "createdAt": "ISO" }
```

> `columns` 控制该标签下链接卡片网格每行展示数量，默认 5（前端 `TagManager` 可配置 1~8）。
> `sortOrder` 为标签排序值（整数，越小越靠前，默认 0）；标签管理与链接展示的分组顺序均按 `sortOrder` 升序（同值按 `name`）排列，新建标签自动追加到末尾。

索引：`links(userId)`、`links(tags)`、`tags(userId)`、`tags(name, unique)`。

### custom_icons（自定义图标库）

```json
{ "_id": "uuid", "userId": "ref", "url": "favicon URL (unique per user)", "label?": "optional", "createdAt": "ISO" }
```

索引：`customIcons(userId)`、`customIcons(url, unique)`。存储于 `custom_icons.db`。

## 3. API

### 3.1 链接（含关联账号）

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/links | 列表（分页/筛选/搜索，见 §3.3；含 `accountCount`） | Yes |
| GET | /api/links/all | 全部链接（无分页，按标签分组返回 `{data: {标签名: Link[]}, tags: Tag[], tagColumns: {标签名: 列数}}`；前端搜索过滤在此结果上二次筛选） | Yes |
| GET | /api/links/:id | 单个链接 | Yes |
| GET | /api/links/:id/secrets | 返回全部关联账号（明文，返回 `{ accounts: [...] }`；无关联账号时返回空列表而非 404） | Yes |
| GET | /api/links/account-count | 含账号的链接数量 | Yes |
| GET | /api/links/search-by-url | 按 URL 精确搜索已有链接（去重提示，返回匹配列表含 `accountCount`） | Yes |
| PUT | /api/links/batch-tags | 批量设置标签 `{ids, tag}`（为选中链接设置单个标签） | Yes |
| POST | /api/links | 创建（可含 `accounts` 数组） | Yes |
| POST | /api/links/:id/accounts | 追加单个账号 | Yes |
| PUT | /api/links/:id/accounts/:accountId | 编辑指定账号（明文逐字段写入，密码必填） | Yes |
| DELETE | /api/links/:id/accounts/:accountId | 删除单个账号 | Yes |
| PUT | /api/links/:id | 仅更新基础字段（不触碰存量账号字段） | Yes |
| DELETE | /api/links | 清空当前用户全部链接 | Yes |
| DELETE | /api/links/:id | 删除单个 | Yes |
| POST | /api/links/batch | 批量导入（可含 `customIcons` 与 `tags`，按 URL/名称去重） | Yes |
| POST | /api/links/batch-delete | 批量删除 `{ids}` | Yes |
| GET | /api/links/export | 导出（format=json 默认含 `customIcons`/`tags` / csv 含 Icon 列） | Yes |

- 含账号写入的请求（创建带 `accounts`、追加账号）中账号密码为空时拒绝保存。
- 账号生命周期由 `/:id/accounts` 子接口独占：基础更新接口强制忽略 `accounts/hasAccount/passwordUpdatedAt`，避免"编辑覆盖存量账号"。
- JSON 导出包含链接数据、`customIcons`（自定义图标）与 `tags`（标签），不含账号凭据（账号单独管理）；CSV 导出含 Icon 列；批量导入不还原凭据。
- 前端导入兼容三种结构：`{data:[...], customIcons:[...], tags:[...]}`（导出格式）、`{links:[...]}`、纯数组；导入后自动刷新标签列表与自定义图标库。

### 3.2 标签

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET/POST | /api/tags | 列表（按 `sortOrder` 升序）/ 创建 `{name, color?, columns?}`（自动追加到末尾） | Yes |
| PUT | /api/tags/reorder | 重排序 `{ids: [...]}`，按传入 id 顺序重写各标签 `sortOrder`（0..n-1） | Yes |
| PUT/DELETE | /api/tags/:id | 更新 `{name?, color?, columns?}` / 删除 | Yes |

### 3.2.1 自定义图标库

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/custom-icons | 列表（用户自定义图标） | Yes |
| POST | /api/custom-icons | 添加 `{url, label?}` | Yes |
| DELETE | /api/custom-icons/:id | 删除单个 | Yes |
| DELETE | /api/custom-icons | 清空当前用户全部自定义图标 | Yes |

自定义图标库存储用户收集的网址 favicon，可在图标选择器中复用。每个用户独立，`url` 字段唯一（同一网址不重复添加）。

### 3.3 通用查询参数（链接列表）

```
GET /api/links?page=1&limit=20&sort=-createdAt&tag=work&favorite=true&search=github
```

| 参数 | 说明 |
| ---- | ---- |
| page / limit | 页码（默认 1）/ 每页数量（默认 20，最大 100） |
| sort | 排序字段（`-` 前缀降序） |
| tag / favorite / search | 标签筛选 / 仅收藏 / 关键词（标题/URL/描述） |

### 3.4 兼容保留路由（旧 accounts 集合）

`/api/accounts` 兼容保留独立 accounts 集合的历史接口，新代码一律使用 links 内嵌账号字段。该集合有其独立数据模型（含 `platform`、`linkId`、`totpSecret` 等字段），通过 `accountController.ts` 提供完整 CRUD：

| Method | Path | 描述 |
| ------ | ---- | ---- |
| GET | /api/accounts | 列表（分页/筛选，列表不返回凭据内容） |
| GET | /api/accounts/:id | 单个详情（含明文凭据字段） |
| GET | /api/accounts/:id/password | 返回账号敏感字段（明文，含 `totpSecret`；更新 `lastUsedAt`） |
| POST | /api/accounts | 创建（明文存储 username/email/password/notes/totpSecret） |
| POST | /api/accounts/:id/generate | 生成随机密码（默认 16 位，含大小写/数字/符号） |
| PUT | /api/accounts/:id | 更新（明文逐字段写入） |
| DELETE | /api/accounts/:id | 删除 |

## 4. 业务规则

### 4.1 URL 自动归一化

| 输入 | 转换结果 |
| ---- | -------- |
| `github.com` | `https://github.com` |
| `C:\Users\doc.pdf` | `file:///C:/Users/doc.pdf` |
| `/home/user/file.txt` | `file:///home/user/file.txt` |
| `\\server\share\file.docx` | `file://server/share/file.docx` |

### 4.2 元数据自动抓取（创建时，5s 超时，失败不阻塞）

网页链接：解析 `<link rel="icon">` → 探测 `/favicon.ico` → 兜底内置 `globe`；同时抓取 `<title>` 与 `meta description`。本地文件分配内置 `folder` 图标。用户手填内容优先不覆盖。

**内置图标库（25 个）**：link / globe / github / file / folder / video / shopping / mail / music / database / code / cloud / book / picture / home / tool / safety / rocket / star / heart / bank / car / coffee / gift / medicine（服务端 `BUILTIN_ICONS` 与前端 `ICON_LIBRARY` 同步维护）。

## 5. 前端交互

- **布局**：顶部单行工具栏（flex 布局）——搜索框（`flex: 1` 自适应宽度）+ 操作按钮（清空/导出/导入/标签管理/添加链接）；下方为标签分组卡片区域。
- **标签分组卡片展示**：调用 `GET /api/links/all` 获取全部链接（按标签分组），每个标签作为一个分区——标签名以彩色徽章显示（取标签配置颜色，无颜色时使用主题色），旁边显示「{N} 个链接」计数，下方为链接卡片网格；分区顺序与标签管理中的排序一致（按 `sortOrder` 升序，“其他”及未入列表的遗留标签追加在后）；每个标签的网格列数由 `tagColumns[tagName]` 控制（默认 5，可在标签管理中配置 1~8）。
- **链接卡片**：Ant Design `Card`（`hoverable`），水平布局——左侧图标 + 标题文本（单行省略）+ 有账号时显示钥匙图标；鼠标悬浮时右侧浮现操作按钮面板（默认 `opacity:0`，`.ant-card-hoverable:hover` 经 CSS 过渡升为 1；模块级注入 `style` 标签避免重复创建）。
- **悬浮操作面板**：复制并打开（仅 URL 非空时显示）、账号管理（钥匙图标）、加入图标库（仅图标为 URL favicon 且未入库时显示）、编辑、删除（Popconfirm 二次确认）。操作按钮组件 `LinkSettings` 提取到组件外部定义，避免每次渲染重建导致卸载/重建。
- **账号管理**：所有账号管理操作统一通过卡片悬浮的「账号管理」按钮进入“账号详情”弹窗处理——卡片形式展示（用户名/邮箱/密码/备注/操作），密码直接可见并可复制，支持逐个编辑（回填当前值，修改后保存）与追加新账号；增删改后自动刷新；无关联账号时弹窗展示空列表与「添加关联账号」入口，可直接新增。
- **密码生成**：「添加关联账号」表单的密码输入框右侧带「生成」按钮，点击即在浏览器端生成 16 位随机密码（字符集 `a-zA-Z0-9`，首字符固定为大写字母 `A-Z`，取随机数用 `crypto.getRandomValues`）填入；可多次点击重新生成替换，生成后仍可手动编辑。
- **本地文件**：`file:///` 链接点击无反应（无 URL 时卡片 cursor 为 `default`）；悬浮面板「复制并打开」（剪贴板保底，桌面版经 `shell.openExternal`，网页版经 `window.open`）。
- **标签管理**：弹窗内增删改（名称 + 颜色 + 每行链接数）与上下移动排序（每行提供 ↑/↓ 按钮，首行禁用↑、末行禁用↓；本地即时重排后调用 `PUT /api/tags/reorder` 持久化新顺序），列表展示每个标签的彩色名称与当前每行链接数；排序变更实时同步到链接展示的分组顺序、筛选下拉与表单选项。
- **图标选择器**：编辑链接时，`IconPicker` 渲染内置图标库（25 个，选中项主题色实线边框、未选灰色边框），并根据当前网址自动探测官方 favicon（`origin/favicon.ico`）——探测成功显示为主题色虚线边框的可点击选项，点击即填入该图标，探测过程中显示 `...` 占位符。当前选择器仅渲染内置图标与探测到的官方 favicon，不展示自定义图标库条目（自定义图标见下条）。
- **自定义图标库**：悬浮面板的「加入图标库」按钮（仅当链接图标为 URL favicon 且尚未入库时显示）经 `customIconApi.add` 将当前网址 favicon 存入用户自定义图标库（按 URL 去重，已在库中则提示「该图标已在图标库中」）；图标库存储于 `custom_icons.db`、每个用户独立，页面加载时经 `customIconApi.list` 读入，用于悬浮面板的入库状态判定，并随导出/导入携带（见 §3.1、§3.2.1）。
- **数据**：清空（Popconfirm 二次确认）、导出 `quicklink-export-YYYY-MM-DD.json`（含自定义图标与标签数据）、导入兼容三种结构（解析 `customIcons`/`tags` 并刷新标签列表与图标库）。
- **搜索**：顶部搜索框输入停顿 300ms 后在前端对已加载的分组数据进行过滤（按标题/URL/描述不区分大小写匹配），保留命中分组。
- **复制并用系统浏览器打开**：悬浮面板「复制并打开」按钮对所有有 URL 的链接均可用，桌面版经 Electron `shell.openExternal` 打开系统默认浏览器，网页版经 `window.open` 打开新标签页。
- **URL 去重提示**：添加/编辑链接弹窗中，URL 输入框内容变化后停顿 400ms 自动调用 `search-by-url` 查询已有链接；若发现相同 URL 的已有链接，在表单中显示黄色警告区域（最多展示 5 条标题与标签），编辑模式下排除自身；帮助用户避免重复添加同一网址。

## 6. 设计决策

- **标签分组卡片布局**：链接管理的核心诉求是快速浏览与操作，卡片网格比表格更直观；每个标签作为独立分区，标签颜色作为分区标题色，卡片悬浮显示操作按钮（减少视觉噪音）。每标签可配置列数（默认 5），适配不同屏幕宽度与使用习惯。
- **标签排序驱动展示顺序**：标签新增 `sortOrder` 字段（整数，越小越靠前），标签管理提供 ↑/↓ 按钮调整顺序并以全量 id 序列提交 `reorder` 重写（避免单条移动的并发一致性）；链接展示与下拉选项均按此排序，使用户可自主控制分区的优先级与视觉位置；存量无 `sortOrder` 的标签降级按 `name` 排序，首次拖动即归一化。
- **全量加载 + 前端过滤**：链接数量通常在数百级别，`GET /api/links/all` 一次返回全部数据按标签分组，前端搜索在已加载数据上二次过滤，避免分页带来的跨标签搜索复杂性。
- **账号密码合并到链接**：账号天然与 URL 关联，独立集合增加认知负担；合并后链接可选携带凭据，`hasAccount` 标识。账号管理入口统一收敛到卡片悬浮操作面板，添加/编辑链接时仅处理基础字段。
- **一链接多账号（内嵌数组）**：同一网址常有多个身份（工作/私人/小号），`accounts` 数组内嵌于链接文档，每条独立 `_id` 支持定向删除与定向编辑；追加/删除/编辑走子接口而非整体替换，与基础编辑互不干扰。
- **单标签字段 `tag`**：每个链接仅属于一个标签（`tag` 字段），取代旧的多标签数组（`tags`，兼容保留）。标签是链接的一级分类维度，单标签更契合分组卡片布局的视觉分区语义；批量设标签接口为选中链接设置单个标签。
- **URL 去重实时提示**：添加链接时用户可能不记得已有同 URL 条目，前端在 URL 输入停顿 400ms 后调用 `search-by-url` 精确匹配，以警告色块展示重复项（含标题与标签），编辑模式下排除自身避免误报；纯前端提示不阻断创建，用户可自行判断。
- **标签管理合并到链接管理**：标签是链接的从属属性，独立页面使用频率低；以 TagManager 弹窗并入链接页，旧路由 `/tags` 重定向兼容书签。
- **本地文件路径支持**：个人知识管理不限于网页；`normalizeUrl()` 将本地路径转 `file:///`，前端特殊 UI + 「复制并打开」（剪贴板保底）。
- **链接图标双形态**：`icon` 支持内置图标名与官方图标 URL：官方 logo 辨识度高但受源站可用性影响（加载失败前端降级内置图标）；导入自动抓取，手动选择优先。
- **关联账号密码客户端生成**：「生成」按钮在前端直接生成（`LinksPage` 的 `genPassword`，基于 `crypto.getRandomValues`），不走服务端 `/api/accounts/:id/generate`（该接口仅属兼容保留的旧 accounts 集合），多次点击即时替换无需网络往返；规则定为 16 位 `a-zA-Z0-9` 且首字符大写，兼顾强度与部分站点对字符集/首字符的限制。
- **secrets 对无账号链接返回空列表**：账号管理入口展示在每条链接上，无账号时返回 404 会在前端呈现为误导性错误提示，故改为返回空列表，弹窗直接提供追加入口（2026-08）。
