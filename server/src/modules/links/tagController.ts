import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";
import { Tag } from "../../types";

export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tags: Tag[] = await new Promise((resolve, reject) => {
      db.tags.find({ userId: req.userId }).sort({ sortOrder: 1, name: 1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs as Tag[]);
      });
    });

    res.json({ success: true, data: tags });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, color, columns } = req.body;

    if (!name) {
      res.status(400).json({ success: false, error: "Tag name is required" });
      return;
    }

    // Check for duplicate
    const existing: Tag | null = await new Promise((resolve, reject) => {
      db.tags.findOne({ userId: req.userId, name }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Tag | null);
      });
    });

    if (existing) {
      res.status(409).json({ success: false, error: "Tag already exists" });
      return;
    }

    // 新标签追加到末尾
    const allTags: Tag[] = await new Promise((resolve, reject) => {
      db.tags.find({ userId: req.userId }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs as Tag[]);
      });
    });
    const maxSort = allTags.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), -1);

    const tag: Tag = {
      _id: uuidv4(),
      userId: req.userId!,
      name,
      color,
      columns: columns !== undefined ? Number(columns) : 5,
      sortOrder: maxSort + 1,
      createdAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      db.tags.insert(tag as any, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.status(201).json({ success: true, data: tag });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, color, columns } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;
    if (columns !== undefined) updates.columns = Number(columns);

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, error: "No fields to update" });
      return;
    }

    const updated: number = await new Promise((resolve, reject) => {
      db.tags.update(
        { _id: req.params.id, userId: req.userId },
        { $set: updates },
        { returnUpdatedDocs: true },
        (err, numAffected) => {
          if (err) reject(err);
          else resolve(numAffected);
        }
      );
    });

    if (updated === 0) {
      res.status(404).json({ success: false, error: "Tag not found" });
      return;
    }

    const tag: Tag | null = await new Promise((resolve, reject) => {
      db.tags.findOne({ _id: req.params.id }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Tag | null);
      });
    });

    res.json({ success: true, data: tag });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 统一设置当前用户所有标签的每行链接数 (标签管理弹窗「统一设置」入口)
// 覆盖范围: 已有标签记录 + 仅存在于链接上而无标签记录的分组 (如导入数据带来的标签、
// 未打标签的"其他"兜底分组), 后者会补建标签记录, 使统一设置作用于页面展示的所有分组
export async function batchColumns(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { columns } = req.body;
    const cols = Number(columns);
    if (!Number.isInteger(cols) || cols < 1 || cols > 8) {
      res.status(400).json({ success: false, error: "columns 必须为 1~8 的整数" });
      return;
    }

    // 1. 更新全部已有标签记录
    const updatedCount: number = await new Promise((resolve, reject) => {
      db.tags.update(
        { userId: req.userId },
        { $set: { columns: cols } },
        { multi: true },
        (err, numAffected) => {
          if (err) reject(err);
          else resolve(numAffected);
        }
      );
    });

    // 2. 收集页面上实际存在的全部分组名: 链接上的 tag / 旧 tags[0], 未打标签归入"其他"
    const links: any[] = await new Promise((resolve, reject) => {
      db.links.find({ userId: req.userId }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs as any[]);
      });
    });
    const usedGroups = new Set<string>();
    for (const l of links) {
      usedGroups.add(l.tag || (Array.isArray(l.tags) && l.tags.length > 0 ? l.tags[0] : "其他"));
    }

    // 3. 补建缺失的标签记录 (统一列数, 排序追加到末尾)
    const existing: any[] = await new Promise((resolve, reject) => {
      db.tags.find({ userId: req.userId }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs as any[]);
      });
    });
    const existingNames = new Set(existing.map((t) => t.name));
    let maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), -1);
    const now = new Date().toISOString();
    let createdCount = 0;
    for (const name of usedGroups) {
      if (existingNames.has(name)) continue;
      const tag: Tag = {
        _id: uuidv4(),
        userId: req.userId!,
        name,
        columns: cols,
        sortOrder: ++maxSort,
        createdAt: now,
      };
      await new Promise<void>((resolve, reject) => {
        db.tags.insert(tag as any, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      createdCount++;
    }

    const total = updatedCount + createdCount;
    res.json({ success: true, message: `已统一设置 ${total} 个分组每行展示 ${cols} 个链接`, data: { count: total, columns: cols } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function reorder(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: "ids array is required" });
      return;
    }

    // 按传入顺序重写 sortOrder
    for (let i = 0; i < ids.length; i++) {
      await new Promise<void>((resolve, reject) => {
        db.tags.update(
          { _id: ids[i], userId: req.userId },
          { $set: { sortOrder: i } },
          {},
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const removed: number = await new Promise((resolve, reject) => {
      db.tags.remove({ _id: req.params.id, userId: req.userId }, {}, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });

    if (removed === 0) {
      res.status(404).json({ success: false, error: "Tag not found" });
      return;
    }

    res.json({ success: true, message: "Tag deleted" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
