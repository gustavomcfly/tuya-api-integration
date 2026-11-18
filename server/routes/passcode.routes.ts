import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { passcodeService, type ScheduleInput } from "../services/passcode.service.js";
import { BadRequest, idParam, optionalMs, route, text } from "../utils/respond.js";

const router = Router();
router.use(requireAuth);

function passcode(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : String(value ?? "");
  if (!/^\d{6,10}$/.test(v)) {
    throw new BadRequest("A senha deve ter de 6 a 10 dígitos (Wi-Fi: 7; Zigbee/BLE: 6).");
  }
  return v;
}

function schedule(value: unknown): ScheduleInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  const weekDays = Array.isArray(s.weekDays) ? s.weekDays.map(Number).filter((d) => d >= 0 && d <= 6) : [];
  const startMinute = Number(s.startMinute);
  const endMinute = Number(s.endMinute);
  if (weekDays.length === 0 || !(startMinute >= 0 && endMinute <= 1440 && startMinute < endMinute)) {
    throw new BadRequest("Agenda inválida: escolha os dias e um horário inicial menor que o final.");
  }
  return { weekDays, startMinute, endMinute };
}

router.post(
  "/list",
  route("Falha ao buscar lista de senhas.", async (req) => ({
    list: await passcodeService.list(idParam(req.body.deviceId), req.body.valid !== false),
  })),
);

router.post(
  "/add-custom",
  route("Falha ao adicionar senha.", async (req) =>
    passcodeService.create(idParam(req.body.deviceId), {
      passcode: passcode(req.body.passcode),
      name: text(req.body.name || "Senha Customizada", "Nome", 30),
      startMs: optionalMs(req.body.startDate),
      endMs: optionalMs(req.body.endDate),
      schedule: schedule(req.body.schedule),
      once: Boolean(req.body.once),
    }),
  ),
);

router.post(
  "/change",
  route("Falha ao alterar senha.", async (req) => {
    await passcodeService.change(idParam(req.body.deviceId), idParam(req.body.passwordId, "passwordId"), {
      passcode: passcode(req.body.passcode),
      name: text(req.body.name || "Senha Customizada", "Nome", 30),
      startMs: optionalMs(req.body.startDate),
      endMs: optionalMs(req.body.endDate),
    });
  }),
);

router.post(
  "/delete",
  route("Falha ao excluir senha.", async (req) => {
    await passcodeService.remove(idParam(req.body.deviceId), idParam(req.body.passwordId, "passwordId"));
  }),
);

router.post(
  "/offline",
  route("Falha ao gerar senha offline.", async (req) => {
    const type = req.body.type;
    if (!["multiple", "once", "clear_all"].includes(type)) throw new BadRequest("Tipo de senha offline inválido.");
    return {
      passcode: await passcodeService.createOffline(idParam(req.body.deviceId), {
        name: text(req.body.name || "Senha Offline", "Nome", 30),
        type,
        startMs: optionalMs(req.body.startDate),
        endMs: optionalMs(req.body.endDate),
      }),
    };
  }),
);

router.post(
  "/dynamic",
  route("Falha ao obter senha dinâmica.", async (req) => passcodeService.getDynamic(idParam(req.body.deviceId))),
);

export default router;
