import { useCallback, useEffect, useRef, useState } from "react";
import { cyclicApi, deviceApi, reportApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { fmtDateTime, fmtDuration } from "../utils/format";
import {
  BackButton,
  Badge,
  Button,
  ConfirmDialog,
  Empty,
  Field,
  Input,
  Loading,
  PageHeader,
  Panel,
  Progress,
  Select,
  type Tone,
} from "../components/ui";
import type { CyclicStatus, CyclicTest, DeviceSummary } from "../types/api";

const STATUS: Record<CyclicStatus, { tone: Tone; label: string }> = {
  running: { tone: "primary", label: "Em execução" },
  paused: { tone: "warning", label: "Pausado" },
  completed: { tone: "success", label: "Concluído" },
  failed: { tone: "danger", label: "Falhou" },
  stopped: { tone: "neutral", label: "Interrompido" },
};

const LEVEL_CLASS: Record<string, string> = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "",
};

const pct = (t: CyclicTest) => (t.totalCycles ? Math.min(100, (t.completedCycles / t.totalCycles) * 100) : 0);
const isActive = (t: CyclicTest) => t.status === "running" || t.status === "paused";

export function CyclicTestPage() {
  const { devices, setDevices, device, settings } = useApp();
  const [tests, setTests] = useState<CyclicTest[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [deviceId, setDeviceId] = useState(device?.deviceId ?? "");
  const [cycles, setCycles] = useState(settings.defaultCycles);
  const [delay, setDelay] = useState(settings.defaultInterval);
  const [maxFailures, setMaxFailures] = useState(3);
  const [lowBattery, setLowBattery] = useState(20);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setCycles(settings.defaultCycles);
    setDelay(settings.defaultInterval);
  }, [settings.defaultCycles, settings.defaultInterval]);

  const loadTests = useCallback(async () => {
    try {
      setTests(await cyclicApi.mine());
    } catch (err) {
      toast.error(errorText(err));
      setTests([]);
    }
  }, []);

  useEffect(() => {
    void loadTests();
    if (devices.length === 0) deviceApi.list().then(setDevices).catch(() => {});
  }, [loadTests, devices.length, setDevices]);

  // Lista atualiza sozinha enquanto houver teste ativo
  useEffect(() => {
    if (!tests?.some(isActive) || openId) return;
    const t = setInterval(loadTests, 4000);
    return () => clearInterval(t);
  }, [tests, openId, loadTests]);

  const candidates = devices.filter((d) => d.isLock || d.online);

  async function start() {
    const d = devices.find((x) => x.deviceId === deviceId);
    if (!d) return toast.info("Selecione um dispositivo.");
    if (!d.online) return toast.info("O dispositivo está offline.");
    if (!(cycles >= 1)) return toast.info("Número de ciclos inválido.");
    setStarting(true);
    try {
      const r = await cyclicApi.start({
        deviceId: d.deviceId,
        deviceName: d.name,
        category: d.category,
        productName: d.productName,
        totalCycles: cycles,
        delayBetweenCycles: delay,
        maxConsecutiveFailures: maxFailures,
        lowBatteryThreshold: lowBattery,
      });
      toast.success("Teste iniciado no servidor.");
      setOpenId(r.testId);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setStarting(false);
    }
  }

  if (openId) {
    return (
      <CyclicProgress
        testId={openId}
        onBack={() => {
          setOpenId(null);
          void loadTests();
        }}
      />
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        icon="cycle"
        title="Teste de Ciclagem"
        subtitle="Abre e tranca repetidamente pela nuvem Tuya. O teste roda no servidor: pode fechar a aba que ele continua."
      />

      <Panel
        icon="settings"
        title="Novo teste"
        subtitle="Fechaduras usam abertura sem senha; outros dispositivos alternam o DP de switch"
        footer={
          <div className="flex justify-end">
            <Button variant="primary" icon="play" loading={starting} onClick={start}>
              Iniciar teste
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 p-5">
          <Field label="Dispositivo" hint="Somente dispositivos online podem iniciar um teste.">
            <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">Selecione...</option>
              {candidates.map((d: DeviceSummary) => (
                <option key={d.deviceId} value={d.deviceId} disabled={!d.online}>
                  {d.name} {d.isLock ? "🔒" : ""} {d.online ? "" : "(offline)"}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <h4 className="ui-section-title">Parâmetros do teste</h4>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Ciclos" hint="Abrir + travar">
                <Input type="number" min={1} suffix="ciclos" value={cycles} onChange={(e) => setCycles(parseInt(e.target.value) || 0)} />
              </Field>
              <Field label="Intervalo" hint="Entre comandos">
                <Input type="number" min={0} suffix="seg" value={delay} onChange={(e) => setDelay(parseInt(e.target.value) || 0)} />
              </Field>
              <Field label="Limite de falhas" hint="Consecutivas até parar">
                <Input
                  type="number"
                  min={1}
                  suffix="falhas"
                  value={maxFailures}
                  onChange={(e) => setMaxFailures(parseInt(e.target.value) || 1)}
                />
              </Field>
              <Field label="Alerta de bateria" hint="0 desativa">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  suffix="%"
                  value={lowBattery}
                  onChange={(e) => setLowBattery(parseInt(e.target.value) || 0)}
                />
              </Field>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        icon="history"
        title="Meus testes"
        className="mt-6"
        actions={
          <Button size="sm" icon="refresh" onClick={loadTests}>
            Atualizar
          </Button>
        }
      >
        {!tests ? (
          <Loading />
        ) : tests.length === 0 ? (
          <Empty icon="cycle" title="Nenhum teste de ciclagem ainda" />
        ) : (
          <div className="divide-border divide-y">
            {tests.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpenId(t.id)}
                className="hover:bg-muted/40 flex w-full cursor-pointer flex-col gap-2 px-5 py-4 text-left transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{t.device?.name ?? t.deviceId}</span>
                  <Badge tone={STATUS[t.status].tone} dot live={t.status === "running"}>
                    {STATUS[t.status].label}
                  </Badge>
                </div>
                <Progress pct={pct(t)} tone={STATUS[t.status].tone} live={t.status === "running"} />
                <div className="text-muted-foreground flex flex-wrap gap-x-4 text-xs">
                  <span>
                    {t.completedCycles.toFixed(1)}/{t.totalCycles} ciclos
                  </span>
                  <span>{t.totalFailures} falha(s)</span>
                  <span>{fmtDateTime(t.startedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function CyclicProgress({ testId, onBack }: { testId: string; onBack: () => void }) {
  const { settings } = useApp();
  const [test, setTest] = useState<CyclicTest | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ totalCycles: 0, delayBetweenCycles: 0, maxConsecutiveFailures: 3, lowBatteryThreshold: 20 });
  const [confirm, setConfirm] = useState<"stop" | "delete" | null>(null);
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const t = await cyclicApi.get(testId);
      if (mounted.current) setTest(t);
    } catch (err) {
      toast.error(errorText(err));
    }
  }, [testId]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!test || !isActive(test)) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [test, refresh]);

  if (!test) return <Loading text="Carregando teste..." />;

  const st = STATUS[test.status];
  const elapsed = (test.completedAt ? new Date(test.completedAt).getTime() : Date.now()) - new Date(test.startedAt).getTime();

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    const c = confirm;
    setConfirm(null);
    if (c === "stop") await act(() => cyclicApi.stop(testId), "Teste interrompido.");
    if (c === "delete") {
      try {
        await cyclicApi.remove(testId);
        toast.success("Teste removido.");
        onBack();
      } catch (err) {
        toast.error(errorText(err));
      }
    }
  }

  async function saveReport() {
    setBusy(true);
    try {
      const r = await reportApi.saveCyclic(testId, settings.testerName || null);
      setSaved(true);
      toast.success(r.alreadySaved ? "Relatório já estava salvo." : "Relatório salvo.");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <BackButton onClick={onBack}>Voltar para os testes</BackButton>
      <PageHeader
        icon="cycle"
        title={test.device?.name ?? test.deviceId}
        subtitle={`Teste ${test.id.slice(0, 8)} · iniciado ${fmtDateTime(test.startedAt)}${test.user ? ` por ${test.user.name || test.user.username}` : ""}`}
        actions={
          <Badge tone={st.tone} dot live={test.status === "running"}>
            {st.label}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Ciclos" value={`${test.completedCycles.toFixed(1)} / ${test.totalCycles}`} />
        <Stat label="Falhas" value={String(test.totalFailures)} tone={test.totalFailures ? "danger" : undefined} />
        <Stat
          label="Bateria"
          value={test.battery !== null ? `${test.battery}%` : "N/A"}
          sub={test.batteryStart !== null ? `início ${test.batteryStart}%` : undefined}
          tone={test.battery !== null && test.lowBatteryThreshold > 0 && test.battery <= test.lowBatteryThreshold ? "warning" : undefined}
        />
        <Stat label="Duração" value={fmtDuration(elapsed)} />
      </div>

      <div className="my-6">
        <div className="text-muted-foreground mb-2 flex justify-between text-xs">
          <span>Progresso</span>
          <span>{pct(test).toFixed(0)}%</span>
        </div>
        <Progress pct={pct(test)} tone={st.tone} live={test.status === "running"} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {test.status === "running" && (
          <Button icon="pause" loading={busy} onClick={() => act(() => cyclicApi.pause(testId), "Teste pausado.")}>
            Pausar
          </Button>
        )}
        {test.status === "paused" && (
          <Button variant="primary" icon="play" loading={busy} onClick={() => act(() => cyclicApi.resume(testId), "Teste retomado.")}>
            Retomar
          </Button>
        )}
        {isActive(test) && (
          <>
            <Button
              onClick={() => {
                setEdit({
                  totalCycles: test.totalCycles,
                  delayBetweenCycles: test.delayBetweenCycles,
                  maxConsecutiveFailures: test.maxConsecutiveFailures,
                  lowBatteryThreshold: test.lowBatteryThreshold,
                });
                setEditing((v) => !v);
              }}
            >
              Editar parâmetros
            </Button>
            <Button variant="danger" icon="stop" disabled={busy} onClick={() => setConfirm("stop")}>
              Parar
            </Button>
          </>
        )}
        {!isActive(test) && (
          <>
            <Button variant="primary" icon="file" loading={busy} disabled={saved} onClick={saveReport}>
              {saved ? "Relatório salvo" : "Salvar relatório"}
            </Button>
            <Button variant="danger" icon="trash" onClick={() => setConfirm("delete")}>
              Remover teste
            </Button>
          </>
        )}
      </div>

      {editing && isActive(test) && (
        <Panel
          title="Editar parâmetros"
          subtitle="Vale a partir do próximo ciclo"
          className="mb-6"
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(false)}>Cancelar</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() =>
                  act(() => cyclicApi.edit(testId, edit), "Parâmetros atualizados.").then(() => setEditing(false))
                }
              >
                Salvar
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
            <Field label="Ciclos">
              <Input type="number" value={edit.totalCycles} onChange={(e) => setEdit({ ...edit, totalCycles: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="Intervalo (s)">
              <Input
                type="number"
                value={edit.delayBetweenCycles}
                onChange={(e) => setEdit({ ...edit, delayBetweenCycles: parseInt(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Limite de falhas">
              <Input
                type="number"
                value={edit.maxConsecutiveFailures}
                onChange={(e) => setEdit({ ...edit, maxConsecutiveFailures: parseInt(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Alerta bateria (%)">
              <Input
                type="number"
                value={edit.lowBatteryThreshold}
                onChange={(e) => setEdit({ ...edit, lowBatteryThreshold: parseInt(e.target.value) || 0 })}
              />
            </Field>
          </div>
        </Panel>
      )}

      <Panel icon="list" title="Log do teste" subtitle="Mais recentes primeiro">
        <div className="ui-log ui-mono ui-scroll m-5 max-h-[28rem] overflow-y-auto">
          {(test.logs ?? []).length === 0 && <div className="ui-log-line">Aguardando primeiros eventos...</div>}
          {(test.logs ?? []).map((l) => (
            <div key={l.id} className={`ui-log-line ${LEVEL_CLASS[l.level] ?? ""}`}>
              [{new Date(l.timestamp).toLocaleTimeString("pt-BR")}] {l.type} · {l.message}
            </div>
          ))}
        </div>
      </Panel>

      <ConfirmDialog
        open={confirm !== null}
        danger
        title={confirm === "stop" ? "Parar o teste?" : "Remover o teste?"}
        message={
          confirm === "stop"
            ? "O teste será interrompido e não poderá ser retomado."
            : "O teste e seus logs serão apagados. Relatórios já salvos continuam disponíveis."
        }
        confirmLabel={confirm === "stop" ? "Parar" : "Remover"}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className={`bg-card border-border flex flex-col gap-1 rounded-xl border p-4 shadow-sm ${tone ? `ui-tone-${tone}` : ""}`}>
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${tone ? "ui-text-tone" : ""}`}>{value}</span>
      {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
    </div>
  );
}
