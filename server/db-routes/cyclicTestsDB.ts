import express from "express";
import prisma from "../prismaClient.js";
import { cyclicEngine } from "../cyclicEngine.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { idParam } from "../utils/respond.js";

const router = express.Router();

// Todas as rotas exigem sessão. O dono do teste é SEMPRE o usuário da sessão.
router.use(requireAuth);

const FINAL_STATUSES = ["completed", "failed", "stopped"];
const ENGINE_GONE =
  "O processo backend deste teste não está mais ativo (possível reinício do servidor). Inicie um novo teste.";

const findOwnedTest = (id: string, userId: string) => prisma.cyclicTest.findFirst({ where: { id, userId } });

const int = (v: unknown, fallback: number) => {
  const n = parseInt(String(v));
  return Number.isFinite(n) ? n : fallback;
};

// Testes ativos (running/paused) do usuário — reidrata a UI ao recarregar a página.
router.get("/active", async (req, res) => {
  try {
    const tests = await prisma.cyclicTest.findMany({
      where: { userId: currentUser(req).id, status: { in: ["running", "paused"] } },
      orderBy: { startedAt: "desc" },
      include: { device: true, user: { select: { username: true, name: true } }, logs: { orderBy: { timestamp: "desc" }, take: 50 } },
    });
    res.json({ success: true, list: tests });
  } catch (error) {
    console.error("[DB] Erro ao buscar testes ativos:", error);
    res.status(500).json({ success: false });
  }
});

router.post("/start", async (req, res) => {
  try {
    const { deviceName, category, productName } = req.body;
    let deviceId: string;
    try {
      deviceId = idParam(req.body.deviceId);
    } catch {
      return res.status(400).json({ success: false, message: "ID do dispositivo obrigatório." });
    }
    const totalCycles = int(req.body.totalCycles, 0);
    if (totalCycles < 1 || totalCycles > 1_000_000) {
      return res.status(400).json({ success: false, message: "Número de ciclos inválido." });
    }

    const busy = await prisma.cyclicTest.findFirst({
      where: { deviceId, status: { in: ["running", "paused"] } },
      select: { id: true },
    });
    if (busy && cyclicEngine.isActive(busy.id)) {
      return res.status(409).json({ success: false, message: "Já existe um teste em andamento neste dispositivo." });
    }

    await prisma.device.upsert({
      where: { deviceId },
      update: {
        ...(deviceName ? { name: String(deviceName).slice(0, 100) } : {}),
        ...(category ? { category: String(category) } : {}),
        ...(productName ? { productName: String(productName) } : {}),
      },
      create: {
        deviceId,
        name: deviceName ? String(deviceName).slice(0, 100) : `Dispositivo ${deviceId}`,
        category: category ? String(category) : null,
        productName: productName ? String(productName) : null,
      },
    });

    const newTest = await prisma.cyclicTest.create({
      data: {
        deviceId,
        userId: currentUser(req).id,
        totalCycles,
        delayBetweenCycles: Math.min(3600, Math.max(0, int(req.body.delayBetweenCycles, 5))),
        maxConsecutiveFailures: Math.max(1, int(req.body.maxConsecutiveFailures, 3)),
        lowBatteryThreshold: Math.min(100, Math.max(0, int(req.body.lowBatteryThreshold, 20))),
        status: "running",
      },
    });

    // Dispara o loop no backend; continua independentemente do navegador.
    void cyclicEngine.start(newTest.id, deviceId);

    res.status(201).json({ success: true, testId: newTest.id, test: newTest });
  } catch (error) {
    console.error("[DB] Erro ao iniciar teste:", error);
    res.status(500).json({ success: false, message: "Erro interno no servidor de banco de dados" });
  }
});

async function transition(req: express.Request, res: express.Response, from: string, to: string, message: string) {
  const id = String(req.params.id);
  const test = await findOwnedTest(id, currentUser(req).id);
  if (!test) return res.status(404).json({ success: false, message: "Teste não encontrado." });
  if (test.status !== from) {
    return res.status(409).json({ success: false, message: `Teste está "${test.status}", operação não permitida.` });
  }
  if (!cyclicEngine.isActive(id)) return res.status(409).json({ success: false, message: ENGINE_GONE });
  const updated = await prisma.cyclicTest.update({ where: { id }, data: { status: to } });
  await prisma.cyclicTestLog.create({ data: { testId: id, type: "SYSTEM", level: "info", message } });
  res.json({ success: true, test: updated });
}

router.post("/:id/pause", async (req, res) => {
  try {
    await transition(req, res, "running", "paused", "Teste pausado.");
  } catch (error) {
    console.error("[DB] Erro ao pausar teste:", error);
    res.status(500).json({ success: false });
  }
});

