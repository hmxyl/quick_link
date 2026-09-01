import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";
import { ApiHistory } from "../../types";

const { apiHistory } = db;

// GET /history
export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      new Promise<ApiHistory[]>((resolve, reject) => {
        apiHistory
          .find({ userId: req.userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec((err: Error | null, docs: any[]) => {
            if (err) reject(err);
            else resolve(docs as ApiHistory[]);
          });
      }),
      new Promise<number>((resolve, reject) => {
        apiHistory.count({ userId: req.userId }, (err: Error | null, n: number) => {
          if (err) reject(err);
          else resolve(n);
        });
      }),
    ]);
    res.json({ success: true, data: items, total, page, limit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /history (记录一条历史)
export async function record(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { method, url, statusCode, duration, requestSnapshot, responseSnapshot } = req.body;
    const history: ApiHistory = {
      _id: uuidv4(),
      userId: req.userId!,
      method: method || "GET",
      url: url || "",
      statusCode: statusCode || 0,
      duration: duration || 0,
      requestSnapshot: requestSnapshot || {},
      responseSnapshot: responseSnapshot || {},
      createdAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      apiHistory.insert(history, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.status(201).json({ success: true, data: history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /history/:id
export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await new Promise<number>((resolve, reject) => {
      apiHistory.remove({ _id: id, userId: req.userId }, {}, (err: Error | null, numRemoved: number) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
    if (result === 0) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /history (清空)
export async function clearAll(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await new Promise<number>((resolve, reject) => {
      apiHistory.remove({ userId: req.userId }, { multi: true }, (err: Error | null, numRemoved: number) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
    res.json({ success: true, data: { count: result } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
