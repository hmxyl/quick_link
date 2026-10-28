import { Router } from "express";
import * as presetColorController from "./presetColorController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", presetColorController.listPresetColors);
router.post("/", presetColorController.addPresetColor);
router.delete("/:id", presetColorController.deletePresetColor);

export default router;
