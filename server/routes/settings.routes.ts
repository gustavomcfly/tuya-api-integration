import { Router } from "express";
import type { UserSettings } from "@prisma/client";
import prisma from "../prismaClient.js";
import { currentUser, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const DEFAULTS = {
  testerName: "",
  stdPasscode: "",
  defaultCycles: 100,
  defaultUnlockTime: 5,
  defaultInterval: 5,
};

const text = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = parseInt(String(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

function toClient(row: UserSettings | null) {
  if (!row) return { ...DEFAULTS };
  return {
    testerName: row.testerName ?? "",
    stdPasscode: row.stdPasscode ?? "",
    defaultCycles: row.defaultCycles,
    defaultUnlockTime: row.defaultUnlockTime,
    defaultInterval: row.defaultInterval,
  };
}

router.get("/", async (req, res) => {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId: currentUser(req).id } });
    res.json({ success: true, settings: toClient(row) });
  } catch (err) {
    console.error("[Settings] Erro ao buscar:", err);
    res.status(500).json({ success: false, message: "Erro ao buscar configurações." });
  }
});

router.put("/", async (req, res) => {
  try {
    const b = req.body || {};
    const stdPasscode = text(b.stdPasscode, 10);
    if (stdPasscode && !/^\d{6,10}$/.test(stdPasscode)) {
      return res.status(400).json({ success: false, message: "A senha padrão deve ter de 6 a 10 dígitos." });
    }
    const data = {
      testerName: text(b.testerName) || null,
      stdPasscode: stdPasscode || null,
      defaultCycles: int(b.defaultCycles, DEFAULTS.defaultCycles, 1, 1_000_000),
      defaultUnlockTime: int(b.defaultUnlockTime, DEFAULTS.defaultUnlockTime, 0, 3600),
      defaultInterval: int(b.defaultInterval, DEFAULTS.defaultInterval, 0, 3600),
    };
    const userId = currentUser(req).id;
    const row = await prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    res.json({ success: true, settings: toClient(row) });
  } catch (err) {
    console.error("[Settings] Erro ao salvar:", err);
    res.status(500).json({ success: false, message: "Erro ao salvar configurações." });
  }
});

export default router;
