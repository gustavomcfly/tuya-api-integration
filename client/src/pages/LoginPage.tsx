import { useEffect, useState, type FormEvent } from "react";
import { authApi, type AuthStatus } from "../api";
import { useApp } from "../state/AppContext";
import { toast } from "../utils/toast";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui";
import padoLogo from "../assets/pado_marcas_rgb_90anos.svg";
import fd500 from "../assets/fd-500.png";
import fde250 from "../assets/fde-250.png";
import fde300w from "../assets/fde-300w.png";
import fde600w from "../assets/fde-600w.png";
import fde800 from "../assets/fde-800.png";
import fdv201 from "../assets/fdv-201.png";

const SLIDES = [
  { src: fdv201, label: "FDV-201" },
  { src: fde250, label: "FDE-250" },
  { src: fde300w, label: "FDE-300W" },
  { src: fde600w, label: "FDE-600W" },
  { src: fde800, label: "FDE-800" },
  { src: fd500, label: "FD-500" },
];

const inputClass =
  "border-border bg-background text-foreground focus:border-primary w-full rounded-lg border px-3 py-2.5 text-sm transition-all focus:outline-none";
const labelClass = "text-muted-foreground text-xs font-semibold tracking-wide uppercase";

export function LoginPage() {
  const { login } = useApp();
  const [slide, setSlide] = useState(0);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    authApi
      .status()
      .then((s) => {
        setStatus(s);
        // Primeiro acesso: ninguém cadastrado ainda -> abre direto no cadastro.
        if (!s.registration.hasUsers) setMode("register");
      })
      .catch(() => toast.error("Servidor indisponível. Verifique se o backend está rodando."));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username || !password) return toast.error("Informe usuário e senha.");
    setBusy(true);
    try {
      const r =
        mode === "login"
          ? await authApi.login(username, password)
          : await authApi.register({ username, password, name: name || undefined, signupCode: signupCode || undefined });
      toast.success(mode === "login" ? "Autenticação bem sucedida!" : "Conta criada!");
      login(r.sessionToken, { username: r.user.username, name: r.user.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha de conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  const reg = status?.registration;

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col overflow-hidden md:flex-row">
      <div className="relative hidden w-full shrink-0 overflow-hidden bg-black md:flex md:w-1/2 lg:w-3/5">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="bg-primary absolute top-1/2 left-1/2 h-[60vw] w-[60vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-15 blur-[160px]" />
        </div>
        <img src={padoLogo} alt="Pado" className="absolute top-8 left-8 z-20 h-30 w-auto" />
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-8 p-12">
          <div className="max-w-md text-center">
            <h1 className="text-3xl font-black tracking-tight text-white">
              Automatize testes em todas as <span className="text-primary">fechaduras Pado/Tuya.</span>
            </h1>
          </div>
          <div className="flex w-full max-w-sm flex-col items-center gap-4">
            <div className="relative h-20 w-full sm:h-100">
              {SLIDES.map((s, i) => (
                <img
                  key={s.label}
                  src={s.src}
                  alt={s.label}
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ease-in-out ${i === slide ? "opacity-100" : "opacity-0"}`}
                />
              ))}
            </div>
            <p className="text-sm font-semibold tracking-wide text-white">{SLIDES[slide].label}</p>
            <div className="flex items-center justify-center gap-2">
              {SLIDES.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  aria-label={`Ver ${s.label}`}
                  onClick={() => setSlide(i)}
                  className={`h-1.5 cursor-pointer rounded-full transition-all ${i === slide ? "bg-primary w-4" : "w-1.5 bg-white/30 hover:bg-white/60"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-border bg-background relative flex w-full flex-1 items-center justify-center border-l p-6 sm:p-10">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-6">
          <img src={padoLogo} alt="Pado" className="h-25 w-auto self-center md:hidden" />
          <div>
            <h2 className="text-foreground text-2xl font-bold tracking-tight">
              {mode === "login" ? "Entrar no TestLock" : reg?.hasUsers ? "Criar conta" : "Primeiro acesso"}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {mode === "login"
                ? "Use sua conta do TestLock Tuya."
                : reg?.hasUsers
                  ? "Cadastro de novo testador."
                  : "Crie a conta de administrador deste servidor."}
            </p>
          </div>

          {status && !status.tuyaConfigured && (
            <div className="ui-chip-tone ui-tone-warning rounded-lg px-3 py-2 text-xs">
              Credenciais da Tuya não configuradas no servidor (TUYA_ACCESS_ID / TUYA_ACCESS_SECRET). O login funciona, mas
              os dispositivos não serão carregados.
            </div>
          )}

          <div className="flex flex-col gap-4">
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="name">
                  Nome
                </label>
                <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="username">
                Usuário
              </label>
              <input
                id="username"
                autoComplete="username"
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu.usuario"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="password">
                Senha
              </label>
              <div className="relative w-full">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className={`${inputClass} pr-11`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={20} />
                </button>
              </div>
              {mode === "register" && <span className="text-muted-foreground text-xs">Mínimo de 8 caracteres.</span>}
            </div>
            {mode === "register" && reg?.requiresCode && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="code">
                  Código de cadastro
                </label>
                <input id="code" className={inputClass} value={signupCode} onChange={(e) => setSignupCode(e.target.value)} />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary-hover flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-bold shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Spinner size={16} />}
            {busy ? "Conectando..." : mode === "login" ? "Entrar no Sistema" : "Criar conta"}
          </button>

          {reg?.hasUsers && (mode === "register" || reg.open) && (
            <button
              type="button"
              className="text-muted-foreground hover:text-primary cursor-pointer text-center text-xs underline-offset-2 hover:underline"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tenho conta"}
            </button>
          )}
          <p className="text-muted-foreground text-center text-xs">Acesso restrito a testadores autorizados Pado.</p>
        </form>
      </div>
    </div>
  );
}
