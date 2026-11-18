import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import passcodeRoutes from "./routes/passcode.routes.js";
import credentialRoutes from "./routes/credential.routes.js";
import recordRoutes from "./routes/record.routes.js";
import qualityRoutes from "./routes/quality.routes.js";
import reportRoutes from "./routes/report.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import cyclicTestsDbRoutes from "./db-routes/cyclicTestsDB.js";
import { qualityService } from "./services/quality.service.js";
import prisma from "./prismaClient.js";

const app = express();
// Em dev o Vite faz proxy de /api e /db (mesma origem). CORS liberado só para o
// endereço configurado, quando houver.
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(",") } : { origin: false }));
app.use(express.json({ limit: "100kb" }));

// 1. Rotas da API
const apiRouter = express.Router();
apiRouter.use("/auth", authRoutes);
apiRouter.use("/device", deviceRoutes);
apiRouter.use("/passcode", passcodeRoutes);
apiRouter.use("/credential", credentialRoutes);
apiRouter.use("/record", recordRoutes);
apiRouter.use("/quality", qualityRoutes);
apiRouter.use("/reports", reportRoutes);
apiRouter.use("/settings", settingsRoutes);

// 2. Montadas tanto para dev local quanto para a Netlify Function
app.use("/api", apiRouter);
app.use("/.netlify/functions/api", apiRouter);

// 3. Rotas de banco do teste de ciclagem
app.use("/db/cyclic-tests", cyclicTestsDbRoutes);
app.use("/.netlify/functions/api/db/cyclic-tests", cyclicTestsDbRoutes);

// Só sobe o servidor HTTP localmente — nunca quando importado pela Netlify Function.
if (process.env.NODE_ENV !== "production" && !process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  async function reconcileOrphanedTests() {
    const orphaned = await prisma.cyclicTest.findMany({ where: { status: { in: ["running", "paused"] } } });
    for (const test of orphaned) {
      await prisma.cyclicTest.update({ where: { id: test.id }, data: { status: "stopped", completedAt: new Date() } });
      await prisma.cyclicTestLog.create({
        data: { testId: test.id, type: "SYSTEM", level: "warning", message: "Servidor reiniciado; teste marcado como interrompido." },
      });
    }
    if (orphaned.length > 0) {
      console.log(`⚠️  ${orphaned.length} teste(s) órfão(s) marcado(s) como interrompido(s) na inicialização.`);
    }
    const orphanedAudits = await qualityService.reconcileOrphaned();
    if (orphanedAudits > 0) {
      console.log(`⚠️  ${orphanedAudits} auditoria(s) de qualidade interrompida(s) fechada(s) na inicialização.`);
    }
  }

  const PORT = Number(process.env.PORT) || 3002;
  reconcileOrphanedTests()
    .catch((err) => console.error("[Startup] Erro ao reconciliar testes órfãos:", err))
    .finally(() => {
      app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
    });
}

export default app;
