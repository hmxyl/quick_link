# QuickLink — 链接管理模块

> 模块文档之一。总览见 [BUILD.md](./BUILD.md)，其余模块：[笔记管理](./NOTES.md) / [用户信息管理](./USER.md)。

## 1. 功能概览

快速导入（粘贴 URL 自动抓取标题/描述/图标）、搜索、标签筛选、CRUD、本地文件 `file:///` 支持、关联账号密码（支持一个链接多个账号，明文存储直接查看）、数据清空/导出/导入（JSON/CSV）、标签管理弹窗。

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/links/` | `linkController.ts` / `tagController.ts` / `accountController.ts`(兼容保留) + `routes.ts` / `tags.routes.ts` / `accounts.routes.ts` |
| 前端 | `client/src/modules/links/` | `LinksPage.tsx`（列表/导入/搜索/凭据弹窗）、`LinkIcon.tsx`（内置图标库+图标选择器）、`TagManager.tsx`（标签管理弹窗） |

## 2. 数据模型

### links（合并账号密码）

```json
{ "_id": "uuid", "userId": "ref", "url": "http/https/file", "title": "required",
  "description": "optional", "icon": "内置图标名 或 官方图标 URL", "tags": ["string"],
  "isFavorite": false, "isArchived": false, "clickCount": 0, "lastVisitedAt": "ISO?",
  "hasAccount": "boolean (= accounts.length > 0)",
  "accounts": [ { "_id": "uuid", "username?": "明文", "email?": "明文",
                  "password": "明文", "notes?": "明文", "createdAt": "ISO" } ],
  "passwordUpdatedAt": "ISO?", "createdAt": "ISO", "updatedAt": "ISO" }
```

> 一个链接可关联多个账号，每个账号条目独立 `_id`（用于定向删除），四个字段明文存储。凭据仅 `GET /api/links/:id/secrets` 按需返回、前端可直接查看，列表接口不暴露凭据内容（仅返回 `accountCount`）。存量旧版密文转为占位提示，见 [USER.md §3](./USER.md)。

### tags

```json
{ "_id": "uuid", "userId": "ref", "name": "unique per user", "color": "optional", "createdAt": "ISO" }
```

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
| GET | /api/links/:id | 单个链接 | Yes |
| GET | /api/links/:id/secrets | 返回全部关联账号（明文，返回 `{ accounts: [...] }`；无关联账号时返回空列表而非 404） | Yes |
| GET | /api/links/account-count | 含账号的链接数量 | Yes |
| GET | /api/links/search-by-url | 按 URL 精确搜索已有链接（去重提示，返回匹配列表含 `accountCount`） | Yes |
| PUT | /api/links/batch-tags | 批量设置标签 `{ids, tags, mode?}`（mode: set 覆盖 / add 追加 / remove 移除，默认 set） | Yes |
| POST | /api/links | 创建（可含 `accounts` 数组） | Yes |
| POST | /api/links/:id/accounts | 追加单个账号 | Yes |
| PUT | /api/links/:id/accounts/:accountId | 编辑指定账号（明文逐字段写入，密码必填） | Yes |
| DELETE | /api/links/:id/accounts/:accountId | 删除单个账号 | Yes |
| PUT | /api/links/:id | 仅更新基础字段（不触碰存量账号字段） | Yes |
| DELETE | /api/links | 清空当前用户全部链接 | Yes |
| DELETE | /api/links/:id | 删除单个 | Yes |
| POST | /api/links/batch | 批量导入 | Yes |
| GET | /api/links/export | 导出（format=json 默认 / csv） | Yes |

- 含账号写入的请求（创建带 `accounts`、追加账号）中账号密码为空时拒绝保存。
- 账号生命周期由 `/:id/accounts` 子接口独占：基础更新接口强制忽略 `accounts/hasAccount/passwordUpdatedAt`，避免"编辑覆盖存量账号"。
- 导出包含明文账号字段（可备份还原）；批量导入不还原凭据。
- 前端导入兼容三种结构：`{data:[...]}`（导出格式）、`{links:[...]}`、纯数组。

### 3.2 标签

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET/POST | /api/tags | 列表 / 创建 | Yes |
| PUT/DELETE | /api/tags/:id | 更新 / 删除 | Yes |

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

- **快速导入**：顶部输入框铺满内容区整行，粘贴 URL 回车即创建，元数据自动抓取。
- **表格列**：标题（含图标）/ 链接 / 标签 / 操作。操作列包含：账号管理（钥匙图标，点击直接打开“账号详情”弹窗，无关联账号的链接同样可打开）、加入图标库（星星图标，仅当链接图标为网址 favicon 且未加入图标库时显示）、编辑、删除。
- **账号管理**：添加/编辑链接弹窗不再包含关联账号面板；所有账号管理操作统一通过列表页操作列的「账号管理」按钮进入"账号详情"弹窗处理——表格形式展示（用户名/邮箱/密码/备注/操作），密码直接可见并可复制，支持逐个编辑（回填当前值，修改后保存）与追加新账号；增删改后自动刷新；无关联账号时弹窗展示空列表与「添加关联账号」入口，可直接新增。
- **密码生成**：「添加关联账号」表单的密码输入框右侧带「生成」按钮，点击即在浏览器端生成 16 位随机密码（字符集 `a-zA-Z0-9`，首字符固定为大写字母 `A-Z`，取随机数用 `crypto.getRandomValues`）填入；可多次点击重新生成替换，生成后仍可手动编辑。
- **本地文件**：`file:///` 显示📁图标+复制按钮；操作栏「复制并打开」（剪贴板保底，浏览器可能拦截 `file://` 打开）。
- **标签管理**：弹窗内增删改（名称+颜色），实时同步筛选下拉与表单选项。
- **图标选择器**：编辑链接时，图标选择器会根据当前网址自动探测官方 favicon（`origin/favicon.ico`），显示为虚线边框的可点击选项，点击即可添加为图标；用户自定义图标库中的图标以绿色边框显示；已选中的官方图标显示为实线边框；加载过程中显示 `...` 占位符。
- **自定义图标库**：操作栏的「加入图标库」按钮可将当前链接的网址 favicon 保存到用户的自定义图标库，保存后该图标可在所有链接的图标选择器中复用。自定义图标库存储于 `custom_icons.db`，每个用户独立。
- **数据**：清空（Popconfirm 二次确认）、导出 `quicklink-export-YYYY-MM-DD.json`、导入兼容三种结构。
- **批量选择与设标签**：表格开启 `rowSelection` 多选，选中后工具栏出现「批量设标签 (N)」按钮；弹窗支持三种操作方式——覆盖（替换选中链接的全部标签）、追加（合并新标签到已有标签）、移除（从已有标签中删除指定标签），标签输入支持从已有标签选择或手动输入新标签。
- **URL 去重提示**：添加/编辑链接弹窗中，URL 输入框内容变化后停顿 400ms 自动调用 `search-by-url` 查询已有链接；若发现相同 URL 的已有链接，在表单中显示黄色警告区域（最多展示 5 条标题与标签），编辑模式下排除自身；帮助用户避免重复添加同一网址。

