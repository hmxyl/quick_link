import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";
import { Link, ListQuery } from "../../types";
import { isLegacyCipher } from "../../services/cryptoService";

// 旧版主密码密文已无法解密, 转为占位提示
function plainValue(v?: string): string | null {
  if (!v) return null;
  return isLegacyCipher(v) ? "(旧版密文, 无法查看)" : v;
}

// Normalize a URL: convert local file paths to file:/// URLs
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  // Already a valid URL scheme
  if (/^(https?|ftp|file):\/\//i.test(trimmed)) return trimmed;
  // Windows path: C:\... or C:/...
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    const normalized = trimmed.replace(/\\/g, "/");
    return "file:///" + normalized;
  }
  // UNC path: \\server\share
  if (trimmed.startsWith("\\\\")) {
    return "file://" + trimmed.replace(/\\/g, "/");
  }
  // Unix path: /home/...
  if (trimmed.startsWith("/")) {
    return "file://" + trimmed;
  }
  // Looks like a domain, add https://
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) {
    return "https://" + trimmed;
  }
  return trimmed;
}

// Extract a readable title from URL
function titleFromUrl(url: string): string {
  try {
    if (url.startsWith("file://")) {
      const path = decodeURIComponent(url.replace("file:///", "").replace("file://", ""));
      const name = path.split(/[/\\]/).pop() || path;
      return name;
    }
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : " - " + decodeURIComponent(u.pathname).replace(/\//g, " ").trim();
    return host + path;
  } catch {
    return url;
  }
}

// Built-in icon names (default icon library, synced with client ICON_LIBRARY)
export const BUILTIN_ICONS = [
  "link", "globe", "github", "file", "folder",
  "video", "shopping", "mail", "music", "database",
  "code", "cloud", "book", "picture", "home",
  "tool", "safety", "rocket", "star", "heart",
  "bank", "car", "coffee", "gift", "medicine",
];

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchWithTimeout(url: string, timeoutMs: number, method: "GET" | "HEAD" = "GET"): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      method,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (QuickLink Metadata Fetcher)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

// Probe the conventional /favicon.ico location
async function probeFavicon(origin: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(origin + "/favicon.ico", 3000, "HEAD");
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/") || ct.includes("icon") || ct.startsWith("application/octet-stream")) {
        return origin + "/favicon.ico";
      }
    }
  } catch { /* ignore */ }
  return null;
}

// Fetch title / description / favicon from a web page
async function fetchLinkMetadata(url: string): Promise<{ title?: string; description?: string; icon?: string }> {
  const result: { title?: string; description?: string; icon?: string } = {};
  try {
    const res = await fetchWithTimeout(url, 5000);
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("html") || contentType.includes("text")) {
        // Only parse the head portion to keep it fast
        const html = (await res.text()).slice(0, 200000);

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) result.title = decodeHtmlEntities(titleMatch[1].trim());

        const descMatch =
          html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
          html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        if (descMatch) result.description = decodeHtmlEntities(descMatch[1].trim());

        const iconLink = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/i);
        if (iconLink) {
          const hrefMatch = iconLink[0].match(/href=["']([^"']+)["']/i);
          if (hrefMatch) {
            try {
              result.icon = new URL(hrefMatch[1], url).href;
            } catch { /* ignore */ }
          }
        }
      }
    }
  } catch { /* network error / timeout, fall through */ }

  // Fallback: probe /favicon.ico
  if (!result.icon) {
    try {
      const origin = new URL(url).origin;
      result.icon = (await probeFavicon(origin)) || undefined;
    } catch { /* ignore */ }
  }

  return result;
}

