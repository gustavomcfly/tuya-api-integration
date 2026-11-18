import { useCallback, useEffect, useState } from "react";
import { deviceApi, qualityApi, reportApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { fmtDateTime } from "../utils/format";
import {
  BackButton,
  Badge,
  Button,
  Check,
  Chip,
  ConfirmDialog,
  Empty,
  Field,
  Loading,
  PageHeader,
  Panel,
  Progress,
  Select,
  Spinner,
  type Tone,
} from "../components/ui";
import { Icon } from "../components/ui/Icon";
import type { QualityAudit, QualityStep } from "../types/api";

// Etapas que só fazem sentido em fechaduras
const LOCK_ONLY = new Set(["temp_passcode", "offline_passcode", "dynamic_passcode", "get_records", "auto_lock"]);
const DEFAULT_ON = new Set(["get_info", "remote_unlock", "temp_passcode", "rename_device", "get_records", "check_update"]);

const isApproved = (a: QualityAudit) => a.steps.every((s) => s.status === "sucesso");

export function QualityTestPage() {
  const { devices, setDevices, device, settings } = useApp();
  const [steps, setSteps] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_ON));
  const [deviceId, setDeviceId] = useState(device?.deviceId ?? "");
  const [history, setHistory] = useState<QualityAudit[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await qualityApi.list());
    } catch (err) {
      toast.error(errorText(err));
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    qualityApi.steps().then(setSteps).catch((err) => toast.error(errorText(err)));
    void loadHistory();
    if (devices.length === 0) deviceApi.list().then(setDevices).catch(() => {});
  }, [loadHistory, devices.length, setDevices]);

  const target = devices.find((d) => d.deviceId === deviceId);
  const available = steps.filter((s) => !LOCK_ONLY.has(s.id) || !target || target.isLock);

  async function start() {
    if (!target) return toast.info("Selecione um dispositivo.");
    const criteria = available.filter((s) => selected.has(s.id)).map((s) => s.id);
    if (criteria.length === 0) return toast.info("Selecione ao menos uma etapa.");
    setStarting(true);
    try {
      const audit = await qualityApi.start(target.deviceId, criteria, {
        deviceName: target.name,
        testerName: settings.testerName || undefined,
        stdPasscode: settings.stdPasscode || undefined,
      });
      setOpenId(audit.testId);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setStarting(false);
    }
  }

  if (openId) {
    return (
      <QualityProgress
        testId={openId}
        onBack={() => {
          setOpenId(null);
          void loadHistory();
        }}
      />
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        icon="checkCircle"
        title="Auditoria de Qualidade"
        subtitle="Roteiro automático de verificação. Etapas que alteram o dispositivo restauram o estado original ao final."
      />

      <Panel
        icon="settings"
        title="Novo roteiro"
        footer={
          <div className="flex justify-end">
            <Button variant="primary" icon="play" loading={starting} onClick={start}>
              Iniciar auditoria
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 p-5">
          <Field label="Dispositivo">
            <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">Selecione...</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name} {d.isLock ? "🔒" : ""} {d.online ? "" : "(offline)"}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="ui-section-title">Etapas</h4>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(available.map((s) => s.id)))}>
                  Todas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Limpar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {available.map((s) => (
                <Check
                  key={s.id}
                  checked={selected.has(s.id)}
                  onChange={(on) =>
                    setSelected((cur) => {
                      const next = new Set(cur);
                      if (on) next.add(s.id);
                      else next.delete(s.id);
                      return next;
                    })
                  }
                >
                  {s.name}
                </Check>
              ))}
            </div>
            {selected.has("temp_passcode") && (
              <p className="ui-hint mt-3">
                Senha usada: {settings.stdPasscode || "1357924 (padrão)"} — altere em Configurações do Sistema.
              </p>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        icon="history"
        title="Auditorias anteriores"
        className="mt-6"
        actions={
          <Button size="sm" icon="refresh" onClick={loadHistory}>
            Atualizar
          </Button>
        }
      >
        {!history ? (
          <Loading />
        ) : history.length === 0 ? (
          <Empty icon="checkCircle" title="Nenhuma auditoria realizada" />
        ) : (
          <div className="divide-border divide-y">
            {history.map((a) => {
              const done = a.status === "concluido";
              const ok = a.steps.filter((s) => s.status === "sucesso").length;
              return (
                <button
                  key={a.testId}
                  type="button"
                  onClick={() => setOpenId(a.testId)}
                  className="hover:bg-muted/40 flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4 text-left transition-colors"
                >
                  <div>
                    <p className="font-semibold">{a.deviceName}</p>
                    <p className="text-muted-foreground text-xs">
                      {fmtDateTime(a.startTime)} · {ok}/{a.steps.length} etapas OK
                    </p>
                  </div>
                  {!done ? (
                    <Badge tone="primary" live>
                      Executando
                    </Badge>
                  ) : isApproved(a) ? (
                    <Badge tone="success" dot>
                      Aprovada
                    </Badge>
                  ) : (
                    <Badge tone="danger" dot>
                      Reprovada
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

const STATE: Record<QualityStep["status"], { tone: Tone; cls: string; label: string }> = {
  pendente: { tone: "neutral", cls: "is-pending", label: "Pendente" },
  executando: { tone: "primary", cls: "is-running", label: "Executando" },
  sucesso: { tone: "success", cls: "is-done", label: "Concluída" },
  falha: { tone: "danger", cls: "is-failed", label: "Falhou" },
};

function QualityProgress({ testId, onBack }: { testId: string; onBack: () => void }) {
  const { settings } = useApp();
  const [audit, setAudit] = useState<QualityAudit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const a = await qualityApi.status(testId);
      if (a) setAudit(a);
    } catch (err) {
      toast.error(errorText(err));
    }
  }, [testId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (audit?.status === "concluido") return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [audit?.status, refresh]);

  if (!audit) return <Loading text="Carregando auditoria..." />;

  const total = audit.steps.length;
  const count = (s: QualityStep["status"]) => audit.steps.filter((x) => x.status === s).length;
  const success = count("sucesso");
  const failed = count("falha");
  const done = success + failed;
  const finished = audit.status === "concluido";
  const approved = finished && failed === 0;
  const barTone: Tone = finished ? (failed === 0 ? "success" : "danger") : "primary";

  async function saveReport() {
    setSaving(true);
    try {
      const r = await reportApi.saveQuality(testId, settings.testerName || null);
      setSaved(true);
      toast.success(r.alreadySaved ? "Relatório já estava salvo." : "Relatório salvo.");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    try {
      await qualityApi.remove(testId);
      toast.success("Auditoria apagada.");
      onBack();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <div className="w-full">
      <BackButton onClick={onBack}>Voltar para as auditorias</BackButton>
      <PageHeader
        icon="checkCircle"
        title={audit.deviceName}
        subtitle={`Auditoria ${audit.testId.slice(0, 8)} · ${fmtDateTime(audit.startTime)}`}
        actions={
          finished ? (
            <Badge tone={approved ? "success" : "danger"} dot>
              {approved ? "Auditoria aprovada" : "Auditoria reprovada"}
            </Badge>
          ) : (
            <Badge tone="primary" live>
              Executando roteiro...
            </Badge>
          )
        }
      />

      <Panel className="mb-6">
        <div className="flex flex-col gap-3 p-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {done} de {total} etapas
            </span>
            <span className="font-semibold">{total ? Math.round((done / total) * 100) : 0}%</span>
          </div>
          <Progress pct={total ? (done / total) * 100 : 0} tone={barTone} live={!finished} />
          <div className="flex flex-wrap gap-2">
            {success > 0 && <Chip tone="success">{success} aprovada(s)</Chip>}
            {failed > 0 && <Chip tone="danger">{failed} com falha</Chip>}
            {count("executando") > 0 && <Chip tone="primary">{count("executando")} em execução</Chip>}
            {count("pendente") > 0 && <Chip tone="neutral">{count("pendente")} pendente(s)</Chip>}
          </div>
        </div>
      </Panel>

      <ol className="ui-timeline">
        {audit.steps.map((step, i) => {
          const st = STATE[step.status] ?? STATE.pendente;
          return (
            <li key={step.id} className={`ui-step ui-tone-${st.tone} ${st.cls}`}>
              <span className="ui-step-marker">
                {step.status === "executando" ? (
                  <Spinner size={16} />
                ) : step.status === "sucesso" ? (
                  <Icon name="check" size={16} stroke={3} />
                ) : step.status === "falha" ? (
                  <Icon name="x" size={16} stroke={3} />
                ) : (
                  i + 1
                )}
              </span>
              <div className="ui-step-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${step.status === "pendente" ? "text-muted-foreground" : ""}`}>{step.name}</span>
                  <Badge tone={st.tone} dot live={step.status === "executando"}>
                    {st.label}
                  </Badge>
                </div>
                {step.errorMsg && (
                  <div className="ui-chip-tone ui-tone-danger mt-2 rounded-lg px-2.5 py-1.5 text-xs">{step.errorMsg}</div>
                )}
                {step.logs.length > 0 && (
                  <div className="ui-log ui-mono">
                    {step.logs.map((l, j) => (
                      <div key={j} className="ui-log-line">
                        {l}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {finished && (
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
            Apagar auditoria
          </Button>
          <Button variant="primary" icon="file" loading={saving} disabled={saved} onClick={saveReport}>
            {saved ? "Relatório salvo" : "Salvar relatório"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Apagar auditoria?"
        message="A auditoria sai do histórico. Relatórios já salvos continuam disponíveis."
        confirmLabel="Apagar"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
