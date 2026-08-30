import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";
import { generatePassword, isLegacyCipher } from "../../services/cryptoService";
import { Account } from "../../types";

// 旧版主密码密文已无法解密, 转为占位提示
function plainValue(v?: string | null): string | null {
  if (!v) return null;
  return isLegacyCipher(v) ? "(旧版密文, 无法查看)" : v;
}

export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const query = req.query;
    const page = parseInt((query.page as string) || "1", 10);
    const limit = Math.min(parseInt((query.limit as string) || "20", 10), 100);
    const skip = (page - 1) * limit;

    const filter: any = { userId: req.userId };
    if (query.category) filter.category = query.category;
    if (query.tag) filter.tags = query.tag;
    if (query.platform) filter.platform = { $regex: new RegExp(query.platform as string, "i") };

    const [docs, total] = await Promise.all([
      new Promise<Account[]>((resolve, reject) => {
        db.accounts.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec((err, docs) => {
          if (err) reject(err);
          else resolve(docs as Account[]);
        });
      }),
      new Promise<number>((resolve, reject) => {
        db.accounts.count(filter, (err, count) => {
          if (err) reject(err);
          else resolve(count);
        });
      }),
    ]);

    // Strip sensitive fields from list view (only show platform, tags, category)
    const safeData = docs.map((doc) => ({
      _id: doc._id,
      platform: doc.platform,
      linkId: doc.linkId,
      tags: doc.tags,
      category: doc.category,
      lastUsedAt: doc.lastUsedAt,
      passwordUpdatedAt: doc.passwordUpdatedAt,
      createdAt: doc.createdAt,
    }));

    res.json({
      success: true,
      data: safeData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const account: Account | null = await new Promise((resolve, reject) => {
      db.accounts.findOne({ _id: req.params.id, userId: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Account | null);
      });
    });

    if (!account) {
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    // Return with plaintext sensitive fields
    res.json({
      success: true,
      data: {
        _id: account._id,
        platform: account.platform,
        linkId: account.linkId,
        username: plainValue(account.username),
        email: plainValue(account.email),
        password: plainValue(account.password) || "",
        notes: plainValue(account.notes),
        totpSecret: plainValue(account.totpSecret),
        tags: account.tags,
        category: account.category,
        lastUsedAt: account.lastUsedAt,
        passwordUpdatedAt: account.passwordUpdatedAt,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const account: Account | null = await new Promise((resolve, reject) => {
      db.accounts.findOne({ _id: req.params.id, userId: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Account | null);
      });
    });

    if (!account) {
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    // 凭据明文存储, 直接返回 (旧版密文转为占位提示)
    const plaintext: any = {
      username: plainValue(account.username),
      email: plainValue(account.email),
      password: plainValue(account.password) || "",
      notes: plainValue(account.notes),
      totpSecret: plainValue(account.totpSecret),
    };

    // Update lastUsedAt
    db.accounts.update(
      { _id: account._id },
      { $set: { lastUsedAt: new Date().toISOString() } },
      {},
      () => {}
    );

    res.json({ success: true, data: plaintext });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { platform, username, email, password, notes, totpSecret, tags, category, linkId } = req.body;

    if (!platform || !password) {
      res.status(400).json({ success: false, error: "Platform and password are required" });
      return;
    }

    const now = new Date().toISOString();
    const account: any = {
      _id: uuidv4(),
      userId: req.userId!,
      platform,
      linkId,
      username: username || null,
      email: email || null,
      password,
      notes: notes || null,
      totpSecret: totpSecret || null,
      tags: tags || [],
      category,
      passwordUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await new Promise<void>((resolve, reject) => {
      db.accounts.insert(account, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.status(201).json({
      success: true,
      data: {
        _id: account._id,
        platform: account.platform,
        tags: account.tags,
        category: account.category,
        createdAt: account.createdAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { platform, username, email, password, notes, totpSecret, tags, category, linkId } = req.body;
    const now = new Date().toISOString();

    const updates: any = { updatedAt: now };
    if (platform !== undefined) updates.platform = platform;
    if (linkId !== undefined) updates.linkId = linkId;
    if (tags !== undefined) updates.tags = tags;
    if (category !== undefined) updates.category = category;
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (password !== undefined) {
      updates.password = password;
      updates.passwordUpdatedAt = now;
    }
    if (notes !== undefined) updates.notes = notes;
    if (totpSecret !== undefined) updates.totpSecret = totpSecret;

    const updated: number = await new Promise((resolve, reject) => {
      db.accounts.update(
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
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    res.json({ success: true, message: "Account updated" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const removed: number = await new Promise((resolve, reject) => {
      db.accounts.remove({ _id: req.params.id, userId: req.userId }, {}, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });

    if (removed === 0) {
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    res.json({ success: true, message: "Account deleted" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function generate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const length = parseInt(req.body.length || "16", 10);
    const password = generatePassword(length);
    res.json({ success: true, data: { password } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
