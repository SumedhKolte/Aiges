"use client";

import { Panel, SectionLabel } from "@/components/ui";
import type { DraftTerms } from "@/components/live-terms";
import type { Challenge } from "@/components/voice-forensics";
import type { SpeakerReading } from "@/lib/voice-print";

type ProtectionIndexProps = {
  terms: DraftTerms | null;
  riskScore: number;
  speakers: SpeakerReading;
  challenges: Challenge[];
  hasContract: boolean;
};

function scoreLabel(score: number) {
  if (score >= 85) return { label: "Protected", tone: "var(--color-signal)" };
  if (score >= 60) return { label: "Building", tone: "var(--color-aegis)" };
  if (score >= 35) return { label: "Needs signals", tone: "var(--color-caution)" };
  return { label: "Unprotected", tone: "var(--color-halt)" };
}

/** Converts Aegis's raw live signals into one legible judge-facing readout. */
export function ProtectionIndex({
  terms,
  riskScore,
  speakers,
  challenges,
  hasContract,
}: ProtectionIndexProps) {
  const captured = [
    terms?.draft_item,
    terms?.draft_price_cents,
    terms?.draft_condition,
  ].filter((value) => value != null && value !== "").length;
  const passedChallenge = challenges.some((challenge) => challenge.passed === true);

  const signals = [
    {
      label: "Deal clarity",
      value: hasContract ? 100 : Math.round((captured / 3) * 100),
      detail: hasContract ? "Terms sealed" : `${captured} of 3 terms heard`,
      tone: "var(--color-aegis)",
    },
    {
      label: "Two-party presence",
      value: speakers.distinctSpeakers === 2 ? 100 : speakers.distinctSpeakers === 1 ? 45 : 0,
      detail:
        speakers.distinctSpeakers === 2
          ? "Distinct voices confirmed"
          : speakers.distinctSpeakers === 1
            ? "One voice so far"
            : "Waiting for speech",
      tone: "#8d9bff",
    },
    {
      label: "Voice authenticity",
      value: passedChallenge ? 100 : challenges.length > 0 ? 35 : 0,
      detail: passedChallenge ? "Entropy challenge passed" : "Challenge not passed",
      tone: "var(--color-signal)",
    },
    {
      label: "Negotiation safety",
      value: Math.max(0, 100 - riskScore),
      detail: riskScore === 0 ? "No risk flags" : `${riskScore} risk score`,
      tone: riskScore >= 70 ? "var(--color-halt)" : "var(--color-caution)",
    },
  ];
  const score = Math.round(signals.reduce((sum, signal) => sum + signal.value, 0) / signals.length);
  const status = scoreLabel(score);

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Protection index</SectionLabel>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
            A live readout of the evidence Aegis has before money can move.
          </p>
        </div>
        <div className="text-right">
          <div className="tnum text-[28px] font-semibold" style={{ color: status.tone }}>
            {score}
          </div>
          <div className="text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: status.tone }}>
            {status.label}
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-line)]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: status.tone }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
        {signals.map((signal) => (
          <div key={signal.label}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-[var(--color-ink)]">{signal.label}</span>
              <span className="tnum text-[11px]" style={{ color: signal.tone }}>{signal.value}%</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${signal.value}%`, background: signal.tone }} />
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">{signal.detail}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
