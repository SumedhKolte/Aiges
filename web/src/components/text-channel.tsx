"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, SectionLabel } from "@/components/ui";

export type ChannelMessage = {
  id: string;
  speaker: "AEGIS" | "PARTY";
  text: string;
  at: number;
  /** "BUYER" / "SELLER" once the speaker is known. */
  label?: string;
};

const MAX_LENGTH = 600;

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The negotiation, typed.
 *
 * Everything here lands in the same transcript the call writes to, so a room
 * can be argued in text, in voice, or in both, and still produce one record.
 */
export function TextChannel({
  feed,
  selfRole,
  onSend,
  thinking,
  error,
  liveVoice,
  bothSeated,
}: {
  feed: ChannelMessage[];
  /** The caller's own seat, or null for an observer, who may read only. */
  selfRole: "BUYER" | "SELLER" | null;
  onSend: (text: string) => Promise<void>;
  thinking: boolean;
  error: string | null;
  liveVoice: boolean;
  bothSeated: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [feed.length, thinking]);

  const canSend = Boolean(selfRole) && !sending && draft.trim().length > 0;

  async function submit() {
    if (!canSend) return;
    const text = draft.trim();
    setSending(true);
    setDraft("");
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <Panel className="flex min-h-[430px] flex-col p-0">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
        <div>
          <SectionLabel>Text channel</SectionLabel>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
            {liveVoice
              ? "A voice session is live — what you type is read out into it."
              : "Aegis chairs the negotiation here exactly as it does on a call."}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${
            thinking
              ? "border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10 text-[var(--color-aegis)]"
              : "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink-dim)]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              thinking
                ? "animate-pulse-dot bg-current"
                : "bg-[var(--color-ink-faint)]"
            }`}
          />
          {thinking ? "Aegis replying" : "Aegis listening"}
        </span>
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        style={{ maxHeight: 420 }}
      >
        {feed.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <p className="text-[14px] text-[var(--color-ink-dim)]">
              Nothing said yet.
            </p>
            <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
              {bothSeated
                ? "Open with what you want and what you are willing to pay. Aegis takes it from there."
                : "You can start setting out your side now — Aegis will hold the deal open until the other party arrives."}
            </p>
          </div>
        ) : (
          feed.map((message) => {
            const aegis = message.speaker === "AEGIS";
            const mine =
              !aegis &&
              Boolean(selfRole) &&
              message.label?.toUpperCase() === selfRole;
            return (
              <div
                key={message.id}
                className={`animate-rise flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 px-1 pb-1">
                  <span
                    className={`text-[10px] font-semibold tracking-wider uppercase ${
                      aegis
                        ? "text-[var(--color-aegis)]"
                        : mine
                          ? "text-[var(--color-signal)]"
                          : "text-[var(--color-ink-faint)]"
                    }`}
                  >
                    {aegis
                      ? "Aegis"
                      : mine
                        ? "You"
                        : (message.label ?? "Party")}
                  </span>
                  <span className="tnum text-[10px] text-[var(--color-ink-faint)]">
                    {clock(message.at)}
                  </span>
                </div>
                <p
                  className={`max-w-[85%] rounded-xl border px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
                    aegis
                      ? "border-[var(--color-aegis)]/30 bg-[var(--color-aegis)]/10 text-[var(--color-ink)]"
                      : mine
                        ? "border-[var(--color-signal)]/30 bg-[var(--color-signal)]/10 text-[var(--color-ink)]"
                        : "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink)]"
                  }`}
                >
                  {message.text}
                </p>
              </div>
            );
          })
        )}

        {thinking && (
          <div className="animate-rise flex items-center gap-2 px-1">
            <span className="text-[10px] font-semibold tracking-wider text-[var(--color-aegis)] uppercase">
              Aegis
            </span>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--color-aegis)]"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="mx-5 mb-3 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2 text-[13px] text-[var(--color-halt)]">
          {error}
        </p>
      )}

      <div className="border-t border-[var(--color-line)] px-5 py-4">
        {selfRole ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — the convention
                  // every messaging app has already taught these users.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={2}
                placeholder={`Type as the ${selfRole.toLowerCase()}…`}
                aria-label="Message the negotiation"
                className="min-h-[46px] flex-1 resize-none rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-void)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-aegis)]/60 focus:outline-none"
              />
              <button
                onClick={() => void submit()}
                disabled={!canSend}
                className="shrink-0 rounded-lg border border-[var(--color-aegis)] bg-[var(--color-aegis)]/15 px-4 py-2.5 text-[14px] font-semibold text-[var(--color-aegis)] transition-colors hover:bg-[var(--color-aegis)]/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            <p className="mt-2 text-[12px] text-[var(--color-ink-faint)]">
              Enter sends · Shift + Enter for a new line. Everything typed here
              is part of the record Aegis arbitrates on.
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
            You are observing this room. Take the Buyer or Seller seat above to
            join the negotiation.
          </p>
        )}
      </div>
    </Panel>
  );
}
