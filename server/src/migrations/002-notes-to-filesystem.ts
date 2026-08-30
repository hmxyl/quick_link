import path from "path";
import fs from "fs";
import Datastore from "@seald-io/nedb";
import { env } from "../config/env";
import { Migration } from "../services/migrateService";
import { DB } from "../config/database";

// v2: 旧 notes.db (NeDB) → 文件目录树 user_data/note/<userId>/...
// 文件夹=目录, 文档=.md 文件; 回收站中的旧数据直接丢弃;
// attachments.db 的 noteId 由旧 uuid 重写为新相对路径

function safeName(name: string): string {
  let cleaned = name.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "").trim();
  cleaned = cleaned.replace(/[. ]+$/, "");
  if (!cleaned || cleaned === ".trash") cleaned = "untitled";
  return cleaned;
}

const migration: Migration = {
  version: 2,
  name: "notes-to-filesystem",

  up: async (db: DB) => {
    const notesFile = path.join(env.DATA_DIR, "notes.db");
    if (!fs.existsSync(notesFile)) return;

    const store = new Datastore({ filename: notesFile, autoload: true });
    const docs: any[] = await new Promise((resolve, reject) => {
      store.find({}, (err: Error | null, d: any[]) => (err ? reject(err) : resolve(d || [])));
    });

    const live = docs.filter((d) => !d.deletedAt);
    const byId = new Map(live.map((d) => [d._id, d]));
    const idToRel = new Map<string, string>();

    // 父级优先创建
    const pending = [...live];
    let progress = true;
    while (pending.length && progress) {
      progress = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const d = pending[i];
        const parentInSet = d.parentId && byId.has(d.parentId);
        if (d.parentId && parentInSet && !idToRel.has(d.parentId)) continue;
        const isFolder = d.type === "folder";
        const root = path.join(env.DATA_DIR, "note", d.userId);
        const parentRel = d.parentId && idToRel.has(d.parentId) ? idToRel.get(d.parentId)! : null;
        const parentAbs = parentRel ? path.join(root, parentRel) : root;
        fs.mkdirSync(parentAbs, { recursive: true });
        const base = safeName(String(d.title || "untitled"));
        let candidate = path.join(parentAbs, base + (isFolder ? "" : ".md"));
        let n = 2;
        while (fs.existsSync(candidate)) {
          candidate = path.join(parentAbs, `${base} (${n})${isFolder ? "" : ".md"}`);
          n++;
        }
        if (isFolder) fs.mkdirSync(candidate);
        else fs.writeFileSync(candidate, String(d.content || ""), "utf8");
        idToRel.set(d._id, parentRel ? `${parentRel}/${path.basename(candidate)}` : path.basename(candidate));
        pending.splice(i, 1);
        progress = true;
      }
    }

    // 附件 noteId: 旧 uuid → 新相对路径
    const attachments: any[] = await new Promise((resolve, reject) => {
      db.attachments.find({}, (err: Error | null, d: any[]) => (err ? reject(err) : resolve(d || [])));
    });
    for (const a of attachments) {
      if (a.noteId && idToRel.has(a.noteId)) {
        await new Promise<void>((resolve) => {
          db.attachments.update({ _id: a._id }, { $set: { noteId: idToRel.get(a.noteId)! } }, {}, () => resolve());
        });
      }
    }

    try {
      fs.unlinkSync(notesFile);
    } catch {
      /* 遗留文件删除失败不影响启动 */
    }
    console.log(`[migrate] notes.db -> filesystem (${idToRel.size} notes)`);
  },

  // 文件化存储不可逆
  down: async () => {},
};

export = migration;
