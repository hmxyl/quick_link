# QuickLink — 笔记管理模块

> 模块文档之一。总览见 [BUILD.md](./BUILD.md)，其余模块：[链接管理](./LINKS.md) / [用户信息管理](./USER.md) / [接口管理](./API.md)。

## 1. 功能概览

文件夹树（真实文件目录树存储，左面板可收起/展开并记忆，拖拽自定义排序/跨文件夹移动）、标题+内容搜索、键盘方向键导航、右键菜单/「+」按钮新建、Markdown 双模式编辑（所见即所得 / 源码+预览分栏）、回收站、附件管理、zip 导入/导出。

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/notes/` | `noteController.ts`（文件树/排序/导入导出）、`attachmentController.ts`（附件+系统打开）、`routes.ts` |
| 前端 | `client/src/modules/notes/` | `NotesPage.tsx`（树/工具栏/回收站）、`NoteViewer.tsx`（双模式编辑）、`MilkdownEditor.tsx`（所见即所得，懒加载）、`AttachmentManager.tsx`（附件管理弹窗） |

## 2. 存储设计

### 2.1 文件树

笔记**不入库**，以真实文件目录树存储于 `user_data/note/<userId>/`：文件夹=目录，文档=`.md`（UTF-8），回收站=根下隐藏目录 `.trash/`。

- 笔记 ID = 相对 `<userId>` 根的路径（POSIX 分隔符，如 `工作/周报.md`），前端拼 URL 统一 `encodeURIComponent`。
- `createdAt/updatedAt` 取自文件系统 birthtime/mtime。
- 服务端对路径参数做越权校验（禁止 `..` 逃逸用户根）。

### 2.2 note_orders（同级自定义排序）

文件系统本身无序，同级自定义顺序存 `note_orders.db`：

```json
{ "_id": "auto", "userId": "ref", "parentId": "父目录相对路径, 根级为 \"\"",
  "order": "[子项基础名数组, 文档不含 .md, 按显示顺序]" }
```

列表时命中 order 的在前，未命中的按默认规则（文件夹在前+中文名）排后；软删除保留条目（还原后回到原位），数据清空时整体删除。索引：`userId`、`parentId`。

### 2.3 attachments（附件元数据）

```json
{ "_id": "uuid", "userId": "ref", "noteId": "笔记相对路径 | null",
  "originalName": "上传文件名", "storedName": "uuid+扩展名", "size": "bytes",
  "mimeType": "string", "createdAt": "ISO" }
```

附件文件体存 `user_data/attachment/`（uuid 文件名+原扩展名）。索引：`userId`、`noteId`。

### 2.4 文件树操作语义

| 操作 | 行为 |
| ---- | ---- |
| 新建 | 文件名安全化（Windows 非法字符 `\/:*?"<>|` → `_`，去首尾点/空格），同级重名自动追加 ` (n)` |
| 重命名 | 磁盘改名；附件 `noteId` 与排序记录按前缀重映射（含全部后代路径） |
| 移动/排序 | 同级仅改 `note_orders` 不动磁盘；跨级磁盘移动+附件 `noteId`/排序记录重映射，禁止移入自身后代 |
| 软删除 | 整目录/文件移入 `.trash/<原相对路径>`（含全部后代） |
| 还原 | 移回原父级；原父级不存在则挂回根级；同步重映射附件 `noteId` |
| 彻底删除/清空回收站/数据清空 | `fs.rmSync` 并同步删除关联附件磁盘文件 |

## 3. API

> `:id` 为笔记相对路径，前端统一 `encodeURIComponent`（服务端 Express 解码一次后原样使用，避免二次解码破坏含 `%` 标题）。

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/notes | 全部笔记（含回收站项，前端拆分） | Yes |
| POST | /api/notes | 新建 `{type: folder\|note, title?, parentId?}` | Yes |
| PUT | /api/notes/:id | 更新标题/内容 | Yes |
| DELETE | /api/notes/:id | 软删除进回收站（含后代） | Yes |
| POST | /api/notes/:id/restore | 还原 | Yes |
| POST | /api/notes/:id/move | 拖拽排序/跨文件夹移动 `{parentId: 目标父级\|null, index: 插入位置}`；同级仅改顺序记录不动磁盘，跨级磁盘移动+附件 noteId/排序记录重映射，禁止移入自身后代 | Yes |
| DELETE | /api/notes/:id/permanent | 彻底删除（含后代及附件文件） | Yes |
| DELETE | /api/notes/trash | 清空回收站 | Yes |
| POST | /api/notes/wipe | 数据清空（全部笔记+附件+排序记录） | Yes |
| GET | /api/notes/export | 导出 zip | Yes |
| POST | /api/notes/import | 导入 zip（raw body） | Yes |
| GET | /api/notes/attachments | 附件列表 | Yes |
| POST | /api/notes/attachments | 上传 `?noteId=&name=`（raw body 拷贝存储） | Yes |
| GET | /api/notes/attachments/:id/download | 下载 | Yes |
| POST | /api/notes/attachments/:id/open-folder | 在文件管理器中打开所在文件夹并选中（跨平台：Win `explorer /select`；macOS `open -R`；Linux `xdg-open` 目录；需系统环境，桌面版生效） | Yes |
| POST | /api/notes/attachments/:id/open-file | 用系统默认程序打开附件文件（跨平台：Win `cmd /c start`；macOS `open`；Linux `xdg-open`；客户端 Ctrl+点击行触发） | Yes |
| DELETE | /api/notes/attachments/:id | 删除（记录+磁盘文件） | Yes |

