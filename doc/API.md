# QuickLink — 接口管理模块

> 模块文档之四。总览见 [BUILD.md](./BUILD.md)，其余模块：[链接管理](./LINKS.md) / [笔记管理](./NOTES.md) / [用户信息管理](./USER.md)。

## 1. 功能概览

模仿 Postman 的本地接口管理工具，支持环境配置与切换、集合/文件夹/请求三级树形管理、HTTP 请求发送与响应查看（含 Cookies 编辑）、请求历史记录、集合导出/导入、拷贝为 cURL。

**核心能力**：

- **环境管理**：创建多个环境（如开发/测试/生产），每个环境配置键值对变量，请求 URL/Headers/Body 中的 `{{变量名}}` 自动替换为当前激活环境的值
- **集合树**：支持集合 → 文件夹 → 请求三级结构，右键菜单操作（新建子文件夹、新建请求、重命名、导出集合、删除），删除集合时级联删除所有子项
- **请求构建**：7 种 HTTP 方法（GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS）、Query Params / Headers / Cookies 键值对编辑（支持启用/禁用）、4 种 Body 类型（none/json/form-urlenc/raw）、Bearer Token 与 Basic Auth 认证、拷贝为 cURL
- **响应查看**：状态码（颜色标识）、耗时（ms）、响应大小、Body（JSON 自动格式化）、响应 Headers 表格
- **历史记录**：每次发送请求自动保存快照（请求参数 + 响应摘要），支持分页加载、点击恢复、清空全部
- **导出/导入**：右键导出集合为 JSON 文件（含完整树形结构与所有请求配置），支持导入还原

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/api/` | `environmentController.ts` / `collectionController.ts` / `historyController.ts` / `proxyController.ts` + `routes.ts` |
| 前端 | `client/src/modules/api/` | `ApiPage.tsx`（主页面）、`ApiSidebar.tsx`（集合树+历史面板）、`RequestBuilder.tsx`（请求构建器）、`ResponseViewer.tsx`（响应查看器）、`EnvironmentModal.tsx`（环境管理弹窗） |

## 2. 数据模型

### api_environments（环境配置）

```json
{ "_id": "uuid", "userId": "ref", "name": "环境名称",
  "variables": [ { "key": "baseUrl", "value": "http://localhost:3000", "enabled": true } ],
  "isActive": false, "createdAt": "ISO", "updatedAt": "ISO" }
```

> 每个用户可有多个环境，但同一时刻仅一个处于激活状态（`isActive: true`）。激活切换时服务端先将该用户所有环境置为 `false`，再将目标环境置为 `true`。

### api_collections（集合/文件夹/请求，统一树形结构）

```json
{ "_id": "uuid", "userId": "ref",
  "parentId": "null=根级集合 / 父节点_id",
  "type": "collection | folder | request",
  "name": "节点名称", "sortOrder": 0,
  // type === "request" 时以下字段有效
  "method": "GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS",
  "url": "https://api.example.com/users",
  "headers": [ { "key": "Content-Type", "value": "application/json", "enabled": true } ],
  "queryParams": [ { "key": "page", "value": "1", "enabled": true } ],
  "cookies": [ { "key": "session", "value": "abc123", "enabled": true } ],
  "bodyType": "none | json | form-data | x-www-form-urlencoded | raw | binary",
  "body": "{ \"name\": \"test\" }",
  "authType": "none | bearer | basic",
  "authConfig": { "token": "xxx" } 或 { "username": "xxx", "password": "xxx" },
  "createdAt": "ISO", "updatedAt": "ISO" }
```

> 集合、文件夹、请求共用同一集合（`api_collections`），通过 `type` 字段区分。树形结构通过 `parentId` 实现：`null` 表示根级集合，非空指向父节点 `_id`。`sortOrder` 控制同级节点显示顺序。删除集合/文件夹时递归收集所有子孙 ID 后级联删除。

### api_history（请求历史）

```json
{ "_id": "uuid", "userId": "ref",
  "method": "GET", "url": "https://api.example.com/users",
  "statusCode": 200, "duration": 125,
  "requestSnapshot": { "method": "GET", "url": "...", "headers": [...], "queryParams": [...], "cookies": [...], "bodyType": "json", "body": "...", "authType": "none" },
  "responseSnapshot": { "statusCode": 200, "statusText": "OK", "size": 1024 },
  "createdAt": "ISO" }