router.post("/:id/resume", async (req, res) => {
  try {
    await transition(req, res, "paused", "running", "Teste retomado.");
  } catch (error) {
    console.error("[DB] Erro ao retomar teste:", error);
    res.status(500).json({ success: false });
  }
});

// Edita parâmetros de um teste em andamento; o motor relê a cada ciclo.
router.patch("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const test = await findOwnedTest(id, currentUser(req).id);
    if (!test) return res.status(404).json({ success: false, message: "Teste não encontrado." });
    if (FINAL_STATUSES.includes(test.status)) {
      return res.status(409).json({ success: false, message: "Teste já finalizado, não pode ser editado." });
    }
    const b = req.body ?? {};
    const data: Record<string, number> = {};
    if (b.totalCycles !== undefined)
      data.totalCycles = Math.max(Math.ceil(test.completedCycles), int(b.totalCycles, test.totalCycles));
    if (b.delayBetweenCycles !== undefined)
      data.delayBetweenCycles = Math.min(3600, Math.max(0, int(b.delayBetweenCycles, test.delayBetweenCycles)));
    if (b.maxConsecutiveFailures !== undefined)
      data.maxConsecutiveFailures = Math.max(1, int(b.maxConsecutiveFailures, test.maxConsecutiveFailures));
    if (b.lowBatteryThreshold !== undefined)
      data.lowBatteryThreshold = Math.min(100, Math.max(0, int(b.lowBatteryThreshold, test.lowBatteryThreshold)));

    const updated = await prisma.cyclicTest.update({ where: { id }, data });
    res.json({ success: true, test: updated });
  } catch (error) {
    console.error("[DB] Erro ao editar teste:", error);
    res.status(500).json({ success: false });
  }
});

router.post("/:id/stop", async (req, res) => {
  try {
    const id = String(req.params.id);
    const test = await findOwnedTest(id, currentUser(req).id);
    if (!test) return res.status(404).json({ success: false, message: "Teste não encontrado." });
    if (FINAL_STATUSES.includes(test.status)) return res.json({ success: true, test });

    const updated = await prisma.cyclicTest.update({
      where: { id },
      data: { status: "stopped", completedAt: new Date() },
    });
    await prisma.cyclicTestLog.create({ data: { testId: id, type: "SYSTEM", level: "info", message: "Parado pelo usuário." } });
    // O motor relê o status e encerra sozinho ao ver "stopped".
    res.json({ success: true, test: updated });
  } catch (error) {
    console.error("[DB] Erro ao finalizar teste:", error);
    res.status(500).json({ success: false });
  }
});

// Histórico do usuário (todas os dispositivos).
router.get("/mine", async (req, res) => {
  try {
    const tests = await prisma.cyclicTest.findMany({
      where: { userId: currentUser(req).id },
      orderBy: { startedAt: "desc" },
      take: 100,
      include: {
        device: true,
        user: { select: { username: true, name: true } },
        logs: { orderBy: { timestamp: "desc" }, take: 50 },
        _count: { select: { logs: true } },
      },
    });
    res.json({ success: true, list: tests });
  } catch (error) {
    console.error("[DB] Erro ao buscar testes do usuário:", error);
    res.status(500).json({ success: false });
  }
});

router.get("/reports/summary", async (req, res) => {
  try {
    const where: { userId: string; deviceId?: string } = { userId: currentUser(req).id };
    if (typeof req.query.deviceId === "string") where.deviceId = req.query.deviceId;

    const [totalTests, byStatus, agg] = await Promise.all([
      prisma.cyclicTest.count({ where }),
      prisma.cyclicTest.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.cyclicTest.aggregate({ where, _sum: { totalFailures: true, completedCycles: true } }),
    ]);
    res.json({
      success: true,
      report: {
        totalTests,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        totalCyclesRun: agg._sum.completedCycles || 0,
        totalFailures: agg._sum.totalFailures || 0,
      },
    });
  } catch (error) {
    console.error("[DB] Erro ao gerar relatório:", error);
    res.status(500).json({ success: false });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const test = await findOwnedTest(id, currentUser(req).id);
    if (!test) return res.status(404).json({ success: false, message: "Teste não encontrado." });
    if (["running", "paused"].includes(test.status)) {
      return res.status(409).json({ success: false, message: "Pare o teste antes de removê-lo." });
    }
    await prisma.cyclicTest.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("[DB] Erro ao remover teste:", error);
    res.status(500).json({ success: false });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const test = await prisma.cyclicTest.findFirst({
      where: { id: String(req.params.id), userId: currentUser(req).id },
      include: { logs: { orderBy: { timestamp: "desc" }, take: 500 }, user: { select: { username: true, name: true } }, device: true },
    });
    if (!test) return res.status(404).json({ success: false, message: "Teste não encontrado." });
    res.json({ success: true, test });
  } catch (error) {
    console.error("[DB] Erro ao buscar teste:", error);
    res.status(500).json({ success: false });
  }
});

export default router;
