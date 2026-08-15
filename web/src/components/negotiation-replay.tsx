"use client";

import { useMemo, useState } from "react";
import { GhostButton, Panel, SectionLabel } from "@/components/ui";

type ReplayMessage = { id: string; speaker: "AEGIS" | "PARTY"; text: string; at: number };
type ReplayRisk = { id: string; level: string; category: string; rationale: string; created_at: string };

function titleCase(value: string) {
  return value.toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

/** A compact, replayable story of what happened before money moved. */
export function NegotiationReplay({ feed, risks }: { feed: ReplayMessage[]; risks: ReplayRisk[] }) {
  const [open, setOpen] = useState(false);
  const events = useMemo(() => [
    ...feed.map((message) => ({
      id: `message-${message.id}`,
      at: message.at,
      kind: message.speaker === "AEGIS" ? "AEGIS" : "PARTY",
      title: message.speaker === "AEGIS" ? "Aegis response" : "Party statement",
      detail: message.text,
      tone: message.speaker === "AEGIS" ? "var(--color-aegis)" : "var(--color-line-bright)",
    })),
    ...risks.map((risk) => ({
      id: `risk-${risk.id}`,
      at: new Date(risk.created_at).getTime(),
      kind: "RISK",
      title: `${risk.level} · ${titleCase(risk.category)}`,
      detail: risk.rationale,
      tone: risk.level === "CRITICAL" || risk.level === "HIGH" ? "var(--color-halt)" : "var(--color-caution)",
    })),
  ].sort((a, b) => a.at - b.at).slice(-12), [feed, risks]);

  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionLabel>Negotiation replay</SectionLabel>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink-dim)]">
            The conversation, risk interventions, and decision trail in one view.
          </p>
        </div>
        <GhostButton onClick={() => setOpen((value) => !value)} className="px-3 py-2 text-[12px]">
          {open ? "Hide" : `Replay ${events.length || "—"}`}
        </GhostButton>
      </div>

      {open && (
        <div className="mt-4 max-h-80 space-y-3 overflow-y-auto border-l border-[var(--color-line)] pl-4">
          {events.length === 0 ? (
            <p className="py-4 text-[13px] text-[var(--color-ink-faint)]">Start the conversation to create a replay.</p>
          ) : events.map((event) => (
            <div key={event.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-panel)]" style={{ background: event.tone }} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--color-ink)]">{event.title}</span>
                <span className="tnum text-[10px] text-[var(--color-ink-faint)]">{event.at ? new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-dim)]">{event.detail}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
