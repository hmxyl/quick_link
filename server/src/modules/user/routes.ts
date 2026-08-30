import { Router } from "express";
import * as authController from "./authController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/reset-password", authController.resetLoginPassword);
router.get("/me", authMiddleware, authController.getMe);
router.put("/password", authMiddleware, authController.changePassword);

export default router;
