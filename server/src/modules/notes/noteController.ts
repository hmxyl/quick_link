import { Response } from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import AdmZip from "adm-zip";
import { db } from "../../config/database";
import { env } from "../../config/env";
import { AuthRequest } from "../../middleware/auth";
import type { Note, Attachment, NoteOrder } from "../../types";

// 笔记以真实文件目录形式存储: DATA_DIR/note/<userId>/... (文件夹=目录, 文档=.md 文件)
// 节点 _id 为相对用户根目录的路径 (POSIX 分隔符), 回收站为根下隐藏目录 .trash

const TRASH = ".trash";

const rootOf = (userId: string) => path.join(env.DATA_DIR, "note", userId);
const trashOf = (userId: string) => path.join(rootOf(userId), TRASH);

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/** 文件名安全化 (Windows 非法字符/首尾点空格/隐藏名) */
function safeName(name: string): string {
  let cleaned = name.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "").trim();
  cleaned = cleaned.replace(/[. ]+$/, "");
  if (!cleaned || cleaned === TRASH) cleaned = "untitled";
  return cleaned;
}

/** 同级重名自动追加 (n) */
function uniquePath(dir: string, base: string, isFolder: boolean): string {
  const ext = isFolder ? "" : ".md";
  let candidate = path.join(dir, base + ext);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i++;
  }
  return candidate;
}

/** 相对路径 → 绝对路径 (防越权) */
function absOf(userId: string, rel: string, inTrash = false): string {
  const root = path.resolve(inTrash ? trashOf(userId) : rootOf(userId));
  const abs = path.resolve(path.join(root, rel));
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw Object.assign(new Error("非法路径"), { status: 400 });
  }
  return abs;
}

function relOf(abs: string, root: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

function mkNote(userId: string, rel: string, type: "folder" | "note", content: string, deleted: boolean, st: fs.Stats): Note {
  const base = rel.split("/").pop() || rel;
  return {
    _id: rel,
    userId,
    type,
    title: type === "note" ? base.replace(/\.md$/, "") : base,
    content: type === "note" ? content : undefined,
    parentId: rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : null,
    deletedAt: deleted ? st.mtime.toISOString() : null,
    createdAt: st.birthtime.toISOString(),
    updatedAt: st.mtime.toISOString(),
  };
}

/** 同级默认比较: 文件夹在前, 同类型按中文名 */
function defaultCompare(a: fs.Dirent, b: fs.Dirent) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "zh-CN");
}

const baseOfEntry = (e: fs.Dirent) => (e.isDirectory() ? e.name : e.name.endsWith(".md") ? e.name.slice(0, -3) : e.name);

/** 同级排序: 命中自定义顺序的在前 (按 order), 未命中的按默认规则排后 */
function sortEntries(ents: fs.Dirent[], orderArr: string[] | undefined): fs.Dirent[] {
  if (!orderArr?.length) return [...ents].sort(defaultCompare);
  const pos = new Map(orderArr.map((b, i) => [b, i]));
  return [...ents].sort((a, b) => {
    const ia = pos.get(baseOfEntry(a));
    const ib = pos.get(baseOfEntry(b));
    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;
    return defaultCompare(a, b);
  });
}

/** 深度优先遍历目录树 (可选按自定义顺序排列同级) */
function walk(userId: string, dir: string, relBase: string, deleted: boolean, out: Note[], orderMap?: Map<string, string[]>) {
  if (!fs.existsSync(dir)) return;
  const ents = sortEntries(
    fs.readdirSync(dir, { withFileTypes: true }).filter((e) => relBase || e.name !== TRASH),
    orderMap?.get(relBase)
  );
  for (const ent of ents) {
    const abs = path.join(dir, ent.name);
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (ent.isDirectory()) {
      out.push(mkNote(userId, rel, "folder", "", deleted, st));
      walk(userId, abs, rel, deleted, out, orderMap);
    } else if (ent.name.endsWith(".md")) {
      let content = "";
      try {
        content = fs.readFileSync(abs, "utf8");
      } catch {
        /* 读取失败按空内容 */
      }
      out.push(mkNote(userId, rel, "note", content, deleted, st));
    }
  }
}

