# QuickLink — 链接管理模块

> 模块文档之一。总览见 [BUILD.md](./BUILD.md)，其余模块：[笔记管理](./NOTES.md) / [用户信息管理](./USER.md) / [接口管理](./API.md)。

## 1. 功能概览

标签分组卡片展示（每个标签可配置每行链接数，标签管理支持一键统一全部标签列数）、链接卡片背景色（逐链接设置十六进制色值，可从预设色板选取或自定义，预设背景色独立管理并随数据导入导出）、搜索（防抖 300ms 前端过滤）、CRUD、本地文件 `file:///` 支持、URL 去重提示、关联账号密码（支持一个链接多个账号，明文存储直接查看，支持编辑）、数据清空/导出/导入（JSON/CSV，导出含自定义图标与标签及背景色）、标签管理弹窗（含每行链接数配置、↑/↓ 上下移动排序，链接展示顺序与标签排序一致）、复制并用系统浏览器打开（所有 URL）。

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/links/` | `linkController.ts` / `tagController.ts` / `presetColorController.ts` / `accountController.ts`(兼容保留) + `routes.ts` / `tags.routes.ts` / `presetColors.routes.ts` / `accounts.routes.ts` |
| 前端 | `client/src/modules/links/` | `LinksPage.tsx`（列表/导入/搜索/凭据弹窗）、`LinkIcon.tsx`（内置图标库+图标选择器）、`TagManager.tsx`（标签管理弹窗）、`ColorManager.tsx`（背景色管理弹窗） |

## 2. 数据模型

### links（合并账号密码）

```json
{ "_id": "uuid", "userId": "ref", "url": "http/https/file", "title": "required",
  "description": "optional", "icon": "内置图标名 或 官方图标 URL",
  "backgroundColor": "#RRGGBB? (卡片背景色, 十六进制 #RGB/#RGBA/#RRGGBB/#RRGGBBAA)",
  "tag": "单个标签名 (新字段, 主用)", "tags": ["旧字段, 兼容已有数据"],
  "isFavorite": false, "isArchived": false, "clickCount": 0, "lastVisitedAt": "ISO?",
  "hasAccount": "boolean (= accounts.length > 0)",
  "accounts": [ { "_id": "uuid", "username?": "明文", "email?": "明文",
                  "password": "明文", "notes?": "明文", "createdAt": "ISO" } ],
  "passwordUpdatedAt": "ISO?", "createdAt": "ISO", "updatedAt": "ISO" }
```

> 一个链接可关联多个账号，每个账号条目独立 `_id`（用于定向删除），四个字段明文存储。凭据仅 `GET /api/links/:id/secrets` 按需返回、前端可直接查看，列表接口不暴露凭据内容（仅返回 `accountCount`）。存量旧版密文转为占位提示，见 [USER.md §3](./USER.md)。
> `tag` 为新的单标签字段（主用），`tags` 为旧版多标签数组（兼容保留）。创建/更新时以 `tag` 为准，列表展示优先 `tag`，其次 `tags[0]`，默认 `"其他"`。
> `backgroundColor` 为链接卡片背景色：创建/更新/导入时经服务端校验，仅接受 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA` 十六进制色值，null/非法值一律存 null（恢复默认背景，前端渲染时跳过 falsy 值）。

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

### preset_colors（预设背景色）

```json
{ "_id": "uuid", "userId": "ref", "color": "#rrggbb (小写十六进制)", "createdAt": "ISO" }
```

> 用户在「背景色管理」弹窗维护的色板，供添加/编辑链接时快速选用。存储于 `preset_colors.db`，索引 `presetColors(userId)`；
> 不建 color 全局唯一索引（同一色值跨用户各自独立是常态），重复由控制器按 `{userId, color}` 判定（409）。
> 色值校验与链接 `backgroundColor` 共用 `normalizeColor()`（`#RGB/#RGBA/#RRGGBB/#RRGGBBAA`，统一小写）。

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
| PUT | /api/links/:id | 仅更新基础字段（不触碰存量账号字段；`backgroundColor` 传入时经校验归一，null/非法值清除背景色） | Yes |
| DELETE | /api/links | 清空当前用户全部链接 | Yes |
| DELETE | /api/links/:id | 删除单个 | Yes |
| POST | /api/links/batch | 批量导入（可含 `customIcons`、`tags` 与 `linkColors`，按 URL/名称/色值去重） | Yes |
| POST | /api/links/batch-delete | 批量删除 `{ids}` | Yes |
| GET | /api/links/export | 导出（format=json 默认含 `customIcons`/`tags` / csv 含 Icon 列） | Yes |

