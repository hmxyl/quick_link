import React from "react";
import { theme } from "antd";
import {
  LinkOutlined, GlobalOutlined, GithubOutlined, FileTextOutlined, FolderOutlined,
  VideoCameraOutlined, ShoppingCartOutlined, MailOutlined, SoundOutlined, DatabaseOutlined,
  CodeOutlined, CloudOutlined, BookOutlined, PictureOutlined, HomeOutlined,
  ToolOutlined, SafetyOutlined, RocketOutlined, StarOutlined, HeartOutlined,
  BankOutlined, CarOutlined, CoffeeOutlined, GiftOutlined, MedicineBoxOutlined,
} from "@ant-design/icons";

// Default icon library (25 icons, synced with server BUILTIN_ICONS)
export const ICON_LIBRARY: { name: string; label: string; Icon: React.ComponentType<any>; color: string }[] = [
  { name: "link", label: "链接", Icon: LinkOutlined, color: "#1677ff" },
  { name: "globe", label: "网页", Icon: GlobalOutlined, color: "#13c2c2" },
  { name: "github", label: "GitHub", Icon: GithubOutlined, color: "#444444" },
  { name: "file", label: "文件", Icon: FileTextOutlined, color: "#fa8c16" },
  { name: "folder", label: "文件夹", Icon: FolderOutlined, color: "#faad14" },
  { name: "video", label: "视频", Icon: VideoCameraOutlined, color: "#eb2f96" },
  { name: "shopping", label: "购物", Icon: ShoppingCartOutlined, color: "#f5222d" },
  { name: "mail", label: "邮件", Icon: MailOutlined, color: "#2f54eb" },
  { name: "music", label: "音乐", Icon: SoundOutlined, color: "#722ed1" },
  { name: "database", label: "数据库", Icon: DatabaseOutlined, color: "#52c41a" },
  { name: "code", label: "代码", Icon: CodeOutlined, color: "#1890ff" },
  { name: "cloud", label: "云存储", Icon: CloudOutlined, color: "#13c2c2" },
  { name: "book", label: "书籍", Icon: BookOutlined, color: "#722ed1" },
  { name: "picture", label: "图片", Icon: PictureOutlined, color: "#eb2f96" },
  { name: "home", label: "首页", Icon: HomeOutlined, color: "#fa8c16" },
  { name: "tool", label: "工具", Icon: ToolOutlined, color: "#595959" },
  { name: "safety", label: "安全", Icon: SafetyOutlined, color: "#52c41a" },
  { name: "rocket", label: "火箭", Icon: RocketOutlined, color: "#f5222d" },
  { name: "star", label: "收藏", Icon: StarOutlined, color: "#faad14" },
  { name: "heart", label: "喜欢", Icon: HeartOutlined, color: "#eb2f96" },
  { name: "bank", label: "银行", Icon: BankOutlined, color: "#cf1322" },
  { name: "car", label: "汽车", Icon: CarOutlined, color: "#1890ff" },
  { name: "coffee", label: "咖啡", Icon: CoffeeOutlined, color: "#874c27" },
  { name: "gift", label: "礼物", Icon: GiftOutlined, color: "#eb2f96" },
  { name: "medicine", label: "医疗", Icon: MedicineBoxOutlined, color: "#52c41a" },
];

// Render a link icon: URL favicon (img) or built-in Ant Design icon
export const LinkIcon: React.FC<{ icon?: string; url?: string; size?: number }> = ({ icon, url, size = 16 }) => {
  const [imgError, setImgError] = React.useState(false);
  const isUrlIcon = !!icon && /^https?:\/\//i.test(icon);

  if (isUrlIcon && !imgError) {
    return (
      <img
        src={icon}
        onError={() => setImgError(true)}
        style={{ width: size, height: size, borderRadius: 3, verticalAlign: "middle" }}
        alt=""
      />
    );
  }

  const fallbackName = url?.startsWith("file://") ? "folder" : "globe";
  const entry = ICON_LIBRARY.find((i) => i.name === icon) || ICON_LIBRARY.find((i) => i.name === fallbackName)!;
  const { Icon, color } = entry;
  return <Icon style={{ color, fontSize: size }} />;
};

