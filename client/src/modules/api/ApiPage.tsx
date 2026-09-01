import React, { useCallback, useEffect, useState } from "react";
import { Button, Dropdown, Space, message, Typography } from "antd";
import {
  SendOutlined,
  SaveOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { apiManagerApi } from "../../services/api";
import type {
  ApiEnvironment,
  ApiCollectionItem,
  ApiHistory,
  SendRequestResult,
  KeyValueEntry,
} from "../../types";
import ApiSidebar from "./ApiSidebar";
import RequestBuilder from "./RequestBuilder";
import ResponseViewer from "./ResponseViewer";
import EnvironmentModal from "./EnvironmentModal";

const { Text } = Typography;

// 环境变量替换: 将 {{key}} 替换为对应值
function replaceEnvVars(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

const ApiPage: React.FC = () => {
  // 环境
  const [environments, setEnvironments] = useState<ApiEnvironment[]>([]);
  const [activeEnv, setActiveEnv] = useState<ApiEnvironment | null>(null);
  const [envModalOpen, setEnvModalOpen] = useState(false);

  // 集合
  const [collections, setCollections] = useState<ApiCollectionItem[]>([]);

  // 当前编辑的请求
  const [currentRequest, setCurrentRequest] = useState<ApiCollectionItem | null>(null);
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<KeyValueEntry[]>([]);
  const [queryParams, setQueryParams] = useState<KeyValueEntry[]>([]);
  const [cookies, setCookies] = useState<KeyValueEntry[]>([]);
  const [bodyType, setBodyType] = useState<string>("none");
  const [body, setBody] = useState("");
  const [authType, setAuthType] = useState<string>("none");
  const [authConfig, setAuthConfig] = useState<Record<string, string>>({});

  // 响应
  const [response, setResponse] = useState<SendRequestResult | null>(null);
  const [sending, setSending] = useState(false);

  // 历史
  const [history, setHistory] = useState<ApiHistory[]>([]);

  // 加载环境和集合
  const loadEnvironments = useCallback(async () => {
    const res = await apiManagerApi.listEnvironments();
    if (res.success && res.data) {
      setEnvironments(res.data);
      setActiveEnv(res.data.find(e => e.isActive) || null);
    }
  }, []);

  const loadCollections = useCallback(async () => {
    const res = await apiManagerApi.listCollections();
    if (res.success && res.data) {
      setCollections(res.data);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await apiManagerApi.listHistory({ limit: 100 });
    if (res.success && res.data) {
      setHistory(res.data);
    }
  }, []);

  useEffect(() => {
    loadEnvironments();
    loadCollections();
    loadHistory();
  }, [loadEnvironments, loadCollections, loadHistory]);

  // 获取当前环境变量变量映射
  const getEnvVars = useCallback((): Record<string, string> => {
    if (!activeEnv) return {};
    const vars: Record<string, string> = {};
    for (const v of activeEnv.variables) {
      if (v.enabled && v.key) vars[v.key] = v.value;
    }
    return vars;
  }, [activeEnv]);

  // 加载请求到编辑器
  const loadRequest = useCallback((item: ApiCollectionItem) => {
    setCurrentRequest(item);
    setMethod(item.method || "GET");
    setUrl(item.url || "");
    setHeaders(item.headers || []);
    setQueryParams(item.queryParams || []);
    setCookies(item.cookies || []);
    setBodyType((item.bodyType as any) || "none");
    setBody(item.body || "");
    setAuthType((item.authType as any) || "none");
    setAuthConfig(item.authConfig || {});
    setResponse(null);
  }, []);

  // 保存当前请求
  const handleSave = useCallback(async () => {
    if (!currentRequest) {
      message.info("请先选择一个请求或新建一个请求");
      return;
    }
    const res = await apiManagerApi.updateCollectionItem(currentRequest._id, {
      method, url, headers, queryParams, cookies, bodyType: bodyType as any, body, authType: authType as any, authConfig,
    });
    if (res.success) {
      message.success("已保存");
      loadCollections();
    }
  }, [currentRequest, method, url, headers, queryParams, cookies, bodyType, body, authType, authConfig, loadCollections]);

  // 发送请求
  const handleSend = useCallback(async () => {
    if (!url.trim()) {
      message.warning("请输入请求 URL");
      return;
    }
    setSending(true);
    setResponse(null);
    try {
      const envVars = getEnvVars();
      const resolvedUrl = replaceEnvVars(url, envVars);
      // 替换 headers/body 中的环境变量
      const resolvedHeaders = headers.map(h => ({
        ...h,
        key: replaceEnvVars(h.key, envVars),
        value: replaceEnvVars(h.value, envVars),
      }));
      const resolvedBody = replaceEnvVars(body, envVars);

      const res = await apiManagerApi.send({
        method,
        url: resolvedUrl,
        headers: resolvedHeaders,
        queryParams,
        cookies,
        bodyType,
        body: resolvedBody,
        authType,
        authConfig,
      });
      if (res.success && res.data) {
        setResponse(res.data);
        // 记录历史
        await apiManagerApi.recordHistory({
          method,
          url: resolvedUrl,
          statusCode: res.data.statusCode,
          duration: res.data.duration,
          requestSnapshot: { method, url: resolvedUrl, headers: resolvedHeaders, queryParams, cookies, bodyType, body: resolvedBody, authType },
          responseSnapshot: { statusCode: res.data.statusCode, statusText: res.data.statusText, size: res.data.size },
        });
        loadHistory();
      }
    } catch (err: any) {
      message.error(err.message || "请求失败");
    } finally {
      setSending(false);
    }
  }, [url, method, headers, queryParams, cookies, bodyType, body, authType, authConfig, getEnvVars, loadHistory]);

  // 新建集合
  const handleCreateCollection = useCallback(async (name: string) => {
    const res = await apiManagerApi.createCollectionItem({ type: "collection", name, parentId: null });
    if (res.success) {
      message.success("集合已创建");
      loadCollections();
    }
  }, [loadCollections]);

  // 新建子项
  const handleCreateChild = useCallback(async (parentId: string, type: "folder" | "request", name: string) => {
    const res = await apiManagerApi.createCollectionItem({ type, name, parentId });
    if (res.success) {
      message.success(`${type === "folder" ? "文件夹" : "请求"}已创建`);
      loadCollections();
      if (type === "request" && res.data) {
        loadRequest(res.data);
      }
    }
  }, [loadCollections, loadRequest]);

  // 删除
  const handleDelete = useCallback(async (id: string) => {
    const res = await apiManagerApi.removeCollectionItem(id);
    if (res.success) {
      message.success("已删除");
      if (currentRequest?._id === id) {
        setCurrentRequest(null);
        setUrl("");
        setResponse(null);
      }
      loadCollections();
    }
  }, [currentRequest, loadCollections]);

  // 重命名
  const handleRename = useCallback(async (id: string, name: string) => {
    const res = await apiManagerApi.updateCollectionItem(id, { name });
    if (res.success) loadCollections();
  }, [loadCollections]);

  // 导出
  const handleExport = useCallback(async (id: string, name: string) => {
    const res = await apiManagerApi.exportCollection(id);
    if (res.success && res.data) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${name}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      message.success("导出成功");
    }
  }, []);

  // 激活环境
  const handleActivateEnv = useCallback(async (id: string) => {
    const res = await apiManagerApi.activateEnvironment(id);
    if (res.success) {
      loadEnvironments();
      message.success("环境已激活");
    }
  }, [loadEnvironments]);

  // 从历史记录加载
  const handleLoadHistory = useCallback((item: ApiHistory) => {
    setMethod(item.method);
    setUrl(item.url);
    const snap = item.requestSnapshot || {};
    setHeaders(snap.headers || []);
    setQueryParams(snap.queryParams || []);
    setCookies(snap.cookies || []);
    setBodyType(snap.bodyType || "none");
    setBody(snap.body || "");
    setAuthType(snap.authType || "none");
    setAuthConfig(snap.authConfig || {});
    setCurrentRequest(null);
    // 恢复响应
    if (item.responseSnapshot) {
      setResponse({
        statusCode: item.statusCode,
        statusText: "",
        headers: {},
        body: "",
        duration: item.duration,
        size: 0,
      });
    }
  }, []);

  // 拷贝为 cURL
  const handleCopyCurl = useCallback(() => {
    const envVars = getEnvVars();
    const resolvedUrl = replaceEnvVars(url, envVars);
    
    let curl = `curl -X ${method} '${resolvedUrl}'`;
    
    // Headers
    const enabledHeaders = headers.filter(h => h.enabled && h.key);
    for (const h of enabledHeaders) {
      const key = replaceEnvVars(h.key, envVars);
      const value = replaceEnvVars(h.value, envVars);
      curl += ` \\
  -H '${key}: ${value}'`;
    }
    
    // Cookies
    const enabledCookies = cookies.filter(c => c.enabled && c.key);
    if (enabledCookies.length > 0) {
      const cookieStr = enabledCookies.map(c => {
        const key = replaceEnvVars(c.key, envVars);
        const value = replaceEnvVars(c.value, envVars);
        return `${key}=${value}`;
      }).join("; ");
      curl += ` \\
  -H 'Cookie: ${cookieStr}'`;
    }
    
    // Auth
    if (authType === "bearer" && authConfig?.token) {
      curl += ` \\
  -H 'Authorization: Bearer ${authConfig.token}'`;
    } else if (authType === "basic" && authConfig?.username) {
      curl += ` \\
  -u '${authConfig.username}:${authConfig.password || ""}'`;
    }
    
    // Body
    if (body && bodyType !== "none" && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
      const resolvedBody = replaceEnvVars(body, envVars);
      curl += ` \\
  -d '${resolvedBody.replace(/'/g, "'\\''")}'`;
    }
    
    navigator.clipboard.writeText(curl).then(() => {
      message.success("cURL 已复制到剪贴板");
    }).catch(() => {
      message.error("复制失败");
    });
  }, [url, method, headers, cookies, body, bodyType, authType, authConfig, getEnvVars]);

  // 环境选择下拉
  const envMenuItems = [
    { key: "none", label: "无环境" },
    ...environments.map(e => ({ key: e._id, label: `${e.name}${e.isActive ? " (当前)" : ""}` })),
    { type: "divider" as const },
    { key: "manage", label: "管理环境..." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 96px)" }}>
      {/* 顶部工具栏 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexShrink: 0 }}>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>环境:</Text>
          <Dropdown
            menu={{
              items: envMenuItems,
              onClick: ({ key }) => {
                if (key === "none") {
                  setActiveEnv(null);
                } else if (key === "manage") {
                  setEnvModalOpen(true);
                } else {
                  handleActivateEnv(key);
                }
              },
            }}
          >
            <Button size="small" icon={<SettingOutlined />}>
              {activeEnv?.name || "无环境"}
            </Button>
          </Dropdown>
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={sending}
            onClick={handleSend}
          >
            发送
          </Button>
          <Button
            icon={<SaveOutlined />}
            onClick={handleSave}
          >
            保存
          </Button>
        </Space>
      </div>

      {/* 主体: 左侧边栏 + 右侧内容 */}
      <div style={{ display: "flex", flex: 1, gap: 12, overflow: "hidden" }}>
        {/* 左侧面板 */}
        <ApiSidebar
          collections={collections}
          history={history}
          currentId={currentRequest?._id}
          onSelectRequest={loadRequest}
          onCreateCollection={handleCreateCollection}
          onCreateChild={handleCreateChild}
          onDelete={handleDelete}
          onRename={handleRename}
          onExport={handleExport}
          onLoadHistory={handleLoadHistory}
          onRefreshHistory={loadHistory}
        />

        {/* 右侧请求编辑区 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* 请求构建器 */}
          <RequestBuilder
            method={method}
            url={url}
            headers={headers}
            queryParams={queryParams}
            cookies={cookies}
            bodyType={bodyType}
            body={body}
            authType={authType}
            authConfig={authConfig}
            envVars={getEnvVars()}
            sending={sending}
            onMethodChange={setMethod}
            onUrlChange={setUrl}
            onHeadersChange={setHeaders}
            onQueryParamsChange={setQueryParams}
            onCookiesChange={setCookies}
            onBodyTypeChange={setBodyType}
            onBodyChange={setBody}
            onAuthTypeChange={setAuthType}
            onAuthConfigChange={setAuthConfig}
            onSend={handleSend}
            onCopyCurl={handleCopyCurl}
          />

          {/* 响应查看器 */}
          <ResponseViewer response={response} loading={sending} />
        </div>
      </div>

      {/* 环境管理弹窗 */}
      <EnvironmentModal
        open={envModalOpen}
        environments={environments}
        activeEnvId={activeEnv?._id}
        onClose={() => setEnvModalOpen(false)}
        onSaved={loadEnvironments}
        onActivate={handleActivateEnv}
      />
    </div>
  );
};

export default ApiPage;
