"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SettlementReceipt } from "@/components/settlement-receipt";
import {
  GhostButton,
  Money,
  Panel,
  PrimaryButton,
  SectionLabel,
  StatusPill,
} from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Contract = {
  id: string;
  item_description: string;
  price_cents: number;
  release_condition: string;
  status: string;
  risk_score: number;
  created_at: string;
};

type Verification = {
  id: string;
  approved: boolean;
  confidence: number;
  reasoning: string;
  created_at: string;
};

type Deliberation = {
  id: string;
  agent_role: string;
  argument: string;
  seq: number;
};

const AGENT_LABEL: Record<string, string> = {
  BUYER_ADVOCATE: "Buyer's Advocate",
  SELLER_ADVOCATE: "Seller's Advocate",
  MAGISTRATE: "The Magistrate",
};

async function authed(path: string, body?: unknown) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.detail ?? "That request failed.");
  return json;
}

export function ContractWorkspace({
  contract: initial,
  isSeller,
  counterpartyName,
  counterpartyTrust,
}: {
  contract: Contract;
  isSeller: boolean;
  counterpartyName: string;
  counterpartyTrust: number;
}) {
  const router = useRouter();
  const [contract, setContract] = useState(initial);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [settlement, setSettlement] = useState<{
    sellerPct: number;
    buyerPct: number;
    sellerUsd: string;
    buyerUsd: string;
  } | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState("");
  const [showClaim, setShowClaim] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [reelSlug, setReelSlug] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- live contract + evidence state -------------------------------------
  useEffect(() => {
    const supabase = createClient();

    void supabase
      .from("verifications")
      .select("*")
      .eq("contract_id", contract.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => data?.[0] && setVerification(data[0] as Verification));

    void supabase
      .from("trust_reels")
      .select("share_slug")
      .eq("contract_id", contract.id)
      .limit(1)
      .then(({ data }) => data?.[0] && setReelSlug(data[0].share_slug));

    const channel = supabase
      .channel(`contract:${contract.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "contracts",
          filter: `id=eq.${contract.id}`,
        },
        (p) => setContract(p.new as Contract),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "verifications",
          filter: `contract_id=eq.${contract.id}`,
        },
        (p) => setVerification(p.new as Verification),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "jury_deliberations" },
        (p) =>
          setDeliberations((d) =>
            [...d, p.new as Deliberation].sort((a, b) => a.seq - b.seq),
          ),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [contract.id]);

  // ---- seller submits proof ------------------------------------------------
  const submitProof = useCallback(
    async (file: File) => {
      setBusy("verify");
      setError(null);
      setPreview(URL.createObjectURL(file));

      try {
        const supabase = createClient();
        const ext = file.name.split(".").pop() ?? "png";
        const path = `${contract.id}/${Date.now()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("work-proofs")
          .upload(path, file, { upsert: false });
        if (upErr) throw new Error(upErr.message);

        await authed("/vision/verify", {
          contract_id: contract.id,
          image_path: path,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verification failed.");
      } finally {
        setBusy(null);
      }
    },
    [contract.id, router],
  );

  // ---- buyer disputes ------------------------------------------------------
  async function openDispute() {
    setBusy("dispute");
    setError(null);
    try {
      const { dispute_id } = await authed("/jury/open", {
        contract_id: contract.id,
        buyer_claim: claim.trim(),
      });
      setShowClaim(false);
      setBusy("jury");
      const result = await authed("/jury/deliberate", {
        dispute_id,
      });
      setSettlement({
        sellerPct: result.seller_pct,
        buyerPct: result.buyer_pct,
        sellerUsd: result.seller_payout_usd,
        buyerUsd: result.buyer_refund_usd,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The jury could not convene.");
    } finally {
      setBusy(null);
    }
  }

  // ---- trust reel ----------------------------------------------------------
  async function makeReel() {
    setBusy("reel");
    setError(null);
    try {
      const reel = await authed("/reels/generate", { contract_id: contract.id });
      setReelSlug(reel.share_slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the reel.");
    } finally {
      setBusy(null);
    }
  }

  const released = contract.status === "FUNDS_RELEASED";
  const canSubmit =
    isSeller && ["LOCKED", "PENDING_VERIFICATION"].includes(contract.status);
  const canDispute =
    !isSeller && ["LOCKED", "PENDING_VERIFICATION"].includes(contract.status);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      {/* ---------------- summary ---------------- */}
      <Panel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusPill status={contract.status} />
            <h1 className="mt-3 text-[24px] font-semibold tracking-tight">
              {contract.item_description}
            </h1>
            <p className="mt-1.5 text-[14px] text-[var(--color-ink-dim)]">
              {isSeller ? "You are delivering to" : "You are buying from"}{" "}
              <span className="text-[var(--color-ink)]">{counterpartyName}</span>{" "}
              · trust score{" "}
              <span className="tnum text-[var(--color-aegis)]">
                {counterpartyTrust}
              </span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
              {released ? "Released" : "Held in escrow"}
            </div>
            <div className="mt-1">
              <Money
                cents={contract.price_cents}
                size="lg"
                tone={released ? "good" : "default"}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-void)] p-4">
          <div className="text-[11px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
            Funds release when
          </div>
          <p className="mt-1.5 text-[15px] leading-relaxed">
            {contract.release_condition}
          </p>
        </div>
      </Panel>

      {error && (
        <p className="mt-4 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-4 py-3 text-[14px] text-[var(--color-halt)]">
          {error}
        </p>
      )}

      {/* ---------------- seller: submit proof ---------------- */}
      {canSubmit && (
        <Panel className="mt-4 p-6">
          <SectionLabel>Submit proof of completion</SectionLabel>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
            Upload an image of the finished work. A vision model checks it
            against the release condition above before any funds move.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void submitProof(f);
            }}
          />

          <div className="mt-4 flex items-center gap-3">
            <PrimaryButton
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
            >
              {busy === "verify" ? "Verifying…" : "Upload work"}
            </PrimaryButton>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Submitted work"
                className="h-14 w-14 rounded-lg border border-[var(--color-line)] object-cover"
              />
            )}
          </div>

          {busy === "verify" && (
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
              <div
                className="h-full w-1/3 rounded-full bg-[var(--color-aegis)]"
                style={{ animation: "aegis-sweep 1.1s ease-in-out infinite" }}
              />
            </div>
          )}
        </Panel>
      )}

      {/* ---------------- verification verdict ---------------- */}
      {verification && (
        <Panel className="animate-rise mt-4 p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Vision review</SectionLabel>
            <span
              className={`text-[13px] font-semibold ${
                verification.approved
                  ? "text-[var(--color-signal)]"
                  : "text-[var(--color-halt)]"
              }`}
            >
              {verification.approved ? "Approved" : "Rejected"} ·{" "}
              <span className="tnum">
                {Math.round(Number(verification.confidence) * 100)}% confidence
              </span>
            </span>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line text-[var(--color-ink-dim)]">
            {verification.reasoning}
          </p>
        </Panel>
      )}

      {/* ---------------- buyer: dispute ---------------- */}
      {canDispute && (
        <Panel className="mt-4 p-6">
          <SectionLabel>Not satisfied?</SectionLabel>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
            Open a dispute and an autonomous three-agent jury will hear both
            sides and split the escrow. The ruling is binding and settles
            immediately.
          </p>

          {!showClaim ? (
            <GhostButton onClick={() => setShowClaim(true)} className="mt-4">
              Open a dispute
            </GhostButton>
          ) : (
            <div className="mt-4 space-y-3">
              <textarea
                className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3.5 py-2.5 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-aegis)] focus:outline-none"
                rows={3}
                placeholder="Describe precisely what fell short of the release condition."
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
              />
              <div className="flex gap-2">
                <PrimaryButton
                  onClick={openDispute}
                  disabled={claim.trim().length < 10 || busy !== null}
                >
                  {busy === "dispute"
                    ? "Filing…"
                    : busy === "jury"
                      ? "Jury deliberating…"
                      : "Convene the jury"}
                </PrimaryButton>
                <GhostButton onClick={() => setShowClaim(false)}>
                  Cancel
                </GhostButton>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ---------------- jury ---------------- */}
      {deliberations.length > 0 && (
        <Panel className="mt-4 p-6">
          <SectionLabel>Jury deliberation</SectionLabel>
          <div className="mt-4 space-y-3">
            {deliberations.map((d) => (
              <div
                key={d.id}
                className={`animate-rise rounded-lg border p-4 ${
                  d.agent_role === "MAGISTRATE"
                    ? "border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/5"
                    : "border-[var(--color-line)] bg-[var(--color-void)]"
                }`}
              >
                <div
                  className={`text-[11px] font-semibold tracking-[0.12em] uppercase ${
                    d.agent_role === "MAGISTRATE"
                      ? "text-[var(--color-aegis)]"
                      : "text-[var(--color-ink-faint)]"
                  }`}
                >
                  {AGENT_LABEL[d.agent_role] ?? d.agent_role}
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink)]">
                  {d.argument}
                </p>
              </div>
            ))}
          </div>

          {settlement && (
            <div className="animate-rise mt-5 rounded-xl border border-[var(--color-line)] bg-[var(--color-void)] p-4">
              <div className="text-[11px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
                Settlement
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full">
                <div
                  className="bg-[var(--color-signal)]"
                  style={{ width: `${settlement.sellerPct}%` }}
                />
                <div
                  className="bg-[var(--color-line-bright)]"
                  style={{ width: `${settlement.buyerPct}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-[14px]">
                <span className="text-[var(--color-ink-dim)]">
                  Seller{" "}
                  <span className="tnum font-semibold text-[var(--color-signal)]">
                    ${settlement.sellerUsd}
                  </span>{" "}
                  <span className="tnum text-[var(--color-ink-faint)]">
                    ({settlement.sellerPct}%)
                  </span>
                </span>
                <span className="text-[var(--color-ink-dim)]">
                  Buyer{" "}
                  <span className="tnum font-semibold text-[var(--color-ink)]">
                    ${settlement.buyerUsd}
                  </span>{" "}
                  <span className="tnum text-[var(--color-ink-faint)]">
                    ({settlement.buyerPct}%)
                  </span>
                </span>
              </div>
            </div>
          )}
        </Panel>
      )}

      <SettlementReceipt contractId={contract.id} />

      {/* ---------------- trust reel ---------------- */}
      {released && (
        <Panel className="animate-rise mt-4 p-6">
          <SectionLabel>Trust Reel</SectionLabel>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
            This deal is settled and verified. Aegis can turn it into a short
            shareable proof of reliability.
          </p>

          {reelSlug ? (
            <a
              href={`/reel/${reelSlug}`}
              className="mt-4 inline-block rounded-lg bg-[var(--color-aegis)] px-4 py-2.5 text-[15px] font-semibold text-[var(--color-void)] transition-opacity hover:opacity-90"
            >
              View your Trust Reel
            </a>
          ) : (
            <PrimaryButton
              onClick={makeReel}
              disabled={busy !== null}
              className="mt-4"
            >
              {busy === "reel" ? "Building…" : "Generate Trust Reel"}
            </PrimaryButton>
          )}
        </Panel>
      )}
    </main>
  );
}
