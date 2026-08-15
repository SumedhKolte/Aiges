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
      className="shrink-0"
    >
      <defs>
        <linearGradient id="aegis-mark-g" x1="16" y1="2" x2="16" y2="30">
          <stop offset="0%" stopColor="var(--color-aegis)" />
          <stop offset="100%" stopColor="var(--color-aegis-deep)" />
        </linearGradient>
      </defs>
      {/* shield */}
      <path
        d="M16 2.5 27 6.6v8.2c0 6.6-4.4 12.3-11 14.7-6.6-2.4-11-8.1-11-14.7V6.6L16 2.5Z"
        fill="url(#aegis-mark-g)"
        fillOpacity="0.16"
        stroke="url(#aegis-mark-g)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* the seal: an inward chevron, i.e. a lock that has closed */}
      <path
        d="M11 15.4 16 20l5-6.4"
        stroke="var(--color-aegis)"
        strokeWidth="2.1"
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
          className="block font-semibold tracking-tight text-[var(--color-ink)]"
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
