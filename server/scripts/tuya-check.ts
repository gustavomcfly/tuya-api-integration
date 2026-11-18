// Diagnóstico rápido da integração: `npm run tuya:check` (dentro de server/).
// Pede um token, lista os dispositivos e mostra o status do primeiro (ou do ID informado).
//   npm run tuya:check
//   npm run tuya:check -- <deviceId>
import "dotenv/config";
import { getToken, tuyaConfig } from "../tuya/client.js";
import { deviceService } from "../services/device.service.js";

const cfg = tuyaConfig();
console.log(`Data center: ${cfg.region} -> ${cfg.baseUrl}`);
if (!cfg.configured) {
  console.error("✖ TUYA_ACCESS_ID / TUYA_ACCESS_SECRET não configurados em server/.env");
  process.exit(1);
}

try {
  const token = await getToken();
  console.log(`✔ Token obtido (uid ${token.uid}, expira ${new Date(token.expiresAt).toLocaleTimeString()})`);

  const devices = await deviceService.listDevices();
  console.log(`✔ ${devices.length} dispositivo(s) vinculado(s):`);
  for (const d of devices) {
    console.log(
      `   - ${d.deviceId}  ${d.online ? "online " : "offline"}  [${d.category}]${d.isLock ? " (fechadura)" : ""}  ${d.name}`,
    );
  }

  const targetId = process.argv[2] ?? devices[0]?.deviceId;
  if (targetId) {
    const detail = await deviceService.getDetail(targetId);
    console.log(`\nStatus de ${detail.name}:`);
    for (const s of detail.status) console.log(`   ${s.code} = ${JSON.stringify(s.value)}`);
  }
} catch (err) {
  const e = err as { code?: number; message?: string; original?: string };
  console.error(`✖ Falha: [${e.code ?? "?"}] ${e.message}${e.original ? ` (Tuya: ${e.original})` : ""}`);
  process.exit(1);
}
