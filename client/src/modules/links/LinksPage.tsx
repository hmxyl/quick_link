import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, Form, Input, Space, message, Popconfirm, Select, Typography, theme, Tooltip, Card, ColorPicker, Skeleton, Empty } from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  KeyOutlined, CopyOutlined, ExportOutlined,
  DownloadOutlined, UploadOutlined, TagsOutlined, SyncOutlined,
  WarningOutlined, BgColorsOutlined,
} from "@ant-design/icons";
import { linkApi, customIconApi, presetColorApi } from "../../services/api";
import type { CustomIcon } from "../../services/api";
import { LinkIcon, IconPicker } from "./LinkIcon";
import TagManager from "./TagManager";
import ColorManager from "./ColorManager";
import type { Link, Tag as TagType, AccountSecrets, PresetColor } from "../../types";

const { Text } = Typography;

// 链接卡片悬浮 CSS (模块级一次性注入, 避免每次渲染创建新 style 标签)
// 操作栏与链接信息同一行, 采用「抽屉」式: 不悬浮时 max-width:0 + overflow:hidden
// 完全收起 (标题占满行宽, 卡片无空置区域), 悬浮时展开到自身自然宽度——flex 布局
// 同步压缩标题省略号, 因此不遮挡链接信息、收起时不可点击; 位置与宽度随过渡平滑
// 动画 (max-width 动画, 免去逐卡实测). 删除 Popconfirm 弹出期间挂 .link-card-pinned
// 保持展开, 鼠标移到弹层 (body 门户) 也不会收起错位。
// .link-card-dark: 用户设置深色背景色时切换浅色文字与按钮, 保证 WCAG 可读性
// (antd v5 组件规则用 :where() 包裹, 特异性为 0, 这里的普通选择器必然覆盖成功)。
const LINK_CARD_CSS = `
  .link-card-actions {
    max-width: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-width 0.2s ease, opacity 0.2s ease;
  }
  .ant-card-hoverable:hover .link-card-actions,
  .link-card-pinned .link-card-actions {
    max-width: 160px;
    opacity: 1 !important;
  }
  .ant-card-hoverable.link-card {
    transition: box-shadow 0.2s ease, transform 0.15s ease, border-color 0.2s ease, background-color 0.25s ease;
  }
  .ant-card-hoverable.link-card:hover {
    transform: translateY(-1px);
  }
  .ant-card-hoverable.link-card:active {
    transform: translateY(0) scale(0.985);
  }
  .link-card-dark .ant-typography {
    color: rgba(255, 255, 255, 0.92) !important;
  }
  .link-card-dark .ant-btn {
    color: rgba(255, 255, 255, 0.72);
  }
  .link-card-dark .ant-btn:hover,
  .link-card-dark .ant-btn:focus-visible {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
`;
if (typeof document !== "undefined" && !document.querySelector('[data-ql-links]')) {
  const style = document.createElement("style");
  style.setAttribute("data-ql-links", "");
  style.textContent = LINK_CARD_CSS;
  document.head.appendChild(style);
}

