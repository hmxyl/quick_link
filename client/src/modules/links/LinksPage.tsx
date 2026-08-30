import React, { useEffect, useRef, useState } from "react";
import { Table, Button, Modal, Form, Input, Tag, Space, message, Popconfirm, Select, Typography, theme, Tooltip } from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  ThunderboltOutlined, KeyOutlined, CopyOutlined, FolderOutlined, ExportOutlined,
  DownloadOutlined, UploadOutlined, TagsOutlined, SyncOutlined, StarOutlined,
} from "@ant-design/icons";
import { linkApi, tagApi, customIconApi } from "../../services/api";
import type { CustomIcon } from "../../services/api";
import { useSearchParams } from "react-router-dom";
import { LinkIcon, IconPicker } from "./LinkIcon";
import TagManager from "./TagManager";
import type { Link, Tag as TagType, AccountSecrets } from "../../types";

const { Text } = Typography;

const LinksPage: React.FC = () => {
  const { token } = theme.useToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTag = searchParams.get("tag") || "";

  const [links, setLinks] = useState<Link[]>([]);
  const [tags, setTags] = useState<TagType[]>([]);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState(urlTag);
  const [modalOpen, setModalOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [quickUrl, setQuickUrl] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form] = Form.useForm();

  // Secrets / account state
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [secrets, setSecrets] = useState<AccountSecrets | null>(null);
  const [viewLinkId, setViewLinkId] = useState<string | null>(null);

  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addForm] = Form.useForm();

  const loadLinks = async (p = page) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: "20" };
      if (search) params.search = search;
      if (activeTag) params.tag = activeTag;
      const res = await linkApi.list(params);
      setLinks(res.data || []);
      setTotal(res.total || 0);
    } catch {
      message.error("加载链接失败");
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const res = await tagApi.list();
      setTags(res.data || []);
    } catch { /* ignore */ }
  };

  const loadCustomIcons = async () => {
    try {
      const res = await customIconApi.list();
      setCustomIcons(res.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadTags(); loadCustomIcons(); }, []);
  useEffect(() => {
    // Sync filters from URL search params
    setActiveTag(searchParams.get("tag") || "");
  }, [searchParams]);
  useEffect(() => { loadLinks(); }, [page, search, activeTag]);

  const handleQuickImport = async () => {
    const url = quickUrl.trim();
    if (!url) return;
    setQuickLoading(true);
    try {
      await linkApi.create({ url });
      message.success("链接已快速导入");
      setQuickUrl("");
      loadLinks();
    } catch (err: any) {
      message.error(err.response?.data?.error || "导入失败");
    } finally {
      setQuickLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingLink(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: Link) => {
    setEditingLink(record);
    // 先重置整个表单 (清掉上次遗留的账号行), 再回填基础字段; 存量密文不在表单中管理
    form.resetFields();
    form.setFieldsValue({
      url: record.url,
      title: record.title,
      description: record.description,
      icon: record.icon,
      tags: record.tags,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await linkApi.remove(id);
      message.success("链接已删除");
      loadLinks();
    } catch {
      message.error("删除失败");
    }
  };

  const handleViewSecrets = async (id: string) => {
    try {
      const res = await linkApi.getSecrets(id);
      if (res.success) {
        setSecrets(res.data || { accounts: [] });
        setViewLinkId(id);
        setAddAccountOpen(false);
        setViewModalOpen(true);
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || "获取账号信息失败");
    }
  };

  // 重新拉取账号明细 (增删账号后刷新)
  const refreshSecrets = async () => {
    if (!viewLinkId) return;
    try {
      const res = await linkApi.getSecrets(viewLinkId);
      if (res.success) setSecrets(res.data || { accounts: [] });
    } catch {
      message.error("刷新账号信息失败");
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    if (!viewLinkId) return;
    try {
      await linkApi.removeAccount(viewLinkId, accountId);
      message.success("账号已删除");
      await refreshSecrets();
      loadLinks();
    } catch {
      message.error("删除账号失败");
    }
  };

  // 随机生成密码: 16位 a-zA-Z0-9, 首字符为大写字母; 可多次点击替换
  const genPassword = () => {
    const all = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const rand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
    let pw = upper[rand(upper.length)];
    for (let i = 1; i < 16; i++) pw += all[rand(all.length)];
    addForm.setFieldValue("password", pw);
  };

  const handleAddAccountSubmit = async () => {
    if (!viewLinkId) return;
    try {
      const values = await addForm.validateFields();
      await linkApi.addAccount(viewLinkId, values);
      message.success("账号已添加");
      addForm.resetFields();
      setAddAccountOpen(false);
      await refreshSecrets();
      loadLinks();
    } catch (err: any) {
      if (err.response?.data?.error) message.error(err.response.data.error);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const { url, title, description, icon, tags } = values;
      const payload = { url, title, description, icon, tags };

      if (editingLink) {
        await linkApi.update(editingLink._id, payload);
        message.success("链接已更新");
      } else {
        await linkApi.create(payload);
        message.success("链接已创建");
      }
      setModalOpen(false);
      loadLinks();
    } catch (err: any) {
      if (err.response?.data?.error) message.error(err.response.data.error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("已复制！");
  };

  const handleCopyAndOpen = (url: string) => {
    navigator.clipboard.writeText(url);
    window.open(url, "_blank");
    message.success("地址已复制，并在新标签页打开");
  };

  const isLocalFile = (url: string) => url.startsWith("file://");

  const handleClearAll = async () => {
    try {
      const res = await linkApi.clearAll();
      message.success(res.message || "数据已清空");
      loadLinks(1);
    } catch {
      message.error("清空失败");
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const blob = await linkApi.exportJson();
      const url = URL.createObjectURL(new Blob([blob], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `quicklink-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success("数据已导出");
    } catch {
      message.error("导出失败");
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      // Accept both export format {data:[...]} and plain array / {links:[...]}
      const items: any[] = Array.isArray(parsed) ? parsed : parsed.data || parsed.links || [];
      if (items.length === 0) {
        message.warning("导入文件中没有链接数据");
        return;
      }
      const res = await linkApi.batchImport(items);
      message.success(`成功导入 ${res.data?.count ?? items.length} 条链接`);
      loadLinks(1);
    } catch {
      message.error("导入失败：文件格式无效");
    } finally {
      e.target.value = "";
    }
  };

  // Add link's favicon to custom icon library
  const handleAddToIconLibrary = async (record: Link) => {
    const icon = record.icon;
    if (!icon || !/^https?:\/\//i.test(icon)) {
      message.warning("该链接没有网址图标");
      return;
    }
    // Check if already in library
    if (customIcons.some((c) => c.url === icon)) {
      message.info("该图标已在图标库中");
      return;
    }
    try {
      await customIconApi.add(icon);
      message.success("已加入图标库");
      loadCustomIcons();
    } catch (err: any) {
      message.error(err.response?.data?.error || "加入图标库失败");
    }
  };

  const columns = [
    {
      title: "标题", dataIndex: "title", key: "title", ellipsis: true,
      render: (title: string, record: Link) => (
        <span>
          <LinkIcon icon={record.icon} url={record.url} />
          <span style={{ marginLeft: 8 }}>{title}</span>
        </span>
      ),
    },
    {
      title: "链接", dataIndex: "url", key: "url", ellipsis: true,
      render: (url: string) => {
        if (isLocalFile(url)) {
          return (
            <span>
              <FolderOutlined style={{ color: "#faad14", marginRight: 4 }} />
              <span style={{ color: "#888" }}>{url}</span>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={(e) => { e.stopPropagation(); copyToClipboard(url); }}
                title="复制文件路径"
              />
            </span>
          );
        }
        return <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>;
      },
    },
    {
      title: "标签", dataIndex: "tags", key: "tags",
      render: (tags: string[]) => tags?.map((t) => <Tag key={t}>{t}</Tag>),
    },
    {
      title: "操作", key: "actions", width: 220,
      render: (_: any, record: Link) => {
        const hasUrlIcon = record.icon && /^https?:\/\//i.test(record.icon);
        const isInLibrary = hasUrlIcon && customIcons.some((c) => c.url === record.icon);
        return (
          <Space>
            {isLocalFile(record.url) && (
              <Button
                size="small"
                icon={<ExportOutlined />}
                onClick={() => handleCopyAndOpen(record.url)}
                title="复制地址并在新标签页打开"
              />
            )}
            <Tooltip title="账号管理">
              <Button size="small" icon={<KeyOutlined />} onClick={() => handleViewSecrets(record._id)} />
            </Tooltip>
            {hasUrlIcon && !isInLibrary && (
              <Tooltip title="加入图标库">
                <Button size="small" icon={<StarOutlined />} onClick={() => handleAddToIconLibrary(record)} />
              </Tooltip>
            )}
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            <Popconfirm title="确定删除此链接？" onConfirm={() => handleDelete(record._id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="粘贴网址后回车，快速导入..."
          prefix={<ThunderboltOutlined />}
          value={quickUrl}
          onChange={(e) => setQuickUrl(e.target.value)}
          onPressEnter={handleQuickImport}
          disabled={quickLoading}
          size="large"
          allowClear
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索链接..."
            allowClear
            onSearch={(v) => { setSearch(v); setPage(1); }}
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="标签筛选"
            allowClear
            style={{ width: 140 }}
            value={activeTag || undefined}
            onChange={(v) => {
              const params: Record<string, string> = {};
              if (v) params.tag = v;
              setSearchParams(params);
              setPage(1);
            }}
            options={tags.map((t) => ({ label: t.name, value: t.name }))}
          />
        </Space>
        <Space>
          <Popconfirm
            title="数据清空"
            description="确定要清空所有链接数据吗？此操作不可恢复！"
            okText="确认清空"
            okButtonProps={{ danger: true }}
            onConfirm={handleClearAll}
          >
            <Button danger icon={<DeleteOutlined />}>数据清空</Button>
          </Popconfirm>
          <Button icon={<DownloadOutlined />} loading={exportLoading} onClick={handleExport}>数据导出</Button>
          <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>数据导入</Button>
          <Button icon={<TagsOutlined />} onClick={() => setTagManagerOpen(true)}>标签管理</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            添加链接
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
        </Space>
      </div>

      {activeTag && (
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <Tag color="blue" closable onClose={() => {
              setSearchParams({});
              setPage(1);
            }}>
              标签：{activeTag}
            </Tag>
          </Space>
        </div>
      )}

      <Table
        dataSource={links}
        columns={columns}
        rowKey="_id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
      />

      {/* Add/Edit Link Modal */}
      <Modal
        title={editingLink ? "编辑链接" : "添加链接"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input placeholder="留空则自动从URL生成" />
          </Form.Item>
          <Form.Item name="url" label="链接地址" rules={[{ required: true, message: "请输入链接地址" }, {
            validator: (_, value) => {
              if (!value) return Promise.resolve();
              // Accept: http(s)://, ftp://, file://, local paths (C:\, /), UNC paths (\\)
              if (/^(https?|ftp|file):\/\//i.test(value)) return Promise.resolve();
              if (/^[A-Za-z]:[\\/]/.test(value)) return Promise.resolve();
              if (value.startsWith("\\\\")) return Promise.resolve();
              if (value.startsWith("/")) return Promise.resolve();
              if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return Promise.resolve();
              return Promise.reject("请输入有效的网址或本地文件路径");
            }
          }]}>
            <Input placeholder="https://... 或 C:\Users\... 或 \\server\share" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.url !== cur.url}>
            {({ getFieldValue }) => {
              const currentUrl = getFieldValue("url");
              return (
                <Form.Item name="icon" label="图标" tooltip="留空则导入时自动分配（网址自动获取官方图标，本地文件使用文件夹图标）">
                  <IconPicker url={currentUrl} customIcons={customIcons} />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="选择或输入标签" options={tags.map((t) => ({ label: t.name, value: t.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Tag Management Modal */}
      <TagManager
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        onChanged={loadTags}
      />

      {/* View Secrets Modal - 多个账号以表格展示, 支持删除/追加 */}
      <Modal
        title="账号详情"
        open={viewModalOpen}
        onCancel={() => { setViewModalOpen(false); setSecrets(null); setViewLinkId(null); setAddAccountOpen(false); }}
        footer={null}
        width={800}
      >
        {secrets && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Table
              dataSource={secrets.accounts}
              rowKey="_id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "用户名", dataIndex: "username", key: "username", ellipsis: true,
                  render: (v: string | null) => v ? (
                    <Space size={4}>
                      <Text style={{ maxWidth: 140 }} ellipsis>{v}</Text>
                      <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(v)} />
                    </Space>
                  ) : <Text type="secondary">—</Text>,
                },
                {
                  title: "邮箱", dataIndex: "email", key: "email", ellipsis: true,
                  render: (v: string | null) => v ? (
                    <Space size={4}>
                      <Text style={{ maxWidth: 140 }} ellipsis>{v}</Text>
                      <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(v)} />
                    </Space>
                  ) : <Text type="secondary">—</Text>,
                },
                {
                  title: "密码", dataIndex: "password", key: "password",
                  render: (v: string) => (
                    <Space size={4}>
                      <Text code style={{ maxWidth: 140 }} ellipsis>{v}</Text>
                      <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(v)} />
                    </Space>
                  ),
                },
                {
                  title: "备注", dataIndex: "notes", key: "notes", ellipsis: true,
                  render: (v: string | null) => v ? <Text style={{ maxWidth: 120 }} ellipsis>{v}</Text> : <Text type="secondary">—</Text>,
                },
                {
                  title: "操作", key: "action", width: 60, align: "center" as const,
                  render: (_: any, acc: any) => (
                    <Popconfirm title="确定删除该账号？" onConfirm={() => handleRemoveAccount(acc._id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />

            {addAccountOpen ? (
              <div style={{ border: `1px dashed ${token.colorBorder}`, borderRadius: 6, padding: 12 }}>
                <Form form={addForm} layout="vertical">
                  <Form.Item name="username" label="用户名">
                    <Input />
                  </Form.Item>
                  <Form.Item name="email" label="邮箱">
                    <Input />
                  </Form.Item>
                  <Form.Item label="密码" required>
                    <Space.Compact style={{ width: "100%" }}>
                      <Form.Item name="password" noStyle rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password />
                      </Form.Item>
                      <Button icon={<SyncOutlined />} onClick={genPassword} title="生成16位随机密码">生成</Button>
                    </Space.Compact>
                  </Form.Item>
                  <Form.Item name="notes" label="备注">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                  <Space>
                    <Button type="primary" onClick={handleAddAccountSubmit}>保存</Button>
                    <Button onClick={() => { setAddAccountOpen(false); addForm.resetFields(); }}>取消</Button>
                  </Space>
                </Form>
              </div>
            ) : (
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setAddAccountOpen(true)}>
                添加关联账号
              </Button>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default LinksPage;
