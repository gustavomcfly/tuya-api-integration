import { tuyaRequest, tuyaRequestFirst } from "../tuya/client.js";
import { toMs } from "../tuya/deviceModel.js";
import { lockService } from "./lock.service.js";

// Senhas temporárias da Tuya.
//  - "online" (temp-password): senha escolhida pelo usuário, cifrada com o ticket e
//    enviada à fechadura pela nuvem. Wi-Fi: 7 dígitos; Zigbee/BLE: 6 dígitos.
//  - "offline": senha gerada por algoritmo (equivalente à senha aleatória da TTLock);
//    funciona mesmo com a fechadura sem conexão.
//  - "dinâmica": senha de uso imediato que muda a cada poucos minutos.

const sec = (ms: number) => Math.floor(ms / 1000);

// Fuso no formato da Tuya ("-03:00"). Pode ser fixado com TUYA_TIME_ZONE no .env.
function serverTimeZone(): string {
  if (process.env.TUYA_TIME_ZONE) return process.env.TUYA_TIME_ZONE;
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export interface ScheduleInput {
  weekDays: number[]; // 0 = domingo ... 6 = sábado
  startMinute: number; // minutos do dia
  endMinute: number;
}

// phase da Tuya (Wi-Fi): 0 excluída, 1 a enviar, 2 enviada, 3 a excluir.
// Zigbee: 1 a criar, 2 normal, 3 congelada, 4 excluída, 5 falha.
export interface PasscodeItem {
  id: string;
  name: string;
  effectiveTime: number | null;
  invalidTime: number | null;
  phase: number | null;
  deliveryStatus: number | string | null;
  raw: Record<string, unknown>;
}

function toItem(p: Record<string, unknown>): PasscodeItem {
  return {
    id: String(p.id ?? p.password_id ?? ""),
    name: String(p.name ?? p.Name ?? ""),
    effectiveTime: toMs(Number(p.effective_time) || null),
    invalidTime: toMs(Number(p.invalid_time ?? p.expired_time) || null),
    phase: p.phase === undefined ? null : Number(p.phase),
    deliveryStatus: (p.delivery_status ?? null) as number | string | null,
    raw: p,
  };
}

export const passcodeService = {
  async create(
    deviceId: string,
    opts: { passcode: string; name: string; startMs?: number; endMs?: number; schedule?: ScheduleInput; once?: boolean },
  ) {
    const { ticketId, encrypted } = await lockService.encryptForDevice(deviceId, opts.passcode);
    const start = opts.startMs ?? Date.now();
    const end = opts.endMs ?? start + 365 * 24 * 3600 * 1000;
    const body: Record<string, unknown> = {
      name: opts.name,
      password: encrypted,
      password_type: "ticket",
      ticket_id: ticketId,
      effective_time: sec(start),
      invalid_time: sec(end),
      type: opts.once ? 1 : 0,
    };
    if (opts.schedule) {
      body.time_zone = serverTimeZone();
      body.schedule_list = [
        {
          effective_time: opts.schedule.startMinute,
          invalid_time: opts.schedule.endMinute,
          working_day: opts.schedule.weekDays.reduce((acc, d) => acc | (1 << d), 0),
        },
      ];
    }
    const r = await tuyaRequest<{ id: number | string }>({
      method: "POST",
      path: `/v1.0/devices/${deviceId}/door-lock/temp-password`,
      body,
    });
    return { id: String(r.id) };
  },

  async list(deviceId: string, valid = true): Promise<PasscodeItem[]> {
    const r = await tuyaRequest<Record<string, unknown>[]>({
      method: "GET",
      path: `/v1.0/devices/${deviceId}/door-lock/temp-passwords`,
      query: { valid },
    });
    return (r ?? []).map(toItem);
  },

  async remove(deviceId: string, passwordId: string) {
    await tuyaRequest({
      method: "DELETE",
      path: `/v1.0/devices/${deviceId}/door-lock/temp-passwords/${passwordId}`,
    });
    return true;
  },

  async change(deviceId: string, passwordId: string, opts: { passcode: string; name: string; startMs?: number; endMs?: number }) {
    const { ticketId, encrypted } = await lockService.encryptForDevice(deviceId, opts.passcode);
    const start = opts.startMs ?? Date.now();
    const end = opts.endMs ?? start + 365 * 24 * 3600 * 1000;
    await tuyaRequest({
      method: "PUT",
      path: `/v1.0/devices/${deviceId}/door-lock/temp-passwords/${passwordId}/modify-password`,
      body: {
        name: opts.name,
        password: encrypted,
        password_type: "ticket",
        ticket_id: ticketId,
        effective_time: sec(start),
        invalid_time: sec(end),
      },
    });
    return true;
  },

  async createOffline(
    deviceId: string,
    opts: { name: string; type: "multiple" | "once" | "clear_all"; startMs?: number; endMs?: number },
  ) {
    const start = opts.startMs ?? Date.now();
    const end = opts.endMs ?? start + 24 * 3600 * 1000;
    const typeV10: Record<string, number> = { multiple: 0, once: 1, clear_all: 9 };
    const r = await tuyaRequestFirst<Record<string, unknown>>([
      {
        method: "POST",
        path: `/v1.1/devices/${deviceId}/door-lock/offline-temp-password`,
        body: { name: opts.name, type: opts.type, effective_time: sec(start), invalid_time: sec(end) },
      },
      {
        method: "POST",
        path: `/v1.0/devices/${deviceId}/door-lock/offline-temp-password`,
        body: { name: opts.name, type: typeV10[opts.type], effective_time: sec(start), invalid_time: sec(end), lang: "en" },
      },
    ]);
    return {
      id: r.offline_temp_password_id ? String(r.offline_temp_password_id) : null,
      passcode: String(r.offline_temp_password ?? ""),
      name: String(r.offline_temp_password_name ?? opts.name),
      effectiveTime: toMs(Number(r.effective_time) || sec(start)),
      invalidTime: toMs(Number(r.invalid_time) || sec(end)),
    };
  },

  async getDynamic(deviceId: string) {
    const r = await tuyaRequest<{ dynamic_password: string }>({
      method: "GET",
      path: `/v1.0/devices/${deviceId}/door-lock/dynamic-password`,
    });
    return { passcode: r.dynamic_password };
  },
};
