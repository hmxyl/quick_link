import { readFileSync } from "fs";
const cm = readFileSync("c:/hmxy/workspace/quick_link/client/node_modules/@milkdown/preset-commonmark/lib/index.js", "utf8");
const crepe = readFileSync("c:/hmxy/workspace/quick_link/client/node_modules/@milkdown/crepe/lib/index.js", "utf8");

// 1) $remark 实现: 插件如何注入 remarkPluginsCtx
let i = cm.indexOf("$remark");
// 找 utils 里的定义 (可能在 @milkdown/utils)
const utils = readFileSync("c:/hmxy/workspace/quick_link/client/node_modules/@milkdown/utils/lib/index.js", "utf8");
const di = utils.indexOf("function $remark");
console.log("== $remark (utils) ==");
console.log(utils.slice(di, di + 900));

// 2) preset-commonmark 中 hardbreak 的 parseMarkdown / toMarkdown
const hb = cm.indexOf("$nodeSchema(\"hardbreak\"");
console.log("\n== hardbreak schema ==");
console.log(cm.slice(hb, hb + 1500));

// 3) Crepe 的 preset 注册方式
let k = 0; let n = 0;
while ((k = crepe.indexOf("preset", k + 1)) !== -1 && n < 40) {
  const line = crepe.slice(crepe.lastIndexOf("\n", k), crepe.indexOf("\n", k));
  if (/use\(|import|presetCommonmark|presetGfm/.test(line)) console.log("[crepe]", line.trim());
  n++;
}
