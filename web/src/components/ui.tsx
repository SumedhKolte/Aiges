import Link from "next/link";
import { STATUS_COPY, usdParts } from "@/lib/format";

const TONE: Record<string, string> = {
  neutral: "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink-dim)]",
  live: "border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10 text-[var(--color-aegis)]",
  good: "border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10 text-[var(--color-signal)]",
  warn: "border-[var(--color-caution)]/40 bg-[var(--color-caution)]/10 text-[var(--color-caution)]",
  bad: "border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 text-[var(--color-halt)]",
};

export function StatusPill({ status }: { status: string }) {
  const meta = STATUS_COPY[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${TONE[meta.tone]}`}
    >
      {meta.tone === "live" && (
        <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {meta.label}
    </span>
  );
}

/**
 * The canonical way to render money.
 * Cents in, tabular figures out, dollars and cents visually separated.
 */
export function Money({
  cents,
  size = "md",
  tone = "default",
}: {
  cents: number;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "good" | "dim";
}) {
  const { major, minor } = usdParts(cents);
  const sizes = {
    sm: "text-[15px]",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-6xl",
  };
  const tones = {
    default: "text-[var(--color-ink)]",
    good: "text-[var(--color-signal)]",
    dim: "text-[var(--color-ink-dim)]",
  };
  return (
    <span className={`tnum font-semibold ${sizes[size]} ${tones[tone]}`}>
      {major}
      <span className="opacity-55">{minor}</span>
    </span>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
      {children}
    </h2>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg border border-[var(--color-aegis)] bg-[linear-gradient(135deg,var(--color-aegis),#21b9aa)] px-4 py-2.5 text-[15px] font-semibold text-[var(--color-void)] shadow-[0_8px_20px_rgb(20_201_184_/_0.16)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-px hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-panel-2)] px-4 py-2.5 text-[15px] font-medium text-[var(--color-ink)] transition-[transform,background-color,border-color] duration-200 hover:-translate-y-px hover:bg-[var(--color-panel-raised)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-[var(--color-ink)]">{title}</p>
      <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
        {body}
      </p>
      {action && (
        <Link
          href={action.href}
          className="mt-5 rounded-lg bg-[var(--color-aegis)] px-4 py-2 text-[14px] font-semibold text-[var(--color-void)] transition-opacity hover:opacity-90"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
