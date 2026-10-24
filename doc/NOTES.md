# QuickLink — 笔记管理模块

> 模块文档之一。总览见 [BUILD.md](./BUILD.md)，其余模块：[链接管理](./LINKS.md) / [用户信息管理](./USER.md) / [接口管理](./API.md)。

## 1. 功能概览

文件夹树（真实文件目录树存储，展开即显示目录下**全部**文件与子文件夹，文件名含扩展名，非 Markdown 文件单击交系统默认程序打开；左面板可收起/展开并记忆、宽度可拖拽调整，拖拽自定义排序/跨文件夹移动）、标题+内容搜索、键盘方向键导航、右键菜单/「+」按钮新建、Markdown 双模式编辑（所见即所得 / 源码+预览分栏，编辑模式停止输入 1.5 秒自动保存）、大纲侧边栏（预览模式自动提取标题层级，点击跳转）、笔记内搜索与替换（Ctrl+F）、右键复制文件路径（打开于资源管理器 / Typora 仅非服务模式可用，见 §3）、回收站、附件管理、zip 导入/导出。

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/notes/` | `noteController.ts`（文件树/排序/导入导出）、`attachmentController.ts`（附件+系统打开）、`routes.ts` |
| 前端 | `client/src/modules/notes/` | `NotesPage.tsx`（树/工具栏/回收站）、`NoteViewer.tsx`（双模式编辑/笔记内搜索替换/大纲）、`MilkdownEditor.tsx`（所见即所得，懒加载）、`AttachmentManager.tsx`（附件管理弹窗）；`client/src/styles/markdown.css`（预览样式+搜索高亮+深色模式） |

## 2. 存储设计

### 2.1 文件树

笔记**不入库**，以真实文件目录树存储于 `user_data/note/<userId>/`：文件夹=目录（`type: "folder"`），Markdown 文档=`.md`（UTF-8，`type: "note"`），其余任意文件原样纳管（`type: "file"`，二进制安全，不读正文），回收站=根下隐藏目录 `.trash/`。列表遍历收录目录下的**全部**条目（不限于本应用创建的），用户可直接把文件拷进目录交由应用管理。

- 笔记 ID = 相对 `<userId>` 根的路径（POSIX 分隔符，如 `工作/周报.md`），前端拼 URL 统一 `encodeURIComponent`。
- `title` = 完整条目名，**含扩展名**（`周报.md` / `年度报告.pdf`）；重命名时新名未带扩展名则沿用原扩展名（`年报` → `年报.pdf`）。
- `content` 仅 `.md` 读取与写入；`type: "file"` 从不按 utf8 读取，内容更新对其无效，保证二进制不被破坏。
- `createdAt/updatedAt` 取自文件系统 birthtime/mtime。
- 服务端对路径参数做越权校验（禁止 `..` 逃逸用户根）。

### 2.2 note_orders（同级自定义排序）

文件系统本身无序，同级自定义顺序存 `note_orders.db`：

```json
{ "_id": "auto", "userId": "ref", "parentId": "父目录相对路径, 根级为 \"\"",
  "order": "[同级排序键数组, 按显示顺序; 排序键=完整条目名, 唯 .md 去掉后缀 (兼容既有记录)]" }
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
| 新建 | 仅支持文件夹与 `.md` 文档（非 md 文件由用户放入目录后纳管）；文件名安全化（Windows 非法字符 `\/:*?"<>|` → `_`，去首尾点/空格），同级重名自动追加 ` (n)`（保留扩展名，如 `报告 (2).pdf`） |
| 重命名 | 磁盘改名（新名缺扩展名时补回原扩展名）；附件 `noteId` 与排序记录按前缀重映射（含全部后代路径） |
| 内容更新 | 仅 `.md` 写入正文；`type: "file"` 忽略 `content` 字段，磁盘文件不被触碰 |
| 移动/排序 | 同级仅改 `note_orders` 不动磁盘；跨级磁盘移动+附件 `noteId`/排序记录重映射，禁止移入自身后代 |
| 软删除 | 整目录/文件移入 `.trash/<原相对路径>`（含全部后代） |
| 还原 | 移回原父级；原父级不存在则挂回根级；同步重映射附件 `noteId` |
| 彻底删除/清空回收站/数据清空 | `fs.rmSync` 并同步删除关联附件磁盘文件 |