### 笔记 zip 格式

```
quicklink-notes-YYYY-MM-DD.zip
├── manifest.json            # app/version/notes 树/attachments 元数据 (导入唯一权威源)
├── notes/**/*.md            # 与存储结构一致的可读副本
└── attachments/<storedName> # 附件文件本体
```

导入按 manifest 父级优先重建（旧路径→新路径映射，重名自动去重），附件重新写入 `attachment/` 并关联新笔记；缺 manifest.json 的 zip 拒绝导入。

## 4. 前端交互

- **布局**：顶部工具栏（数据清空/导出/导入/附件管理）；左面板顶部为 收起/展开按钮 + 笔记/回收站切换（Segmented），其下为搜索框+「+」第一级新建下拉、文件夹树；右侧预览/编辑区。
- **左面板收起/展开**：面板顶部折叠按钮（MenuFold/MenuUnfold 图标，与主侧栏一致）可将面板从 300px 收起到 48px（仅留按钮），树/搜索/切换控件全部隐藏，编辑区获得更大空间；状态存 `localStorage[ql-note-panel-collapsed]`，刷新后保持。
- **拖拽排序/移动**：文件夹树开启 `draggable`（搜索过滤时禁用避免索引错位）；同级拖动调整顺序（仅更新 `note_orders` 不动磁盘），拖到文件夹上/内部则跨文件夹移动（重名自动追加序号，附件 noteId 与排序记录同步重映射，选中/高亮/展开状态按新路径前缀替换）；禁止拖入自身后代，拖入目标文件夹自动展开。
- **搜索**：按标题或正文内容过滤（不区分大小写、输入即过滤），保留命中项祖先链。
- **新建**：「+」下拉与右键空白处均可在第一级目录新建文档/文件夹（支持任意多个根级目录）；右键节点提供新建文档/子层文件夹/子层文件/重命名/移动到/删除。
- **键盘导航**：↑/↓ 在可见节点间移动选中（文件夹仅高亮不打开预览）；← 收起已展开文件夹或跳回父级；→ 展开文件夹或进入首个子节点；输入框聚焦/弹窗打开时不生效。
- **重命名**：antd Modal + Input 弹窗（Electron 不实现 `window.prompt`）。
- **移动到**：右键菜单「移动到」打开目标文件夹选择弹窗（树形选择器，排除自身及其后代），选择后调用 move API 完成跨文件夹移动（重名自动追加序号，附件 noteId 与排序记录同步重映射）。
- **编辑模式**：「编辑」后可用 Segmented 切换两种模式（选择记入 `localStorage`）：① 所见即所得（Milkdown Crepe, 类 Typora；顶部 16 键快捷工具栏经编辑器命令作用于光标/选区，另有选中浮层格式工具栏 + `/` 斜杠块菜单 + 表格/代码块原生编辑）；② 源码+预览（左 Markdown 源码右实时预览 + 快捷工具栏）。保存/完成编辑/Ctrl+S 落盘；标题输入框可直接重命名。
- **编辑工具栏**：两种编辑模式各有一套 16 键工具栏（H1~H3/加粗/斜体/删除线/无序与有序列表/任务清单/引用/行内代码/代码块/链接/图片/表格/分割线）。源码模式基于光标选区文本插入或行前缀切换；所见即所得模式通过 Milkdown 命令（`toggleStrong`/`wrapInHeading`/`insertTable` 等，由 `MilkdownEditor` 经 `forwardRef` 暴露的 `run(cmd)` 执行，标题/引用/任务清单支持再次点击取消）。
- **链接/图片弹窗**：两种编辑模式的链接/图片按钮均不走命令/文本包裹，而是弹出同一个 antd 弹窗——链接填链接名称（必填）+链接地址，图片填图片描述+图片地址（必填）+图片宽度/图片高度（选填，单位像素，留空按原图比例显示）。图片尺寸编码进 Markdown title（`ql-size:WxH` 后缀，见 5 设计决策），两种模式与只读预览共用同一约定。所见即所得模式：光标在已有链接/图片上时回填原值（含尺寸），确认后原位替换（链接整段替换避免双链接；块级图片保持块级节点原位更新）；插入后光标移出链接文本之外，图片显式关闭标记继承，避免后续内容被嵌套进链接；编辑器内链接样式与预览一致（主题蓝，需高特异性选择器压过 Crepe 主题），图片尺寸由 ProseMirror 插件注入 DOM 样式（文档更新与图片加载后按 src 配对应用）。源码模式：确认后在光标处插入 `[名称](地址)` / `![描述](地址 "ql-size:WxH")` 并替换选区；选区为完整链接/图片语法时回填名称+地址+尺寸（整段编辑替换），普通选中文本回填为名称/描述。
- **Milkdown 集成**：`MilkdownEditor.tsx` 封装 Crepe 实例（挂载/销毁、`listener.markdownUpdated` 回传 markdown）；因体积较大用 `React.lazy` 懒加载（仅进入所见即所得时下载）。
- **回收站**：还原/彻底删除/清空；还原时原父级不存在挂回根级。
- **附件**：原始字节流上传拷贝存 `attachment/`；支持下载/删除/编辑模式插入 Markdown 链接；附件管理弹窗统一查看。
- **附件管理弹窗**：每行四键（下载/打开所在文件夹/打开所属笔记/删除）；「所属笔记」列同时识别上传笔记（`noteId`）与正文链接引用的笔记，多个时顿号连接。「打开所属笔记」关闭弹窗后在文件夹树中高亮全部归属笔记（黄底描边，手动选择节点后清除），自动展开祖先并打开第一个笔记；`Ctrl + 左键`点击行直接用系统默认程序打开附件文件（服务端 `POST /attachments/:id/open-file`，桌面版生效）。