- 含账号写入的请求（创建带 `accounts`、追加账号）中账号密码为空时拒绝保存。
- 账号生命周期由 `/:id/accounts` 子接口独占：基础更新接口强制忽略 `accounts/hasAccount/passwordUpdatedAt`，避免"编辑覆盖存量账号"。
- JSON 导出包含链接数据（含 `backgroundColor`）、`customIcons`（自定义图标）、`tags`（标签）与 `linkColors`（预设背景色），不含账号凭据（账号单独管理）；CSV 导出含 Icon 与 BackgroundColor 列；批量导入不还原凭据，但携带 `backgroundColor` 与 `linkColors`（同样经校验归一、按色值去重）。
- 前端导入兼容三种结构：`{data:[...], customIcons:[...], tags:[...], linkColors:[...]}`（导出格式）、`{links:[...]}`、纯数组；导入后自动刷新标签列表、自定义图标库与预设背景色。

### 3.2 标签

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET/POST | /api/tags | 列表（按 `sortOrder` 升序）/ 创建 `{name, color?, columns?}`（自动追加到末尾） | Yes |
| PUT | /api/tags/reorder | 重排序 `{ids: [...]}`，按传入 id 顺序重写各标签 `sortOrder`（0..n-1） | Yes |
| PUT | /api/tags/batch-columns | 统一设置每行链接数 `{columns: 1~8}`：更新全部已有标签，并为仅存在于链接上而无标签记录的分组（含未打标签的「其他」）补建记录，使统一设置覆盖页面展示的所有分组 | Yes |
| PUT/DELETE | /api/tags/:id | 更新 `{name?, color?, columns?}` / 删除 | Yes |

### 3.2.1 自定义图标库

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/custom-icons | 列表（用户自定义图标） | Yes |
| POST | /api/custom-icons | 添加 `{url, label?}` | Yes |
| DELETE | /api/custom-icons/:id | 删除单个 | Yes |
| DELETE | /api/custom-icons | 清空当前用户全部自定义图标 | Yes |

自定义图标库存储用户收集的网址 favicon，可在图标选择器中复用。每个用户独立，`url` 字段唯一（同一网址不重复添加）。

### 3.2.2 预设背景色

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/preset-colors | 列表（按添加顺序，`createdAt` 升序） | Yes |
| POST | /api/preset-colors | 添加 `{color}`（十六进制校验并小写归一；同用户同色值 409） | Yes |
| DELETE | /api/preset-colors/:id | 删除单个（不存在 404） | Yes |

预设背景色是用户维护的色板（`preset_colors.db`），供添加/编辑链接的背景色快捷选择；随 JSON 导出（`linkColors` 数组）与批量导入携带（按色值去重，非法值跳过）。

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

