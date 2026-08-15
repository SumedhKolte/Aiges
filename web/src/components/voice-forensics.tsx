"use client";

import { Panel, SectionLabel } from "@/components/ui";
import type { SpeakerReading } from "@/lib/voice-print";

export type Challenge = {
  id: string;
  phrase: string;
  latency_ms: number | null;
  phonetic_match: number | null;
  passed: boolean | null;
  verdict_note: string | null;
};

/** Where a synthesis pipeline starts to give itself away. */
const HUMAN_CEILING_MS = 4000;
const AXIS_MAX_MS = 8000;

/**
 * Deepfake latency graph.
 *
 * Plots each challenge response against the human reaction ceiling. The whole
 * Vocal Entropy Trap argument is a timing claim, and a timing claim is far more
 * convincing as a picture than as a sentence.
 */
function LatencyGraph({ challenges }: { challenges: Challenge[] }) {
  const answered = challenges.filter((c) => c.latency_ms != null);
  const ceilingPct = (HUMAN_CEILING_MS / AXIS_MAX_MS) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] tracking-[0.12em] text-[var(--color-ink-faint)] uppercase">
          Response latency
        </span>
        <span className="tnum text-[11px] text-[var(--color-ink-faint)]">
          human ceiling {HUMAN_CEILING_MS} ms
        </span>
      </div>

      <div className="relative mt-3 h-24 rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] p-2">
        {/* the human/synthetic boundary */}
        <div
          className="absolute inset-y-2 border-r border-dashed border-[var(--color-caution)]/60"
          style={{ left: `${ceilingPct}%` }}
        />
        <div
          className="absolute top-1 text-[9px] tracking-wider text-[var(--color-caution)]"
          style={{ left: `calc(${ceilingPct}% + 4px)` }}
        >
          SYNTHETIC
        </div>

        {answered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              No challenge issued yet.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center gap-2">
            {answered.slice(-4).map((c) => {
              const pct = Math.min(
                100,
                ((c.latency_ms ?? 0) / AXIS_MAX_MS) * 100,
              );
              const ok = c.passed;
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-line)]">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.max(3, pct)}%`,
                        background: ok
                          ? "var(--color-signal)"
                          : "var(--color-halt)",
                      }}
                    />
                  </div>
                  <span
                    className={`tnum w-16 shrink-0 text-right text-[11px] font-semibold ${
                      ok
                        ? "text-[var(--color-signal)]"
                        : "text-[var(--color-halt)]"
                    }`}
                  >
                    {c.latency_ms} ms
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Two-speaker presence.
 *
 * Measured from the audio by pitch clustering, not inferred from the
 * transcript — so "one person agreeing twice" is caught by physics rather than
 * by taking the model's word for it.
 */
function SpeakerPresence({ speakers }: { speakers: SpeakerReading }) {
  const two = speakers.distinctSpeakers === 2;
  const one = speakers.distinctSpeakers === 1;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] tracking-[0.12em] text-[var(--color-ink-faint)] uppercase">
          Distinct voices
        </span>
        {speakers.samples > 0 && (
          <span className="tnum text-[11px] text-[var(--color-ink-faint)]">
            {speakers.samples} samples
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex gap-1.5">
          {[0, 1].map((i) => {
            const on = speakers.distinctSpeakers > i;
            return (
              <span
                key={i}
                className={`h-9 w-9 rounded-full border-2 transition-all duration-500 ${
                  on
                    ? "border-[var(--color-aegis)] bg-[var(--color-aegis)]/20"
                    : "border-[var(--color-line-bright)] bg-transparent"
                }`}
              />
            );
          })}
        </div>

        <div className="min-w-0">
          <p
            className={`text-[14px] font-semibold ${
              two
                ? "text-[var(--color-signal)]"
                : one
                  ? "text-[var(--color-caution)]"
                  : "text-[var(--color-ink-dim)]"
            }`}
          >
            {two
              ? "Two speakers confirmed"
              : one
                ? "Only one voice heard"
                : "Listening"}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-faint)]">
            {two
              ? `Separated at ${speakers.centroids.join(" and ")} hertz`
              : one
                ? "Both parties must speak before funds can lock"
                : "Pitch analysis begins once someone talks"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function VoiceForensics({
  speakers,
  challenges,
}: {
  speakers: SpeakerReading;
  challenges: Challenge[];
}) {
  return (
    <Panel className="space-y-5 p-5">
      <SectionLabel>Voice forensics</SectionLabel>
      <SpeakerPresence speakers={speakers} />
      <div className="border-t border-[var(--color-line)] pt-4">
        <LatencyGraph challenges={challenges} />
      </div>
    </Panel>
  );
}
