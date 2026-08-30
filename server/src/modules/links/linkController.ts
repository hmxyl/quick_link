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

    if (!url) {
      res.status(400).json({ success: false, error: "URL is required" });
      return;
    }

    const normalizedUrl = normalizeUrl(url);
    let effectiveTitle = title?.trim() || titleFromUrl(normalizedUrl);
    let effectiveDescription = description?.trim() || undefined;
    let effectiveIcon = icon as string | undefined;
    const now = new Date().toISOString();

    // Auto icon / metadata assignment
    if (normalizedUrl.startsWith("file://")) {
      // Local files use the folder icon by default
      if (!effectiveIcon) effectiveIcon = "folder";
    } else if (/^https?:\/\//i.test(normalizedUrl)) {
      const needMeta = !effectiveIcon || !title?.trim() || !description?.trim();
      if (needMeta) {
        const meta = await fetchLinkMetadata(normalizedUrl);
        if (!effectiveIcon) effectiveIcon = meta.icon || "globe";
        if (!title?.trim() && meta.title) effectiveTitle = meta.title;
        if (!effectiveDescription && meta.description) effectiveDescription = meta.description;
      }
      if (!effectiveIcon) effectiveIcon = "globe";
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

export async function batchImport(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { links: importLinks } = req.body;
    if (!Array.isArray(importLinks) || importLinks.length === 0) {
      res.status(400).json({ success: false, error: "Links array is required" });
      return;
    }

    const now = new Date().toISOString();
    const docs = importLinks.map((item: any) => ({
      _id: uuidv4(),
      userId: req.userId,
      url: item.url,
      title: item.title || item.url,
      description: item.description,
      tags: item.tags || [],
      isFavorite: false,
      isArchived: false,
      clickCount: 0,
      createdAt: now,
      updatedAt: now,
    }));

    const inserted: number = await new Promise((resolve, reject) => {
      db.links.insert(docs as any, (err, newDocs) => {
        if (err) reject(err);
        else resolve(Array.isArray(newDocs) ? newDocs.length : 1);
      });
    });

    res.status(201).json({ success: true, message: `${inserted} links imported`, data: { count: inserted } });
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
      const header = "URL,Title,Description,Tags\n";
      const rows = links
        .map((l) => `"${l.url}","${l.title}","${l.description || ""}","${l.tags.join(";")}"`)
        .join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=links.csv");
      res.send(header + rows);
    } else {
      res.json({ success: true, data: links });
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