## 6. 设计决策

- **账号密码合并到链接**：账号天然与 URL 关联，独立集合增加认知负担；合并后链接可选携带凭据，`hasAccount` 标识。账号管理入口统一收敛到列表页操作列，添加/编辑链接时仅处理基础字段。
- **一链接多账号（内嵌数组）**：同一网址常有多个身份（工作/私人/小号），`accounts` 数组内嵌于链接文档，每条独立 `_id` 支持定向删除与定向编辑；追加/删除/编辑走子接口而非整体替换，与基础编辑互不干扰。
- **URL 去重实时提示**：添加链接时用户可能不记得已有同 URL 条目，前端在 URL 输入停顿 400ms 后调用 `search-by-url` 精确匹配，以警告色块展示重复项（含标题与标签），编辑模式下排除自身避免误报；纯前端提示不阻断创建，用户可自行判断。
- **标签管理合并到链接管理**：标签是链接的从属属性，独立页面使用频率低；以 TagManager 弹窗并入链接页，旧路由 `/tags` 重定向兼容书签。
- **本地文件路径支持**：个人知识管理不限于网页；`normalizeUrl()` 将本地路径转 `file:///`，前端特殊 UI + 「复制并打开」（剪贴板保底）。
- **链接图标双形态**：`icon` 支持内置图标名与官方图标 URL：官方 logo 辨识度高但受源站可用性影响（加载失败前端降级内置图标）；导入自动抓取，手动选择优先。
- **关联账号密码客户端生成**：「生成」按钮在前端直接生成（`LinksPage` 的 `genPassword`，基于 `crypto.getRandomValues`），不走服务端 `/api/accounts/:id/generate`（该接口仅属兼容保留的旧 accounts 集合），多次点击即时替换无需网络往返；规则定为 16 位 `a-zA-Z0-9` 且首字符大写，兼顾强度与部分站点对字符集/首字符的限制。
- **secrets 对无账号链接返回空列表**：账号管理入口展示在每条链接上，无账号时返回 404 会在前端呈现为误导性错误提示，故改为返回空列表，弹窗直接提供追加入口（2026-08）。
