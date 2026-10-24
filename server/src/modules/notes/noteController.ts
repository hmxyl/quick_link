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
import { openWithSystem } from "./attachmentController";

// 笔记以真实文件目录形式存储: DATA_DIR/note/<userId>/... (文件夹=目录, 文档=.md 文件, 其余文件原样收录)
// 节点 _id 为相对用户根目录的路径 (POSIX 分隔符), 回收站为根下隐藏目录 .trash

const TRASH = ".trash";

/** 仅 Markdown 走文本读写; 其他文件按二进制处理 (不读正文, 不可编辑) */
const isMarkdown = (name: string) => name.toLowerCase().endsWith(".md");

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

/** 同级重名自动追加 (n); name 为完整条目名 (文件含扩展名, 文件夹为目录名) */
function uniquePath(dir: string, name: string): string {
  const ext = path.extname(name);
  const stem = ext ? name.slice(0, name.length - ext.length) : name;
  let candidate = path.join(dir, name);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
    i++;
  }
  return candidate;
}

/** 重命名后的条目名: 文件夹原样, 文件未写扩展名时沿用原扩展名 */
function renamedName(oldName: string, newTitle: string, isFolder: boolean): string {
  const cleaned = safeName(newTitle);
  if (isFolder) return cleaned;
  const oldExt = path.extname(oldName);
  return oldExt && !path.extname(cleaned) ? cleaned + oldExt : cleaned;
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

function mkNote(userId: string, rel: string, type: Note["type"], content: string | undefined, deleted: boolean, st: fs.Stats): Note {
  return {
    _id: rel,
    userId,
    type,
    title: rel.split("/").pop() || rel,
    content,
    parentId: rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : null,
    deletedAt: deleted ? st.mtime.toISOString() : null,
    createdAt: st.birthtime.toISOString(),
    updatedAt: st.mtime.toISOString(),
  };
}

/** 由磁盘条目构造 Note: 目录=folder, .md=note(读正文), 其余=file(不读正文) */
function noteFromAbs(userId: string, abs: string, rel: string, deleted: boolean): Note {
  const st = fs.statSync(abs);
  if (st.isDirectory()) return mkNote(userId, rel, "folder", undefined, deleted, st);
  const isMd = isMarkdown(abs);
  let content: string | undefined;
  if (isMd) {
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      content = ""; // 读取失败按空内容
    }
  }
  return mkNote(userId, rel, isMd ? "note" : "file", content, deleted, st);
}

/** 同级默认比较: 文件夹在前, 同类型按中文名 */
function defaultCompare(a: fs.Dirent, b: fs.Dirent) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "zh-CN");
}

/**
 * 排序记录键: 目录名与非 .md 文件用完整名, .md 去掉后缀
 * .md 去后缀是为兼容既有 note_orders 记录 (显示名已改为含后缀, 但排序键保持不变)
 */
const orderKey = (name: string, isFolder: boolean) =>
  isFolder || !isMarkdown(name) ? name : name.slice(0, -3);

const orderKeyOf = (e: fs.Dirent) => orderKey(e.name, e.isDirectory());

/** 同级排序: 命中自定义顺序的在前 (按 order), 未命中的按默认规则排后 */
function sortEntries(ents: fs.Dirent[], orderArr: string[] | undefined): fs.Dirent[] {
  if (!orderArr?.length) return [...ents].sort(defaultCompare);
  const pos = new Map(orderArr.map((b, i) => [b, i]));
  return [...ents].sort((a, b) => {
    const ia = pos.get(orderKeyOf(a));
    const ib = pos.get(orderKeyOf(b));
    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;
    return defaultCompare(a, b);
  });
}

