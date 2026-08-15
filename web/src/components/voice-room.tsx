"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAegisVoice } from "@/lib/useAegisVoice";
import { createClient } from "@/lib/supabase/client";
import { ThreatSimulator } from "@/components/threat-simulator";
import { LiveTerms, type DraftTerms } from "@/components/live-terms";
import { VoiceForensics, type Challenge } from "@/components/voice-forensics";
import { CounterpartyRisk } from "@/components/counterparty-risk";
import { Money, Panel, PrimaryButton, SectionLabel, StatusPill } from "@/components/ui";

type RiskEvent = {
  id: string;
  level: "INFO" | "ELEVATED" | "HIGH" | "CRITICAL";
  category: string;
  rationale: string;
  transcript_excerpt: string | null;
  created_at: string;
};

type Contract = {
  id: string;
  item_description: string;
  price_cents: number;
  release_condition: string;
  status: string;
};

type Segment = {
  id: string;
  speaker: string;
  content: string;
  created_at: string;
};

const RISK_WEIGHT: Record<string, number> = {
  INFO: 0,
  ELEVATED: 15,
  HIGH: 45,
  CRITICAL: 100,
};

const RISK_TONE: Record<string, string> = {
  INFO: "text-[var(--color-ink-dim)] border-[var(--color-line-bright)]",
  ELEVATED: "text-[var(--color-caution)] border-[var(--color-caution)]/40",
  HIGH: "text-[var(--color-halt)] border-[var(--color-halt)]/40",
  CRITICAL: "text-[var(--color-halt)] border-[var(--color-halt)]/60",
};

