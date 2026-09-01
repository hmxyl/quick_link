import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";
import { ApiEnvironment } from "../../types";

const { apiEnvironments } = db;

// GET /environments
export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const envs = await new Promise<ApiEnvironment[]>((resolve, reject) => {
      apiEnvironments.find({ userId: req.userId }, (err: Error | null, docs: ApiEnvironment[]) => {
        if (err) reject(err);
        else resolve(docs.sort((a, b) => a.name.localeCompare(b.name)));
      });
    });
    res.json({ success: true, data: envs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /environments
export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, variables = [] } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: "Environment name is required" });
      return;
    }
    const now = new Date().toISOString();
    const env: ApiEnvironment = {
      _id: uuidv4(),
      userId: req.userId!,
      name: name.trim(),
      variables,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    };
    await new Promise<void>((resolve, reject) => {
      apiEnvironments.insert(env, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.status(201).json({ success: true, data: env });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /environments/:id
export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, variables } = req.body;
    const doc = await new Promise<ApiEnvironment>((resolve, reject) => {
      apiEnvironments.findOne({ _id: id, userId: req.userId }, (err: Error | null, doc: ApiEnvironment) => {
        if (err) reject(err);
        else resolve(doc);
      });
    });
    if (!doc) {
      res.status(404).json({ success: false, error: "Environment not found" });
      return;
    }
    const updated = {
      ...doc,
      name: name !== undefined ? name.trim() : doc.name,
      variables: variables !== undefined ? variables : doc.variables,
      updatedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      apiEnvironments.update({ _id: id }, updated, {}, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /environments/:id
export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await new Promise<number>((resolve, reject) => {
      apiEnvironments.remove({ _id: id, userId: req.userId }, {}, (err: Error | null, numRemoved: number) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
    if (result === 0) {
      res.status(404).json({ success: false, error: "Environment not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /environments/:id/activate
export async function activate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    // 验证环境存在
    const exists = await new Promise<boolean>((resolve, reject) => {
      apiEnvironments.findOne({ _id: id, userId: req.userId }, (err: Error | null, doc: any) => {
        if (err) reject(err);
        else resolve(!!doc);
      });
    });
    if (!exists) {
      res.status(404).json({ success: false, error: "Environment not found" });
      return;
    }
    // 将所有环境 isActive 设为 false
    await new Promise<void>((resolve, reject) => {
      apiEnvironments.update(
        { userId: req.userId },
        { $set: { isActive: false } },
        { multi: true },
        (err: Error | null) => { if (err) reject(err); else resolve(); }
      );
    });
    // 将目标环境 isActive 设为 true
    await new Promise<void>((resolve, reject) => {
      apiEnvironments.update(
        { _id: id },
        { $set: { isActive: true, updatedAt: new Date().toISOString() } },
        {},
        (err: Error | null) => { if (err) reject(err); else resolve(); }
      );
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
