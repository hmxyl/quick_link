import React, { useState } from "react";
import { Button, Empty, Spin, Tabs, Tag, theme, Typography } from "antd";
import { ClockCircleOutlined, DatabaseOutlined, FormatPainterOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface ResponseData {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
  size: number;
}

interface Props {
  response: ResponseData | null;
  loading: boolean;
}

const getStatusColor = (code: number) => {
  if (code === 0) return "red";
  if (code >= 200 && code < 300) return "green";
  if (code >= 300 && code < 400) return "blue";
  if (code >= 400 && code < 500) return "orange";
  return "red";
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatBody = (body: string): string => {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
};

const ResponseViewer: React.FC<Props> = ({ response, loading }) => {
  const [formatted, setFormatted] = useState(true);
  const { token } = theme.useToken();

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
        <Spin tip="请求中..." />
      </div>
    );
  }

  if (!response) {
    return (
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
        <Empty description="发送请求以查看响应" />
      </div>
    );
  }

  const formattedBody = formatted ? formatBody(response.body) : response.body;
  const isJson = (() => { try { JSON.parse(response.body); return true; } catch { return false; } })();
  const headerEntries = Object.entries(response.headers);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", borderTop: `1px solid ${token.colorBorderSecondary}`, minHeight: 200, overflow: "hidden" }}>
      {/* 状态栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
        <Tag color={getStatusColor(response.statusCode)}>
          {response.statusCode || "Error"} {response.statusText}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {response.duration} ms
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <DatabaseOutlined style={{ marginRight: 4 }} />
          {formatSize(response.size)}
        </Text>
        {isJson && (
          <Button
            size="small"
            icon={<FormatPainterOutlined />}
            type={formatted ? "primary" : "default"}
            onClick={() => setFormatted(v => !v)}
          >
            {formatted ? "已格式化" : "原始"}
          </Button>
        )}
      </div>

      {/* 响应内容 */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Tabs
          size="small"
          items={[
            {
              key: "body",
              label: "Body",
              children: (
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    fontSize: 12,
                    fontFamily: "var(--ql-font-family, monospace)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    background: token.colorFillQuaternary,
                    borderRadius: 4,
                    maxHeight: "calc(100vh - 500px)",
                    overflow: "auto",
                  }}
                >
                  {formattedBody}
                </pre>
              ),
            },
            {
              key: "headers",
              label: `Headers (${headerEntries.length})`,
              children: (
                <div style={{ padding: 12 }}>
                  {headerEntries.length === 0 ? (
                    <Text type="secondary">无响应头</Text>
                  ) : (
                    <table style={{ width: "100%", fontSize: 12 }}>
                      <tbody>
                        {headerEntries.map(([key, value]) => (
                          <tr key={key}>
                            <td style={{ padding: "4px 8px", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" }}>{key}</td>
                            <td style={{ padding: "4px 8px", wordBreak: "break-all" }}>{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};

export default ResponseViewer;
