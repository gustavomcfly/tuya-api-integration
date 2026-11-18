import { tuyaConfig, tuyaRequestFirst } from "../tuya/client.js";
import { decryptTicketKey, encryptPassword } from "../tuya/crypto.js";
import { batteryFromStatus, isLockCategory } from "../tuya/deviceModel.js";
import { TuyaError } from "../utils/tuyaErrors.js";
import { deviceService } from "./device.service.js";

export interface Ticket {
  ticketId: string;
  key: Buffer; // chave AES-128 já decifrada
}

export const lockService = {
  // Chave temporária usada para abrir sem senha e para cifrar senhas.
  async getTicket(deviceId: string): Promise<Ticket> {
    const r = await tuyaRequestFirst<{ ticket_id: string; ticket_key: string }>([
      { method: "POST", path: `/v1.0/smart-lock/devices/${deviceId}/password-ticket` },
      { method: "POST", path: `/v1.0/devices/${deviceId}/door-lock/password-ticket` },
    ]);
    return {
      ticketId: r.ticket_id,
      key: decryptTicketKey(r.ticket_key, tuyaConfig().accessSecret),
    };
  },

  async encryptForDevice(deviceId: string, password: string) {
    const ticket = await this.getTicket(deviceId);
    return { ticketId: ticket.ticketId, encrypted: encryptPassword(password, ticket.key) };
  },

  // Abre (open=true) ou tranca (open=false) remotamente.
  //  - Fechadura: API de fechadura sem senha (precisa do DP remote_no_dp_key habilitado).
  //  - Outros dispositivos: liga/desliga o DP de switch (útil para validar a ciclagem
  //    com uma tomada/relé quando não há fechadura disponível).
  async operate(deviceId: string, open: boolean): Promise<{ method: string }> {
    const kind = await deviceService.getKind(deviceId);

    if (isLockCategory(kind.category)) {
      const ticket = await this.getTicket(deviceId);
      try {
        await tuyaRequestFirst([
          {
            method: "POST",
            path: `/v1.0/smart-lock/devices/${deviceId}/password-free/door-operate`,
            body: { ticket_id: ticket.ticketId, open },
          },
        ]);
        return { method: "door-operate" };
      } catch (err) {
        // Fechaduras que só suportam abertura sem senha pela rota antiga.
        if (!open || !(err instanceof TuyaError)) throw err;
        const t2 = await this.getTicket(deviceId);
        await tuyaRequestFirst([
          {
            method: "POST",
            path: `/v1.0/devices/${deviceId}/door-lock/password-free/open-door`,
            body: { ticket_id: t2.ticketId },
          },
        ]);
        return { method: "open-door" };
      }
    }

    if (kind.switchCode) {
      await deviceService.sendCommands(deviceId, [{ code: kind.switchCode, value: open }]);
      return { method: `switch:${kind.switchCode}` };
    }

    throw new TuyaError(2009, "Dispositivo sem fechadura nem DP de switch");
  },

  unlock(deviceId: string) {
    return this.operate(deviceId, true);
  },

  lock(deviceId: string) {
    return this.operate(deviceId, false);
  },

  async getBattery(deviceId: string): Promise<number | null> {
    const status = await deviceService.getStatus(deviceId);
    return batteryFromStatus(status);
  },

  // Fechamento automático (DPs padrão das fechaduras Wi-Fi: automatic_lock + auto_lock_time).
  // seconds > 0 ativa com o tempo informado; <= 0 desativa.
  async setAutoLock(deviceId: string, seconds: number) {
    const commands: { code: string; value: unknown }[] = [
      { code: "automatic_lock", value: seconds > 0 },
    ];
    if (seconds > 0) commands.push({ code: "auto_lock_time", value: seconds });
    return deviceService.sendCommands(deviceId, commands);
  },

  // Formas de abertura remota configuradas (com/sem senha).
  async getRemoteUnlockConfig(deviceId: string) {
    return tuyaRequestFirst<unknown>([
      { method: "GET", path: `/v1.0/devices/${deviceId}/door-lock/remote-unlocks` },
    ]);
  },

  async setRemoteUnlockWithoutPassword(deviceId: string, enabled: boolean) {
    return tuyaRequestFirst<boolean>([
      {
        method: "POST",
        path: `/v1.0/devices/${deviceId}/door-lock/remote-unlock/config`,
        body: { remote_unlock_type: "remoteUnlockWithoutPwd", open: enabled },
      },
    ]);
  },
};
