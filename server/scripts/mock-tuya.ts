// Simulador da Tuya Cloud para desenvolvimento e demonstração (sem hardware).
//
//   npm run mock:tuya          (sobe em http://localhost:3999)
//
// E rode o servidor apontando para ele:
//   TUYA_BASE_URL=http://localhost:3999  TUYA_ACCESS_ID=mockaccessid0000
//   TUYA_ACCESS_SECRET=mock-secret-0123456789abcdefghij
//
// Valida a assinatura HMAC de toda requisição (headers client_id/sign/t/nonce/
// access_token), cifra a ticket_key com o Access Secret e decifra as senhas enviadas,
// exatamente como a nuvem real. Simula: uma fechadura Wi-Fi, uma tomada e uma
// fechadura offline. MOCK_FAIL_RATE=0.1 faz 10% dos comandos falharem (testa a ciclagem).
import express, { type Request, type Response } from "express";
import crypto from "node:crypto";
import { calcSign, canonicalUrl } from "../tuya/sign.js";

const PORT = Number(process.env.MOCK_PORT) || 3999;
const ACCESS_ID = process.env.MOCK_ACCESS_ID || "mockaccessid0000";
const SECRET = process.env.MOCK_ACCESS_SECRET || "mock-secret-0123456789abcdefghij"; // 32 chars
const FAIL_RATE = Number(process.env.MOCK_FAIL_RATE) || 0;

if (SECRET.length !== 32) throw new Error("MOCK_ACCESS_SECRET precisa ter 32 caracteres");

type Status = { code: string; value: unknown }[];
interface MockDevice {
  id: string;
  name: string;
  category: string;
  product_name: string;
  online: boolean;
  icon: string;
  status: Status;
  functions: { code: string; type: string; values: string }[];
}

const devices: MockDevice[] = [
  {
    id: "mocklockwifi001",
    name: "Fechadura FDE-300W (simulada)",
    category: "jtmspro",
    product_name: "Pado FDE-300W",
    online: true,
    icon: "",
    status: [
      { code: "residual_electricity", value: 87 },
      { code: "automatic_lock", value: true },
      { code: "auto_lock_time", value: 10 },
      { code: "lock_motor_state", value: true },
      { code: "remote_no_dp_key", value: "" },
    ],
    functions: [
      { code: "automatic_lock", type: "Boolean", values: "{}" },
      { code: "auto_lock_time", type: "Integer", values: JSON.stringify({ min: 1, max: 1800, step: 1, unit: "s", scale: 0 }) },
      { code: "alarm_volume", type: "Enum", values: JSON.stringify({ range: ["mute", "low", "normal", "high"] }) },
    ],
  },
  {
    id: "mockplug0000001",
    name: "Tomada de bancada (simulada)",
    category: "cz",
    product_name: "Smart Plug 16A",
    online: true,
    icon: "",
    status: [
      { code: "switch_1", value: false },
      { code: "cur_power", value: 0 },
    ],
    functions: [
      { code: "switch_1", type: "Boolean", values: "{}" },
      { code: "countdown_1", type: "Integer", values: JSON.stringify({ min: 0, max: 86400, step: 1, unit: "s" }) },
    ],
  },
  {
    id: "mocklockoffline",
    name: "Fechadura FDE-250 (offline)",
    category: "ms",
    product_name: "Pado FDE-250",
    online: false,
    icon: "",
    status: [{ code: "residual_electricity", value: 12 }],
    functions: [],
  },
];

const tokens = new Map<string, number>(); // access_token -> expira em
const refreshTokens = new Set<string>();
const tickets = new Map<string, { key: Buffer; expires: number }>();
const tempPasswords = new Map<string, { id: string; name: string; effective_time: number; invalid_time: number; phase: number; password: string }[]>();
const openLogs = new Map<string, { status: { code: string; value: unknown }; update_time: number; nick_name: string }[]>();
const lockUsers = new Map<string, { user_id: string; nick_name: string; user_type: number }[]>();
const keys = new Map<string, { unlock_no: string; unlock_type: string; user_id: string | null; unlock_name: string }[]>();
const deviceLogs = new Map<string, { event_id: number; code?: string; value?: unknown; event_time: number; event_from: string }[]>();
let seq = 1;

