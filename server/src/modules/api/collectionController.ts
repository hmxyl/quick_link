import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";
import { ApiCollectionItem } from "../../types";

const { apiCollections } = db;

// 获取当前用户所有集合/文件夹/请求 (扁平列表, 前端组装树)
export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const items = await new Promise<ApiCollectionItem[]>((resolve, reject) => {
      apiCollections.find({ userId: req.userId }, (err: Error | null, docs: ApiCollectionItem[]) => {
        if (err) reject(err);
        else resolve(docs.sort((a, b) => a.sortOrder - b.sortOrder));
      });
    });
    res.json({ success: true, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 创建集合/文件夹/请求
export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { parentId = null, type, name, method, url, headers, queryParams, cookies, bodyType, body, authType, authConfig } = req.body;
    if (!type || !["collection", "folder", "request"].includes(type)) {
      res.status(400).json({ success: false, error: "Invalid type" });
      return;
    }
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: "Name is required" });
      return;
    }
    // 计算同级 sortOrder
    const siblings = await new Promise<ApiCollectionItem[]>((resolve, reject) => {
      apiCollections.find({ userId: req.userId, parentId: parentId }, (err: Error | null, docs: ApiCollectionItem[]) => {
        if (err) reject(err);
        else resolve(docs);
      });
    });
    const maxSort = siblings.reduce((max, s) => Math.max(max, s.sortOrder), -1);
    const now = new Date().toISOString();
    const item: ApiCollectionItem = {
      _id: uuidv4(),
      userId: req.userId!,
      parentId,
      type,
      name: name.trim(),
      sortOrder: maxSort + 1,
      ...(type === "request" ? { method: method || "GET", url: url || "", headers: headers || [], queryParams: queryParams || [], cookies: cookies || [], bodyType: bodyType || "none", body: body || "", authType: authType || "none", authConfig: authConfig || {} } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await new Promise<void>((resolve, reject) => {
      apiCollections.insert(item, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.status(201).json({ success: true, data: item });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 更新集合/文件夹/请求
export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await new Promise<ApiCollectionItem>((resolve, reject) => {
      apiCollections.findOne({ _id: id, userId: req.userId }, (err: Error | null, doc: ApiCollectionItem) => {
        if (err) reject(err);
        else resolve(doc);
      });
    });
    if (!doc) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    const allowed = ["name", "parentId", "sortOrder", "method", "url", "headers", "queryParams", "cookies", "bodyType", "body", "authType", "authConfig"];
    const updated: any = { ...doc, updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updated[key] = req.body[key];
      }
    }
    await new Promise<void>((resolve, reject) => {
      apiCollections.update({ _id: id }, updated, {}, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 递归收集所有子孙 ID (用于级联删除)
async function collectDescendantIds(parentId: string, userId: string): Promise<string[]> {
  const children = await new Promise<ApiCollectionItem[]>((resolve, reject) => {
    apiCollections.find({ parentId, userId }, (err: Error | null, docs: ApiCollectionItem[]) => {
      if (err) reject(err);
      else resolve(docs);
    });
  });
  let ids = children.map(c => c._id);
  for (const child of children) {
    if (child.type !== "request") {
      const subIds = await collectDescendantIds(child._id, userId);
      ids = ids.concat(subIds);
    }
  }
  return ids;
}

// 删除 (集合/文件夹级联删除子项)
export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await new Promise<ApiCollectionItem>((resolve, reject) => {
      apiCollections.findOne({ _id: id, userId: req.userId }, (err: Error | null, doc: ApiCollectionItem) => {
        if (err) reject(err);
        else resolve(doc);
      });
    });
    if (!doc) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    // 收集所有要删除的 ID
    const idsToDelete = [id];
    if (doc.type !== "request") {
      const descendantIds = await collectDescendantIds(id, req.userId!);
      idsToDelete.push(...descendantIds);
    }
    await new Promise<void>((resolve, reject) => {
      apiCollections.remove({ _id: { $in: idsToDelete } }, { multi: true }, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.json({ success: true, data: { count: idsToDelete.length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 导出集合 (含子项)
export async function exportCollection(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ success: false, error: "Collection id is required" });
      return;
    }
    const root = await new Promise<ApiCollectionItem>((resolve, reject) => {
      apiCollections.findOne({ _id: id, userId: req.userId }, (err: Error | null, doc: ApiCollectionItem) => {
        if (err) reject(err);
        else resolve(doc);
      });
    });
    if (!root) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    // 收集所有子项
    const collectAll = async (parentId: string): Promise<ApiCollectionItem[]> => {
      const children = await new Promise<ApiCollectionItem[]>((resolve, reject) => {
        apiCollections.find({ parentId, userId: req.userId }, (err: Error | null, docs: ApiCollectionItem[]) => {
          if (err) reject(err);
          else resolve(docs.sort((a, b) => a.sortOrder - b.sortOrder));
        });
      });
      let all = [...children];
      for (const child of children) {
        if (child.type !== "request") {
          const sub = await collectAll(child._id);
          all = all.concat(sub);
        }
      }
      return all;
    };
    const children = await collectAll(id);
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      root,
      items: children,
    };
    res.json({ success: true, data: exportData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─── Postman Collection 导入/导出 ─────────────────────────────────────────────

// POST /collections/import-postman
// 导入 Postman Collection v2.1 JSON
export async function importPostman(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { data } = req.body;
    if (!data || !data.info || !Array.isArray(data.item)) {
      res.status(400).json({ success: false, error: "无效的 Postman Collection 格式 (缺少 info 或 item)" });
      return;
    }

    const collectionName = (data.info.name || "导入的集合").trim();
    const now = new Date().toISOString();

    // 创建根集合
    const rootId = uuidv4();
    const root: ApiCollectionItem = {
      _id: rootId,
      userId: req.userId!,
      parentId: null,
      type: "collection",
      name: collectionName,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    await new Promise<void>((resolve, reject) => {
      apiCollections.insert(root, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    let count = 0;

    // 递归处理 Postman item 树
    const processItems = async (postmanItems: any[], parentId: string, baseSort: number) => {
      for (let i = 0; i < postmanItems.length; i++) {
        const pmItem = postmanItems[i];
        const itemId = uuidv4();
        const hasChildren = Array.isArray(pmItem.item) && pmItem.item.length > 0;
        const isRequest = !!pmItem.request;

        if (hasChildren) {
          // 文件夹
          const folder: ApiCollectionItem = {
            _id: itemId,
            userId: req.userId!,
            parentId,
            type: "folder",
            name: (pmItem.name || "未命名文件夹").trim(),
            sortOrder: baseSort + i,
            createdAt: now,
            updatedAt: now,
          };
          await new Promise<void>((resolve, reject) => {
            apiCollections.insert(folder, (err: Error | null) => {
              if (err) reject(err);
              else resolve();
            });
          });
          count++;
          await processItems(pmItem.item, itemId, 0);
        } else if (isRequest) {
          // 请求
          const pmReq = pmItem.request;
          const pmUrl = pmReq.url || {};

          // URL: 优先使用 raw
          let url = pmUrl.raw || "";

          // Headers
          const headers = (pmReq.header || [])
            .filter((h: any) => h.key !== undefined)
            .map((h: any) => ({
              key: String(h.key || ""),
              value: String(h.value || ""),
              enabled: !h.disabled,
            }));

          // Query params
          const queryParams = (pmUrl.query || [])
            .filter((q: any) => q.key !== undefined && q.key !== null)
            .map((q: any) => ({
              key: String(q.key || ""),
              value: String(q.value ?? ""),
              enabled: !q.disabled,
            }));

          // Body
          let bodyType = "none";
          let body = "";
          if (pmReq.body) {
            const mode = pmReq.body.mode;
            if (mode === "raw") {
              body = pmReq.body.raw || "";
              // 检查 raw options 中的语言
              const lang = pmReq.body.options?.raw?.language;
              bodyType = lang === "json" ? "json" : "raw";
            } else if (mode === "urlencoded") {
              bodyType = "x-www-form-urlencoded";
            } else if (mode === "formdata") {
              bodyType = "form-data";
            } else if (mode === "raw") {
              bodyType = "raw";
            }
          }

          // Auth
          let authType: "none" | "bearer" | "basic" = "none";
          const authConfig: Record<string, string> = {};
          if (pmReq.auth) {
            const pmAuth = pmReq.auth.type || "noauth";
            if (pmAuth === "bearer") authType = "bearer";
            else if (pmAuth === "basic") authType = "basic";
            else authType = "none";
          }

          const request: ApiCollectionItem = {
            _id: itemId,
            userId: req.userId!,
            parentId,
            type: "request",
            name: (pmItem.name || "未命名请求").trim(),
            sortOrder: baseSort + i,
            method: pmReq.method || "GET",
            url,
            headers,
            queryParams,
            cookies: [],
            bodyType: bodyType as any,
            body,
            authType,
            authConfig,
            createdAt: now,
            updatedAt: now,
          };
          await new Promise<void>((resolve, reject) => {
            apiCollections.insert(request, (err: Error | null) => {
              if (err) reject(err);
              else resolve();
            });
          });
          count++;
        }
      }
    };

    await processItems(data.item, rootId, 0);

    res.status(201).json({
      success: true,
      data: { count: count + 1, collectionName },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /collections/export-postman
// 导出集合为 Postman Collection v2.1 格式
export async function exportPostman(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ success: false, error: "Collection id is required" });
      return;
    }

    const root = await new Promise<ApiCollectionItem>((resolve, reject) => {
      apiCollections.findOne({ _id: id, userId: req.userId }, (err: Error | null, doc: ApiCollectionItem) => {
        if (err) reject(err);
        else resolve(doc);
      });
    });
    if (!root) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }

    // 递归收集子项
    const collectAll = async (parentId: string): Promise<ApiCollectionItem[]> => {
      const children = await new Promise<ApiCollectionItem[]>((resolve, reject) => {
        apiCollections.find({ parentId, userId: req.userId }, (err: Error | null, docs: ApiCollectionItem[]) => {
          if (err) reject(err);
          else resolve(docs.sort((a, b) => a.sortOrder - b.sortOrder));
        });
      });
      let all = [...children];
      for (const child of children) {
        if (child.type !== "request") {
          const sub = await collectAll(child._id);
          all = all.concat(sub);
        }
      }
      return all;
    };

    const allItems = await collectAll(id);

    // 构建 Postman item 树
    const buildPostmanItems = (parentId: string): any[] => {
      const children = allItems
        .filter(item => item.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return children.map(child => {
        if (child.type !== "request") {
          // 文件夹
          return {
            name: child.name,
            item: buildPostmanItems(child._id),
          };
        } else {
          // 请求
          const pmReq: any = {
            method: child.method || "GET",
            header: (child.headers || [])
              .filter(h => h.key)
              .map(h => ({
                key: h.key,
                value: h.value,
                type: "default",
                disabled: !h.enabled,
              })),
            url: buildPostmanUrl(child.url || ""),
          };

          // Body
          if (child.bodyType && child.bodyType !== "none" && child.body) {
            pmReq.body = {
              mode: child.bodyType === "json" ? "raw" : child.bodyType === "raw" ? "raw" : child.bodyType,
              raw: child.body,
              options: {
                raw: {
                  language: child.bodyType === "json" ? "json" : "text",
                },
              },
            };
          }

          // Auth
          if (child.authType && child.authType !== "none") {
            pmReq.auth = { type: child.authType };
          }

          return {
            name: child.name,
            request: pmReq,
            response: [],
          };
        }
      });
    };

    // 将 URL 字符串解析为 Postman URL 对象
    function buildPostmanUrl(rawUrl: string): any {
      const urlObj: any = { raw: rawUrl };
      try {
        // 简单解析: protocol://host/path?query
        const noProto = rawUrl.replace(/^(https?:\/\/)?/, "");
        const protocol = rawUrl.startsWith("https") ? "https" : rawUrl.startsWith("http") ? "http" : undefined;
        if (protocol) urlObj.protocol = protocol;

        const [hostPath, queryString] = noProto.split("?");
        const parts = hostPath.split("/");

        // 检查是否有端口
        const hostPart = parts[0];
        if (hostPart && hostPart.includes(":")) {
          const [h, p] = hostPart.split(":");
          urlObj.host = h.split(".");
          urlObj.port = p;
        } else if (hostPart) {
          urlObj.host = hostPart.split(".");
        }

        if (parts.length > 1) {
          urlObj.path = parts.slice(1);
        }

        // Query params
        if (queryString) {
          urlObj.query = queryString.split("&").map(pair => {
            const [key, value] = pair.split("=");
            return { key: decodeURIComponent(key || ""), value: decodeURIComponent(value || "") };
          });
        }
      } catch {
        // 解析失败时只保留 raw
      }
      return urlObj;
    }

    const postmanCollection = {
      info: {
        _postman_id: root._id,
        name: root.name,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        _exporter_id: "quicklink",
        _exported_at: new Date().toISOString(),
      },
      item: buildPostmanItems(id),
    };

    res.json({ success: true, data: postmanCollection });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 导入集合
export async function importCollection(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { data } = req.body;
    if (!data || !data.root) {
      res.status(400).json({ success: false, error: "Invalid import data" });
      return;
    }
    const idMap = new Map<string, string>(); // 旧 ID -> 新 ID
    const now = new Date().toISOString();
    // 重新创建根
    const newRootId = uuidv4();
    idMap.set(data.root._id, newRootId);
    const newRoot: ApiCollectionItem = {
      ...data.root,
      _id: newRootId,
      userId: req.userId!,
      parentId: null,
      createdAt: now,
      updatedAt: now,
    };
    await new Promise<void>((resolve, reject) => {
      apiCollections.insert(newRoot, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // 重新创建子项
    const items: ApiCollectionItem[] = data.items || [];
    for (const item of items) {
      const newId = uuidv4();
      idMap.set(item._id, newId);
      const newItem: ApiCollectionItem = {
        ...item,
        _id: newId,
        userId: req.userId!,
        parentId: idMap.get(item.parentId!) || null,
        createdAt: now,
        updatedAt: now,
      };
      await new Promise<void>((resolve, reject) => {
        apiCollections.insert(newItem, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    res.status(201).json({ success: true, data: { count: items.length + 1 } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
