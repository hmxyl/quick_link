// 1) remark-parse 对单元格内 <br /> 的原始解析结果
// 2) Crepe feature 列表里是否有影响表格/序列化的部件
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const md = `| A | B |
| --- | --- |
| line1<br />line2 | text |
`;

const tree = unified().use(remarkParse).use(remarkGfm).parse(md);
const cell = tree.children[0].children[1].children[0];
console.log("cell children types:", cell.children.map((n) => `${n.type}:${JSON.stringify(n.value ?? "")}`));
