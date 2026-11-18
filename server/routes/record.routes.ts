import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { recordService } from "../services/record.service.js";
import { idParam, route } from "../utils/respond.js";

const router = Router();
router.use(requireAuth);

router.post(
  "/list",
  route("Erro ao obter histórico de abertura", async (req) => {
    const pageNo = Math.max(1, parseInt(req.body.pageNo) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.body.pageSize) || 50));
    return recordService.getRecords(idParam(req.body.deviceId), pageNo, pageSize);
  }),
);

export default router;