- **布局**：顶部单行工具栏（flex 布局，窄窗口自动换行）——搜索框（`flex: 1` 自适应宽度，保底 200px）+ 操作按钮（清空/导出/导入/标签管理/背景色管理/添加链接）；下方为标签分组卡片区域。加载中显示与卡片同网格结构的骨架屏（Skeleton，加载完成无布局跳动）；无数据/搜索无结果时显示 Empty 空态（后者提示换关键词，前者附「添加第一条链接」主按钮）。
- **标签分组卡片展示**：调用 `GET /api/links/all` 获取全部链接（按标签分组），每个标签作为一个分区——标签名以胶囊徽章显示（`borderRadius: 999`，取标签配置颜色，无颜色时使用主题色；浅色标签自动配深色文字），旁边显示「{N} 个链接」计数，下方为链接卡片网格；分区顺序与标签管理中的排序一致（按 `sortOrder` 升序，“其他”及未入列表的遗留标签追加在后）；每个标签的网格列数由 `tagColumns[tagName]` 控制（默认 5，可在标签管理中单独配置 1~8 或统一设置）；表单标签下拉以「其他」+ 标签列表去重合并（避免「其他」成为真实标签记录后重复出现）。
- **链接卡片**：Ant Design `Card`（`hoverable`，圆角随全局 `borderRadiusLG`=12），单行布局——链接信息行（左侧图标 + 标题文本单行省略、字重 500 + 有账号时钥匙图标）与悬浮操作栏**同一行**（见下条）；悬浮微抬升 1px、按压轻缩放（`transform` 实现，不引发布局回流）。卡片背景色取 `backgroundColor`（有值时以内联样式覆盖默认背景），并按 WCAG 相对亮度判定深浅：偏深背景挂 `.link-card-dark` 类，标题/操作按钮自动切浅色（`isDarkColor()`，antd v5 组件规则特异性为 0，普通 CSS 选择器可直接覆盖）；标签头胶囊徽章同理（浅色标签配深色文字）。操作栏为信息行末尾的**常规 flex 项**（永久保留自身宽度，`visibility:hidden` 不改变布局）：默认 `opacity:0` + `visibility:hidden`（不占交互），`.ant-card-hoverable:hover` 时经 CSS 过渡淡入（模块级注入 `style` 标签避免重复创建）；因操作栏与图标/标题/钥匙图标同处一行而互不重叠，悬浮显示时**不遮挡任何链接信息**，淡入前后标题省略位置与卡片宽度也完全不变。卡片与标题均设 `minWidth: 0`，长标题的固有宽度不再撑大网格 1fr 轨道（超出部分交由省略号）；窄窗口下 5 列布局会挤压标题宽度，可经标签管理调低每行链接数缓解。
- **悬浮操作面板**：与链接信息同行，作为信息行最后一个 flex 项靠右——复制并打开（仅 URL 非空时显示）、账号管理（钥匙图标）、加入图标库（仅图标为 URL favicon 且未入库时显示）、编辑、删除（Popconfirm 二次确认）。操作按钮组件 `LinkSettings` 提取到组件外部定义，避免每次渲染重建导致卸载/重建。
- **账号管理**：所有账号管理操作统一通过卡片悬浮的「账号管理」按钮进入“账号详情”弹窗处理——卡片形式展示（用户名/邮箱/密码/备注/操作），密码直接可见并可复制，支持逐个编辑（回填当前值，修改后保存）与追加新账号；增删改后自动刷新；无关联账号时弹窗展示空列表与「添加关联账号」入口，可直接新增。
- **密码生成**：「添加关联账号」表单的密码输入框右侧带「生成」按钮，点击即在浏览器端生成 16 位随机密码（字符集 `a-zA-Z0-9`，首字符固定为大写字母 `A-Z`，取随机数用 `crypto.getRandomValues`）填入；可多次点击重新生成替换，生成后仍可手动编辑。
- **本地文件**：无 URL 时卡片 cursor 为 `default`、点击无反应。`file:///` 链接无法从 `http://` 页面打开（浏览器安全策略拦截，原先依赖的 Electron `shell.openExternal` 已随桌面版移除），改为把真实本地路径复制到剪贴板并提示「浏览器无法直接打开本地文件，路径已复制到剪贴板」（`file:///C:/x` → `C:/x`，`file:////server/share` → `//server/share`，资源管理器地址栏可识别）。见 [BUILD.md §9.5](./BUILD.md)。
- **标签管理**：弹窗内增删改（名称 + 颜色 + 每行链接数）与上下移动排序（每行提供 ↑/↓ 按钮，首行禁用↑、末行禁用↓；本地即时重排后调用 `PUT /api/tags/reorder` 持久化新顺序），列表展示每个标签的彩色名称与当前每行链接数；排序变更实时同步到链接展示的分组顺序、筛选下拉与表单选项。弹窗顶部提供**「统一每行链接数」**设置（数字输入 1~8 + 「应用到全部」按钮，初始值取首个标签当前列数）：调用 `PUT /api/tags/batch-columns` 一次性将全部分组改为同一列数（覆盖各标签单独设置，并为无标签记录的分组补建记录），应用后自动刷新标签列表与链接页网格。
- **链接背景色**：添加/编辑链接表单的「背景色」区 = 取色器 + 预设色板两行：取色器 `ColorPicker`（`allowClear` + 十六进制格式显示，空态显示「无色」）负责自定义；色板行提供「默认背景」（斜线圆点）+ 预设背景色圆点（点击即把色值写入表单，`form.setFieldValue`；当前值经 `Form.useWatch` 计算选中态，选中项显示主题色描边环，比较用 `normalizeHexKey` 把 3/4 位简写与 6 位展开视为同色）+「管理」入口 + 「存为预设」（仅当前色不在预设时出现，点击即调 `presetColorApi.add` 并刷新色板）。提交时 Color 对象转 `toHexString()`、清除（cleared 标记）或留空提交 `null`；服务端校验后存库，卡片渲染时以 `backgroundColor` 作为内联背景样式（无值用默认背景，偏深背景自动切浅色文字，见「链接卡片」条）。
- **背景色管理**：工具栏「背景色管理」按钮（或表单色板「管理」入口）打开 `ColorManager` 弹窗：顶部 ColorPicker + 「添加」按钮把选好的色值入板（重复 409 提示），下方以胶囊 chips 展示既有预设（色点 + 色值 + 删除按钮，直接删除无二次确认——色值可随时重新添加）；增删后实时刷新表单色板（与链接数据无耦合，仅刷新预设列表）。
- **图标选择器**：编辑链接时，`IconPicker` 渲染内置图标库（25 个，选中项主题色实线边框、未选灰色边框），并根据当前网址自动探测官方 favicon（`origin/favicon.ico`）——探测成功显示为主题色虚线边框的可点击选项，点击即填入该图标，探测过程中显示 `...` 占位符。当前选择器仅渲染内置图标与探测到的官方 favicon，不展示自定义图标库条目（自定义图标见下条）。
- **自定义图标库**：悬浮面板的「加入图标库」按钮（仅当链接图标为 URL favicon 且尚未入库时显示）经 `customIconApi.add` 将当前网址 favicon 存入用户自定义图标库（按 URL 去重，已在库中则提示「该图标已在图标库中」）；图标库存储于 `custom_icons.db`、每个用户独立，页面加载时经 `customIconApi.list` 读入，用于悬浮面板的入库状态判定，并随导出/导入携带（见 §3.1、§3.2.1）。
- **数据**：清空（Popconfirm 二次确认）、导出 `quicklink-export-YYYY-MM-DD.json`（含自定义图标、标签与预设背景色数据）、导入兼容三种结构（解析 `customIcons`/`tags`/`linkColors` 并刷新标签列表、图标库与预设色板）。
- **搜索**：顶部搜索框输入停顿 300ms 后在前端对已加载的分组数据进行过滤（按标题/URL/描述不区分大小写匹配），保留命中分组。
- **复制并用新标签页打开**：悬浮面板「复制并打开」按钮对所有有 URL 的链接均可用；`http(s)` 链接经 `window.open` 打开新标签页并复制地址（提示「地址已复制，并在新标签页打开」），`file://` 链接按上条降级为仅复制本地路径、不重复提示。
- **URL 去重提示**：添加/编辑链接弹窗中，URL 输入框内容变化后停顿 400ms 自动调用 `search-by-url` 查询已有链接；若发现相同 URL 的已有链接，在表单中显示黄色警告区域（最多展示 5 条标题与标签），编辑模式下排除自身；帮助用户避免重复添加同一网址。

