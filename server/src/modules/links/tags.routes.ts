import { Router } from "express";
import * as tagController from "./tagController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", tagController.list);
router.post("/", tagController.create);
router.put("/reorder", tagController.reorder);
router.put("/batch-columns", tagController.batchColumns);
router.put("/:id", tagController.update);
router.delete("/:id", tagController.remove);

export default router;
