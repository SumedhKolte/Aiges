import { Panel, SectionLabel } from "@/components/ui";

type ProtectionStackProps = {
  contractCount: number;
  settledCount: number;
  hasWallet: boolean;
};

const LAYERS = [
  {
    number: "01",
    label: "Voice presence",
    detail: "Two live speakers + an unseen phrase",
    color: "var(--color-aegis)",
  },
  {
    number: "02",
    label: "Deal clarity",
    detail: "Item, price, and release condition captured",
    color: "#8d9bff",
  },
  {
    number: "03",
    label: "Delivery proof",
    detail: "Vision checks the work before payout",
    color: "var(--color-signal)",
  },
  {
    number: "04",
    label: "Audit trail",
    detail: "Every movement recorded in the ledger",
    color: "var(--color-caution)",
  },
];

/** A quick, judge-friendly explanation of what makes a deal protected. */
export function ProtectionStack({
  contractCount,
  settledCount,
  hasWallet,
}: ProtectionStackProps) {
  return (
    <Panel className="mt-4 overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Protection stack</SectionLabel>
          <h2 className="mt-2 text-[19px] font-semibold tracking-tight">
            Trust is a workflow, not a promise.
          </h2>
        </div>
        <div className="rounded-full border border-[var(--color-aegis)]/30 bg-[var(--color-aegis)]/8 px-3 py-1.5 text-[11px] font-semibold text-[var(--color-aegis)]">
          {hasWallet ? "Ready for a protected deal" : "Wallet setup pending"}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-4">
        {LAYERS.map((layer, index) => (
          <div
            key={layer.number}
            className="group relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-void)] p-4 transition-colors hover:border-[var(--color-line-bright)]"
          >
            <div
              className="absolute inset-x-0 top-0 h-px opacity-80"
              style={{ background: layer.color }}
            />
            <div className="flex items-center justify-between">
              <span className="tnum text-[11px] font-semibold" style={{ color: layer.color }}>
                {layer.number}
              </span>
              <span className="text-[12px] text-[var(--color-signal)]">✓</span>
            </div>
            <p className="mt-4 text-[13px] font-semibold text-[var(--color-ink)]">
              {layer.label}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
              {layer.detail}
            </p>
            {index === 0 && (
              <p className="tnum mt-3 text-[11px] text-[var(--color-ink-faint)]">
                {contractCount} {contractCount === 1 ? "contract" : "contracts"} opened
              </p>
            )}
            {index === 3 && (
              <p className="tnum mt-3 text-[11px] text-[var(--color-ink-faint)]">
                {settledCount} {settledCount === 1 ? "deal" : "deals"} settled
              </p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
