"use client";

import { useState } from "react";
import { GhostButton, Panel } from "@/components/ui";

const STEPS = [
  ["Name the deliverable", "Say exactly what the other party will receive."],
  ["Set the price", "Aegis will repeat the amount before anything locks."],
  ["Define proof", "Describe what visible evidence means the work is done."],
] as const;

export function DealBrief({ title, role }: { title: string; role: string }) {
  const [copied, setCopied] = useState(false);
  const cleanTitle = title.trim() || "the project";
  const starter = `I am the ${role.toLowerCase()}. The deal is ${cleanTitle.toLowerCase()}. Let's agree on the price and the proof needed to release the funds.`;

  async function copyStarter() {
    await navigator.clipboard.writeText(starter);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Panel className="animate-rise mt-5 overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#8d9bff]/30 bg-[#8d9bff]/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-[#aeb7ff] uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            60-second deal brief
          </div>
          <h2 className="mt-3 text-[19px] font-semibold tracking-tight">
            Get to a clean agreement faster.
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
            A shared checklist keeps the conversation useful and gives Aegis the
            three signals it needs to protect both parties.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3 py-2 text-right">
          <p className="text-[10px] tracking-[0.12em] text-[var(--color-ink-faint)] uppercase">Your role</p>
          <p className="mt-0.5 text-[13px] font-semibold text-[var(--color-aegis)]">{role}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2.5 md:grid-cols-3">
        {STEPS.map(([label, detail], index) => (
          <div key={label} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-void)] p-3.5">
            <div className="flex items-center gap-2">
              <span className="tnum flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-aegis)]/35 bg-[var(--color-aegis)]/10 text-[10px] font-semibold text-[var(--color-aegis)]">
                {index + 1}
              </span>
              <p className="text-[13px] font-semibold text-[var(--color-ink)]">{label}</p>
            </div>
            <p className="mt-2 pl-8 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--color-aegis)]/25 bg-[var(--color-aegis)]/6 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-[var(--color-aegis)] uppercase">Suggested opening</p>
          <p className="mt-1 truncate text-[13px] text-[var(--color-ink)]">“{starter}”</p>
        </div>
        <GhostButton onClick={copyStarter} className="shrink-0 px-3 py-2 text-[12px]">
          {copied ? "Copied" : "Copy opening"}
        </GhostButton>
      </div>
    </Panel>
  );
}