export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const query = req.query as ListQuery;
    const page = parseInt(query.page || "1", 10);
    const limit = Math.min(parseInt(query.limit || "20", 10), 100);
    const skip = (page - 1) * limit;

    const filter: any = { userId: req.userId };
    if (query.favorite === "true") filter.isFavorite = true;
    if (query.tag) filter.tags = query.tag;
    if (query.search) {
      filter.$or = [
        { title: { $regex: new RegExp(query.search, "i") } },
        { url: { $regex: new RegExp(query.search, "i") } },
        { description: { $regex: new RegExp(query.search, "i") } },
      ];
    }

    const sortField = query.sort?.startsWith("-") ? query.sort.slice(1) : "createdAt";
    const sortOrder = query.sort?.startsWith("-") ? -1 : 1;

    const [docs, countResult] = await Promise.all([
      new Promise<Link[]>((resolve, reject) => {
        db.links.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit).exec((err, docs) => {
          if (err) reject(err);
          else resolve(docs as Link[]);
        });
      }),
      new Promise<number>((resolve, reject) => {
        db.links.count(filter, (err, count) => {
          if (err) reject(err);
          else resolve(count);
        });
      }),
    ]);

    // Strip encrypted fields from list view, expose hasAccount flag
    const safeData = docs.map((doc) => ({
      _id: doc._id,
      url: doc.url,
      title: doc.title,
      description: doc.description,
      icon: doc.icon,
      tags: doc.tags,
      isFavorite: doc.isFavorite,
      isArchived: doc.isArchived,
      clickCount: doc.clickCount,
      hasAccount: doc.hasAccount || false,
      accountCount: doc.accounts?.length || 0,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    const total = countResult;
    res.json({
      success: true,
      data: safeData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const link: Link | null = await new Promise((resolve, reject) => {
      db.links.findOne({ _id: req.params.id, userId: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Link | null);
      });
    });

    if (!link) {
      res.status(404).json({ success: false, error: "Link not found" });
      return;
    }

    res.json({ success: true, data: link });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { url, title, description, icon, tags, accounts } = req.body;

    // URL 可为空: 空 URL 时跳过归一化与元数据抓取
    const hasUrl = !!url && String(url).trim();
    const normalizedUrl = hasUrl ? normalizeUrl(url) : "";
    let effectiveTitle = title?.trim() || (hasUrl ? titleFromUrl(normalizedUrl) : "");
    let effectiveDescription = description?.trim() || undefined;
    let effectiveIcon = icon as string | undefined;
    const now = new Date().toISOString();

    // Auto icon / metadata assignment (仅有 URL 时执行)
    if (hasUrl && normalizedUrl.startsWith("file://")) {
      if (!effectiveIcon) effectiveIcon = "folder";
    } else if (hasUrl && /^https?:\/\//i.test(normalizedUrl)) {
      const needMeta = !effectiveIcon || !title?.trim() || !description?.trim();
      if (needMeta) {
        const meta = await fetchLinkMetadata(normalizedUrl);
        if (!effectiveIcon) effectiveIcon = meta.icon || "globe";
        if (!title?.trim() && meta.title) effectiveTitle = meta.title;
        if (!effectiveDescription && meta.description) effectiveDescription = meta.description;
      }
      if (!effectiveIcon) effectiveIcon = "globe";
    } else if (!hasUrl && !effectiveIcon) {
      effectiveIcon = "link";
    }

    // Determine if this link has account credentials (多个账号; 无密码的条目忽略)
    const validAccounts: any[] = Array.isArray(accounts)
      ? accounts.filter((a: any) => a && typeof a.password === "string" && a.password.trim())
      : [];
    const hasAccount = validAccounts.length > 0;

    const link: any = {
      _id: uuidv4(),
      userId: req.userId!,
      url: normalizedUrl,
      title: effectiveTitle,
      description: effectiveDescription,
      icon: effectiveIcon,
      tags: tags || [],
      isFavorite: false,
      isArchived: false,
      clickCount: 0,
      hasAccount,
      accounts: [] as any[],
      createdAt: now,
      updatedAt: now,
    };

    // 账号条目明文存储 (已移除主密码加密)
    if (hasAccount) {
      link.accounts = validAccounts.map((a: any) => {
        const entry: any = { _id: uuidv4(), password: a.password, createdAt: now };
        if (a.username) entry.username = a.username;
        if (a.email) entry.email = a.email;
        if (a.notes) entry.notes = a.notes;
        return entry;
      });
      link.passwordUpdatedAt = now;
    }

    await new Promise<void>((resolve, reject) => {
      db.links.insert(link, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.status(201).json({ success: true, data: { _id: link._id, url: link.url, title: link.title, icon: link.icon, hasAccount: link.hasAccount, createdAt: link.createdAt } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 按 URL 精确搜索已有链接 (用于添加时去重提示)
export async function searchByUrl(req: AuthRequest, res: Response): Promise<void> {
  try {
    const url = req.query.url as string;
    if (!url) {
      res.json({ success: true, data: [] });
      return;
    }
    const normalizedUrl = normalizeUrl(url);
    const docs: Link[] = await new Promise((resolve, reject) => {
      db.links.find({ userId: req.userId, url: normalizedUrl }).sort({ createdAt: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs as Link[]);
      });
    });
    const safeData = docs.map((doc) => ({
      _id: doc._id,
      url: doc.url,
      title: doc.title,
      description: doc.description,
      icon: doc.icon,
      tags: doc.tags,
      hasAccount: doc.hasAccount || false,
      accountCount: doc.accounts?.length || 0,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
    res.json({ success: true, data: safeData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 批量设置标签 (覆盖选中链接的标签)
export async function batchUpdateTags(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids, tags, mode } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: "请选择至少一个链接" });
      return;
    }
    if (!Array.isArray(tags)) {
      res.status(400).json({ success: false, error: "标签参数无效" });
      return;
    }
    // mode: "set"=覆盖 / "add"=追加 / "remove"=移除, 默认 set
    const op = mode === "add" || mode === "remove" ? mode : "set";
    let count = 0;
    for (const id of ids) {
      const link: Link | null = await new Promise((resolve, reject) => {
        db.links.findOne({ _id: id, userId: req.userId }, (err, doc) => {
          if (err) reject(err);
          else resolve(doc as Link | null);
        });
      });
      if (!link) continue;
      let newTags: string[];
      if (op === "add") {
        const merged = new Set([...(link.tags || []), ...tags]);
        newTags = [...merged];
      } else if (op === "remove") {
        const removeSet = new Set(tags);
        newTags = (link.tags || []).filter((t) => !removeSet.has(t));
      } else {
        newTags = [...tags];
      }
      await new Promise<void>((resolve, reject) => {
        db.links.update(
          { _id: id, userId: req.userId },
          { $set: { tags: newTags, updatedAt: new Date().toISOString() } },
          {},
          (err) => (err ? reject(err) : resolve())
        );
      });
      count++;
    }
    res.json({ success: true, message: `已更新 ${count} 条链接的标签`, data: { count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const updates: any = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates._id;
    delete updates.userId;
    delete updates.createdAt;
    // 账号凭据由 /:id/accounts 子接口管理, 基础更新不触碰密文字段
    delete updates.hasAccount;
    delete updates.accounts;
    delete updates.passwordUpdatedAt;

    const updated: number = await new Promise((resolve, reject) => {
      db.links.update(
        { _id: req.params.id, userId: req.userId },
        { $set: updates },
        { returnUpdatedDocs: true },
        (err, numAffected) => {
          if (err) reject(err);
          else resolve(numAffected);
        }
      );
    });

    if (updated === 0) {
      res.status(404).json({ success: false, error: "Link not found" });
      return;
    }

    const link: Link | null = await new Promise((resolve, reject) => {
      db.links.findOne({ _id: req.params.id }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Link | null);
      });
    });

    res.json({ success: true, data: { _id: link?._id, url: link?.url, title: link?.title, hasAccount: link?.hasAccount } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const removed: number = await new Promise((resolve, reject) => {
      db.links.remove({ _id: req.params.id, userId: req.userId }, {}, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });

    if (removed === 0) {
      res.status(404).json({ success: false, error: "Link not found" });
      return;
    }

    res.json({ success: true, message: "Link deleted" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete all links for the current user
export async function clearAll(req: AuthRequest, res: Response): Promise<void> {
  try {
    const removed: number = await new Promise((resolve, reject) => {
      db.links.remove({ userId: req.userId }, { multi: true }, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
    res.json({ success: true, message: `已清空 ${removed} 条链接`, data: { count: removed } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Batch delete links by IDs
export async function batchRemove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: "请选择至少一个链接" });
      return;
    }
    const removed: number = await new Promise((resolve, reject) => {
      db.links.remove({ _id: { $in: ids }, userId: req.userId }, { multi: true }, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
    res.json({ success: true, message: `已删除 ${removed} 条链接`, data: { count: removed } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function batchImport(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { links: importLinks, customIcons: importIcons, tags: importTags } = req.body;
    if (!Array.isArray(importLinks) || importLinks.length === 0) {
      res.status(400).json({ success: false, error: "Links array is required" });
      return;
    }

    const now = new Date().toISOString();

    // 导入自定义图标 (按 URL 去重, 已存在则跳过)
    let iconCount = 0;
    if (Array.isArray(importIcons) && importIcons.length > 0) {
      const existingIcons: any[] = await new Promise((resolve, reject) => {
        db.customIcons.find({ userId: req.userId }).exec((err, docs) => {
          if (err) reject(err);
          else resolve(docs as any[]);
        });
      });
      const existingUrls = new Set(existingIcons.map((c) => c.url));
      const newIcons = importIcons
        .filter((c: any) => c.url && /^https?:\/\//i.test(c.url) && !existingUrls.has(c.url))
        .map((c: any) => ({
          _id: uuidv4(),
          userId: req.userId,
          url: c.url,
          label: c.label || undefined,
          createdAt: now,
        }));
      if (newIcons.length > 0) {
        await new Promise<void>((resolve, reject) => {
          db.customIcons.insert(newIcons, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        iconCount = newIcons.length;
      }
    }

    // 导入标签 (按名称去重, 已存在则跳过)
    let tagCount = 0;
    if (Array.isArray(importTags) && importTags.length > 0) {
      const existingTags: any[] = await new Promise((resolve, reject) => {
        db.tags.find({ userId: req.userId }).exec((err, docs) => {
          if (err) reject(err);
          else resolve(docs as any[]);
        });
      });
      const existingNames = new Set(existingTags.map((t) => t.name));
      const newTags = importTags
        .filter((t: any) => t.name && !existingNames.has(t.name))
        .map((t: any) => ({
          _id: uuidv4(),
          userId: req.userId,
          name: t.name,
          color: t.color || undefined,
          createdAt: now,
        }));
      if (newTags.length > 0) {
        await new Promise<void>((resolve, reject) => {
          db.tags.insert(newTags, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        tagCount = newTags.length;
      }
    }

    // 导入链接 (包含 icon 字段)
    const docs = importLinks.map((item: any) => ({
      _id: uuidv4(),
      userId: req.userId,
      url: item.url || "",
      title: item.title || item.url || "",
      description: item.description,
      icon: item.icon || undefined,
      tags: item.tags || [],
      isFavorite: item.isFavorite || false,
      isArchived: item.isArchived || false,
      clickCount: item.clickCount || 0,
      hasAccount: false,
      accounts: [],
      createdAt: now,
      updatedAt: now,
    }));

    const inserted: number = await new Promise((resolve, reject) => {
      db.links.insert(docs as any, (err, newDocs) => {
        if (err) reject(err);
        else resolve(Array.isArray(newDocs) ? newDocs.length : 1);
      });
    });

    const parts = [`${inserted} 条链接`];
    if (iconCount > 0) parts.push(`${iconCount} 个图标`);
    if (tagCount > 0) parts.push(`${tagCount} 个标签`);
    res.status(201).json({ success: true, message: `已导入 ${parts.join("、")}`, data: { count: inserted, iconCount, tagCount } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function exportLinks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const format = req.query.format === "csv" ? "csv" : "json";
    const links: Link[] = await new Promise((resolve, reject) => {
      db.links.find({ userId: req.userId }).sort({ createdAt: -1 }).exec((err, docs) => {
        if (err) reject(err);
        else resolve(docs as Link[]);
      });
    });

    if (format === "csv") {
      const header = "URL,Title,Description,Tags,Icon\n";
      const rows = links
        .map((l) => `"${l.url}","${l.title}","${l.description || ""}","${(l.tags || []).join(";")}","${l.icon || ""}"`)
        .join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=links.csv");
      res.send(header + rows);
    } else {
      // JSON 导出: 包含链接、标签、自定义图标
      const [customIcons, tags] = await Promise.all([
        new Promise<any[]>((resolve, reject) => {
          db.customIcons.find({ userId: req.userId }).sort({ createdAt: -1 }).exec((err, docs) => {
            if (err) reject(err);
            else resolve(docs as any[]);
          });
        }),
        new Promise<any[]>((resolve, reject) => {
          db.tags.find({ userId: req.userId }).sort({ createdAt: -1 }).exec((err, docs) => {
            if (err) reject(err);
            else resolve(docs as any[]);
          });
        }),
      ]);
      // 链接数据去掉 userId 与 accounts (账号单独管理, 不随导出)
      const safeLinks = links.map((l) => ({
        url: l.url,
        title: l.title,
        description: l.description,
        icon: l.icon,
        tags: l.tags || [],
        isFavorite: l.isFavorite,
        isArchived: l.isArchived,
        clickCount: l.clickCount,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      }));
      // 图标/标签去 userId
      const safeIcons = customIcons.map((c) => ({ url: c.url, label: c.label, createdAt: c.createdAt }));
      const safeTags = tags.map((t) => ({ name: t.name, color: t.color, createdAt: t.createdAt }));
      res.json({ success: true, data: safeLinks, customIcons: safeIcons, tags: safeTags });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getSecrets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const link: Link | null = await new Promise((resolve, reject) => {
      db.links.findOne({ _id: req.params.id, userId: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Link | null);
      });
    });

    if (!link) {
      res.status(404).json({ success: false, error: "Link not found" });
      return;
    }

    // 凭据明文存储, 直接返回; 无关联账号时返回空列表 (前端可直接追加)
    const accounts = (link.accounts || []).map((a) => ({
      _id: a._id,
      username: plainValue(a.username),
      email: plainValue(a.email),
      password: plainValue(a.password) || "",
      notes: plainValue(a.notes),
    }));
    res.json({ success: true, data: { accounts } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 为链接追加一个关联账号 (明文存储)
export async function addAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { username, email, password, notes } = req.body;
    if (!password || !String(password).trim()) {
      res.status(400).json({ success: false, error: "账号密码不能为空" });
      return;
    }

    const link: Link | null = await new Promise((resolve, reject) => {
      db.links.findOne({ _id: req.params.id, userId: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Link | null);
      });
    });
    if (!link) {
      res.status(404).json({ success: false, error: "Link not found" });
      return;
    }

    const now = new Date().toISOString();
    const entry: any = { _id: uuidv4(), password, createdAt: now };
    if (username) entry.username = username;
    if (email) entry.email = email;
    if (notes) entry.notes = notes;

    await new Promise<void>((resolve, reject) => {
      db.links.update(
        { _id: link._id },
        { $set: { accounts: [...(link.accounts || []), entry], hasAccount: true, passwordUpdatedAt: now, updatedAt: now } },
        {},
        (err) => (err ? reject(err) : resolve())
      );
    });

    res.status(201).json({ success: true, message: "账号已添加", data: { _id: entry._id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 编辑链接下的指定关联账号
export async function updateAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { username, email, password, notes } = req.body;
    if (!password || !String(password).trim()) {
      res.status(400).json({ success: false, error: "账号密码不能为空" });
      return;
    }

    const link: Link | null = await new Promise((resolve, reject) => {
      db.links.findOne({ _id: req.params.id, userId: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Link | null);
      });
    });
    if (!link) {
      res.status(404).json({ success: false, error: "Link not found" });
      return;
    }

    const accounts = link.accounts || [];
    const idx = accounts.findIndex((a) => a._id === req.params.accountId);
    if (idx === -1) {
      res.status(404).json({ success: false, error: "账号不存在" });
      return;
    }

    const now = new Date().toISOString();
    const updated = { ...accounts[idx], password };
    if (username !== undefined) updated.username = username;
    if (email !== undefined) updated.email = email;
    if (notes !== undefined) updated.notes = notes;
    accounts[idx] = updated;

    await new Promise<void>((resolve, reject) => {
      db.links.update(
        { _id: link._id },
        { $set: { accounts, passwordUpdatedAt: now, updatedAt: now } },
        {},
        (err) => (err ? reject(err) : resolve())
      );
    });

    res.json({ success: true, message: "账号已更新" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// 删除链接下的指定关联账号
export async function removeAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const link: Link | null = await new Promise((resolve, reject) => {
      db.links.findOne({ _id: req.params.id, userId: req.userId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc as Link | null);
      });
    });
    if (!link) {
      res.status(404).json({ success: false, error: "Link not found" });
      return;
    }

    const before = link.accounts || [];
    const accounts = before.filter((a) => a._id !== req.params.accountId);
    if (accounts.length === before.length) {
      res.status(404).json({ success: false, error: "账号不存在" });
      return;
    }

    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      db.links.update(
        { _id: link._id },
        { $set: { accounts, hasAccount: accounts.length > 0, passwordUpdatedAt: accounts.length ? link.passwordUpdatedAt : null, updatedAt: now } },
        {},
        (err) => (err ? reject(err) : resolve())
      );
    });

    res.json({ success: true, message: "账号已删除" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function countWithAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const count: number = await new Promise((resolve, reject) => {
      db.links.count({ userId: req.userId, hasAccount: true }, (err, count) => {
        if (err) reject(err);
        else resolve(count);
      });
    });
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
