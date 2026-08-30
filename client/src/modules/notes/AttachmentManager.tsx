import React, { useEffect, useState } from "react";
import { Modal, Table, Button, Popconfirm, Space, message, Tooltip, Typography } from "antd";
import {
  DownloadOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  FileMarkdownOutlined,
} from "@ant-design/icons";
import type { Attachment, Note } from "../../types";
import { attachmentApi } from "../../services/api";

const { Text } = Typography;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  // 打开所属笔记: 由笔记页接收 (树中高亮全部归属笔记并打开第一个)
  onOpenNotes: (ids: string[]) => void;
}

const AttachmentManager: React.FC<Props> = ({ open, onClose, notes, onOpenNotes }) => {
  const [list, setList] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await attachmentApi.list();
      setList(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  // 归属笔记 = 上传它的笔记 + 正文中链接引用它的笔记 (排除已删除)
  const ownerNotes = (rec: Attachment): Note[] =>
    notes.filter(
      (n) =>
        n.type === "note" &&
        !n.deletedAt &&
        (n._id === rec.noteId || (n.content || "").includes(`/api/notes/attachments/${rec._id}/`))
    );

  const openFolder = async (rec: Attachment) => {
    try {
      await attachmentApi.openFolder(rec._id);
      message.success("已在文件管理器中打开所在文件夹");
    } catch {
      message.error("打开失败");
    }
  };

  const openNotes = (rec: Attachment) => {
    const owners = ownerNotes(rec);
    if (!owners.length) {
      message.warning("未找到所属笔记 (可能已被删除)");
      return;
    }
    onOpenNotes(owners.map((n) => n._id));
    onClose();
  };

  const columns = [
    { title: "文件名", dataIndex: "originalName", key: "name", ellipsis: true },
    { title: "大小", dataIndex: "size", key: "size", width: 90, render: (v: number) => formatSize(v) },
    {
      title: "所属笔记",
      key: "note",
      width: 180,
      ellipsis: true,
      render: (_: unknown, rec: Attachment) => {
        const owners = ownerNotes(rec);
        if (!owners.length) return <Text type="secondary">-</Text>;
        return owners.map((n) => n.title).join("、");
      },
    },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "time",
      width: 170,
      render: (v: string) => new Date(v).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "action",
      width: 168,
      render: (_: unknown, rec: Attachment) => (
        <Space size={2}>
          <Tooltip title="下载">
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => attachmentApi.download(rec._id, rec.originalName)}
            />
          </Tooltip>
          <Tooltip title="打开所在文件夹">
            <Button type="link" size="small" icon={<FolderOpenOutlined />} onClick={() => openFolder(rec)} />
          </Tooltip>
          <Tooltip title="打开所属笔记">
            <Button type="link" size="small" icon={<FileMarkdownOutlined />} onClick={() => openNotes(rec)} />
          </Tooltip>
          <Popconfirm
            title="删除该附件?"
            onConfirm={async () => {
              await attachmentApi.remove(rec._id);
              message.success("附件已删除");
              load();
            }}
          >
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal title="附件管理" open={open} onCancel={onClose} footer={null} width={860}>
      <Table
        rowKey="_id"
        size="small"
        loading={loading}
        dataSource={list}
        columns={columns}
        pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 个附件` }}
        onRow={(rec) => ({
          // Ctrl + 左键: 用系统默认程序直接打开附件文件 (桌面版生效)
          onClick: (e) => {
            if (!e.ctrlKey) return;
            attachmentApi
              .openFile(rec._id)
              .then(() => message.success(`正在打开 ${rec.originalName}`))
              .catch(() => message.error("打开失败"));
          },
        })}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        提示：Ctrl + 鼠标左键点击行，可直接打开附件文件；「所属笔记」同时包含上传与正文引用的笔记。
      </Text>
    </Modal>
  );
};

export default AttachmentManager;