// 打开链接: http(s) 直接新标签页打开; file:// 无法从 http 页面打开 (浏览器安全策略拦截,
// 原先依赖的 Electron shell.openExternal 已随桌面版移除), 改为复制真实本地路径供粘贴到资源管理器。
// 返回是否已成功打开, 供调用方决定提示文案。
const openLinkUrl = (url: string): boolean => {
  if (!url.startsWith("file://")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  // file:///C:/x -> C:/x; file:////server/share -> //server/share (资源管理器地址栏可识别)
  const localPath = decodeURIComponent(url.replace(/^file:\/\//, "").replace(/^\/(?=[A-Za-z]:)/, ""));
  navigator.clipboard.writeText(localPath);
  message.info("浏览器无法直接打开本地文件，路径已复制到剪贴板");
  return false;
};

// 判断十六进制背景色是否偏深 (WCAG 相对亮度 < 0.35), 深色背景时卡片切换浅色文字保证可读性。
// 支持 #RGB/#RGBA/#RRGGBB/#RRGGBBAA (与服务端 sanitizeBackgroundColor 允许的格式一致)。
const isDarkColor = (hex: string): boolean => {
  const m = hex.replace("#", "");
  const full = m.length === 3 || m.length === 4 ? m.slice(0, 3).split("").map((c) => c + c).join("") : m.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => Number.isNaN(v))) return false;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L < 0.35;
};

// 色值比较键: 3/4 位简写展开为 6 位并忽略大小写, 使 #F60 与 #ff6600 视为同一颜色
const normalizeHexKey = (hex: string): string => {
  const m = hex.replace("#", "").toLowerCase();
  const full = m.length === 3 || m.length === 4 ? m.slice(0, 3).split("").map((c) => c + c).join("") : m.slice(0, 6);
  return `#${full}`;
};

// 链接卡片悬浮设置按钮 (提取到组件外部, 避免每次渲染时重新定义导致完全卸载/重建)
interface LinkSettingsProps {
  link: Link;
  customIcons: CustomIcon[];
  onCopyAndOpen: (url: string) => void;
  onViewSecrets: (id: string) => void;
  onAddToIconLibrary: (link: Link) => void;
  onEdit: (link: Link) => void;
  onDelete: (id: string) => void;
  // 删除确认弹层开合回调: 弹出期间由外层挂 .link-card-pinned 保持操作栏展开,
  // 鼠标移向弹层 (渲染在 body) 时操作栏不收起, 弹层锚点不漂移
  onPopoverChange?: (open: boolean) => void;
}

const LinkSettings: React.FC<LinkSettingsProps> = ({
  link,
  customIcons,
  onCopyAndOpen,
  onViewSecrets,
  onAddToIconLibrary,
  onEdit,
  onDelete,
  onPopoverChange,
}) => {
  const hasUrlIcon = link.icon && /^https?:\/\//i.test(link.icon);
  const isInLibrary = hasUrlIcon && customIcons.some((c) => c.url === link.icon);
  return (
    // 不设 wrap: 抽屉展开动画期间按钮保持单行 (换行会导致收起时高度堆叠)
    <Space size={4}>
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
      <Popconfirm
        title="确定删除此链接？"
        onConfirm={(e) => { e?.stopPropagation(); onDelete(link._id); }}
        onOpenChange={(open) => onPopoverChange?.(open)}
      >
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
  // 预设背景色色板 (背景色管理维护, 表单快捷选用)
  const [presetColors, setPresetColors] = useState<PresetColor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // 防抖搜索值: 输入停顿 300ms 后才触发 API 请求
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [colorManagerOpen, setColorManagerOpen] = useState(false);
  // 删除确认弹层展开的卡片 id: 弹层期间挂 .link-card-pinned 保持操作栏展开
  const [pinnedLinkId, setPinnedLinkId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form] = Form.useForm();

  // 表单当前背景色 (色板选中态与「存为预设」判定): 值可能为 string / Color 对象 / null(清除)
  const watchedBg: any = Form.useWatch("backgroundColor", form);
  const currentBgHex: string | null = (() => {
    const v: any = watchedBg;
    if (v == null || v.cleared) return null;
    if (typeof v === "string") return v.toLowerCase();
    const hex = typeof v.toHexString === "function" ? v.toHexString() : null;
    return hex ? hex.toLowerCase() : null;
  })();
  // 现选色是否已存在预设 (3/4 位简写与 6 位展开形式视为同一颜色)
  const isCurrentInPresets =
    !!currentBgHex &&
    presetColors.some((p) => normalizeHexKey(p.color) === normalizeHexKey(currentBgHex));

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

  const loadPresetColors = useCallback(async () => {
    try {
      const res = await presetColorApi.list();
      setPresetColors(res.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCustomIcons(); }, []);
  useEffect(() => { loadPresetColors(); }, [loadPresetColors]);
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
      backgroundColor: record.backgroundColor ?? null,
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
      // 背景色: 表单值为字符串 (未改动) 或 Color 对象 (新选择);
      // 点击清除时为 cleared 标记的 Color 对象, 统一转为十六进制字符串或 null (清除)
      const bgVal: any = values.backgroundColor;
      const bgColor =
        bgVal == null || bgVal.cleared
          ? null
          : typeof bgVal === "string"
            ? bgVal
            : (bgVal.toHexString?.() ?? null);
      const payload = { url, title, description, icon, tag, backgroundColor: bgColor };

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
    if (openLinkUrl(url)) {
      navigator.clipboard.writeText(url);
      message.success("地址已复制，并在新标签页打开");
    }
  };

  const handleClearAll = async () => {
    try {
      const res = await linkApi.clearAll();
      message.success(res.message || "数据已清空");
      loadAllLinks();
    } catch (err: any) {
      // 透出服务端真实错误 (鉴权/服务端异常), 便于定位而不是笼统的"清空失败"
      message.error(err?.response?.data?.error || "清空失败");
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
      const importColors: any[] = Array.isArray(parsed.linkColors) ? parsed.linkColors : [];
      if (items.length === 0) {
        message.warning("导入文件中没有链接数据");
        return;
      }
      const res = await linkApi.batchImport(items, importIcons, importTags, importColors);
      message.success(res.message || `成功导入 ${res.data?.count ?? items.length} 条链接`);
      loadAllLinks();
      loadCustomIcons();
      loadPresetColors();
    } catch {
      message.error("导入失败：文件格式无效");
    } finally {
      e.target.value = "";
    }
  };

  const handleSaveAsPreset = async () => {
    if (!currentBgHex) return;
    try {
      await presetColorApi.add(currentBgHex);
      message.success("已存为预设");
      await loadPresetColors();
    } catch (err: any) {
      message.error(err.response?.data?.error || "保存失败");
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
    openLinkUrl(link.url);
  };

  // 链接卡片设置菜单 (悬浮显示) - 使用外部定义的稳定组件引用

  // 获取所有标签名: 优先按标签管理中的排序 (tagList 已按 sortOrder 排序),
  // 再追加未在标签列表中的分组 (如 "其他" 或遗留标签)
  const tagNames = useMemo(() => {
    const present = new Set(Object.keys(groupedLinks));
    const ordered: string[] = [];
    for (const t of tagList) {
      if (present.has(t.name)) {
        ordered.push(t.name);
        present.delete(t.name);
      }
    }
    // 剩余未匹配到标签列表的分组
    for (const name of Object.keys(groupedLinks)) {
      if (present.has(name)) ordered.push(name);
    }
    return ordered;
  }, [groupedLinks, tagList]);

  return (
    <div>
      {/* 顶部工具栏: 窄窗口自动换行, 搜索框保底宽度 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap", rowGap: 8 }}>
        <Input.Search
          placeholder="搜索链接..."
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => setSearch(v)}
          style={{ flex: 1, minWidth: 200 }}
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
        <Button icon={<BgColorsOutlined />} onClick={() => setColorManagerOpen(true)}>背景色管理</Button>
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
        /* 骨架屏占位: 与真实卡片同网格结构, 加载完成无布局跳动 */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} size="small" styles={{ body: { padding: "8px 16px 12px", display: "flex", flexDirection: "column", gap: 10 } }}>
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </div>
      ) : tagNames.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={debouncedSearch ? "没有找到匹配的链接，换个关键词试试" : "暂无链接"}
          >
            {!debouncedSearch && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                添加第一条链接
              </Button>
            )}
          </Empty>
        </div>
      ) : (
        tagNames.map((tagName) => {
          const links = groupedLinks[tagName];
          const cols = tagColumns[tagName] ?? 5;
          const tagInfo = tagList.find((t) => t.name === tagName);
          const tagColor = tagInfo?.color;
          // 标签色偏浅时切换深色文字 (默认主题蓝按深色处理)
          const tagDark = !tagColor || isDarkColor(tagColor);

          return (
            <div key={tagName} style={{ marginBottom: 24 }}>
              {/* 标签标题: 胶囊徽章 + 计数 */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 14px",
                    borderRadius: 999,
                    background: tagColor || token.colorPrimary,
                    color: tagDark ? "#fff" : "rgba(0, 0, 0, 0.88)",
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: 0.3,
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
                {links.map((link) => {
                  // 深色背景色时挂 .link-card-dark, 标题/操作按钮自动切浅色 (见 LINK_CARD_CSS)
                  const bgDark = !!link.backgroundColor && isDarkColor(link.backgroundColor);
                  return (
                  <Card
                    key={link._id}
                    size="small"
                    hoverable
                    className={`link-card${bgDark ? " link-card-dark" : ""}${
                      pinnedLinkId === link._id ? " link-card-pinned" : ""
                    }`}
                    onClick={(e) => {
                      // 仅当点击确实落在卡片自身 DOM 内才打开链接: Popconfirm/Modal
                      // 等弹层 portal 到 body, 其点击会沿 React 树冒泡到卡片的
                      // onClick, 但 e.target 在卡片之外——必须排除 (否则点删除确
                      // 认弹层的「取消」等会误开链接新标签页)
                      if (e.target instanceof Node && e.currentTarget.contains(e.target)) openLink(link);
                    }}
                    style={{
                      cursor: link.url ? "pointer" : "default",
                      background: link.backgroundColor || undefined,
                      // 网格项 min-width 归零: 长标题的固有宽度不再撑大 1fr 轨道,
                      // 超出部分交给标题省略号 (配合行内 Text 的 minWidth:0)
                      minWidth: 0,
                    }}
                    styles={{ body: { padding: "10px 16px" } }}
                  >
                    {/* 链接信息 + 同行悬浮操作栏 (抽屉式):
                        不悬浮时操作栏 max-width:0 完全收起——标题占满行宽, 卡片无
                        空置区域; 悬浮时展开到自然宽度, 标题同步收缩省略, 不悬浮时
                        收起状态下按钮被裁剪不可点击 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <LinkIcon icon={link.icon} url={link.url} />
                      <Text
                        ellipsis
                        style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500 }}
                        title={link.title || link.url || "(无标题)"}
                      >
                        {link.title || link.url || "(无标题)"}
                      </Text>
                      {link.hasAccount && (
                        <Tooltip title="有关联账号">
                          <KeyOutlined style={{ color: token.colorWarning, fontSize: 12, flexShrink: 0 }} />
                        </Tooltip>
                      )}
                      <div
                        className="link-card-actions"
                        style={{ display: "flex", alignItems: "center" }}
                      >
                        <LinkSettings
                          link={link}
                          customIcons={customIcons}
                          onCopyAndOpen={handleCopyAndOpen}
                          onViewSecrets={handleViewSecrets}
                          onAddToIconLibrary={handleAddToIconLibrary}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onPopoverChange={(open) => setPinnedLinkId(open ? link._id : null)}
                        />
                      </div>
                    </div>
                  </Card>
                  );
                })}
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
          <Form.Item label="背景色" tooltip="链接卡片背景色：点击下方预设色板快速选择，或用取色器自定义；留空使用默认背景">
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Form.Item name="backgroundColor" noStyle>
                <ColorPicker allowClear showText format="hex" />
              </Form.Item>
              {/* 预设色板: 默认色 + 背景色管理维护的预设 + 管理/存为预设入口 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Tooltip title="默认背景">
                  <button
                    type="button"
                    aria-label="使用默认背景"
                    onClick={() => form.setFieldValue("backgroundColor", null)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      cursor: "pointer",
                      padding: 0,
                      border: `1px dashed ${token.colorTextQuaternary}`,
                      background: `linear-gradient(135deg, transparent 44%, ${token.colorTextTertiary} 44%, ${token.colorTextTertiary} 56%, transparent 56%)`,
                      boxShadow: currentBgHex == null ? `0 0 0 2px ${token.colorBgContainer}, 0 0 0 4px ${token.colorPrimary}` : undefined,
                    }}
                  />
                </Tooltip>
                {presetColors.map((p) => {
                  const selected = !!currentBgHex && normalizeHexKey(p.color) === normalizeHexKey(currentBgHex);
                  return (
                    <Tooltip key={p._id} title={p.color}>
                      <button
                        type="button"
                        aria-label={`背景色 ${p.color}`}
                        onClick={() => form.setFieldValue("backgroundColor", p.color)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: p.color,
                          // 描边走 token: 浅/深色下都可见 (硬编码黑色半透明在深色主题下不可见)
                          border: `1px solid ${token.colorBorder}`,
                          cursor: "pointer",
                          padding: 0,
                          boxShadow: selected ? `0 0 0 2px ${token.colorBgContainer}, 0 0 0 4px ${token.colorPrimary}` : undefined,
                        }}
                      />
                    </Tooltip>
                  );
                })}
                <a style={{ fontSize: 12, marginLeft: 4 }} onClick={() => setColorManagerOpen(true)}>
                  管理
                </a>
                {currentBgHex && !isCurrentInPresets && (
                  <a style={{ fontSize: 12 }} onClick={handleSaveAsPreset}>
                    存为预设
                  </a>
                )}
              </div>
            </Space>
          </Form.Item>
          <Form.Item name="tag" label="标签">
            <Select
              placeholder="选择标签"
              allowClear
              options={Array.from(
                new Set(["其他", ...tagList.map((t) => t.name)])
              ).map((name) => ({ label: name, value: name }))}
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

      {/* Preset Color Management Modal */}
      <ColorManager
        open={colorManagerOpen}
        onClose={() => setColorManagerOpen(false)}
        onChanged={() => { loadPresetColors(); }}
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
