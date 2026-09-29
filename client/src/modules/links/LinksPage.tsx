import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal, Form, Input, Space, message, Popconfirm, Select, Typography, theme, Tooltip, Card } from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  KeyOutlined, CopyOutlined, ExportOutlined,
  DownloadOutlined, UploadOutlined, TagsOutlined, SyncOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { linkApi, customIconApi } from "../../services/api";
import type { CustomIcon } from "../../services/api";
import { LinkIcon, IconPicker } from "./LinkIcon";
import TagManager from "./TagManager";
import type { Link, Tag as TagType, AccountSecrets } from "../../types";

const { Text } = Typography;

// 链接卡片悬浮 CSS (模块级一次性注入, 避免每次渲染创建新 style 标签)
const LINK_CARD_CSS = `
  .ant-card-hoverable:hover .link-card-actions {
    opacity: 1 !important;
  }
`;
if (typeof document !== "undefined" && !document.querySelector('[data-ql-links]')) {
  const style = document.createElement("style");
  style.setAttribute("data-ql-links", "");
  style.textContent = LINK_CARD_CSS;
  document.head.appendChild(style);
}

// 链接卡片悬浮设置按钮 (提取到组件外部, 避免每次渲染时重新定义导致完全卸载/重建)
interface LinkSettingsProps {
  link: Link;
  customIcons: CustomIcon[];
  onCopyAndOpen: (url: string) => void;
  onViewSecrets: (id: string) => void;
  onAddToIconLibrary: (link: Link) => void;
  onEdit: (link: Link) => void;
  onDelete: (id: string) => void;
}

const LinkSettings: React.FC<LinkSettingsProps> = ({
  link,
  customIcons,
  onCopyAndOpen,
  onViewSecrets,
  onAddToIconLibrary,
  onEdit,
  onDelete,
}) => {
  const hasUrlIcon = link.icon && /^https?:\/\//i.test(link.icon);
  const isInLibrary = hasUrlIcon && customIcons.some((c) => c.url === link.icon);
  return (
    <Space size={4} wrap>
      {link.url && (
        <Tooltip title="复制并打开">
          <Button size="small" type="text" icon={<ExportOutlined />} onClick={(e) => { e.stopPropagation(); onCopyAndOpen(link.url); }} />
        </Tooltip>
      )}
      <Tooltip title="账号管理">
        <Button size="small" type="text" icon={<KeyOutlined />} onClick={(e) => { e.stopPropagation(); onViewSecrets(link._id); }} />
      </Tooltip>
      {hasUrlIcon && !isInLibrary && (
        <Tooltip title="加入图标库">
          <Button size="small" type="text" icon={<SyncOutlined />} onClick={(e) => { e.stopPropagation(); onAddToIconLibrary(link); }} />
        </Tooltip>
      )}
      <Tooltip title="编辑">
        <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); onEdit(link); }} />
      </Tooltip>
      <Popconfirm title="确定删除此链接？" onConfirm={(e) => { e?.stopPropagation(); onDelete(link._id); }}>
        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
      </Popconfirm>
    </Space>
  );
};

