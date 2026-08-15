/**
 * Money formatting.
 *
 * Every amount in Aegis travels as an integer number of cents and is formatted
 * exactly once, here. Components never divide by 100 themselves and never
 * touch a float, so what a judge reads on screen is always the number the
 * ledger settled.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function usd(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "$0.00";
  return USD.format(Math.round(cents) / 100);
}

/** Splits a formatted amount so the cents can be rendered smaller. */
export function usdParts(cents: number | null | undefined) {
  const whole = usd(cents);
  const i = whole.lastIndexOf(".");
  return { major: whole.slice(0, i), minor: whole.slice(i) };
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const STATUS_COPY: Record<
  string,
  { label: string; tone: "neutral" | "live" | "good" | "warn" | "bad" }
> = {
  NEGOTIATING: { label: "Negotiating", tone: "live" },
  LOCKED: { label: "Funds in escrow", tone: "neutral" },
  PENDING_VERIFICATION: { label: "Verifying work", tone: "live" },
  FUNDS_RELEASED: { label: "Funds released", tone: "good" },
  DISPUTED: { label: "In dispute", tone: "warn" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
};
