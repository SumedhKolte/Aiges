"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAegisVoice } from "@/lib/useAegisVoice";
import { createClient } from "@/lib/supabase/client";
import { ThreatSimulator } from "@/components/threat-simulator";
import { LiveTerms, type DraftTerms } from "@/components/live-terms";
import { VoiceForensics, type Challenge } from "@/components/voice-forensics";
import { CounterpartyRisk } from "@/components/counterparty-risk";
import { JoinSeat } from "@/components/join-seat";
import { DealBrief } from "@/components/deal-brief";
import { ProtectionIndex } from "@/components/protection-index";
import { ClauseHardener } from "@/components/clause-hardener";
import { NegotiationReplay } from "@/components/negotiation-replay";
import { PrototypeBoundary } from "@/components/prototype-boundary";
import { TextChannel } from "@/components/text-channel";
import {
  Money,
  Panel,
  PrimaryButton,
  SectionLabel,
  StatusPill,
} from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  /** Who wrote it. Null for Aegis. */
  user_id: string | null;
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
  selfId,
  initialBuyerId,
  initialSellerId,
}: {
  roomId: string;
  code: string;
  title: string;
  role: string;
  selfId: string;
  initialBuyerId: string | null;
  initialSellerId: string | null;
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
    sendTypedMessage,
    relayPeerText,
    mode,
    peerState,
    speakers,
    activeSource,
    muted,
    toggleMic,
    remoteMuted,
  } = useAegisVoice(
    roomId,
    selfId,
    role === "Seller" ? "Seller" : "Buyer",
    role === "Seller" ? "Buyer" : "Seller",
  );

  const [risks, setRisks] = useState<RiskEvent[]>([]);
  const [contract, setContract] = useState<Contract | null>(null);
  const [remote, setRemote] = useState<Segment[]>([]);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Speaking is not the only way to negotiate. The channel choice is per
  // browser, so one party can type while the other talks.
  const [channel, setChannel] = useState<"voice" | "text">("voice");
  const [aegisTyping, setAegisTyping] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [terms, setTerms] = useState<DraftTerms | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  // Seats must be live. The server renders this page once, so whoever opened
  // the room would otherwise sit on "waiting for the other party" forever —
  // the counterparty's arrival only ever lands in Postgres, never in props.
  const [seats, setSeats] = useState<{
    buyer: string | null;
    seller: string | null;
  }>({
    buyer: initialBuyerId,
    seller: initialSellerId,
  });
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
      .select(
        "draft_item, draft_price_cents, draft_condition, draft_confidence, buyer_id, seller_id",
      )
      .eq("id", roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setTerms(data as DraftTerms);
        const row = data as {
          buyer_id: string | null;
          seller_id: string | null;
        };
        setSeats({ buyer: row.buyer_id, seller: row.seller_id });
      });

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

    const roomChannel = supabase
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
        (p) => {
          const row = p.new as DraftTerms & {
            buyer_id: string | null;
            seller_id: string | null;
          };
          setTerms(row);
          setSeats({ buyer: row.buyer_id, seller: row.seller_id });
        },
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
      void supabase.removeChannel(roomChannel);
    };
  }, [roomId]);

  // ---- merge local (instant) and remote (shared) transcript ---------------
  const feed = useMemo(() => {
    const seen = new Set(utterances.map((u) => u.text.trim()));
    const remoteOnly = remote
      .filter((s) => !seen.has(s.content.trim()))
      .map((s) => ({
        id: s.id,
        speaker:
          s.speaker === "AEGIS" ? ("AEGIS" as const) : ("PARTY" as const),
        text: s.content,
        at: new Date(s.created_at).getTime(),
        // Segments are now written with the attributed party ("BUYER" /
        // "SELLER"), so the counterparty's screen shows who said what too.
        label: s.speaker === "AEGIS" ? undefined : s.speaker,
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

  const bothSeated = Boolean(seats.buyer && seats.seller);
  const counterpartyId =
    seats.buyer === selfId
      ? seats.seller
      : seats.seller === selfId
        ? seats.buyer
        : null;

  // Read from the live seat map rather than the `role` prop: a party who took a
  // seat after this page rendered is still an Observer as far as the prop knows.
  const selfRole: "BUYER" | "SELLER" | null =
    seats.buyer === selfId
      ? "BUYER"
      : seats.seller === selfId
        ? "SELLER"
        : null;
  // The Seller privately builds the offer first. A Buyer cannot open a voice
  // bridge until the three terms exist, so there is no path for raw intake
  // audio or transcript to reach the Buyer.
  const proposalReady = Boolean(
    terms?.draft_item &&
      terms?.draft_price_cents != null &&
      terms?.draft_condition,
  );
  const canStartVoice = selfRole === "SELLER" || proposalReady;

  /**
   * Send a typed line into the negotiation.
   *
   * If this browser is on the call, the arbitrator already in the room answers
   * it. If it is not, the server-side arbitrator takes the turn and writes its
   * reply to the same transcript — which is how it reaches both screens.
   */
  const sendChat = useCallback(
    async (text: string) => {
      if (!selfRole) return;
      setChatError(null);

      const handledLive = await sendTypedMessage(
        text,
        selfRole === "SELLER" ? "Seller" : "Buyer",
      );
      if (handledLive) return;

      setAegisTyping(true);
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`${API}/chat/turn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ room_id: roomId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          // A 422 answers with an array of field errors, not a sentence — only
          // a string detail is safe to put in front of a person.
          const detail = typeof body?.detail === "string" ? body.detail : null;
          throw new Error(
            detail ?? `Aegis could not reply right now (${res.status}).`,
          );
        }
      } catch (e) {
        // The message itself is already in the transcript and on the other
        // party's screen; only the arbitrator's turn failed. Say exactly that.
        setChatError(
          e instanceof Error
            ? `${e.message} Your message was still delivered.`
            : "Aegis could not reply right now. Your message was still delivered.",
        );
      } finally {
        setAegisTyping(false);
      }
    },
    [roomId, selfRole, sendTypedMessage],
  );

  /**
   * Put the counterparty's typed lines in front of the live arbitrator.
   *
   * Only the host browser holds the Realtime connection, so when one party is
   * on the call and the other is typing, the host is the only one that can
   * relay. Segments seen while off the call are marked without relaying, so
   * joining a call does not replay the entire history into it.
   */
  const relayed = useRef<Set<string>>(new Set());
  const relaying = state === "live" && mode === "HOST";
  useEffect(() => {
    for (const segment of remote) {
      const fresh = !relayed.current.has(segment.id);
      relayed.current.add(segment.id);
      if (!fresh || !relaying) continue;
      if (segment.speaker === "AEGIS" || segment.user_id === selfId) continue;
      relayPeerText(segment.speaker, segment.content);
    }
  }, [remote, relaying, relayPeerText, selfId]);

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${code}`
      : "";

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-5 sm:px-5 sm:py-7">
      {/* ---------------- header ---------------- */}
      <section className="panel p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
                Negotiation room
              </span>
              <span className="h-1 w-1 rounded-full bg-[var(--color-line-bright)]" />
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${
                  live
                    ? "border-[var(--color-aegis)]/35 bg-[var(--color-aegis)]/10 text-[var(--color-aegis)]"
                    : "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink-dim)]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    live
                      ? "animate-pulse-dot bg-current"
                      : "bg-[var(--color-ink-faint)]"
                  }`}
                />
                {live
                  ? "Live session"
                  : bothSeated
                    ? "Ready to connect"
                    : "Waiting for second party"}
              </span>
            </div>
            <h1 className="mt-3 truncate text-[22px] font-semibold tracking-tight sm:text-[25px]">
              {title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-ink-dim)]">
              <span>You are the {role.toLowerCase()}</span>
              {mode && (
                <span className="text-[var(--color-ink-faint)]">
                  · {mode === "HOST" ? "Hosting Aegis" : "Bridged through host"}
                </span>
              )}
              {peerState === "connected" && (
                <span className="text-[var(--color-signal)]">
                  · Peer audio connected
                </span>
              )}
              {peerState === "waiting" && (
                <span className="text-[var(--color-ink-faint)]">
                  · Waiting for peer audio
                </span>
              )}
              {peerState === "connecting" && (
                <span className="text-[var(--color-ink-faint)]">
                  · Connecting peer audio
                </span>
              )}
              {peerState === "failed" && (
                <span className="text-[var(--color-caution)]">
                  · Peer audio needs attention
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(
                [
                  ["Buyer", seats.buyer],
                  ["Seller", seats.seller],
                ] as const
              ).map(([label, id]) => {
                const isSelf = Boolean(id) && id === selfId;
                return (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300 ${
                      isSelf
                        ? "border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10 text-[var(--color-signal)]"
                        : id
                          ? "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink-dim)]"
                          : "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink-faint)]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        id ? "bg-current" : "animate-pulse-dot bg-current"
                      }`}
                    />
                    {label}
                    {isSelf && " (you)"}
                    {!id && " — waiting"}
                  </span>
                );
              })}
            </div>
          </div>

          <button
            onClick={copyCode}
            aria-label="Copy room code"
            className="flex shrink-0 items-center justify-between gap-5 rounded-xl border border-[var(--color-line-bright)] bg-[var(--color-void)] px-4 py-2.5 text-left transition-colors hover:border-[var(--color-aegis)]/50 sm:min-w-[142px]"
          >
            <div>
              <div className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
                {copied ? "Copied" : "Room code"}
              </div>
              <div className="tnum mt-0.5 text-[18px] font-semibold tracking-[0.2em] text-[var(--color-aegis)]">
                {code}
              </div>
            </div>
            <span className="text-[15px] text-[var(--color-ink-faint)]">↗</span>
          </button>
        </div>
      </section>

      {role === "Observer" && (
        <JoinSeat
          code={code}
          freeSeat={!seats.buyer ? "BUYER" : !seats.seller ? "SELLER" : null}
        />
      )}

      {!bothSeated && role !== "Observer" && (
        <section className="animate-rise mt-5 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
          <p className="text-[11px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
            Invite the other party
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3 py-2 font-mono text-[12px] text-[var(--color-ink)]">
              {inviteUrl}
            </code>
            <button
              onClick={copyInvite}
              className="shrink-0 rounded-lg border border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10 px-3.5 py-2 text-[13px] font-semibold text-[var(--color-aegis)] transition-colors hover:bg-[var(--color-aegis)]/20"
            >
              {linkCopied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-dim)]">
            Send this link to seat the other party in the room directly.
          </p>
        </section>
      )}

      <PrototypeBoundary />

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

      {!live && !contract && <DealBrief title={title} role={role} />}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
        {/* ================= left: the call ================= */}
        <div className="min-w-0 space-y-5">
          {/* Intake is voice-only and private. Once the offer is ready, either
              channel can use the same mediated negotiation. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-2 pl-4">
            <p className="text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
              {!proposalReady
                ? "Private seller intake is active. The Buyer receives no raw audio or transcript."
                : channel === "voice"
                ? "Speak with the other party — Aegis chairs the call."
                : "Prefer not to speak? Type instead — Aegis chairs it the same way."}
            </p>
            <div
              role="tablist"
              aria-label="Negotiation channel"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-void)] p-1"
            >
              {(
                [
                  ["voice", "Voice call"],
                  ["text", "Text chat"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={channel === key}
                  disabled={key === "text" && !proposalReady}
                  onClick={() => setChannel(key)}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    channel === key
                      ? "bg-[var(--color-aegis)]/15 text-[var(--color-aegis)]"
                      : key === "text" && !proposalReady
                        ? "cursor-not-allowed text-[var(--color-ink-faint)]"
                        : "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* The call controls follow you into the text channel, so switching
              tabs can never strand a live session with no way to end it. */}
          {channel === "text" && live && (
            <div className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-aegis)]/35 bg-[var(--color-aegis)]/10 px-4 py-3">
              <p className="text-[13px] text-[var(--color-ink)]">
                <span className="animate-pulse-dot mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-aegis)] align-middle" />
                Voice session live ·{" "}
                {muted ? "your mic is muted" : "you have the floor"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMic}
                  className="rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-panel-2)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-panel-raised)]"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={disconnect}
                  className="rounded-lg border border-[var(--color-halt)]/50 bg-[var(--color-halt)]/10 px-3 py-1.5 text-[13px] font-semibold text-[var(--color-halt)] transition-colors hover:bg-[var(--color-halt)]/20"
                >
                  End session
                </button>
              </div>
            </div>
          )}

          {channel === "text" ? (
            <TextChannel
              feed={feed}
              selfRole={selfRole}
              onSend={sendChat}
              thinking={aegisTyping}
              error={chatError}
              liveVoice={live}
              bothSeated={bothSeated}
            />
          ) : (
            <>
              <Panel className="flex min-h-[390px] flex-col items-center justify-center px-6 py-10 sm:min-h-[430px]">
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

                {live && mode === "HOST" && activeSource && (
                  <p className="animate-rise mt-4 text-[13px] font-medium text-[var(--color-aegis)]">
                    {activeSource === "BOTH"
                      ? "Both parties speaking at once"
                      : `${
                          activeSource === "LOCAL"
                            ? role === "Seller"
                              ? "Seller"
                              : "Buyer"
                            : role === "Seller"
                              ? "Buyer"
                              : "Seller"
                        } has the floor`}
                  </p>
                )}

                <p className="mt-6 text-[15px] font-medium">
                  {state === "idle" && "Aegis is ready"}
                  {state === "connecting" && "Connecting to the arbitrator…"}
                  {live &&
                    (speaking ? "Aegis is speaking" : "Aegis is listening")}
                  {state === "closed" && "Session ended"}
                  {state === "error" && "Connection problem"}
                </p>
                <p className="mt-1.5 max-w-sm text-center text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
                  {live
                    ? "Aegis privately processes each turn and relays a structured response. Parties never hear each other directly."
                    : selfRole === "BUYER" && !proposalReady
                      ? "The Seller is preparing a private proposal. You will join when the structured offer is ready."
                      : "Aegis privately gathers the Seller's offer, then presents a structured proposal to the Buyer."}
                </p>

                {error && (
                  <div className="mt-4 max-w-sm rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2 text-center">
                    <p className="text-[13px] leading-relaxed text-[var(--color-halt)]">
                      {error}
                    </p>
                    {/* Direct audio between two networks is the one thing this
                        page cannot guarantee. When it fails there is a working
                        way to negotiate one click away — offer it rather than
                        leaving the party staring at an apology. */}
                    {peerState === "failed" && (
                      <button
                        onClick={() => setChannel("text")}
                        className="mt-2.5 rounded-lg border border-[var(--color-aegis)]/50 bg-[var(--color-aegis)]/10 px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-aegis)] transition-colors hover:bg-[var(--color-aegis)]/20"
                      >
                        Switch to Text chat
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-6">
                  {live ? (
                    <div className="flex flex-col items-center gap-3">
                      <button
                        onClick={toggleMic}
                        className={`flex items-center gap-2.5 rounded-full border-2 px-6 py-3 text-[15px] font-semibold transition-colors ${
                          muted
                            ? "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink-dim)]"
                            : "border-[var(--color-aegis)] bg-[var(--color-aegis)]/15 text-[var(--color-aegis)]"
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            muted
                              ? "bg-current"
                              : "animate-pulse-dot bg-current"
                          }`}
                        />
                        {muted ? "Unmute to speak" : "You have the floor"}
                      </button>

                      <p className="text-[12px] text-[var(--color-ink-faint)]">
                        {muted
                          ? "Aegis can be heard by both parties. Unmute when it is your turn."
                          : "Mute when you finish so the other party can answer."}
                        {!remoteMuted &&
                          muted &&
                          " · The other party is speaking."}
                      </p>

                      <button
                        onClick={disconnect}
                        className="rounded-lg border border-[var(--color-halt)]/50 bg-[var(--color-halt)]/10 px-5 py-2.5 text-[15px] font-semibold text-[var(--color-halt)] transition-colors hover:bg-[var(--color-halt)]/20"
                      >
                        End session
                      </button>
                    </div>
                  ) : (
                    <PrimaryButton
                      onClick={connect}
                      disabled={state === "connecting" || !canStartVoice}
                      className="px-6"
                    >
                      {state === "connecting"
                        ? "Connecting…"
                        : selfRole === "SELLER" && !proposalReady
                          ? "Begin private seller intake"
                          : selfRole === "BUYER" && !proposalReady
                            ? "Waiting for seller proposal"
                            : "Join mediated negotiation"}
                    </PrimaryButton>
                  )}
                </div>
              </Panel>

              {/* transcript */}
              <Panel className="min-h-[230px] p-5">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel>Live transcript</SectionLabel>
                  <span className="tnum text-[11px] text-[var(--color-ink-faint)]">
                    {feed.length ? `${feed.length} events` : "Awaiting audio"}
                  </span>
                </div>
                <div
                  ref={feedRef}
                  className="mt-4 max-h-80 space-y-3 overflow-y-auto border-t border-[var(--color-line)] pt-3 pr-1"
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
                          {u.speaker === "AEGIS"
                            ? "AEGIS"
                            : (u.label ?? "PARTY").toUpperCase()}
                        </span>
                        <p className="text-[14px] leading-relaxed text-[var(--color-ink)]">
                          {u.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </>
          )}

          <NegotiationReplay feed={feed} risks={risks} />
        </div>

        {/* ================= right: forensics + contract ================= */}
        <aside className="min-w-0 space-y-4">
          <ProtectionIndex
            terms={terms}
            riskScore={riskScore}
            speakers={speakers}
            challenges={challenges}
            hasContract={Boolean(contract)}
          />

          <CounterpartyRisk profileId={counterpartyId} />

          <LiveTerms terms={terms} locked={Boolean(contract)} />

          <ClauseHardener terms={terms} />

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
        </aside>
      </div>
    </main>
  );
}