const LinksPage: React.FC = () => {
  const { token } = theme.useToken();

  const [groupedLinks, setGroupedLinks] = useState<Record<string, Link[]>>({});
  const [tagList, setTagList] = useState<TagType[]>([]);
  const [tagColumns, setTagColumns] = useState<Record<string, number>>({});
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // 防抖搜索值: 输入停顿 300ms 后才触发 API 请求
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form] = Form.useForm();

  // Secrets / account state
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [secrets, setSecrets] = useState<AccountSecrets | null>(null);
  const [viewLinkId, setViewLinkId] = useState<string | null>(null);

  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [addForm] = Form.useForm();

  // URL 去重搜索
  const [duplicateLinks, setDuplicateLinks] = useState<Link[]>([]);
  const urlSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 防抖: 输入停顿 300ms 后同步到 debouncedSearch
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadAllLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await linkApi.listAll();
      if (res.success && res.data) {
        // 搜索过滤
        if (debouncedSearch) {
          const kw = debouncedSearch.toLowerCase();
          const filtered: Record<string, Link[]> = {};
          for (const [tag, links] of Object.entries(res.data)) {
            const matched = links.filter(
              (l) =>
                l.title?.toLowerCase().includes(kw) ||
                l.url?.toLowerCase().includes(kw) ||
                l.description?.toLowerCase().includes(kw)
            );
            if (matched.length > 0) filtered[tag] = matched;
          }
          setGroupedLinks(filtered);
        } else {
          setGroupedLinks(res.data);
        }
        if (res.tags) setTagList(res.tags);
        if (res.tagColumns) setTagColumns(res.tagColumns);
      }
    } catch {
      message.error("加载链接失败");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  const loadCustomIcons = async () => {
    try {
      const res = await customIconApi.list();
      setCustomIcons(res.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadCustomIcons(); }, []);
  useEffect(() => { loadAllLinks(); }, [loadAllLinks]);

  // URL 去重搜索: 输入停顿 400ms 后查询已有链接
  const handleUrlChangeForSearch = useCallback((urlValue: string) => {
    if (urlSearchTimer.current) clearTimeout(urlSearchTimer.current);
    const trimmed = (urlValue || "").trim();
    if (!trimmed) {
      setDuplicateLinks([]);
      return;
    }
    urlSearchTimer.current = setTimeout(async () => {
      try {
        const res = await linkApi.searchByUrl(trimmed);
        const results = editingLink
          ? (res.data || []).filter((l) => l._id !== editingLink._id)
          : (res.data || []);
        setDuplicateLinks(results);
      } catch {
        setDuplicateLinks([]);
      }
    }, 400);
  }, [editingLink]);

  useEffect(() => {
    return () => { if (urlSearchTimer.current) clearTimeout(urlSearchTimer.current); };
  }, []);

  const handleCreate = () => {
    setEditingLink(null);
    form.resetFields();
    setDuplicateLinks([]);
    setModalOpen(true);
  };

  const handleEdit = (record: Link) => {
    setEditingLink(record);
    form.resetFields();
    form.setFieldsValue({
      url: record.url,
      title: record.title,
      description: record.description,
      icon: record.icon,
      tag: record.tag || (record.tags && record.tags.length > 0 ? record.tags[0] : "其他"),
    });
    setDuplicateLinks([]);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await linkApi.remove(id);
      message.success("链接已删除");
      loadAllLinks();
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
      loadAllLinks();
    } catch {
      message.error("删除账号失败");
    }
  };

  const handleEditAccount = (acc: any) => {
    setEditingAccountId(acc._id);
    addForm.setFieldsValue({
      username: acc.username || "",
      email: acc.email || "",
      password: acc.password || "",
      notes: acc.notes || "",
    });
    setAddAccountOpen(true);
  };

  const handleEditAccountSubmit = async () => {
    if (!viewLinkId || !editingAccountId) return;
    try {
      const values = await addForm.validateFields();
      await linkApi.updateAccount(viewLinkId, editingAccountId, values);
      message.success("账号已更新");
      addForm.resetFields();
      setAddAccountOpen(false);
      setEditingAccountId(null);
      await refreshSecrets();
      loadAllLinks();
    } catch (err: any) {
      if (err.response?.data?.error) message.error(err.response.data.error);
    }
  };

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
      loadAllLinks();
    } catch (err: any) {
      if (err.response?.data?.error) message.error(err.response.data.error);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const { url, title, description, icon, tag } = values;
      const payload = { url, title, description, icon, tag };

      if (editingLink) {
        await linkApi.update(editingLink._id, payload);
        message.success("链接已更新");
      } else {
        await linkApi.create(payload);
        message.success("链接已创建");
      }
      setModalOpen(false);
      setDuplicateLinks([]);
      loadAllLinks();
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
    if (window.quicklink?.openExternal) {
      window.quicklink.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    message.success("地址已复制，并用系统浏览器打开");
  };

  const handleClearAll = async () => {
    try {
      const res = await linkApi.clearAll();
      message.success(res.message || "数据已清空");
      loadAllLinks();
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
      const items: any[] = Array.isArray(parsed)
        ? parsed
        : parsed.data || parsed.links || [];
      const importIcons: any[] = Array.isArray(parsed.customIcons) ? parsed.customIcons : [];
      const importTags: any[] = Array.isArray(parsed.tags) ? parsed.tags : [];
      if (items.length === 0) {
        message.warning("导入文件中没有链接数据");
        return;
      }
      const res = await linkApi.batchImport(items, importIcons, importTags);
      message.success(res.message || `成功导入 ${res.data?.count ?? items.length} 条链接`);
      loadAllLinks();
      loadCustomIcons();
    } catch {
      message.error("导入失败：文件格式无效");
    } finally {
      e.target.value = "";
    }
  };

  const handleAddToIconLibrary = async (record: Link) => {
    const icon = record.icon;
    if (!icon || !/^https?:\/\//i.test(icon)) {
      message.warning("该链接没有网址图标");
      return;
    }
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

  // 打开链接
  const openLink = (link: Link) => {
    if (!link.url) return;
    if (window.quicklink?.openExternal) {
      window.quicklink.openExternal(link.url);
    } else {
      window.open(link.url, "_blank", "noopener,noreferrer");
    }
  };

  // 链接卡片设置菜单 (悬浮显示) - 使用外部定义的稳定组件引用

  // 获取所有标签名 (按出现顺序)
  const tagNames = Object.keys(groupedLinks);

  return (
    <div>
      {/* 顶部工具栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索链接..."
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => setSearch(v)}
          style={{ flex: 1, minWidth: 0 }}
          prefix={<SearchOutlined />}
        />
        <Popconfirm
          title="清空"
          description="确定要清空所有链接数据吗？此操作不可恢复！"
          okText="确认清空"
          okButtonProps={{ danger: true }}
          onConfirm={handleClearAll}
        >
          <Button danger icon={<DeleteOutlined />}>清空</Button>
        </Popconfirm>
        <Button icon={<DownloadOutlined />} loading={exportLoading} onClick={handleExport}>导出</Button>
        <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>导入</Button>
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
      </div>

      {/* 标签分组链接卡片 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Text type="secondary">加载中...</Text>
        </div>
      ) : tagNames.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Text type="secondary">暂无链接，点击上方「添加链接」</Text>
        </div>
      ) : (
        tagNames.map((tagName) => {
          const links = groupedLinks[tagName];
          const cols = tagColumns[tagName] ?? 3;
          const tagInfo = tagList.find((t) => t.name === tagName);
          const tagColor = tagInfo?.color;

          return (
            <div key={tagName} style={{ marginBottom: 24 }}>
              {/* 标签标题 */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 12px",
                    borderRadius: 4,
                    background: tagColor || token.colorPrimary,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {tagName}
                </span>
                <Text type="secondary" style={{ fontSize: 12 }}>{links.length} 个链接</Text>
              </div>

              {/* 链接卡片网格 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gap: 12,
                }}
              >
                {links.map((link) => (
                  <Card
                    key={link._id}
                    size="small"
                    hoverable
                    onClick={() => openLink(link)}
                    style={{ cursor: link.url ? "pointer" : "default" }}
                    styles={{
                      body: { padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 },
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <LinkIcon icon={link.icon} url={link.url} />
                      <Text
                        ellipsis
                        style={{ flex: 1, fontSize: 14 }}
                        title={link.title || link.url || "(无标题)"}
                      >
                        {link.title || link.url || "(无标题)"}
                      </Text>
                      {link.hasAccount && (
                        <Tooltip title="有关联账号">
                          <KeyOutlined style={{ color: token.colorWarning, fontSize: 12, flexShrink: 0 }} />
                        </Tooltip>
                      )}
                    </div>
                    {/* 悬浮设置按钮 */}
                    <div
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        opacity: 0,
                        transition: "opacity 0.2s",
                        background: token.colorBgElevated,
                        borderRadius: 6,
                        padding: "2px 4px",
                        boxShadow: token.boxShadowSecondary,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                      className="link-card-actions"
                    >
                      <LinkSettings
                        link={link}
                        customIcons={customIcons}
                        onCopyAndOpen={handleCopyAndOpen}
                        onViewSecrets={handleViewSecrets}
                        onAddToIconLibrary={handleAddToIconLibrary}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* 悬浮显示设置的 CSS 已在模块级注入, 无需重复创建 style 标签 */}

      {/* Add/Edit Link Modal */}
      <Modal
        title={editingLink ? "编辑链接" : "添加链接"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setDuplicateLinks([]); }}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题">
            <Input placeholder="留空则自动从URL生成" />
          </Form.Item>
          <Form.Item name="url" label="链接地址" rules={[{
            validator: (_, value) => {
              if (!value) return Promise.resolve();
              if (/^(https?|ftp|file):\/\//i.test(value)) return Promise.resolve();
              if (/^[A-Za-z]:[\\/]/.test(value)) return Promise.resolve();
              if (value.startsWith("\\\\")) return Promise.resolve();
              if (value.startsWith("/")) return Promise.resolve();
              if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) return Promise.resolve();
              return Promise.reject("请输入有效的网址或本地文件路径");
            }
          }]}>
            <Input
              placeholder="https://... 或 C:\Users\... 或 \\server\share（可留空）"
              onChange={(e) => handleUrlChangeForSearch(e.target.value)}
            />
          </Form.Item>
          {duplicateLinks.length > 0 && (
            <div style={{ marginBottom: 16, padding: "8px 12px", background: token.colorWarningBg, borderRadius: 6, border: `1px solid ${token.colorWarningBorder}` }}>
              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                <Text type="warning"><WarningOutlined /> 发现 {duplicateLinks.length} 条相同地址的已有链接：</Text>
                {duplicateLinks.slice(0, 5).map((dl) => (
                  <Text key={dl._id} style={{ fontSize: 12 }}>
                    • {dl.title || dl.url || "(无标题)"}
                    {dl.tag && <span style={{ marginLeft: 4 }}><span style={{ padding: "0 6px", borderRadius: 4, background: token.colorPrimaryBg, fontSize: 11 }}>{dl.tag}</span></span>}
                  </Text>
                ))}
                {duplicateLinks.length > 5 && <Text type="secondary" style={{ fontSize: 12 }}>...还有 {duplicateLinks.length - 5} 条</Text>}
              </Space>
            </div>
          )}
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.url !== cur.url}>
            {({ getFieldValue }) => {
              const currentUrl = getFieldValue("url");
              return (
                <Form.Item name="icon" label="图标" tooltip="留空则导入时自动分配（网址自动获取官方图标，本地文件使用文件夹图标）">
                  <IconPicker url={currentUrl} />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="tag" label="标签">
            <Select
              placeholder="选择标签"
              allowClear
              options={[
                { label: "其他", value: "其他" },
                ...tagList.map((t) => ({ label: t.name, value: t.name })),
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Tag Management Modal */}
      <TagManager
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        onChanged={() => { loadAllLinks(); }}
      />

      {/* View Secrets Modal */}
      <Modal
        title="账号详情"
        open={viewModalOpen}
        onCancel={() => { setViewModalOpen(false); setSecrets(null); setViewLinkId(null); setAddAccountOpen(false); setEditingAccountId(null); addForm.resetFields(); }}
        footer={null}
        width={800}
      >
        {secrets && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text strong>关联账号</Text>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {secrets.accounts.map((acc) => (
                <div
                  key={acc._id}
                  style={{
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 8,
                    padding: "12px 16px",
                    background: token.colorFillQuaternary,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Space size="middle">
                      {acc.username && (
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 12 }}>用户名:</Text>
                          <Text style={{ maxWidth: 140 }} ellipsis>{acc.username}</Text>
                          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(acc.username!)} />
                        </Space>
                      )}
                      {acc.email && (
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 12 }}>邮箱:</Text>
                          <Text style={{ maxWidth: 140 }} ellipsis>{acc.email}</Text>
                          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(acc.email!)} />
                        </Space>
                      )}
                    </Space>
                    <Space size={0}>
                      <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEditAccount(acc)} title="编辑" />
                      <Popconfirm title="确定删除该账号？" onConfirm={() => handleRemoveAccount(acc._id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除" />
                      </Popconfirm>
                    </Space>
                  </div>
                  <Space size={4}>
                    <Text type="secondary" style={{ fontSize: 12 }}>密码:</Text>
                    <Text code style={{ maxWidth: 200 }} ellipsis>{acc.password}</Text>
                    <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(acc.password)} />
                  </Space>
                  {acc.notes && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>备注: </Text>
                      <Text style={{ fontSize: 12 }}>{acc.notes}</Text>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {addAccountOpen ? (
              <div style={{ border: `1px dashed ${token.colorBorder}`, borderRadius: 6, padding: 12 }}>
                <Text strong style={{ marginBottom: 8, display: "block" }}>
                  {editingAccountId ? "编辑账号" : "添加关联账号"}
                </Text>
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
                    <Button type="primary" onClick={editingAccountId ? handleEditAccountSubmit : handleAddAccountSubmit}>
                      保存
                    </Button>
                    <Button onClick={() => { setAddAccountOpen(false); setEditingAccountId(null); addForm.resetFields(); }}>取消</Button>
                  </Space>
                </Form>
              </div>
            ) : (
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => { setEditingAccountId(null); addForm.resetFields(); setAddAccountOpen(true); }}>
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
