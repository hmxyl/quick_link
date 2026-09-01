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
