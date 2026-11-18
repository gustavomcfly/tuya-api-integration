import prisma from "./prismaClient.js";
import { lockService } from "./services/lock.service.js";

// Guarda apenas UM registro por teste: "existe um loop Node vivo para este testId agora?"
// Pausar/retomar/parar/editar acontece via status no Postgres; o loop relê status e
// parâmetros a cada iteração. Assim o teste é controlável de qualquer aba (ou nenhuma).
//
// Diferença para a versão TTLock: o token da Tuya é do servidor (renovado sozinho),
// então o teste não depende de um token enviado pelo navegador e não "morre" quando
// ele expira.
const activeEngines = new Map<string, true>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const FINISHED = new Set(["stopped", "failed", "completed"]);

// Dorme em passos curtos checando se o teste foi parado, para o "Parar" valer na hora.
async function sleepCheckingStop(testId: string, ms: number): Promise<boolean> {
  const step = 400;
  let remaining = ms;
  while (remaining > 0) {
    const row = await prisma.cyclicTest.findUnique({ where: { id: testId }, select: { status: true } });
    if (!row || FINISHED.has(row.status)) return false;
    const chunk = Math.min(step, remaining);
    await sleep(chunk);
    remaining -= chunk;
  }
  return true;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const cyclicEngine = {
  isActive(testId: string) {
    return activeEngines.has(testId);
  },

  async start(testId: string, deviceId: string) {
    if (activeEngines.has(testId)) return;
    activeEngines.set(testId, true);

    let currentCycle = 0;
    let consecutiveFailures = 0;
    let totalFailures = 0;
    let lastBattery: number | null = null;
    let lastKnownTotal = 0;

    const log = (type: string, level: string, message: string) =>
      prisma.cyclicTestLog.create({ data: { testId, type, level, message } });

    const persistProgress = () =>
      prisma.cyclicTest.update({
        where: { id: testId },
        data: { completedCycles: currentCycle, totalFailures },
      });

    const failTest = async (maxFailures: number) => {
      await log("SYSTEM", "error", `Teste interrompido por ${maxFailures} falhas consecutivas.`);
      await prisma.cyclicTest.update({
        where: { id: testId },
        data: { status: "failed", completedAt: new Date() },
      });
    };

    const readBattery = async (threshold: number, initial: boolean) => {
      try {
        const battery = await lockService.getBattery(deviceId);
        if (battery === null) return;
        lastBattery = battery;
        await prisma.cyclicTest.update({
          where: { id: testId },
          data: initial ? { battery, batteryStart: battery } : { battery },
        });
        await log("BATTERY", "info", initial ? `Bateria inicial: ${battery}%` : `Bateria: ${battery}%`);
        if (threshold > 0 && battery <= threshold) {
          await log("BATTERY", "warning", `ALERTA: ${battery}% ≤ ${threshold}%`);
        }
      } catch {
        // Falha ao ler bateria não interrompe o teste.
      }
    };

    // Executa um comando (abrir/travar); devolve false se o teste deve terminar.
    const actuate = async (
      kind: "UNLOCK" | "LOCK",
      maxFailures: number,
    ): Promise<{ ok: boolean; abort: boolean }> => {
      await log(kind, "info", kind === "UNLOCK" ? "Solicitando desbloqueio" : "Solicitando travamento");
      try {
        if (kind === "UNLOCK") await lockService.unlock(deviceId);
        else await lockService.lock(deviceId);
        currentCycle += 0.5;
        consecutiveFailures = 0;
        await log(
          kind,
          "success",
          kind === "UNLOCK"
            ? `Desbloqueio OK · ${currentCycle.toFixed(1)} ciclos`
            : `Travamento OK · ciclo ${currentCycle.toFixed(1)} concluído`,
        );
        await persistProgress();
        return { ok: true, abort: false };
      } catch (e) {
        totalFailures++;
        consecutiveFailures++;
        await log(
          kind,
          "error",
          `${kind === "UNLOCK" ? "Falha no desbloqueio" : "Falha no travamento"}: ${errorMessage(e)}`,
        );
        await persistProgress();
        if (consecutiveFailures >= maxFailures) {
          await failTest(maxFailures);
          return { ok: false, abort: true };
        }
        return { ok: false, abort: false };
      }
    };

    try {
      const initial = await prisma.cyclicTest.findUnique({ where: { id: testId } });
      if (!initial) return;
      lastKnownTotal = initial.totalCycles;
      await readBattery(initial.lowBatteryThreshold, true);

      while (true) {
        // Fonte única de verdade: relê status e parâmetros do banco a cada volta.
        const cfg = await prisma.cyclicTest.findUnique({ where: { id: testId } });
        if (!cfg || FINISHED.has(cfg.status)) break;
        if (cfg.status === "paused") {
          await sleep(500);
          continue;
        }

        lastKnownTotal = cfg.totalCycles;
        if (currentCycle >= cfg.totalCycles) break;
        const delayMs = cfg.delayBetweenCycles * 1000;
        const maxFailures = cfg.maxConsecutiveFailures || 3;

        // 1. Desbloqueio
        const unlock = await actuate("UNLOCK", maxFailures);
        if (unlock.abort) break;
        if (!unlock.ok) {
          if (!(await sleepCheckingStop(testId, delayMs))) break;
          continue;
        }
        if (delayMs > 0 && !(await sleepCheckingStop(testId, delayMs))) break;

        // 2. Travamento
        const lock = await actuate("LOCK", maxFailures);
        if (lock.abort) break;

        // Bateria a cada 5 ciclos completos
        if (currentCycle % 1 === 0 && currentCycle > 0 && currentCycle % 5 === 0) {
          await readBattery(cfg.lowBatteryThreshold ?? 20, false);
        }

        if (currentCycle < cfg.totalCycles && delayMs > 0) {
          if (!(await sleepCheckingStop(testId, delayMs))) break;
        }
      }

      // Finalização (se não foi marcado como failed/stopped dentro do loop)
      const finalRow = await prisma.cyclicTest.findUnique({ where: { id: testId }, select: { status: true } });
      if (finalRow && !FINISHED.has(finalRow.status)) {
        const completed = currentCycle >= lastKnownTotal;
        await log(
          "SYSTEM",
          completed ? "success" : "info",
          completed ? `Concluído. Total de falhas: ${totalFailures}.` : "Interrompido.",
        );
        await prisma.cyclicTest.update({
          where: { id: testId },
          data: { status: completed ? "completed" : "stopped", completedAt: new Date(), batteryEnd: lastBattery },
        });
      } else if (finalRow) {
        await prisma.cyclicTest.update({ where: { id: testId }, data: { batteryEnd: lastBattery } });
      }
    } catch (err) {
      console.error("[Engine] Erro crítico no robô de ciclagem:", err);
      try {
        await prisma.cyclicTest.update({
          where: { id: testId },
          data: { status: "failed", completedAt: new Date() },
        });
        await log("SYSTEM", "error", `Erro crítico: ${errorMessage(err)}`);
      } catch {
        // banco indisponível
      }
    } finally {
      activeEngines.delete(testId);
    }
  },
};