## 5. 设计决策

- **笔记文件树存储与附件拷贝**：文件树使笔记可脱离应用直接访问/编辑/备份；软删除移入隐藏 `.trash` 防误操作不可逆；附件拷贝存储（uuid 文件名）保证数据自包含；路径型 ID 省去映射层，重命名/还原前缀重映射附件 noteId；zip 内 .md 副本可脱离应用阅读，导入以 manifest 为唯一权威。上传/导入用 `express.raw` 接收原始字节流（不引入 multipart 库）。
- **重命名弹窗替代 window.prompt**：Electron 不实现 `window.prompt`（调用直接无效）；antd Modal + Input 支持校验/回车提交/自动聚焦，Web 与桌面行为一致。
- **图片尺寸存储约定**：标准 Markdown 无图片宽高语法，而 Milkdown Crepe 块级图片节点仅有 {src, caption, ratio} 属性（alt 会被丢弃为 ratio、组件不支持像素尺寸），因此尺寸编码进图片 title（`ql-size:WxH` 后缀，单位像素，宽高均可省略其一，如 `ql-size:640x` / `ql-size:x180`）：① 所见即所得：inline 图片存 title、块级图片存 caption（↔ title），由 `MilkdownEditor` 的 ProseMirror 插件解析并在 DOM 上注入 `style.width/height`（每次文档更新与图片 load 事件后按 src 配对应用，覆盖 Crepe 组件按自然尺寸重置的行为；inline 图片的 title 悬停提示同时剥除尺寸代码）；② 源码+预览与只读预览：`NoteViewer` 的 marked 自定义渲染器解析 title 输出 `<img width/height>`，尺寸代码不进入 title 属性；③ 往返稳定：该编码经 remark 序列化后原样保留，不影响标准 Markdown 兼容性。块级图片弹出 Crepe 自带的说明编辑框时会显示尺寸代码（接受的折衷）。
- **表格单元格内换行（`<br />`）双向转换**：GFM 表格单元格内换行的标准 Markdown 语法是 `<br />`，但 Milkdown 默认行为会导致编辑保存后换行丢失。原因有二：① Parse 侧：preset-commonmark 的 `remark-preserve-empty-line` 插件会删除 mdast 中所有 `<br />` html 节点（不区分是否位于表格单元格），若自定义转换插件在其后运行则单元格内 `<br />` 已被清空；② Serialize 侧：Milkdown 序列化器会把单元格内容包成 `paragraph` 节点（`tableCell > paragraph > break`），导致 break 节点的直接父级是 `paragraph` 而非 `tableCell`。修复：① Parse 侧：自定义 remark 插件必须**置顶注册**（排在所有内置转换器之前），先把单元格内 `<br />` 转成 `break` 节点，preserve 插件随后只清理段落级 `<br />`；② Serialize 侧：自定义 break handler 通过 `state.stack.includes("tableCell")` 检查祖先链（不仅看直接父级），单元格内输出 `<br />`，其他位置沿用默认 handler（行尾 `\` 换行）。Ctrl+Enter 在单元格内插入 hardbreak 节点（绕过 GFM 表格 keymap 的退出表格行为），序列化时同样走此 handler。

## 6. 测试

`node server/scripts/test-notes-api.js`（需后端运行于 :3000）：覆盖登录、文件夹/文档创建、内容更新、附件上传、重命名及附件 noteId 重映射、列表/下载、zip 导出/导入、软删除→回收站→还原、彻底删除、清空等 19 项断言。
