import { tuyaRequest, tuyaRequestFirst } from "../tuya/client.js";

// Cartões e biometrias na Tuya.
// Diferente da TTLock (que aceita "empurrar" um número de cartão pelo gateway), a Tuya
// cadastra credenciais fisicamente: a nuvem coloca a fechadura em modo de cadastro e a
// pessoa encosta o cartão / o dedo no equipamento. Depois a credencial aparece nas listas.

export type UnlockType = "card" | "fingerprint" | "password" | "face";

export interface LockUser {
  userId: string;
  name: string;
  userType: number;
  raw: Record<string, unknown>;
}

export interface UnlockKey {
  unlockNo: string;
  unlockType: string;
  name: string | null;
  userId: string | null;
  userType: number | null;
}

function toUser(u: Record<string, unknown>): LockUser {
  return {
    userId: String(u.user_id ?? u.id ?? ""),
    name: String(u.nick_name ?? u.user_name ?? u.name ?? "Usuário"),
    userType: Number(u.user_type ?? 2) || 2,
    raw: u,
  };
}

export const credentialService = {
  async listUsers(deviceId: string): Promise<LockUser[]> {
    const r = await tuyaRequestFirst<unknown>([
      { method: "GET", path: `/v1.0/smart-lock/devices/${deviceId}/users`, query: { page_no: 1, page_size: 100 } },
      { method: "GET", path: `/v1.0/devices/${deviceId}/users` },
    ]);
    const obj = r as { records?: unknown[]; list?: unknown[] } | unknown[];
    const list = (Array.isArray(obj) ? obj : (obj.records ?? obj.list ?? [])) as Record<string, unknown>[];
    return list.map(toUser);
  },

  async createUser(deviceId: string, name: string) {
    const r = await tuyaRequest<unknown>({
      method: "POST",
      path: `/v1.0/devices/${deviceId}/user`,
      body: { nick_name: name, sex: 1 },
    });
    const id = typeof r === "object" && r ? ((r as Record<string, unknown>).user_id ?? (r as Record<string, unknown>).id) : r;
    return { userId: String(id ?? "") };
  },

  async listKeys(deviceId: string, unlockType?: UnlockType): Promise<UnlockKey[]> {
    const users = await this.listUsers(deviceId).catch(() => [] as LockUser[]);
    const keys: UnlockKey[] = [];

    for (const u of users) {
      try {
        const r = await tuyaRequest<{ unlock_keys?: Record<string, unknown>[] }>({
          method: "GET",
          path: `/v1.0/devices/${deviceId}/door-lock/user-types/${u.userType}/users/${u.userId}/assigned-keys`,
          query: { unlock_type: unlockType },
        });
        for (const k of r.unlock_keys ?? []) {
          keys.push({
            unlockNo: String(k.unlock_no ?? k.unlock_sn ?? ""),
            unlockType: String(k.unlock_type ?? unlockType ?? ""),
            name: (k.unlock_name as string) ?? null,
            userId: u.userId,
            userType: u.userType,
          });
        }
      } catch {
        // usuário sem credenciais ou API indisponível para este modelo
      }
    }

    try {
      const r = await tuyaRequest<{ unlock_keys?: Record<string, unknown>[] }>({
        method: "GET",
        path: `/v1.0/devices/${deviceId}/door-lock/unassigned-keys`,
        query: { unlock_type: unlockType },
      });
      for (const k of r.unlock_keys ?? []) {
        keys.push({
          unlockNo: String(k.unlock_no ?? k.unlock_sn ?? ""),
          unlockType: String(k.unlock_type ?? unlockType ?? ""),
          name: (k.unlock_name as string) ?? null,
          userId: null,
          userType: null,
        });
      }
    } catch {
      // idem
    }
    return keys;
  },

  // Coloca a fechadura em modo de cadastro. A pessoa precisa encostar o cartão/dedo
  // na fechadura em seguida (biometria costuma pedir várias leituras).
  async startEnrollment(deviceId: string, opts: { userId: string; userType?: number; unlockType: UnlockType }) {
    await tuyaRequest({
      method: "PUT",
      path: `/v1.0/devices/${deviceId}/door-lock/actions/entry`,
      body: { user_id: opts.userId, user_type: opts.userType ?? 2, unlock_type: opts.unlockType },
    });
    return true;
  },

  async cancelEnrollment(deviceId: string, unlockType: UnlockType) {
    await tuyaRequest({
      method: "PUT",
      path: `/v1.0/devices/${deviceId}/door-lock/unlock-types/${unlockType}/actions/cancel`,
    });
    return true;
  },

  async removeKey(deviceId: string, opts: { userId: string; userType: number; unlockType: string; unlockNo: string }) {
    await tuyaRequest({
      method: "DELETE",
      path: `/v1.0/devices/${deviceId}/door-lock/user-types/${opts.userType}/users/${opts.userId}/unlock-types/${opts.unlockType}/keys/${opts.unlockNo}`,
    });
    return true;
  },
};
