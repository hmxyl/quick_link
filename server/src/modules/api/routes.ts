import { Router } from "express";
import * as envCtrl from "./environmentController";
import * as collCtrl from "./collectionController";
import * as histCtrl from "./historyController";
import * as proxyCtrl from "./proxyController";
import { authMiddleware } from "../../middleware/auth";

const router = Router();

router.use(authMiddleware);

// 环境管理
router.get("/environments", envCtrl.list);
router.post("/environments", envCtrl.create);
router.put("/environments/:id", envCtrl.update);
router.delete("/environments/:id", envCtrl.remove);
router.post("/environments/:id/activate", envCtrl.activate);

// 集合/请求管理
router.get("/collections", collCtrl.list);
router.post("/collections", collCtrl.create);
router.put("/collections/:id", collCtrl.update);
router.delete("/collections/:id", collCtrl.remove);
router.post("/collections/export", collCtrl.exportCollection);
router.post("/collections/import", collCtrl.importCollection);

// 历史记录
router.get("/history", histCtrl.list);
router.post("/history", histCtrl.record);
router.delete("/history/:id", histCtrl.remove);
router.delete("/history", histCtrl.clearAll);

// HTTP 代理
router.post("/send", proxyCtrl.send);

export default router;
