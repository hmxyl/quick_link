import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";
import { Tag } from "../../types";

export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tags: Tag[] = await new Promise((resolve, reject) => {
      db.tags.find({ userId: req.userId }).sort({ name: 1 }).exec((err, docs) => {
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
    const { name, color } = req.body;

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

    const tag: Tag = {
      _id: uuidv4(),
      userId: req.userId!,
      name,
      color,
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
    const { name, color } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;

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
