import { Router, raw } from "express";
import * as noteController from "./noteController";
import * as attachmentController from "./attachmentController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

// raw 二进制解析 (上传/导入), 不限 Content-Type
const rawBody = raw({ type: () => true, limit: "200mb" });

router.use(authMiddleware);

// 笔记树
router.get("/", noteController.list);
router.post("/", noteController.create);
router.put("/:id", noteController.update);
router.delete("/trash", noteController.emptyTrash);
router.delete("/:id", noteController.remove);
router.post("/:id/restore", noteController.restore);
router.post("/:id/move", noteController.move);
router.delete("/:id/permanent", noteController.removePermanent);

// 数据操作
router.post("/wipe", noteController.wipe);
router.get("/export", noteController.exportZip);
router.post("/import", rawBody, noteController.importZip);

// 附件
router.get("/attachments", attachmentController.list);
router.post("/attachments", rawBody, attachmentController.upload);
router.get("/attachments/:id/download", attachmentController.download);
router.post("/attachments/:id/open-folder", attachmentController.openFolder);
router.post("/attachments/:id/open-file", attachmentController.openFile);
router.delete("/attachments/:id", attachmentController.remove);

export default router;