function findUserAttachments(userId: string): Promise<Attachment[]> {
  return new Promise((resolve, reject) => {
    db.attachments.find({ userId }, (err: Error | null, docs: Attachment[]) => (err ? reject(err) : resolve(docs)));
  });
}

/** 重命名/移动后同步附件的 noteId (前缀替换) */
async function remapAttachmentNoteIds(userId: string, oldRel: string, newRel: string) {
  if (oldRel === newRel) return;
  const docs = await findUserAttachments(userId);
  for (const a of docs) {
    if (!a.noteId) continue;
    if (a.noteId === oldRel || a.noteId.startsWith(oldRel + "/")) {
      const next = newRel + a.noteId.slice(oldRel.length);
      await new Promise<void>((resolve) => {
        db.attachments.update({ _id: a._id }, { $set: { noteId: next } }, {}, () => resolve());
      });
    }
  }
}

/** 删除附件记录并移除磁盘文件 */
async function deleteAttachmentRecords(records: Attachment[]) {
  for (const rec of records) {
    await new Promise<void>((resolve) => db.attachments.remove({ _id: rec._id }, {}, () => resolve()));
    try {
      fs.unlinkSync(path.join(env.ATTACH_DIR, rec.storedName));
    } catch {
      /* 文件不存在时忽略 */
    }
  }
}

/** 移动到目标目录 (自动处理重名), 返回新绝对路径 */
function moveTo(srcAbs: string, destDir: string, isFolder: boolean): string {
  const base = isFolder ? path.basename(srcAbs) : path.basename(srcAbs, ".md");
  const dest = uniquePath(destDir, safeName(base), isFolder);
  ensureDir(destDir);
  fs.renameSync(srcAbs, dest);
  return dest;
}

// ---- 自定义排序 (note_orders 集合) ----
// 文件系统本身无序, 顺序存 NeDB: { userId, parentId(根为""), order: [子项基础名] }
// 软删除保留条目 (还原后回到原位); 彻底删除后残留条目无害 (显示时自动忽略)

/** 用户全部排序记录 → parentId → order 映射 */
function getOrderMap(userId: string): Promise<Map<string, string[]>> {
  return new Promise((resolve, reject) => {
    db.noteOrders.find({ userId }, (err: Error | null, docs: NoteOrder[]) => {
      if (err) return reject(err);
      const map = new Map<string, string[]>();
      for (const d of docs) map.set(d.parentId, d.order || []);
      resolve(map);
    });
  });
}

function getOrderArr(userId: string, parentRel: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    db.noteOrders.findOne({ userId, parentId: parentRel }, (err: Error | null, d: NoteOrder) =>
      err ? reject(err) : resolve(d?.order || [])
    );
  });
}

function saveChildOrder(userId: string, parentRel: string, order: string[]): Promise<void> {
  return new Promise((resolve) => {
    db.noteOrders.update(
      { userId, parentId: parentRel },
      { $set: { order, userId, parentId: parentRel } },
      { upsert: true },
      () => resolve()
    );
  });
}

/** 某目录下子项基础名, 按当前显示顺序 (自定义顺序优先) */
async function childBasenames(userId: string, parentRel: string): Promise<string[]> {
  const dirAbs = parentRel ? absOf(userId, parentRel) : rootOf(userId);
  if (!fs.existsSync(dirAbs)) return [];
  const orderMap = await getOrderMap(userId);
  const ents = sortEntries(
    fs.readdirSync(dirAbs, { withFileTypes: true }).filter((e) => parentRel || e.name !== TRASH),
    orderMap.get(parentRel)
  );
  return ents.filter((e) => e.isDirectory() || e.name.endsWith(".md")).map(baseOfEntry);
}

