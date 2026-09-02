import React, { useCallback } from "react";
import { Button, Input, Select, Space, Switch, Tabs } from "antd";
import { PlusOutlined, DeleteOutlined, CopyOutlined, FormatPainterOutlined } from "@ant-design/icons";
import type { KeyValueEntry } from "../../types";

const { TextArea } = Input;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

interface Props {
  method: string;
  url: string;
  headers: KeyValueEntry[];
  queryParams: KeyValueEntry[];
  cookies: KeyValueEntry[];
  bodyType: string;
  body: string;
  authType: string;
  authConfig: Record<string, string>;
  envVars: Record<string, string>;
  onMethodChange: (m: string) => void;
  onUrlChange: (u: string) => void;
  onHeadersChange: (h: KeyValueEntry[]) => void;
  onQueryParamsChange: (q: KeyValueEntry[]) => void;
  onCookiesChange: (c: KeyValueEntry[]) => void;
  onBodyTypeChange: (t: string) => void;
  onBodyChange: (b: string) => void;
  onAuthTypeChange: (t: string) => void;
  onAuthConfigChange: (c: Record<string, string>) => void;
  onSend: () => void;
  onCopyCurl: () => void;
}

// 通用 KV 表格编辑器
const KVEditor: React.FC<{
  data: KeyValueEntry[];
  onChange: (data: KeyValueEntry[]) => void;
  envVars: Record<string, string>;
}> = ({ data, onChange, envVars: _envVars }) => {
  const updateRow = (index: number, field: keyof KeyValueEntry, value: any) => {
    const next = [...data];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const addRow = () => {
    onChange([...data, { key: "", value: "", enabled: true }]);
  };

  const removeRow = (index: number) => {
    onChange(data.filter((_, i) => i !== index));
  };

  return (
    <div>
      {data.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
          <Switch size="small" checked={row.enabled} onChange={v => updateRow(i, "enabled", v)} />
          <Input
            size="small"
            placeholder="Key"
            value={row.key}
            onChange={e => updateRow(i, "key", e.target.value)}
            style={{ flex: 1 }}
          />
          <Input
            size="small"
            placeholder="Value"
            value={row.value}
            onChange={e => updateRow(i, "value", e.target.value)}
            style={{ flex: 2 }}
          />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeRow(i)} />
        </div>
      ))}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addRow} block>
        添加
      </Button>
    </div>
  );
};

const RequestBuilder: React.FC<Props> = ({
  method, url, headers, queryParams, cookies, bodyType, body, authType, authConfig,
  envVars,
  onMethodChange, onUrlChange, onHeadersChange, onQueryParamsChange, onCookiesChange,
  onBodyTypeChange, onBodyChange, onAuthTypeChange, onAuthConfigChange, onSend, onCopyCurl,
}) => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* URL 栏 */}
      <div style={{ display: "flex", gap: 8, padding: "8px 0", flexShrink: 0 }} onKeyDown={handleKeyDown}>
        <Select
          value={method}
          onChange={onMethodChange}
          style={{ width: 110 }}
          options={METHODS.map(m => ({ value: m, label: m }))}
          variant="filled"
        />
        <Input
          value={url}
          onChange={e => onUrlChange(e.target.value)}
          placeholder="输入请求 URL, 例如 https://api.example.com/users"
          style={{ flex: 1 }}
          onPressEnter={onSend}
        />
        <Button icon={<CopyOutlined />} onClick={onCopyCurl}>
          cURL
        </Button>
      </div>

      {/* Tabs: Params / Headers / Body / Auth */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Tabs
          size="small"
          items={[
            {
              key: "params",
              label: `Params${queryParams.filter(q => q.enabled && q.key).length > 0 ? ` (${queryParams.filter(q => q.enabled && q.key).length})` : ""}`,
              children: (
                <div style={{ padding: "8px 0" }}>
                  <KVEditor data={queryParams} onChange={onQueryParamsChange} envVars={envVars} />
                </div>
              ),
            },
            {
              key: "headers",
              label: `Headers${headers.filter(h => h.enabled && h.key).length > 0 ? ` (${headers.filter(h => h.enabled && h.key).length})` : ""}`,
              children: (
                <div style={{ padding: "8px 0" }}>
                  <KVEditor data={headers} onChange={onHeadersChange} envVars={envVars} />
                </div>
              ),
            },
            {
              key: "cookies",
              label: `Cookies${cookies.filter(c => c.enabled && c.key).length > 0 ? ` (${cookies.filter(c => c.enabled && c.key).length})` : ""}`,
              children: (
                <div style={{ padding: "8px 0" }}>
                  <KVEditor data={cookies} onChange={onCookiesChange} envVars={envVars} />
                </div>
              ),
            },
            {
              key: "body",
              label: "Body",
              children: (
                <div style={{ padding: "8px 0" }}>
                  <Space style={{ marginBottom: 8 }}>
                    {["none", "json", "x-www-form-urlencoded", "raw"].map(t => (
                      <Button
                        key={t}
                        size="small"
                        type={bodyType === t ? "primary" : "default"}
                        onClick={() => onBodyTypeChange(t)}
                      >
                        {t === "x-www-form-urlencoded" ? "form-urlenc" : t}
                      </Button>
                    ))}
                    {bodyType === "json" && (
                      <Button
                        size="small"
                        icon={<FormatPainterOutlined />}
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(body);
                            onBodyChange(JSON.stringify(parsed, null, 2));
                          } catch {
                            // JSON 格式有误时不处理
                          }
                        }}
                      >
                        格式化
                      </Button>
                    )}
                  </Space>
                  {bodyType !== "none" && (
                    <TextArea
                      value={body}
                      onChange={e => onBodyChange(e.target.value)}
                      placeholder={bodyType === "json" ? '{\n  "key": "value"\n}' : "请求体内容..."}
                      rows={8}
                      style={{ fontFamily: bodyType === "json" ? "var(--ql-font-family, monospace)" : undefined }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: "auth",
              label: "Auth",
              children: (
                <div style={{ padding: "8px 0" }}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Select
                      value={authType}
                      onChange={onAuthTypeChange}
                      style={{ width: 200 }}
                      options={[
                        { value: "none", label: "无认证" },
                        { value: "bearer", label: "Bearer Token" },
                        { value: "basic", label: "Basic Auth" },
                      ]}
                    />
                    {authType === "bearer" && (
                      <Input
                        placeholder="Token"
                        value={authConfig.token || ""}
                        onChange={e => onAuthConfigChange({ ...authConfig, token: e.target.value })}
                      />
                    )}
                    {authType === "basic" && (
                      <>
                        <Input
                          placeholder="用户名"
                          value={authConfig.username || ""}
                          onChange={e => onAuthConfigChange({ ...authConfig, username: e.target.value })}
                        />
                        <Input.Password
                          placeholder="密码"
                          value={authConfig.password || ""}
                          onChange={e => onAuthConfigChange({ ...authConfig, password: e.target.value })}
                        />
                      </>
                    )}
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};

export default RequestBuilder;
