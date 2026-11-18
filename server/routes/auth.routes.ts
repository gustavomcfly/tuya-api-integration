import { Router } from "express";
import { requireAuth, signSession, currentUser } from "../middleware/auth.js";
import { userService } from "../services/user.service.js";
import { tuyaConfig } from "../tuya/client.js";

const router = Router();

// Cadastro aberto apenas para:
//  - o primeiro usuário (bootstrap), ou
//  - quem informar o SIGNUP_CODE definido no .env.
// Sem SIGNUP_CODE, depois do primeiro usuário o cadastro fica fechado.
async function registrationState() {
  const users = await userService.count();
  const code = process.env.SIGNUP_CODE || "";
  return { hasUsers: users > 0, open: users === 0 || Boolean(code), requiresCode: users > 0 && Boolean(code) };
}

router.get("/status", async (_req, res) => {
  const cfg = tuyaConfig();
  try {
    const reg = await registrationState();
    res.json({
      success: true,
      tuyaConfigured: cfg.configured,
      region: cfg.region,
      registration: reg,
    });
  } catch (err) {
    console.error("[Auth] Erro ao ler status:", err);
    res.status(503).json({ success: false, message: "Banco de dados indisponível." });
  }
});

router.post("/register", async (req, res) => {
  try {
    const username = userService.normalizeUsername(req.body?.username);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : null;

    if (!/^[a-z0-9._@-]{3,60}$/.test(username)) {
      return res.status(400).json({ success: false, message: "Usuário inválido (3-60 caracteres: letras, números, . _ @ -)." });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "A senha deve ter pelo menos 8 caracteres." });
    }

    const reg = await registrationState();
    if (!reg.open) {
      return res.status(403).json({ success: false, message: "Cadastro fechado. Peça acesso ao administrador." });
    }
    if (reg.requiresCode && req.body?.signupCode !== process.env.SIGNUP_CODE) {
      return res.status(403).json({ success: false, message: "Código de cadastro inválido." });
    }

    const user = await userService.create(username, password, name);
    res.status(201).json({
      success: true,
      sessionToken: signSession({ id: user.id, username: user.username }),
      user: { id: user.id, username: user.username, name: user.name },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return res.status(409).json({ success: false, message: "Este usuário já existe." });
    }
    console.error("[Auth] Erro ao cadastrar:", err);
    res.status(500).json({ success: false, message: "Erro ao cadastrar usuário." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const username = userService.normalizeUsername(req.body?.username);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Informe usuário e senha." });
    }
    const user = await userService.authenticate(username, password);
    if (!user) {
      return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
    }
    res.json({
      success: true,
      sessionToken: signSession({ id: user.id, username: user.username }),
      user: { id: user.id, username: user.username, name: user.name },
    });
  } catch (err) {
    console.error("[Auth] Erro no login:", err);
    res.status(503).json({ success: false, message: "Banco de dados indisponível. Tente novamente." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await userService.getById(currentUser(req).id);
  if (!user) return res.status(401).json({ success: false, message: "Usuário não encontrado." });
  res.json({ success: true, user: { id: user.id, username: user.username, name: user.name } });
});

export default router;
