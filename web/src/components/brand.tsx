/**
 * The single Aegis logo.
 *
 * This is the only mark in the product. Every surface — nav, login, reel,
 * share page — renders `<AegisLogo />`. Do not create variants: one mark, one
 * tagline, used once per view.
 */

export function AegisMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="aegis-mark-g" x1="8" y1="4" x2="24" y2="29">
          <stop offset="0%" stopColor="var(--color-aegis)" />
          <stop offset="100%" stopColor="var(--color-aegis-deep)" />
        </linearGradient>
        <linearGradient id="aegis-mark-fill" x1="16" y1="3" x2="16" y2="29">
          <stop offset="0%" stopColor="#153a40" />
          <stop offset="100%" stopColor="#091319" />
        </linearGradient>
      </defs>
      {/* A deliberate, weighted shield that stays legible from nav size to hero size. */}
      <path
        d="M16 2.8 26.3 6.7v8c0 6.4-4.2 11.9-10.3 14.3C9.9 26.6 5.7 21.1 5.7 14.7v-8L16 2.8Z"
        fill="url(#aegis-mark-fill)"
        stroke="url(#aegis-mark-g)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* The closed chevron is both the lock seal and the product's trust signal. */}
      <path
        d="m10.8 15.1 5.2 5 5.2-6.7"
        stroke="#8df4e8"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AegisLogo({
  size = 28,
  showTagline = false,
}: {
  size?: number;
  showTagline?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <AegisMark size={size} />
      <span className="leading-none">
        <span
          className="block font-semibold tracking-[-0.035em] text-[var(--color-ink)]"
          style={{ fontSize: size * 0.62 }}
        >
          Aegis
        </span>
        {showTagline && (
          <span className="mt-1 block text-[11px] font-medium tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
            Trust Engine
          </span>
        )}
      </span>
    </span>
  );
}
