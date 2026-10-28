import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";

// 预设背景色 (用户在「背景色管理」中维护的色板, 供添加/编辑链接时快速选用)
interface PresetColor {
  _id: string;
  userId: string;
  color: string; // 十六进制色值 (#RGB/#RGBA/#RRGGBB/#RRGGBBAA), 统一小写存储
  createdAt: string;
}

// 与链接背景色一致的合法色值格式 (#RGB/#RGBA/#RRGGBB/#RRGGBBAA)
export const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// 校验并归一化 (小写): 非法返回 null。链接背景色与预设背景色共用, 保证两处判定一致
export function normalizeColor(v: any): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase();
  return COLOR_RE.test(trimmed) ? trimmed : null;
}

// GET /api/preset-colors - 列出当前用户的预设背景色 (按添加顺序)
export const listPresetColors = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  db.presetColors.find({ userId }).sort({ createdAt: 1, _id: 1 }).exec((err, docs) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Failed to list preset colors" });
    }
    res.json({ success: true, data: docs });
  });
};

// POST /api/preset-colors - 添加一个预设背景色 { color }
export const addPresetColor = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const color = normalizeColor(req.body?.color);

  if (!color) {
    return res.status(400).json({ success: false, error: "请提供有效的十六进制色值 (如 #E6F7FF)" });
  }

  // 同一用户下按色值去重 (不做全局唯一索引: 相同色值跨用户各自独立)
  db.presetColors.findOne({ userId, color }, (err, existing) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (existing) {
      return res.status(409).json({ success: false, error: "该颜色已在预设中" });
    }

    const preset: PresetColor = {
      _id: uuidv4(),
      userId,
      color,
      createdAt: new Date().toISOString(),
    };

    db.presetColors.insert(preset, (insertErr: any) => {
      if (insertErr) {
        return res.status(500).json({ success: false, error: "Failed to add preset color" });
      }
      res.status(201).json({ success: true, data: preset });
    });
  });
};

// DELETE /api/preset-colors/:id - 删除一个预设背景色
export const deletePresetColor = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  db.presetColors.findOne({ _id: id, userId }, (err, preset) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (!preset) {
      return res.status(404).json({ success: false, error: "Preset color not found" });
    }

    db.presetColors.remove({ _id: id }, {}, (removeErr) => {
      if (removeErr) {
        return res.status(500).json({ success: false, error: "Failed to delete preset color" });
      }
      res.json({ success: true, message: "Preset color deleted" });
    });
  });
};