/** 重命名/移动后同步排序记录的父路径前缀 (文件夹路径变化时波及其后代) */
async function remapNoteOrderParentIds(userId: string, oldRel: string, newRel: string) {
  if (oldRel === newRel) return;
  const docs: NoteOrder[] = await new Promise((resolve, reject) => {
    db.noteOrders.find({ userId }, (err: Error | null, d: NoteOrder[]) => (err ? reject(err) : resolve(d)));
  });
  for (const d of docs) {
    let next = d.parentId;
    if (d.parentId === oldRel) next = newRel;
    else if (d.parentId.startsWith(oldRel + "/")) next = newRel + d.parentId.slice(oldRel.length);
    if (next !== d.parentId) {
      await new Promise<void>((resolve) => db.noteOrders.update({ _id: d._id }, { $set: { parentId: next } }, {}, () => resolve()));
    }
  }
}

// ---- 接口 ----

// GET /api/notes  返回全部笔记 (含回收站项, 前端拆分; 同级按自定义顺序优先)
export async function list(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const orderMap = await getOrderMap(userId);
  const notes: Note[] = [];
  walk(userId, rootOf(userId), "", false, notes, orderMap);
  walk(userId, trashOf(userId), "", true, notes);
  res.json({ success: true, data: notes });
}

// POST /api/notes  新建文件夹/文档
export async function create(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { type, title, parentId } = req.body || {};
  if (type !== "folder" && type !== "note") {
    return res.status(400).json({ success: false, error: "类型无效" });
  }
  let parentAbs = rootOf(userId);
  if (parentId) {
    parentAbs = absOf(userId, String(parentId));
    if (!fs.existsSync(parentAbs) || !fs.statSync(parentAbs).isDirectory()) {
      return res.status(400).json({ success: false, error: "父文件夹不存在" });
    }
  } else {
    ensureDir(parentAbs);
  }
  const rawTitle = String(title || "").replace(/\.md$/i, "");
  const base = safeName(rawTitle || (type === "folder" ? "未命名文件夹" : "未命名文档"));
  const target = uniquePath(parentAbs, base, type === "folder");
  if (type === "folder") fs.mkdirSync(target);
  else fs.writeFileSync(target, "", "utf8");
  const rel = relOf(target, rootOf(userId));
  const note = mkNote(userId, rel, type, "", false, fs.statSync(target));
  res.json({ success: true, data: note });
}

// PUT /api/notes/:id  更新标题/内容
export async function update(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const abs = absOf(userId, rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "笔记不存在" });
  const isFolder = fs.statSync(abs).isDirectory();
  const { title, content } = req.body || {};

  if (typeof content === "string" && !isFolder) {
    fs.writeFileSync(abs, content, "utf8");
  }

  let newRel = rel;
  if (typeof title === "string" && title.trim()) {
    const base = safeName(title.trim().replace(/\.md$/i, ""));
    const oldBase = isFolder ? path.basename(abs) : path.basename(abs, ".md");
    if (base && base !== oldBase) {
      const target = uniquePath(path.dirname(abs), base, isFolder);
      fs.renameSync(abs, target);
      newRel = relOf(target, rootOf(userId));
      await remapAttachmentNoteIds(userId, rel, newRel);
      // 同步自定义排序: 同级基础名条目替换 + (文件夹时) 后代排序记录路径前缀
      const newBase = isFolder ? path.basename(target) : path.basename(target, ".md");
      const parentRel = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      const arr = await getOrderArr(userId, parentRel);
      if (arr.length) {
        await saveChildOrder(userId, parentRel, arr.map((b) => (b === oldBase ? newBase : b)));
      }
      await remapNoteOrderParentIds(userId, rel, newRel);
    }
  }

  const finalAbs = absOf(userId, newRel);
  const note = mkNote(userId, newRel, isFolder ? "folder" : "note", isFolder ? "" : fs.readFileSync(finalAbs, "utf8"), false, fs.statSync(finalAbs));
  res.json({ success: true, data: note });
}

