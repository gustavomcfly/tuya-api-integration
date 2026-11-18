import { API_BASE, DB_BASE, apiPost, dbRequest } from "./http";
import type {
  CyclicTest,
  DeviceDetail,
  DeviceEvent,
  DeviceSummary,
  DpFunction,
  FirmwareInfo,
  LockUser,
  OfflinePasscode,
  PasscodeItem,
  QualityAudit,
  Report,
  SessionUser,
  UnlockKey,
  UnlockRecord,
  UnlockType,
  UserSettings,
} from "../types/api";

// ── Autenticação (contas locais do sistema) ─────────────────────────
export interface AuthStatus {
  tuyaConfigured: boolean;
  region: string;
  registration: { hasUsers: boolean; open: boolean; requiresCode: boolean };
}

async function authPost(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Falha na autenticação.");
  return data as { sessionToken: string; user: SessionUser };
}

export const authApi = {
  async status(): Promise<AuthStatus> {
    const res = await fetch(`${API_BASE}/auth/status`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Servidor indisponível.");
    return data;
  },
  login: (username: string, password: string) => authPost("/login", { username, password }),
  register: (body: { username: string; password: string; name?: string; signupCode?: string }) =>
    authPost("/register", body),
};

// ── Dispositivos ────────────────────────────────────────────────────
export const deviceApi = {
  list: () => apiPost<{ list: DeviceSummary[] }>("/device/list").then((r) => r.list),
  detail: (deviceId: string) => apiPost<{ device: DeviceDetail }>("/device/detail", { deviceId }).then((r) => r.device),
  specifications: (deviceId: string) =>
    apiPost<{ category: string; functions: DpFunction[]; status: DpFunction[] }>("/device/specifications", { deviceId }),
  commands: (deviceId: string, commands: { code: string; value: unknown }[]) =>
    apiPost("/device/commands", { deviceId, commands }),
  unlock: (deviceId: string) => apiPost<{ method: string }>("/device/unlock", { deviceId }),
  lock: (deviceId: string) => apiPost<{ method: string }>("/device/lock", { deviceId }),
  rename: (deviceId: string, name: string) => apiPost("/device/rename", { deviceId, name }),
  setAutoLock: (deviceId: string, seconds: number) => apiPost("/device/auto-lock", { deviceId, seconds }),
  remoteUnlockConfig: (deviceId: string) =>
    apiPost<{ config: unknown }>("/device/remote-unlock-config", { deviceId }).then((r) => r.config),
  setRemoteUnlock: (deviceId: string, enabled: boolean) =>
    apiPost("/device/remote-unlock-config/set", { deviceId, enabled }),
  firmware: (deviceId: string) => apiPost<FirmwareInfo>("/device/firmware", { deviceId }),
  logs: (deviceId: string, rowKey?: string) =>
    apiPost<{ list: DeviceEvent[]; hasMore: boolean; nextRowKey: string | null }>("/device/logs", { deviceId, rowKey }),
  remove: (deviceId: string) => apiPost("/device/delete", { deviceId }),
};

// ── Senhas ──────────────────────────────────────────────────────────
export interface CustomPasscodeInput {
  deviceId: string;
  passcode: string;
  name: string;
  startDate?: number;
  endDate?: number;
  once?: boolean;
  schedule?: { weekDays: number[]; startMinute: number; endMinute: number };
}

export const passcodeApi = {
  list: (deviceId: string) => apiPost<{ list: PasscodeItem[] }>("/passcode/list", { deviceId }).then((r) => r.list),
  addCustom: (input: CustomPasscodeInput) => apiPost<{ id: string }>("/passcode/add-custom", { ...input }),
  change: (input: Omit<CustomPasscodeInput, "schedule" | "once"> & { passwordId: string }) =>
    apiPost("/passcode/change", { ...input }),
  remove: (deviceId: string, passwordId: string) => apiPost("/passcode/delete", { deviceId, passwordId }),
  offline: (input: { deviceId: string; name: string; type: "multiple" | "once" | "clear_all"; startDate?: number; endDate?: number }) =>
    apiPost<{ passcode: OfflinePasscode }>("/passcode/offline", { ...input }).then((r) => r.passcode),
  dynamic: (deviceId: string) => apiPost<{ passcode: string }>("/passcode/dynamic", { deviceId }).then((r) => r.passcode),
};

// ── Cartões / biometria ─────────────────────────────────────────────
export const credentialApi = {
  users: (deviceId: string) => apiPost<{ list: LockUser[] }>("/credential/users", { deviceId }).then((r) => r.list),
  addUser: (deviceId: string, name: string) => apiPost<{ userId: string }>("/credential/users/add", { deviceId, name }),
  list: (deviceId: string, unlockType?: UnlockType) =>
    apiPost<{ list: UnlockKey[] }>("/credential/list", { deviceId, unlockType }).then((r) => r.list),
  enroll: (deviceId: string, userId: string, userType: number, unlockType: UnlockType) =>
    apiPost("/credential/enroll", { deviceId, userId, userType, unlockType }),
  cancel: (deviceId: string, unlockType: UnlockType) => apiPost("/credential/enroll/cancel", { deviceId, unlockType }),
  remove: (deviceId: string, key: { userId: string; userType: number; unlockType: string; unlockNo: string }) =>
    apiPost("/credential/delete", { deviceId, ...key }),
};

// ── Histórico ───────────────────────────────────────────────────────
export const recordApi = {
  list: (deviceId: string, pageNo = 1, pageSize = 50) =>
    apiPost<{ list: UnlockRecord[]; total: number }>("/record/list", { deviceId, pageNo, pageSize }),
};

// ── Auditoria de qualidade ──────────────────────────────────────────
export const qualityApi = {
  steps: () => apiPost<{ list: { id: string; name: string }[] }>("/quality/steps").then((r) => r.list),
  start: (deviceId: string, criteria: string[], testParams: Record<string, unknown>) =>
    apiPost<{ data: QualityAudit }>("/quality/start", { deviceId, criteria, testParams }).then((r) => r.data),
  status: (testId: string) => apiPost<{ data: QualityAudit | null }>("/quality/status", { testId }).then((r) => r.data),
  list: (deviceId?: string) => apiPost<{ list: QualityAudit[] }>("/quality/list", { deviceId }).then((r) => r.list),
  remove: (testId: string) => apiPost("/quality/delete", { testId }),
};

// ── Teste de ciclagem (rotas /db) ───────────────────────────────────
const CYCLIC = `${DB_BASE}/cyclic-tests`;

export interface CyclicStartInput {
  deviceId: string;
  deviceName: string;
  category?: string;
  productName?: string | null;
  totalCycles: number;
  delayBetweenCycles: number;
  maxConsecutiveFailures: number;
  lowBatteryThreshold: number;
}

export const cyclicApi = {
  active: () => dbRequest<{ list: CyclicTest[] }>(`${CYCLIC}/active`).then((r) => r.list),
  mine: () => dbRequest<{ list: CyclicTest[] }>(`${CYCLIC}/mine`).then((r) => r.list),
  get: (id: string) => dbRequest<{ test: CyclicTest }>(`${CYCLIC}/${id}`).then((r) => r.test),
  start: (input: CyclicStartInput) =>
    dbRequest<{ testId: string }>(`${CYCLIC}/start`, { method: "POST", body: JSON.stringify(input) }),
  pause: (id: string) => dbRequest(`${CYCLIC}/${id}/pause`, { method: "POST" }),
  resume: (id: string) => dbRequest(`${CYCLIC}/${id}/resume`, { method: "POST" }),
  stop: (id: string) => dbRequest(`${CYCLIC}/${id}/stop`, { method: "POST" }),
  edit: (id: string, updates: Partial<Pick<CyclicTest, "totalCycles" | "delayBetweenCycles" | "maxConsecutiveFailures" | "lowBatteryThreshold">>) =>
    dbRequest(`${CYCLIC}/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  remove: (id: string) => dbRequest(`${CYCLIC}/${id}`, { method: "DELETE" }),
};

// ── Relatórios ──────────────────────────────────────────────────────
const REPORTS = `${API_BASE}/reports`;

export const reportApi = {
  list: () => dbRequest<{ list: Report[] }>(REPORTS).then((r) => r.list),
  saveCyclic: (testId: string, testerName?: string | null) =>
    dbRequest<{ report: Report; alreadySaved?: boolean }>(`${REPORTS}/cyclic`, {
      method: "POST",
      body: JSON.stringify({ testId, testerName }),
    }),
  saveQuality: (testId: string, testerName?: string | null) =>
    dbRequest<{ report: Report; alreadySaved?: boolean }>(`${REPORTS}/quality`, {
      method: "POST",
      body: JSON.stringify({ testId, testerName }),
    }),
  remove: (id: string) => dbRequest(`${REPORTS}/${id}`, { method: "DELETE" }),
};

// ── Configurações ───────────────────────────────────────────────────
export const settingsApi = {
  get: () => dbRequest<{ settings: UserSettings }>(`${API_BASE}/settings`).then((r) => r.settings),
  save: (settings: UserSettings) =>
    dbRequest<{ settings: UserSettings }>(`${API_BASE}/settings`, { method: "PUT", body: JSON.stringify(settings) }).then(
      (r) => r.settings,
    ),
};
