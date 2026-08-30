import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx, prosePluginsCtx, remarkPluginsCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/preset-commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { liftTarget } from "@milkdown/prose/transform";
import { Plugin, PluginKey, TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { composeImageTitle, parseImageTitle, type ImageSize } from "./imageSize";
import { defaultHandlers } from "mdast-util-to-markdown";
import type { Handle } from "mdast-util-to-markdown";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

// 工具栏可执行的命令 (与 NoteViewer 的按钮一一对应)
export type WysiwygCommand =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "strike"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "inlineCode"
  | "codeBlock"
  | "table"
  | "divider";

export interface MilkdownEditorHandle {
  run: (cmd: WysiwygCommand) => void;
  // 链接/图片由外部弹窗收集参数后插入 (光标在已有链接/图片上时为编辑替换; size 为图片尺寸, 编码进 title)
  insertLink: (text: string, href: string) => void;
  insertImage: (alt: string, src: string, size?: ImageSize) => void;
  // 光标处已有链接/图片时返回其属性, 供弹窗回填 (无则返回 null)
  getLinkAtCursor: () => { text: string; href: string } | null;
  getImageAtCursor: () => { alt: string; src: string; size: ImageSize } | null;
}

// 把 title 中的尺寸编码 (ql-size:WxH, 见 imageSize.ts) 应用到编辑器内的图片元素
// Crepe 的图片组件本身不支持像素尺寸, 因此在 ProseMirror 层做 DOM 样式注入:
// 每次文档更新与图片加载完成后, 按文档顺序配对 img 与图片节点并应用 width/height
const qlImageSizePluginKey = new PluginKey("ql-image-size");

function applyImageSizes(view: EditorView): void {
  const imgs = [...view.dom.querySelectorAll<HTMLImageElement>("img")];
  if (!imgs.length) return;
  const metas: { src: string; size: ImageSize; rest: string; isInline: boolean }[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === "image") {
      const p = parseImageTitle(node.attrs.title);
      metas.push({ src: node.attrs.src || "", size: p.size, rest: p.rest, isInline: true });
    } else if (node.type.name === "image-block") {
      const p = parseImageTitle(node.attrs.caption);
      metas.push({ src: node.attrs.src || "", size: p.size, rest: p.rest, isInline: false });
    }
  });
  let cursor = 0;
  for (const meta of metas) {
    if (cursor >= imgs.length) break;
    // 按 src 匹配避免错位 (空 src 占位等不渲染 img 的节点会被自然跳过); 无匹配时按顺序取下一个
    let target = -1;
    for (let i = cursor; i < imgs.length; i++) {
      if (!meta.src || imgs[i].getAttribute("src") === meta.src) {
        target = i;
        break;
      }
    }
    const img = target !== -1 ? imgs[target] : imgs[cursor];
    if (target !== -1) cursor = target + 1;
    if (meta.size.width) img.style.width = `${meta.size.width}px`;
    if (meta.size.height) img.style.height = `${meta.size.height}px`;
    // 内联图片: 去掉悬停提示 (title 属性) 中的尺寸代码
    if (meta.isInline) img.title = meta.rest;
  }
}

const qlImageSizePlugin = new Plugin({
  key: qlImageSizePluginKey,
  view: (view) => {
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyImageSizes(view));
    };
    // Crepe 图片组件在 onLoad 时按自然尺寸重置样式, 需在其后重新应用
    const onLoad = (e: Event) => {
      if ((e.target as HTMLElement | null)?.tagName === "IMG") run();
    };
    run();
    view.dom.addEventListener("load", onLoad, true);
    const bootTimer = window.setTimeout(run, 100); // 节点视图异步挂载后的兜底
    return {
      update: run,
      destroy: () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(bootTimer);
        view.dom.removeEventListener("load", onLoad, true);
      },
    };
  },
});

