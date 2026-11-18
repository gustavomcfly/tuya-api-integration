import { useEffect, useState } from "react";
import { settingsApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { Button, Field, Input, PageHeader, Panel } from "../components/ui";
import type { UserSettings } from "../types/api";

export function SettingsPage() {
  const { settings, setSettings, user } = useApp();
  const [form, setForm] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (form.stdPasscode && !/^\d{6,10}$/.test(form.stdPasscode)) {
      return toast.info("A senha padrão deve ter de 6 a 10 dígitos.");
    }
    setSaving(true);
    try {
      setSettings(await settingsApi.save(form));
      toast.success("Configurações salvas.");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        icon="settings"
        title="Configurações do Sistema"
        subtitle={`Preferências da conta ${user?.username ?? ""}, salvas no servidor e válidas em qualquer computador.`}
      />
      <Panel
        icon="settings"
        title="Padrões de teste"
        footer={
          <div className="flex justify-end">
            <Button variant="primary" loading={saving} onClick={save}>
              Salvar configurações
            </Button>
          </div>
        }
      >
        <div className="ui-section">
          <h4 className="ui-section-title">Identificação</h4>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome padrão do testador" hint="Aparece nos relatórios">
              <Input value={form.testerName} placeholder="Ex: QA - Gustavo" onChange={(e) => set("testerName", e.target.value)} />
            </Field>
            <Field label="Senha numérica padrão" hint="Usada na auditoria (Wi-Fi: 7 dígitos; Zigbee/BLE: 6)">
              <Input
                inputMode="numeric"
                maxLength={10}
                value={form.stdPasscode}
                placeholder="Ex: 1357924"
                onChange={(e) => set("stdPasscode", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>
        </div>
        <div className="ui-section">
          <h4 className="ui-section-title">Teste de ciclagem</h4>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Ciclos padrão">
              <Input
                type="number"
                min={1}
                suffix="ciclos"
                value={form.defaultCycles}
                onChange={(e) => set("defaultCycles", parseInt(e.target.value) || 1)}
              />
            </Field>
            <Field label="Tempo destrancada">
              <Input
                type="number"
                min={0}
                suffix="seg"
                value={form.defaultUnlockTime}
                onChange={(e) => set("defaultUnlockTime", parseInt(e.target.value) || 0)}
              />
            </Field>
            <Field label="Intervalo entre comandos">
              <Input
                type="number"
                min={0}
                suffix="seg"
                value={form.defaultInterval}
                onChange={(e) => set("defaultInterval", parseInt(e.target.value) || 0)}
              />
            </Field>
          </div>
        </div>
      </Panel>
    </div>
  );
}
