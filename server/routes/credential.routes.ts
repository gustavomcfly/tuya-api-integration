import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { credentialService, type UnlockType } from "../services/credential.service.js";
import { BadRequest, idParam, route, text } from "../utils/respond.js";

const router = Router();
router.use(requireAuth);

const TYPES: UnlockType[] = ["card", "fingerprint", "password", "face"];

function unlockType(v: unknown): UnlockType {
  if (!TYPES.includes(v as UnlockType)) throw new BadRequest("Tipo de credencial inválido.");
  return v as UnlockType;
}

router.post(
  "/users",
  route("Erro ao buscar usuários da fechadura", async (req) => ({
    list: await credentialService.listUsers(idParam(req.body.deviceId)),
  })),
);

router.post(
  "/users/add",
  route("Erro ao criar usuário na fechadura", async (req) =>
    credentialService.createUser(idParam(req.body.deviceId), text(req.body.name, "Nome", 30)),
  ),
);

router.post(
  "/list",
  route("Erro ao buscar credenciais", async (req) => ({
    list: await credentialService.listKeys(
      idParam(req.body.deviceId),
      req.body.unlockType ? unlockType(req.body.unlockType) : undefined,
    ),
  })),
);

router.post(
  "/enroll",
  route("Erro ao iniciar cadastro", async (req) => {
    await credentialService.startEnrollment(idParam(req.body.deviceId), {
      userId: idParam(req.body.userId, "userId"),
      userType: Number(req.body.userType) === 1 ? 1 : 2,
      unlockType: unlockType(req.body.unlockType),
    });
  }),
);

router.post(
  "/enroll/cancel",
  route("Erro ao cancelar cadastro", async (req) => {
    await credentialService.cancelEnrollment(idParam(req.body.deviceId), unlockType(req.body.unlockType));
  }),
);

router.post(
  "/delete",
  route("Erro ao excluir credencial", async (req) => {
    await credentialService.removeKey(idParam(req.body.deviceId), {
      userId: idParam(req.body.userId, "userId"),
      userType: Number(req.body.userType) === 1 ? 1 : 2,
      unlockType: unlockType(req.body.unlockType),
      unlockNo: idParam(String(req.body.unlockNo ?? ""), "unlockNo"),
    });
  }),
);

export default router;