// DELETE /api/notes/:id  软删除 (移入回收站, 整目录移动含后代; 排序条目保留, 还原后回到原位)
export async function remove(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const abs = absOf(userId, rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "笔记不存在" });
  const isFolder = fs.statSync(abs).isDirectory();
  moveTo(abs, path.join(trashOf(userId), path.dirname(rel) === "." ? "" : path.dirname(rel)), isFolder);
  res.json({ success: true, message: "已移入回收站" });
}

// POST /api/notes/:id/restore  还原 (父级缺失时挂回根级)
export async function restore(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const abs = absOf(userId, rel, true);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "回收站中不存在该项" });
  const isFolder = fs.statSync(abs).isDirectory();
  const originParent = path.dirname(absOf(userId, rel));
  let dest: string;
  if (fs.existsSync(originParent) && fs.statSync(originParent).isDirectory()) {
    dest = moveTo(abs, originParent, isFolder);
  } else {
    dest = moveTo(abs, rootOf(userId), isFolder);
  }
  const newRel = relOf(dest, rootOf(userId));
  await remapAttachmentNoteIds(userId, rel, newRel);
  res.json({ success: true, message: "已还原" });
}

// POST /api/notes/:id/move  拖拽排序/跨文件夹移动 { parentId: 目标父级|null, index: 插入位置 }
export async function move(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const { parentId, index } = req.body || {};
  let srcAbs: string;
  try {
    srcAbs = absOf(userId, rel);
  } catch {
    return res.status(400).json({ success: false, error: "非法路径" });
  }
  if (!fs.existsSync(srcAbs)) return res.status(404).json({ success: false, error: "笔记不存在" });
  const isFolder = fs.statSync(srcAbs).isDirectory();
  const oldParentRel = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  const targetRel = typeof parentId === "string" && parentId ? parentId : "";
  let targetAbs = rootOf(userId);
  if (targetRel) {
    try {
      targetAbs = absOf(userId, targetRel);
    } catch {
      return res.status(400).json({ success: false, error: "非法路径" });
    }
    if (!fs.existsSync(targetAbs) || !fs.statSync(targetAbs).isDirectory()) {
      return res.status(400).json({ success: false, error: "目标文件夹不存在" });
    }
  }
  if (isFolder && (targetRel === rel || targetRel.startsWith(rel + "/"))) {
    return res.status(400).json({ success: false, error: "不能移动到自身或其子文件夹" });
  }
  const base = isFolder ? path.basename(srcAbs) : path.basename(srcAbs, ".md");
  const idx = typeof index === "number" && Number.isFinite(index) ? Math.max(0, Math.floor(index)) : Number.MAX_SAFE_INTEGER;

  if (targetRel === oldParentRel) {
    // 同级重排: 仅更新排序记录, 不动磁盘 (磁盘本身无序, 顺序由 note_orders 决定)
    const list = await childBasenames(userId, targetRel);
    const rest = list.filter((b) => b !== base);
    rest.splice(Math.min(idx, rest.length), 0, base);
    await saveChildOrder(userId, targetRel, rest);
  } else {
    // 跨文件夹移动: 磁盘移动 (重名自动追加序号) + 附件/排序记录同步
    const destAbs = uniquePath(targetAbs, safeName(base), isFolder);
    fs.renameSync(srcAbs, destAbs);
    const newRel = relOf(destAbs, rootOf(userId));
    await remapAttachmentNoteIds(userId, rel, newRel);
    await remapNoteOrderParentIds(userId, rel, newRel);
    const oldList = (await childBasenames(userId, oldParentRel)).filter((b) => b !== base);
    await saveChildOrder(userId, oldParentRel, oldList);
    const newBase = isFolder ? path.basename(destAbs) : path.basename(destAbs, ".md");
    const newList = (await childBasenames(userId, targetRel)).filter((b) => b !== newBase);
    newList.splice(Math.min(idx, newList.length), 0, newBase);
    await saveChildOrder(userId, targetRel, newList);
    const note = mkNote(userId, newRel, isFolder ? "folder" : "note", isFolder ? "" : fs.readFileSync(destAbs, "utf8"), false, fs.statSync(destAbs));
    return res.json({ success: true, message: "已移动", data: note });
  }

  const note = mkNote(userId, rel, isFolder ? "folder" : "note", isFolder ? "" : fs.readFileSync(srcAbs, "utf8"), false, fs.statSync(srcAbs));
  res.json({ success: true, message: "已排序", data: note });
}

