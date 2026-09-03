import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  List,
  Modal,
  Space,
  Switch,
  Typography,
  message,
  theme,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ImportOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { apiManagerApi } from "../../services/api";
import type { ApiEnvironment, EnvVariable } from "../../types";

const { Text } = Typography;

interface Props {
  open: boolean;
  environments: ApiEnvironment[];
  activeEnvId?: string;
  onClose: () => void;
  onSaved: () => void;
  onActivate: (id: string) => void;
}

const EnvironmentModal: React.FC<Props> = ({
  open,
  environments,
  activeEnvId,
  onClose,
  onSaved,
  onActivate,
}) => {
  const { token } = theme.useToken();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApiEnvironment | null>(null);
  const [editName, setEditName] = useState("");
  const [editVars, setEditVars] = useState<EnvVariable[]>([]);
  const importFileRef = React.useRef<HTMLInputElement>(null);

  // 选中第一个环境
  useEffect(() => {
    if (open && environments.length > 0 && !selectedId) {
      setSelectedId(environments[0]._id);
    }
    if (!open) setSelectedId(null);
  }, [open, environments, selectedId]);

  // 加载选中环境到编辑区
  useEffect(() => {
    const env = environments.find(e => e._id === selectedId);
    if (env) {
      setEditing(env);
      setEditName(env.name);
      setEditVars([...env.variables]);
    } else {
      setEditing(null);
      setEditName("");
      setEditVars([]);
    }
  }, [selectedId, environments]);

  // 新建环境
  const handleCreate = useCallback(async () => {
    const res = await apiManagerApi.createEnvironment({ name: "新环境", variables: [] });
    if (res.success && res.data) {
      message.success("环境已创建");
      onSaved();
      setSelectedId(res.data._id);
    }
  }, [onSaved]);

  // 保存环境
  const handleSave = useCallback(async () => {
    if (!editing) return;
    const res = await apiManagerApi.updateEnvironment(editing._id, {
      name: editName,
      variables: editVars,
    });
    if (res.success) {
      message.success("已保存");
      onSaved();
    }
  }, [editing, editName, editVars, onSaved]);

  // 删除环境
  const handleDelete = useCallback(async (id: string) => {
    const res = await apiManagerApi.removeEnvironment(id);
    if (res.success) {
      message.success("已删除");
      if (selectedId === id) setSelectedId(null);
      onSaved();
    }
  }, [selectedId, onSaved]);

  // 导入 Postman 环境 JSON
  const handleImportPostman = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // 校验是否为 Postman 环境文件
      if (!json._postman_variable_scope || json._postman_variable_scope !== "environment") {
        message.error("不是有效的 Postman 环境文件 (缺少 _postman_variable_scope)");
        return;
      }
      const name = (json.name || "导入的环境").trim();
      const variables: EnvVariable[] = (json.values || []).map((v: any) => ({
        key: String(v.key || ""),
        value: String(v.value || ""),
        enabled: v.enabled !== false,
      }));
      const res = await apiManagerApi.createEnvironment({ name, variables });
      if (res.success && res.data) {
        message.success(`已导入环境「${name}」，共 ${variables.length} 个变量`);
        onSaved();
        setSelectedId(res.data._id);
      }
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        message.error("JSON 解析失败，请检查文件格式");
      } else {
        message.error("导入失败: " + (err.message || "未知错误"));
      }
    }
  }, [onSaved]);

  // 导出当前环境为 Postman 格式
  const handleExportPostman = useCallback(() => {
    if (!editing) return;
    const postmanJson = {
      id: editing._id,
      name: editName,
      values: editVars.map(v => ({
        key: v.key,
        value: v.value,
        type: "default",
        enabled: v.enabled,
      })),
      _postman_variable_scope: "environment",
      _postman_exported_at: new Date().toISOString(),
      _postman_exported_using: "QuickLink",
    };
    const blob = new Blob([JSON.stringify(postmanJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${editName || "environment"}.postman_environment.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("已导出为 Postman 环境文件");
  }, [editing, editName, editVars]);

  // 变量操作
  const addVar = () => {
    setEditVars([...editVars, { key: "", value: "", enabled: true }]);
  };

  const updateVar = (index: number, field: keyof EnvVariable, value: any) => {
    const next = [...editVars];
    next[index] = { ...next[index], [field]: value };
    setEditVars(next);
  };

  const removeVar = (index: number) => {
    setEditVars(editVars.filter((_, i) => i !== index));
  };

  return (
    <Modal
      title="环境管理"
      open={open}
      onCancel={onClose}
      width={720}
      footer={null}
      styles={{
        content: {
          resize: "both",
          minWidth: 500,
          minHeight: 400,
          overflow: "hidden",
          height: 520,
          display: "flex",
          flexDirection: "column",
        },
        body: {
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* 左侧环境列表 */}
        <div style={{ width: 200, borderRight: `1px solid ${token.colorBorderSecondary}`, paddingRight: 12 }}>
          <List
            size="small"
            dataSource={environments}
            renderItem={env => (
              <List.Item
                style={{
                  cursor: "pointer",
                  padding: "8px",
                  background: selectedId === env._id ? token.colorPrimaryBg : "transparent",
                  borderRadius: 4,
                }}
                onClick={() => setSelectedId(env._id)}
                actions={[
                  <Button
                    key="del"
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={e => { e.stopPropagation(); handleDelete(env._id); }}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {env._id === activeEnvId && <CheckCircleOutlined style={{ color: "#52c41a" }} />}
                      <Text ellipsis style={{ maxWidth: 100 }}>{env.name}</Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
          <Button size="small" type="dashed" icon={<PlusOutlined />} block onClick={handleCreate} style={{ marginTop: 8 }}>
            新建环境
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
              if (f) handleImportPostman(f);
              e.target.value = "";
            }}
          />
        </div>

        {/* 右侧编辑区 */}
        <div style={{ flex: 1 }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div style={{ marginBottom: 12 }}>
                <Text strong>环境名称</Text>
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
              <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong>环境变量</Text>
                <Button size="small" icon={<PlusOutlined />} onClick={addVar}>添加变量</Button>
              </div>
              <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                {editVars.map((v, i) => (
                  <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
                    <Switch size="small" checked={v.enabled} onChange={val => updateVar(i, "enabled", val)} />
                    <Input size="small" placeholder="变量名" value={v.key} onChange={e => updateVar(i, "key", e.target.value)} style={{ flex: 1 }} />
                    <Input size="small" placeholder="值" value={v.value} onChange={e => updateVar(i, "value", e.target.value)} style={{ flex: 1 }} />
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeVar(i)} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <Button type="primary" onClick={handleSave}>保存</Button>
                <Button icon={<ExportOutlined />} onClick={handleExportPostman}>导出 Postman</Button>
                {editing._id !== activeEnvId && (
                  <Button onClick={() => onActivate(editing._id)}>激活此环境</Button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
              <Text type="secondary">选择或新建一个环境</Text>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default EnvironmentModal;
