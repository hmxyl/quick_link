import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { env } from "../../config/env";
import { AuthRequest } from "../../middleware/auth";
import { User } from "../../types";

const SALT_ROUNDS = 12;

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ success: false, error: "用户名、邮箱和密码为必填项" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, error: "密码长度至少 8 位" });
      return;
    }

    // Check if user exists
    const existing: any[] = await new Promise((resolve, reject) => {
      db.users.findOne({ $or: [{ username }, { email }] }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc ? [doc] : []);
      });
    });

    if (existing.length > 0) {
      res.status(409).json({ success: false, error: "用户名或邮箱已存在" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date().toISOString();

    const user: User = {
      _id: uuidv4(),
      username,
      email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    await new Promise<void>((resolve, reject) => {
      db.users.insert(user as any, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const token = jwt.sign({ userId: user._id }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { _id: user._id, username: user.username, email: user.email },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ success: false, error: "用户名和密码为必填项" });
      return;
    }

    const user: User | null = await new Promise((resolve, reject) => {
      db.users.findOne({ username }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as User | null);
      });
    });

    if (!user) {
      res.status(401).json({ success: false, error: "用户名或密码错误" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: "用户名或密码错误" });
      return;
    }

    const token = jwt.sign({ userId: user._id }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });

    res.json({
      success: true,
      data: {
        token,
        user: { _id: user._id, username: user.username, email: user.email },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user: User | null = await new Promise((resolve, reject) => {
      db.users.findOne({ _id: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as User | null);
      });
    });

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    res.json({
      success: true,
      data: { _id: user._id, username: user.username, email: user.email, createdAt: user.createdAt },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Reset login password by verifying username + registered email
export async function resetLoginPassword(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, newPassword } = req.body;

    if (!username || !email || !newPassword) {
      res.status(400).json({ success: false, error: "用户名、注册邮箱和新密码为必填项" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: "新密码长度至少 8 位" });
      return;
    }

    const user: User | null = await new Promise((resolve, reject) => {
      db.users.findOne({ username }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as User | null);
      });
    });

    if (!user || user.email.toLowerCase() !== String(email).trim().toLowerCase()) {
      res.status(401).json({ success: false, error: "用户名与注册邮箱不匹配" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await new Promise<void>((resolve, reject) => {
      db.users.update(
        { _id: user._id },
        { $set: { passwordHash, updatedAt: new Date().toISOString() } },
        {},
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true, message: "密码重置成功，请使用新密码登录" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: "当前密码和新密码为必填项" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: "新密码长度至少 8 位" });
      return;
    }

    const user: User | null = await new Promise((resolve, reject) => {
      db.users.findOne({ _id: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as User | null);
      });
    });

    if (!user) {
      res.status(404).json({ success: false, error: "用户不存在" });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: "当前密码错误" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await new Promise<void>((resolve, reject) => {
      db.users.update(
        { _id: req.userId },
        { $set: { passwordHash, updatedAt: new Date().toISOString() } },
        {},
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true, message: "密码已更新" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
