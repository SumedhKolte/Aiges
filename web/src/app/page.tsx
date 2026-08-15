import Link from "next/link";
import { AegisLogo, AegisMark } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";

const PILLARS = [
  {
    title: "Voice escrow",
    body: "Both parties talk. Aegis listens, extracts the item, the price, and the release condition, reads them back, and locks the funds only after it hears both people agree.",
    figure: "3 terms",
    figureLabel: "extracted from speech",
  },
  {
    title: "Deception forensics",
    body: "Off-platform payment requests, late price changes, and manufactured urgency are scored as they are spoken. Past a threshold, Aegis interrupts and refuses to lock anything.",
    figure: "6 patterns",
    figureLabel: "monitored live",
  },
  {
    title: "Verified delivery",
    body: "The seller submits visual proof. A vision model checks it against the exact wording of the release condition before a single cent moves.",
    figure: "1 checkpoint",
    figureLabel: "before payout",
  },
];

const STEPS = [
  ["Open a room", "Share a six-character code with the other party."],
  ["Negotiate out loud", "Aegis notarises the terms as you speak them."],
  ["Prove you are live", "A randomised phrase defeats cloned voices."],
  ["Deliver and get paid", "Vision verifies the work; the ledger settles."],
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-5xl px-5">
      <header className="flex items-center justify-between py-6">
        <AegisLogo size={26} />
        <Link
          href={user ? "/dashboard" : "/login"}
          className="rounded-lg border border-[var(--color-line-bright)] px-3.5 py-2 text-[14px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-panel-2)]"
        >
          {user ? "Open dashboard" : "Sign in"}
        </Link>
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="py-16 sm:py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] text-[var(--color-ink-dim)]">
          <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--color-aegis)]" />
          Autonomous voice arbitration
        </div>

        <h1 className="mt-6 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
          The escrow agent that{" "}
          <span className="text-[var(--color-aegis)]">listens</span> to the deal
          being made.
        </h1>

        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[var(--color-ink-dim)]">
          Peer-to-peer work runs on trust that nobody verifies. Aegis sits in
          the call as a neutral third party: it drafts the contract from what
          you actually said, holds the money, catches the manipulation, and
          checks the work before it pays.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href={user ? "/dashboard" : "/login"}
            className="rounded-lg bg-[var(--color-aegis)] px-5 py-3 text-[15px] font-semibold text-[var(--color-void)] transition-opacity hover:opacity-90"
          >
            Start a negotiation
          </Link>
          <span className="text-[13px] text-[var(--color-ink-faint)]">
            Demonstration balance included
          </span>
        </div>
      </section>

      {/* ---------------- pillars ---------------- */}
      <section className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="panel flex flex-col p-5">
            <div className="tnum text-[26px] font-semibold text-[var(--color-aegis)]">
              {p.figure}
            </div>
            <div className="mt-0.5 text-[12px] tracking-wide text-[var(--color-ink-faint)]">
              {p.figureLabel}
            </div>
            <h3 className="mt-5 text-[15px] font-semibold text-[var(--color-ink)]">
              {p.title}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
              {p.body}
            </p>
          </div>
        ))}
      </section>

      {/* ---------------- the halt ---------------- */}
      <section className="mt-4">
        <div className="panel overflow-hidden">
          <div className="grid gap-8 p-7 sm:grid-cols-[1.1fr_1fr] sm:items-center">
            <div>
              <h3 className="text-[19px] font-semibold tracking-tight">
                A cloned voice cannot pass the entropy trap
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
                Before funds lock, Aegis issues a phrase no attacker could have
                prepared for. A person repeats it back without thinking. A
                synthesis pipeline has to transcribe, generate, and re-render on
                unseen text — and the delay gives it away.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-void)] p-4">
              <div className="text-[11px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
                Challenge issued
              </div>
              <p className="tnum mt-2 text-[15px] text-[var(--color-ink)]">
                The copper kettle counted nineteen umbrellas
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-3">
                <span className="text-[13px] text-[var(--color-ink-dim)]">
                  Response latency
                </span>
                <span className="tnum text-[15px] font-semibold text-[var(--color-signal)]">
                  610 ms
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[13px] text-[var(--color-ink-dim)]">
                  Phonetic match
                </span>
                <span className="tnum text-[15px] font-semibold text-[var(--color-signal)]">
                  97%
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="mt-16">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
          How a deal runs
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="panel p-4">
              <span className="tnum text-[12px] font-semibold text-[var(--color-aegis)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-[14px] font-semibold">{title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-20 flex flex-col items-center gap-3 border-t border-[var(--color-line)] py-10 text-center">
        <AegisMark size={22} />
        <p className="text-[13px] text-[var(--color-ink-faint)]">
          Aegis holds the funds so neither party has to trust the other.
        </p>
      </footer>
    </div>
  );
}
