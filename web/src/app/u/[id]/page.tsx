import Link from "next/link";
import { notFound } from "next/navigation";
import { AegisLogo, AegisMark } from "@/components/brand";
import { Panel, SectionLabel } from "@/components/ui";

export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Passport = {
  name: string;
  trust_score: number;
  deals_closed: number;
  volume_usd: string;
  member_since: string | null;
  reels: {
    share_slug: string;
    headline: string;
    amount: string | null;
    created_at: string;
  }[];
};

export default async function PassportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetch(`${API}/reels/passport/${id}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) notFound();

  const p: Passport = await res.json();
  const since = p.member_since
    ? new Date(p.member_since).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex justify-center">
        <AegisLogo size={26} />
      </div>

      {/* ---------------- identity ---------------- */}
      <div className="mt-10 flex flex-col items-center text-center">
        <AegisMark size={46} />
        <h1 className="mt-5 text-[30px] font-semibold tracking-tight">
          {p.name}
        </h1>
        <p className="mt-1.5 text-[14px] text-[var(--color-ink-dim)]">
          Trust Passport{since ? ` · trading since ${since}` : ""}
        </p>
      </div>

      {/* ---------------- the numbers ---------------- */}
      <section className="mt-9 grid gap-4 sm:grid-cols-3">
        <Panel className="p-5 text-center">
          <SectionLabel>Trust score</SectionLabel>
          <div className="tnum mt-3 text-4xl font-semibold text-[var(--color-aegis)]">
            {p.trust_score}
          </div>
        </Panel>
        <Panel className="p-5 text-center">
          <SectionLabel>Deals settled</SectionLabel>
          <div className="tnum mt-3 text-4xl font-semibold">
            {p.deals_closed}
          </div>
        </Panel>
        <Panel className="p-5 text-center">
          <SectionLabel>Volume escrowed</SectionLabel>
          <div className="tnum mt-3 text-4xl font-semibold">
            ${p.volume_usd}
          </div>
        </Panel>
      </section>

      <p className="mt-5 text-center text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
        Every figure on this page is derived from settled escrow contracts, not
        from self-reported claims.
      </p>

      {/* ---------------- verified deals ---------------- */}
      <section className="mt-10">
        <SectionLabel>Verified deals</SectionLabel>
        <div className="mt-4 space-y-2.5">
          {p.reels.length === 0 ? (
            <Panel className="px-6 py-12 text-center">
              <p className="text-[14px] text-[var(--color-ink-dim)]">
                No completed deals published yet.
              </p>
            </Panel>
          ) : (
            p.reels.map((r) => (
              <Link
                key={r.share_slug}
                href={`/reel/${r.share_slug}`}
                className="panel flex items-center justify-between gap-4 p-4 transition-colors hover:border-[var(--color-line-bright)]"
              >
                <p className="min-w-0 truncate text-[15px] text-[var(--color-ink)]">
                  {r.headline}
                </p>
                {r.amount && (
                  <span className="tnum shrink-0 text-[15px] font-semibold text-[var(--color-signal)]">
                    {r.amount}
                  </span>
                )}
              </Link>
            ))
          )}
        </div>
      </section>

      <footer className="mt-14 border-t border-[var(--color-line)] pt-8 text-center">
        <p className="text-[13px] text-[var(--color-ink-faint)]">
          Aegis holds the funds so neither party has to trust the other.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg border border-[var(--color-line-bright)] px-4 py-2 text-[14px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-panel-2)]"
        >
          Start your own negotiation
        </Link>
      </footer>
    </main>
  );
}