// DELETE /api/notes/:id/permanent  彻底删除 (含后代及其附件)
export async function removePermanent(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const abs = absOf(userId, rel, true);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "回收站中不存在该项" });
  // 清理该节点及后代的附件
  const sub: Note[] = [];
  const isFolder = fs.statSync(abs).isDirectory();
  if (isFolder) walk(userId, abs, rel, true, sub);
  else sub.push(mkNote(userId, rel, "note", "", true, fs.statSync(abs)));
  const rels = sub.map((n) => n._id);
  const attachments = await findUserAttachments(userId);
  await deleteAttachmentRecords(attachments.filter((a) => a.noteId && rels.includes(a.noteId)));
  fs.rmSync(abs, { recursive: true, force: true });
  res.json({ success: true, message: "已彻底删除" });
}

// DELETE /api/notes/trash  清空回收站
export async function emptyTrash(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const trash = trashOf(userId);
  const attachments = await findUserAttachments(userId);
  const trashed: Note[] = [];
  walk(userId, trash, "", true, trashed);
  await deleteAttachmentRecords(attachments.filter((a) => a.noteId && trashed.some((t) => t._id === a.noteId)));
  fs.rmSync(trash, { recursive: true, force: true });
  res.json({ success: true, message: "回收站已清空" });
}

// POST /api/notes/wipe  数据清空 (全部笔记+附件+排序记录)
export async function wipe(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  fs.rmSync(rootOf(userId), { recursive: true, force: true });
  const attachments = await findUserAttachments(userId);
  await deleteAttachmentRecords(attachments);
  await new Promise<void>((resolve) => db.noteOrders.remove({ userId }, { multi: true }, () => resolve()));
  res.json({ success: true, message: "笔记数据已清空" });
}

