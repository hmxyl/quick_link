import React, { useEffect, useState } from "react";
import { Modal, Switch, Radio, message, Typography, theme } from "antd";
import { getSettings, saveSettings, isDesktop } from "../../services/settings";
import type { AppSettings, ThemeMode } from "../../services/settings";
import { useThemeStore } from "../../stores/themeStore";

const { Text } = Typography;

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
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false);
  const desktop = isDesktop();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { token } = theme.useToken();
  // 分隔线颜色随主题适配 (浅色 #f0f0f0 / 深色 token)
  const rowStyle: React.CSSProperties = { ...rowBase, borderBottom: `1px solid ${token.colorBorderSecondary}` };

  // 打开时刷新本地设置; 桌面环境下读取系统开机自启状态
  useEffect(() => {
    if (!open) return;
    setSettings(getSettings());
    if (window.quicklink) {
      window.quicklink
        .getAutoLaunch()
        .then(setAutoLaunch)
        .catch(() => setAutoLaunch(false));
    }
  }, [open]);

  const handleAutoLaunch = async (checked: boolean) => {
    if (!window.quicklink) return;
    setAutoLaunchLoading(true);
    try {
      await window.quicklink.setAutoLaunch(checked);
      setAutoLaunch(checked);
      saveSettings({ autoLaunch: checked });
    } catch {
      message.error("设置开机自启动失败");
    } finally {
      setAutoLaunchLoading(false);
    }
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
          <Text strong>开机自启动</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {desktop ? "随 Windows 开机自动启动 QuickLink" : "仅桌面版支持"}
          </Text>
        </div>
        <Switch
          checked={autoLaunch}
          disabled={!desktop}
          loading={autoLaunchLoading}
          onChange={handleAutoLaunch}
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
      <div style={{ ...rowStyle, borderBottom: "none" }}>
        <div>
          <Text strong>自动登录</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            打开应用时使用已保存的密码自动登录
          </Text>
        </div>
        <Switch checked={settings.autoLogin} onChange={handleAutoLogin} />
      </div>
    </Modal>
  );
};

export default SettingsModal;