const app = express();
app.use(express.text({ type: "*/*" }));

const ok = (res: Response, result: unknown) => res.json({ success: true, result, t: Date.now(), tid: crypto.randomUUID() });
const fail = (res: Response, code: number, msg: string) => res.json({ success: false, code, msg, t: Date.now() });

const find = (id: string) => devices.find((d) => d.id === id);
const setStatus = (d: MockDevice, code: string, value: unknown) => {
  const s = d.status.find((x) => x.code === code);
  if (s) s.value = value;
  else d.status.push({ code, value });
  const logs = deviceLogs.get(d.id) ?? [];
  logs.unshift({ event_id: 7, code, value, event_time: Date.now(), event_from: "1" });
  deviceLogs.set(d.id, logs.slice(0, 200));
};
const body = (req: Request): Record<string, unknown> => {
  try {
    return req.body ? JSON.parse(req.body as string) : {};
  } catch {
    return {};
  }
};

// ── Validação de assinatura (igual à nuvem) ─────────────────────────
app.use((req, res, next) => {
  const h = req.headers;
  const isToken = req.path.startsWith("/v1.0/token");
  if (h.client_id !== ACCESS_ID) return fail(res, 1005, "clientId invalid");
  if (h.sign_method !== "HMAC-SHA256") return fail(res, 1004, "sign invalid");
  const t = String(h.t ?? "");
  if (!/^\d{13}$/.test(t) || Math.abs(Date.now() - Number(t)) > 5 * 60 * 1000) return fail(res, 1013, "request time is invalid");
  const accessToken = isToken ? undefined : String(h.access_token ?? "");
  if (!isToken) {
    const exp = tokens.get(accessToken!);
    if (!exp) return fail(res, 1011, "token invalid");
    if (exp < Date.now()) return fail(res, 1010, "token is expired");
  }
  const query = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)]));
  const expected = calcSign({
    clientId: ACCESS_ID,
    secret: SECRET,
    t,
    nonce: h.nonce ? String(h.nonce) : undefined,
    accessToken,
    method: req.method,
    url: canonicalUrl(req.path, query),
    body: typeof req.body === "string" ? req.body : "",
  });
  if (expected !== h.sign) return fail(res, 1004, "sign invalid");
  next();
});

// ── Token ───────────────────────────────────────────────────────────
function issueToken(res: Response) {
  const access = crypto.randomBytes(16).toString("hex");
  const refresh = crypto.randomBytes(16).toString("hex");
  tokens.set(access, Date.now() + 7200 * 1000);
  refreshTokens.add(refresh);
  ok(res, { access_token: access, refresh_token: refresh, expire_time: 7200, uid: "mockuid0001" });
}
app.get("/v1.0/token", (req, res) => (req.query.grant_type === "1" ? issueToken(res) : fail(res, 1003, "grant type invalid")));
app.get("/v1.0/token/:refresh", (req, res) => {
  if (!refreshTokens.delete(req.params.refresh)) return fail(res, 1011, "token invalid");
  issueToken(res);
});

// ── Dispositivos ────────────────────────────────────────────────────
app.get("/v1.0/iot-01/associated-users/devices", (_req, res) =>
  ok(res, { devices, has_more: false, last_row_key: "", total: devices.length }),
);