## 3. API

> `:id` 为笔记相对路径，前端统一 `encodeURIComponent`（服务端 Express 解码一次后原样使用，避免二次解码破坏含 `%` 标题）。
>
> **服务模式下无效**：标记为「服务模式下无效」的接口需要在用户桌面弹出 GUI 窗口，而 Windows 服务运行在 session 0，`spawn` 出的 `explorer.exe` / `Typora.exe` / `cmd /c start` 不会出现在用户桌面上（接口仍保留，调用无效果）。前端据 `GET /api/health` 的 `capabilities.launchNativeGui` 隐藏对应入口，开发态 `npm run dev` 下该能力为 `true`，入口照常显示。详见 [BUILD.md §9.5](./BUILD.md)。

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| GET | /api/notes | 全部条目（文件夹/`.md` 文档/其他文件，含回收站项，前端拆分） | Yes |
| POST | /api/notes | 新建 `{type: folder\|note, title?, parentId?}`（仅这两种类型；`title` 的 `.md` 后缀会被规范化） | Yes |
| PUT | /api/notes/:id | 更新标题/内容（内容仅 `.md` 生效；标题缺扩展名时沿用原扩展名） | Yes |
| DELETE | /api/notes/:id | 软删除进回收站（含后代） | Yes |
| POST | /api/notes/:id/restore | 还原 | Yes |
| POST | /api/notes/:id/move | 拖拽排序/跨文件夹移动 `{parentId: 目标父级\|null, index: 插入位置}`；同级仅改顺序记录不动磁盘，跨级磁盘移动+附件 noteId/排序记录重映射，禁止移入自身后代 | Yes |
| DELETE | /api/notes/:id/permanent | 彻底删除（含后代及附件文件） | Yes |
| GET | /api/notes/:id/file-path | 返回笔记文件绝对路径（服务模式下同样有效，是「复制文件路径」的数据来源） | Yes |
| POST | /api/notes/:id/open-folder | 在系统文件管理器中打开笔记所在文件夹（跨平台：Win `explorer.exe`；macOS `open`；Linux `xdg-open`；文件节点打开其父目录，文件夹节点打开自身；**服务模式下无效**） | Yes |
| POST | /api/notes/:id/open-file | 用系统默认程序打开笔记目录下的文件（跨平台：Win `cmd /c start`；macOS `open`；Linux `xdg-open`；文件夹返回 400「文件夹请用「打开于资源管理器」」；前端单击非 md 文件节点或右键菜单触发；**服务模式下无效**） | Yes |
| POST | /api/notes/:id/open-in-typora | 用 Typora 打开笔记文件（跨平台查找 Typora 路径；文件夹与非 `.md` 文件不可用 Typora 打开（400）；未安装时返回错误提示；**服务模式下无效**） | Yes |
| DELETE | /api/notes/trash | 清空回收站 | Yes |
| POST | /api/notes/wipe | 数据清空（全部笔记+附件+排序记录） | Yes |
| GET | /api/notes/export | 导出 zip | Yes |
| POST | /api/notes/import | 导入 zip（raw body） | Yes |
| GET | /api/notes/attachments | 附件列表 | Yes |
| POST | /api/notes/attachments | 上传 `?noteId=&name=`（raw body 拷贝存储） | Yes |
| GET | /api/notes/attachments/:id/download | 下载 | Yes |
| POST | /api/notes/attachments/:id/open-folder | 在文件管理器中打开所在文件夹并选中（跨平台：Win `explorer /select`；macOS `open -R`；Linux `xdg-open` 目录；**服务模式下无效**） | Yes |
| POST | /api/notes/attachments/:id/open-file | 用系统默认程序打开附件文件（跨平台：Win `cmd /c start`；macOS `open`；Linux `xdg-open`；客户端 Ctrl+点击行触发；**服务模式下无效**） | Yes |
| DELETE | /api/notes/attachments/:id | 删除（记录+磁盘文件） | Yes |

