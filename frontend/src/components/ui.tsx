import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

/* Shared primitives matching FRONTEND_DESIGN_PLAN §4 (buttons, inputs, cards).
 * Colours come from the @theme tokens in styles.css (tungsten/paper/muted). */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    "bg-tungsten text-ink hover:brightness-110 disabled:opacity-60 font-semibold",
  secondary:
    "border border-line bg-transparent text-paper hover:border-dim hover:bg-panel",
  ghost: "bg-transparent text-muted hover:text-paper hover:bg-panel",
  danger: "bg-bad text-ink font-semibold hover:brightness-110 disabled:opacity-60",
};

const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-7 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
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
      className={`inline-flex items-center justify-center gap-2 rounded-md transition-colors disabled:cursor-not-allowed ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
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
      <label htmlFor={inputId} className="text-xs text-muted">
        {label}
      </label>
      <input
        id={inputId}
        className={`h-10 rounded-md border bg-panel px-3 text-sm text-paper outline-none transition-colors placeholder:text-dim focus:border-tungsten ${error ? "border-bad" : "border-line"}`}
        {...rest}
      />
      {error ? (
        <p className="text-[11px] text-bad">{error}</p>
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
    error: "border-bad/40 bg-bad/10 text-paper",
    info: "border-live/40 bg-live/10 text-paper",
    success: "border-ok/40 bg-ok/10 text-paper",
  } as const;
  return (
    <div className={`rounded-md border px-3 py-2.5 text-sm ${tones[tone]}`}>
      {children}
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
      className={`rounded-md border border-line bg-panel p-4 ${className}`}
    >
      {children}
    </div>
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
      <Link to="/" className="mb-8 text-lg font-bold tracking-tight">
        SlyxUp <span className="text-tungsten">Motion</span>
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function LoadingPage({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted" role="status">
      <Spinner />
      {label}
    </div>
  );
}