app.get("/v1.0/devices/:id", (req, res) => {
  const d = find(req.params.id);
  if (!d) return fail(res, 2010, "device not exist");
  ok(res, { ...d, uid: "mockuid0001", ip: "177.10.0.5", time_zone: "-03:00", active_time: 1735700000, update_time: Math.floor(Date.now() / 1000), local_key: "secret-local-key" });
});
app.get("/v1.0/devices/:id/status", (req, res) => {
  const d = find(req.params.id);
  return d ? ok(res, d.status) : fail(res, 2010, "device not exist");
});
app.get("/v1.0/devices/:id/specifications", (req, res) => {
  const d = find(req.params.id);
  if (!d) return fail(res, 2010, "device not exist");
  ok(res, { category: d.category, functions: d.functions, status: d.status.map((s) => ({ code: s.code, type: typeof s.value === "boolean" ? "Boolean" : "Integer", values: "{}" })) });
});
app.post("/v1.0/devices/:id/commands", (req, res) => {
  const d = find(req.params.id);
  if (!d) return fail(res, 2010, "device not exist");
  if (!d.online) return fail(res, 2001, "device is offline");
  if (FAIL_RATE && Math.random() < FAIL_RATE) return fail(res, 1103, "commands issue error");
  const cmds = (body(req).commands ?? []) as { code: string; value: unknown }[];
  for (const c of cmds) {
    if (!d.functions.some((f) => f.code === c.code)) return fail(res, 2008, "command or value not support");
  }
  for (const c of cmds) setStatus(d, c.code, c.value);
  ok(res, true);
});
app.put("/v2.0/cloud/thing/:id/attribute", (req, res) => {
  const d = find(req.params.id);
  if (!d) return fail(res, 2010, "device not exist");
  const b = body(req);
  if (b.type !== 1 || typeof b.data !== "string") return fail(res, 1109, "param is illegal");
  d.name = b.data;
  ok(res, true);
});
app.delete("/v1.0/devices/:id", (req, res) => {
  const i = devices.findIndex((d) => d.id === req.params.id);
  if (i < 0) return fail(res, 2010, "device not exist");
  devices.splice(i, 1);
  ok(res, true);
});
app.get("/v2.0/cloud/thing/:id/firmware", (req, res) => {
  if (!find(req.params.id)) return fail(res, 2010, "device not exist");
  ok(res, [
    { type: 0, type_desc: "Wi-Fi", current_version: "1.2.3", version: "1.2.3", upgrade_status: 0 },
    { type: 9, type_desc: "MCU", current_version: "2.0.1", version: "2.1.0", upgrade_status: 1, upgrade_text: "Melhorias de motor" },
  ]);
});
app.get("/v1.0/devices/:id/logs", (req, res) => {
  if (!find(req.params.id)) return fail(res, 2010, "device not exist");
  ok(res, { device_id: req.params.id, has_next: false, logs: (deviceLogs.get(req.params.id) ?? []).slice(0, Number(req.query.size) || 20) });
});

// ── Fechadura ───────────────────────────────────────────────────────
const lockOnly = (req: Request, res: Response): MockDevice | null => {
  const d = find(req.params.id as string);
  if (!d) return fail(res, 2010, "device not exist"), null;
  if (!["jtmspro", "ms"].includes(d.category)) return fail(res, 2009, "not support this device"), null;
  if (!d.online) return fail(res, 2001, "device is offline"), null;
  return d;
};

app.post("/v1.0/smart-lock/devices/:id/password-ticket", (req, res) => {
  if (!lockOnly(req, res)) return;
  const key = crypto.randomBytes(8).toString("hex"); // 16 caracteres = chave AES-128
  const cipher = crypto.createCipheriv("aes-256-ecb", Buffer.from(SECRET, "utf8"), null);
  const ticketKey = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]).toString("hex").toUpperCase();
  const ticketId = crypto.randomBytes(8).toString("hex");
  tickets.set(ticketId, { key: Buffer.from(key, "utf8"), expires: Date.now() + 360_000 });
  ok(res, { ticket_id: ticketId, ticket_key: ticketKey, expire_time: 360 });
});

function useTicket(id: unknown): Buffer | null {
  const t = tickets.get(String(id));
  tickets.delete(String(id));
  return t && t.expires > Date.now() ? t.key : null;
}

