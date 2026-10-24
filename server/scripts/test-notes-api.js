// Notes API smoke test (run: node scripts/test-notes-api.js)
// 笔记 id 为相对路径 (可含 "/"), 拼入 URL 前统一 encode
// 目标后端可用 API_BASE 覆盖 (脚本结尾会 wipe 笔记数据, 勿指向生产实例)
const BASE = `${process.env.API_BASE || "http://localhost:3000"}/api`;
const AdmZip = require("adm-zip");
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

  // 清空残留数据, 保证重复运行时断言稳定 (重名不会追加 " (2)")
  await api("POST", "/notes/wipe");

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

  // 非 Markdown 文件: 目录全量纳管 + 二进制安全 (应用不支持新建非 md 文件, 用导入构造)
  const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0xff, 0xd9]);
  const pkg = new AdmZip();
  pkg.addFile(
    "manifest.json",
    Buffer.from(
      JSON.stringify({
        app: "quicklink-notes",
        version: 3,
        notes: [
          { id: "混合", type: "folder", title: "混合", content: "", parentId: null },
          { id: "混合/年度报告.pdf", type: "file", title: "年度报告.pdf", content: "", parentId: "混合" },
          { id: "混合/备忘.md", type: "note", title: "备忘.md", content: "# 备忘", parentId: "混合" },
        ],
        attachments: [],
      }),
      "utf8"
    )
  );
  pkg.addFile("notes/混合/年度报告.pdf", pdfBytes);
  const mixImp = await api("POST", "/notes/import", pkg.toBuffer(), true);
  log("import mixed files", mixImp.status === 200, mixImp.data.message);

  lst = await api("GET", "/notes");
  const pdf = lst.data.data.find((n) => n._id === "混合/年度报告.pdf");
  const md = lst.data.data.find((n) => n._id === "混合/备忘.md");
  log("non-md file listed as type=file", !!pdf && pdf.type === "file" && pdf.title === "年度报告.pdf");
  log("non-md file carries no content", !!pdf && pdf.content == null);
  log("md title keeps extension", !!md && md.type === "note" && md.title === "备忘.md" && md.content === "# 备忘");

  // 对非 md 文件写 content 应被忽略: 导出仍是原始字节 (二进制不被破坏)
  await api("PUT", `/notes/${enc(pdf._id)}`, { content: "覆盖成文本" });
  const exp2 = await api("GET", "/notes/export");
  const pdfBack = new AdmZip(Buffer.from(exp2.data)).getEntry("notes/混合/年度报告.pdf");
  log("non-md bytes preserved after content update", !!pdfBack && Buffer.from(pdfBack.getData()).equals(pdfBytes));

  // 重命名省略扩展名时沿用原扩展名
  const renPdf = await api("PUT", `/notes/${enc(pdf._id)}`, { title: "年报" });
  log("rename keeps original extension", renPdf.status === 200 && renPdf.data.data._id === "混合/年报.pdf", renPdf.data.data && renPdf.data.data._id);

  // 打开类接口只验证拒绝分支, 不实际拉起 GUI
  const openDir = await api("POST", `/notes/${enc("混合")}/open-file`);
  log("open-file rejects folder", openDir.status === 400);
  const openMissing = await api("POST", `/notes/${enc("混合/不存在.pdf")}/open-file`);
  log("open-file 404 on missing file", openMissing.status === 404);
  const typoraPdf = await api("POST", `/notes/${enc(renPdf.data.data._id)}/open-in-typora`);
  log("typora rejects non-md", typoraPdf.status === 400, typoraPdf.data.error);

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
