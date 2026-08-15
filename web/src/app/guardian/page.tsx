import { redirect } from "next/navigation";
import { GuardianConsole } from "@/components/guardian-console";
import { TopNav } from "@/components/top-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GuardianPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <>
      <TopNav
        name={profile?.name ?? "Trader"}
        back={{ href: "/dashboard", label: "Dashboard" }}
      />

      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-aegis)]/25 bg-[var(--color-aegis)]/8 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--color-aegis)] uppercase">
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
            Guardian
          </div>
          <h1 className="mt-3 text-[26px] font-semibold tracking-tight">
            Already negotiating somewhere else?
          </h1>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
            Paste the conversation from Fiverr, Upwork, Discord or anywhere
            else. Aegis runs the same six-pattern fraud analysis it uses in a
            live call, pulls out the deal, and turns it into real escrow — no
            voice room needed, and the other party does not need an account yet.
          </p>
        </div>

        <div className="mt-7">
          <GuardianConsole siteUrl={siteUrl} />
        </div>
      </main>
    </>
  );
}
