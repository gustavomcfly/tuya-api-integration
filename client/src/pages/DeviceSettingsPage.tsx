import { useCallback, useEffect, useState } from "react";
import { deviceApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { dpValue } from "../utils/format";
import { BackButton, Button, ConfirmDialog, Empty, Field, Input, Loading, PageHeader, Panel, Select } from "../components/ui";
import type { DeviceDetail, DpFunction, FirmwareInfo } from "../types/api";

export function DeviceSettingsPage() {
  const { device, navigate, updateDevice, setDevices, devices } = useApp();
  const deviceId = device?.deviceId ?? "";
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [functions, setFunctions] = useState<DpFunction[] | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [autoLockOn, setAutoLockOn] = useState("0");
  const [autoLockSeconds, setAutoLockSeconds] = useState(5);
  const [savingAutoLock, setSavingAutoLock] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [firmware, setFirmware] = useState<FirmwareInfo | null>(null);
  const [checkingFw, setCheckingFw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!deviceId) return;
    try {
      const d = await deviceApi.detail(deviceId);
      setDetail(d);
      setAutoLockOn(d.autoLock.enabled ? "1" : "0");
      if (d.autoLock.seconds) setAutoLockSeconds(d.autoLock.seconds);
    } catch (err) {
      toast.error(errorText(err));
    }
    try {
      setFunctions((await deviceApi.specifications(deviceId)).functions);
    } catch (err) {
      setSpecError(errorText(err));
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!device) return null;

  async function rename() {
    const name = newName.trim();
    if (!name) return toast.info("Insira um nome válido.");
    setRenaming(true);
    try {
      await deviceApi.rename(deviceId, name);
      updateDevice({ deviceId, name });
      setNewName("");
      toast.success("Nome alterado com sucesso!");
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setRenaming(false);
    }
  }

  async function applyAutoLock() {
    const enabled = autoLockOn === "1";
    if (enabled && !(autoLockSeconds >= 1 && autoLockSeconds <= 1800)) {
      return toast.info("Informe um tempo entre 1 e 1800 segundos.");
    }
    setSavingAutoLock(true);
    try {
      await deviceApi.setAutoLock(deviceId, enabled ? autoLockSeconds : -1);
      toast.success(enabled ? `Fechamento automático ativado (${autoLockSeconds}s).` : "Fechamento automático desativado.");
      void load();
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setSavingAutoLock(false);
    }
  }

  async function setRemoteUnlock(enabled: boolean) {
    setRemoteBusy(true);
    try {
      await deviceApi.setRemoteUnlock(deviceId, enabled);
      toast.success(enabled ? "Abertura remota sem senha habilitada." : "Abertura remota sem senha desabilitada.");
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setRemoteBusy(false);
    }
  }

  async function checkFirmware() {
    setCheckingFw(true);
    try {
      const fw = await deviceApi.firmware(deviceId);
      setFirmware(fw);
      toast.info(fw.needUpgrade ? "Atualização de firmware disponível." : "Firmware atualizado.");
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setCheckingFw(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await deviceApi.remove(deviceId);
      setDevices(devices.filter((d) => d.deviceId !== deviceId));
      toast.success("Dispositivo removido.");
      navigate("home");
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
      setDeleting(false);
    }
  }

  const isLock = detail?.isLock ?? device.isLock;
  const supportsAutoLock = detail ? detail.autoLock.enabled !== null : false;

  return (
    <div className="w-full">
      <BackButton onClick={() => navigate("device")}>Voltar para o dispositivo</BackButton>
      <PageHeader icon="settings" title="Configurações Avançadas" subtitle={device.name} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel icon="settings" title="Renomear" subtitle="Altera o nome exibido no app Smart Life e aqui">
          <div className="flex gap-2 p-5">
            <Input placeholder={device.name} value={newName} maxLength={50} onChange={(e) => setNewName(e.target.value)} />
            <Button variant="primary" loading={renaming} onClick={rename}>
              Salvar
            </Button>
          </div>
        </Panel>

        <Panel icon="lock" title="Fechamento automático" subtitle="DPs automatic_lock / auto_lock_time">
          {detail && !supportsAutoLock ? (
            <p className="text-muted-foreground p-5 text-sm">Este dispositivo não expõe o DP de fechamento automático.</p>
          ) : (
            <div className="grid grid-cols-1 items-end gap-3 p-5 sm:grid-cols-3">
              <Field label="Estado">
                <Select value={autoLockOn} onChange={(e) => setAutoLockOn(e.target.value)}>
                  <option value="1">Ativado</option>
                  <option value="0">Desativado</option>
                </Select>
              </Field>
              <Field label="Tempo">
                <Input
                  type="number"
                  min={1}
                  max={1800}
                  suffix="seg"
                  disabled={autoLockOn !== "1"}
                  value={autoLockSeconds}
                  onChange={(e) => setAutoLockSeconds(parseInt(e.target.value) || 0)}
                />
              </Field>
              <Button variant="primary" loading={savingAutoLock} disabled={!detail} onClick={applyAutoLock}>
                Aplicar
              </Button>
            </div>
          )}
        </Panel>

        {isLock && (
          <Panel icon="unlock" title="Abertura remota sem senha" subtitle="Necessária para abrir/trancar pela nuvem e para a ciclagem">
            <div className="flex flex-wrap gap-2 p-5">
              <Button variant="primary" loading={remoteBusy} onClick={() => setRemoteUnlock(true)}>
                Habilitar
              </Button>
              <Button loading={remoteBusy} onClick={() => setRemoteUnlock(false)}>
                Desabilitar
              </Button>
            </div>
          </Panel>
        )}

        <Panel
          icon="cpu"
          title="Firmware"
          subtitle="Atualizações são aplicadas pelo app Smart Life"
          actions={
            <Button size="sm" icon="refresh" loading={checkingFw} onClick={checkFirmware}>
              Verificar
            </Button>
          }
        >
          {!firmware ? (
            <p className="text-muted-foreground p-5 text-sm">Clique em "Verificar" para consultar as versões.</p>
          ) : firmware.modules.length === 0 ? (
            <p className="text-muted-foreground p-5 text-sm">A Tuya não retornou informações de firmware.</p>
          ) : (
            <div className="flex flex-col gap-2 p-5 text-sm">
              {firmware.modules.map((m) => (
                <div key={m.module} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{m.module}</span>
                  <span className="font-mono">
                    {m.currentVersion ?? "?"}
                    {m.latestVersion && m.latestVersion !== m.currentVersion ? ` → ${m.latestVersion}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel icon="cpu" title="Controle de data points" subtitle="Funções graváveis informadas pela Tuya para este produto" className="mt-6">
        {specError ? (
          <Empty icon="cpu" title="Funções indisponíveis" text={specError} />
        ) : !functions ? (
          <Loading text="Carregando funções..." />
        ) : functions.length === 0 ? (
          <Empty icon="cpu" title="Nenhuma função gravável" text="Este produto não expõe comandos pela nuvem." />
        ) : (
          <div className="divide-border divide-y">
            {functions.map((f) => (
              <DpControl
                key={f.code}
                fn={f}
                current={detail?.status.find((s) => s.code === f.code)?.value}
                deviceId={deviceId}
                onSent={load}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel icon="trash" title="Zona de perigo" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-muted-foreground text-sm">
            Remove o dispositivo da conta vinculada. Para usá-lo de novo será preciso parear pelo app Smart Life.
          </p>
          <Button variant="danger" icon="trash" loading={deleting} onClick={() => setConfirmDelete(true)}>
            Remover dispositivo
          </Button>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Remover dispositivo?"
        message={`Tem certeza que deseja remover "${device.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// Um controle por DP, conforme o tipo declarado pela Tuya.
function DpControl({ fn, current, deviceId, onSent }: { fn: DpFunction; current: unknown; deviceId: string; onSent: () => void }) {
  const [value, setValue] = useState<string>(() => (current === undefined ? "" : String(current)));
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (current !== undefined) setValue(String(current));
  }, [current]);

  const v = fn.values as { range?: string[]; min?: number; max?: number; step?: number; scale?: number; unit?: string };

  async function send(raw: string) {
    let parsed: unknown = raw;
    if (fn.type === "Boolean") parsed = raw === "true";
    else if (fn.type === "Integer") {
      parsed = Number(raw);
      if (!Number.isFinite(parsed)) return toast.info("Valor numérico inválido.");
    } else if (fn.type === "Json") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return toast.info("JSON inválido.");
      }
    }
    setSending(true);
    try {
      await deviceApi.commands(deviceId, [{ code: fn.code, value: parsed }]);
      toast.success(`${fn.code} = ${dpValue(parsed)}`);
      setTimeout(onSent, 1200);
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setSending(false);
    }
  }

  let control;
  if (fn.type === "Boolean") {
    control = (
      <div className="flex gap-2">
        <Button size="sm" variant={value === "true" ? "primary" : "soft"} loading={sending} onClick={() => send("true")}>
          Ligar
        </Button>
        <Button size="sm" variant={value === "false" ? "primary" : "soft"} loading={sending} onClick={() => send("false")}>
          Desligar
        </Button>
      </div>
    );
  } else if (fn.type === "Enum" && Array.isArray(v.range)) {
    control = (
      <div className="flex gap-2">
        <Select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="" disabled>
            Selecione
          </option>
          {v.range.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="primary" loading={sending} disabled={!value} onClick={() => send(value)}>
          Enviar
        </Button>
      </div>
    );
  } else {
    control = (
      <div className="flex gap-2">
        <Input
          type={fn.type === "Integer" ? "number" : "text"}
          min={v.min}
          max={v.max}
          step={v.step}
          suffix={v.unit}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button size="sm" variant="primary" loading={sending} onClick={() => send(value)}>
          Enviar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold">{fn.code}</p>
        <p className="text-muted-foreground text-xs">
          {fn.name ? `${fn.name} · ` : ""}
          {fn.type}
          {fn.type === "Integer" && v.min !== undefined ? ` (${v.min}–${v.max}${v.unit ? ` ${v.unit}` : ""})` : ""}
          {current !== undefined ? ` · atual: ${dpValue(current)}` : ""}
        </p>
      </div>
      <div className="sm:w-80">{control}</div>
    </div>
  );
}
