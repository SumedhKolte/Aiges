"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GhostButton, Panel, SectionLabel } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Receipt = {
  contract: Record<string, string | number | null>;
  forensics: { level: string; category: string; rationale: string; created_at: string }[];
  liveness_checks: {
    phrase: string;
    latency_ms: number | null;
    phonetic_match: number | null;
    passed: boolean | null;
  }[];
  vision_reviews: { approved: boolean; confidence: number; reasoning: string; model: string }[];
  jury: { agent_role: string; argument: string }[];
  ledger: { party: string; entry_type: string; amount_usd: string; memo: string; at: string }[];
  ledger_nets_to_zero: boolean;
};

function line(label: string, value: string | number | null | undefined) {
  return `${label.padEnd(24, ".")} ${value ?? "—"}`;
}

/** Renders the receipt as plain text so it can be read, printed, or archived. */
function toText(r: Receipt): string {
  const c = r.contract;
  const out: string[] = [
    "AEGIS SETTLEMENT RECEIPT",
    "=".repeat(60),
    "",
    "CONTRACT",
    line("  Item", c.item as string),
    line("  Release condition", c.release_condition as string),
    line("  Amount", `$${c.amount_usd}`),
    line("  Status", c.status as string),
    line("  Buyer", c.buyer as string),
    line("  Seller", c.seller as string),
    line("  Risk score at lock", `${c.risk_score_at_lock}/100`),
    line("  Locked", c.locked_at as string),
    line("  Released", c.released_at as string),
    "",
    `DECEPTION FORENSICS (${r.forensics.length} event${r.forensics.length === 1 ? "" : "s"})`,
  ];

  if (!r.forensics.length) out.push("  No risk events recorded.");
  r.forensics.forEach((f) =>
    out.push(`  [${f.level}] ${f.category} — ${f.rationale}`),
  );

  out.push("", `LIVENESS CHECKS (${r.liveness_checks.length})`);
  if (!r.liveness_checks.length) out.push("  None issued.");
  r.liveness_checks.forEach((v) =>
    out.push(
      `  "${v.phrase}"\n    ${v.passed ? "PASSED" : "FAILED"} · ${v.latency_ms} ms · ` +
        `${Math.round((v.phonetic_match ?? 0) * 100)}% phonetic match`,
    ),
  );

  out.push("", `VISION REVIEW (${r.vision_reviews.length})`);
  if (!r.vision_reviews.length) out.push("  No work submitted.");
  r.vision_reviews.forEach((v) =>
    out.push(
      `  ${v.approved ? "APPROVED" : "REJECTED"} · ${Math.round(v.confidence * 100)}% · ${v.model}\n    ${v.reasoning.replace(/\n+/g, " ")}`,
    ),
  );

  if (r.jury.length) {
    out.push("", "AI JURY");
    r.jury.forEach((j) => out.push(`  ${j.agent_role}: ${j.argument}`));
  }

  out.push("", `LEDGER (${r.ledger.length} entries)`);
  r.ledger.forEach((e) =>
    out.push(`  ${e.party.padEnd(18)} ${e.entry_type.padEnd(16)} $${e.amount_usd.padStart(12)}  ${e.memo ?? ""}`),
  );

  out.push(
    "",
    r.ledger_nets_to_zero
      ? "LEDGER BALANCED: entries net to exactly zero. No money was created or destroyed."
      : "WARNING: ledger does not net to zero.",
    "",
    `Generated ${new Date().toISOString()}`,
    "Every figure above is read from settled ledger state.",
  );

  return out.join("\n");
}

export function SettlementReceipt({ contractId }: { contractId: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`${API}/contracts/${contractId}/receipt`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail ?? "Could not build the receipt.");
      setReceipt(json as Receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the receipt.");
    } finally {
      setBusy(false);
    }
  }, [contractId]);

  function download() {
    if (!receipt) return;
    const blob = new Blob([toText(receipt)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-receipt-${contractId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel className="mt-4 p-6">
      <SectionLabel>Settlement receipt</SectionLabel>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
        The full audit trail: terms, every risk event, the liveness check, the
        vision verdict, any jury ruling, and the raw ledger entries.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <GhostButton onClick={load} disabled={busy}>
          {busy ? "Assembling…" : receipt ? "Refresh" : "Build receipt"}
        </GhostButton>
        {receipt && <GhostButton onClick={download}>Download</GhostButton>}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2 text-[13px] text-[var(--color-halt)]">
          {error}
        </p>
      )}

      {receipt && (
        <div className="animate-rise mt-4">
          <div
            className={`rounded-lg border px-3 py-2 text-[13px] ${
              receipt.ledger_nets_to_zero
                ? "border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10 text-[var(--color-signal)]"
                : "border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 text-[var(--color-halt)]"
            }`}
          >
            {receipt.ledger_nets_to_zero
              ? "Ledger balanced — entries net to exactly zero across all parties."
              : "Ledger imbalance detected."}
          </div>

          <pre className="tnum mt-3 max-h-80 overflow-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-ink-dim)]">
            {toText(receipt)}
          </pre>
        </div>
      )}
    </Panel>
  );
}