### 笔记 zip 格式

```
quicklink-notes-YYYY-MM-DD.zip
├── manifest.json            # app/version(=3)/notes 树/attachments 元数据 (导入唯一权威源)
├── notes/**                 # 与存储结构一致的副本: .md 为可读文本, 其他文件按原始字节存放
└── attachments/<storedName> # 附件文件本体
```

导入按 manifest 父级优先重建（旧路径→新路径映射，重名自动去重），`type: "file"` 条目的内容只存在于 `notes/<id>` zip 条目中（条目缺失则跳过该项），附件重新写入 `attachment/` 并关联新笔记；缺 manifest.json 的 zip 拒绝导入。`version` 3 起 manifest 的 `title` 为含扩展名的完整文件名（v2 包的 note title 不含 `.md`，导入时统一去后缀再补 `.md`，向后兼容）。

## 4. 前端交互

- **布局**：顶部工具栏（数据清空/导出/导入/附件管理）；左面板顶部为 收起/展开按钮 + 笔记/回收站切换（Segmented），其下为搜索框+收起全部按钮+「+」第一级新建下拉、文件夹树；右侧预览/编辑区。
- **左面板收起/展开**：面板顶部折叠按钮（MenuFold/MenuUnfold 图标，与主侧栏一致）可将面板从当前宽度收起到 48px（仅留按钮），树/搜索/切换控件全部隐藏，编辑区获得更大空间；状态存 `localStorage[ql-note-panel-collapsed]`，刷新后保持。
- **左面板宽度可调**：面板右边缘为拖拽手柄（`col-resize` 光标，面板收起时隐藏），按住拖动在 300–680px 之间调整；300 是支持拖拽之前的固定宽度（下限），400 为默认值。拖动期间关闭宽度过渡以保证跟手、并锁定整页文本选择，松手后宽度存 `localStorage[ql-note-panel-width]`，刷新后保持。
- **拖拽排序/移动**：文件夹树开启 `draggable`（搜索过滤时禁用避免索引错位）；同级拖动调整顺序（仅更新 `note_orders` 不动磁盘），拖到文件夹上/内部则跨文件夹移动（重名自动追加序号，附件 noteId 与排序记录同步重映射，选中/高亮/展开状态按新路径前缀替换）；禁止拖入自身后代，拖入目标文件夹自动展开。
- **文件夹树展开状态**：默认全部收起（点击文件夹节点或 `→`/`←` 展开收起）；仅在文件夹内新建、拖拽入目标文件夹、附件「打开所属笔记」时自动展开相关祖先，搜索时临时展开全部；搜索框右侧的「收起全部」按钮（NodeCollapse 图标，无展开节点时禁用）可一键回到全收起，对搜索触发的临时全展开同样有效。
- **搜索**：按标题或正文内容过滤（不区分大小写、输入即过滤），保留命中项祖先链；搜索期间展开全部文件夹保证命中项可见，清空搜索恢复全收起。
- **新建**：「+」下拉与右键空白处均可在第一级目录新建文档/文件夹（支持任意多个根级目录）；右键文件夹节点提供新建文档/新建子层文件夹/新建子层文件，右键笔记或非 md 文件节点提供新建同级文档（在该节点的父级目录下创建），所有节点均提供重命名/移动到/复制文件路径/删除，「打开于 Typora」（仅 `.md` 笔记节点）、「用系统默认程序打开」（仅非 md 文件节点）与「打开于资源管理器」仅在服务端能力 `launchNativeGui` 为真时出现（服务模式隐藏，见 §3 说明）。「复制文件路径」调用 `getFilePath` API 获取笔记文件绝对路径并写入剪贴板（服务模式下依然可用，是定位文件的替代手段）；「打开于资源管理器」调用 `openFolder` API 在系统文件管理器中打开笔记所在目录（跨平台：Win `explorer.exe`、macOS `open`、Linux `xdg-open`，文件节点打开其父目录，文件夹节点打开自身）。「打开于 Typora」调用 `openInTypora` API 用 Typora 打开笔记 `.md` 文件（仅笔记节点显示，未安装 Typora 时点击后服务端返回错误提示；服务端跨平台查找 Typora 路径：Win 先检查 Program Files/LOCALAPPDATA 再查询注册表卸载项 `InstallLocation`、macOS 检查 `/Applications`/`mdfind`、Linux 使用 `which`）。
- **非 Markdown 文件节点**：树中文件名一律显示完整扩展名（含 `.md`），三种节点以图标区分（文件夹 FolderOpen/Folder、`.md` 文档 FileMarkdown、其他文件 FileOutlined）。`type: "file"` 节点不进入预览区：单击文件名即调用 `openFile` API 用系统默认程序打开（`launchNativeGui` 为假时只提示「当前为服务模式, 无法在桌面打开文件」不发请求），选中时右侧显示提示文案「「<文件名>」不是 Markdown 文档, 单击文件名用系统默认程序打开」；回收站列表同样按三类图标区分。文档标题输入框显示带后缀的文件名，重命名时可省略后缀（服务端沿用原扩展名）。
- **键盘导航**：↑/↓ 在可见节点间移动选中（文件夹仅高亮不打开预览）；← 收起已展开文件夹或跳回父级；→ 展开文件夹或进入首个子节点；输入框聚焦/弹窗打开时不生效；CachedPages 架构下仅笔记页可见时响应（隐藏页面的键盘监听器自动跳过，见 [BUILD.md §8.4](./BUILD.md)）。
- **重命名**：antd Modal + Input 弹窗（历史原因：早期 Electron 壳不实现 `window.prompt`；服务版沿用）。
- **移动到**：右键菜单「移动到」打开目标文件夹选择弹窗（树形选择器，排除自身及其后代），选择后调用 move API 完成跨文件夹移动（重名自动追加序号，附件 noteId 与排序记录同步重映射）。
- **编辑模式**：「编辑」后可用 Segmented 切换两种模式（选择记入 `localStorage`）：① 所见即所得（Milkdown Crepe, 类 Typora；顶部 16 键快捷工具栏经编辑器命令作用于光标/选区，另有选中浮层格式工具栏 + `/` 斜杠块菜单 + 表格/代码块原生编辑）；② 源码+预览（左 Markdown 源码右实时预览 + 快捷工具栏）。保存/完成编辑/Ctrl+S 落盘；编辑模式下停止输入 1.5 秒后自动保存（`draft` 变化触发防抖定时器，脏状态时落盘）；页面切换至不可见时若有未保存编辑亦自动保存（`isActive` 变为 `false` 且 `dirty` 时触发）；标题输入框可直接重命名（失焦或回车保存）。
- **大纲侧边栏**：仅非编辑模式（预览状态）下生效，工具栏显示大纲按钮（UnorderedList 图标），点击切换显示/隐藏（状态存 `localStorage ql-note-outline-open`，默认显示）；大纲从 Markdown 标题（H1~H6）自动提取，按层级缩进展示，点击条目滚动预览区到对应标题（`scrollIntoView smooth`）；标题 ID 由 slug 生成（去标签+小写+中文兼容+重复序号），与渲染器使用相同逻辑保证跳转准确；代码围栏内的标题不参与提取。
- **编辑工具栏**：两种编辑模式各有一套 16 键工具栏（H1~H3/加粗/斜体/删除线/无序与有序列表/任务清单/引用/行内代码/代码块/链接/图片/表格/分割线）。源码模式基于光标选区文本插入或行前缀切换；所见即所得模式通过 Milkdown 命令（`toggleStrong`/`wrapInHeading`/`insertTable` 等，由 `MilkdownEditor` 经 `forwardRef` 暴露的 `run(cmd)` 执行，标题/引用/任务清单支持再次点击取消）。
- **链接/图片弹窗**：两种编辑模式的链接/图片按钮均不走命令/文本包裹，而是弹出同一个 antd 弹窗——链接填链接名称（必填）+链接地址，图片填图片描述+图片地址（必填）+图片宽度/图片高度（选填，单位像素，留空按原图比例显示）。图片尺寸编码进 Markdown title（`ql-size:WxH` 后缀，见 5 设计决策），两种模式与只读预览共用同一约定。所见即所得模式：光标在已有链接/图片上时回填原值（含尺寸），确认后原位替换（链接整段替换避免双链接；块级图片保持块级节点原位更新）；插入后光标移出链接文本之外，图片显式关闭标记继承，避免后续内容被嵌套进链接；编辑器内链接样式与预览一致（主题蓝，需高特异性选择器压过 Crepe 主题），图片尺寸由 ProseMirror 插件注入 DOM 样式（文档更新与图片加载后按 src 配对应用）。源码模式：确认后在光标处插入 `[名称](地址)` / `![描述](地址 "ql-size:WxH")` 并替换选区；选区为完整链接/图片语法时回填名称+地址+尺寸（整段编辑替换），普通选中文本回填为名称/描述。
- **Milkdown 集成**：`MilkdownEditor.tsx` 封装 Crepe 实例（挂载后保持实例不销毁，切换笔记时通过 `parser` 全量替换文档内容，`listener.markdownUpdated` 回传 markdown）；因体积较大用 `React.lazy` 懒加载（仅进入所见即所得时下载）；CachedPages 架构下编辑器随页面保持挂载，切换模块后回来即时可用无需重建。
- **回收站**：还原/彻底删除/清空；还原时原父级不存在挂回根级。
- **附件**：原始字节流上传拷贝存 `attachment/`；支持下载/删除/编辑模式插入 Markdown 链接；附件管理弹窗统一查看。
- **笔记内搜索与替换**：`Ctrl+F` 打开搜索栏（Escape 关闭，CachedPages 架构下仅笔记页可见时响应），在笔记正文中高亮匹配词（不区分大小写）；搜索栏显示当前命中序号/总命中数、上下翻页按钮；源码编辑模式下额外显示替换输入框+替换/全部替换按钮（替换直接修改 draft，保存时落盘）；预览模式下搜索栏固定在预览区顶部；高亮样式为黄底圆角标记（当前命中橙色，深色模式对应深黄/深橙色），CSS 类 `mark.ql-search-hl` / `mark.ql-search-hl-current`；切换笔记时自动关闭搜索。
- **预览区链接打开**：预览模式下点击 Markdown 正文中的链接，经 `handlePreviewLinkClick` 拦截冒泡后用 `window.open(href, "_blank", "noopener,noreferrer")` 在新标签页打开；锚点链接（`#` 开头）和 `javascript:` 协议不拦截。所见即所得编辑器（Milkdown Crepe）内的链接点击同样经容器 `onClick` 拦截，走相同逻辑。（原先桌面版走 Electron `window.quicklink.openExternal` 调系统默认浏览器，该分支已随桌面壳移除。）
- **附件管理弹窗**：每行四键（下载/打开所在文件夹/打开所属笔记/删除），其中「打开所在文件夹」仅在 `launchNativeGui` 为真时渲染（服务模式隐藏，见 §3 说明）；「所属笔记」列同时识别上传笔记（`noteId`）与正文链接引用的笔记，多个时顿号连接。「打开所属笔记」关闭弹窗后在文件夹树中高亮全部归属笔记（黄底描边，手动选择节点后清除），自动展开祖先并打开第一个笔记；`Ctrl + 左键`点击行直接用系统默认程序打开附件文件（服务端 `POST /attachments/:id/open-file`，服务模式下无效）。

