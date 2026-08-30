import React, { useEffect, useState } from "react";
import { List, Button, Modal, Form, Input, ColorPicker, message, Popconfirm, Tag as AntTag } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { tagApi } from "../../services/api";
import type { Tag } from "../../types";

// Tag management modal (merged into link management page)
const TagManager: React.FC<{
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}> = ({ open, onClose, onChanged }) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [form] = Form.useForm();

  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await tagApi.list();
      setTags(res.data || []);
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
    form.setFieldsValue({ name: tag.name, color: tag.color });
    setEditModalOpen(true);
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

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const color = typeof values.color === "string" ? values.color : values.color?.toHexString?.() || "#1677ff";
      if (editingTag) {
        await tagApi.update(editingTag._id, { name: values.name, color });
        message.success("标签已更新");
      } else {
        await tagApi.create({ name: values.name, color });
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
      <List
        loading={loading}
        dataSource={tags}
        locale={{ emptyText: "暂无标签" }}
        renderItem={(tag) => (
          <List.Item
            actions={[
              <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => handleEdit(tag)} />,
              <Popconfirm key="delete" title="确定删除此标签？" onConfirm={() => handleDelete(tag._id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            <AntTag color={tag.color || "default"}>{tag.name}</AntTag>
          </List.Item>
        )}
      />

      {/* Add/Edit Tag Modal (nested) */}
      <Modal title={editingTag ? "编辑标签" : "添加标签"} open={editModalOpen} onOk={handleSubmit} onCancel={() => setEditModalOpen(false)}>
        <Form form={form} layout="vertical" initialValues={{ color: "#1677ff" }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入标签名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <ColorPicker />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
};

export default TagManager;