// ---- 表格单元格内换行 (Ctrl+Enter → 单元格内换行, markdown 代码表示为 <br />) ----
// Milkdown GFM 默认把 Enter/Ctrl+Enter 都绑定为退出表格, 且 mdast 序列化会把单元格内
// 的 break 节点降级成空格, 导致单元格内换行丢失。这里通过三个部件补齐:
// 1) 按键插件: Ctrl+Enter 在单元格内直接插入 hardbreak 节点 (DOM 渲染为 <br> 元素);
//    本插件注册在合并 keymap 插件之前, 优先于 GFM 的 ExitTable 快捷键。
// 2) remark 解析插件: 单元格内的 <br /> html 节点解析为 break (对应编辑器内的 hardbreak
//    节点)。注意 Milkdown 的解析器会运行 remark 转换器, 但序列化器只运行 compiler
//    (remark.stringify) 不运行转换器, 因此序列化方向不能依赖转换器。
//    该插件必须排在所有内置转换器之前注册: preset-commonmark 的
//    remark-preserve-empty-line 会删除 mdast 中所有 <br /> html 节点 (不区分是否位于表格单元格),
//    若本插件在其后运行, 单元格内的 <br /> 已被清空, 换行在保存后丢失。
// 3) 序列化 handler: 通过 remarkStringifyOptionsCtx 覆盖 break 节点的输出, 单元格内输出
//    <br /> (Github 风格表格单元格内换行的标准语法), 其他位置沿用 mdast 默认 handler。
const BR_TAG_RE = /^<br\s*\/?>\s*$/i;

interface MdastNode {
  type?: string;
  value?: string;
  children?: MdastNode[];
}

// 递归遍历 mdast, 把 tableCell 内的 <br /> html 节点转换为 break (单元格内容为行内节点, 无需继续下钻)
function qlTransformCellBr(node: MdastNode | undefined): void {
  if (!node) return;
  if (node.type === "tableCell" && Array.isArray(node.children)) {
    node.children = node.children.flatMap((child) =>
      child?.type === "html" && typeof child.value === "string" && BR_TAG_RE.test(child.value)
        ? [{ type: "break" }]
        : [child]
    );
    return;
  }
  node.children?.forEach(qlTransformCellBr);
}

// remark 解析插件 (仅解析方向运行; 序列化方向由 qlBreakStringifyHandler 负责)
const qlTableBrRemarkPlugin = {
  plugin: () => (tree: MdastNode) => qlTransformCellBr(tree),
  options: {},
};

// mdast 序列化时 break 节点的输出 handler:
// 单元格内输出 <br />; 其他位置沿用 mdast-util-to-markdown 默认 handler (输出 \"\\\n\" 或按上下文降级)。
// 判断是否在单元格内不能只看直接父级: Milkdown 序列化器会把单元格内容包成
// paragraph 节点 (tableCell > paragraph > break), 因此还需检查 state.stack 构造栈。
const qlBreakStringifyHandler: Handle = (node, parent, state, info) => {
  const inCell = parent?.type === "tableCell" || state.stack.includes("tableCell");
  return inCell ? "<br />" : defaultHandlers.break(node, parent, state, info);
};

const qlTableBreakPluginKey = new PluginKey("ql-table-break");

const qlTableBreakPlugin = new Plugin({
  key: qlTableBreakPluginKey,
  props: {
    handleKeyDown: (view, event) => {
      // 仅在 Ctrl+Enter (macOS 为 Cmd+Enter) 且光标位于表格单元格内时拦截
      if ((!event.ctrlKey && !event.metaKey) || event.key !== "Enter") return false;
      const { state } = view;
      const { selection } = state;
      if (!(selection instanceof TextSelection)) return false;
      const { $from } = selection;
      let inCell = false;
      for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name;
        if (name === "table_cell" || name === "table_header") {
          inCell = true;
          break;
        }
        if (name === "table") break;
      }
      if (!inCell) return false;
      const hardbreak = state.schema.nodes.hardbreak;
      if (!hardbreak) return false;
      event.preventDefault();
      // 直接插入 hardbreak (不设置 meta), 绕过 GFM 表格 keymap 的退出表格行为与
      // hardbreakFilterPlugin 对表格内 hardbreak 的过滤 (该过滤只拦截 insertHardbreakCommand)
      view.dispatch(state.tr.replaceSelectionWith(hardbreak.create()).scrollIntoView());
      return true;
    },
  },
});

interface Props {
  defaultValue: string;
  onChange: (markdown: string) => void;
}

