import { Panel } from "@/components/ui";

export function PrototypeBoundary() {
  return (
    <Panel className="mt-4 border-[var(--color-line-bright)]/80 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-caution)]/40 bg-[var(--color-caution)]/10 text-[11px] font-bold text-[var(--color-caution)]">i</span>
        <p className="text-[12px] leading-relaxed text-[var(--color-ink-dim)]">
          <span className="font-semibold text-[var(--color-ink)]">Prototype boundary:</span> balances are demonstration funds. Voice, AI, and liveness signals support a decision; they are not legal advice, identity proof, or a guarantee against fraud.
        </p>
      </div>
    </Panel>
  );
}
