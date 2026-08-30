import { Router } from "express";
import * as customIconController from "./customIconController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", customIconController.listCustomIcons);
router.post("/", customIconController.addCustomIcon);
router.delete("/:id", customIconController.deleteCustomIcon);
router.delete("/", customIconController.clearCustomIcons);

export default router;
