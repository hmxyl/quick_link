import React, { useState } from "react";
import { Form, Input, Button, Card, message, Typography, theme } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { BrandMark } from "./LoginPage";

const { Title, Text } = Typography;

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const isDark = useThemeStore((s) => s.isDark);

  const onFinish = async (values: {
    username: string;
    email: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      await register(values.username, values.email, values.password);
      message.success("注册成功");
      navigate("/");
    } catch (err: any) {
      message.error(err.response?.data?.error || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: 24,
        // 与登录页同一视觉语言: 浅色淡蓝渐变 / 深色暗底 + 品牌色光晕
        background: isDark
          ? "radial-gradient(ellipse 80% 55% at 50% 18%, rgba(22, 119, 255, 0.16), transparent 70%), #0a0a0c"
          : "linear-gradient(165deg, #f5f8ff 0%, #edf2f9 55%, #e6f4ff 100%)",
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: 12,
          border: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: isDark ? "0 16px 40px rgba(0, 0, 0, 0.45)" : "0 16px 40px rgba(22, 60, 130, 0.10)",
        }}
        styles={{ body: { padding: "36px 36px 28px" } }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <BrandMark />
          <Title level={3} style={{ marginTop: 18, marginBottom: 4 }}>
            创建账号
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            注册后即可使用链接、笔记与接口管理
          </Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, type: "email", message: "请输入有效的邮箱地址" }]}>
            <Input prefix={<MailOutlined />} placeholder="邮箱" autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少8个字符" },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码（至少 8 位）" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请确认密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject(new Error("两次密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              注册
            </Button>
          </Form.Item>
          <div style={{ textAlign: "center" }}>
            已有账号？ <Link to="/login">立即登录</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default RegisterPage;
