import { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error("[error]", err.message);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
  });
}
