import React, { useEffect, useState } from "react";
import { Avatar, Button, Modal, Popconfirm, Switch, Radio, Select, Typography, theme } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { getSettings, saveSettings } from "../../services/settings";
import type { AppSettings, ThemeMode } from "../../services/settings";
import { useThemeStore } from "../../stores/themeStore";
import { useAuthStore } from "../../stores/authStore";

const { Text } = Typography;

/** 预设字体选项 */
const FONT_OPTIONS = [
  { label: "IBM Plex Mono", value: "IBMPlexMono" },
  { label: "Courier New", value: "'Courier New'" },
  { label: "Consolas", value: "Consolas" },
  { label: "Menlo", value: "Menlo" },
  { label: "Monaco", value: "Monaco" },
  { label: "系统默认", value: "system-ui" },
  { label: "等宽字体", value: "monospace" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const rowBase: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 0",
};

const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { user, logout, fetchUser } = useAuthStore();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  // 分隔线颜色随主题适配 (浅色 #f0f0f0 / 深色 token)
  const rowStyle: React.CSSProperties = { ...rowBase, borderBottom: `1px solid ${token.colorBorderSecondary}` };

  // 打开时刷新本地设置与账号信息 (原侧栏用户信息入口合并至此)
  useEffect(() => {
    if (!open) return;
    setSettings(getSettings());
    fetchUser();
  }, [open]);

  const handleLogout = () => {
    logout();
    onClose();
    navigate("/login", { replace: true });
  };

  const handleRemember = (checked: boolean) => {
    // 关闭记住密码时联动关闭自动登录
    setSettings(saveSettings({ rememberPassword: checked, autoLogin: checked ? settings.autoLogin : false }));
  };

  const handleAutoLogin = (checked: boolean) => {
    // 开启自动登录时联动开启记住密码
    setSettings(saveSettings({ autoLogin: checked, rememberPassword: checked ? true : settings.rememberPassword }));
  };

  return (
    <Modal title="设置" open={open} onCancel={onClose} footer={null} width={440} destroyOnClose>
      {/* 账号信息: 当前登录用户名与注册邮箱 */}
      <div style={rowStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Avatar
            size={40}
            style={{ backgroundColor: token.colorPrimary, flexShrink: 0 }}
            icon={<UserOutlined />}
          />
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 15 }}>{user?.username || "未登录"}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12, wordBreak: "break-all" }}>
              注册邮箱：{user?.email || "未设置"}
            </Text>
          </div>
        </div>
      </div>
      <div style={rowStyle}>
        <div>
          <Text strong>外观主题</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            跟随系统时背景色随系统深浅色自动切换
          </Text>
        </div>
        <Radio.Group
          value={themeMode}
          onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
          optionType="button"
          buttonStyle="solid"
          size="small"
          options={[
            { label: "跟随系统", value: "system" },
            { label: "浅色", value: "light" },
            { label: "深色", value: "dark" },
          ]}
        />
      </div>
      <div style={rowStyle}>
        <div>
          <Text strong>记住密码</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            本地保存账号密码，下次登录自动回填
          </Text>
        </div>
        <Switch checked={settings.rememberPassword} onChange={handleRemember} />
      </div>
      <div style={rowStyle}>
        <div>
          <Text strong>字体</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            全局字体，留空使用默认字体
          </Text>
        </div>
        <Select
          mode="tags"
          tokenSeparators={[","]}
          placeholder="默认字体"
          value={settings.fontFamily ? settings.fontFamily.split(",").map((s) => s.trim()).filter(Boolean) : []}
          onChange={(vals) => {
            const fontFamily = vals.join(", ");
            setSettings(saveSettings({ fontFamily }));
          }}
          options={FONT_OPTIONS}
          style={{ width: 220 }}
          maxTagCount="responsive"
          allowClear
          onClear={() => setSettings(saveSettings({ fontFamily: "" }))}
        />
      </div>
      <div style={rowStyle}>
        <div>
          <Text strong>自动登录</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            打开应用时使用已保存的密码自动登录
          </Text>
        </div>
        <Switch checked={settings.autoLogin} onChange={handleAutoLogin} />
      </div>
      {/* 退出登录 (原侧栏用户下拉入口合并至此) */}
      <div style={{ ...rowStyle, borderBottom: "none" }}>
        <div>
          <Text strong>退出登录</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            清除本机登录状态，返回登录页
          </Text>
        </div>
        <Popconfirm
          title="确定退出登录？"
          description="本地保存的账号密码不会被删除"
          okText="退出"
          cancelText="取消"
          placement="topRight"
          onConfirm={handleLogout}
        >
          <Button danger icon={<LogoutOutlined />}>退出登录</Button>
        </Popconfirm>
      </div>
    </Modal>
  );
};

export default SettingsModal;
