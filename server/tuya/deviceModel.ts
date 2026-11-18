// Normalização dos dispositivos Tuya para o formato que o front consome.

// Categorias de fechadura da Tuya (ms = fechadura residencial, jtmspro = Wi-Fi pro,
// videolock = com câmera, jtmsbh = BLE+Wi-Fi, gyms = comercial, hotelms = hotel,
// mk = controle de acesso).
export const LOCK_CATEGORIES = new Set([
  "ms",
  "jtmspro",
  "jtmsbh",
  "videolock",
  "gyms",
  "hotelms",
  "mk",
  "bxx",
]);

// DPs booleanos usados como "atuador" em dispositivos que não são fechadura
// (tomada, relé, interruptor...). Permite rodar a ciclagem em qualquer dispositivo.
export const SWITCH_CODES = ["switch_1", "switch", "switch_led", "switch_on", "switch_usb1"];

export const BATTERY_CODES = [
  "residual_electricity",
  "battery_percentage",
  "va_battery",
  "battery_value",
];

const BATTERY_STATE_PCT: Record<string, number> = {
  high: 100,
  middle: 60,
  medium: 60,
  low: 20,
  poweroff: 0,
};

export interface StatusItem {
  code: string;
  value: unknown;
  type?: string;
}

export interface RawDevice {
  id: string;
  name?: string;
  online?: boolean;
  category?: string;
  product_id?: string;
  product_name?: string;
  model?: string;
  icon?: string;
  ip?: string;
  time_zone?: string;
  uid?: string;
  uuid?: string;
  sub?: boolean;
  active_time?: number;
  create_time?: number;
  update_time?: number;
  status?: StatusItem[];
  local_key?: string;
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

export function isLockCategory(category?: string | null): boolean {
  return Boolean(category && LOCK_CATEGORIES.has(category));
}

export function statusValue(status: StatusItem[] | undefined, code: string): unknown {
  return status?.find((s) => s.code === code)?.value;
}

export function batteryFromStatus(status?: StatusItem[]): number | null {
  for (const code of BATTERY_CODES) {
    const v = Number(statusValue(status, code));
    if (Number.isFinite(v) && v >= 0) return Math.min(100, Math.round(v));
  }
  const state = statusValue(status, "battery_state");
  if (typeof state === "string" && state in BATTERY_STATE_PCT) return BATTERY_STATE_PCT[state];
  return null;
}

export function switchCodeFromStatus(status?: StatusItem[]): string | null {
  for (const code of SWITCH_CODES) {
    if (typeof statusValue(status, code) === "boolean") return code;
  }
  return null;
}

// Ícone vem como caminho relativo ("smart/icon/...") — monta a URL pública da CDN.
function iconUrl(icon?: string): string | null {
  if (!icon) return null;
  if (/^https?:\/\//.test(icon)) return icon;
  return `https://images.tuyaus.com/${icon.replace(/^\//, "")}`;
}

// Tuya alterna entre timestamps em segundos e milissegundos conforme a API.
export function toMs(t?: number | null): number | null {
  if (!t) return null;
  return t < 1e12 ? t * 1000 : t;
}

export function toSummary(d: RawDevice): DeviceSummary {
  return {
    deviceId: d.id,
    name: d.name || "Sem nome",
    online: Boolean(d.online),
    category: d.category ?? "",
    productId: d.product_id ?? null,
    productName: d.product_name ?? null,
    model: d.model || null,
    icon: iconUrl(d.icon),
    isLock: isLockCategory(d.category),
    battery: batteryFromStatus(d.status),
    activeTime: toMs(d.active_time),
    updateTime: toMs(d.update_time),
  };
}

export function toDetail(d: RawDevice): DeviceDetail {
  // local_key é segredo do dispositivo (controle via LAN): nunca vai para o navegador.
  const status = d.status ?? [];
  const autoLockEnabled = statusValue(status, "automatic_lock");
  const autoLockSeconds = Number(statusValue(status, "auto_lock_time"));
  return {
    ...toSummary(d),
    ip: d.ip ?? null,
    timeZone: d.time_zone ?? null,
    uuid: d.uuid ?? null,
    sub: Boolean(d.sub),
    status,
    switchCode: switchCodeFromStatus(status),
    autoLock: {
      enabled: typeof autoLockEnabled === "boolean" ? autoLockEnabled : null,
      seconds: Number.isFinite(autoLockSeconds) ? autoLockSeconds : null,
    },
  };
}