// Icon picker for the link form (controlled by antd Form.Item)
// Accepts optional `url` prop to fetch favicon from the current URL
// Accepts optional `customIcons` prop to display user's custom icons
export const IconPicker: React.FC<{
  value?: string;
  onChange?: (value: string | undefined) => void;
  url?: string;
  customIcons?: { _id: string; url: string; label?: string }[];
}> = ({ value, onChange, url, customIcons = [] }) => {
  const [imgError, setImgError] = React.useState(false);
  const [faviconUrl, setFaviconUrl] = React.useState<string | null>(null);
  const [faviconLoading, setFaviconLoading] = React.useState(false);
  const [faviconChecked, setFaviconChecked] = React.useState<string | null>(null); // track which URL we already checked
  const { token } = theme.useToken();
  const isUrlIcon = !!value && /^https?:\/\//i.test(value);

  // Fetch favicon when URL changes
  React.useEffect(() => {
    if (!url || !/^https?:\/\//i.test(url)) {
      setFaviconUrl(null);
      return;
    }
    // Avoid re-fetching the same URL
    if (faviconChecked === url) return;
    setFaviconChecked(url);
    setFaviconLoading(true);
    try {
      const origin = new URL(url).origin;
      const icoUrl = origin + "/favicon.ico";
      // Probe the favicon
      const img = new Image();
      img.onload = () => {
        setFaviconUrl(icoUrl);
        setFaviconLoading(false);
      };
      img.onerror = () => {
        setFaviconUrl(null);
        setFaviconLoading(false);
      };
      img.src = icoUrl;
    } catch {
      setFaviconLoading(false);
    }
  }, [url, faviconChecked]);

  // Show favicon as first option if available and not already selected
  const showFaviconOption = faviconUrl && !faviconLoading && value !== faviconUrl;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {isUrlIcon && !imgError && (
        <div
          onClick={() => onChange?.(value)}
          title="官方图标"
          style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px solid ${token.colorPrimary}`, borderRadius: 6, cursor: "pointer", background: token.colorBgContainer,
          }}
        >
          <img src={value} onError={() => setImgError(true)} style={{ width: 20, height: 20, borderRadius: 3 }} alt="官方图标" />
        </div>
      )}
      {showFaviconOption && (
        <div
          onClick={() => onChange?.(faviconUrl)}
          title="点击添加当前网址图标"
          style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px dashed ${token.colorPrimary}`, borderRadius: 6, cursor: "pointer", background: token.colorPrimaryBg,
          }}
        >
          <img src={faviconUrl} style={{ width: 20, height: 20, borderRadius: 3 }} alt="网址图标" />
        </div>
      )}
      {faviconLoading && (
        <div
          title="正在获取网址图标..."
          style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px dashed ${token.colorBorderSecondary}`, borderRadius: 6, color: token.colorTextSecondary, fontSize: 12,
          }}
        >
          ...
        </div>
      )}
      {/* Custom icons from user's library */}
      {customIcons.map(({ _id, url: iconUrl, label }) => (
        <div
          key={_id}
          onClick={() => onChange?.(value === iconUrl ? undefined : iconUrl)}
          title={label || "自定义图标"}
          style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            border: value === iconUrl ? `2px solid ${token.colorPrimary}` : `2px solid ${token.colorSuccess}`,
            borderRadius: 6, cursor: "pointer", background: value === iconUrl ? token.colorPrimaryBg : token.colorBgContainer,
          }}
        >
          <img src={iconUrl} style={{ width: 20, height: 20, borderRadius: 3 }} alt={label || "自定义图标"} />
        </div>
      ))}
      {ICON_LIBRARY.map(({ name, label, Icon, color }) => (
        <div
          key={name}
          onClick={() => onChange?.(value === name ? undefined : name)}
          title={label}
          style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            border: value === name ? `2px solid ${token.colorPrimary}` : `2px solid ${token.colorBorderSecondary}`,
            borderRadius: 6, cursor: "pointer", background: value === name ? token.colorPrimaryBg : token.colorBgContainer,
          }}
        >
          <Icon style={{ fontSize: 18, color }} />
        </div>
      ))}
    </div>
  );
};
