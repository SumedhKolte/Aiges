import Link from "next/link";
import { notFound } from "next/navigation";
import { AegisLogo, AegisMark } from "@/components/brand";
import { InviteAccept } from "@/components/invite-accept";
import { Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Invite = {
  item_description: string;
  price_usd: string;
  release_condition: string;
  your_role: "BUYER" | "SELLER";
  from_name: string;
  from_trust_score: number;
  from_deals_closed: number;
  accepted: boolean;
  expires_at: string;
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const res = await fetch(`${API}/guardian/invite/${token}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) notFound();

  const invite: Invite = await res.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const expired = new Date(invite.expires_at) < new Date();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <div className="flex justify-center">
        <AegisLogo size={28} />
      </div>

      <Panel className="animate-rise mt-8 p-6">
        <div className="flex flex-col items-center text-center">
          <AegisMark size={40} />
          <p className="mt-4 text-[15px] text-[var(--color-ink-dim)]">
            <span className="font-semibold text-[var(--color-ink)]">
              {invite.from_name}
            </span>{" "}
            wants to protect this deal with Aegis
          </p>
          <p className="tnum mt-1 text-[12px] text-[var(--color-ink-faint)]">
            Trust score {invite.from_trust_score} · {invite.from_deals_closed}{" "}
            deal{invite.from_deals_closed === 1 ? "" : "s"} settled
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-void)] p-4">
          <div className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
            Amount held in escrow
          </div>
          <div className="tnum mt-1 text-4xl font-semibold">
            ${invite.price_usd.split(".")[0]}
            <span className="opacity-55">.{invite.price_usd.split(".")[1]}</span>
          </div>
        </div>

        <dl className="mt-4 space-y-3.5">
          <div>
            <dt className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
              Item
            </dt>
            <dd className="mt-1 text-[15px] leading-relaxed">
              {invite.item_description}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
              Funds release when
            </dt>
            <dd className="mt-1 text-[15px] leading-relaxed">
              {invite.release_condition}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
              Your side
            </dt>
            <dd className="mt-1 text-[15px]">
              You are the {invite.your_role === "BUYER" ? "buyer" : "seller"}
            </dd>
          </div>
        </dl>

        {invite.accepted ? (
          <p className="mt-6 rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-panel-2)] px-3 py-2.5 text-center text-[14px] text-[var(--color-ink-dim)]">
            This invitation has already been accepted.
          </p>
        ) : expired ? (
          <p className="mt-6 rounded-lg border border-[var(--color-caution)]/40 bg-[var(--color-caution)]/10 px-3 py-2.5 text-center text-[14px] text-[var(--color-caution)]">
            This invitation has expired.
          </p>
        ) : (
          <InviteAccept
            token={token}
            signedIn={Boolean(user)}
            yourRole={invite.your_role}
          />
        )}
      </Panel>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
        Aegis holds the funds so neither party has to trust the other.{" "}
        <Link href="/" className="text-[var(--color-aegis)] hover:underline">
          What is this?
        </Link>
      </p>
    </main>
  );
}