// 类 Typora 的所见即所得 Markdown 编辑器 (基于 Milkdown Crepe)
// 负责挂载/卸载实例; 内容变化通过 listener 回传 markdown;
// 通过 ref.run(cmd) 响应外部工具栏的格式命令
const MilkdownEditor = forwardRef<MilkdownEditorHandle, Props>(({ defaultValue, onChange }, ref) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    run: (cmd) => {
      const crepe = crepeRef.current;
      if (!crepe) return;
      try {
        crepe.editor.action((ctx) => {
          const commands = ctx.get(commandsCtx);
          const view = ctx.get(editorViewCtx);
          switch (cmd) {
            case "h1":
            case "h2":
            case "h3": {
              // 已是同级标题则降级为正文, 否则转为对应标题
              const level = cmd === "h1" ? 1 : cmd === "h2" ? 2 : 3;
              const node = view.state.selection.$from.parent;
              if (node.type.name === "heading" && node.attrs.level === level) {
                commands.call(turnIntoTextCommand.key);
              } else {
                commands.call(wrapInHeadingCommand.key, level);
              }
              break;
            }
            case "bold":
              commands.call(toggleStrongCommand.key);
              break;
            case "italic":
              commands.call(toggleEmphasisCommand.key);
              break;
            case "strike":
              commands.call(toggleStrikethroughCommand.key);
              break;
            case "bulletList":
              commands.call(wrapInBulletListCommand.key);
              break;
            case "orderedList":
              commands.call(wrapInOrderedListCommand.key);
              break;
            case "taskList": {
              // gfm 未提供任务清单切换命令: 已是任务项则提升出列表, 否则包成任务清单
              const { state, dispatch } = view;
              const range = state.selection.$from.blockRange();
              const listItem = state.schema.nodes.list_item;
              let inTask = false;
              if (range) {
                for (let d = range.depth; d >= 0; d--) {
                  const n = range.$from.node(d);
                  if (n.type === listItem) {
                    inTask = range.$from.node(d + 1).attrs.listType === "task";
                    break;
                  }
                }
              }
              if (inTask && range) {
                const t = liftTarget(range);
                if (t != null) dispatch(state.tr.lift(range, t));
              } else {
                commands.call(wrapInBulletListCommand.key);
                const r2 = view.state.selection.$from.blockRange();
                if (r2) {
                  view.dispatch(
                    view.state.tr.setNodeMarkup(r2.start, undefined, {
                      ...view.state.doc.nodeAt(r2.start)?.attrs,
                      listType: "task",
                    }),
                  );
                }
              }
              break;
            }
            case "quote": {
              // 已在引用块内则移出, 否则包入引用 (以最近可提升层级为准)
              const { state, dispatch } = view;
              const range = state.selection.$from.blockRange();
              const bq = state.schema.nodes.blockquote;
              let inQuote = false;
              if (range) {
                for (let d = range.depth; d > 0; d--) {
                  if (range.$from.node(d).type === bq) {
                    inQuote = true;
                    break;
                  }
                }
              }
              if (inQuote && range) {
                const t = liftTarget(range);
                if (t != null) dispatch(state.tr.lift(range, t));
              } else {
                commands.call(wrapInBlockquoteCommand.key);
              }
              break;
            }
            case "inlineCode":
              commands.call(toggleInlineCodeCommand.key);
              break;
            case "codeBlock":
              commands.call(createCodeBlockCommand.key);
              break;
            case "table":
              commands.call(insertTableCommand.key, { row: 3, col: 2 });
              break;
            case "divider":
              commands.call(insertHrCommand.key);
              break;
          }
          view.focus();
        });
      } catch (err) {
        console.error("[milkdown] command failed:", cmd, err);
      }
    },

    getLinkAtCursor: () => {
      const crepe = crepeRef.current;
      if (!crepe) return null;
      let found: { text: string; href: string } | null = null;
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const linkType = state.schema.marks.link;
          const { $from } = state.selection;
          const parent = $from.parent;
          if (!parent.isTextblock) return;
          parent.nodesBetween(0, parent.content.size, (n, pos) => {
            if (found || !n.isText) return;
            const mark = n.marks.find((m) => m.type === linkType);
            if (!mark) return;
            const offset = $from.parentOffset;
            if (offset >= pos && offset <= pos + n.nodeSize) {
              found = { text: n.text || "", href: (mark.attrs.href as string) || "" };
            }
          });
        });
      } catch (err) {
        console.error("[milkdown] getLinkAtCursor failed:", err);
      }
      return found;
    },

    getImageAtCursor: () => {
      const crepe = crepeRef.current;
      if (!crepe) return null;
      let found: { alt: string; src: string; size: ImageSize } | null = null;
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const sel: any = state.selection;
          const node = sel.node || sel.$from?.nodeAfter;
          if (node?.type?.name === "image") {
            const p = parseImageTitle(node.attrs.title);
            found = { alt: node.attrs.alt || "", src: node.attrs.src || "", size: p.size };
          } else if (node?.type?.name === "image-block") {
            // 块级图片: 说明与尺寸共同编码在 caption (对应 markdown title)
            const p = parseImageTitle(node.attrs.caption);
            found = { alt: p.rest, src: node.attrs.src || "", size: p.size };
          }
        });
      } catch (err) {
        console.error("[milkdown] getImageAtCursor failed:", err);
      }
      return found;
    },

    insertLink: (text, href) => {
      const crepe = crepeRef.current;
      if (!crepe) return;
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const linkType = state.schema.marks.link;
          const node = state.schema.text(text, [linkType.create({ href })]);
          const { $from } = state.selection;
          const parent = $from.parent;
          let from = -1;
          let to = -1;
          // 光标在已有链接文本上: 整段替换, 避免新旧文本拼接成双链接
          if (parent.isTextblock) {
            parent.nodesBetween(0, parent.content.size, (n, pos) => {
              if (from !== -1 || !n.isText) return;
              const mark = n.marks.find((m) => m.type === linkType);
              if (!mark) return;
              const offset = $from.parentOffset;
              if (offset >= pos && offset <= pos + n.nodeSize) {
                from = $from.start() + pos;
                to = from + n.nodeSize;
              }
            });
          }
          const tr =
            from !== -1
              ? state.tr.replaceRangeWith(from, to, node)
              : state.tr.replaceSelectionWith(node, false);
          // 光标移到链接文本之后, 避免后续输入/插入仍继承 link 标记 (如图片被嵌入进链接)
          const insertAt = from !== -1 ? from : state.selection.from;
          view.dispatch(tr.setSelection(TextSelection.create(tr.doc, insertAt + node.nodeSize)));
          view.focus();
        });
      } catch (err) {
        console.error("[milkdown] insertLink failed:", err);
      }
    },

    insertImage: (alt, src, size) => {
      const crepe = crepeRef.current;
      if (!crepe) return;
      try {
        crepe.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const sel: any = state.selection;
          const selNode = sel.node || sel.$from?.nodeAfter;
          if (selNode?.type?.name === "image-block") {
            // 光标选中块级图片: 保持块级节点, 原位更新 src 与说明 (说明+尺寸编码进 caption)
            const caption = composeImageTitle(alt, size) || "";
            view.dispatch(
              state.tr.setNodeMarkup(sel.from, undefined, { ...selNode.attrs, src, caption }),
            );
          } else {
            const title = composeImageTitle(null, size);
            const node = state.schema.nodes.image.create({ src, alt, title: title ?? "" });
            // 显式不带标记插入 (replaceSelectionWith 第二参关闭标记继承):
            // 光标紧跟在链接后时否则会继承 link 标记, 导致图片被嵌套进链接; 选区在已有图片上时则为原位替换
            view.dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
          }
          view.focus();
        });
      } catch (err) {
        console.error("[milkdown] insertImage failed:", err);
      }
    },
  }));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const crepe = new Crepe({
      root,
      defaultValue,
    });
    // 注册自定义插件 (在编辑器视图创建前注入 prose/remark 插件)
    crepe.editor.config((ctx) => {
      ctx.update(prosePluginsCtx, (prev) => [...prev, qlImageSizePlugin, qlTableBreakPlugin]);
      // 必须置顶注册: 若追加在末尾, 会排在 preset-commonmark 的 remark-preserve-empty-line 之后,
      // 单元格内 <br /> 已被该插件删除而无法转换为 break, 保存后单元格换行丢失。
      // 本转换只改写 tableCell 内的 <br /> 节点, 不影响其余内置转换器的输入。
      ctx.update(remarkPluginsCtx, (prev) => [qlTableBrRemarkPlugin, ...prev]);
      // 序列化阶段: 单元格内 break 输出 <br /> (remark 转换器不参与序列化, 必须走 stringify handler)
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        handlers: { ...prev.handlers, break: qlBreakStringifyHandler },
      }));
    });
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });

    crepeRef.current = crepe;
    crepe.create().catch((err) => console.error("[milkdown] create failed", err));

    return () => {
      crepeRef.current = null;
      crepe.destroy().catch(() => {});
    };
    // 仅挂载一次: 切换笔记/模式时由父组件通过 key 重新挂载
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} className="ql-milkdown-root" />;
});

export default MilkdownEditor;
