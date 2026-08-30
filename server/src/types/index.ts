// User document
export interface User {
  _id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

// Link document (merged with account credentials)
export interface Link {
  _id: string;
  userId: string;
  url: string;
  title: string;
  description?: string;
  icon?: string;
  screenshot?: string;
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  clickCount: number;
  lastVisitedAt?: string;
  // Account credentials (multiple accounts per link; plaintext storage)
  hasAccount: boolean;
  accounts?: LinkAccount[];
  passwordUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// 单个关联账号 (明文存储; _id 用于区分同一链接下的多个账号)
export interface LinkAccount {
  _id: string;
  username?: string;
  email?: string;
  password: string;
  notes?: string;
  createdAt: string;
}

// Account document
export interface Account {
  _id: string;
  userId: string;
  platform: string;
  linkId?: string;
  username: string;
  email?: string;
  password: string;
  notes?: string;
  totpSecret?: string;
  tags: string[];
  category?: string;
  lastUsedAt?: string;
  passwordUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

// Tag document
export interface Tag {
  _id: string;
  userId: string;
  name: string;
  color?: string;
  createdAt: string;
}

// Note document (markdown note or folder, tree via parentId)
export interface Note {
  _id: string; // 相对用户笔记根目录的路径 (文件夹=目录, 文档=.md 文件)
  userId: string;
  type: "folder" | "note";
  title: string;
  content?: string; // markdown, note type only
  parentId: string | null; // 父目录相对路径, null 为根级
  deletedAt: string | null; // 非空即位于回收站 (.trash 目录)
  createdAt: string;
  updatedAt: string;
}

// Attachment document (file copied into DATA_DIR/attachment)
export interface Attachment {
  _id: string;
  userId: string;
  noteId: string | null;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

// Note order record (同级子项的自定义排序, 磁盘文件系统本身无序)
export interface NoteOrder {
  _id: string;
  userId: string;
  parentId: string; // 父目录相对路径, 根级为 ""
  order: string[]; // 子项基础名列表 (文档不含 .md 后缀), 按显示顺序排列
  createdAt: string;
}

// Migration record
export interface MigrationRecord {
  _id: string;
  version: number;
  name: string;
  appliedAt: string;
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Request query params
export interface ListQuery {
  page?: string;
  limit?: string;
  sort?: string;
  search?: string;
  tag?: string;
  favorite?: string;
}
