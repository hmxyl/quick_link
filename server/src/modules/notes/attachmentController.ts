import { Response } from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { env } from "../../config/env";
import { AuthRequest } from "../../middleware/auth";
import type { Attachment } from "../../types";

function ensureAttachDir() {
  if (!fs.existsSync(env.ATTACH_DIR)) fs.mkdirSync(env.ATTACH_DIR, { recursive: true });
}

// POST /api/notes/attachments?noteId=&name=  上传 (raw body, 拷贝存一份到 attachment 目录)
export async function upload(req: AuthRequest, res: Response) {
  const body = req.body as Buffer;
  const originalName = String(req.query.name || "").trim();
  const noteId = String(req.query.noteId || "") || null;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ success: false, error: "附件内容为空" });
  }
  if (!originalName) {
    return res.status(400).json({ success: false, error: "缺少附件文件名" });
  }
  if (noteId) {
    // noteId 为笔记相对路径, 校验对应文件/目录存在 (防越权)
    const root = path.resolve(path.join(env.DATA_DIR, "note", req.userId!));
    const abs = path.resolve(path.join(root, noteId));
    if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) {
      return res.status(400).json({ success: false, error: "所属笔记不存在" });
    }
  }
  ensureAttachDir();
  const ext = path.extname(originalName);
  const storedName = `${uuidv4()}${ext}`;
  fs.writeFileSync(path.join(env.ATTACH_DIR, storedName), body);
  const record: Attachment = {
    _id: uuidv4(),
    userId: req.userId!,
    noteId,
    originalName,
    storedName,
    size: body.length,
    mimeType: String(req.headers["content-type"] || "application/octet-stream"),
    createdAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    db.attachments.insert(record, (err: Error | null) => (err ? reject(err) : resolve()));
  });
  res.json({ success: true, data: record });
}

// 在文件管理器中定位文件 (Windows: explorer /select; macOS: open -R; Linux: 打开所在目录)
function revealInFileManager(file: string) {
  const opts = { detached: true, stdio: "ignore" as const };
  if (process.platform === "win32") spawn("explorer.exe", [`/select,${file}`], opts).unref();
  else if (process.platform === "darwin") spawn("open", ["-R", file], opts).unref();
  else spawn("xdg-open", [path.dirname(file)], opts).unref();
}

// 用系统默认程序打开文件 (Windows: cmd /c start)
function openWithSystem(file: string) {
  const opts = { detached: true, stdio: "ignore" as const };
  if (process.platform === "win32") spawn("cmd.exe", ["/c", "start", "", `"${file}"`], opts).unref();
  else if (process.platform === "darwin") spawn("open", [file], opts).unref();
  else spawn("xdg-open", [file], opts).unref();
}

// 查找当前用户自己的附件记录 (不存在返回 null)
function findOwnAttachment(req: AuthRequest): Promise<Attachment | null> {
  return new Promise((resolve, reject) => {
    db.attachments.findOne({ _id: req.params.id, userId: req.userId! }, (err: Error | null, d: Attachment) => (err ? reject(err) : resolve(d)));
  });
}

// GET /api/notes/attachments  附件列表
export async function list(req: AuthRequest, res: Response) {
  const docs = await new Promise<Attachment[]>((resolve, reject) => {
    db.attachments.find({ userId: req.userId! }, (err: Error | null, d: Attachment[]) => (err ? reject(err) : resolve(d)));
  });
  docs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ success: true, data: docs });
}

// GET /api/notes/attachments/:id/download  下载
export async function download(req: AuthRequest, res: Response) {
  const doc = await new Promise<Attachment | null>((resolve, reject) => {
    db.attachments.findOne({ _id: req.params.id, userId: req.userId! }, (err: Error | null, d: Attachment) => (err ? reject(err) : resolve(d)));
  });
  if (!doc) return res.status(404).json({ success: false, error: "附件不存在" });
  const file = path.join(env.ATTACH_DIR, doc.storedName);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: "附件文件已丢失" });
  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
  fs.createReadStream(file).pipe(res);
}

// POST /api/notes/attachments/:id/open-folder  在文件管理器中打开附件所在文件夹并选中它
export async function openFolder(req: AuthRequest, res: Response) {
  const doc = await findOwnAttachment(req);
  if (!doc) return res.status(404).json({ success: false, error: "附件不存在" });
  const file = path.join(env.ATTACH_DIR, doc.storedName);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: "附件文件已丢失" });
  revealInFileManager(file);
  res.json({ success: true, message: "已打开所在文件夹" });
}

// POST /api/notes/attachments/:id/open-file  用系统默认程序打开附件文件 (客户端 Ctrl+点击触发)
export async function openFile(req: AuthRequest, res: Response) {
  const doc = await findOwnAttachment(req);
  if (!doc) return res.status(404).json({ success: false, error: "附件不存在" });
  const file = path.join(env.ATTACH_DIR, doc.storedName);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: "附件文件已丢失" });
  openWithSystem(file);
  res.json({ success: true, message: "已打开附件文件" });
}

// DELETE /api/notes/attachments/:id  删除附件 (记录+文件)
export async function remove(req: AuthRequest, res: Response) {
  const doc = await new Promise<Attachment | null>((resolve, reject) => {
    db.attachments.findOne({ _id: req.params.id, userId: req.userId! }, (err: Error | null, d: Attachment) => (err ? reject(err) : resolve(d)));
  });
  if (!doc) return res.status(404).json({ success: false, error: "附件不存在" });
  await new Promise<void>((resolve) => db.attachments.remove({ _id: doc._id }, {}, () => resolve()));
  try {
    fs.unlinkSync(path.join(env.ATTACH_DIR, doc.storedName));
  } catch {
    /* 文件不存在时忽略 */
  }
  res.json({ success: true, message: "附件已删除" });
}