## 5. 设计决策

- **笔记文件树存储与附件拷贝**：文件树使笔记可脱离应用直接访问/编辑/备份；软删除移入隐藏 `.trash` 防误操作不可逆；附件拷贝存储（uuid 文件名）保证数据自包含；路径型 ID 省去映射层，重命名/还原前缀重映射附件 noteId；zip 内 .md 副本可脱离应用阅读，导入以 manifest 为唯一权威。上传/导入用 `express.raw` 接收原始字节流（不引入 multipart 库）。
- **目录全量纳管与二进制安全（2026-10）**：用户希望展开文件夹即看到目录下**全部**文件（含后缀），故列表遍历不再过滤非 `.md` 条目，`Note.type` 扩展出 `"file"`。这类节点全程按二进制对待：不读 `content`（按 utf8 解码 PDF/图片会得到乱码且回写即损坏文件）、内容更新对其无效、zip 导出导入按原始字节走 `notes/<id>` 条目；应用内只提供打开/移动/重命名/删除，「打开」交系统默认程序（`open-file`），新建仍只支持文件夹与 `.md`（其他文件由用户放入目录后自动纳管）。显示名改为含扩展名后，`note_orders` 排序键取「`.md` 去后缀、其余用完整名」（`orderKey`），既有排序记录无需迁移；重命名允许省略后缀并自动补回，避免误改扩展名丢失文件类型。
- **重命名弹窗替代 window.prompt**：早期 Electron 壳不实现 `window.prompt`（调用直接无效），故改用 antd Modal + Input，顺带获得校验/回车提交/自动聚焦；桌面壳移除后沿用，浏览器环境下行为一致。
- **服务端能力探测而非编译期开关（2026-10）**：「打开于 Typora」「打开于资源管理器」「用系统默认程序打开文件」「打开附件」都要在用户桌面弹 GUI，Windows 服务版跑在 session 0 做不到（见 [BUILD.md §9.5](./BUILD.md)）。选择让服务端在 `/api/health` 里上报 `capabilities.launchNativeGui`（值取 `!env.SERVICE_MODE`）、前端 `capabilityStore` 启动时探测一次，而不是删掉这些接口或做编译期分支：同一份前端产物既要能配服务版也要能配开发态/Docker，且 API 保留后开发态仍然可用。默认值取 `false`——探测返回前不渲染可能无效的入口，避免菜单先出现再消失。「复制文件路径」不参与门控，它在服务模式下依然有效，正是用户的替代手段。
- **图片尺寸存储约定**：标准 Markdown 无图片宽高语法，而 Milkdown Crepe 块级图片节点仅有 {src, caption, ratio} 属性（alt 会被丢弃为 ratio、组件不支持像素尺寸），因此尺寸编码进图片 title（`ql-size:WxH` 后缀，单位像素，宽高均可省略其一，如 `ql-size:640x` / `ql-size:x180`）：① 所见即所得：inline 图片存 title、块级图片存 caption（↔ title），由 `MilkdownEditor` 的 ProseMirror 插件解析并在 DOM 上注入 `style.width/height`（每次文档更新与图片 load 事件后按 src 配对应用，覆盖 Crepe 组件按自然尺寸重置的行为；inline 图片的 title 悬停提示同时剥除尺寸代码）；② 源码+预览与只读预览：`NoteViewer` 的 marked 自定义渲染器解析 title 输出 `<img width/height>`，尺寸代码不进入 title 属性；③ 往返稳定：该编码经 remark 序列化后原样保留，不影响标准 Markdown 兼容性。块级图片弹出 Crepe 自带的说明编辑框时会显示尺寸代码（接受的折衷）。
- **大纲侧边栏**：预览模式下用户常需快速定位长文档中的章节；从 Markdown 标题自动提取大纲（H1~H6 按层级缩进），点击跳转（标题 ID 由 slug 生成，与渲染器共用逻辑保证一致）；代码围栏内的标题排除；开关状态持久化（默认显示），不影响编辑模式（编辑时隐藏）。
- **笔记内搜索 DOM 高亮方案**：预览模式搜索使用 `document.createTreeWalker` 遍历文本节点，按匹配词拆分并用 `<mark class="ql-search-hl">` 包裹（当前命中追加 `ql-search-hl-current`），替换时直接操作 DOM 父节点；编辑模式搜索基于字符串匹配（`draft` 状态），替换直接修改 draft 字符串。两种模式共用搜索栏 UI 与快捷键，切换笔记时自动清除高亮并重置状态。
- **Typora 外部编辑集成**：用户可能希望用专业 Markdown 编辑器（Typora）打开笔记 `.md` 文件进行编辑；服务端 `findTypora()` 跨平台探测 Typora 可执行路径（Win: 常见安装目录 + 注册表卸载项 `InstallLocation` + `where`；macOS: `/Applications` + `mdfind`；Linux: `which`），右键菜单对笔记节点始终显示「打开于 Typora」，未安装时点击后服务端返回错误提示「未检测到 Typora, 请先安装 Typora」；Windows 注册表查询支持自定义安装路径（遍历 HKLM/HKCU 卸载项搜索 Typora 的 `InstallLocation`）。
- **自动保存**：编辑模式下 `draft` 变化触发 1.5 秒防抖定时器，脏状态（`draft !== note.content`）时自动落盘，避免用户忘记保存丢失内容；切换笔记或退出编辑时清除定时器。页面从可见变为不可见时（CachedPages 架构下切换到其他模块），若存在未保存编辑则立即触发自动保存，防止用户切换后丢失内容。与 Ctrl+S 手动保存、完成编辑保存共存，三种方式均调用同一 `saveContent` 逻辑。
- **表格宽度 100%**：Markdown 预览表格样式 `width: 100%`（早期 `auto` 导致窄内容表格不撑满容器，改为全宽后视觉更稳定）。
- **表格单元格内换行（`<br />`）双向转换**：GFM 表格单元格内换行的标准 Markdown 语法是 `<br />`，但 Milkdown 默认行为会导致编辑保存后换行丢失。原因有二：① Parse 侧：preset-commonmark 的 `remark-preserve-empty-line` 插件会删除 mdast 中所有 `<br />` html 节点（不区分是否位于表格单元格），若自定义转换插件在其后运行则单元格内 `<br />` 已被清空；② Serialize 侧：Milkdown 序列化器会把单元格内容包成 `paragraph` 节点（`tableCell > paragraph > break`），导致 break 节点的直接父级是 `paragraph` 而非 `tableCell`。修复：① Parse 侧：自定义 remark 插件必须**置顶注册**（排在所有内置转换器之前），先把单元格内 `<br />` 转成 `break` 节点，preserve 插件随后只清理段落级 `<br />`；② Serialize 侧：自定义 break handler 通过 `state.stack.includes("tableCell")` 检查祖先链（不仅看直接父级），单元格内输出 `<br />`，其他位置沿用默认 handler（行尾 `\` 换行）。Ctrl+Enter 在单元格内插入 hardbreak 节点（绕过 GFM 表格 keymap 的退出表格行为），序列化时同样走此 handler。

## 6. 测试

`node server/scripts/test-notes-api.js`（默认打后端 :3000，可用环境变量 `API_BASE` 覆盖；脚本开头与结尾各 wipe 一次笔记数据，勿指向生产实例）：覆盖登录、文件夹/文档创建、内容更新、附件上传、重命名及附件 noteId 重映射、列表/下载、zip 导出/导入、软删除→回收站→还原、彻底删除、清空，以及非 Markdown 文件纳管（`type: "file"` 不带正文、内容更新不破坏原始字节、重命名沿用原扩展名、`open-file` 拒绝文件夹与不存在项、Typora 拒绝非 md）等 28 项断言。
