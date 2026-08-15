"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Panel, SectionLabel } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Risk = {
  name: string;
  trust_score: number;
  deals_closed: number;
  volume_usd: string;
  flags_total: number;
  flags_serious: number;
  flags_by_category: Record<string, number>;
  disputes: number;
  verdict: "ESTABLISHED" | "CLEAN" | "CAUTION" | "HIGH_RISK";
};

const VERDICT: Record<
  Risk["verdict"],
  { label: string; blurb: string; tone: string }
> = {
  ESTABLISHED: {
    label: "Established",
    blurb: "Settled history, no serious flags on record.",
    tone: "text-[var(--color-signal)] border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10",
  },
  CLEAN: {
    label: "Clean",
    blurb: "No flags, but limited trading history so far.",
    tone: "text-[var(--color-aegis)] border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10",
  },
  CAUTION: {
    label: "Caution",
    blurb: "Aegis has flagged this party before. Read the terms carefully.",
    tone: "text-[var(--color-caution)] border-[var(--color-caution)]/40 bg-[var(--color-caution)]/10",
  },
  HIGH_RISK: {
    label: "High risk",
    blurb: "Repeated serious flags on record across past negotiations.",
    tone: "text-[var(--color-halt)] border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10",
  },
};

function readable(c: string) {
  return c
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Who you are about to deal with, shown before anyone agrees to anything.
 *
 * The moment to learn that a counterparty has a history of off-platform
 * payment requests is before committing money, not after.
 */
export function CounterpartyRisk({ profileId }: { profileId: string | null }) {
  const [risk, setRisk] = useState<Risk | null>(null);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`${API}/profiles/${profileId}/risk`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      }).catch(() => null);
      if (!res?.ok || cancelled) return;
      setRisk((await res.json()) as Risk);
    })();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (!profileId) {
    return (
      <Panel className="p-5">
        <SectionLabel>Counterparty</SectionLabel>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
          Waiting for the other party to join. Their trading history appears
          here before you agree to anything.
        </p>
      </Panel>
    );
  }

  if (!risk) {
    return (
      <Panel className="p-5">
        <SectionLabel>Counterparty</SectionLabel>
        <div className="mt-3 h-3.5 w-2/3 overflow-hidden rounded-full bg-[var(--color-line)]">
          <div
            className="h-full w-1/3 rounded-full bg-[var(--color-line-bright)]"
            style={{ animation: "aegis-sweep 1.8s ease-in-out infinite" }}
          />
        </div>
      </Panel>
    );
  }

  const v = VERDICT[risk.verdict];
  const categories = Object.entries(risk.flags_by_category).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionLabel>Counterparty</SectionLabel>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${v.tone}`}
        >
          {v.label}
        </span>
      </div>

      <p className="mt-3 text-[15px] font-semibold text-[var(--color-ink)]">
        {risk.name}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
        {v.blurb}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-line)] pt-4">
        <div>
          <dt className="text-[10px] tracking-wider text-[var(--color-ink-faint)] uppercase">
            Trust
          </dt>
          <dd className="tnum mt-0.5 text-[17px] font-semibold text-[var(--color-aegis)]">
            {risk.trust_score}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wider text-[var(--color-ink-faint)] uppercase">
            Settled
          </dt>
          <dd className="tnum mt-0.5 text-[17px] font-semibold">
            {risk.deals_closed}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wider text-[var(--color-ink-faint)] uppercase">
            Disputes
          </dt>
          <dd
            className={`tnum mt-0.5 text-[17px] font-semibold ${
              risk.disputes > 0 ? "text-[var(--color-caution)]" : ""
            }`}
          >
            {risk.disputes}
          </dd>
        </div>
      </dl>

      {categories.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <p className="text-[10px] tracking-wider text-[var(--color-ink-faint)] uppercase">
            Historic flags
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categories.map(([cat, n]) => (
              <span
                key={cat}
                className="rounded border border-[var(--color-line-bright)] bg-[var(--color-void)] px-2 py-1 text-[11px] text-[var(--color-ink-dim)]"
              >
                {readable(cat)}
                <span className="tnum ml-1 text-[var(--color-caution)]">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
