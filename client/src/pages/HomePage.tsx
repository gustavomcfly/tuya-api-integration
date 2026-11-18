import { useCallback, useEffect, useState } from "react";
import { deviceApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { deviceVisual } from "../utils/format";
import { Button, Empty, Loading, PageHeader, Panel } from "../components/ui";
import { Icon } from "../components/ui/Icon";
import type { DeviceSummary } from "../types/api";

type Tab = "online" | "offline";

export function HomePage() {
  const { devices, setDevices, openDevice } = useApp();
  const [tab, setTab] = useState<Tab>("online");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locksOnly, setLocksOnly] = useState(false);

  const fetchDevices = useCallback(
    async (notify = false) => {
      setLoading(true);
      setError(null);
      try {
        const list = await deviceApi.list();
        setDevices(list);
        if (notify) toast.info(`${list.length} dispositivo(s) carregado(s).`);
      } catch (err) {
        setError(errorText(err));
        toast.error(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [setDevices],
  );

  useEffect(() => {
    if (devices.length === 0) void fetchDevices();
    // carrega uma vez ao entrar; "Atualizar" força nova busca
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = devices.filter((d) => (tab === "online" ? d.online : !d.online) && (!locksOnly || d.isLock));
  const tabClass = (active: boolean) =>
    active
      ? "active-tab bg-background text-foreground shadow-sm px-5 py-1.5 rounded-md text-sm font-bold transition-all cursor-pointer w-1/2 sm:w-auto"
      : "text-muted-foreground hover:text-foreground px-5 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer w-1/2 sm:w-auto";

  let body;
  if (loading) body = <Loading text="Buscando dispositivos..." />;
  else if (error)
    body = (
      <Empty icon="x" title="Erro ao carregar dispositivos" text={error}>
        <Button className="mt-3" icon="refresh" onClick={() => fetchDevices(true)}>
          Tentar novamente
        </Button>
      </Empty>
    );
  else if (filtered.length === 0)
    body = (
      <Empty
        title={`Não há nenhum dispositivo ${tab}`}
        text={
          devices.length === 0
            ? "Nenhum dispositivo vinculado ao projeto Tuya. Vincule a conta do app Smart Life em Cloud > Devices > Link App Account."
            : tab === "online"
              ? "Dispositivos desconectados ficam na aba Offline."
              : "Todos os dispositivos estão conectados à nuvem."
        }
      />
    );
  else
    body = (
      <div className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((d) => (
          <DeviceCard key={d.deviceId} device={d} onOpen={() => openDevice(d)} />
        ))}
      </div>
    );

  return (
    <div className="w-full">
      <PageHeader
        icon="layers"
        title="Meus Dispositivos"
        subtitle="Selecione uma fechadura (ou outro dispositivo Tuya) para gerenciar."
        actions={
          <Button icon="refresh" loading={loading} onClick={() => fetchDevices(true)}>
            Atualizar
          </Button>
        }
      />
      <Panel
        icon="list"
        title="Lista de dispositivos"
        subtitle="Dispositivos vinculados ao projeto Tuya Cloud"
        actions={
          <>
            <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={locksOnly} onChange={(e) => setLocksOnly(e.target.checked)} />
              Somente fechaduras
            </label>
            <div className="bg-muted/50 border-border/50 flex w-full items-center rounded-lg border p-1 sm:w-auto">
              <button type="button" className={tabClass(tab === "online")} onClick={() => setTab("online")}>
                Online
              </button>
              <button type="button" className={tabClass(tab === "offline")} onClick={() => setTab("offline")}>
                Offline
              </button>
            </div>
          </>
        }
      >
        {body}
      </Panel>
    </div>
  );
}

function DeviceCard({ device, onOpen }: { device: DeviceSummary; onOpen: () => void }) {
  const { model, img } = deviceVisual(device);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-card border-border hover:border-primary/50 group flex cursor-pointer flex-col overflow-hidden rounded-2xl border text-left shadow-sm transition-all duration-300 hover:shadow-[0_0_15px_rgba(236,72,153,0.1)]"
    >
      <div className="bg-muted/20 group-hover:bg-muted/40 relative flex h-48 w-full items-center justify-center p-6 transition-colors">
        <div className="bg-background/80 border-border text-foreground absolute top-3 right-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-md">
          <span
            className={`h-2 w-2 rounded-full ${device.online ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-muted-foreground"}`}
          />
          {device.online ? "Online" : "Offline"}
        </div>
        {device.isLock && (
          <div className="bg-background/80 border-border text-muted-foreground absolute top-3 left-3 rounded-full border p-1.5 backdrop-blur-md" title="Fechadura">
            <Icon name="lock" size={14} />
          </div>
        )}
        {img ? (
          <img
            src={img}
            alt={model}
            className="max-h-full object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Icon name="cpu" size={64} className="text-muted-foreground" />
        )}
      </div>
      <div className="border-border flex w-full flex-grow flex-col border-t p-5">
        <h3 className="text-foreground group-hover:text-primary truncate text-lg font-bold transition-colors" title={device.name}>
          {device.name}
        </h3>
        <p className="text-muted-foreground mb-4 truncate text-sm font-medium">{model}</p>
        <div className="border-border/50 mt-auto flex items-center justify-between border-t pt-4">
          <div className="text-foreground flex items-center gap-1.5 font-mono text-sm">
            <Icon name="battery" size={16} stroke={2.5} className="text-primary" />
            {device.battery !== null ? `${device.battery}%` : "--%"}
          </div>
          <div className="text-muted-foreground max-w-[120px] truncate font-mono text-xs" title={device.deviceId}>
            {device.deviceId}
          </div>
        </div>
      </div>
    </button>
  );
}
