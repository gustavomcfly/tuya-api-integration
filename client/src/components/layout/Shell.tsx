import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { useApp, type View } from "../../state/AppContext";
import logoMain from "../../assets/pado_marcas_rgb_Principal.svg";
import logoSymbol from "../../assets/pado_marcas_rgb_Simbolo.svg";

// IDs (sidebar, sidebar-logo, btn-toggle-sidebar...) e classes (is-collapsed,
// sidebar-text, nav.sticky) são os mesmos do app original: o style.css depende deles.

const NAV: { view: View; label: string; icon: IconName; group: View[] }[] = [
  { view: "home", label: "Meus Dispositivos", icon: "layers", group: ["home", "device", "deviceSettings", "passcodes", "credentials"] },
  { view: "cyclic", label: "Teste de Ciclagem", icon: "cycle", group: ["cyclic"] },
  { view: "quality", label: "Auditoria de Qualidade", icon: "checkCircle", group: ["quality"] },
  { view: "reports", label: "Relatórios de Testes", icon: "file", group: ["reports"] },
  { view: "settings", label: "Configurações do Sistema", icon: "settings", group: ["settings"] },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* armazenamento indisponível */
    }
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}

export function Shell({ children }: { children: ReactNode }) {
  const { view, navigate, logout, user } = useApp();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, toggleTheme] = useTheme();

  const go = (v: View) => {
    setMobileOpen(false);
    navigate(v);
  };

  return (
    <div className="bg-background flex h-screen w-full overflow-hidden">
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        id="sidebar"
        className={`bg-card border-border fixed inset-y-0 left-0 z-50 flex w-80 flex-col border-r transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center justify-between overflow-hidden px-6">
          <button
            type="button"
            title="Ir para o início"
            aria-label="Ir para o início"
            onClick={() => go("home")}
            className="flex cursor-pointer items-center transition-opacity hover:opacity-80"
          >
            <div id="sidebar-logo" className="flex origin-left items-center transition-all duration-300">
              <img src={logoMain} alt="Pado" className="h-30 w-auto object-contain" />
            </div>
            <div id="sidebar-logo-symbol" className="hidden h-10 w-12 shrink-0 items-center justify-center overflow-hidden">
              <img src={logoSymbol} alt="Pado" className="h-25 w-full scale-[3.0] object-contain" />
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-muted-foreground hover:text-primary shrink-0 cursor-pointer transition-colors lg:hidden"
            aria-label="Fechar menu"
          >
            <Icon name="x" size={24} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {NAV.map((item) => {
            const active = item.group.includes(view);
            return (
              <a
                key={item.view}
                href="#"
                title={item.label}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.view);
                }}
                className={`sidebar-link flex items-center gap-3.5 overflow-hidden rounded-xl px-4 py-2.5 text-[15px] transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <Icon name={item.icon} stroke={2.5} />
                </div>
                <span className="sidebar-text origin-left font-medium whitespace-nowrap transition-all duration-300">
                  {item.label}
                </span>
              </a>
            );
          })}
        </nav>

        <div className="hidden px-4 pb-2 lg:block">
          <button
            id="btn-toggle-sidebar"
            type="button"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex w-full cursor-pointer items-center gap-3.5 overflow-hidden rounded-xl px-4 py-2.5 text-[15px] transition-colors"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center">
              <span id="sidebar-toggle-icon" className="transition-transform duration-300">
                <Icon name="chevronLeft" stroke={2.5} />
              </span>
            </div>
            <span className="sidebar-text origin-left font-medium whitespace-nowrap transition-all duration-300">
              Recolher menu
            </span>
          </button>
        </div>

        <div className="border-border overflow-hidden border-t p-4">
          <button
            id="btn-logout"
            type="button"
            onClick={logout}
            title="Sair da conta"
            className="bg-destructive/10 text-destructive hover:bg-destructive/20 flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-lg px-4 py-3 transition-colors"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center">
              <Icon name="logout" size={22} stroke={2.5} />
            </div>
            <span className="sidebar-text origin-left font-semibold whitespace-nowrap transition-all duration-300">
              Sair da Conta
            </span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <nav className="bg-card border-border sticky top-0 z-40 flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="hover:bg-muted hover:text-primary -ml-2 cursor-pointer rounded-md p-2 transition-colors lg:hidden"
              aria-label="Abrir menu"
            >
              <Icon name="menu" size={24} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {user.name || user.username}
              </span>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="hover:bg-muted hover:text-primary text-muted-foreground cursor-pointer rounded-md p-2 transition-colors"
              title="Alternar Tema"
            >
              <Icon name={dark ? "sun" : "moon"} size={20} />
            </button>
          </div>
        </nav>
        <main className="w-full flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
