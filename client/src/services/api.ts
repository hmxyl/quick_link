import axios from "axios";
import type {
  ApiResponse,
  LoginRequest,
  RegisterRequest,
  User,
  Link,
  AccountSecrets,
  Tag,
  Note,
  Attachment,
  CreateLinkRequest,
  LinkAccountInput,
} from "../types";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 - only redirect when not on auth pages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== "/login" && path !== "/register") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (data: LoginRequest) =>
    api.post<ApiResponse<{ token: string; user: User }>>("/auth/login", data).then((r) => r.data),

  register: (data: RegisterRequest) =>
    api.post<ApiResponse<{ token: string; user: User }>>("/auth/register", data).then((r) => r.data),

  getMe: () => api.get<ApiResponse<User>>("/auth/me").then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.put("/auth/password", { currentPassword, newPassword }).then((r) => r.data),

  resetLoginPassword: (username: string, email: string, newPassword: string) =>
    api.post<ApiResponse>("/auth/reset-password", { username, email, newPassword }).then((r) => r.data),
};

// Links
export const linkApi = {
  list: (params?: Record<string, string>) =>
    api.get<ApiResponse<Link[]> & { total: number; totalPages: number }>("/links", { params }).then((r) => r.data),

  getById: (id: string) => api.get<ApiResponse<Link>>(`/links/${id}`).then((r) => r.data),

  create: (data: CreateLinkRequest) =>
    api.post<ApiResponse<Link>>("/links", data).then((r) => r.data),

  update: (id: string, data: Partial<CreateLinkRequest>) =>
    api.put<ApiResponse<Link>>(`/links/${id}`, data).then((r) => r.data),

  remove: (id: string) => api.delete(`/links/${id}`).then((r) => r.data),

  clearAll: () => api.delete<ApiResponse<{ count: number }>>("/links").then((r) => r.data),

  exportJson: () =>
    api.get("/links/export", { params: { format: "json" }, responseType: "blob" }).then((r) => r.data as Blob),

  batchImport: (links: CreateLinkRequest[]) =>
    api.post<ApiResponse<{ count: number }>>("/links/batch", { links }).then((r) => r.data),

  getSecrets: (id: string) =>
    api.get<ApiResponse<AccountSecrets>>(`/links/${id}/secrets`).then((r) => r.data),

  // 为链接追加一个关联账号 (明文存储)
  addAccount: (id: string, data: LinkAccountInput) =>
    api.post<ApiResponse<{ _id: string }>>(`/links/${id}/accounts`, data).then((r) => r.data),

  // 编辑链接下的指定关联账号
  updateAccount: (id: string, accountId: string, data: LinkAccountInput) =>
    api.put<ApiResponse>(`/links/${id}/accounts/${accountId}`, data).then((r) => r.data),

  // 删除链接下的指定关联账号
  removeAccount: (id: string, accountId: string) =>
    api.delete<ApiResponse>(`/links/${id}/accounts/${accountId}`).then((r) => r.data),

  countWithAccount: () =>
    api.get<ApiResponse<{ count: number }>>("/links/account-count").then((r) => r.data),

  // 按 URL 精确搜索已有链接 (添加时去重提示)
  searchByUrl: (url: string) =>
    api.get<ApiResponse<Link[]>>("/links/search-by-url", { params: { url } }).then((r) => r.data),

  // 批量设置标签
  batchUpdateTags: (ids: string[], tags: string[], mode?: "set" | "add" | "remove") =>
    api.put<ApiResponse<{ count: number }>>("/links/batch-tags", { ids, tags, mode }).then((r) => r.data),
};

// Tags
export const tagApi = {
  list: () => api.get<ApiResponse<Tag[]>>("/tags").then((r) => r.data),

  create: (data: { name: string; color?: string }) =>
    api.post<ApiResponse<Tag>>("/tags", data).then((r) => r.data),

  update: (id: string, data: { name?: string; color?: string }) =>
    api.put<ApiResponse<Tag>>(`/tags/${id}`, data).then((r) => r.data),

  remove: (id: string) => api.delete(`/tags/${id}`).then((r) => r.data),
};

// Custom Icons
export interface CustomIcon {
  _id: string;
  url: string;
  label?: string;
  createdAt: string;
}

export const customIconApi = {
  list: () => api.get<ApiResponse<CustomIcon[]>>("/custom-icons").then((r) => r.data),

  add: (url: string, label?: string) =>
    api.post<ApiResponse<CustomIcon>>("/custom-icons", { url, label }).then((r) => r.data),

  remove: (id: string) => api.delete(`/custom-icons/${id}`).then((r) => r.data),

  clearAll: () => api.delete<ApiResponse<{ count: number }>>("/custom-icons").then((r) => r.data),
};

// 触发浏览器下载 Blob
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Notes
// 笔记 id 为相对路径 (可含 "/"), 拼入 URL 前统一编码
const encId = (id: string) => encodeURIComponent(id);

export const noteApi = {
  list: () => api.get<ApiResponse<Note[]>>("/notes").then((r) => r.data),

  create: (data: { type: "folder" | "note"; title?: string; parentId?: string | null }) =>
    api.post<ApiResponse<Note>>("/notes", data).then((r) => r.data),

  update: (id: string, data: { title?: string; content?: string }) =>
    api.put<ApiResponse<Note>>(`/notes/${encId(id)}`, data).then((r) => r.data),

  remove: (id: string) => api.delete(`/notes/${encId(id)}`).then((r) => r.data),

  restore: (id: string) => api.post(`/notes/${encId(id)}/restore`).then((r) => r.data),

  // 拖拽排序/跨文件夹移动: parentId 为目标父级 (null=根级), index 为插入位置 (同级重排时不动磁盘)
  move: (id: string, data: { parentId: string | null; index: number }) =>
    api.post<ApiResponse<Note>>(`/notes/${encId(id)}/move`, data).then((r) => r.data),

  removePermanent: (id: string) => api.delete(`/notes/${encId(id)}/permanent`).then((r) => r.data),

  emptyTrash: () => api.delete("/notes/trash").then((r) => r.data),

  wipe: () => api.post("/notes/wipe").then((r) => r.data),

  exportZip: () => api.get("/notes/export", { responseType: "blob" }).then((r) => r.data as Blob),

  importZip: (buf: ArrayBuffer) =>
    api.post<ApiResponse>("/notes/import", buf, { headers: { "Content-Type": "application/zip" } }).then((r) => r.data),
};

// Attachments
export const attachmentApi = {
  list: () => api.get<ApiResponse<Attachment[]>>("/notes/attachments").then((r) => r.data),

  upload: (noteId: string, file: File) =>
    api.post<ApiResponse<Attachment>>(
      `/notes/attachments?noteId=${encodeURIComponent(noteId)}&name=${encodeURIComponent(file.name)}`,
      file,
      { headers: { "Content-Type": "application/octet-stream" } }
    ).then((r) => r.data),

  download: (id: string, filename: string) =>
    api.get(`/notes/attachments/${id}/download`, { responseType: "blob" }).then((r) => {
      downloadBlob(r.data as Blob, filename);
    }),

  // 在文件管理器中打开附件所在文件夹 (需系统环境, 桌面版生效)
  openFolder: (id: string) => api.post(`/notes/attachments/${id}/open-folder`).then((r) => r.data),

  // 用系统默认程序打开附件文件 (Ctrl+点击行触发)
  openFile: (id: string) => api.post(`/notes/attachments/${id}/open-file`).then((r) => r.data),

  remove: (id: string) => api.delete(`/notes/attachments/${id}`).then((r) => r.data),
};

export default api;
