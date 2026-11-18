import { Router } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../prismaClient.js";
import { currentUser, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const FINAL_CYCLIC = ["completed", "failed", "stopped"];

// Nome do testador: o que veio na requisição > o do teste > o configurado pelo usuário.
async function resolveTesterName(userId: string, preferred?: string | null, fallback?: string | null) {
  if (preferred) return preferred;
  if (fallback) return fallback;
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { testerName: true } });
  return settings?.testerName || null;
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

router.get("/", async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: currentUser(req).id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, list: reports });
  } catch (err) {
    console.error("[Reports] Erro ao listar:", err);
    res.status(500).json({ success: false, message: "Erro ao listar relatórios." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const report = await prisma.report.findFirst({ where: { id: req.params.id, userId: currentUser(req).id } });
    if (!report) return res.status(404).json({ success: false, message: "Relatório não encontrado." });
    res.json({ success: true, report });
  } catch (err) {
    console.error("[Reports] Erro ao buscar:", err);
    res.status(500).json({ success: false });
  }
});

// Snapshot completo do CyclicTest + logs. Salvar duas vezes devolve o existente.
router.post("/cyclic", async (req, res) => {
  try {
    const userId = currentUser(req).id;
    const { testId, testerName } = req.body;
    if (typeof testId !== "string") return res.status(400).json({ success: false, message: "testId obrigatório." });

    const test = await prisma.cyclicTest.findFirst({
      where: { id: testId, userId },
      include: { device: true, user: true, logs: { orderBy: { timestamp: "asc" } } },
    });
    if (!test) return res.status(404).json({ success: false, message: "Teste não encontrado." });
    if (!FINAL_CYCLIC.includes(test.status)) {
      return res.status(409).json({
        success: false,
        message: "O teste ainda está em andamento. Finalize-o antes de salvar o relatório.",
      });
    }

    const existing = await prisma.report.findUnique({ where: { cyclicTestId: test.id } });
    if (existing) return res.json({ success: true, report: existing, alreadySaved: true });

    const successCycles = test.logs.filter((l) => l.type === "LOCK" && l.level === "success").length;
    const title = `Ciclagem · ${test.device.name} · ${test.completedCycles.toFixed(0)}/${test.totalCycles} ciclos`;
    const tester = await resolveTesterName(userId, testerName, test.user?.name);

    try {
      const report = await prisma.report.create({
        data: {
          type: "cyclic",
          title,
          userId,
          deviceId: test.deviceId,
          cyclicTestId: test.id,
          deviceName: test.device.name,
          status: test.status,
          testerName: tester,
          startedAt: test.startedAt,
          completedAt: test.completedAt,
          payload: {
            testId: test.id,
            category: test.device.category,
            productName: test.device.productName,
            totalCycles: test.totalCycles,
            completedCycles: test.completedCycles,
            totalFailures: test.totalFailures,
            successCycles,
            batteryStart: test.batteryStart,
            batteryEnd: test.batteryEnd,
            battery: test.battery,
            delayBetweenCycles: test.delayBetweenCycles,
            maxConsecutiveFailures: test.maxConsecutiveFailures,
            lowBatteryThreshold: test.lowBatteryThreshold,
            logs: test.logs.map((l) => ({
              type: l.type,
              level: l.level,
              message: l.message,
              timestamp: l.timestamp.toISOString(),
            })),
          } satisfies Prisma.InputJsonValue,
        },
      });
      res.status(201).json({ success: true, report });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const dup = await prisma.report.findUnique({ where: { cyclicTestId: test.id } });
        return res.json({ success: true, report: dup, alreadySaved: true });
      }
      throw err;
    }
  } catch (err) {
    console.error("[Reports] Erro ao salvar ciclagem:", err);
    res.status(500).json({ success: false, message: "Erro ao salvar relatório." });
  }
});

// O servidor monta o snapshot a partir da auditoria salva no banco.
router.post("/quality", async (req, res) => {
  try {
    const userId = currentUser(req).id;
    const { testId, testerName } = req.body;
    if (typeof testId !== "string") return res.status(400).json({ success: false, message: "testId obrigatório." });

    const audit = await prisma.qualityAudit.findFirst({
      where: { id: testId, userId },
      include: { device: true, steps: { orderBy: { position: "asc" } } },
    });
    if (!audit) return res.status(404).json({ success: false, message: "Teste não encontrado." });
    if (audit.status === "executando") {
      return res.status(409).json({
        success: false,
        message: "A auditoria ainda está em andamento. Aguarde a conclusão para salvar o relatório.",
      });
    }

    const existing = await prisma.report.findUnique({ where: { qualityAuditId: audit.id } });
    if (existing) return res.json({ success: true, report: existing, alreadySaved: true });

    const steps = audit.steps;
    const params = (audit.params ?? {}) as { deviceName?: string };
    const deviceName = params.deviceName || audit.device.name;
    const successCount = steps.filter((s) => s.status === "sucesso").length;
    const failCount = steps.filter((s) => s.status === "falha").length;
    const finalStatus = steps.every((s) => s.status === "sucesso") ? "aprovado" : "reprovado";
    const title = `Qualidade · ${deviceName} · ${successCount}/${steps.length} etapas OK`;
    const tester = await resolveTesterName(userId, testerName, audit.testerName);

    try {
      const report = await prisma.report.create({
        data: {
          type: "quality",
          title,
          userId,
          deviceId: audit.deviceId,
          qualityAuditId: audit.id,
          deviceName,
          status: finalStatus,
          testerName: tester,
          startedAt: audit.startedAt,
          completedAt: audit.completedAt ?? new Date(),
          payload: {
            testId: audit.id,
            totalSteps: steps.length,
            successCount,
            failCount,
            steps: steps.map((s) => ({
              id: s.stepKey,
              name: s.stepName,
              status: s.status,
              errorMsg: s.errorMsg,
              logs: s.logs as Prisma.InputJsonValue,
            })),
          } satisfies Prisma.InputJsonValue,
        },
      });
      res.status(201).json({ success: true, report });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const dup = await prisma.report.findUnique({ where: { qualityAuditId: audit.id } });
        return res.json({ success: true, report: dup, alreadySaved: true });
      }
      throw err;
    }
  } catch (err) {
    console.error("[Reports] Erro ao salvar qualidade:", err);
    res.status(500).json({ success: false, message: "Erro ao salvar relatório." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { count } = await prisma.report.deleteMany({ where: { id: req.params.id, userId: currentUser(req).id } });
    if (count === 0) return res.status(404).json({ success: false, message: "Relatório não encontrado." });
    res.json({ success: true });
  } catch (err) {
    console.error("[Reports] Erro ao deletar:", err);
    res.status(500).json({ success: false });
  }
});

export default router;
