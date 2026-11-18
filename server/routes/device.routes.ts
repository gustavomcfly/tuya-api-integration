import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { deviceService } from "../services/device.service.js";
import { lockService } from "../services/lock.service.js";
import { BadRequest, idParam, route, text } from "../utils/respond.js";

const router = Router();
router.use(requireAuth);

router.post("/list", route("Erro ao buscar dispositivos", async () => ({ list: await deviceService.listDevices() })));

router.post(
  "/detail",
  route("Erro ao buscar detalhes", async (req) => ({ device: await deviceService.getDetail(idParam(req.body.deviceId)) })),
);

router.post(
  "/specifications",
  route("Erro ao buscar funções do dispositivo", async (req) => deviceService.getSpecifications(idParam(req.body.deviceId))),
);

router.post(
  "/status",
  route("Erro ao buscar status", async (req) => ({ status: await deviceService.getStatus(idParam(req.body.deviceId)) })),
);

router.post(
  "/commands",
  route("Erro ao enviar comando", async (req) => {
    const commands = req.body.commands;
    if (
      !Array.isArray(commands) ||
      commands.length === 0 ||
      commands.length > 10 ||
      !commands.every((c) => c && typeof c.code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(c.code) && "value" in c)
    ) {
      throw new BadRequest("Lista de comandos inválida.");
    }
    const result = await deviceService.sendCommands(
      idParam(req.body.deviceId),
      commands.map((c: { code: string; value: unknown }) => ({ code: c.code, value: c.value })),
    );
    return { result };
  }),
);

router.post(
  "/unlock",
  route("Erro ao destrancar", async (req) => lockService.unlock(idParam(req.body.deviceId))),
);

router.post("/lock", route("Erro ao trancar", async (req) => lockService.lock(idParam(req.body.deviceId))));

router.post(
  "/rename",
  route("Erro ao renomear", async (req) => {
    await deviceService.rename(idParam(req.body.deviceId), text(req.body.name, "Nome", 50));
  }),
);

router.post(
  "/auto-lock",
  route("Erro ao configurar fechamento automático", async (req) => {
    const seconds = parseInt(req.body.seconds);
    if (!Number.isInteger(seconds) || seconds < -1 || seconds > 1800) {
      throw new BadRequest("Tempo de fechamento automático inválido (1 a 1800 s, ou -1 para desativar).");
    }
    await lockService.setAutoLock(idParam(req.body.deviceId), seconds);
  }),
);

router.post(
  "/remote-unlock-config",
  route("Erro ao ler configuração de abertura remota", async (req) => ({
    config: await lockService.getRemoteUnlockConfig(idParam(req.body.deviceId)),
  })),
);

router.post(
  "/remote-unlock-config/set",
  route("Erro ao configurar abertura remota", async (req) => {
    await lockService.setRemoteUnlockWithoutPassword(idParam(req.body.deviceId), Boolean(req.body.enabled));
  }),
);

router.post(
  "/firmware",
  route("Erro ao checar firmware", async (req) => deviceService.getFirmware(idParam(req.body.deviceId))),
);

router.post(
  "/logs",
  route("Erro ao buscar eventos do dispositivo", async (req) =>
    deviceService.getLogs(idParam(req.body.deviceId), {
      size: Math.min(100, Math.max(1, parseInt(req.body.size) || 50)),
      rowKey: typeof req.body.rowKey === "string" ? req.body.rowKey : undefined,
    }),
  ),
);

router.post(
  "/delete",
  route("Erro ao remover dispositivo", async (req) => {
    await deviceService.remove(idParam(req.body.deviceId));
  }),
);

export default router;