// GET /api/notes/export  导出 zip (manifest + .md 文件树 + 附件)
export async function exportZip(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const notes: Note[] = [];
  walk(userId, rootOf(userId), "", false, notes);
  const attachments = await findUserAttachments(userId);

  const zip = new AdmZip();
  const manifest = {
    app: "quicklink-notes",
    version: 2,
    exportedAt: new Date().toISOString(),
    notes: notes.map((n) => ({
      id: n._id,
      type: n.type,
      title: n.title,
      content: n.content || "",
      parentId: n.parentId,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    attachments: attachments.map((a) => ({
      id: a._id,
      noteId: a.noteId,
      originalName: a.originalName,
      storedName: a.storedName,
      size: a.size,
      mimeType: a.mimeType,
      createdAt: a.createdAt,
    })),
  };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  // 可读 .md 文件树 (与存储结构一致)
  for (const n of notes) {
    if (n.type === "note") zip.addFile(`notes/${n._id}`, Buffer.from(n.content || "", "utf8"));
  }

  // 附件文件
  for (const a of attachments) {
    const file = path.join(env.ATTACH_DIR, a.storedName);
    if (fs.existsSync(file)) zip.addFile(`attachments/${a.storedName}`, fs.readFileSync(file));
  }

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="quicklink-notes-${date}.zip"`);
  res.send(zip.toBuffer());
}

// POST /api/notes/import  导入 zip (raw body)
export async function importZip(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ success: false, error: "请选择 zip 文件" });
  }
  let zip: AdmZip;
  try {
    zip = new AdmZip(body);
  } catch {
    return res.status(400).json({ success: false, error: "zip 文件解析失败" });
  }
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) {
    return res.status(400).json({ success: false, error: "缺少 manifest.json, 非 QuickLink 笔记导出包" });
  }
  let manifest: any;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, error: "manifest.json 解析失败" });
  }
  if (manifest?.app !== "quicklink-notes" || !Array.isArray(manifest.notes)) {
    return res.status(400).json({ success: false, error: "导出包格式不正确" });
  }

  ensureDir(rootOf(userId));
  // 旧 id → 新相对路径 (父级优先)
  const idMap = new Map<string, string>();
  const pending = [...(manifest.notes as any[])];
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const item = pending[i];
      const inPkg = manifest.notes.some((n: any) => n.id === item.parentId);
      if (item.parentId && !idMap.has(item.parentId) && inPkg) continue;
      const parentRel = item.parentId && idMap.has(item.parentId) ? idMap.get(item.parentId)! : null;
      const parentAbs = parentRel ? absOf(userId, parentRel) : rootOf(userId);
      if (!fs.existsSync(parentAbs) || !fs.statSync(parentAbs).isDirectory()) continue;
      const isFolder = item.type === "folder";
      const base = safeName(String(item.title || "未命名").replace(/\.md$/i, ""));
      const target = uniquePath(parentAbs, base, isFolder);
      if (isFolder) fs.mkdirSync(target);
      else fs.writeFileSync(target, String(item.content || ""), "utf8");
      const newRel = relOf(target, rootOf(userId));
      idMap.set(item.id, newRel);
      pending.splice(i, 1);
      progress = true;
    }
  }

  // 重建附件
  let attachmentCount = 0;
  for (const a of manifest.attachments || []) {
    const entry = zip.getEntry(`attachments/${a.storedName}`);
    if (!entry) continue;
    const ext = path.extname(a.originalName || a.storedName);
    const storedName = `${uuidv4()}${ext}`;
    ensureDir(env.ATTACH_DIR);
    fs.writeFileSync(path.join(env.ATTACH_DIR, storedName), entry.getData());
    await new Promise<void>((resolve, reject) => {
      db.attachments.insert(
        {
          _id: uuidv4(),
          userId,
          noteId: a.noteId && idMap.has(a.noteId) ? idMap.get(a.noteId)! : null,
          originalName: a.originalName || storedName,
          storedName,
          size: entry.header.size,
          mimeType: a.mimeType || "application/octet-stream",
          createdAt: a.createdAt || new Date().toISOString(),
        },
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    });
    attachmentCount++;
  }

  res.json({
    success: true,
    message: `导入成功: ${idMap.size} 个笔记, ${attachmentCount} 个附件`,
    data: { notes: idMap.size, attachments: attachmentCount },
  });
}

// GET /api/notes/:id/file-path  返回笔记文件的绝对路径
export function getFilePath(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  let abs: string;
  try {
    abs = absOf(userId, rel);
  } catch {
    return res.status(400).json({ success: false, error: "非法路径" });
  }
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "笔记文件不存在" });
  res.json({ success: true, data: { path: abs } });
}

// POST /api/notes/:id/open-folder  在系统文件管理器中打开笔记所在文件夹
export function openFolder(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  let abs: string;
  try {
    abs = absOf(userId, rel);
  } catch {
    return res.status(400).json({ success: false, error: "非法路径" });
  }
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "笔记文件不存在" });
  // 如果是文件, 打开其父目录; 如果是文件夹, 打开自身
  const target = fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
  const opts = { detached: true, stdio: "ignore" as const };
  if (process.platform === "win32") spawn("explorer.exe", [target], opts).unref();
  else if (process.platform === "darwin") spawn("open", [target], opts).unref();
  else spawn("xdg-open", [target], opts).unref();
  res.json({ success: true, message: "已打开所在文件夹" });
}
