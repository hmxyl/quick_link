// 图片尺寸的 Markdown 存储约定 (两种编辑模式 + 只读预览共用):
// 尺寸编码在图片 title 中, 形如 "ql-size:640x180" (宽x高, 单位像素; 可只填其一, 如 "ql-size:640x" 或 "ql-size:x180")
// - 所见即所得: Milkdown 图片节点 (image.title / image-block.caption) 携带编码, 由编辑器 DOM 插件解析并应用样式
// - 源码+预览与只读预览: marked 自定义渲染器解析 title 并输出 <img width/height>
// - 往返稳定: 该编码经 remark 序列化后原样保留, 不影响标准 Markdown 兼容性
export interface ImageSize {
  width?: number;
  height?: number;
}

export interface ParsedImageTitle {
  /** 去掉尺寸代码后的剩余 title (即图片说明/描述) */
  rest: string;
  size: ImageSize;
}

const SIZE_PATTERN = /(?:^|\s)ql-size:(\d{0,4})[x×](\d{0,4})(?=\s|$)/i;

export function parseImageTitle(title: string | null | undefined): ParsedImageTitle {
  const raw = (title || "").trim();
  if (!raw) return { rest: "", size: {} };
  const m = raw.match(SIZE_PATTERN);
  if (!m) return { rest: raw, size: {} };
  const size: ImageSize = {};
  if (m[1]) size.width = Number(m[1]);
  if (m[2]) size.height = Number(m[2]);
  const rest = raw.replace(m[0], " ").replace(/\s+/g, " ").trim();
  return { rest, size };
}

/** 组合 title: 说明 + 尺寸编码; 无尺寸且无说明时返回 null */
export function composeImageTitle(rest: string | null | undefined, size?: ImageSize): string | null {
  const desc = (rest || "").trim();
  const w = size?.width;
  const h = size?.height;
  if (!w && !h) return desc || null;
  const code = `ql-size:${w ?? ""}x${h ?? ""}`;
  return desc ? `${desc} ${code}` : code;
}
