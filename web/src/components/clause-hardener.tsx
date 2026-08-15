"use client";

import { useState } from "react";
import { GhostButton, Panel, SectionLabel } from "@/components/ui";
import type { DraftTerms } from "@/components/live-terms";

const VAGUE_WORDS = /\b(good|nice|soon|quality|as discussed|reasonable|satisfactory|etc)\b/i;

function suggestedCondition(condition: string | null) {
  const base = condition?.trim().replace(/[.\s]+$/, "") || "Deliver the agreed work with visible proof";
  return `${base}. Buyer confirms acceptance within 48 hours; one revision round is included.`;
}

/** A deterministic preflight that makes ambiguous release clauses visible. */
export function ClauseHardener({ terms }: { terms: DraftTerms | null }) {
  const [showSuggestion, setShowSuggestion] = useState(false);
  const item = Boolean(terms?.draft_item?.trim());
  const price = terms?.draft_price_cents != null;
  const condition = Boolean(terms?.draft_condition?.trim());
  const vague = condition && VAGUE_WORDS.test(terms?.draft_condition ?? "");
  const hasAcceptance = /approve|accept|confirm|review|deadline|by\s+\w+/i.test(terms?.draft_condition ?? "");
  const checks = [
    { label: "Deliverable named", ok: item, detail: item ? "Specific item captured" : "Say what will be delivered" },
    { label: "Price is explicit", ok: price, detail: price ? "Amount captured in cents" : "State one final price" },
    { label: "Release clause is concrete", ok: condition && !vague, detail: !condition ? "Describe what counts as done" : vague ? "Avoid subjective words" : "Clause is specific" },
    { label: "Acceptance is testable", ok: hasAcceptance, detail: hasAcceptance ? "Approval or timing signal found" : "Add approval, deadline, or evidence" },
  ];
  const ready = checks.every((check) => check.ok);

  async function copySuggestion() {
    await navigator.clipboard.writeText(suggestedCondition(terms?.draft_condition ?? null));
  }

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Clause hardener</SectionLabel>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
            Preflight the release condition before it becomes a dispute.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase ${ready ? "border-[var(--color-signal)]/35 bg-[var(--color-signal)]/10 text-[var(--color-signal)]" : "border-[var(--color-caution)]/35 bg-[var(--color-caution)]/10 text-[var(--color-caution)]"}`}>
          {ready ? "Clear" : `${checks.filter((check) => check.ok).length}/${checks.length} clear`}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-start gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3 py-2.5">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${check.ok ? "bg-[var(--color-signal)]/15 text-[var(--color-signal)]" : "bg-[var(--color-caution)]/15 text-[var(--color-caution)]"}`}>
              {check.ok ? "✓" : "!"}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[var(--color-ink)]">{check.label}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {!ready && condition && (
        <>
          <GhostButton onClick={() => setShowSuggestion((open) => !open)} className="mt-4 px-3 py-2 text-[12px]">
            {showSuggestion ? "Hide stronger clause" : "Show stronger clause"}
          </GhostButton>
          {showSuggestion && (
            <div className="mt-3 rounded-lg border border-[var(--color-aegis)]/30 bg-[var(--color-aegis)]/8 p-3">
              <p className="text-[12px] leading-relaxed text-[var(--color-ink)]">{suggestedCondition(terms?.draft_condition ?? null)}</p>
              <GhostButton onClick={copySuggestion} className="mt-3 px-3 py-2 text-[12px]">Copy suggestion</GhostButton>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
