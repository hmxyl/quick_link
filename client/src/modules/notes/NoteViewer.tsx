import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  InputNumber,
  Space,
  Tooltip,
  Typography,
  Upload,
  message,
  Popconfirm,
  Tag,
  Segmented,
  theme,
  Modal,
  Form,
} from "antd";
import {
  EditOutlined,
  EyeOutlined,
  SaveOutlined,
  PaperClipOutlined,
  DownloadOutlined,
  DeleteOutlined,
  LinkOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { marked, Renderer, type Tokens } from "marked";
import type { Attachment, Note } from "../../types";
import { noteApi, attachmentApi } from "../../services/api";
import type { MilkdownEditorHandle } from "./MilkdownEditor";
import { composeImageTitle, parseImageTitle, type ImageSize } from "./imageSize";
import "../../styles/markdown.css";

// 所见即所得编辑器体积较大, 懒加载 (仅在进入编辑模式时下载)
const MilkdownEditor = React.lazy(() => import("./MilkdownEditor"));

const { Text } = Typography;

type EditMode = "wysiwyg" | "split";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---- marked 渲染器 (与 marked 内置一致的转义/地址清洗, 参考其默认实现) ----
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanUrl(href: string): string | null {
  try {
    return encodeURI(href).replace(/%25/g, "%");
  } catch {
    return null;
  }
}

// 图片渲染: 解析 title 中的尺寸编码 (ql-size:WxH, 见 imageSize.ts) 输出 width/height 属性
const mdRenderer = new Renderer();
mdRenderer.image = ({ href, title, text }: Tokens.Image): string => {
  const cleaned = cleanUrl(href);
  if (cleaned === null) return escapeHtml(text);
  const { rest, size } = parseImageTitle(title);
  let out = `<img src="${cleaned}" alt="${escapeHtml(text)}"`;
  if (size.width) out += ` width="${size.width}"`;
  if (size.height) out += ` height="${size.height}"`;
  if (rest) out += ` title="${escapeHtml(rest)}"`;
  return `${out}>`;
};

// 标题渲染: 为每个标题生成唯一 ID (供大纲跳转)
const headingIdCounts = new Map<string, number>();
mdRenderer.heading = ({ text, depth }: Tokens.Heading): string => {
  // 去除 HTML 标签后生成 slug
  const raw = text.replace(/<[^>]*>/g, "").trim();
  let slug = raw.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "heading";
  const count = headingIdCounts.get(slug) || 0;
  headingIdCounts.set(slug, count + 1);
  const id = count > 0 ? `${slug}-${count}` : slug;
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};

// 大纲条目
interface OutlineItem {
  id: string;
  text: string;
  level: number;
}

// 从 markdown 文本提取大纲 (与渲染器使用相同的 slug 生成逻辑)
function extractOutline(markdown: string): OutlineItem[] {
  headingIdCounts.clear();
  const items: OutlineItem[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  for (const line of lines) {
    if (/^ {0,3}(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const raw = m[2].replace(/[*_`~\[\]]/g, "").trim();
    let slug = raw.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "heading";
    const count = headingIdCounts.get(slug) || 0;
    headingIdCounts.set(slug, count + 1);
    const id = count > 0 ? `${slug}-${count}` : slug;
    items.push({ id, text: raw, level });
  }
  return items;
}

// 用系统默认浏览器打开链接 (桌面版走 Electron shell.openExternal, 网页版走 window.open)
const openLinkInBrowser = (href: string) => {
  if (!href || /^#/i.test(href) || href.startsWith("javascript:")) return;
  if (window.quicklink?.openExternal) {
    window.quicklink.openExternal(href);
  } else {
    window.open(href, "_blank", "noopener,noreferrer");
  }
};

// 预览区链接点击拦截: 冒泡到容器统一用系统浏览器打开
const handlePreviewLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
  const target = (e.target as HTMLElement).closest?.("a");
  if (!target) return;
  const href = target.getAttribute("href");
  if (href) {
    e.preventDefault();
    openLinkInBrowser(href);
  }
};

interface Props {
  note: Note;
  attachments: Attachment[];
  onNoteChanged: () => void;
  onAttachmentsChanged: () => void;
}

const NoteViewer: React.FC<Props> = ({ note, attachments, onNoteChanged, onAttachmentsChanged }) => {
  const { token } = theme.useToken();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content || "");
  const [title, setTitle] = useState(note.title);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<any>(null);
  const mdRef = useRef<MilkdownEditorHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // 大纲侧边栏显示状态 (仅预览模式生效)
  const [outlineOpen, setOutlineOpen] = useState(
    () => localStorage.getItem("ql-note-outline-open") !== "0"
  );
  const toggleOutline = () => {
    const next = !outlineOpen;
    setOutlineOpen(next);
    localStorage.setItem("ql-note-outline-open", next ? "1" : "0");
  };

  // 编辑模式: wysiwyg=所见即所得 (类 Typora), split=左侧源码+右侧预览
  const [editMode, setEditMode] = useState<EditMode>(
    () => (localStorage.getItem("ql-note-edit-mode") as EditMode) || "wysiwyg",
  );
  // 外部插入内容 (如附件链接) 时递增, 强制所见即所得编辑器重载以应用新 draft
  const [wysiKey, setWysiKey] = useState(0);

  // 链接/图片插入弹窗 (两种编辑模式共用; 光标/选区在已有链接/图片上时为编辑回填)
  const [mediaModal, setMediaModal] = useState<{ kind: "link" | "image"; mode: EditMode } | null>(null);
  const [mediaForm] = Form.useForm();

  const openMediaModal = (kind: "link" | "image") => {
    const mode = editMode;
    if (mode === "wysiwyg") {
      const handle = mdRef.current;
      if (kind === "link") {
        const existing = handle?.getLinkAtCursor() || null;
        mediaForm.setFieldsValue({
          text: existing?.text || "",
          href: existing?.href || "https://",
          width: null,
          height: null,
        });
      } else {
        const existing = handle?.getImageAtCursor() || null;
        mediaForm.setFieldsValue({
          alt: existing?.alt || "",
          src: existing?.src || "https://",
          width: existing?.size?.width ?? null,
          height: existing?.size?.height ?? null,
        });
      }
    } else {
      // 源码模式: 选区是完整链接/图片语法时回填名称+地址, 普通选中文本作为名称/描述回填
      const el = getEl();
      const sel = el ? el.value.slice(el.selectionStart, el.selectionEnd) : "";
      const linkMatch = sel.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
      const imgMatch = sel.match(/^!\[([^\]]*)\]\(([^)]*?)(?:\s+"([^"]*)")?\)$/);
      if (kind === "link" && linkMatch) {
        mediaForm.setFieldsValue({ text: linkMatch[1], href: linkMatch[2], width: null, height: null });
      } else if (kind === "image" && imgMatch) {
        // 完整图片语法回填: 描述+地址+尺寸 (尺寸编码在 title 中)
        const sizeInfo = imgMatch[3] ? parseImageTitle(imgMatch[3]) : { rest: "", size: {} as ImageSize };
        mediaForm.setFieldsValue({
          alt: imgMatch[1],
          src: imgMatch[2],
          width: sizeInfo.size.width ?? null,
          height: sizeInfo.size.height ?? null,
        });
      } else if (kind === "link") {
        mediaForm.setFieldsValue({ text: sel, href: "https://", width: null, height: null });
      } else {
        mediaForm.setFieldsValue({ alt: sel, src: "https://", width: null, height: null });
      }
    }
    // 延后打开: 避免与按钮点击引发的编辑器选区变更在同一渲染周期内 setState 报警
    setTimeout(() => setMediaModal({ kind, mode }), 0);
  };

  const handleMediaOk = async () => {
    if (!mediaModal) return;
    try {
      const values = await mediaForm.validateFields();
      // 图片尺寸 (像素, 留空表示按原图比例显示); 尺寸编码进 title (见 imageSize.ts)
      const size: ImageSize = {};
      if (mediaModal.kind === "image") {
        const w = Math.round(Number(values.width));
        const h = Math.round(Number(values.height));
        if (Number.isFinite(w) && w > 0) size.width = w;
        if (Number.isFinite(h) && h > 0) size.height = h;
      }
      const alt = (values.alt || "").trim();
      if (mediaModal.mode === "wysiwyg") {
        const handle = mdRef.current;
        if (mediaModal.kind === "link") {
          handle?.insertLink(values.text.trim(), values.href.trim());
        } else {
          handle?.insertImage(alt, values.src.trim(), size);
        }
      } else {
        // 源码模式: 在光标处插入语法并替换选区 (回填编辑时即整段替换)
        const title = mediaModal.kind === "image" ? composeImageTitle(null, size) : null;
        const snippet =
          mediaModal.kind === "link"
            ? `[${values.text.trim()}](${values.href.trim()})`
            : title
              ? `![${alt}](${values.src.trim()} "${title}")`
              : `![${alt}](${values.src.trim()})`;
        applyEdit((value, s, e) => {
          const text = value.slice(0, s) + snippet + value.slice(e);
          const pos = s + snippet.length;
          return { text, selStart: pos, selEnd: pos };
        });
      }
      setMediaModal(null);
    } catch {
      /* 表单校验未通过 */
    }
  };

  const switchMode = (mode: EditMode) => {
    setEditMode(mode);
    localStorage.setItem("ql-note-edit-mode", mode);
  };

  const getEl = (): HTMLTextAreaElement | null =>
    textareaRef.current?.resizableTextArea?.textArea || null;

  // 切换笔记时重置状态
  useEffect(() => {
    setEditing(false);
    setDraft(note.content || "");
    setTitle(note.title);
  }, [note._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTitle(note.title);
    if (!editing) setDraft(note.content || "");
  }, [note.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => {
    headingIdCounts.clear();
    const src = editing ? draft : note.content || "";
    return marked.parse(src || "", { async: false, renderer: mdRenderer }) as string;
  }, [editing, draft, note.content]);

  // 大纲数据: 仅在非编辑模式下计算
  const outline = useMemo(() => {
    if (editing) return [];
    return extractOutline(note.content || "");
  }, [editing, note.content]);

  // 点击大纲项: 滚动预览区到对应标题
  const scrollToHeading = useCallback((id: string) => {
    const container = previewRef.current;
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const dirty = editing && draft !== (note.content || "");

  const saveContent = async (exitEdit = false) => {
    setSaving(true);
    try {
      await noteApi.update(note._id, { content: draft });
      message.success("已保存");
      if (exitEdit) setEditing(false);
      onNoteChanged();
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveContent();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const saveTitle = async () => {
    const t = title.trim();
    if (!t || t === note.title) return;
    try {
      await noteApi.update(note._id, { title: t });
      onNoteChanged();
    } catch {
      message.error("重命名失败");
    }
  };

  const noteAttachments = attachments.filter((a) => a.noteId === note._id);

  const uploadProps = {
    showUploadList: false,
    multiple: true,
    beforeUpload: async (file: File) => {
      try {
        await attachmentApi.upload(note._id, file);
        message.success(`已上传 ${file.name}`);
        onAttachmentsChanged();
      } catch {
        message.error(`上传 ${file.name} 失败`);
      }
      return false;
    },
  };

  // 编辑模式下把附件链接插入正文 (追加到末尾)
  const insertLink = (a: Attachment) => {
    if (!editing) return;
    const link = `[${a.originalName}](/api/notes/attachments/${a._id}/download)`;
    const next = draft ? `${draft}\n${link}\n` : `${link}\n`;
    setDraft(next);
    // 所见即所得编辑器为一次性挂载, 需重载才能反映外部插入的内容
    if (editMode === "wysiwyg") setWysiKey((k) => k + 1);
  };

  // ---- Markdown 工具栏 ----

  const applyEdit = (transform: (value: string, start: number, end: number) => { text: string; selStart: number; selEnd: number }) => {
    const el = getEl();
    const start = el ? el.selectionStart : draft.length;
    const end = el ? el.selectionEnd : draft.length;
    const { text, selStart, selEnd } = transform(draft, start, end);
    setDraft(text);
    requestAnimationFrame(() => {
      const node = getEl();
      if (node) {
        node.focus();
        node.setSelectionRange(selStart, selEnd);
      }
    });
  };

  // 选中内容前后包裹符号 (加粗/斜体/行内代码等)
  const wrapSelection = (before: string, after: string, placeholder: string) =>
    applyEdit((value, s, e) => {
      const sel = value.slice(s, e) || placeholder;
      const text = value.slice(0, s) + before + sel + after + value.slice(e);
      return { text, selStart: s + before.length, selEnd: s + before.length + sel.length };
    });

  // 选中行统一加/去前缀 (标题/列表/引用, 已有前缀时取消)
  const prefixLines = (prefix: string) =>
    applyEdit((value, s, e) => {
      const ls = value.lastIndexOf("\n", s - 1) + 1;
      let le = value.indexOf("\n", e);
      if (le === -1) le = value.length;
      const lines = value.slice(ls, le).split("\n");
      const allPrefixed = lines.every((l) => l.startsWith(prefix));
      const next = lines.map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l)).join("\n");
      const text = value.slice(0, ls) + next + value.slice(le);
      return { text, selStart: ls, selEnd: ls + next.length };
    });

  // 光标处插入整块内容 (表格/分割线等)
  const insertBlock = (snippet: string) =>
    applyEdit((value, s) => {
      const pad = s > 0 && !value.slice(0, s).endsWith("\n") ? "\n" : "";
      const text = value.slice(0, s) + pad + snippet + value.slice(s);
      const pos = s + pad.length + snippet.length;
      return { text, selStart: pos, selEnd: pos };
    });

  // Ctrl+Enter 在表格行内插入单元格换行语法 <br /> (非表格行时保持默认行为)
  const handleMdKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const el = getEl();
      const start = el ? el.selectionStart : draft.length;
      // 光标所在行以 | 开头时视为表格行 (GFM 表格最多 3 个前导空格, 更多则视为缩进代码块)
      const lineStart = draft.lastIndexOf("\n", start - 1) + 1;
      if (!/^ {0,3}\|/.test(draft.slice(lineStart, start))) return;
      // 排除代码围栏内的伪表格行 (仅未闭合的 ```/~~~ 围栏内会误判)
      let inFence = false;
      for (let i = 0; i < lineStart; ) {
        const j = draft.indexOf("\n", i);
        const line = draft.slice(i, j === -1 ? lineStart : j);
        if (/^ {0,3}(```|~~~)/.test(line)) inFence = !inFence;
        if (j === -1) break;
        i = j + 1;
      }
      if (inFence) return;
      // 表格分隔行 (|---|) 上不插入, 否则会破坏表格结构
      const lineEnd = draft.indexOf("\n", start);
      const fullLine = draft.slice(lineStart, lineEnd === -1 ? draft.length : lineEnd);
      if (/^ {0,3}\|[\s:|-]+\|\s*$/.test(fullLine)) return;
      e.preventDefault();
      applyEdit((value, s, e2) => {
        const snippet = "<br />";
        const text = value.slice(0, s) + snippet + value.slice(e2);
        const pos = s + snippet.length;
        return { text, selStart: pos, selEnd: pos };
      });
    }
  };

  const mdToolbar: { tip: string; label: React.ReactNode; onClick?: () => void; kind?: "link" | "image" }[] = [
    { tip: "一级标题", label: "H1", onClick: () => prefixLines("# ") },
    { tip: "二级标题", label: "H2", onClick: () => prefixLines("## ") },
    { tip: "三级标题", label: "H3", onClick: () => prefixLines("### ") },
    { tip: "加粗", label: <strong>B</strong>, onClick: () => wrapSelection("**", "**", "粗体文本") },
    { tip: "斜体", label: <em>I</em>, onClick: () => wrapSelection("*", "*", "斜体文本") },
    { tip: "删除线", label: <s>S</s>, onClick: () => wrapSelection("~~", "~~", "文本") },
    { tip: "无序列表", label: "• 列表", onClick: () => prefixLines("- ") },
    { tip: "有序列表", label: "1. 列表", onClick: () => prefixLines("1. ") },
    { tip: "任务清单", label: "☑ 任务", onClick: () => prefixLines("- [ ] ") },
    { tip: "引用", label: "❝ 引用", onClick: () => prefixLines("> ") },
    { tip: "行内代码", label: "`代码`", onClick: () => wrapSelection("`", "`", "code") },
    { tip: "代码块", label: "代码块", onClick: () => wrapSelection("```\n", "\n```", "代码") },
    { tip: "链接", label: "🔗 链接", kind: "link" },
    { tip: "图片", label: "🖼 图片", kind: "image" },
    { tip: "表格", label: "⊞ 表格", onClick: () => insertBlock("| 列1 | 列2 |\n| --- | --- |\n|  |  |\n") },
    { tip: "分割线", label: "— 分割", onClick: () => insertBlock("\n---\n") },
  ];

  // 所见即所得工具栏: 与源码模式按钮对应, 通过编辑器命令作用于光标/选区; 链接/图片弹窗输入参数后再插入
  const wysiwygToolbar: { tip: string; label: React.ReactNode; cmd?: Parameters<MilkdownEditorHandle["run"]>[0]; kind?: "link" | "image" }[] = [
    { tip: "一级标题", label: "H1", cmd: "h1" },
    { tip: "二级标题", label: "H2", cmd: "h2" },
    { tip: "三级标题", label: "H3", cmd: "h3" },
    { tip: "加粗", label: <strong>B</strong>, cmd: "bold" },
    { tip: "斜体", label: <em>I</em>, cmd: "italic" },
    { tip: "删除线", label: <s>S</s>, cmd: "strike" },
    { tip: "无序列表", label: "• 列表", cmd: "bulletList" },
    { tip: "有序列表", label: "1. 列表", cmd: "orderedList" },
    { tip: "任务清单", label: "☑ 任务", cmd: "taskList" },
    { tip: "引用", label: "❝ 引用", cmd: "quote" },
    { tip: "行内代码", label: "`代码`", cmd: "inlineCode" },
    { tip: "代码块", label: "代码块", cmd: "codeBlock" },
    { tip: "链接", label: "🔗 链接", kind: "link" },
    { tip: "图片", label: "🖼 图片", kind: "image" },
    { tip: "表格", label: "⊞ 表格", cmd: "table" },
    { tip: "分割线", label: "— 分割", cmd: "divider" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 工具栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
          style={{ maxWidth: 320, fontWeight: 600 }}
        />
        <Space style={{ marginLeft: "auto" }}>
          {editing ? (
            <>
              <Button icon={<SaveOutlined />} loading={saving} onClick={() => saveContent(false)} disabled={!dirty}>
                保存
              </Button>
              <Button
                type="primary"
                icon={<EyeOutlined />}
                onClick={() => (dirty ? saveContent(true) : setEditing(false))}
              >
                完成编辑
              </Button>
            </>
          ) : (
            <>
              <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                编辑
              </Button>
              {outline.length > 0 && (
                <Tooltip title={outlineOpen ? "隐藏大纲" : "显示大纲"}>
                  <Button
                    icon={<UnorderedListOutlined />}
                    onClick={toggleOutline}
                    type={outlineOpen ? "default" : "text"}
                  />
                </Tooltip>
              )}
            </>
          )}
        </Space>
      </div>

      {/* 编辑模式切换 (仅编辑时显示): 所见即所得 / 源码+预览 */}
      {editing && (
        <div style={{ marginBottom: 8 }}>
          <Segmented
            size="small"
            value={editMode}
            onChange={(v) => switchMode(v as EditMode)}
            options={[
              { label: "所见即所得", value: "wysiwyg" },
              { label: "源码 + 预览", value: "split" },
            ]}
          />
        </div>
      )}

      {/* 正文区: 所见即所得为单一编辑器; 源码分栏为左编辑右预览; 预览模式为纯预览 */}
      <div style={{ flex: 1, display: "flex", gap: 8, minHeight: 0 }}>
        {editing && editMode === "wysiwyg" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* 所见即所得工具栏 */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 2,
                marginBottom: 6,
                padding: "4px 6px",
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 6,
                background: token.colorFillQuaternary,
              }}
            >
              {wysiwygToolbar.map((b) => (
                <Tooltip key={b.tip} title={b.tip} mouseEnterDelay={0.4}>
                  <Button
                    size="small"
                    type="text"
                    style={{ fontSize: 12, padding: "0 6px" }}
                    onClick={() => (b.kind ? openMediaModal(b.kind) : b.cmd && mdRef.current?.run(b.cmd))}
                  >
                    {b.label}
                  </Button>
                </Tooltip>
              ))}
            </div>
            <Suspense
              fallback={
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Text type="secondary">编辑器加载中…</Text>
                </div>
              }
            >
              <MilkdownEditor ref={mdRef} key={`${note._id}-${wysiKey}`} defaultValue={draft} onChange={setDraft} />
            </Suspense>
          </div>
        ) : (
          <>
            {editing && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                {/* Markdown 工具栏 */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 2,
                    marginBottom: 6,
                    padding: "4px 6px",
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 6,
                    background: token.colorFillQuaternary,
                  }}
                >
                  {mdToolbar.map((b) => (
                    <Tooltip key={b.tip} title={b.tip} mouseEnterDelay={0.4}>
                      <Button
                        size="small"
                        type="text"
                        style={{ fontSize: 12, padding: "0 6px" }}
                        onClick={() => (b.kind ? openMediaModal(b.kind) : b.onClick && b.onClick())}
                      >
                        {b.label}
                      </Button>
                    </Tooltip>
                  ))}
                </div>
                <Input.TextArea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleMdKeyDown}
                  placeholder="在此输入 Markdown 内容…"
                  style={{ flex: 1, fontFamily: "Consolas, Menlo, monospace", fontSize: 14, resize: "none" }}
                />
              </div>
            )}
            <div
              style={{
                flex: 1,
                display: "flex",
                gap: 0,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 6,
                background: token.colorBgContainer,
                overflow: "hidden",
              }}
            >
              {/* 大纲侧边栏: 仅非编辑模式且有标题时显示 */}
              {!editing && outlineOpen && outline.length > 0 && (
                <div
                  style={{
                    width: 200,
                    flexShrink: 0,
                    borderRight: `1px solid ${token.colorBorderSecondary}`,
                    overflow: "auto",
                    padding: "12px 0",
                    background: token.colorFillQuaternary,
                  }}
                >
                  <div style={{ padding: "0 12px 8px", fontWeight: 600, fontSize: 12, color: token.colorTextSecondary }}>
                    大纲
                  </div>
                  {outline.map((item, idx) => (
                    <div
                      key={`${item.id}-${idx}`}
                      onClick={() => scrollToHeading(item.id)}
                      style={{
                        padding: "4px 12px",
                        paddingLeft: 12 + (item.level - 1) * 12,
                        fontSize: 12,
                        lineHeight: "22px",
                        cursor: "pointer",
                        color: item.level <= 2 ? token.colorText : token.colorTextSecondary,
                        fontWeight: item.level <= 2 ? 500 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        borderRadius: 4,
                        margin: "0 4px",
                      }}
                      title={item.text}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = token.colorFillContent;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }}
                    >
                      {item.text}
                    </div>
                  ))}
                </div>
              )}
              {/* 预览内容 */}
              <div
                ref={previewRef}
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 16,
                  minWidth: 0,
                }}
              >
                {editing || (note.content || "") ? (
                  <div className="ql-markdown" dangerouslySetInnerHTML={{ __html: html }} onClick={handlePreviewLinkClick} />
                ) : (
                  <Text type="secondary">暂无内容, 点击「编辑」开始书写</Text>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 附件区 */}
      <div style={{ marginTop: 8, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 8 }}>
        <Space wrap>
          <Text strong>
            <PaperClipOutlined /> 附件 ({noteAttachments.length})
          </Text>
          <Upload {...uploadProps}>
            <Button size="small" icon={<PaperClipOutlined />}>
              添加附件
            </Button>
          </Upload>
          {noteAttachments.map((a) => (
            <Tag key={a._id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px" }}>
              <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.originalName}
              </span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatSize(a.size)}
              </Text>
              {editing && (
                <Tooltip title="插入到正文">
                  <LinkOutlined style={{ cursor: "pointer", color: "#1677ff" }} onClick={() => insertLink(a)} />
                </Tooltip>
              )}
              <Tooltip title="下载">
                <DownloadOutlined
                  style={{ cursor: "pointer", color: "#1677ff" }}
                  onClick={() => attachmentApi.download(a._id, a.originalName)}
                />
              </Tooltip>
              <Popconfirm
                title="删除该附件?"
                onConfirm={async () => {
                  await attachmentApi.remove(a._id);
                  message.success("附件已删除");
                  onAttachmentsChanged();
                }}
              >
                <DeleteOutlined style={{ cursor: "pointer", color: "#ff4d4f" }} />
              </Popconfirm>
            </Tag>
          ))}
        </Space>
      </div>

      {/* 链接/图片插入弹窗 (两种编辑模式的工具栏均可触发) */}
      <Modal
        title={mediaModal?.kind === "link" ? "插入链接" : "插入图片"}
        open={!!mediaModal}
        onOk={handleMediaOk}
        onCancel={() => setMediaModal(null)}
        okText="插入"
        cancelText="取消"
        destroyOnClose
        width={420}
      >
        <Form form={mediaForm} layout="vertical" style={{ marginTop: 12 }}>
          {mediaModal?.kind === "link" ? (
            <>
              <Form.Item name="text" label="链接名称" rules={[{ required: true, message: "请输入链接名称" }]}>
                <Input placeholder="显示的文字" autoFocus />
              </Form.Item>
              <Form.Item name="href" label="链接地址" rules={[{ required: true, message: "请输入链接地址" }]}>
                <Input placeholder="https://example.com" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item name="alt" label="图片描述">
                <Input placeholder="图片的替代文字" autoFocus />
              </Form.Item>
              <Form.Item name="src" label="图片地址" rules={[{ required: true, message: "请输入图片地址" }]}>
                <Input placeholder="https://example.com/image.png" />
              </Form.Item>
              <Form.Item
                name="width"
                label="图片宽度"
                style={{ display: "inline-block", width: "50%", paddingRight: 8 }}
              >
                <InputNumber min={1} max={9999} precision={0} placeholder="自动" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="height" label="图片高度" style={{ display: "inline-block", width: "50%" }}>
                <InputNumber min={1} max={9999} precision={0} placeholder="自动" style={{ width: "100%" }} />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: -8 }}>
                尺寸单位为像素, 宽度/高度留空时按原图比例显示
              </Text>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default NoteViewer;
