import type { KeyValueEntry } from "../../types";

export interface CurlParseResult {
  method: string;
  url: string;
  headers: KeyValueEntry[];
  queryParams: KeyValueEntry[];
  cookies: KeyValueEntry[];
  bodyType: string;
  body: string;
  authType: string;
  authConfig: Record<string, string>;
}

/**
 * 解析 cURL 命令字符串，提取请求信息
 */
export function parseCurlCommand(curlCommand: string): CurlParseResult {
  const result: CurlParseResult = {
    method: "GET",
    url: "",
    headers: [],
    queryParams: [],
    cookies: [],
    bodyType: "none",
    body: "",
    authType: "none",
    authConfig: {},
  };

  if (!curlCommand || !curlCommand.trim()) {
    throw new Error("cURL 命令不能为空");
  }

  // 移除开头的 "curl" 命令
  let cmd = curlCommand.trim();
  if (cmd.toLowerCase().startsWith("curl ")) {
    cmd = cmd.substring(5).trim();
  } else if (cmd.toLowerCase() === "curl") {
    throw new Error("cURL 格式错误，请检查后重试");
  }

  // 解析参数
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  let escape = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];

    if (escape) {
      current += ch;
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        if (current) {
          args.push(current);
          current = "";
        }
      } else {
        current += ch;
      }
    }
  }

  if (current) {
    args.push(current);
  }

  // 提取参数
  let hasExplicitMethod = false;
  let hasBody = false;
  const headerMap: Map<string, string> = new Map();
  let cookieHeader = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-X" || arg === "--request") {
      if (i + 1 < args.length) {
        result.method = args[++i].toUpperCase();
        hasExplicitMethod = true;
      }
    } else if (arg === "-H" || arg === "--header") {
      if (i + 1 < args.length) {
        const headerStr = args[++i];
        const colonIndex = headerStr.indexOf(":");
        if (colonIndex > 0) {
          const key = headerStr.substring(0, colonIndex).trim();
          const value = headerStr.substring(colonIndex + 1).trim();
          headerMap.set(key, value);
        }
      }
    } else if (arg === "-b" || arg === "--cookie") {
      if (i + 1 < args.length) {
        cookieHeader = args[++i];
      }
    } else if (arg === "-d" || arg === "--data" || arg === "--data-raw" || arg === "--data-binary") {
      if (i + 1 < args.length) {
        result.body = args[++i];
        hasBody = true;
      }
    } else if (arg === "-u" || arg === "--user") {
      if (i + 1 < args.length) {
        const credentials = args[++i];
        const colonIndex = credentials.indexOf(":");
        if (colonIndex > 0) {
          result.authType = "basic";
          result.authConfig = {
            username: credentials.substring(0, colonIndex),
            password: credentials.substring(colonIndex + 1),
          };
        } else {
          result.authType = "basic";
          result.authConfig = { username: credentials, password: "" };
        }
      }
    } else if (!arg.startsWith("-") && !result.url) {
      // 第一个非参数项作为 URL
      result.url = arg;
    }
  }

  // 处理 URL 和查询参数
  if (result.url) {
    try {
      const urlObj = new URL(result.url);
      const params: KeyValueEntry[] = [];
      urlObj.searchParams.forEach((value, key) => {
        params.push({ key, value, enabled: true });
      });
      result.queryParams = params;
      // 移除 URL 中的查询参数部分
      urlObj.search = "";
      result.url = urlObj.toString();
    } catch {
      // URL 解析失败，保持原样
    }
  }

  // 处理 Headers（过滤 Cookie 和 Authorization）
  const filteredHeaders: KeyValueEntry[] = [];
  headerMap.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "cookie") {
      cookieHeader = value;
    } else if (lowerKey === "authorization") {
      // 解析 Bearer Token
      if (value.toLowerCase().startsWith("bearer ")) {
        result.authType = "bearer";
        result.authConfig = { token: value.substring(7).trim() };
      }
    } else {
      filteredHeaders.push({ key, value, enabled: true });
    }
  });
  result.headers = filteredHeaders;

  // 处理 Cookies
  if (cookieHeader) {
    const cookiePairs = cookieHeader.split(";").map((c) => c.trim()).filter((c) => c);
    result.cookies = cookiePairs.map((pair) => {
      const eqIndex = pair.indexOf("=");
      if (eqIndex > 0) {
        return { key: pair.substring(0, eqIndex).trim(), value: pair.substring(eqIndex + 1).trim(), enabled: true };
      }
      return { key: pair, value: "", enabled: true };
    });
  }

  // 推断 Method
  if (!hasExplicitMethod) {
    result.method = hasBody ? "POST" : "GET";
  }

  // 推断 Body 类型
  if (hasBody && result.body) {
    const contentType = headerMap.get("Content-Type") || headerMap.get("content-type") || "";
    if (contentType.includes("application/json") || isJsonString(result.body)) {
      result.bodyType = "json";
    } else if (contentType.includes("x-www-form-urlencoded")) {
      result.bodyType = "x-www-form-urlencoded";
    } else {
      result.bodyType = "raw";
    }
  }

  if (!result.url) {
    throw new Error("cURL 格式错误，未找到请求 URL");
  }

  return result;
}

/**
 * 判断字符串是否为 JSON 格式
 */
function isJsonString(str: string): boolean {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}