## 6. 设计决策

- **标签分组卡片布局**：链接管理的核心诉求是快速浏览与操作，卡片网格比表格更直观；每个标签作为独立分区，标签颜色作为分区标题色，卡片悬浮显示操作按钮（减少视觉噪音）。每标签可配置列数（默认 5），适配不同屏幕宽度与使用习惯。
- **操作栏与链接信息同行（常规占位）**：悬浮操作栏先后经历三版——最初绝对定位在卡片右侧中部，悬浮时遮挡链接标题；二版改为信息行上方的独立保留行，不遮挡但卡片偏高、未悬浮时顶部留白；三版与信息同行并仅预留操作栏宽度的一半（实测写入 `paddingRight`），标题空间更大但悬浮时操作栏左半段会覆盖长标题省略号尾部。现行版把操作栏做成信息行末尾的**常规 flex 项**：永久保留自身宽度（`visibility:hidden` 不改变布局），与图标/标题/钥匙图标天然互不重叠——悬浮显示时不遮挡任何链接信息，布局恒定零跳动，且无需任何 JS 实测/预留逻辑（三版的测量代码随之删除）。代价是标题可用宽度比半宽预留少约 54px（1920 宽 5 列时标题约 137px，足够；窄窗口 5 列会明显挤压，可调低每行链接数）。顺带修复长标题撑大 1fr 轨道的问题（卡片与标题 `minWidth: 0`）；不悬浮时 `visibility:hidden` 同时屏蔽点击。
- **标签统一列数（batch-columns）**：逐标签配置列数在标签较多时繁琐，「统一设置」一次提交全量列数。服务端除更新全部已有标签外，还为仅存在于链接上而无标签记录的分组（导入数据带来的标签、未打标签的「其他」兜底分组）补建记录——否则这些分组永远停留在默认 5 列且不在标签管理中出现，统一就不完整；补建记录顺带使这些分组可配置颜色与排序。「其他」由批量端点补建后成为真实标签记录，表单下拉以去重合并避免重复项。
- **链接背景色（backgroundColor）**：逐链接支持设置卡片背景色，便于视觉区分常用/重要链接。取值限定十六进制色值（`ColorPicker` 提交 `toHexString()`，服务端 `normalizeColor` 校验 `#RGB/#RGBA/#RRGGBB/#RRGGBBAA` 并小写归一，非法值归一为 null）——不放开任意 CSS 字符串可避免脏样式注入；清除走 `null` 显式提交（NeDB `$set` 落库为 null，前端渲染跳过 falsy 值）。背景色随 JSON/CSV 导出与导入携带，形成闭环。
- **预设背景色独立成集合（preset_colors）**：常用背景色是跨链接复用的偏好而非单条链接的属性，独立集合 + 独立管理弹窗使其可一次维护、处处选用；表单色板点选（写入表单）与取色器自定义（自由输入）并存，「存为预设」把自定义沉淀回色板。色值不建全局唯一索引：同一色值跨用户各自持有是常态（与 customIcons 的 `url` 全局唯一不同），重复按 `{userId, color}` 判定；导出/导入与图标、标签同通道携带（`linkColors` 数组，按色值去重）。
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
