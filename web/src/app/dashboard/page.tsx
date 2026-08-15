import Link from "next/link";
import { redirect } from "next/navigation";
import { RoomLauncher } from "@/components/room-launcher";
import { TopNav } from "@/components/top-nav";
import { EmptyState, Money, Panel, SectionLabel, StatusPill } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallet }, { data: contracts }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("name, trust_score, deals_closed, volume_cents")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("wallets")
        .select("available_cents, held_cents")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("contracts")
        .select(
          "id, item_description, price_cents, status, created_at, buyer_id, seller_id",
        )
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

  const name = profile?.name ?? "Trader";

  return (
    <>
      <TopNav name={name} />

      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-[26px] font-semibold tracking-tight">
          Welcome back, {name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-[15px] text-[var(--color-ink-dim)]">
          Open a room and negotiate out loud. Aegis will hold the money.
        </p>

        {/* ---------------- balances ---------------- */}
        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <Panel className="p-5">
            <SectionLabel>Available</SectionLabel>
            <div className="mt-3">
              <Money cents={wallet?.available_cents ?? 0} size="lg" />
            </div>
            <p className="mt-2 text-[13px] text-[var(--color-ink-faint)]">
              Ready to commit to a deal
            </p>
          </Panel>

          <Panel className="p-5">
            <SectionLabel>Held in escrow</SectionLabel>
            <div className="mt-3">
              <Money
                cents={wallet?.held_cents ?? 0}
                size="lg"
                tone={wallet?.held_cents ? "default" : "dim"}
              />
            </div>
            <p className="mt-2 text-[13px] text-[var(--color-ink-faint)]">
              Locked until a release condition is met
            </p>
          </Panel>

          <Panel className="p-5">
            <SectionLabel>Trust score</SectionLabel>
            <div className="tnum mt-3 text-4xl font-semibold text-[var(--color-aegis)]">
              {profile?.trust_score ?? 100}
            </div>
            <p className="mt-2 text-[13px] text-[var(--color-ink-faint)]">
              {profile?.deals_closed ?? 0} deal
              {profile?.deals_closed === 1 ? "" : "s"} settled ·{" "}
              <span className="tnum">
                ${((profile?.volume_cents ?? 0) / 100).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>{" "}
              lifetime
            </p>
            <Link
              href={`/u/${user.id}`}
              className="mt-3 inline-block text-[13px] font-medium text-[var(--color-aegis)] hover:underline"
            >
              View your public Trust Passport
            </Link>
          </Panel>
        </section>

        {/* ---------------- launcher + contracts ---------------- */}
        <section className="mt-4 grid gap-4 lg:grid-cols-[380px_1fr]">
          <RoomLauncher />

          <div>
            <SectionLabel>Your contracts</SectionLabel>
            <div className="mt-3 space-y-2.5">
              {!contracts?.length ? (
                <EmptyState
                  title="No contracts yet"
                  body="Open a room, invite the other party with the code, and negotiate. Aegis drafts the contract from what it hears."
                />
              ) : (
                contracts.map((c) => (
                  <Link
                    key={c.id}
                    href={`/contract/${c.id}`}
                    className="panel flex items-center justify-between gap-4 p-4 transition-colors hover:border-[var(--color-line-bright)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium text-[var(--color-ink)]">
                        {c.item_description}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-[13px] text-[var(--color-ink-faint)]">
                        <span>
                          {c.seller_id === user.id ? "Selling" : "Buying"}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{relativeTime(c.created_at)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <Money cents={c.price_cents} size="sm" />
                      <StatusPill status={c.status} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
