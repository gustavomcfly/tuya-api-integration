import { tuyaRequestFirst } from "../tuya/client.js";
import { toMs } from "../tuya/deviceModel.js";

// Histórico de aberturas (open-logs). A Tuya não permite apagar o histórico pela nuvem
// (não há equivalente ao lockRecord/clear da TTLock).

const UNLOCK_LABELS: Record<string, string> = {
  unlock_fingerprint: "Biometria",
  unlock_password: "Senha",
  unlock_temporary: "Senha temporária",
  unlock_dynamic: "Senha dinâmica",
  unlock_offline_pd: "Senha offline",
  unlock_card: "Cartão",
  unlock_face: "Facial",
  unlock_key: "Chave mecânica",
  unlock_identity_card: "Documento",
  unlock_emergency: "Emergência",
  unlock_app: "Aplicativo",
  unlock_remote: "Remota",
  unlock_ble: "Bluetooth",
  unlock_phone_remote: "Remota (app)",
  unlock_voice_remote: "Comando de voz",
  remote_no_dp_key: "Remota (nuvem)",
};

export interface UnlockRecord {
  time: number;
  method: string;
  code: string;
  value: unknown;
  user: string | null;
}

export const recordService = {
  async getRecords(deviceId: string, pageNo = 1, pageSize = 50, days = 30) {
    const end = Date.now();
    const start = end - days * 24 * 3600 * 1000;
    const r = await tuyaRequestFirst<{ logs?: Record<string, unknown>[]; total?: number }>([
      {
        method: "GET",
        path: `/v1.1/devices/${deviceId}/door-lock/open-logs`,
        query: { page_no: pageNo, page_size: pageSize, start_time: start, end_time: end },
      },
      {
        method: "GET",
        path: `/v1.0/devices/${deviceId}/door-lock/open-logs`,
        query: {
          page_no: pageNo,
          page_size: pageSize,
          start_time: Math.floor(start / 1000),
          end_time: Math.floor(end / 1000),
        },
      },
    ]);
    const list: UnlockRecord[] = (r.logs ?? []).map((l) => {
      const status = (l.status ?? {}) as { code?: string; value?: unknown };
      const code = status.code ?? String(l.code ?? "");
      return {
        time: toMs(Number(l.update_time ?? l.gmt_create ?? 0)) ?? 0,
        method: UNLOCK_LABELS[code] ?? code ?? "Desconhecido",
        code,
        value: status.value ?? null,
        user: (l.nick_name ?? l.unlock_name ?? l.user_name ?? null) as string | null,
      };
    });
    return { list, total: r.total ?? list.length };
  },
};