function decryptPassword(hex: string, key: Buffer): string | null {
  try {
    const d = crypto.createDecipheriv("aes-128-ecb", key, null);
    return Buffer.concat([d.update(Buffer.from(hex, "hex")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

app.post("/v1.0/smart-lock/devices/:id/password-free/door-operate", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const b = body(req);
  if (!useTicket(b.ticket_id)) return fail(res, 2028, "encryption token expire");
  if (FAIL_RATE && Math.random() < FAIL_RATE) return fail(res, 1103, "commands issue error");
  const open = b.open !== false;
  setStatus(d, "lock_motor_state", !open);
  if (open) {
    const logs = openLogs.get(d.id) ?? [];
    logs.unshift({ status: { code: "unlock_remote", value: 1 }, update_time: Date.now(), nick_name: "API" });
    openLogs.set(d.id, logs);
  }
  // consumo de bateria simulado
  const bat = d.status.find((s) => s.code === "residual_electricity");
  if (bat && Math.random() < 0.05) bat.value = Math.max(0, Number(bat.value) - 1);
  ok(res, true);
});

app.get("/v1.0/devices/:id/door-lock/remote-unlocks", (req, res) => {
  if (!lockOnly(req, res)) return;
  ok(res, [{ remote_unlock_type: "remoteUnlockWithoutPwd", open: true }]);
});
app.post("/v1.0/devices/:id/door-lock/remote-unlock/config", (req, res) => (lockOnly(req, res) ? ok(res, true) : undefined));

app.post("/v1.0/devices/:id/door-lock/temp-password", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const b = body(req);
  const key = useTicket(b.ticket_id);
  if (!key) return fail(res, 2028, "encryption token expire");
  const plain = decryptPassword(String(b.password), key);
  if (!plain || !/^\d{7}$/.test(plain)) return fail(res, 1109, "param is illegal (wifi lock password must be 7 digits)");
  const list = tempPasswords.get(d.id) ?? [];
  if (list.some((p) => p.password === plain && p.phase !== 0)) return fail(res, 1109, "password already exists");
  const id = String(seq++);
  list.push({ id, name: String(b.name ?? ""), effective_time: Number(b.effective_time), invalid_time: Number(b.invalid_time), phase: 1, password: plain });
  tempPasswords.set(d.id, list);
  setTimeout(() => {
    const p = list.find((x) => x.id === id);
    if (p && p.phase === 1) p.phase = 2;
  }, 2500);
  ok(res, { id: Number(id) });
});
app.get("/v1.0/devices/:id/door-lock/temp-passwords", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  ok(res, (tempPasswords.get(d.id) ?? []).filter((p) => p.phase !== 0).map(({ password: _pw, ...p }) => p));
});
app.delete("/v1.0/devices/:id/door-lock/temp-passwords/:pid", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const p = (tempPasswords.get(d.id) ?? []).find((x) => x.id === req.params.pid);
  if (!p) return fail(res, 1000, "data not exist");
  p.phase = 0;
  ok(res, true);
});
app.put("/v1.0/devices/:id/door-lock/temp-passwords/:pid/modify-password", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const p = (tempPasswords.get(d.id) ?? []).find((x) => x.id === req.params.pid && x.phase !== 0);
  if (!p) return fail(res, 1000, "data not exist");
  const b = body(req);
  const key = useTicket(b.ticket_id);
  if (!key) return fail(res, 2028, "encryption token expire");
  const plain = decryptPassword(String(b.password), key);
  if (!plain || !/^\d{7}$/.test(plain)) return fail(res, 1109, "param is illegal");
  Object.assign(p, { password: plain, name: String(b.name ?? p.name), effective_time: Number(b.effective_time), invalid_time: Number(b.invalid_time) });
  ok(res, true);
});
app.post("/v1.1/devices/:id/door-lock/offline-temp-password", (req, res) => {
  if (!lockOnly(req, res)) return;
  const b = body(req);
  ok(res, {
    offline_temp_password_id: String(seq++),
    offline_temp_password: String(crypto.randomInt(1e9, 1e10)),
    offline_temp_password_name: b.name,
    effective_time: b.effective_time,
    invalid_time: b.invalid_time,
  });
});
app.get("/v1.0/devices/:id/door-lock/dynamic-password", (req, res) => {
  if (!lockOnly(req, res)) return;
  ok(res, { dynamic_password: String(crypto.randomInt(1e7, 1e8)) });
});
app.get("/v1.1/devices/:id/door-lock/open-logs", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const logs = openLogs.get(d.id) ?? [];
  const size = Number(req.query.page_size) || 20;
  const page = Number(req.query.page_no) || 1;
  ok(res, { total: logs.length, logs: logs.slice((page - 1) * size, page * size) });
});

