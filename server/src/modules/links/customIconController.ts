import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../config/database";
import { AuthRequest } from "../../middleware/auth";

// Custom icon data model
interface CustomIcon {
  _id: string;
  userId: string;
  url: string; // favicon URL (unique per user)
  label?: string; // optional display name
  createdAt: string;
}

// GET /api/custom-icons - list user's custom icons
export const listCustomIcons = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  db.customIcons.find({ userId }).sort({ createdAt: -1 }).exec((err, docs) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Failed to list custom icons" });
    }
    res.json({ success: true, data: docs });
  });
};

// POST /api/custom-icons - add a custom icon
export const addCustomIcon = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { url, label } = req.body;

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ success: false, error: "Invalid icon URL" });
  }

  // Check if already exists
  db.customIcons.findOne({ userId, url }, (err, existing) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (existing) {
      return res.json({ success: true, data: existing, message: "Icon already exists" });
    }

    const icon: CustomIcon = {
      _id: uuidv4(),
      userId,
      url,
      label: label?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    db.customIcons.insert(icon, (insertErr: any) => {
      if (insertErr) {
        if (insertErr.errorType === "uniqueViolated" || insertErr.message?.includes("unique")) {
          return res.status(400).json({ success: false, error: "Icon URL already exists" });
        }
        return res.status(500).json({ success: false, error: "Failed to add custom icon" });
      }
      res.json({ success: true, data: icon });
    });
  });
};

// DELETE /api/custom-icons/:id - delete a custom icon
export const deleteCustomIcon = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  db.customIcons.findOne({ _id: id, userId }, (err, icon) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Database error" });
    }
    if (!icon) {
      return res.status(404).json({ success: false, error: "Icon not found" });
    }

    db.customIcons.remove({ _id: id }, {}, (removeErr) => {
      if (removeErr) {
        return res.status(500).json({ success: false, error: "Failed to delete custom icon" });
      }
      res.json({ success: true, message: "Icon deleted" });
    });
  });
};

// DELETE /api/custom-icons - clear all custom icons for user
export const clearCustomIcons = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  db.customIcons.remove({ userId }, { multi: true }, (err, count) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Failed to clear custom icons" });
    }
    res.json({ success: true, data: { count }, message: "All custom icons cleared" });
  });
};
