import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";

interface SendRequestBody {
  method: string;
  url: string;
  headers?: { key: string; value: string; enabled: boolean }[];
  queryParams?: { key: string; value: string; enabled: boolean }[];
  cookies?: { key: string; value: string; enabled: boolean }[];
  bodyType?: string;
  body?: string;
  authType?: string;
  authConfig?: Record<string, string>;
}

// POST /send - 代理发送 HTTP 请求
export async function send(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { method, url, headers = [], queryParams = [], cookies = [], bodyType, body, authType, authConfig } = req.body as SendRequestBody;

    if (!url) {
      res.status(400).json({ success: false, error: "URL is required" });
      return;
    }

    // 构建最终 URL (拼接 query params)
    let finalUrl = url;
    const enabledParams = queryParams.filter(p => p.enabled && p.key);
    if (enabledParams.length > 0) {
      const searchParams = new URLSearchParams();
      for (const p of enabledParams) {
        searchParams.append(p.key, p.value);
      }
      const separator = finalUrl.includes("?") ? "&" : "?";
      finalUrl += separator + searchParams.toString();
    }

    // 构建请求头
    const reqHeaders: Record<string, string> = {};
    const enabledHeaders = headers.filter(h => h.enabled && h.key);
    for (const h of enabledHeaders) {
      reqHeaders[h.key] = h.value;
    }

    // 处理认证
    if (authType === "bearer" && authConfig?.token) {
      reqHeaders["Authorization"] = `Bearer ${authConfig.token}`;
    } else if (authType === "basic" && authConfig?.username) {
      const encoded = Buffer.from(`${authConfig.username}:${authConfig.password || ""}`).toString("base64");
      reqHeaders["Authorization"] = `Basic ${encoded}`;
    }

    // 处理 Cookies
    const enabledCookies = cookies.filter(c => c.enabled && c.key);
    if (enabledCookies.length > 0) {
      reqHeaders["Cookie"] = enabledCookies.map(c => `${c.key}=${c.value}`).join("; ");
    }

    // 构建请求体
    let reqBody: string | undefined;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method?.toUpperCase())) {
      if (bodyType === "json" && body) {
        reqBody = body;
        if (!reqHeaders["Content-Type"]) {
          reqHeaders["Content-Type"] = "application/json";
        }
      } else if (bodyType === "x-www-form-urlencoded" && body) {
        reqBody = body;
        if (!reqHeaders["Content-Type"]) {
          reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        }
      } else if (bodyType === "raw" && body) {
        reqBody = body;
      }
    }

    // 发送请求
    const startTime = Date.now();
    let statusCode = 0;
    let statusText = "";
    let responseBody = "";
    let responseHeaders: Record<string, string> = {};
    let responseSize = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s 超时

      const fetchResponse = await fetch(finalUrl, {
        method: method?.toUpperCase() || "GET",
        headers: reqHeaders,
        body: reqBody,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeoutId);

      statusCode = fetchResponse.status;
      statusText = fetchResponse.statusText;

      // 收集响应头
      fetchResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // 读取响应体
      responseBody = await fetchResponse.text();
      responseSize = new TextEncoder().encode(responseBody).length;
    } catch (fetchErr: any) {
      const duration = Date.now() - startTime;
      // 网络错误也记录到历史
      res.json({
        success: true,
        data: {
          statusCode: 0,
          statusText: "Network Error",
          headers: {},
          body: fetchErr.message || "Failed to fetch",
          duration,
          size: 0,
        },
      });
      return;
    }

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        statusCode,
        statusText,
        headers: responseHeaders,
        body: responseBody,
        duration,
        size: responseSize,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
