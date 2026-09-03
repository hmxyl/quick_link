import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tree,
  Tabs,
  Button,
  Input,
  Typography,
  Empty,
  Tag,
  List,
  Popconfirm,
  Menu,
  message,
  theme,
} from "antd";
import {
  PlusOutlined,
  FolderOutlined,
  FileOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  ImportOutlined,
  ReloadOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import type { ApiCollectionItem, ApiHistory } from "../../types";
import { apiManagerApi } from "../../services/api";

const { Text } = Typography;

const METHOD_COLORS: Record<string, string> = {
  GET: "green",
  POST: "orange",
  PUT: "blue",
  DELETE: "red",
  PATCH: "purple",
  HEAD: "cyan",
  OPTIONS: "pink",
};

interface Props {
  collections: ApiCollectionItem[];
  history: ApiHistory[];
  currentId?: string;
  onSelectRequest: (item: ApiCollectionItem) => void;
  onCreateCollection: (name: string) => void;
  onCreateChild: (parentId: string, type: "folder" | "request", name: string) => void;
  onNewRequest: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onExport: (id: string, name: string) => void;
  onImportPostman: (file: File) => void;
  onExportPostman: (id: string, name: string) => void;
  onLoadHistory: (item: ApiHistory) => void;
  onRefreshHistory: () => void;
}

interface TreeNodeData {
  key: string;
  title: React.ReactNode;
  children?: TreeNodeData[];
  isLeaf?: boolean;
  icon?: React.ReactNode;
  item: ApiCollectionItem;
}

const ApiSidebar: React.FC<Props> = ({
  collections,
  history,
  currentId,
  onSelectRequest,
  onCreateCollection,
  onCreateChild,
  onNewRequest,
  onDelete,
  onRename,
  onExport,
  onImportPostman,
  onExportPostman,
  onLoadHistory,
  onRefreshHistory,
}) => {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: ApiCollectionItem } | null>(null);
  const treeRef = useRef<any>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const { token } = theme.useToken();

  // 构建扁平 -> 树形结构
  const treeData = useMemo(() => {
    const map = new Map<string, TreeNodeData>();
    const roots: TreeNodeData[] = [];

    for (const item of collections) {
      map.set(item._id, {
        key: item._id,
        title: item.name,
        children: [],
        isLeaf: item.type === "request",
        icon: item.type === "collection" ? <FolderOutlined /> : item.type === "folder" ? <FolderOutlined /> : undefined,
        item,
      });
    }

    for (const item of collections) {
      const node = map.get(item._id)!;
      // 自定义 title
      if (item.type === "request") {
        node.title = (
          <span>
            <Tag color={METHOD_COLORS[item.method || "GET"]} style={{ marginRight: 4, fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>
              {item.method?.slice(0, 3) || "GET"}
            </Tag>
            {item.name}
          </span>
        );
        node.isLeaf = true;
      } else {
        node.title = <span>{item.name}</span>;
      }

      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(node);
      } else if (!item.parentId) {
        roots.push(node);
      }
    }

    // 移除空 children 数组 (isLeaf 节点)
    const cleanTree = (nodes: TreeNodeData[]): TreeNodeData[] =>
      nodes.map(n => ({
        ...n,
        children: n.children && n.children.length > 0 ? cleanTree(n.children) : undefined,
      }));

    return cleanTree(roots);
  }, [collections]);

  // 按渲染顺序扁平的可见节点 (供键盘上下左右导航)
  const flatList = useMemo(() => {
    const out: ApiCollectionItem[] = [];
    const walk = (nodes: TreeNodeData[]) => {
      for (const n of nodes) {
        out.push(n.item);
        if (n.children && expandedKeys.includes(n.key)) walk(n.children);
      }
    };
    walk(treeData);
    return out;
  }, [treeData, expandedKeys]);

  // 键盘上下左右: 选中移动 / 文件夹收起展开 / Enter 加载请求
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (ctxMenu || renaming) return;
      if (!flatList.length) return;
      e.preventDefault();
      const idx = flatList.findIndex(n => n._id === focusedId);
      const cur = idx >= 0 ? flatList[idx] : null;
      const moveTo = (n?: ApiCollectionItem) => {
        if (!n) return;
        setFocusedId(n._id);
        treeRef.current?.scrollTo?.({ key: n._id });
      };
      if (e.key === "ArrowDown") return moveTo(idx >= 0 && idx < flatList.length - 1 ? flatList[idx + 1] : flatList[0]);
      if (e.key === "ArrowUp") return moveTo(idx > 0 ? flatList[idx - 1] : flatList[flatList.length - 1]);
      if (e.key === "Enter") {
        if (cur?.type === "request") onSelectRequest(cur);
        return;
      }
      if (!cur) return moveTo(flatList[0]);
      if (e.key === "ArrowRight") {
        if (cur.type !== "request" && !expandedKeys.includes(cur._id)) {
          setExpandedKeys(prev => [...prev, cur._id]);
        } else if (cur.type !== "request") {
          moveTo(flatList[idx + 1]);
        }
      } else {
        if (cur.type !== "request" && expandedKeys.includes(cur._id)) {
          setExpandedKeys(prev => prev.filter(k => k !== cur._id));
        } else if (cur.parentId) {
          moveTo(flatList.find(n => n._id === cur.parentId));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flatList, focusedId, expandedKeys, ctxMenu, renaming, onSelectRequest]);

  // 点击其他位置关闭右键菜单 (用 mousedown 而非 contextmenu, 避免与 onRightClick 时序冲突)
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  // 右键菜单
  const getContextMenu = useCallback((item: ApiCollectionItem) => {
    const items: any[] = [];

    if (item.type === "collection" || item.type === "folder") {
      items.push({
        key: "newFolder",
        icon: <FolderOutlined />,
        label: "新建子文件夹",
        onClick: () => {
          const name = `新文件夹`;
          onCreateChild(item._id, "folder", name);
        },
      });
      items.push({
        key: "newRequest",
        icon: <FileOutlined />,
        label: "新建请求",
        onClick: () => {
          const name = `新请求`;
          onCreateChild(item._id, "request", name);
        },
      });
      if (item.type === "collection") {
        items.push({ type: "divider" });
        items.push({
          key: "export",
          icon: <ExportOutlined />,
          label: "导出集合",
          onClick: () => onExport(item._id, item.name),
        });
        items.push({
          key: "exportPostman",
          icon: <ExportOutlined />,
          label: "导出 Postman",
          onClick: () => onExportPostman(item._id, item.name),
        });
      }
    }

    items.push({ type: "divider" });
    items.push({
      key: "rename",
      icon: <EditOutlined />,
      label: "重命名",
      onClick: () => {
        setRenaming(item._id);
        setRenameValue(item.name);
      },
    });
    items.push({
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除",
      danger: true,
      onClick: () => {
        onDelete(item._id);
      },
    });

    return items;
  }, [onCreateChild, onExport, onExportPostman, onDelete]);

  // 自定义树节点渲染
  const titleRender = useCallback((nodeData: TreeNodeData) => {
    const item = nodeData.item;
    const isRenaming = renaming === item._id;

    if (isRenaming) {
      return (
        <Input
          size="small"
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onBlur={() => {
            if (renameValue.trim()) onRename(item._id, renameValue.trim());
            setRenaming(null);
          }}
          onPressEnter={() => {
            if (renameValue.trim()) onRename(item._id, renameValue.trim());
            setRenaming(null);
          }}
          autoFocus
          style={{ width: 160 }}
        />
      );
    }

    return (
      <span
        style={{ cursor: "pointer" }}
        onClick={() => {
          if (item.type === "request") {
            onSelectRequest(item);
          }
        }}
      >
        {nodeData.title}
      </span>
    );
  }, [renaming, renameValue, getContextMenu, onSelectRequest, onRename]);

  // 历史状态颜色
  const getStatusColor = (code: number) => {
    if (code === 0) return "red";
    if (code >= 200 && code < 300) return "green";
    if (code >= 300 && code < 400) return "blue";
    if (code >= 400 && code < 500) return "orange";
    return "red";
  };

  return (
    <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #f0f0f0", paddingRight: 12 }}>
      <Tabs
        size="small"
        items={[
          {
            key: "collections",
            label: "集合",
            children: (
              <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", overflow: "auto" }}>
                <div style={{ marginBottom: 8 }}>
                  <Button
                    size="small"
                    type="dashed"
                    icon={<PlusOutlined />}
                    block
                    onClick={() => onCreateCollection("新集合")}
                  >
                    新建集合
                  </Button>
                  <Button
                    size="small"
                    type="dashed"
                    icon={<ImportOutlined />}
                    block
                    onClick={() => importFileRef.current?.click()}
                    style={{ marginTop: 4 }}
                  >
                    导入 Postman
                  </Button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json"
                    style={{ display: "none" }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) onImportPostman(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="small"
                    type="dashed"
                    icon={<FileOutlined />}
                    block
                    onClick={onNewRequest}
                    style={{ marginTop: 4 }}
                  >
                    新建请求
                  </Button>
                </div>
                {treeData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无集合" />
                ) : (
                  <Tree
                    ref={treeRef}
                    treeData={treeData}
                    expandedKeys={expandedKeys}
                    onExpand={keys => setExpandedKeys(keys)}
                    selectedKeys={focusedId ? [focusedId] : currentId ? [currentId] : []}
                    titleRender={titleRender as any}
                    blockNode
                    showIcon
                    onSelect={(keys, info) => {
                      const key = String(keys[0] ?? "");
                      if (!key) return;
                      const nd = info.node as unknown as TreeNodeData;
                      if (nd.item.type !== "request") {
                        setExpandedKeys(prev =>
                          prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                        );
                      }
                    }}
                    onRightClick={({ node, event }) => {
                      event.preventDefault();
                      const nd = node as unknown as TreeNodeData;
                      setCtxMenu({ x: event.clientX, y: event.clientY, item: nd.item });
                    }}
                  />
                )}
              </div>
            ),
          },
          {
            key: "history",
            label: "历史",
            children: (
              <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)" }}>
                <div style={{ marginBottom: 8, display: "flex", gap: 4 }}>
                  <Button size="small" icon={<ReloadOutlined />} onClick={onRefreshHistory} />
                  <Popconfirm title="确定清空所有历史?" onConfirm={async () => { await apiManagerApi.clearHistory(); onRefreshHistory(); message.success("已清空"); }}>
                    <Button size="small" icon={<ClearOutlined />} />
                  </Popconfirm>
                </div>
                <div style={{ flex: 1, overflow: "auto" }}>
                  {history.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史" />
                  ) : (
                    <List
                      size="small"
                      dataSource={history}
                      renderItem={item => (
                        <List.Item
                          style={{ cursor: "pointer", padding: "6px 4px" }}
                          onClick={() => onLoadHistory(item)}
                        >
                          <div style={{ width: "100%" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                              <Tag color={METHOD_COLORS[item.method]} style={{ fontSize: 10, lineHeight: "14px", padding: "0 3px", margin: 0 }}>
                                {item.method}
                              </Tag>
                              <Tag color={getStatusColor(item.statusCode)} style={{ fontSize: 10, lineHeight: "14px", padding: "0 3px", margin: 0 }}>
                                {item.statusCode || "ERR"}
                              </Tag>
                              <Text type="secondary" style={{ fontSize: 10, marginLeft: "auto" }}>
                                {item.duration}ms
                              </Text>
                            </div>
                            <Text ellipsis style={{ fontSize: 11, width: "100%", display: "block" }}>
                              {item.url}
                            </Text>
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* 右键菜单 */}
      {ctxMenu && (
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
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <Menu items={getContextMenu(ctxMenu.item)} style={{ border: "none", minWidth: 160 }} />
        </div>
      )}
    </div>
  );
};

export default ApiSidebar;