/** 深度优先遍历目录树, 收录全部文件夹与文件 (可选按自定义顺序排列同级) */
function walk(userId: string, dir: string, relBase: string, deleted: boolean, out: Note[], orderMap?: Map<string, string[]>) {
  if (!fs.existsSync(dir)) return;
  const ents = sortEntries(
    fs.readdirSync(dir, { withFileTypes: true }).filter((e) => relBase || e.name !== TRASH),
    orderMap?.get(relBase)
  );
  for (const ent of ents) {
    const abs = path.join(dir, ent.name);
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    try {
      out.push(noteFromAbs(userId, abs, rel, deleted));
    } catch {
      continue; // statSync 失败 (失效软链/无权限) 时跳过
    }
    if (ent.isDirectory()) walk(userId, abs, rel, deleted, out, orderMap);
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
function moveTo(srcAbs: string, destDir: string): string {
  ensureDir(destDir);
  const dest = uniquePath(destDir, path.basename(srcAbs));
  fs.renameSync(srcAbs, dest);
  return dest;
}

// ---- 自定义排序 (note_orders 集合) ----
// 文件系统本身无序, 顺序存 NeDB: { userId, parentId(根为""), order: [子项排序键, 见 orderKey] }
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

/** 某目录下子项排序键, 按当前显示顺序 (自定义顺序优先) */
async function childBasenames(userId: string, parentRel: string): Promise<string[]> {
  const dirAbs = parentRel ? absOf(userId, parentRel) : rootOf(userId);
  if (!fs.existsSync(dirAbs)) return [];
  const orderMap = await getOrderMap(userId);
  const ents = sortEntries(
    fs.readdirSync(dirAbs, { withFileTypes: true }).filter((e) => parentRel || e.name !== TRASH),
    orderMap.get(parentRel)
  );
  return ents.map(orderKeyOf);
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
  const target = uniquePath(parentAbs, type === "folder" ? base : `${base}.md`);
  if (type === "folder") fs.mkdirSync(target);
  else fs.writeFileSync(target, "", "utf8");
  const rel = relOf(target, rootOf(userId));
  res.json({ success: true, data: noteFromAbs(userId, target, rel, false) });
}

// PUT /api/notes/:id  更新标题/内容
export async function update(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  let abs = absOf(userId, rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "笔记不存在" });
  const isFolder = fs.statSync(abs).isDirectory();
  const { title, content } = req.body || {};

  // 仅 Markdown 可写正文; 其他文件按二进制存储, 写 utf8 会损坏文件
  if (typeof content === "string" && !isFolder && isMarkdown(abs)) {
    fs.writeFileSync(abs, content, "utf8");
  }

  let newRel = rel;
  if (typeof title === "string" && title.trim()) {
    const oldName = path.basename(abs);
    const newName = renamedName(oldName, title.trim(), isFolder);
    if (newName && newName !== oldName) {
      const target = uniquePath(path.dirname(abs), newName);
      fs.renameSync(abs, target);
      abs = target;
      newRel = relOf(target, rootOf(userId));
      await remapAttachmentNoteIds(userId, rel, newRel);
      // 同步自定义排序: 同级排序键替换 + (文件夹时) 后代排序记录路径前缀
      const oldKey = orderKey(oldName, isFolder);
      const parentRel = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      const arr = await getOrderArr(userId, parentRel);
      if (arr.length) {
        const newKey = orderKey(newName, isFolder);
        await saveChildOrder(userId, parentRel, arr.map((b) => (b === oldKey ? newKey : b)));
      }
      await remapNoteOrderParentIds(userId, rel, newRel);
    }
  }

  res.json({ success: true, data: noteFromAbs(userId, abs, newRel, false) });
}

// DELETE /api/notes/:id  软删除 (移入回收站, 整目录移动含后代; 排序条目保留, 还原后回到原位)
export async function remove(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const abs = absOf(userId, rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "笔记不存在" });
  moveTo(abs, path.join(trashOf(userId), path.dirname(rel) === "." ? "" : path.dirname(rel)));
  res.json({ success: true, message: "已移入回收站" });
}

// POST /api/notes/:id/restore  还原 (父级缺失时挂回根级)
export async function restore(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const abs = absOf(userId, rel, true);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "回收站中不存在该项" });
  const originParent = path.dirname(absOf(userId, rel));
  const dest =
    fs.existsSync(originParent) && fs.statSync(originParent).isDirectory()
      ? moveTo(abs, originParent)
      : moveTo(abs, rootOf(userId));
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
  const oldName = path.basename(srcAbs);
  const oldKey = orderKey(oldName, isFolder);
  const idx = typeof index === "number" && Number.isFinite(index) ? Math.max(0, Math.floor(index)) : Number.MAX_SAFE_INTEGER;

  if (targetRel === oldParentRel) {
    // 同级重排: 仅更新排序记录, 不动磁盘 (磁盘本身无序, 顺序由 note_orders 决定)
    const list = await childBasenames(userId, targetRel);
    const rest = list.filter((b) => b !== oldKey);
    rest.splice(Math.min(idx, rest.length), 0, oldKey);
    await saveChildOrder(userId, targetRel, rest);
  } else {
    // 跨文件夹移动: 磁盘移动 (重名自动追加序号) + 附件/排序记录同步
    const destAbs = uniquePath(targetAbs, oldName);
    fs.renameSync(srcAbs, destAbs);
    const newRel = relOf(destAbs, rootOf(userId));
    await remapAttachmentNoteIds(userId, rel, newRel);
    await remapNoteOrderParentIds(userId, rel, newRel);
    const oldList = (await childBasenames(userId, oldParentRel)).filter((b) => b !== oldKey);
    await saveChildOrder(userId, oldParentRel, oldList);
    const newKey = orderKey(path.basename(destAbs), isFolder);
    const newList = (await childBasenames(userId, targetRel)).filter((b) => b !== newKey);
    newList.splice(Math.min(idx, newList.length), 0, newKey);
    await saveChildOrder(userId, targetRel, newList);
    return res.json({ success: true, message: "已移动", data: noteFromAbs(userId, destAbs, newRel, false) });
  }

  res.json({ success: true, message: "已排序", data: noteFromAbs(userId, srcAbs, rel, false) });
}

// DELETE /api/notes/:id/permanent  彻底删除 (含后代及其附件)
export async function removePermanent(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  const abs = absOf(userId, rel, true);
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "回收站中不存在该项" });
  // 清理该节点及后代的附件
  const sub: Note[] = [];
  if (fs.statSync(abs).isDirectory()) walk(userId, abs, rel, true, sub);
  else sub.push(mkNote(userId, rel, "file", undefined, true, fs.statSync(abs)));
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

