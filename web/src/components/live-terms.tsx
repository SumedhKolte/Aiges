"use client";

import { Money, Panel, SectionLabel } from "@/components/ui";

export type DraftTerms = {
  draft_item: string | null;
  draft_price_cents: number | null;
  draft_condition: string | null;
  draft_confidence: number | null;
};

function Slot({
  label,
  filled,
  children,
  placeholder,
}: {
  label: string;
  filled: boolean;
  children?: React.ReactNode;
  placeholder: string;
}) {
  return (
    <div className="relative pl-6">
      {/* the rail dot: hollow while listening, solid once captured */}
      <span
        className={`absolute top-1.5 left-0 h-3 w-3 rounded-full border-2 transition-all duration-500 ${
          filled
            ? "border-[var(--color-aegis)] bg-[var(--color-aegis)]"
            : "animate-pulse-dot border-[var(--color-line-bright)] bg-transparent"
        }`}
      />
      <div className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
        {label}
      </div>
      {filled ? (
        <div className="animate-rise mt-1">{children}</div>
      ) : (
        <div className="mt-1.5 h-3.5 w-3/4 overflow-hidden rounded-full bg-[var(--color-line)]">
          <div
            className="h-full w-1/3 rounded-full bg-[var(--color-line-bright)]"
            style={{ animation: "aegis-sweep 1.8s ease-in-out infinite" }}
          />
          <span className="sr-only">{placeholder}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The negotiation assembling itself in real time.
 *
 * Aegis publishes each term the moment it is confident, so both parties watch
 * the contract build while they are still talking — and catch a misheard price
 * before any money is committed rather than after.
 */
export function LiveTerms({
  terms,
  locked,
}: {
  terms: DraftTerms | null;
  locked: boolean;
}) {
  const item = terms?.draft_item ?? null;
  const price = terms?.draft_price_cents ?? null;
  const condition = terms?.draft_condition ?? null;

  const captured = [item, price, condition].filter(Boolean).length;
  const confidence = terms?.draft_confidence ?? null;

  return (
    <Panel className="p-5">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Terms heard</SectionLabel>
        <span className="tnum text-[13px] text-[var(--color-ink-faint)]">
          {captured} of 3
        </span>
      </div>

      <div className="mt-4 space-y-4 border-l border-[var(--color-line)] pl-1">
        <Slot label="Item" filled={Boolean(item)} placeholder="Listening for the item">
          <p className="text-[14px] leading-snug text-[var(--color-ink)]">{item}</p>
        </Slot>

        <Slot label="Price" filled={price != null} placeholder="Listening for a price">
          <Money cents={price ?? 0} size="md" />
        </Slot>

        <Slot
          label="Releases when"
          filled={Boolean(condition)}
          placeholder="Listening for a release condition"
        >
          <p className="text-[14px] leading-snug text-[var(--color-ink)]">
            {condition}
          </p>
        </Slot>
      </div>

      {captured === 3 && !locked && (
        <div className="animate-rise mt-4 rounded-lg border border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10 px-3 py-2.5">
          <p className="text-[13px] leading-relaxed text-[var(--color-aegis)]">
            All three terms captured
            {confidence != null && (
              <span className="tnum"> at {Math.round(confidence * 100)}% confidence</span>
            )}
            . Aegis will read them back and ask both parties to agree.
          </p>
        </div>
      )}

      {captured === 0 && (
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
          Start talking. Aegis fills these in as it hears them, so a misheard
          price surfaces before any money is committed.
        </p>
      )}
    </Panel>
  );
}
