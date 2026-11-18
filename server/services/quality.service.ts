import type { Prisma } from "@prisma/client";
import prisma from "../prismaClient.js";
import { deviceService } from "./device.service.js";
import { lockService } from "./lock.service.js";
import { passcodeService } from "./passcode.service.js";
import { recordService } from "./record.service.js";

export const STEP_NAMES: Record<string, string> = {
  get_info: "Obter Parâmetros do Dispositivo",
  remote_unlock: "Teste de Abertura e Travamento Remotos",
  temp_passcode: "Criar e Remover Senha Temporária",
  offline_passcode: "Gerar Senha Offline",
  dynamic_passcode: "Obter Senha Dinâmica",
  rename_device: "Renomear e Restaurar Nome",
  auto_lock: "Ativar/Restaurar Fechamento Automático",
  get_records: "Sincronizar Histórico de Aberturas",
  device_events: "Ler Eventos do Dispositivo",
  check_update: "Verificar Atualização de Firmware",
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro desconhecido");

const include = {
  device: true,
  steps: { orderBy: { position: "asc" as const } },
} satisfies Prisma.QualityAuditInclude;

type AuditWithSteps = Prisma.QualityAuditGetPayload<{ include: typeof include }>;

export interface QualityParams {
  deviceName?: string;
  testerName?: string;
  stdPasscode?: string;
  [k: string]: unknown;
}

// Formato consumido pelo front.
function toClientShape(audit: AuditWithSteps) {
  const params = (audit.params ?? {}) as QualityParams;
  return {
    testId: audit.id,
    deviceId: audit.deviceId,
    deviceName: params.deviceName || audit.device?.name || audit.deviceId,
    status: audit.status,
    startTime: audit.startedAt.getTime(),
    endTime: audit.completedAt ? audit.completedAt.getTime() : null,
    steps: audit.steps.map((s) => ({
      id: s.stepKey,
      name: s.stepName,
      status: s.status,
      errorMsg: s.errorMsg,
      logs: (s.logs as string[]) ?? [],
    })),
    params,
  };
}

// Cada etapa: recebe um logger e lança exceção em caso de falha.
type StepFn = (ctx: { deviceId: string; params: QualityParams; log: (m: string) => Promise<void> }) => Promise<void>;

const STEPS: Record<string, StepFn> = {
  async get_info({ deviceId, log }) {
    await log("Consultando dispositivo na nuvem Tuya...");
    const d = await deviceService.getDetail(deviceId);
    await log(`Produto: ${d.productName ?? "?"} (categoria ${d.category || "?"})`);
    await log(`Conexão: ${d.online ? "online" : "OFFLINE"}`);
    await log(`Bateria: ${d.battery !== null ? `${d.battery}%` : "não informada"}`);
    if (d.ip) await log(`IP: ${d.ip}`);
    await log(`${d.status.length} data points reportados.`);
    if (!d.online) throw new Error("Dispositivo offline.");
  },

  async remote_unlock({ deviceId, log }) {
    await log("Enviando comando de abertura remota...");
    const r = await lockService.unlock(deviceId);
    await log(`Abertura aceita (${r.method}).`);
    await log("Aguardando 3 segundos...");
    await sleep(3000);
    await log("Enviando comando de travamento remoto...");
    const l = await lockService.lock(deviceId);
    await log(`Travamento aceito (${l.method}).`);
  },

  async temp_passcode({ deviceId, params, log }) {
    const pass = params.stdPasscode || "1357924";
    await log(`Criando senha temporária ${pass} (cifrada com ticket AES)...`);
    const { id } = await passcodeService.create(deviceId, {
      passcode: pass,
      name: `${params.testerName || "QA"} (QA)`.slice(0, 30),
      startMs: Date.now(),
      endMs: Date.now() + 60 * 60 * 1000,
    });
    await log(`Senha criada (id ${id}). Aguardando sincronização...`);
    await sleep(4000);
    const list = await passcodeService.list(deviceId);
    const found = list.find((p) => p.id === id);
    await log(found ? `Senha listada na nuvem (fase ${found.phase ?? "?"}).` : "Senha ainda não aparece na lista.");
    await log("Removendo a senha de teste...");
    await passcodeService.remove(deviceId, id);
    await log("Senha removida.");
  },

  async offline_passcode({ deviceId, log }) {
    await log("Gerando senha offline de uso único (válida por 1 h)...");
    const p = await passcodeService.createOffline(deviceId, {
      name: "QA offline",
      type: "once",
      startMs: Date.now(),
      endMs: Date.now() + 3600 * 1000,
    });
    if (!p.passcode) throw new Error("A Tuya não retornou a senha offline.");
    await log(`Senha offline gerada: ${p.passcode}`);
  },

  async dynamic_passcode({ deviceId, log }) {
    await log("Solicitando senha dinâmica...");
    const { passcode } = await passcodeService.getDynamic(deviceId);
    if (!passcode) throw new Error("A Tuya não retornou a senha dinâmica.");
    await log(`Senha dinâmica: ${passcode}`);
  },

  async rename_device({ deviceId, log }) {
    const original = (await deviceService.getRaw(deviceId)).name || "";
    await log(`Nome atual: "${original}". Renomeando para "Pado QA Test"...`);
    await deviceService.rename(deviceId, "Pado QA Test");
    await log("Nome alterado.");
    await sleep(1500);
    if (original) {
      await log(`Restaurando nome original "${original}"...`);
      await deviceService.rename(deviceId, original);
      await log("Nome restaurado.");
    }
  },

  async auto_lock({ deviceId, log }) {
    const d = await deviceService.getDetail(deviceId);
    if (d.autoLock.enabled === null) {
      throw new Error("Dispositivo não expõe o DP automatic_lock.");
    }
    const originalSeconds = d.autoLock.enabled ? (d.autoLock.seconds ?? 0) : -1;
    await log(`Configuração atual: ${originalSeconds > 0 ? `${originalSeconds}s` : "desativado"}.`);
    await log("Ativando Fechamento Automático (5s)...");
    await lockService.setAutoLock(deviceId, 5);
    await log("Fechamento Automático ativado. Aguardando 2 segundos...");
    await sleep(2000);
    await log(originalSeconds > 0 ? `Restaurando ${originalSeconds}s...` : "Desativando Fechamento Automático...");
    await lockService.setAutoLock(deviceId, originalSeconds);
    await log("Configuração original restaurada.");
  },

  async get_records({ deviceId, log }) {
    await log("Solicitando histórico de aberturas (últimos 30 dias)...");
    const r = await recordService.getRecords(deviceId, 1, 20);
    await log(`Histórico obtido (${r.list.length} registros retornados, total ${r.total}).`);
  },

  async device_events({ deviceId, log }) {
    await log("Lendo eventos do dispositivo (últimos 7 dias)...");
    const r = await deviceService.getLogs(deviceId, { size: 20 });
    await log(`${r.list.length} eventos retornados.`);
  },

  async check_update({ deviceId, log }) {
    await log("Verificando atualizações de firmware...");
    const fw = await deviceService.getFirmware(deviceId);
    for (const m of fw.modules) {
      await log(`Módulo ${m.module}: versão ${m.currentVersion ?? "?"}${m.latestVersion && m.latestVersion !== m.currentVersion ? ` → ${m.latestVersion}` : ""}`);
    }
    await log(fw.needUpgrade ? "Atualização disponível (aplicar pelo app Smart Life)." : "Firmware atualizado.");
  },
};

export const qualityService = {
  getStepName(stepId: string) {
    return STEP_NAMES[stepId] || stepId;
  },

  isValidStep(stepId: string) {
    return stepId in STEPS;
  },

  async startTest(userId: string, deviceId: string, criteria: string[], testParams: QualityParams = {}) {
    const deviceName = testParams.deviceName || deviceId;

    await prisma.device.upsert({
      where: { deviceId },
      update: testParams.deviceName ? { name: testParams.deviceName } : {},
      create: { deviceId, name: deviceName },
    });

    const audit = await prisma.qualityAudit.create({
      data: {
        deviceId,
        userId,
        status: "executando",
        testerName: testParams.testerName || null,
        params: { ...testParams, deviceName } as Prisma.InputJsonValue,
        steps: {
          create: criteria.map((c, i) => ({
            position: i,
            stepKey: c,
            stepName: this.getStepName(c),
            status: "pendente",
            logs: [],
          })),
        },
      },
      include,
    });

    // Roda em background; o front acompanha por polling em /quality/status.
    this.runScript(deviceId, audit.id).catch((err) => console.error("[Quality] Erro crítico no script:", err));

    return toClientShape(audit);
  },

  async runScript(deviceId: string, auditId: string) {
    const audit = await prisma.qualityAudit.findUnique({ where: { id: auditId }, include });
    if (!audit) return;
    const params = (audit.params ?? {}) as QualityParams;

    for (const step of audit.steps) {
      const logs: string[] = [];
      const log = async (msg: string) => {
        logs.push(msg);
        await prisma.qualityAuditStep.update({ where: { id: step.id }, data: { logs } });
      };

      await prisma.qualityAuditStep.update({ where: { id: step.id }, data: { status: "executando" } });

      let status = "sucesso";
      let errorMsg: string | null = null;
      try {
        await sleep(1000);
        await STEPS[step.stepKey]({ deviceId, params, log });
      } catch (error) {
        status = "falha";
        errorMsg = errMsg(error);
      }

      await prisma.qualityAuditStep.update({ where: { id: step.id }, data: { status, errorMsg, logs } });
    }

    await prisma.qualityAudit.update({
      where: { id: auditId },
      data: { status: "concluido", completedAt: new Date() },
    });
  },

  async getStatus(userId: string, testId: string) {
    const audit = await prisma.qualityAudit.findFirst({ where: { id: testId, userId }, include });
    return audit ? toClientShape(audit) : null;
  },

  async getAllTests(userId: string, deviceId?: string) {
    const audits = await prisma.qualityAudit.findMany({
      where: { userId, ...(deviceId ? { deviceId } : {}) },
      orderBy: { startedAt: "desc" },
      take: 100,
      include,
    });
    return audits.map(toClientShape);
  },

  async deleteTest(userId: string, testId: string) {
    const audit = await prisma.qualityAudit.findFirst({
      where: { id: testId, userId },
      select: { id: true, status: true },
    });
    if (!audit) return { deleted: false, reason: "not_found" as const };
    if (audit.status === "executando") return { deleted: false, reason: "running" as const };
    await prisma.qualityAudit.delete({ where: { id: audit.id } });
    return { deleted: true };
  },

  // Auditorias que ficaram "executando" após um reinício são fechadas como reprovadas.
  async reconcileOrphaned() {
    const orphaned = await prisma.qualityAudit.findMany({ where: { status: "executando" }, select: { id: true } });
    for (const { id } of orphaned) {
      await prisma.qualityAuditStep.updateMany({
        where: { auditId: id, status: { in: ["pendente", "executando"] } },
        data: { status: "falha", errorMsg: "Interrompido: servidor reiniciado." },
      });
      await prisma.qualityAudit.update({ where: { id }, data: { status: "concluido", completedAt: new Date() } });
    }
    return orphaned.length;
  },
};
