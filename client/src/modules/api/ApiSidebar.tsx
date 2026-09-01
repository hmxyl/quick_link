import React, { useCallback, useMemo, useState } from "react";
import {
  Tree,
  Tabs,
  Button,
  Dropdown,
  Input,
  Typography,
  Empty,
  Tag,
  List,
  Popconfirm,
  message,
} from "antd";
import {
  PlusOutlined,
  FolderOutlined,
  FileOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
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
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onExport: (id: string, name: string) => void;
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
  onDelete,
  onRename,
  onExport,
  onLoadHistory,
  onRefreshHistory,
}) => {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

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
  }, [onCreateChild, onExport, onDelete]);

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
      <Dropdown
        menu={{ items: getContextMenu(item) }}
        trigger={["contextMenu"]}
      >
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
      </Dropdown>
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
                </div>
                {treeData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无集合" />
                ) : (
                  <Tree
                    treeData={treeData}
                    expandedKeys={expandedKeys}
                    onExpand={keys => setExpandedKeys(keys)}
                    selectedKeys={currentId ? [currentId] : []}
                    titleRender={titleRender as any}
                    blockNode
                    showIcon
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
    </div>
  );
};

export default ApiSidebar;