// Usuários e credenciais
app.get("/v1.0/smart-lock/devices/:id/users", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  if (!lockUsers.has(d.id)) lockUsers.set(d.id, [{ user_id: "100", nick_name: "Administrador", user_type: 1 }]);
  const list = lockUsers.get(d.id)!;
  ok(res, { records: list, total: list.length, has_more: false });
});
app.post("/v1.0/devices/:id/user", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const id = String(200 + seq++);
  const list = lockUsers.get(d.id) ?? [];
  list.push({ user_id: id, nick_name: String(body(req).nick_name ?? "Usuário"), user_type: 2 });
  lockUsers.set(d.id, list);
  ok(res, { user_id: id });
});
app.get("/v1.0/devices/:id/door-lock/user-types/:ut/users/:uid/assigned-keys", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const t = req.query.unlock_type;
  ok(res, { unlock_keys: (keys.get(d.id) ?? []).filter((k) => k.user_id === req.params.uid && (!t || k.unlock_type === t)) });
});
app.get("/v1.0/devices/:id/door-lock/unassigned-keys", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const t = req.query.unlock_type;
  ok(res, { unlock_keys: (keys.get(d.id) ?? []).filter((k) => !k.user_id && (!t || k.unlock_type === t)) });
});
app.put("/v1.0/devices/:id/door-lock/actions/entry", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const b = body(req);
  // simula a pessoa encostando o cartão/dedo 3 s depois
  setTimeout(() => {
    const list = keys.get(d.id) ?? [];
    list.push({ unlock_no: String(seq++), unlock_type: String(b.unlock_type), user_id: String(b.user_id), unlock_name: `${b.unlock_type} ${list.length + 1}` });
    keys.set(d.id, list);
  }, 3000);
  ok(res, true);
});
app.put("/v1.0/devices/:id/door-lock/unlock-types/:type/actions/cancel", (req, res) => (lockOnly(req, res) ? ok(res, true) : undefined));
app.delete("/v1.0/devices/:id/door-lock/user-types/:ut/users/:uid/unlock-types/:type/keys/:no", (req, res) => {
  const d = lockOnly(req, res);
  if (!d) return;
  const list = keys.get(d.id) ?? [];
  const i = list.findIndex((k) => k.unlock_no === req.params.no && k.unlock_type === req.params.type);
  if (i < 0) return fail(res, 1000, "data not exist");
  list.splice(i, 1);
  ok(res, true);
});

app.use((_req, res) => fail(res, 1108, "uri path invalid"));

app.listen(PORT, () => {
  console.log(`Mock Tuya Cloud em http://localhost:${PORT}`);
  console.log(`  TUYA_BASE_URL=http://localhost:${PORT}  TUYA_ACCESS_ID=${ACCESS_ID}  TUYA_ACCESS_SECRET=${SECRET}`);
  if (FAIL_RATE) console.log(`  Injetando falhas em ${(FAIL_RATE * 100).toFixed(0)}% dos comandos`);
});
