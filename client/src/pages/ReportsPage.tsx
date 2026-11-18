import { useCallback, useEffect, useState } from "react";
import { reportApi } from "../api";
import { errorText } from "../api/http";
import { toast } from "../utils/toast";
import { fmtDateTime, fmtDuration } from "../utils/format";
import { exportReportPdf } from "../utils/reportPdf";
import { BackButton, Badge, Button, ConfirmDialog, Empty, Kv, Loading, PageHeader, Panel, Select, type Tone } from "../components/ui";
import type { Report } from "../types/api";

const STATUS_TONE: Record<string, Tone> = {
  completed: "success",
  aprovado: "success",
  failed: "danger",
  reprovado: "danger",
  stopped: "neutral",
};
const STATUS_LABEL: Record<string, string> = {
  completed: "Concluído",
  failed: "Falhou",
  stopped: "Interrompido",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

export function ReportsPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Report | null>(null);
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setReports(await reportApi.list());
    } catch (err) {
      toast.error(errorText(err));
      setReports([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    const r = toDelete;
    setToDelete(null);
    if (!r) return;
    try {
      await reportApi.remove(r.id);
      setReports((list) => list?.filter((x) => x.id !== r.id) ?? null);
      if (open?.id === r.id) setOpen(null);
      toast.success("Relatório excluído.");
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function exportPdf(r: Report) {
    setExporting(true);
    try {
      await exportReportPdf(r);
      toast.success("PDF exportado com sucesso!");
    } catch (err) {
      toast.error(`Falha ao gerar PDF: ${errorText(err)}`);
    } finally {
      setExporting(false);
    }
  }

  const dialog = (
    <ConfirmDialog
      open={toDelete !== null}
      danger
      title="Excluir relatório?"
      message={`"${toDelete?.title}" será excluído permanentemente.`}
      confirmLabel="Excluir"
      onConfirm={remove}
      onCancel={() => setToDelete(null)}
    />
  );

  if (open) {
    return (
      <div className="w-full">
        <BackButton onClick={() => setOpen(null)}>Voltar para os relatórios</BackButton>
        <PageHeader
          icon="file"
          title={open.title}
          subtitle={`Salvo em ${fmtDateTime(open.createdAt)}`}
          actions={
            <>
              <Button variant="primary" icon="file" loading={exporting} onClick={() => exportPdf(open)}>
                Exportar PDF
              </Button>
              <Button variant="danger" icon="trash" onClick={() => setToDelete(open)}>
                Excluir
              </Button>
            </>
          }
        />
        <ReportDetail report={open} />
        {dialog}
      </div>
    );
  }

  const filtered = (reports ?? []).filter((r) => (!type || r.type === type) && (!status || r.status === status));

  return (
    <div className="w-full">
      <PageHeader
        icon="file"
        title="Relatórios de Testes"
        subtitle={
          <>
            <span className="text-primary font-bold">{reports?.length ?? 0}</span> relatório(s) salvo(s)
          </>
        }
      />
      <Panel
        icon="list"
        title="Relatórios salvos"
        actions={
          <>
            <Select className="w-auto py-1.5" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="cyclic">Ciclagem</option>
              <option value="quality">Qualidade</option>
            </Select>
            <Select className="w-auto py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </>
        }
      >
        {!reports ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty
            icon="file"
            title={reports.length === 0 ? "Nenhum relatório salvo" : "Nenhum relatório com esses filtros"}
            text="Salve relatórios ao final dos testes de ciclagem ou das auditorias de qualidade."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpen(r)}
                className="bg-card border-border hover:border-primary/50 flex cursor-pointer flex-col gap-3 rounded-xl border p-4 text-left shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={r.type === "cyclic" ? "info" : "primary"}>{r.type === "cyclic" ? "Ciclagem" : "Qualidade"}</Badge>
                  <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
                <p className="line-clamp-2 font-semibold">{r.title}</p>
                <p className="text-muted-foreground text-xs">
                  {r.testerName ? `${r.testerName} · ` : ""}
                  {fmtDateTime(r.createdAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </Panel>
      {dialog}
    </div>
  );
}

function ReportDetail({ report }: { report: Report }) {
  const p = report.payload as Record<string, unknown>;
  const duration = report.completedAt ? fmtDuration(new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()) : "—";

  return (
    <div className="flex flex-col gap-6">
      <Panel icon="list" title="Informações gerais">
        <div className="grid grid-cols-2 gap-4 p-5 text-sm md:grid-cols-4">
          <Kv label="Dispositivo">{report.deviceName}</Kv>
          <Kv label="ID">{report.deviceId}</Kv>
          <Kv label="Testador">{report.testerName || "—"}</Kv>
          <Kv label="Status">{STATUS_LABEL[report.status] ?? report.status}</Kv>
          <Kv label="Início">{fmtDateTime(report.startedAt)}</Kv>
          <Kv label="Conclusão">{fmtDateTime(report.completedAt)}</Kv>
          <Kv label="Duração">{duration}</Kv>
        </div>
      </Panel>

      {report.type === "cyclic" ? (
        <>
          <Panel icon="cycle" title="Resultado da ciclagem">
            <div className="grid grid-cols-2 gap-4 p-5 text-sm md:grid-cols-4">
              <Kv label="Ciclos">{`${Number(p.completedCycles ?? 0).toFixed(1)} / ${p.totalCycles}`}</Kv>
              <Kv label="Falhas">{String(p.totalFailures ?? 0)}</Kv>
              <Kv label="Intervalo">{`${p.delayBetweenCycles}s`}</Kv>
              <Kv label="Limite de falhas">{String(p.maxConsecutiveFailures)}</Kv>
              <Kv label="Bateria inicial">{p.batteryStart != null ? `${p.batteryStart}%` : "—"}</Kv>
              <Kv label="Bateria final">{p.batteryEnd != null ? `${p.batteryEnd}%` : "—"}</Kv>
            </div>
          </Panel>
          <Panel icon="list" title="Log de eventos">
            <div className="ui-log ui-mono ui-scroll m-5 max-h-[28rem] overflow-y-auto">
              {((p.logs as { type: string; level: string; message: string; timestamp: string }[]) ?? []).map((l, i) => (
                <div key={i} className={`ui-log-line ${l.level === "error" ? "text-red-400" : ""}`}>
                  [{new Date(l.timestamp).toLocaleTimeString("pt-BR")}] {l.type} · {l.message}
                </div>
              ))}
            </div>
          </Panel>
        </>
      ) : (
        <Panel icon="checkCircle" title="Etapas">
          <div className="divide-border divide-y">
            {((p.steps as { id: string; name: string; status: string; errorMsg: string | null; logs: string[] }[]) ?? []).map((s) => (
              <div key={s.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <Badge tone={s.status === "sucesso" ? "success" : "danger"} dot>
                    {s.status === "sucesso" ? "Aprovada" : "Falhou"}
                  </Badge>
                </div>
                {s.errorMsg && <div className="ui-chip-tone ui-tone-danger rounded-lg px-2.5 py-1.5 text-xs">{s.errorMsg}</div>}
                {s.logs?.length > 0 && (
                  <div className="ui-log ui-mono">
                    {s.logs.map((l, i) => (
                      <div key={i} className="ui-log-line">
                        {l}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
