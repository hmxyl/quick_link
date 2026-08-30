import { Router } from "express";
import * as accountController from "./accountController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", accountController.list);
router.get("/:id", accountController.getById);
router.get("/:id/password", accountController.getPassword);
router.post("/", accountController.create);
router.post("/:id/generate", accountController.generate);
router.put("/:id", accountController.update);
router.delete("/:id", accountController.remove);

export default router;
