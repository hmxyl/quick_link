import { Router } from "express";
import * as linkController from "./linkController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", linkController.list);
router.get("/export", linkController.exportLinks);
router.get("/account-count", linkController.countWithAccount);
router.get("/search-by-url", linkController.searchByUrl);
router.put("/batch-tags", linkController.batchUpdateTags);
router.get("/:id", linkController.getById);
router.get("/:id/secrets", linkController.getSecrets);
router.post("/:id/accounts", linkController.addAccount);
router.put("/:id/accounts/:accountId", linkController.updateAccount);
router.delete("/:id/accounts/:accountId", linkController.removeAccount);
router.post("/", linkController.create);
router.post("/batch", linkController.batchImport);
router.put("/:id", linkController.update);
router.delete("/", linkController.clearAll);
router.delete("/:id", linkController.remove);

export default router;
