export interface User {
  _id: string;
  username: string;
  email: string;
  createdAt?: string;
}

export interface Link {
  _id: string;
  url: string; // 可为空字符串
  title: string;
  description?: string;
  icon?: string;
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  clickCount: number;
  hasAccount: boolean;
  accountCount?: number;
  lastVisitedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// 单个关联账号 (一个链接可有多个)
export interface LinkAccountSecrets {
  _id: string;
  username: string | null;
  email: string | null;
  password: string;
  notes: string | null;
}

export interface AccountSecrets {
  accounts: LinkAccountSecrets[];
}

export interface Tag {
  _id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface Note {
  _id: string; // 相对用户笔记根目录的路径 (文件夹=目录, 文档=.md 文件)
  type: "folder" | "note";
  title: string;
  content?: string;
  parentId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  _id: string;
  noteId: string | null;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LinkAccountInput {
  username?: string;
  email?: string;
  password: string;
  notes?: string;
}

export interface CreateLinkRequest {
  url?: string;
  title?: string;
  description?: string;
  icon?: string;
  tags?: string[];
  accounts?: LinkAccountInput[];
}

// ─── API Manager Types ───────────────────────────────────────────────────────

export interface EnvVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiEnvironment {
  _id: string;
  userId: string;
  name: string;
  variables: EnvVariable[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KeyValueEntry {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiCollectionItem {
  _id: string;
  userId: string;
  parentId: string | null;
  type: "collection" | "folder" | "request";
  name: string;
  sortOrder: number;
  method?: string;
  url?: string;
  headers?: KeyValueEntry[];
  queryParams?: KeyValueEntry[];
  cookies?: KeyValueEntry[];
  bodyType?: "none" | "json" | "form-data" | "x-www-form-urlencoded" | "raw" | "binary";
  body?: string;
  authType?: "none" | "bearer" | "basic";
  authConfig?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiHistory {
  _id: string;
  userId: string;
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  requestSnapshot: Record<string, any>;
  responseSnapshot: Record<string, any>;
  createdAt: string;
}

export interface SendRequestPayload {
  method: string;
  url: string;
  headers?: KeyValueEntry[];
  queryParams?: KeyValueEntry[];
  cookies?: KeyValueEntry[];
  bodyType?: string;
  body?: string;
  authType?: string;
  authConfig?: Record<string, string>;
}

export interface SendRequestResult {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
  size: number;
}

