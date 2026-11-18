import { useCallback, useEffect, useState } from "react";
import { passcodeApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { fmtDateTime } from "../utils/format";
import {
  BackButton,
  Badge,
  Button,
  Check,
  ConfirmDialog,
  Empty,
  Field,
  Input,
  Loading,
  PageHeader,
  Panel,
  Select,
  type Tone,
} from "../components/ui";
import type { OfflinePasscode, PasscodeItem } from "../types/api";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// <input type="datetime-local"> <-> ms
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : undefined);
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// phase (Wi-Fi): 0 excluída, 1 a enviar, 2 enviada, 3 a excluir. (Zigbee: 2 normal, 3 congelada, 5 falha)
function phaseBadge(p: PasscodeItem): { tone: Tone; label: string } {
  const now = Date.now();
  if (p.invalidTime && p.invalidTime < now) return { tone: "neutral", label: "Expirada" };
  switch (p.phase) {
    case 1:
      return { tone: "warning", label: "Sincronizando" };
    case 2:
      return p.effectiveTime && p.effectiveTime > now ? { tone: "info", label: "Agendada" } : { tone: "success", label: "Ativa" };
    case 3:
      return { tone: "warning", label: "Removendo" };
    case 5:
    case 7:
      return { tone: "danger", label: "Falha" };
    case 0:
    case 4:
      return { tone: "neutral", label: "Excluída" };
    default:
      return { tone: "neutral", label: p.phase === null ? "—" : `Fase ${p.phase}` };
  }
}

