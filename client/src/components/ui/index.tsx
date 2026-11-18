import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

// Componentes finos sobre as classes ui-* do style.css original — mesmo visual.

export type Tone = "primary" | "success" | "danger" | "warning" | "info" | "neutral";

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-1 flex items-center gap-3">
          {icon && (
            <div className="ui-icon-tile ui-icon-tile-lg">
              <Icon name={icon} size={22} />
            </div>
          )}
          <h2 className="text-primary text-3xl font-bold tracking-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-muted-foreground mt-1 ml-1 max-w-3xl text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  icon,
  title,
  subtitle,
  actions,
  children,
  footer,
  className = "",
}: {
  icon?: IconName;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-panel ${className}`}>
      {(title || actions) && (
        <div className="ui-panel-head">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="ui-icon-tile ui-icon-tile-sm">
                <Icon name={icon} />
              </span>
            )}
            <div>
              {title && <h3 className="ui-panel-title">{title}</h3>}
              {subtitle && <p className="ui-panel-subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
      {footer && <div className="ui-panel-foot">{footer}</div>}
    </section>
  );
}

export function Button({
  variant = "soft",
  size,
  icon,
  loading,
  children,
  className = "",
  ...rest
}: React.ComponentProps<"button"> & {
  variant?: "primary" | "soft" | "danger" | "ghost";
  size?: "sm" | "lg";
  icon?: IconName;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ui-btn ui-btn-${variant} ${size ? `ui-btn-${size}` : ""} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex animate-spin ${className}`}>
      <Icon name="spinner" size={size} stroke={2.5} />
    </span>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ui-field ${className}`}>
      <label htmlFor={htmlFor} className="ui-label">
        {label}
      </label>
      {children}
      {hint && <span className="ui-hint">{hint}</span>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  const { suffix, className = "", ...rest } = props;
  if (!suffix) return <input className={`ui-input ${className}`} {...rest} />;
  return (
    <div className="ui-input-wrap">
      <input className={`ui-input ${className}`} {...rest} />
      <span className="ui-suffix">{suffix}</span>
    </div>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select className={`ui-input ${className}`} {...rest} />;
}

export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="ui-check">
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-check-box">
        <Icon name="check" size={12} stroke={3.5} />
      </span>
      <span>{children}</span>
    </label>
  );
}

export function Badge({ tone = "primary", live, dot, children }: { tone?: Tone; live?: boolean; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`ui-badge ui-tone-${tone} ${dot || live ? "ui-badge-dot" : ""} ${live ? "is-live" : ""}`}>
      {children}
    </span>
  );
}

export function Chip({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ui-chip ${tone ? `ui-chip-tone ui-tone-${tone}` : ""}`}>{children}</span>;
}

export function Empty({ icon = "lock", title, text, children }: { icon?: IconName; title: ReactNode; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ui-empty">
      <span className="ui-icon-tile ui-tone-neutral mb-2">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {text && <p className="text-muted-foreground max-w-sm text-xs">{text}</p>}
      {children}
    </div>
  );
}

export function Loading({ text = "Carregando..." }: { text?: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-4 py-16">
      <Spinner size={36} className="text-primary" />
      <p className="animate-pulse font-medium tracking-wide">{text}</p>
    </div>
  );
}

export function Progress({ pct, tone = "primary", live }: { pct: number; tone?: Tone; live?: boolean }) {
  return (
    <div className={`ui-progress ui-tone-${tone} ${live ? "is-live" : ""}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Kv({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground block text-xs">{label}</span>
      <strong className="break-all">{children}</strong>
    </div>
  );
}

export function BackButton({ onClick, children = "Voltar" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-primary mb-6 flex cursor-pointer items-center gap-2 font-medium transition-colors"
    >
      <Icon name="arrowLeft" size={18} />
      {children}
    </button>
  );
}

// Confirmação embutida (substitui window.confirm).
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold">{title}</h3>
        <div className="text-muted-foreground mb-6 text-sm">{message}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Cancelar</Button>
          <Button ref={ref} variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
