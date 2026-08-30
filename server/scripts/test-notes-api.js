// Notes API smoke test (run: node scripts/test-notes-api.js)
// 笔记 id 为相对路径 (可含 "/"), 拼入 URL 前统一 encode
const BASE = "http://localhost:3000/api";
const enc = (id) => encodeURIComponent(id);
let TOKEN = "";

async function api(method, path, body, raw) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (!raw && body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data };
}

function log(name, ok, extra) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  // login
  const login = await api("POST", "/auth/login", { username: "uitest", password: "uitest123" });
  TOKEN = login.data.data.token;
  log("login", login.status === 200);

  // create folder + note
  const folder = await api("POST", "/notes", { type: "folder", title: "工作" });
  log("create folder", folder.status === 200, folder.data.data._id);
  const note = await api("POST", "/notes", { type: "note", title: "周报", parentId: folder.data.data._id });
  log("create note in folder", note.status === 200);
  const upd = await api("PUT", `/notes/${enc(note.data.data._id)}`, { content: "# 周报\n\n- **重点** 内容" });
  log("update content", upd.status === 200);

  // attachment upload (raw bytes) — 在重命名前上传, 验证重命名后 noteId 自动重映射
  const fileBody = Buffer.from("hello attachment 附件内容");
  const up = await fetch(`${BASE}/notes/attachments?noteId=${encodeURIComponent(note.data.data._id)}&name=${encodeURIComponent("说明.txt")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
    body: fileBody,
  });
  const upJson = await up.json();
  log("upload attachment", up.status === 200, upJson.data && upJson.data.storedName);

  // rename (title 变更 → 磁盘文件重命名 + 附件 noteId 前缀重映射)
  const ren = await api("PUT", `/notes/${enc(folder.data.data._id)}`, { title: "工作资料" });
  log("rename folder", ren.status === 200, ren.data.data && ren.data.data._id);
  const attAfter = await api("GET", "/notes/attachments");
  log("attachment noteId remapped", attAfter.data.data.some((a) => a.noteId === "工作资料/周报.md"));

  const listAtt = await api("GET", "/notes/attachments");
  log("list attachments", listAtt.status === 200 && listAtt.data.data.length >= 1);

  const dl = await api("GET", `/notes/attachments/${upJson.data._id}/download`);
  const dlText = Buffer.from(dl.data).toString();
  log("download attachment", dl.status === 200 && dlText === fileBody.toString(), dlText);

  // export zip
  const exp = await api("GET", "/notes/export");
  const zipBuf = Buffer.from(exp.data);
  log("export zip", exp.status === 200 && zipBuf.length > 100 && zipBuf[0] === 0x50 && zipBuf[1] === 0x4b, `${zipBuf.length}B`);

  // trash flow: soft delete -> list -> restore
  const folderId = ren.data.data._id;
  const del = await api("DELETE", `/notes/${enc(folderId)}`);
  log("soft delete folder", del.status === 200);
  let lst = await api("GET", "/notes");
  const deleted = lst.data.data.filter((n) => n.deletedAt);
  log("in trash (folder+note)", deleted.length >= 2);
  const rst = await api("POST", `/notes/${enc(folderId)}/restore`);
  log("restore", rst.status === 200);
  lst = await api("GET", "/notes");
  log("restored (no deleted)", lst.data.data.filter((n) => n.deletedAt).length === 0);

  // permanent delete of a scratch note
  const scratch = await api("POST", "/notes", { type: "note", title: "临时" });
  await api("DELETE", `/notes/${enc(scratch.data.data._id)}`);
  const perm = await api("DELETE", `/notes/${enc(scratch.data.data._id)}/permanent`);
  log("permanent delete", perm.status === 200);

  // import zip (same exported buffer)
  const imp = await api("POST", "/notes/import", zipBuf, true);
  log("import zip", imp.status === 200, imp.data.message);

  // wipe
  const wipe = await api("POST", "/notes/wipe");
  log("wipe", wipe.status === 200);
  lst = await api("GET", "/notes");
  log("empty after wipe", lst.data.data.length === 0);
  const lstAtt = await api("GET", "/notes/attachments");
  log("attachments empty after wipe", lstAtt.data.data.length === 0);

  console.log("DONE");
})().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
