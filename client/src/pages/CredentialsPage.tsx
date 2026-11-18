import { useCallback, useEffect, useState } from "react";
import { credentialApi } from "../api";
import { errorText } from "../api/http";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { BackButton, Badge, Button, ConfirmDialog, Empty, Field, Input, Loading, PageHeader, Panel, Select } from "../components/ui";
import { Icon } from "../components/ui/Icon";
import type { LockUser, UnlockKey, UnlockType } from "../types/api";

const TYPE_LABEL: Record<string, string> = {
  card: "Cartão",
  fingerprint: "Biometria",
  password: "Senha",
  face: "Facial",
};

export function CredentialsPage() {
  const { device, navigate, settings } = useApp();
  const deviceId = device?.deviceId ?? "";

  const [users, setUsers] = useState<LockUser[]>([]);
  const [keys, setKeys] = useState<UnlockKey[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unlockType, setUnlockType] = useState<UnlockType>("card");
  const [userId, setUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [enrolling, setEnrolling] = useState<UnlockType | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<UnlockKey | null>(null);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const [u, k] = await Promise.all([credentialApi.users(deviceId), credentialApi.list(deviceId)]);
      setUsers(u);
      setKeys(k);
      setUserId((cur) => cur || u[0]?.userId || "");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!device) return null;

  async function createUser() {
    const name = newUserName.trim() || `${settings.testerName || "QA"} (teste)`;
    setCreatingUser(true);
    try {
      const r = await credentialApi.addUser(deviceId, name);
      toast.success(`Usuário "${name}" criado na fechadura.`);
      setNewUserName("");
      await load();
      if (r.userId) setUserId(r.userId);
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setCreatingUser(false);
    }
  }

  async function startEnroll() {
    const user = users.find((u) => u.userId === userId);
    if (!user) return toast.info("Selecione ou crie um usuário da fechadura.");
    setBusy(true);
    try {
      await credentialApi.enroll(deviceId, user.userId, user.userType, unlockType);
      setEnrolling(unlockType);
      toast.info(
        unlockType === "fingerprint"
          ? "Modo de cadastro ativo: pressione o dedo no leitor várias vezes."
          : "Modo de cadastro ativo: aproxime o cartão da fechadura.",
      );
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (!enrolling) return;
    setBusy(true);
    try {
      await credentialApi.cancel(deviceId, enrolling);
      toast.info("Cadastro cancelado.");
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    } finally {
      setEnrolling(null);
      setBusy(false);
    }
  }

  async function confirmRemove() {
    const k = toDelete;
    setToDelete(null);
    if (!k?.userId) return;
    try {
      await credentialApi.remove(deviceId, {
        userId: k.userId,
        userType: k.userType ?? 2,
        unlockType: k.unlockType,
        unlockNo: k.unlockNo,
      });
      toast.success("Credencial excluída.");
      setTimeout(() => void load(), 1200);
    } catch (err) {
      toast.error(`Falha: ${errorText(err)}`);
    }
  }

  const userName = (id: string | null) => users.find((u) => u.userId === id)?.name ?? "Sem usuário";

  return (
    <div className="w-full">
      <BackButton onClick={() => navigate("device")}>Voltar para a fechadura</BackButton>
      <PageHeader icon="card" title="Cartões e Biometria" subtitle={`${device.name} · cadastro físico disparado pela nuvem`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          icon="fingerprint"
          title="Cadastrar credencial"
          subtitle="A Tuya não aceita número de cartão/digital pela nuvem: o cadastro é feito na própria fechadura"
          footer={
            <div className="flex justify-end gap-2">
              {enrolling ? (
                <>
                  <Button loading={busy} onClick={cancelEnroll}>
                    Cancelar cadastro
                  </Button>
                  <Button
                    variant="primary"
                    icon="refresh"
                    onClick={() => {
                      setEnrolling(null);
                      void load();
                    }}
                  >
                    Concluí, atualizar lista
                  </Button>
                </>
              ) : (
                <Button variant="primary" loading={busy} disabled={!userId} onClick={startEnroll}>
                  Iniciar cadastro
                </Button>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={unlockType} disabled={!!enrolling} onChange={(e) => setUnlockType(e.target.value as UnlockType)}>
                <option value="card">Cartão RFID</option>
                <option value="fingerprint">Biometria</option>
                <option value="face">Facial</option>
              </Select>
            </Field>
            <Field label="Usuário da fechadura">
              <Select value={userId} disabled={!!enrolling} onChange={(e) => setUserId(e.target.value)}>
                {users.length === 0 && <option value="">Nenhum usuário</option>}
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            {enrolling && (
              <div className="ui-chip-tone ui-tone-primary flex items-center gap-3 rounded-lg px-3 py-3 text-sm sm:col-span-2">
                <span className="animate-pulse">
                  <Icon name={enrolling === "card" ? "card" : "fingerprint"} size={22} />
                </span>
                {enrolling === "fingerprint"
                  ? "Pressione o mesmo dedo no leitor até a fechadura confirmar (geralmente 4 a 6 leituras)."
                  : enrolling === "face"
                    ? "Posicione o rosto em frente à câmera da fechadura."
                    : "Aproxime o cartão do leitor da fechadura."}
              </div>
            )}
          </div>
        </Panel>

        <Panel icon="plus" title="Novo usuário da fechadura" subtitle="Credenciais ficam vinculadas a um usuário">
          <div className="flex gap-2 p-5">
            <Input
              placeholder={`${settings.testerName || "QA"} (teste)`}
              value={newUserName}
              maxLength={30}
              onChange={(e) => setNewUserName(e.target.value)}
            />
            <Button variant="primary" loading={creatingUser} onClick={createUser}>
              Criar
            </Button>
          </div>
        </Panel>
      </div>

      <Panel
        icon="list"
        title="Credenciais cadastradas"
        className="mt-6"
        actions={
          <Button size="sm" icon="refresh" loading={loading} onClick={load}>
            Atualizar
          </Button>
        }
      >
        {loading && !keys ? (
          <Loading text="Carregando credenciais..." />
        ) : error ? (
          <Empty icon="card" title="Não foi possível carregar as credenciais" text={error} />
        ) : !keys || keys.length === 0 ? (
          <Empty icon="card" title="Nenhum cartão ou biometria cadastrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Nº</th>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={`${k.unlockType}-${k.unlockNo}-${k.userId}`}>
                    <td>
                      <Badge tone={k.unlockType === "fingerprint" ? "info" : "primary"}>{TYPE_LABEL[k.unlockType] ?? k.unlockType}</Badge>
                    </td>
                    <td className="font-mono">{k.unlockNo}</td>
                    <td>{k.name ?? "—"}</td>
                    <td>{userName(k.userId)}</td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!k.userId}
                        title={k.userId ? undefined : "Credenciais sem usuário só podem ser removidas na fechadura/app"}
                        onClick={() => setToDelete(k)}
                      >
                        Excluir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={toDelete !== null}
        danger
        title="Excluir credencial?"
        message={`${TYPE_LABEL[toDelete?.unlockType ?? ""] ?? "Credencial"} nº ${toDelete?.unlockNo} será removida da fechadura.`}
        confirmLabel="Excluir"
        onConfirm={confirmRemove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
