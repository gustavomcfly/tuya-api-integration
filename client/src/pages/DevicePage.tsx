import { useCallback, useEffect, useState } from "react";
import { deviceApi, recordApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { categoryLabel, dpValue, fmtDateTime } from "../utils/format";
import { BackButton, Button, Empty, Kv, Loading, Panel, Spinner } from "../components/ui";
import { Icon, type IconName } from "../components/ui/Icon";
import type { DeviceDetail, DeviceEvent, UnlockRecord } from "../types/api";

export function DevicePage() {
  const { device, navigate, updateDevice } = useApp();
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [acting, setActing] = useState<"unlock" | "lock" | null>(null);

  const deviceId = device?.deviceId ?? "";

  const loadDetail = useCallback(async () => {
    if (!deviceId) return;
    setLoadingDetail(true);
    try {
      const d = await deviceApi.detail(deviceId);
      setDetail(d);
      updateDevice({ deviceId, online: d.online, battery: d.battery, name: d.name });
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setLoadingDetail(false);
    }
  }, [deviceId, updateDevice]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (!device) return null;

  const isLock = detail?.isLock ?? device.isLock;
  const canActuate = isLock || Boolean(detail?.switchCode);

  async function operate(kind: "unlock" | "lock") {
    setActing(kind);
    try {
      const r = kind === "unlock" ? await deviceApi.unlock(deviceId) : await deviceApi.lock(deviceId);
      toast.success(`${kind === "unlock" ? "Desbloqueio" : "Travamento"} enviado (${r.method}).`);
      setTimeout(() => void loadDetail(), 1500);
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="w-full">
      <BackButton onClick={() => navigate("home")}>Voltar para a lista</BackButton>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-primary truncate text-3xl font-bold tracking-tight">{device.name}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            ID: <span className="font-mono">{device.deviceId}</span> · {categoryLabel(device.category)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("deviceSettings")}
          className="bg-muted text-muted-foreground hover:bg-secondary hover:text-secondary-foreground cursor-pointer rounded-lg p-2 transition-colors"
          title="Configurações Avançadas"
        >
          <Icon name="settings" size={22} />
        </button>
      </header>

      <div className="bg-muted/30 border-border relative mb-6 grid grid-cols-2 gap-4 rounded-lg border p-4 pr-12 text-sm md:grid-cols-4">
        <button
          type="button"
          onClick={() => loadDetail()}
          className="bg-muted text-muted-foreground hover:bg-secondary hover:text-secondary-foreground absolute top-3 right-3 cursor-pointer rounded-md p-1.5 transition-colors"
          title="Atualizar Detalhes"
        >
          {loadingDetail ? <Spinner size={16} /> : <Icon name="refresh" size={16} />}
        </button>
        <Kv label="Conexão">
          {detail ? (
            <span className={detail.online ? "text-green-600 dark:text-green-400" : "text-destructive"}>
              {detail.online ? "Online" : "Offline"}
            </span>
          ) : (
            "..."
          )}
        </Kv>
        <Kv label="Bateria">{detail ? (detail.battery !== null ? `${detail.battery}%` : "N/A") : "..."}</Kv>
        <Kv label="Produto">{detail?.productName ?? "..."}</Kv>
        <Kv label="Fechamento automático">
          {detail
            ? detail.autoLock.enabled === null
              ? "N/A"
              : detail.autoLock.enabled
                ? `Ativado${detail.autoLock.seconds ? ` (${detail.autoLock.seconds}s)` : ""}`
                : "Desativado"
            : "..."}
        </Kv>
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-5">
        <div className="bg-card border-border flex flex-col items-center justify-center gap-4 rounded-xl border p-6 text-center shadow-sm md:col-span-2">
          <h3 className="ui-panel-title">{isLock ? "Abertura Remota" : "Acionamento Remoto"}</h3>
          <p className="text-muted-foreground mb-2 text-sm">
            {isLock
              ? "Abrir ou trancar pela nuvem Tuya (abertura sem senha precisa estar habilitada na fechadura)."
              : detail?.switchCode
                ? `Liga/desliga o DP "${detail.switchCode}". Útil para validar a ciclagem sem fechadura.`
                : "Este dispositivo não tem um DP de acionamento conhecido."}
          </p>
          <div className="grid w-full grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!canActuate || acting !== null}
              onClick={() => operate("unlock")}
              className="bg-secondary text-secondary-foreground hover:bg-accent flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {acting === "unlock" ? <Spinner size={16} /> : <Icon name="unlock" size={18} />}
              {isLock ? "Destrancar" : "Ligar"}
            </button>
            <button
              type="button"
              disabled={!canActuate || acting !== null}
              onClick={() => operate("lock")}
              className="bg-muted text-foreground hover:bg-muted/70 border-border flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {acting === "lock" ? <Spinner size={16} /> : <Icon name="lock" size={18} />}
              {isLock ? "Trancar" : "Desligar"}
            </button>
          </div>
        </div>

        <div className="bg-card border-border flex flex-col justify-between gap-4 rounded-xl border p-6 shadow-sm md:col-span-3">
          <div>
            <h3 className="border-border ui-panel-title border-b pb-2">Registros</h3>
            <p className="text-muted-foreground mt-3 text-sm">Gerencie os métodos de acesso associados a esta fechadura.</p>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NavTile icon="key" label="Senhas" disabled={!isLock} onClick={() => navigate("passcodes")} />
            <NavTile icon="card" label="Cartões e Biometria" disabled={!isLock} onClick={() => navigate("credentials")} />
            <NavTile icon="settings" label="Avançado" onClick={() => navigate("deviceSettings")} />
          </div>
        </div>
      </section>

      {detail && detail.status.length > 0 && (
        <Panel icon="cpu" title="Data points" subtitle="Status reportado pelo dispositivo" className="mt-8">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {detail.status.map((s) => (
              <div key={s.code} className="border-border/50 flex justify-between gap-3 border-b py-1.5">
                <span className="text-muted-foreground truncate font-mono text-xs">{s.code}</span>
                <span className="truncate font-medium" title={dpValue(s.value)}>
                  {dpValue(s.value)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {isLock ? <UnlockHistory deviceId={deviceId} /> : <DeviceEvents deviceId={deviceId} />}
    </div>
  );
}

function NavTile({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Disponível apenas para fechaduras" : undefined}
      className="bg-secondary text-secondary-foreground hover:bg-accent border-border flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={22} />
      <span className="text-center text-sm">{label}</span>
    </button>
  );
}

function UnlockHistory({ deviceId }: { deviceId: string }) {
  const [records, setRecords] = useState<UnlockRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords((await recordApi.list(deviceId)).list);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      icon="history"
      title="Histórico de Aberturas"
      subtitle="Últimos 30 dias (a Tuya não permite apagar o histórico pela nuvem)"
      className="mt-8"
      actions={
        <Button size="sm" icon="refresh" loading={loading} onClick={load}>
          Atualizar
        </Button>
      }
    >
      {loading && !records ? (
        <Loading text="Carregando histórico..." />
      ) : error ? (
        <Empty icon="history" title="Não foi possível carregar o histórico" text={error} />
      ) : !records || records.length === 0 ? (
        <Empty icon="history" title="Nenhuma abertura registrada" text="Aberturas dos últimos 30 dias aparecem aqui." />
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table w-full text-left text-sm">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Método</th>
                <th>Usuário</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={`${r.time}-${i}`}>
                  <td className="whitespace-nowrap">{fmtDateTime(r.time)}</td>
                  <td>{r.method}</td>
                  <td>{r.user ?? "—"}</td>
                  <td className="text-muted-foreground font-mono text-xs">{dpValue(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function DeviceEvents({ deviceId }: { deviceId: string }) {
  const [events, setEvents] = useState<DeviceEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents((await deviceApi.logs(deviceId)).list);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel
      icon="history"
      title="Eventos do dispositivo"
      subtitle="Últimos 7 dias: conexão, comandos e status reportados"
      className="mt-8"
      actions={
        <Button size="sm" icon="refresh" loading={loading} onClick={load}>
          Atualizar
        </Button>
      }
    >
      {loading && !events ? (
        <Loading text="Carregando eventos..." />
      ) : error ? (
        <Empty icon="history" title="Não foi possível carregar os eventos" text={error} />
      ) : !events || events.length === 0 ? (
        <Empty icon="history" title="Nenhum evento nos últimos 7 dias" />
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table w-full text-left text-sm">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Evento</th>
                <th>DP</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.time}-${i}`}>
                  <td className="whitespace-nowrap">{fmtDateTime(e.time)}</td>
                  <td>{e.event}</td>
                  <td className="font-mono text-xs">{e.code ?? "—"}</td>
                  <td className="font-mono text-xs">{dpValue(e.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
