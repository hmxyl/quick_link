import React, { useEffect, useState } from "react";
import { List, Button, Modal, Form, Input, InputNumber, ColorPicker, message, Popconfirm, Tag as AntTag, Typography, theme } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import { tagApi } from "../../services/api";
import type { Tag } from "../../types";

const { Text } = Typography;

// Tag management modal (merged into link management page)
const TagManager: React.FC<{
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}> = ({ open, onClose, onChanged }) => {
  const { token } = theme.useToken();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  // 统一设置的每行链接数 (打开时取首个标签当前值)
  const [uniformColumns, setUniformColumns] = useState<number | null>(5);
  const [applying, setApplying] = useState(false);
  const [form] = Form.useForm();

  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await tagApi.list();
      const list = res.data || [];
      setTags(list);
      // 以首个标签当前列数作为统一设置的初始值
      setUniformColumns(list[0]?.columns ?? 5);
    } catch {
      message.error("加载标签失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadTags();
  }, [open]);

  const handleCreate = () => {
    setEditingTag(null);
    form.resetFields();
    setEditModalOpen(true);
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    form.setFieldsValue({ name: tag.name, color: tag.color, columns: tag.columns ?? 5 });
    setEditModalOpen(true);
  };

  // 上移/下移标签: 本地重排后提交新顺序
  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tags.length) return;
    const next = [...tags];
    [next[index], next[target]] = [next[target], next[index]];
    setTags(next);
    try {
      await tagApi.reorder(next.map((t) => t._id));
      onChanged();
    } catch {
      message.error("排序保存失败");
      loadTags();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tagApi.remove(id);
      message.success("标签已删除");
      loadTags();
      onChanged();
    } catch {
      message.error("删除失败");
    }
  };

  // 统一设置: 一次将所有标签 (含"其他"分组) 的每行链接数改为同一值
  const handleApplyUniform = async () => {
    if (uniformColumns == null) return;
    setApplying(true);
    try {
      const res = await tagApi.batchColumns(uniformColumns);
      message.success(res.message || `已统一为每行 ${uniformColumns} 个链接`);
      await loadTags();
      onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || "统一设置失败");
    } finally {
      setApplying(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const color = typeof values.color === "string" ? values.color : values.color?.toHexString?.() || "#1677ff";
      const payload: any = { name: values.name, color, columns: values.columns ?? 5 };
      if (editingTag) {
        await tagApi.update(editingTag._id, payload);
        message.success("标签已更新");
      } else {
        await tagApi.create(payload);
        message.success("标签已创建");
      }
      setEditModalOpen(false);
      loadTags();
      onChanged();
    } catch (err: any) {
      if (err.response?.data?.error) message.error(err.response.data.error);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 24 }}>
          <span>标签管理</span>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            添加标签
          </Button>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
    >
      {/* 统一设置: 所有标签 (含"其他"分组) 一次应用同一列数 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          padding: "8px 12px",
          borderRadius: 6,
          background: token.colorFillQuaternary,
        }}
      >
        <Text style={{ fontSize: 13 }}>统一每行链接数</Text>
        <InputNumber
          min={1}
          max={8}
          value={uniformColumns}
          onChange={(v) => setUniformColumns(v == null ? null : Number(v))}
          style={{ width: 72 }}
          size="small"
        />
        <Button
          size="small"
          type="primary"
          loading={applying}
          disabled={uniformColumns == null}
          onClick={handleApplyUniform}
        >
          应用到全部
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          覆盖各标签单独设置
        </Text>
      </div>
      <List
        loading={loading}
        dataSource={tags}
        locale={{ emptyText: "暂无标签" }}
        renderItem={(tag, index) => (
          <List.Item
            actions={[
              <Button
                key="up"
                size="small"
                icon={<ArrowUpOutlined />}
                disabled={index === 0}
                onClick={() => handleMove(index, -1)}
              />,
              <Button
                key="down"
                size="small"
                icon={<ArrowDownOutlined />}
                disabled={index === tags.length - 1}
                onClick={() => handleMove(index, 1)}
              />,
              <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => handleEdit(tag)} />,
              <Popconfirm key="delete" title="确定删除此标签？" onConfirm={() => handleDelete(tag._id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            <AntTag color={tag.color || "default"}>{tag.name}</AntTag>
            <span style={{ marginLeft: 8, fontSize: 12, color: token.colorTextTertiary }}>每行 {tag.columns ?? 5} 个</span>
          </List.Item>
        )}
      />

      {/* Add/Edit Tag Modal (nested) */}
      <Modal title={editingTag ? "编辑标签" : "添加标签"} open={editModalOpen} onOk={handleSubmit} onCancel={() => setEditModalOpen(false)}>
        <Form form={form} layout="vertical" initialValues={{ color: "#1677ff", columns: 5 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入标签名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <ColorPicker />
          </Form.Item>
          <Form.Item name="columns" label="每行链接数" tooltip="链接卡片网格每行展示的数量">
            <InputNumber min={1} max={8} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
};

export default TagManager;