export function PasscodesPage() {
  const { device, navigate, settings } = useApp();
  const deviceId = device?.deviceId ?? "";

  const [list, setList] = useState<PasscodeItem[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // senha personalizada
  const [passcode, setPasscode] = useState(settings.stdPasscode || "");
  const [name, setName] = useState("");
  const [start, setStart] = useState(() => toLocalInput(Date.now()));
  const [end, setEnd] = useState(() => toLocalInput(Date.now() + 7 * 24 * 3600 * 1000));
  const [useSchedule, setUseSchedule] = useState(false);
  const [weekDays, setWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState("08:00");
  const [endHour, setEndHour] = useState("18:00");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PasscodeItem | null>(null);

  // senha offline / dinâmica
  const [offlineType, setOfflineType] = useState<"once" | "multiple" | "clear_all">("once");
  const [offlineHours, setOfflineHours] = useState(24);
  const [offline, setOffline] = useState<OfflinePasscode | null>(null);
  const [genOffline, setGenOffline] = useState(false);
  const [dynamic, setDynamic] = useState<string | null>(null);
  const [genDynamic, setGenDynamic] = useState(false);

  const [toDelete, setToDelete] = useState<PasscodeItem | null>(null);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoadingList(true);
    setListError(null);
    try {
      setList(await passcodeApi.list(deviceId));
    } catch (err) {
      setListError(errorText(err));
    } finally {
      setLoadingList(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!device) return null;

  async function submit() {
    if (!/^\d{6,10}$/.test(passcode)) return toast.info("A senha deve ter de 6 a 10 dígitos (Wi-Fi: 7; Zigbee/BLE: 6).");
    if (useSchedule && (weekDays.length === 0 || minutesOf(startHour) >= minutesOf(endHour))) {
      return toast.info("Agenda inválida: escolha os dias e um horário inicial menor que o final.");
    }
    setCreating(true);
    try {
      const common = {
        deviceId,
        passcode,
        name: name || "Senha Customizada",
        startDate: fromLocalInput(start),
        endDate: fromLocalInput(end),
      };
      if (editing) {
        await passcodeApi.change({ ...common, passwordId: editing.id });
        toast.success("Senha alterada. A fechadura sincroniza em instantes.");
        setEditing(null);
      } else {
        await passcodeApi.addCustom({
          ...common,
          schedule: useSchedule ? { weekDays, startMinute: minutesOf(startHour), endMinute: minutesOf(endHour) } : undefined,
        });
        toast.success("Senha enviada. A fechadura sincroniza em instantes.");
      }
      setName("");
      setTimeout(() => void load(), 2000);
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setCreating(false);
    }
  }

  async function confirmRemove() {
    const p = toDelete;
    setToDelete(null);
    if (!p) return;
    try {
      await passcodeApi.remove(deviceId, p.id);
      toast.success("Exclusão enviada à fechadura.");
      setTimeout(() => void load(), 1500);
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    }
  }

  async function generateOffline() {
    setGenOffline(true);
    try {
      const now = Date.now();
      setOffline(
        await passcodeApi.offline({
          deviceId,
          name: offlineType === "clear_all" ? "Limpar offline" : "Senha Offline",
          type: offlineType,
          startDate: now,
          endDate: now + offlineHours * 3600 * 1000,
        }),
      );
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setGenOffline(false);
    }
  }

  async function generateDynamic() {
    setGenDynamic(true);
    try {
      setDynamic(await passcodeApi.dynamic(deviceId));
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setGenDynamic(false);
    }
  }

  function startEdit(p: PasscodeItem) {
    setEditing(p);
    setName(p.name);
    setPasscode("");
    if (p.effectiveTime) setStart(toLocalInput(p.effectiveTime));
    if (p.invalidTime) setEnd(toLocalInput(p.invalidTime));
    setUseSchedule(false);
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="w-full">
      <BackButton onClick={() => navigate("device")}>Voltar para a fechadura</BackButton>
      <PageHeader icon="key" title="Senhas" subtitle={`${device.name} · senhas temporárias, offline e dinâmicas`} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          icon="key"
          title={editing ? `Alterar "${editing.name}"` : "Senha personalizada"}
          subtitle="Cifrada com ticket AES e enviada pela nuvem (fechadura precisa estar online)"
          className="self-start xl:col-span-2"
          footer={
            <div className="flex justify-end gap-2">
              {editing && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setName("");
                  }}
                >
                  Cancelar edição
                </Button>
              )}
              <Button variant="primary" loading={creating} onClick={submit}>
                {editing ? "Salvar alteração" : "Criar senha"}
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Senha" hint="Wi-Fi: 7 dígitos · Zigbee/BLE: 6">
              <Input
                inputMode="numeric"
                maxLength={10}
                value={passcode}
                placeholder="1234567"
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Nome">
              <Input value={name} maxLength={30} placeholder="Ex: Visitante" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Início da validade">
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Fim da validade">
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            {!editing && (
              <div className="sm:col-span-2">
                <Check checked={useSchedule} onChange={setUseSchedule}>
                  Restringir a dias e horários (senha periódica)
                </Check>
                {useSchedule && (
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="flex flex-wrap gap-1.5 sm:col-span-3">
                      {WEEK.map((d, i) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setWeekDays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort()))}
                          className={`ui-btn ui-btn-sm ${weekDays.includes(i) ? "ui-btn-primary" : "ui-btn-soft"}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <Field label="Das">
                      <Input type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                    </Field>
                    <Field label="Até">
                      <Input type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel icon="key" title="Senha offline" subtitle="Gerada por algoritmo; funciona sem conexão">
            <div className="flex flex-col gap-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <Select value={offlineType} onChange={(e) => setOfflineType(e.target.value as typeof offlineType)}>
                    <option value="once">Uso único</option>
                    <option value="multiple">Várias vezes</option>
                    <option value="clear_all">Limpar todas</option>
                  </Select>
                </Field>
                <Field label="Validade">
                  <Input
                    type="number"
                    min={1}
                    max={8760}
                    suffix="h"
                    value={offlineHours}
                    onChange={(e) => setOfflineHours(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </Field>
              </div>
              <Button variant="primary" loading={genOffline} onClick={generateOffline}>
                Gerar
              </Button>
              {offline && (
                <div className="bg-muted/50 border-border rounded-lg border p-3 text-center">
                  <p className="font-mono text-2xl font-bold tracking-widest">{offline.passcode}</p>
                  <p className="text-muted-foreground mt-1 text-xs">Válida até {fmtDateTime(offline.invalidTime)}</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel icon="refresh" title="Senha dinâmica" subtitle="Uso imediato; expira em poucos minutos">
            <div className="flex flex-col gap-4 p-5">
              <Button loading={genDynamic} onClick={generateDynamic}>
                Obter senha dinâmica
              </Button>
              {dynamic && <p className="text-center font-mono text-2xl font-bold tracking-widest">{dynamic}</p>}
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        icon="list"
        title="Senhas cadastradas"
        subtitle="Senhas temporárias online válidas"
        className="mt-6"
        actions={
          <Button size="sm" icon="refresh" loading={loadingList} onClick={load}>
            Atualizar
          </Button>
        }
      >
        {loadingList && !list ? (
          <Loading text="Carregando senhas..." />
        ) : listError ? (
          <Empty icon="key" title="Não foi possível carregar as senhas" text={listError} />
        ) : !list || list.length === 0 ? (
          <Empty icon="key" title="Nenhuma senha cadastrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Status</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const b = phaseBadge(p);
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name || "—"}</td>
                      <td className="whitespace-nowrap">{fmtDateTime(p.effectiveTime)}</td>
                      <td className="whitespace-nowrap">{fmtDateTime(p.invalidTime)}</td>
                      <td>
                        <Badge tone={b.tone} dot>
                          {b.label}
                        </Badge>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>
                          Alterar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setToDelete(p)}>
                          Excluir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={toDelete !== null}
        danger
        title="Excluir senha?"
        message={`A senha "${toDelete?.name}" será removida da fechadura.`}
        confirmLabel="Excluir"
        onConfirm={confirmRemove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
