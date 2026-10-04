import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Info,
  type LucideIcon,
} from "lucide-react";

/* Signal primitives: ink fills, paper cards, signal-orange reserved for
 * live state + the single loudest action on screen. Status is always
 * icon + text, never emoji. */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type BtnSize = "sm" | "md" | "lg";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    "bg-paper text-ink hover:bg-tungsten hover:text-white disabled:opacity-60 font-bold shadow-[3px_3px_0_rgb(217_72_0/0.35)] hover:shadow-[3px_3px_0_rgb(23_19_16)]",
  accent:
    "bg-tungsten text-white hover:brightness-110 disabled:opacity-60 font-bold shadow-[3px_3px_0_rgb(23_19_16)]",
  secondary:
    "border-[1.5px] border-paper/25 bg-panel text-paper hover:border-paper hover:bg-panel-2",
  ghost: "bg-transparent text-muted hover:text-paper hover:bg-panel-2",
  danger: "bg-bad text-white font-bold hover:brightness-110 disabled:opacity-60",
};

const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-8 px-3.5 text-xs rounded-lg",
  md: "h-10 px-5 text-sm rounded-xl",
  lg: "h-12 px-7 text-base rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className = "",
  children,
  ...rest
}: BtnProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-all duration-200 disabled:cursor-not-allowed active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function Field({ label, error, hint, id, ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-bold text-paper">
        {label}
      </label>
      <input
        id={inputId}
        className={`h-11 rounded-xl border-[1.5px] bg-panel px-3.5 text-sm font-medium text-paper outline-none transition-all placeholder:font-normal placeholder:text-dim focus:border-tungsten focus:shadow-[0_0_0_3px_rgb(217_72_0/0.15)] ${error ? "border-bad" : "border-line"}`}
        {...rest}
      />
      {error ? (
        <p className="text-[11px] font-semibold text-bad">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-dim">{hint}</p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "success";
  children: ReactNode;
}) {
  const tones = {
    error: "border-bad/40 bg-[#fdecea] text-paper",
    info: "border-live/30 bg-[#e8ebff] text-paper",
    success: "border-ok/40 bg-[#e2f5ea] text-paper",
  } as const;
  const icons = { error: AlertTriangle, info: Info, success: CheckCircle2 } as const;
  const Icon = icons[tone];
  const iconTone = { error: "text-bad", info: "text-live", success: "text-ok" } as const;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border-[1.5px] px-3.5 py-3 text-sm font-medium ${tones[tone]}`} role="alert">
      <Icon size={17} className={`mt-0.5 shrink-0 ${iconTone[tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-panel p-5 shadow-[0_10px_28px_-20px_rgb(23_19_16/0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

/** Product wordmark: signal-orange clapperboard tile + wordmark. */
export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2">
      <span className="sticker flex h-8 w-8 items-center justify-center rounded-lg bg-tungsten text-white transition-transform group-hover:-rotate-6">
        <Clapperboard size={16} strokeWidth={2.4} aria-hidden />
      </span>
      {!compact ? (
        <span className="text-[17px] font-extrabold tracking-tight text-paper">
          SlyxUp <span className="text-tungsten">Motion</span>
        </span>
      ) : null}
    </Link>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-200px)] w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <div className="panel-lift p-6 md:p-7">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

export function LoadingPage({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2.5 text-sm font-medium text-muted" role="status">
      <Spinner />
      {label}
    </div>
  );
}

type BadgeTone = "gold" | "green" | "blue" | "muted" | "red";

 /** Small status/model pill. Icon optional, text always present. */
export function Badge({
  tone = "muted",
  icon: Icon,
  children,
  className = "",
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    gold: "border-tungsten/50 bg-[#fde3d3] text-tungsten-dim",
    green: "border-ok/40 bg-[#e2f5ea] text-ok",
    blue: "border-live/30 bg-[#e8ebff] text-live",
    red: "border-bad/40 bg-[#fdecea] text-bad",
    muted: "border-line bg-panel-2 text-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-[1.5px] px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]} ${className}`}
    >
      {Icon ? <Icon size={12} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Page/section heading: label, display title, optional action. */
export function SectionHeader({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow mb-1.5">{eyebrow}</p>
        <h2 className="text-2xl font-extrabold tracking-tight text-paper">{title}</h2>
        {body ? <p className="mt-1 max-w-xl text-sm text-muted">{body}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Empty collection state: icon medallion, title, guidance, action. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-lift flex flex-col items-center px-6 py-14 text-center">
      <span className="sticker mb-5 flex h-13 w-13 items-center justify-center rounded-2xl bg-[#fde3d3] p-3 text-tungsten">
        <Icon size={24} aria-hidden />
      </span>
      <p className="text-lg font-extrabold text-paper">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