```

> 每次发送请求后自动记录一条历史，包含完整的请求快照和响应摘要。历史按时间倒序排列，支持分页（默认每页 50 条）。点击历史条目可恢复请求参数到编辑器。

索引：`apiEnvironments(userId)`、`apiCollections(userId)`、`apiCollections(parentId)`、`apiHistory(userId)`。

## 3. API

### 3.1 环境管理

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/api-manager/environments | 列表（当前用户全部环境，按名称排序） | Yes |
| POST | /api/api-manager/environments | 创建 `{name, variables?}` | Yes |
| PUT | /api/api-manager/environments/:id | 更新 `{name?, variables?}` | Yes |
| DELETE | /api/api-manager/environments/:id | 删除 | Yes |
| POST | /api/api-manager/environments/:id/activate | 激活环境（先将该用户所有环境置为非激活，再将目标激活） | Yes |

### 3.2 集合/请求管理

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/api-manager/collections | 获取全部节点（扁平列表，前端组装树） | Yes |
| POST | /api/api-manager/collections | 创建节点 `{parentId?, type, name, method?, url?, headers?, queryParams?, cookies?, bodyType?, body?, authType?, authConfig?}` | Yes |
| PUT | /api/api-manager/collections/:id | 更新节点（允许字段：name/parentId/sortOrder/method/url/headers/queryParams/cookies/bodyType/body/authType/authConfig） | Yes |
| DELETE | /api/api-manager/collections/:id | 删除节点（集合/文件夹级联删除所有子孙） | Yes |
| POST | /api/api-manager/collections/export | 导出集合 `{id}` → 返回 `{version, exportedAt, root, items}` | Yes |
| POST | /api/api-manager/collections/import | 导入集合 `{data}` → 自动重新生成 ID 并映射 parentId | Yes |

- 前端获取扁平列表后根据 `parentId` 关系自行组装为树形结构，避免服务端递归查询。
- 导出格式包含 `version`（版本号，当前为 1）、`exportedAt`（导出时间）、`root`（根节点完整数据）、`items`（所有子孙节点扁平数组）。
- 导入时服务端为每个节点重新生成 `_id`，通过 `idMap` 映射旧 ID → 新 ID 以正确重建 `parentId` 关系。

### 3.3 历史记录

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/api-manager/history | 列表（分页，`?page=1&limit=50`，按时间倒序） | Yes |
| POST | /api/api-manager/history | 记录一条历史 `{method, url, statusCode, duration, requestSnapshot, responseSnapshot}` | Yes |
| DELETE | /api/api-manager/history/:id | 删除单条 | Yes |
| DELETE | /api/api-manager/history | 清空当前用户全部历史 | Yes |

### 3.4 HTTP 代理发送

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| POST | /api/api-manager/send | 代理发送 HTTP 请求 | Yes |

请求体：

```json
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": [{ "key": "Content-Type", "value": "application/json", "enabled": true }],
  "queryParams": [{ "key": "verbose", "value": "1", "enabled": true }],
  "cookies": [{ "key": "session", "value": "abc123", "enabled": true }],
  "bodyType": "json",
  "body": "{ \"name\": \"test\" }",
  "authType": "bearer",
  "authConfig": { "token": "eyJhbGci..." }
}
```

响应体：

```json
{
  "success": true,
  "data": {
    "statusCode": 201,
    "statusText": "Created",
    "headers": { "content-type": "application/json", ... },
    "body": "{ \"id\": 1, \"name\": \"test\" }",
    "duration": 235,
    "size": 42
  }
}
```

- 服务端使用 Node.js 内置 `fetch`（Node 20）代理发送，避免浏览器 CORS 限制。
- 超时 30 秒（`AbortController`），超时后返回网络错误。
- Query Params 自动拼接到 URL（`URLSearchParams`）。
- 认证处理：`bearer` 类型自动添加 `Authorization: Bearer <token>` 头；`basic` 类型自动 Base64 编码 `username:password` 并添加 `Authorization: Basic <encoded>` 头。
- Cookie 处理：启用的 Cookie 键值对自动拼接为 `Cookie` 请求头（格式 `key1=value1; key2=value2`）。
- Body 仅在 POST/PUT/PATCH/DELETE 方法时发送；`json` 类型自动设置 `Content-Type: application/json`；`x-www-form-urlencoded` 自动设置对应 Content-Type。
- 网络错误（DNS 失败、连接拒绝等）不返回 500，而是返回 `statusCode: 0`、`statusText: "Network Error"` 的正常响应，便于前端统一处理。

## 4. 业务规则

### 4.1 环境变量替换

发送请求前，前端将 URL、Headers（key 和 value）、Cookies（key 和 value）、Body 中的 `{{变量名}}` 替换为当前激活环境对应变量的值。替换规则：

- 正则匹配 `\{\{(\w+)\}\}`（双花括号包裹的单词字符）
- 变量未定义时保留原始占位符不替换（如 `{{unknown}}` 保持原样）
- 仅启用（`enabled: true`）且 key 非空的变量参与替换
- 替换在前端完成，服务端代理收到的已是替换后的实际值

### 4.2 级联删除

删除集合或文件夹时，服务端递归收集该节点下所有子孙节点的 `_id`，一次性批量删除。流程：

1. 查询目标节点的所有直接子节点
2. 对每个非请求类型的子节点（集合/文件夹），递归执行步骤 1
3. 合并所有 ID（含目标节点自身），批量删除

### 4.3 导出/导入格式

导出 JSON 结构：

```json
{
  "version": 1,
  "exportedAt": "2026-09-01T12:00:00.000Z",
  "root": { "_id": "...", "name": "用户接口", "type": "collection", ... },
  "items": [
    { "_id": "...", "parentId": "root_id", "name": "获取用户", "type": "request", "method": "GET", ... },
    { "_id": "...", "parentId": "...", "name": "子文件夹", "type": "folder", ... }
  ]
}
```

导入时所有节点重新生成 `_id`，通过 ID 映射表正确重建父子关系。`userId` 强制设为当前登录用户。

## 5. 前端交互

### 5.1 页面布局

```
+----------------------------------------------------------+
| [环境: 开发环境 v]                          [发送] [保存]  |
+-------------------+--------------------------------------+
| [集合] [历史]      | 请求构建器                            |
|                   | [方法 GET v] [URL_______________] [Send] [cURL]
| > 用户接口         | [Params][Headers][Cookies][Body][Auth]  |
|   > 获取用户列表   | +------------------------------------+
|   > 创建用户       | |  响应结果                          |
|   > 删除用户       | |  Status: 200  Time: 125ms  Size: 1KB
| > 订单接口         | |  Body: { "data": ... }             |
|   > 订单列表       | |                                    |
|                   | +------------------------------------+
+-------------------+--------------------------------------+
```

- **顶部工具栏**：环境下拉选择器（含"无环境"和"管理环境..."选项）、发送按钮、保存按钮；URL 栏右侧 cURL 按钮将当前请求（含环境变量替换后的值、Headers、Cookies、Auth、Body）拷贝为 cURL 命令到剪贴板
- **左侧面板**（280px 固定宽度）：集合/历史两个 Tab 页切换
- **右侧内容区**：上方请求构建器 + 下方响应查看器，灵活分配空间

### 5.2 集合树

- 使用 Ant Design `Tree` 组件，前端根据扁平数据动态构建树形结构
- 请求节点显示方法标签（GET 绿色/POST 橙色/PUT 蓝色/DELETE 红色/PATCH 紫色/HEAD 青色/OPTIONS 粉色），截取前 3 字符显示
- 点击请求节点加载到编辑器，点击集合/文件夹节点展开/收起
- 当前选中的请求高亮显示

### 5.3 右键菜单

集合/文件夹节点右键菜单：
- **新建子文件夹** — 在当前节点下创建文件夹
- **新建请求** — 在当前节点下创建请求并加载到编辑器
- **导出集合** — 仅集合类型显示，导出为 JSON 文件下载
- **重命名** — 节点标题变为 Input 输入框，回车或失焦保存
- **删除** — 直接删除（集合级联删除所有子项）

### 5.4 请求构建器

- **方法选择**：Select 下拉，7 种 HTTP 方法
- **URL 输入**：支持环境变量占位符 `{{baseUrl}}/api/users`，回车触发发送
- **快捷键**：`Ctrl+Enter` 或 `Cmd+Enter` 发送请求
- **Params/Headers/Cookies Tab**：通用键值对编辑器，每行包含启用开关 + Key + Value + 删除按钮，底部"添加"按钮；Cookies Tab 标签显示启用条目数量
- **Body Tab**：4 种类型切换按钮（none/json/form-urlenc/raw），JSON 和 raw 模式显示代码编辑区（等宽字体）
- **Auth Tab**：认证类型下拉（无认证/Bearer Token/Basic Auth），根据选择动态显示 Token 输入框或用户名+密码输入框

### 5.5 响应查看器

- **状态栏**：状态码标签（2xx 绿色/3xx 蓝色/4xx 橙色/5xx 红色/0 网络错误红色）、耗时（ms）、响应大小（B/KB/MB 自动换算）
- **Body Tab**：JSON 自动格式化（`JSON.stringify` 2 空格缩进），等宽字体，非 JSON 原样显示
- **Headers Tab**：表格形式展示响应头（Key 加粗，Value 自动换行）
- 无响应时显示空状态提示"发送请求以查看响应"，发送中显示加载动画

### 5.6 环境管理弹窗

- 左右分栏布局：左侧环境列表（含激活标识绿色对勾、删除按钮），右侧编辑区
- 编辑区包含：环境名称输入框、变量表格（与请求 KV 编辑器相同的交互模式：启用开关 + 变量名 + 值 + 删除）
- 底部操作按钮：保存 + 激活此环境（非当前激活环境时显示）
- 支持新建环境、删除环境

### 5.7 历史记录面板

- 列表形式展示，每条包含：方法标签（颜色同集合树）、状态码标签、耗时、URL（单行省略）
- 点击历史条目恢复请求参数到编辑器（URL/方法/Headers/Params/Cookies/Body/Auth）
- 顶部操作按钮：刷新、清空全部（Popconfirm 二次确认）

### 5.8 快捷键

| 快捷键 | 功能 |
| ------ | ---- |
| `Ctrl/Cmd + Enter` | 发送请求（URL 输入框和请求构建器区域均生效） |
| `Enter`（URL 输入框） | 发送请求 |

## 6. 设计决策

- **统一树形结构**：集合、文件夹、请求共用 `api_collections` 集合而非分表，简化查询与导出逻辑。前端通过 `parentId` 自行组装树，服务端无需递归查询。
- **HTTP 代理而非浏览器直发**：浏览器直接发送请求受 CORS 限制，大多数目标 API 不会配置允许跨域。服务端代理转发绕过此限制，同时支持 30 秒超时保护。
- **环境变量前端替换**：替换逻辑在前端发送前完成，服务端代理收到的是替换后的实际值，无需感知环境变量机制，保持代理层简洁。
- **网络错误返回正常响应**：代理发送失败时不返回 HTTP 500，而是返回 `statusCode: 0` 的正常 JSON 响应。前端统一通过 `SendRequestResult` 处理，避免错误弹窗干扰工作流。
- **扁平列表 + 前端组树**：集合数据量通常不大（数百条），一次返回全部扁平列表由前端组装树，避免递归 API 调用，减少请求次数。
- **历史快照而非引用**：历史记录保存完整的请求快照和响应摘要，而非引用请求 ID。即使原始请求被修改或删除，历史记录仍可完整恢复当时的请求参数。
- **导出含版本号**：`version` 字段为后续格式升级预留兼容空间。导入时重新生成 ID 并映射 parentId，确保不同用户间导入不会产生 ID 冲突。
- **Cookies 独立 Tab**：Cookie 键值对与 Params/Headers 共用同一套 KV 编辑器组件，独立为 Tab 便于集中管理；服务端代理将其拼接为 `Cookie` 请求头而非逐条发送，符合 HTTP 协议规范。
- **cURL 导出**：将当前编辑中的请求（方法/URL/Headers/Cookies/Auth/Body）一键拷贝为 cURL 命令，方便在终端或其他工具中快速复用调试；环境变量在导出时已完成替换。
