import fd500 from "../assets/fd-500.png";
import fde250 from "../assets/fde-250.png";
import fde300w from "../assets/fde-300w.png";
import fde600w from "../assets/fde-600w.png";
import fde800 from "../assets/fde-800.png";
import fdv201 from "../assets/fdv-201.png";
import type { DeviceSummary } from "../types/api";

export const fmtDateTime = (v: number | string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR") : "—";

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${s % 60}s` : `${s}s`;
};

const CATEGORY_LABELS: Record<string, string> = {
  ms: "Fechadura residencial",
  jtmspro: "Fechadura Wi-Fi",
  jtmsbh: "Fechadura BLE/Wi-Fi",
  videolock: "Fechadura com câmera",
  gyms: "Fechadura comercial",
  hotelms: "Fechadura de hotel",
  mk: "Controle de acesso",
  cz: "Tomada",
  pc: "Filtro de linha",
  kg: "Interruptor",
  dj: "Lâmpada",
};

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? (c ? `Categoria ${c}` : "Dispositivo");

// Imagens dos modelos Pado: casa pelo nome do produto/dispositivo; se não houver
// correspondência, usa o ícone da própria Tuya.
const MODELS: { match: RegExp; model: string; img: string }[] = [
  { match: /FDV[-\s]?201/i, model: "FDV-201", img: fdv201 },
  { match: /FDE[-\s]?250/i, model: "FDE-250", img: fde250 },
  { match: /FDE[-\s]?300/i, model: "FDE-300W", img: fde300w },
  { match: /FDE[-\s]?600/i, model: "FDE-600W", img: fde600w },
  { match: /FDE[-\s]?800/i, model: "FDE-800 Vision", img: fde800 },
  { match: /FD[-\s]?500/i, model: "FD-500", img: fd500 },
];

export function deviceVisual(d: Pick<DeviceSummary, "name" | "productName" | "icon" | "isLock" | "category">) {
  const haystack = `${d.productName ?? ""} ${d.name}`;
  const hit = MODELS.find((m) => m.match.test(haystack));
  if (hit) return { model: hit.model, img: hit.img };
  return {
    model: d.productName || categoryLabel(d.category),
    img: d.icon || (d.isLock ? fde250 : null),
  };
}

export function dpValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "ligado" : "desligado";
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
