// Tipos compartilhados entre a API (server/) e as telas.

export interface ApiEnvelope {
  errcode: number;
  errmsg?: string;
  errmsgOriginal?: string;
}

export interface StatusItem {
  code: string;
  value: unknown;
}

export interface DeviceSummary {
  deviceId: string;
  name: string;
  online: boolean;
  category: string;
  productId: string | null;
  productName: string | null;
  model: string | null;
  icon: string | null;
  isLock: boolean;
  battery: number | null;
  activeTime: number | null;
  updateTime: number | null;
}

export interface DeviceDetail extends DeviceSummary {
  ip: string | null;
  timeZone: string | null;
  uuid: string | null;
  sub: boolean;
  status: StatusItem[];
  switchCode: string | null;
  autoLock: { enabled: boolean | null; seconds: number | null };
}

export interface DpFunction {
  code: string;
  name: string | null;
  type: string;
  values: Record<string, unknown>;
  writable: boolean;
}

export interface FirmwareInfo {
  modules: {
    module: string;
    currentVersion: string | null;
    latestVersion: string | null;
    upgradeStatus: number | null;
    upgradeText: string | null;
  }[];
  needUpgrade: boolean;
}

export interface DeviceEvent {
  time: number;
  event: string;
  code: string | null;
  value: unknown;
  source: string | null;
}

export interface UnlockRecord {
  time: number;
  method: string;
  code: string;
  value: unknown;
  user: string | null;
}

export interface PasscodeItem {
  id: string;
  name: string;
  effectiveTime: number | null;
  invalidTime: number | null;
  phase: number | null;
  deliveryStatus: number | string | null;
}

export interface OfflinePasscode {
  id: string | null;
  passcode: string;
  name: string;
  effectiveTime: number | null;
  invalidTime: number | null;
}

export type UnlockType = "card" | "fingerprint" | "password" | "face";

export interface LockUser {
  userId: string;
  name: string;
  userType: number;
}

export interface UnlockKey {
  unlockNo: string;
  unlockType: string;
  name: string | null;
  userId: string | null;
  userType: number | null;
}

export interface UserSettings {
  testerName: string;
  stdPasscode: string;
  defaultCycles: number;
  defaultUnlockTime: number;
  defaultInterval: number;
}

export type CyclicStatus = "running" | "paused" | "completed" | "failed" | "stopped";

export interface CyclicLog {
  id: string;
  type: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: string;
}

export interface CyclicTest {
  id: string;
  deviceId: string;
  totalCycles: number;
  completedCycles: number;
  delayBetweenCycles: number;
  status: CyclicStatus;
  totalFailures: number;
  maxConsecutiveFailures: number;
  lowBatteryThreshold: number;
  battery: number | null;
  batteryStart: number | null;
  batteryEnd: number | null;
  startedAt: string;
  completedAt: string | null;
  device?: { deviceId: string; name: string; category: string | null };
  user?: { username: string; name: string | null } | null;
  logs?: CyclicLog[];
}

export type QualityStepStatus = "pendente" | "executando" | "sucesso" | "falha";

export interface QualityStep {
  id: string;
  name: string;
  status: QualityStepStatus;
  errorMsg: string | null;
  logs: string[];
}

export interface QualityAudit {
  testId: string;
  deviceId: string;
  deviceName: string;
  status: "executando" | "concluido";
  startTime: number;
  endTime: number | null;
  steps: QualityStep[];
}

export interface Report {
  id: string;
  type: "cyclic" | "quality";
  title: string;
  deviceId: string;
  deviceName: string;
  status: string;
  testerName: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface SessionUser {
  id: string;
  username: string;
  name: string | null;
}
