import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { settingsApi } from "../api";
import { session } from "../utils/session";
import type { DeviceSummary, UserSettings } from "../types/api";

// Estado global: sessão, navegação (mesmo modelo de "views" do app original,
// sem router) e configurações do usuário (vêm do banco).

export type View =
  | "home"
  | "device"
  | "deviceSettings"
  | "passcodes"
  | "credentials"
  | "cyclic"
  | "quality"
  | "reports"
  | "settings";

const DEFAULT_SETTINGS: UserSettings = {
  testerName: "",
  stdPasscode: "",
  defaultCycles: 100,
  defaultUnlockTime: 5,
  defaultInterval: 5,
};

interface AppState {
  user: { username: string; name: string | null } | null;
  view: View;
  device: DeviceSummary | null;
  devices: DeviceSummary[];
  settings: UserSettings;
  login: (token: string, user: { username: string; name: string | null }) => void;
  logout: () => void;
  navigate: (view: View) => void;
  openDevice: (device: DeviceSummary) => void;
  updateDevice: (patch: Partial<DeviceSummary>) => void;
  setDevices: (list: DeviceSummary[]) => void;
  setSettings: (s: UserSettings) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(() => (session.isAuthenticated() ? session.getUser() : null));
  const [view, setView] = useState<View>("home");
  const [device, setDevice] = useState<DeviceSummary | null>(null);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!user) return;
    settingsApi
      .get()
      .then(setSettings)
      .catch(() => {
        /* servidor indisponível: mantém padrões */
      });
  }, [user]);

  const login = useCallback((token: string, u: { username: string; name: string | null }) => {
    session.save(token, u);
    setUser(u);
    setView("home");
  }, []);

  const logout = useCallback(() => {
    session.clear();
    setUser(null);
    setDevice(null);
    setDevices([]);
    setView("home");
  }, []);

  const navigate = useCallback((v: View) => {
    if (v === "home") setDevice(null);
    setView(v);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, []);

  const openDevice = useCallback((d: DeviceSummary) => {
    setDevice(d);
    setView("device");
  }, []);

  const updateDevice = useCallback((patch: Partial<DeviceSummary>) => {
    setDevice((d) => (d ? { ...d, ...patch } : d));
    setDevices((list) => list.map((x) => (x.deviceId === patch.deviceId ? { ...x, ...patch } : x)));
  }, []);

  const value = useMemo(
    () => ({ user, view, device, devices, settings, login, logout, navigate, openDevice, updateDevice, setDevices, setSettings }),
    [user, view, device, devices, settings, login, logout, navigate, openDevice, updateDevice],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}
