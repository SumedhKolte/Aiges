"use client";

import { useEffect, useState } from "react";
import { GhostButton, Panel, SectionLabel } from "@/components/ui";

type FingerprintContract = {
  item_description: string;
  price_cents: number;
  release_condition: string;
};

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalTerms(contract: FingerprintContract) {
  return [
    `item:${contract.item_description.trim()}`,
    `price_cents:${contract.price_cents}`,
    `release_condition:${contract.release_condition.trim()}`,
  ].join("|");
}

/** A portable proof that two screens contain the exact same agreement terms. */
export function AgreementFingerprint({ contract }: { contract: FingerprintContract }) {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(canonicalTerms(contract)))
      .then((digest) => {
        if (!cancelled) setFingerprint(toHex(digest));
      });
    return () => {
      cancelled = true;
    };
  }, [contract]);

  async function copyFingerprint() {
    if (!fingerprint) return;
    await navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Panel className="mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Agreement fingerprint</SectionLabel>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
            A local SHA-256 fingerprint of the exact item, price in cents, and release condition. Matching codes mean matching terms.
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-signal)]/35 bg-[var(--color-signal)]/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[var(--color-signal)] uppercase">
          Reproducible proof
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-void)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <code className="tnum break-all text-[12px] leading-relaxed text-[var(--color-aegis)]">
          {fingerprint ?? "Computing fingerprint…"}
        </code>
        <GhostButton onClick={copyFingerprint} disabled={!fingerprint} className="shrink-0 px-3 py-2 text-[12px]">
          {copied ? "Copied" : "Copy code"}
        </GhostButton>
      </div>
    </Panel>
  );
}
