import { Router } from "express";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { qualityService, STEP_NAMES } from "../services/quality.service.js";
import { BadRequest, idParam, route } from "../utils/respond.js";

const router = Router();
router.use(requireAuth);

router.post("/steps", route("Erro ao listar etapas", async () => ({
  list: Object.entries(STEP_NAMES).map(([id, name]) => ({ id, name })),
})));

router.post(
  "/start",
  route("Erro ao iniciar teste", async (req) => {
    const { criteria, testParams } = req.body;
    if (!Array.isArray(criteria) || criteria.length === 0 || !criteria.every((c) => qualityService.isValidStep(c))) {
      throw new BadRequest("Selecione ao menos uma etapa válida.");
    }
    const p = (testParams ?? {}) as Record<string, unknown>;
    const data = await qualityService.startTest(currentUser(req).id, idParam(req.body.deviceId), criteria, {
      deviceName: typeof p.deviceName === "string" ? p.deviceName.slice(0, 100) : undefined,
      testerName: typeof p.testerName === "string" ? p.testerName.slice(0, 100) : undefined,
      stdPasscode: typeof p.stdPasscode === "string" && /^\d{6,10}$/.test(p.stdPasscode) ? p.stdPasscode : undefined,
    });
    return { data };
  }),
);

router.post(
  "/status",
  route("Erro ao obter status", async (req) => ({
    data: await qualityService.getStatus(currentUser(req).id, idParam(req.body.testId, "testId")),
  })),
);

router.post(
  "/list",
  route("Erro ao obter testes", async (req) => ({
    list: await qualityService.getAllTests(
      currentUser(req).id,
      req.body.deviceId ? idParam(req.body.deviceId) : undefined,
    ),
  })),
);

router.post("/delete", async (req, res) => {
  try {
    const result = await qualityService.deleteTest(currentUser(req).id, idParam(req.body.testId, "testId"));
    if (result.deleted) return res.json({ errcode: 0 });
    if (result.reason === "running") {
      return res.status(409).json({ errcode: -1, errmsg: "Não é possível apagar uma auditoria em execução." });
    }
    return res.status(404).json({ errcode: -1, errmsg: "Auditoria não encontrada." });
  } catch (error) {
    if (error instanceof BadRequest) return res.status(400).json({ errcode: -3, errmsg: error.message });
    console.error("[Quality] Erro ao apagar teste:", error);
    res.status(500).json({ errcode: -1, errmsg: "Erro ao apagar auditoria" });
  }
});

export default router;