// GET /api/notes/export  导出 zip (manifest + 文件树副本 + 附件)
export async function exportZip(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const notes: Note[] = [];
  walk(userId, rootOf(userId), "", false, notes);
  const attachments = await findUserAttachments(userId);

  const zip = new AdmZip();
  const manifest = {
    app: "quicklink-notes",
    version: 3,
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

  // 文件树副本 (与存储结构一致): .md 写文本, 其他文件按原始字节拷贝
  for (const n of notes) {
    if (n.type === "folder") continue;
    const abs = path.join(rootOf(userId), n._id);
    if (!fs.existsSync(abs)) continue;
    zip.addFile(`notes/${n._id}`, n.type === "note" ? Buffer.from(n.content || "", "utf8") : fs.readFileSync(abs));
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
      const title = String(item.title || "未命名");
      // note 的 title 在 v2 包中不含 .md, v3 起为完整文件名 → 统一去后缀再补 .md
      const name = item.type === "note" ? `${safeName(title.replace(/\.md$/i, ""))}.md` : safeName(title);
      const target = uniquePath(parentAbs, name);
      if (item.type === "folder") {
        fs.mkdirSync(target);
      } else if (item.type === "note") {
        fs.writeFileSync(target, String(item.content || ""), "utf8");
      } else {
        // 非 .md 文件的正文只存在于 zip 条目中, 条目缺失时无法还原
        const rawEntry = zip.getEntry(`notes/${item.id}`);
        if (!rawEntry) continue;
        fs.writeFileSync(target, rawEntry.getData());
      }
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

// POST /api/notes/:id/open-file  用系统默认程序打开笔记目录下的文件
export function openFile(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  let abs: string;
  try {
    abs = absOf(userId, rel);
  } catch {
    return res.status(400).json({ success: false, error: "非法路径" });
  }
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "文件不存在" });
  if (fs.statSync(abs).isDirectory()) {
    return res.status(400).json({ success: false, error: "文件夹请用「打开于资源管理器」" });
  }
  openWithSystem(abs);
  res.json({ success: true, message: "已打开文件" });
}

// ---- Typora 编辑支持 ----

/** 查找 Typora 可执行文件路径 (找到返回绝对路径, 未找到返回 null) */
function findTypora(): string | null {
  const { execSync } = require("child_process") as typeof import("child_process");
  if (process.platform === "win32") {
    const candidates = [
      path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Typora", "Typora.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Typora", "Typora.exe"),
      path.join(process.env["LOCALAPPDATA"] || "", "Programs", "Typora", "Typora.exe"),
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }
    // 从 Windows 注册表查找安装路径 (支持自定义安装位置)
    try {
      const { execSync: exec } = require("child_process") as typeof import("child_process");
      const regPaths = [
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      ];
      for (const regPath of regPaths) {
        const result = exec(`reg query "${regPath}" /s /f "Typora" /reg:64 2>nul`, { encoding: "utf8" });
        const locMatch = result.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
        if (locMatch) {
          const exe = path.join(locMatch[1].trim(), "Typora.exe");
          if (fs.existsSync(exe)) return exe;
        }
      }
    } catch { /* 注册表查询失败 */ }
    try {
      const result = execSync("where Typora.exe 2>nul", { encoding: "utf8" }).trim();
      if (result) return result.split("\n")[0].trim();
    } catch { /* 未找到 */ }
  } else if (process.platform === "darwin") {
    const appPath = "/Applications/Typora.app/Contents/MacOS/Typora";
    if (fs.existsSync(appPath)) return appPath;
    try {
      const result = execSync("which Typora 2>/dev/null || mdfind -name 'Typora.app' 2>/dev/null | head -1", { encoding: "utf8" }).trim();
      if (result) {
        if (result.endsWith(".app")) return `${result}/Contents/MacOS/Typora`;
        return result;
      }
    } catch { /* 未找到 */ }
  } else {
    try {
      const result = execSync("which typora 2>/dev/null", { encoding: "utf8" }).trim();
      if (result) return result;
    } catch { /* 未找到 */ }
  }
  return null;
}

// POST /api/notes/:id/open-in-typora  使用 Typora 打开笔记
export function openInTypora(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rel = req.params.id;
  let abs: string;
  try {
    abs = absOf(userId, rel);
  } catch {
    return res.status(400).json({ success: false, error: "非法路径" });
  }
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: "笔记文件不存在" });
  if (fs.statSync(abs).isDirectory()) {
    return res.status(400).json({ success: false, error: "无法用 Typora 打开文件夹" });
  }
  if (!isMarkdown(abs)) {
    return res.status(400).json({ success: false, error: "仅 Markdown 文档可用 Typora 打开" });
  }
  const typoraPath = findTypora();
  if (!typoraPath) {
    return res.status(404).json({ success: false, error: "未检测到 Typora, 请先安装 Typora" });
  }
  const opts = { detached: true, stdio: "ignore" as const };
  spawn(typoraPath, [abs], opts).unref();
  res.json({ success: true, message: "已在 Typora 中打开" });
}
