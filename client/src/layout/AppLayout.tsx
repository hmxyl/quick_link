import React, { useState } from "react";
import { Layout, Menu, Button, Dropdown, Typography, theme } from "antd";
import {
  LinkOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileMarkdownOutlined,
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import SettingsModal from "../modules/user/SettingsModal";

const { Sider, Content } = Layout;
const { Text } = Typography;

// 侧栏收起状态的持久化键
const SIDER_COLLAPSED_KEY = "quicklink:siderCollapsed";

const bottomBtnStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.65)",
  height: 44,
};

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { token } = theme.useToken();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 初始值读取上次保存的状态
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDER_COLLAPSED_KEY) === "1"
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem(SIDER_COLLAPSED_KEY, prev ? "0" : "1");
      return !prev;
    });
  };

  const menuItems = [
    { key: "/links", icon: <LinkOutlined />, label: "链接管理" },
    { key: "/notes", icon: <FileMarkdownOutlined />, label: "笔记管理" },
  ];

  const userMenu = {
    items: [
      { key: "logout", icon: <LogoutOutlined />, label: "退出登录", onClick: () => { logout(); navigate("/login"); } },
    ],
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        trigger={null}
        collapsedWidth={60}
        style={{ position: "relative" }}
      >
        <div style={{ padding: "16px", textAlign: "center" }}>
          <Text strong style={{ color: "#fff", fontSize: 18 }}>
            {collapsed ? "QL" : "QuickLink"}
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ paddingBottom: 136 }}
        />
        {/* 底部操作区: 设置 / 用户信息 / 收起展开 */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Button
            type="text"
            block
            title="设置"
            icon={<SettingOutlined />}
            onClick={() => setSettingsOpen(true)}
            style={bottomBtnStyle}
          />
          <Dropdown menu={userMenu} placement="topRight" trigger={["click"]}>
            <Button type="text" block title={user?.username} style={bottomBtnStyle}>
              {collapsed ? <UserOutlined /> : <><UserOutlined /> {user?.username}</>}
            </Button>
          </Dropdown>
          <Button
            type="text"
            block
            title={collapsed ? "展开导航" : "收起导航"}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleCollapsed}
            style={bottomBtnStyle}
          />
        </div>
      </Sider>
      <Layout>
        <Content style={{ margin: 24, padding: 24, background: token.colorBgContainer, borderRadius: 8, minHeight: 360 }}>
          <Outlet />
        </Content>
      </Layout>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Layout>
  );
};

export default AppLayout;