function readable(category: string) {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function VoiceRoom({
  roomId,
  code,
  title,
  role,
  bothSeated,
  selfId,
  counterpartyId,
}: {
  roomId: string;
  code: string;
  title: string;
  role: string;
  bothSeated: boolean;
  selfId: string;
  counterpartyId: string | null;
}) {
  const {
    state,
    error,
    utterances,
    speaking,
    level,
    challengePhrase,
    connect,
    disconnect,
    injectUtterance,
    mode,
    peerState,
    speakers,
  } = useAegisVoice(roomId, selfId);

  const [risks, setRisks] = useState<RiskEvent[]>([]);
  const [contract, setContract] = useState<Contract | null>(null);
  const [remote, setRemote] = useState<Segment[]>([]);
  const [copied, setCopied] = useState(false);
  const [terms, setTerms] = useState<DraftTerms | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  // ---- live state from Postgres -------------------------------------------
  useEffect(() => {
    const supabase = createClient();

    void supabase
      .from("risk_events")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at")
      .then(({ data }) => data && setRisks(data as RiskEvent[]));

    void supabase
      .from("contracts")
      .select("id, item_description, price_cents, release_condition, status")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => data?.[0] && setContract(data[0] as Contract));

    void supabase
      .from("rooms")
      .select("draft_item, draft_price_cents, draft_condition, draft_confidence")
      .eq("id", roomId)
      .maybeSingle()
      .then(({ data }) => data && setTerms(data as DraftTerms));

    void supabase
      .from("voice_challenges")
      .select("id, phrase, latency_ms, phonetic_match, passed, verdict_note")
      .eq("room_id", roomId)
      .order("issued_at")
      .then(({ data }) => data && setChallenges(data as Challenge[]));

    void supabase
      .from("transcript_segments")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at")
      .then(({ data }) => data && setRemote(data as Segment[]));

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "risk_events",
          filter: `room_id=eq.${roomId}`,
        },
        (p) => setRisks((r) => [...r, p.new as RiskEvent]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contracts",
          filter: `room_id=eq.${roomId}`,
        },
        (p) => setContract(p.new as Contract),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (p) => setTerms(p.new as DraftTerms),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voice_challenges",
          filter: `room_id=eq.${roomId}`,
        },
        (p) =>
          setChallenges((c) => {
            const row = p.new as Challenge;
            const i = c.findIndex((x) => x.id === row.id);
            if (i === -1) return [...c, row];
            const next = [...c];
            next[i] = row;
            return next;
          }),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transcript_segments",
          filter: `room_id=eq.${roomId}`,
        },
        (p) => setRemote((s) => [...s, p.new as Segment]),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  // ---- merge local (instant) and remote (shared) transcript ---------------
  const feed = useMemo(() => {
    const seen = new Set(utterances.map((u) => u.text.trim()));
    const remoteOnly = remote
      .filter((s) => !seen.has(s.content.trim()))
      .map((s) => ({
        id: s.id,
        speaker: s.speaker === "AEGIS" ? ("AEGIS" as const) : ("PARTY" as const),
        text: s.content,
        at: new Date(s.created_at).getTime(),
      }));
    return [...utterances, ...remoteOnly].sort((a, b) => a.at - b.at);
  }, [utterances, remote]);

  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [feed.length]);

  const riskScore = Math.min(
    100,
    risks.reduce((sum, r) => sum + (RISK_WEIGHT[r.level] ?? 0), 0),
  );
  const halted = riskScore >= 70;
  const live = state === "live";

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-7">
      {/* ---------------- header ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[14px] text-[var(--color-ink-dim)]">
            You are the {role.toLowerCase()}
            {!bothSeated && " · waiting for the other party"}
          </p>
          {mode && (
            <p className="mt-1.5 text-[13px] text-[var(--color-ink-faint)]">
              {mode === "HOST"
                ? "Hosting the arbitrator on this device"
                : "Bridged in through the host"}
              {peerState === "connected" && " · peer audio connected"}
              {peerState === "waiting" && " · waiting for the other party to join the call"}
              {peerState === "connecting" && " · connecting peer audio"}
              {peerState === "failed" && " · peer audio failed"}
            </p>
          )}
        </div>

        <button
          onClick={copyCode}
          className="panel px-4 py-2.5 text-left transition-colors hover:border-[var(--color-line-bright)]"
        >
          <div className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
            {copied ? "Copied" : "Room code"}
          </div>
          <div className="tnum text-[18px] font-semibold tracking-[0.2em] text-[var(--color-aegis)]">
            {code}
          </div>
        </button>
      </div>

      {/* ---------------- security halt banner ---------------- */}
      {halted && (
        <div className="animate-rise animate-alarm mt-5 rounded-xl border border-[var(--color-halt)]/50 bg-[var(--color-halt)]/10 p-4">
          <p className="text-[15px] font-semibold text-[var(--color-halt)]">
            Security Halt
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
            Aegis has blocked this negotiation at risk score {riskScore}. Funds
            cannot be locked until the flagged behaviour is resolved.
          </p>
        </div>
      )}

      {/* ---------------- challenge banner ---------------- */}
      {challengePhrase && (
        <div className="animate-rise mt-5 rounded-xl border border-[var(--color-aegis)]/50 bg-[var(--color-aegis)]/10 p-4">
          <p className="text-[11px] tracking-[0.14em] text-[var(--color-aegis)] uppercase">
            Voice authenticity check
          </p>
          <p className="mt-2 text-[19px] font-semibold text-[var(--color-ink)]">
            “{challengePhrase}”
          </p>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink-dim)]">
            Say this out loud, exactly as written, without pausing.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* ================= left: the call ================= */}
        <div className="space-y-4">
          <Panel className="flex flex-col items-center px-6 py-9">
            {/* the orb */}
            <div className="relative flex h-32 w-32 items-center justify-center">
              <div
                className="absolute inset-0 rounded-full transition-transform duration-100"
                style={{
                  background:
                    "radial-gradient(circle, color-mix(in oklab, var(--color-aegis) 40%, transparent), transparent 70%)",
                  transform: `scale(${live ? 1 + level * 0.55 : 0.8})`,
                  opacity: live ? 0.85 : 0.25,
                }}
              />
              <div
                className={`relative flex h-20 w-20 items-center justify-center rounded-full border-2 transition-colors ${
                  speaking
                    ? "border-[var(--color-aegis)] bg-[var(--color-aegis)]/20"
                    : "border-[var(--color-line-bright)] bg-[var(--color-panel-2)]"
                }`}
              >
                {/* Bars are driven by the measured mic level, which updates on
                    every animation frame. Fixed per-bar weights keep the shape
                    organic without needing a clock. */}
                <div className="flex h-10 items-center gap-1">
                  {[0.55, 1, 0.75, 0.35].map((weight, i) => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-[var(--color-aegis)] transition-[height] duration-100"
                      style={{
                        height: live
                          ? `${8 + level * weight * 26 + (speaking ? 8 * weight : 0)}px`
                          : "8px",
                        opacity: live ? 1 : 0.3,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-6 text-[15px] font-medium">
              {state === "idle" && "Aegis is ready"}
              {state === "connecting" && "Connecting to the arbitrator…"}
              {live && (speaking ? "Aegis is speaking" : "Aegis is listening")}
              {state === "closed" && "Session ended"}
              {state === "error" && "Connection problem"}
            </p>
            <p className="mt-1.5 max-w-sm text-center text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
              {live
                ? "Both parties speak into this device. State the item, the price, and what counts as done."
                : "Aegis joins as a neutral third party, drafts the contract from what it hears, and holds the funds."}
            </p>

            {error && (
              <p className="mt-4 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2 text-[13px] text-[var(--color-halt)]">
                {error}
              </p>
            )}

            <div className="mt-6">
              {live ? (
                <button
                  onClick={disconnect}
                  className="rounded-lg border border-[var(--color-halt)]/50 bg-[var(--color-halt)]/10 px-5 py-2.5 text-[15px] font-semibold text-[var(--color-halt)] transition-colors hover:bg-[var(--color-halt)]/20"
                >
                  End session
                </button>
              ) : (
                <PrimaryButton
                  onClick={connect}
                  disabled={state === "connecting"}
                  className="px-6"
                >
                  {state === "connecting" ? "Connecting…" : "Start negotiation"}
                </PrimaryButton>
              )}
            </div>
          </Panel>

          {/* transcript */}
          <Panel className="p-5">
            <SectionLabel>Live transcript</SectionLabel>
            <div
              ref={feedRef}
              className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1"
            >
              {feed.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-[var(--color-ink-faint)]">
                  Nothing spoken yet.
                </p>
              ) : (
                feed.map((u) => (
                  <div key={u.id} className="animate-rise flex gap-3">
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${
                        u.speaker === "AEGIS"
                          ? "bg-[var(--color-aegis)]/15 text-[var(--color-aegis)]"
                          : "bg-[var(--color-line)] text-[var(--color-ink-dim)]"
                      }`}
                    >
                      {u.speaker === "AEGIS" ? "AEGIS" : "PARTY"}
                    </span>
                    <p className="text-[14px] leading-relaxed text-[var(--color-ink)]">
                      {u.text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* ================= right: forensics + contract ================= */}
        <div className="space-y-4">
          <CounterpartyRisk profileId={counterpartyId} />

          <LiveTerms terms={terms} locked={Boolean(contract)} />

          <VoiceForensics speakers={speakers} challenges={challenges} />

          <Panel className="p-5">
            <div className="flex items-baseline justify-between">
              <SectionLabel>Risk score</SectionLabel>
              <span
                className={`tnum text-[22px] font-semibold ${
                  halted
                    ? "text-[var(--color-halt)]"
                    : riskScore > 0
                      ? "text-[var(--color-caution)]"
                      : "text-[var(--color-signal)]"
                }`}
              >
                {riskScore}
              </span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${riskScore}%`,
                  background: halted
                    ? "var(--color-halt)"
                    : "var(--color-caution)",
                }}
              />
            </div>

            <div className="mt-4 space-y-2.5">
              {risks.length === 0 ? (
                <p className="text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
                  No deceptive behaviour detected. Aegis is monitoring for
                  off-platform payment requests, late price changes, and
                  manufactured urgency.
                </p>
              ) : (
                risks.map((r) => (
                  <div
                    key={r.id}
                    className={`animate-rise rounded-lg border bg-[var(--color-void)] p-3 ${RISK_TONE[r.level]}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold">
                        {readable(r.category)}
                      </span>
                      <span className="text-[10px] tracking-wider opacity-70">
                        {r.level}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
                      {r.rationale}
                    </p>
                    {r.transcript_excerpt && (
                      <p className="mt-2 border-l-2 border-current pl-2 text-[12px] italic opacity-75">
                        “{r.transcript_excerpt}”
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <ThreatSimulator live={live} onFire={injectUtterance} />

          {contract ? (
            <Panel className="animate-rise p-5">
              <div className="flex items-center justify-between">
                <SectionLabel>Contract</SectionLabel>
                <StatusPill status={contract.status} />
              </div>

              <div className="mt-4">
                <Money cents={contract.price_cents} size="lg" />
              </div>

              <dl className="mt-4 space-y-3 border-t border-[var(--color-line)] pt-4">
                <div>
                  <dt className="text-[11px] tracking-wider text-[var(--color-ink-faint)] uppercase">
                    Item
                  </dt>
                  <dd className="mt-1 text-[14px] text-[var(--color-ink)]">
                    {contract.item_description}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wider text-[var(--color-ink-faint)] uppercase">
                    Releases when
                  </dt>
                  <dd className="mt-1 text-[14px] leading-relaxed text-[var(--color-ink)]">
                    {contract.release_condition}
                  </dd>
                </div>
              </dl>

              <Link
                href={`/contract/${contract.id}`}
                className="mt-5 block w-full rounded-lg bg-[var(--color-aegis)] px-4 py-2.5 text-center text-[15px] font-semibold text-[var(--color-void)] transition-opacity hover:opacity-90"
              >
                Open contract
              </Link>
            </Panel>
          ) : (
            <Panel className="p-5">
              <SectionLabel>Contract</SectionLabel>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
                Aegis will draft this once it has heard the item, the price, and
                the release condition — and both parties have agreed out loud.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
