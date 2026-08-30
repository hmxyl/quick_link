import React, { useState } from "react";
import { Form, Input, Button, Card, message, Typography, Modal, Checkbox, Row, Col } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { authApi } from "../../services/api";
import { getSettings, saveSettings, getSavedCredentials } from "../../services/settings";

const { Title } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  // 记住密码: 回填上次保存的凭据
  const initialSettings = getSettings();
  const savedCred = initialSettings.rememberPassword ? getSavedCredentials() : null;
  const [remember, setRemember] = useState(initialSettings.rememberPassword);
  const [autoLogin, setAutoLogin] = useState(initialSettings.autoLogin);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotForm] = Form.useForm();

  // 已登录 (含自动登录成功) 直接跳转主界面 (须在所有 hooks 之后)
  if (isAuthenticated) return <Navigate to="/" replace />;

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      // 先落地设置, login 内部根据 rememberPassword 决定是否保存凭据
      saveSettings({ rememberPassword: remember, autoLogin: remember ? autoLogin : false });
      await login(values.username, values.password);
      message.success("登录成功");
      navigate("/");
    } catch (err: any) {
      message.error(err.response?.data?.error || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    try {
      const values = await forgotForm.validateFields();
      setForgotLoading(true);
      const res = await authApi.resetLoginPassword(values.username, values.email, values.newPassword);
      message.success(res.message || "密码重置成功，请使用新密码登录");
      setForgotOpen(false);
      forgotForm.resetFields();
    } catch (err: any) {
      if (err.response?.data?.error) message.error(err.response.data.error);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: "center", marginBottom: 32 }}>
          QuickLink
        </Title>
        <Form
          onFinish={onFinish}
          size="large"
          initialValues={{ username: savedCred?.username || "", password: savedCred?.password || "" }}
        >
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Row justify="space-between">
              <Col>
                <Checkbox
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    if (!e.target.checked) setAutoLogin(false);
                  }}
                >
                  记住密码
                </Checkbox>
              </Col>
              <Col>
                <Checkbox
                  checked={autoLogin}
                  onChange={(e) => {
                    setAutoLogin(e.target.checked);
                    if (e.target.checked) setRemember(true);
                  }}
                >
                  自动登录
                </Checkbox>
              </Col>
            </Row>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
          <div style={{ textAlign: "center", display: "flex", justifyContent: "center", gap: 16 }}>
            <a onClick={() => setForgotOpen(true)}>忘记密码？</a>
            <span>还没有账号？ <Link to="/register">立即注册</Link></span>
          </div>
        </Form>
      </Card>

      {/* Forgot password modal */}
      <Modal
        title="找回密码"
        open={forgotOpen}
        onCancel={() => setForgotOpen(false)}
        onOk={handleForgotSubmit}
        okText="重置密码"
        confirmLoading={forgotLoading}
        destroyOnClose
      >
        <Form form={forgotForm} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="email" label="注册邮箱" rules={[{ required: true, type: "email", message: "请输入注册邮箱" }]}>
            <Input prefix={<MailOutlined />} placeholder="注册时使用的邮箱" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 8, message: "密码至少 8 位" },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请确认新密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) return Promise.resolve();
                  return Promise.reject(new Error("两次密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LoginPage;
