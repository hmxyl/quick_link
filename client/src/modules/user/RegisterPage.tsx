import React, { useState } from "react";
import { Form, Input, Button, Card, message, Typography } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

const { Title } = Typography;

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

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
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: "center", marginBottom: 32 }}>
          创建账号
        </Title>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, type: "email", message: "请输入有效的邮箱地址" }]}>
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少8个字符" },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
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
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>
          <Form.Item>
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
