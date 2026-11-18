import { tuyaConfig, tuyaRequest, tuyaRequestFirst } from "../tuya/client.js";
import {
  isLockCategory,
  toDetail,
  toMs,
  toSummary,
  type DeviceDetail,
  type DeviceSummary,
  type RawDevice,
  type StatusItem,
} from "../tuya/deviceModel.js";
import { TuyaError } from "../utils/tuyaErrors.js";

export interface DpFunction {
  code: string;
  name: string | null;
  type: string; // Boolean | Integer | Enum | String | Json | Raw
  values: Record<string, unknown>;
  writable: boolean;
}

interface RawSpec {
  category?: string;
  functions?: { code: string; name?: string; type: string; values?: string }[];
  status?: { code: string; name?: string; type: string; values?: string }[];
}

function parseValues(v?: string): Record<string, unknown> {
  if (!v) return {};
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Cache curto de categoria: o motor de ciclagem precisa dela a cada comando.
const categoryCache = new Map<string, { category: string; switchCode: string | null; at: number }>();
const CATEGORY_TTL_MS = 10 * 60 * 1000;

export const deviceService = {
  // Lista os dispositivos vinculados ao projeto cloud (contas do app Smart Life/Tuya
  // vinculadas em Cloud > Devices > Link App Account).
  async listDevices(): Promise<DeviceSummary[]> {
    const all: RawDevice[] = [];
    try {
      let lastRowKey: string | undefined;
      for (let page = 0; page < 40; page++) {
        const r = await tuyaRequest<{
          devices: RawDevice[];
          has_more: boolean;
          last_row_key?: string;
        }>({
          method: "GET",
          path: "/v1.0/iot-01/associated-users/devices",
          query: { size: 50, last_row_key: lastRowKey },
        });
        all.push(...(r.devices ?? []));
        if (!r.has_more || !r.last_row_key) break;
        lastRowKey = r.last_row_key;
      }
    } catch (err) {
      // Projetos sem a API de "usuários associados": usa o UID da conta do app, se informado.
      const { appUid } = tuyaConfig();
      if (!appUid || !(err instanceof TuyaError)) throw err;
      const r = await tuyaRequest<RawDevice[]>({ method: "GET", path: `/v1.0/users/${appUid}/devices` });
      all.push(...(r ?? []));
    }
    for (const d of all) {
      categoryCache.set(d.id, { category: d.category ?? "", switchCode: null, at: Date.now() });
    }
    return all.map(toSummary);
  },

  async getRaw(deviceId: string): Promise<RawDevice> {
    return tuyaRequest<RawDevice>({ method: "GET", path: `/v1.0/devices/${deviceId}` });
  },

  async getDetail(deviceId: string): Promise<DeviceDetail> {
    const raw = await this.getRaw(deviceId);
    const detail = toDetail(raw);
    categoryCache.set(deviceId, { category: detail.category, switchCode: detail.switchCode, at: Date.now() });
    return detail;
  },

  async getKind(deviceId: string): Promise<{ category: string; switchCode: string | null }> {
    const hit = categoryCache.get(deviceId);
    // Fechadura só precisa da categoria; não-fechadura precisa também do DP de switch.
    if (hit && Date.now() - hit.at < CATEGORY_TTL_MS && (isLockCategory(hit.category) || hit.switchCode)) {
      return hit;
    }
    const d = await this.getDetail(deviceId);
    return { category: d.category, switchCode: d.switchCode };
  },

  async getStatus(deviceId: string): Promise<StatusItem[]> {
    return tuyaRequestFirst<StatusItem[]>([
      { method: "GET", path: `/v1.0/devices/${deviceId}/status` },
      { method: "GET", path: `/v1.0/iot-03/devices/${deviceId}/status` },
    ]);
  },

  // Funções (DPs graváveis) + status (DPs reportados), com os "values" já em objeto.
  async getSpecifications(deviceId: string): Promise<{ category: string; functions: DpFunction[]; status: DpFunction[] }> {
    const spec = await tuyaRequestFirst<RawSpec>([
      { method: "GET", path: `/v1.0/devices/${deviceId}/specifications` },
      { method: "GET", path: `/v1.0/iot-03/devices/${deviceId}/specification` },
      { method: "GET", path: `/v1.1/devices/${deviceId}/specifications` },
    ]);
    const map = (list: RawSpec["functions"], writable: boolean): DpFunction[] =>
      (list ?? []).map((f) => ({
        code: f.code,
        name: f.name ?? null,
        type: f.type,
        values: parseValues(f.values),
        writable,
      }));
    return {
      category: spec.category ?? "",
      functions: map(spec.functions, true),
      status: map(spec.status, false),
    };
  },

  async sendCommands(deviceId: string, commands: { code: string; value: unknown }[]): Promise<boolean> {
    return tuyaRequestFirst<boolean>([
      { method: "POST", path: `/v1.0/devices/${deviceId}/commands`, body: { commands } },
      { method: "POST", path: `/v1.0/iot-03/devices/${deviceId}/commands`, body: { commands } },
    ]);
  },

  async rename(deviceId: string, name: string): Promise<boolean> {
    await tuyaRequestFirst([
      { method: "PUT", path: `/v2.0/cloud/thing/${deviceId}/attribute`, body: { type: 1, data: name } },
      { method: "PUT", path: `/v1.0/devices/${deviceId}`, body: { name } },
    ]);
    return true;
  },

  async remove(deviceId: string): Promise<boolean> {
    await tuyaRequestFirst([
      { method: "DELETE", path: `/v1.0/devices/${deviceId}` },
      { method: "DELETE", path: `/v1.0/iot-03/devices/${deviceId}` },
    ]);
    categoryCache.delete(deviceId);
    return true;
  },

  // Informação de firmware. O formato varia entre versões da API, então normaliza
  // de forma tolerante: [{ module, currentVersion, latestVersion, upgradeStatus }].
  async getFirmware(deviceId: string) {
    const raw = await tuyaRequestFirst<unknown>([
      { method: "GET", path: `/v2.0/cloud/thing/${deviceId}/firmware` },
      { method: "GET", path: `/v1.0/devices/${deviceId}/firmware` },
      { method: "GET", path: `/v1.0/iot-03/devices/${deviceId}/firmware` },
    ]);
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];
    const modules = list.map((f) => {
      const current = (f.current_version ?? f.currentVersion ?? f.version ?? null) as string | null;
      const latest = (f.version ?? f.new_version ?? f.upgrade_version ?? null) as string | null;
      const status = (f.upgrade_status ?? f.upgradeStatus ?? null) as number | null;
      return {
        module: String(f.type_desc ?? f.firmware_type ?? f.type ?? "main"),
        currentVersion: current,
        latestVersion: latest,
        upgradeStatus: status,
        upgradeText: (f.upgrade_text ?? f.desc ?? null) as string | null,
      };
    });
    const needUpgrade = modules.some(
      (m) => (m.latestVersion && m.currentVersion && m.latestVersion !== m.currentVersion) || m.upgradeStatus === 1,
    );
    return { modules, needUpgrade };
  },

  // Eventos do dispositivo (type: 1 online, 2 offline, 5 comando, 7 DP reportado...).
  async getLogs(deviceId: string, opts: { types?: string; startTime?: number; endTime?: number; size?: number; rowKey?: string } = {}) {
    const endTime = opts.endTime ?? Date.now();
    const startTime = opts.startTime ?? endTime - 7 * 24 * 3600 * 1000;
    const r = await tuyaRequest<{
      logs?: { code?: string; value?: unknown; event_time?: number; event_from?: string; event_id?: number }[];
      has_next?: boolean;
      next_row_key?: string;
    }>({
      method: "GET",
      path: `/v1.0/devices/${deviceId}/logs`,
      query: {
        type: opts.types ?? "1,2,5,7",
        start_time: startTime,
        end_time: endTime,
        size: opts.size ?? 50,
        start_row_key: opts.rowKey,
      },
    });
    const EVENT: Record<number, string> = {
      1: "online",
      2: "offline",
      3: "ativação",
      4: "reset",
      5: "comando",
      6: "firmware",
      7: "status",
      8: "sinal",
      9: "reinício",
      10: "timer",
    };
    return {
      list: (r.logs ?? []).map((l) => ({
        time: toMs(l.event_time) ?? 0,
        event: EVENT[l.event_id ?? 0] ?? String(l.event_id ?? ""),
        code: l.code ?? null,
        value: l.value ?? null,
        source: l.event_from ?? null,
      })),
      hasMore: Boolean(r.has_next),
      nextRowKey: r.next_row_key ?? null,
    };
  },
};
