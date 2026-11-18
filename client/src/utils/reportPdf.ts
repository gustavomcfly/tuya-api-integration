import type { Report } from "../types/api";
import { fmtDuration } from "./format";

interface CyclicPayload {
  totalCycles: number;
  completedCycles: number;
  totalFailures: number;
  delayBetweenCycles: number;
  maxConsecutiveFailures: number;
  batteryStart: number | null;
  batteryEnd: number | null;
  productName?: string | null;
  logs?: { type: string; level: string; message: string; timestamp: string }[];
}

interface QualityPayload {
  totalSteps: number;
  successCount: number;
  failCount: number;
  steps?: { name: string; status: string; errorMsg: string | null; logs: string[] }[];
}

// Exporta o relatório em PDF (mesmo layout do projeto original). jsPDF é carregado
// sob demanda para não pesar no bundle inicial.
export async function exportReportPdf(report: Report) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  let y = 20;

  const ensureSpace = (limit = 270) => {
    if (y > limit) {
      doc.addPage();
      y = 20;
    }
  };
  const line = (text: string, size = 10, style = "normal", color: [number, number, number] = [30, 30, 30]) => {
    ensureSpace();
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    doc.text(text, margin, y);
    y += size * 0.45 + 3;
  };
  const hLine = () => {
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, 210 - margin, y);
    y += 4;
  };
  const kv = (key: string, val: unknown) => {
    ensureSpace();
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text(`${key}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(String(val ?? "—"), margin + 42, y);
    y += 6;
  };
  const wrapped = (text: string, x: number, size: number, color: [number, number, number], style = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const part of doc.splitTextToSize(text, 210 - margin - x) as string[]) {
      ensureSpace();
      doc.text(part, x, y);
      y += size * 0.5;
    }
  };

  doc.setFillColor(214, 31, 103);
  doc.rect(0, 0, 210, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("PADO TESTLOCK (TUYA) — RELATÓRIO DE TESTE", margin, 8);
  doc.text(new Date().toLocaleString("pt-BR"), 210 - margin, 8, { align: "right" });

  y = 22;
  line(report.title, 14, "bold");
  y += 1;
  line(
    `Tipo: ${report.type === "cyclic" ? "Ciclagem" : "Qualidade"}   ·   Status: ${report.status.toUpperCase()}`,
    9,
    "normal",
    [80, 80, 80],
  );
  y += 2;
  hLine();

  line("Informações Gerais", 11, "bold");
  y += 1;
  kv("Dispositivo", report.deviceName);
  kv("ID do dispositivo", report.deviceId);
  kv("Testador", report.testerName || "—");
  kv("Início", new Date(report.startedAt).toLocaleString("pt-BR"));
  kv("Conclusão", report.completedAt ? new Date(report.completedAt).toLocaleString("pt-BR") : "—");
  if (report.completedAt) {
    kv("Duração", fmtDuration(new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()));
  }
  y += 2;
  hLine();

  if (report.type === "cyclic") {
    const p = report.payload as unknown as CyclicPayload;
    line("Resultado da Ciclagem", 11, "bold");
    y += 1;
    if (p.productName) kv("Produto", p.productName);
    kv("Ciclos realizados", `${p.completedCycles?.toFixed(1) ?? 0} / ${p.totalCycles}`);
    kv("Progresso", `${p.totalCycles > 0 ? ((p.completedCycles / p.totalCycles) * 100).toFixed(1) : 0}%`);
    kv("Total de falhas", p.totalFailures ?? 0);
    kv("Intervalo entre comandos", `${p.delayBetweenCycles}s`);
    kv("Falhas máx. consecutivas", p.maxConsecutiveFailures);
    kv("Bateria inicial", p.batteryStart != null ? `${p.batteryStart}%` : "—");
    kv("Bateria final", p.batteryEnd != null ? `${p.batteryEnd}%` : "—");
    y += 2;
    hLine();

    const logs = p.logs ?? [];
    if (logs.length > 0) {
      line(`Log de Eventos (${logs.length})`, 11, "bold");
      y += 1;
      for (const l of logs) {
        wrapped(
          `${new Date(l.timestamp).toLocaleTimeString("pt-BR")}  [${l.type}]  ${l.message}`,
          margin,
          8,
          l.level === "error" ? [190, 40, 40] : [100, 100, 100],
        );
        y += 1;
      }
    }
  } else {
    const p = report.payload as unknown as QualityPayload;
    line("Resultado da Auditoria de Qualidade", 11, "bold");
    y += 1;
    kv("Etapas totais", p.totalSteps);
    kv("Aprovadas", p.successCount);
    kv("Reprovadas", p.failCount);
    y += 2;
    hLine();

    line("Detalhes por Etapa", 11, "bold");
    y += 2;
    for (const s of p.steps ?? []) {
      ensureSpace(265);
      const ok = s.status === "sucesso";
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...((ok ? [22, 163, 74] : [220, 38, 38]) as [number, number, number]));
      doc.text(ok ? "[OK]" : "[FALHA]", margin, y);
      doc.setTextColor(30, 30, 30);
      doc.text(s.name, margin + 16, y);
      y += 5;
      if (s.errorMsg) wrapped(`Erro: ${s.errorMsg}`, margin + 16, 8, [180, 50, 50], "italic");
      for (const log of s.logs ?? []) wrapped(`- ${log}`, margin + 18, 7.5, [110, 110, 110]);
      y += 2;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`Pado TestLock · Página ${i} de ${pages}`, 105, 290, { align: "center" });
  }

  doc.save(`relatorio_${report.title.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}.pdf`);
}
