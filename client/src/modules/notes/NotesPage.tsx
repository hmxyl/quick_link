import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  Empty,
  Input,
  List,
  Menu,
  Modal,
  Popconfirm,
  Segmented,
  Spin,
  Tooltip,
  Tree,
  message,
  theme,
} from "antd";
import type { TreeDataNode } from "antd";
import {
  FileMarkdownOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileAddOutlined,
  FolderAddOutlined,
  PlusOutlined,
  DeleteOutlined,
  ClearOutlined,
  ExportOutlined,
  ImportOutlined,
  PaperClipOutlined,
  RestOutlined,
  UndoOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SendOutlined,
} from "@ant-design/icons";
import type { Attachment, Note } from "../../types";
import { noteApi, attachmentApi, downloadBlob } from "../../services/api";
import NoteViewer from "./NoteViewer";
import AttachmentManager from "./AttachmentManager";

const { Search } = Input;

// 左侧文件夹面板收起状态的持久化键
const PANEL_COLLAPSED_KEY = "ql-note-panel-collapsed";

interface CtxMenuState {
  x: number;
  y: number;
  node: Note | null; // null = 空白处
}

const NotesPage: React.FC = () => {
  const { token } = theme.useToken();
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"library" | "trash">("library");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [attachManagerOpen, setAttachManagerOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Note | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // 移动弹窗状态
  const [moveTarget, setMoveTarget] = useState<Note | null>(null);
  const [moveDestId, setMoveDestId] = useState<string | null>(null);
  // 附件「打开所属笔记」时树中需高亮的笔记 id 列表
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  // 左侧面板收起/展开, 初始值读取上次保存的状态
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem(PANEL_COLLAPSED_KEY) === "1"
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<any>(null);

  const active = useMemo(() => notes.filter((n) => !n.deletedAt), [notes]);
  const trash = useMemo(
    () => notes.filter((n) => n.deletedAt).sort((a, b) => (a.deletedAt! < b.deletedAt! ? 1 : -1)),
    [notes]
  );
  const selectedNode = active.find((n) => n._id === selectedId) || null;
  // 仅文档打开右侧预览; 文件夹选中只高亮
  const selectedNote = selectedNode && selectedNode.type === "note" ? selectedNode : null;

  const loadNotes = async () => {
    const res = await noteApi.list();
    setNotes(res.data || []);
  };

  const loadAttachments = async () => {
    const res = await attachmentApi.list();
    setAttachments(res.data || []);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadNotes(), loadAttachments()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // 默认展开所有文件夹
  useEffect(() => {
    setExpandedKeys(active.filter((n) => n.type === "folder").map((n) => n._id));
  }, [notes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 搜索时展开全部文件夹, 保证命中项可见
  useEffect(() => {
    if (search.trim()) {
      setExpandedKeys(active.filter((n) => n.type === "folder").map((n) => n._id));
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点击其他位置关闭右键菜单 (用 mousedown 而非 contextmenu, 避免与 onRightClick 时序冲突)
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  // ---- 创建 / 删除 ----

  const createItem = async (type: "folder" | "note", parentId: string | null) => {
    try {
      const res = await noteApi.create({ type, parentId });
      await loadNotes();
      if (parentId) setExpandedKeys((prev) => Array.from(new Set([...prev, parentId])));
      if (type === "note" && res.data) {
        setSelectedId(res.data._id);
        setView("library");
      }
    } catch {
      message.error("创建失败");
    }
  };

  const softDelete = (node: Note) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定将「${node.title}」移入回收站？`,
      okText: "确定",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await noteApi.remove(node._id);
        message.success("已移入回收站");
        if (selectedId === node._id) setSelectedId(null);
        await loadNotes();
      },
    });
  };

  const rename = (node: Note) => {
    // 用 Modal 代替 window.prompt (Electron 不支持 prompt, 导致重命名无效)
    setRenameTarget(node);
    setRenameValue(node.title);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const value = renameValue.trim();
    if (!value || value === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    try {
      await noteApi.update(renameTarget._id, { title: value });
      message.success("重命名成功");
      // 重命名后选中项 id 变化, 同步选中
      if (selectedId === renameTarget._id) setSelectedId(null);
      await loadNotes();
    } catch {
      message.error("重命名失败");
    } finally {
      setRenameTarget(null);
    }
  };

  // ---- 移动到 ----
  const openMoveModal = (node: Note) => {
    setMoveTarget(node);
    setMoveDestId(node.parentId || null);
  };

  const confirmMove = async () => {
    if (!moveTarget) return;
    // 不能移动到自身或自身的后代
    if (moveDestId === moveTarget._id) {
      message.error("不能移动到自身");
      return;
    }
    if (moveTarget.type === "folder" && moveDestId) {
      // 检查目标是否是自身的后代
      let checkId: string | null = moveDestId;
      while (checkId) {
        if (checkId === moveTarget._id) {
          message.error("不能移动到自身的子文件夹中");
          return;
        }
        const parent = active.find((n) => n._id === checkId);
        checkId = parent?.parentId || null;
      }
    }
    try {
      // 获取目标文件夹下的笔记列表以确定插入位置
      const siblings = active.filter((n) => n.parentId === moveDestId);
      const index = siblings.length; // 插入到末尾
      await noteApi.move(moveTarget._id, { parentId: moveDestId, index });
      message.success("移动成功");
      setMoveTarget(null);
      await loadNotes();
    } catch {
      message.error("移动失败");
    }
  };

  // 构建移动目标选择树数据 (仅文件夹, 排除自身及其后代)
  const moveTreeData = useMemo<TreeDataNode[]>(() => {
    if (!moveTarget) return [];
    const excludeIds = new Set<string>();
    if (moveTarget.type === "folder") {
      // 收集自身及所有后代 id
      const collectDescendants = (id: string) => {
        excludeIds.add(id);
        active.filter((n) => n.parentId === id && n.type === "folder").forEach((n) => collectDescendants(n._id));
      };
      collectDescendants(moveTarget._id);
    } else {
      excludeIds.add(moveTarget._id);
    }

    const build = (parentId: string | null): TreeDataNode[] =>
      active
        .filter((n) => n.parentId === parentId && n.type === "folder" && !excludeIds.has(n._id))
        .map((n) => ({
          key: n._id,
          title: n.title,
          icon: <FolderOutlined />,
          children: build(n._id),
        }));

    return build(null);
  }, [active, moveTarget]);

  // ---- 右键菜单 ----

  const ctxItems = useMemo(() => {
    if (!ctxMenu) return [];
    const node = ctxMenu.node;
    const items: any[] = [];
    if (!node || node.type === "folder") {
      items.push({ key: "newNote", icon: <FileAddOutlined />, label: "新建文档" });
    }
    if (!node || node.type === "folder") {
      items.push({ key: "newFolder", icon: <FolderAddOutlined />, label: node ? "新建子层文件夹" : "新建文件夹" });
    }
    if (node?.type === "folder") {
      items.push({ key: "newSubFile", icon: <FileAddOutlined />, label: "新建子层文件" });
    }
    // 右键笔记节点时, 也允许新建同级文件
    if (node?.type === "note") {
      items.push({ key: "newSiblingFile", icon: <FileAddOutlined />, label: "新建同级文件" });
    }
    if (node) {
      items.push({ type: "divider" });
      items.push({ key: "rename", icon: <FileMarkdownOutlined />, label: "重命名" });
      items.push({ key: "move", icon: <SendOutlined />, label: "移动到" });
      items.push({ key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true });
    }
    return items;
  }, [ctxMenu, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCtxMenuClick = useCallback(({ key }: { key: string }) => {
    if (!ctxMenu) return;
    const node = ctxMenu.node;
    setCtxMenu(null);
    switch (key) {
      case "newNote": createItem("note", node?._id || null); break;
      case "newFolder": createItem("folder", node?._id || null); break;
      case "newSubFile": createItem("note", node?._id || null); break;
      // 右键笔记时新建同级文件: 使用当前笔记的 parentId
      case "newSiblingFile": createItem("note", node?.parentId || null); break;
      case "rename": if (node) rename(node); break;
      case "move": if (node) openMoveModal(node); break;
      case "delete": if (node) softDelete(node); break;
    }
  }, [ctxMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 树构建 ----
  // 同级顺序以服务端返回为准 (自定义排序优先, 无自定义时文件夹在前+中文名)

  const kw = search.trim().toLowerCase();

  // 命中 = 标题或正文内容包含关键词 (不区分大小写)
  const matchKw = (n: Note) =>
    n.title.toLowerCase().includes(kw) || (n.content || "").toLowerCase().includes(kw);

  // 搜索时保留命中节点及其祖先 (null = 未搜索, 全部可见)
  const visibleIds = useMemo(() => {
    if (!kw) return null;
    const ids = new Set<string>();
    for (const n of active) {
      if (matchKw(n)) {
        ids.add(n._id);
        let cur: Note | undefined = n;
        while (cur?.parentId) {
          ids.add(cur.parentId);
          cur = active.find((x) => x._id === cur!.parentId);
        }
      }
    }
    return ids;
  }, [active, kw]); // eslint-disable-line react-hooks/exhaustive-deps

  const treeData = useMemo<TreeDataNode[]>(() => {
    const build = (parentId: string | null): TreeDataNode[] =>
      active
        .filter((n) => n.parentId === parentId)
        .filter((n) => !visibleIds || visibleIds.has(n._id))
        .map((n) => ({
          key: n._id,
          title: (
            <span
              style={
                highlightIds.includes(n._id)
                  ? { background: "#fffbe6", outline: "1px solid #ffe58f", borderRadius: 3, padding: "0 2px" }
                  : undefined
              }
            >
              {n.title}
            </span>
          ),
          icon: ({ expanded }: { expanded?: boolean }) =>
            n.type === "folder" ? (
              expanded ? <FolderOpenOutlined /> : <FolderOutlined />
            ) : (
              <FileMarkdownOutlined />
            ),
          isLeaf: n.type === "note",
          children: n.type === "folder" ? build(n._id) : undefined,
        }));

    return build(null);
  }, [active, visibleIds, highlightIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 按渲染顺序扁平的可见节点 (供键盘上下左右导航)
  const visibleList = useMemo(() => {
    const out: Note[] = [];
    const walkFlat = (parentId: string | null) => {
      const children = active.filter((n) => n.parentId === parentId);
      for (const n of children) {
        if (visibleIds && !visibleIds.has(n._id)) continue;
        out.push(n);
        if (n.type === "folder" && expandedKeys.includes(n._id)) walkFlat(n._id);
      }
    };
    walkFlat(null);
    return out;
  }, [active, expandedKeys, visibleIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 键盘上下左右: 选中移动 / 文件夹收起展开 (输入框聚焦与弹窗打开时不生效)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== "library") return;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (ctxMenu || renameTarget) return;
      if (!visibleList.length) return;
      e.preventDefault();
      const idx = visibleList.findIndex((n) => n._id === selectedId);
      const cur = idx >= 0 ? visibleList[idx] : null;
      const moveTo = (n?: Note) => {
        if (!n) return;
        setSelectedId(n._id);
        (treeRef.current as any)?.scrollTo?.({ key: n._id });
      };
      if (e.key === "ArrowDown") return moveTo(idx >= 0 && idx < visibleList.length - 1 ? visibleList[idx + 1] : visibleList[0]);
      if (e.key === "ArrowUp") return moveTo(idx > 0 ? visibleList[idx - 1] : visibleList[visibleList.length - 1]);
      if (!cur) return moveTo(visibleList[0]);
      if (e.key === "ArrowRight") {
        if (cur.type === "folder" && !expandedKeys.includes(cur._id)) {
          setExpandedKeys((prev) => [...prev, cur._id]);
        } else if (cur.type === "folder") {
          moveTo(visibleList[idx + 1]); // 已展开时第一个子节点紧随其后
        }
      } else {
        // ArrowLeft: 已展开先收起, 否则跳到父级
        if (cur.type === "folder" && expandedKeys.includes(cur._id)) {
          setExpandedKeys((prev) => prev.filter((k) => k !== cur._id));
        } else if (cur.parentId) {
          moveTo(visibleList.find((n) => n._id === cur.parentId));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, visibleList, selectedId, expandedKeys, ctxMenu, renameTarget]);

  // ---- 附件跳转笔记 ----

  // 附件管理「打开所属笔记」: 树中高亮全部归属笔记, 自动打开第一个, 并展开其祖先保证可见
  const openAttachmentNotes = (ids: string[]) => {
    if (!ids.length) return;
    setView("library");
    setSelectedId(ids[0]);
    setHighlightIds(ids);
    setExpandedKeys((prev) => {
      const set = new Set<React.Key>(prev);
      for (const id of ids) {
        let cur: Note | undefined = active.find((n) => n._id === id);
        while (cur?.parentId) {
          set.add(cur.parentId);
          cur = active.find((x) => x._id === cur!.parentId);
        }
      }
      return Array.from(set);
    });
    setTimeout(() => (treeRef.current as any)?.scrollTo?.({ key: ids[0] }), 100);
  };

  // ---- 拖拽排序/移动 ----

  // 拖动节点调整同级顺序或拖入其它文件夹 (搜索过滤时禁用, 避免索引错位)
  const onTreeDrop = async (info: any) => {
    const dragKey = String(info.dragNode?.key || "");
    const dropKey = String(info.node?.key || "");
    if (!dragKey || !dropKey || dragKey === dropKey) return;
    if (dropKey.startsWith(dragKey + "/")) return; // 不能拖入自身后代 (含自身)
    const parentOf = (k: string) => (k.includes("/") ? k.slice(0, k.lastIndexOf("/")) : null);
    // antd: dropPosition 减去落点节点自身序号 → -1 之前 / 0 内部 / 1 之后
    const dropPos = String(info.node.pos).split("-");
    const rel = info.dropPosition - Number(dropPos[dropPos.length - 1]);
    let parentId: string | null;
    let index: number;
    if (rel === 0) {
      // 拖入文件夹内部 → 追加到末尾
      parentId = dropKey;
      index = active.filter((n) => n.parentId === dropKey).length;
    } else {
      parentId = parentOf(dropKey);
      const siblings = active.filter((n) => n.parentId === parentId);
      const dropIdx = siblings.findIndex((n) => n._id === dropKey);
      index = rel === -1 ? dropIdx : dropIdx + 1;
      // 同级拖动时, 移除自身后插入位置需前移
      if (parentOf(dragKey) === parentId) {
        const dragIdx = siblings.findIndex((n) => n._id === dragKey);
        if (dragIdx >= 0 && dragIdx < index) index -= 1;
      }
    }
    try {
      const res = await noteApi.move(dragKey, { parentId, index });
      const newId = res.data?._id;
      if (newId && newId !== dragKey) {
        // 跨文件夹移动可能重命名, 同步选中/高亮/展开状态中的旧路径前缀
        if (selectedId === dragKey) setSelectedId(newId);
        setHighlightIds((prev) => prev.map((h) => (h === dragKey ? newId : h)));
        setExpandedKeys((prev) =>
          prev.map((k) => {
            const s = String(k);
            return s === dragKey || s.startsWith(dragKey + "/") ? newId + s.slice(dragKey.length) : k;
          })
        );
      }
      if (parentId) setExpandedKeys((prev) => (prev.includes(parentId!) ? prev : [...prev, parentId!]));
      await loadNotes();
    } catch {
      message.error("移动失败");
    }
  };

  // ---- 导入 / 导出 / 清空 ----

  const togglePanel = () => {
    setPanelCollapsed((prev) => {
      localStorage.setItem(PANEL_COLLAPSED_KEY, prev ? "0" : "1");
      return !prev;
    });
  };

  const handleExport = async () => {
    const blob = await noteApi.exportZip();
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `quicklink-notes-${date}.zip`);
    message.success("导出成功");
  };

  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const res = await noteApi.importZip(buf);
      message.success(res.message || "导入成功");
      await loadAll();
    } catch {
      message.error("导入失败");
    }
  };

  const handleWipe = async () => {
    await noteApi.wipe();
    message.success("笔记数据已清空");
    setSelectedId(null);
    await loadAll();
  };

  // ---- 渲染 ----

  // 顶部工具栏: 清空/导出/导入 + 附件管理 (笔记/回收站切换已收进左侧面板)
  const topBar = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
        <Popconfirm title="清空全部笔记与附件? 该操作不可恢复!" onConfirm={handleWipe}>
          <Button type="text" danger icon={<ClearOutlined />}>清空</Button>
        </Popconfirm>
        <Button type="text" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
        <Button type="text" icon={<ImportOutlined />} onClick={() => importInputRef.current?.click()}>导入</Button>
        <Button type="text" icon={<PaperClipOutlined />} onClick={() => setAttachManagerOpen(true)}>附件管理</Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 96px)", minHeight: 480 }}>
      {topBar}

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
      {/* 左侧: 搜索 + 文件夹树 / 回收站 (支持收起展开) */}
      <div
        style={{
          width: panelCollapsed ? 48 : 300,
          display: "flex",
          flexDirection: "column",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          padding: 8,
          transition: "width 0.2s",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: panelCollapsed ? 0 : 8 }}>
          <Tooltip title={panelCollapsed ? "展开文件夹面板" : "收起文件夹面板"}>
            <Button
              type="text"
              icon={panelCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={togglePanel}
            />
          </Tooltip>
          {!panelCollapsed && (
            <Segmented
              value={view}
              onChange={(v) => setView(v as "library" | "trash")}
              style={{ flex: 1 }}
              options={[
                { label: "笔记", value: "library" },
                { label: <span><RestOutlined /> 回收站{trash.length ? ` (${trash.length})` : ""}</span>, value: "trash" },
              ]}
            />
          )}
        </div>
        {!panelCollapsed && (
        <>
        <div style={{ marginBottom: 8, display: "flex", gap: 6 }}>
          <Search placeholder="搜索标题或内容" allowClear onSearch={setSearch} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
          {view === "library" && (
            <Tooltip title="在第一级目录新建">
              <Dropdown
                menu={{
                  items: [
                    { key: "note", icon: <FileAddOutlined />, label: "新建文档" },
                    { key: "folder", icon: <FolderAddOutlined />, label: "新建文件夹" },
                  ],
                  onClick: ({ key }) => createItem(key as "note" | "folder", null),
                }}
              >
                <Button icon={<PlusOutlined />} />
              </Dropdown>
            </Tooltip>
          )}
        </div>

        <div
          style={{ flex: 1, overflow: "auto" }}
          onContextMenu={(e) => {
            // 仅空白处 (节点自带 stopPropagation)
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, node: null });
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", paddingTop: 40 }}>
              <Spin />
            </div>
          ) : view === "library" ? (
            treeData.length ? (
              <Tree
                ref={treeRef}
                showIcon
                blockNode
                draggable={view === "library" && !kw}
                onDrop={onTreeDrop}
                treeData={treeData}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys)}
                selectedKeys={selectedId ? [selectedId] : []}
                onSelect={(keys) => {
                  const key = String(keys[0] ?? "");
                  if (!key) return;
                  setSelectedId(key); // 文件夹也高亮选中 (仅文档打开右侧预览)
                  setHighlightIds([]); // 用户手动导航后清除附件归属高亮
                }}
                onClick={(_e, node) => {
                  if (!node.isLeaf) {
                    const key = String(node.key);
                    setExpandedKeys((prev) =>
                      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                    );
                  }
                }}
                onRightClick={({ node, event }) => {
                  event.preventDefault();
                  event.stopPropagation(); // 阻止冒泡到父级 div 的 onContextMenu (否则会覆盖 ctxMenu 为 node: null)
                  const nd = node as unknown as { key: React.Key };
                  const n = active.find((x) => x._id === String(nd.key));
                  if (n) setCtxMenu({ x: event.clientX, y: event.clientY, node: n });
                }}
              />
            ) : (
              <Empty description="暂无笔记, 右键新建" style={{ marginTop: 40 }} />
            )
          ) : trash.length ? (
            <>
              <div style={{ textAlign: "right", marginBottom: 4 }}>
                <Popconfirm title="清空回收站? 该操作不可恢复!" onConfirm={async () => { await noteApi.emptyTrash(); message.success("回收站已清空"); await loadNotes(); }}>
                  <Button size="small" danger>清空回收站</Button>
                </Popconfirm>
              </div>
              <List
                size="small"
                dataSource={trash}
                renderItem={(n) => (
                  <List.Item
                    actions={[
                      <Tooltip title="还原" key="restore">
                        <Button
                          type="link"
                          size="small"
                          icon={<UndoOutlined />}
                          onClick={async () => { await noteApi.restore(n._id); message.success("已还原"); await loadNotes(); }}
                        />
                      </Tooltip>,
                      <Popconfirm
                        key="perm"
                        title="彻底删除? 不可恢复!"
                        onConfirm={async () => { await noteApi.removePermanent(n._id); message.success("已彻底删除"); await loadNotes(); }}
                      >
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]}
                  >
                    <span style={{ maxWidth: 130, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      {n.type === "folder" ? <FolderOutlined /> : <FileMarkdownOutlined />} {n.title}
                    </span>
                  </List.Item>
                )}
              />
            </>
          ) : (
            <Empty description="回收站为空" style={{ marginTop: 40 }} />
          )}
        </div>
        </>
        )}
      </div>

      {/* 右侧: 预览 / 编辑 */}
      <div
        style={{
          flex: 1,
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {selectedNote ? (
          <NoteViewer
            note={selectedNote}
            attachments={attachments}
            onNoteChanged={loadNotes}
            onAttachmentsChanged={loadAttachments}
          />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Empty description="选择左侧笔记查看, 右键新建文档" />
          </div>
        )}
      </div>
      </div>

      {/* 右键菜单 */}
      {ctxMenu && ctxItems.length > 0 && (
        <div
          style={{
            position: "fixed",
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 1050,
            boxShadow: token.boxShadowSecondary,
            borderRadius: 6,
            background: token.colorBgElevated,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Menu items={ctxItems} onClick={handleCtxMenuClick} style={{ border: "none", minWidth: 160 }} />
        </div>
      )}

      <AttachmentManager open={attachManagerOpen} onClose={() => setAttachManagerOpen(false)} notes={notes} onOpenNotes={openAttachmentNotes} />

      {/* 重命名弹窗 */}
      <Modal
        title="重命名"
        open={!!renameTarget}
        onOk={confirmRename}
        onCancel={() => setRenameTarget(null)}
        okText="确定"
        cancelText="取消"
        destroyOnHidden
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={confirmRename}
          placeholder="请输入新名称"
          autoFocus
          maxLength={100}
        />
      </Modal>

      {/* 移动到弹窗 */}
      <Modal
        title={`移动「${moveTarget?.title || ""}」到`}
        open={!!moveTarget}
        onOk={confirmMove}
        onCancel={() => setMoveTarget(null)}
        okText="确定"
        cancelText="取消"
        destroyOnHidden
      >
        <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${token.colorBorder}`, borderRadius: 6, padding: 8 }}>
          <div
            onClick={() => setMoveDestId(null)}
            style={{
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: 4,
              background: moveDestId === null ? token.colorPrimaryBg : "transparent",
              border: moveDestId === null ? `1px solid ${token.colorPrimary}` : "1px solid transparent",
              marginBottom: 4,
            }}
          >
            <FolderOutlined style={{ marginRight: 8 }} />
            根目录
          </div>
          <Tree
            treeData={moveTreeData}
            selectedKeys={moveDestId ? [moveDestId] : []}
            onSelect={(keys) => {
              if (keys.length > 0) setMoveDestId(keys[0] as string);
            }}
            showIcon
            blockNode
            style={{ background: "transparent" }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default NotesPage;
