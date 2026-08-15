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
          className="rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-panel)]/70 px-3.5 py-2 text-[14px] font-medium text-[var(--color-ink)] transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-[var(--color-panel-2)]"
        >
          {user ? "Open dashboard" : "Sign in"}
        </Link>
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.72fr)] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-aegis)]/25 bg-[var(--color-aegis)]/8 px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-[var(--color-aegis)] uppercase">
            <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
            Autonomous voice arbitration
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl leading-[1.04] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
            The escrow agent that{" "}
            <span className="text-[var(--color-aegis)]">listens</span> to the deal
            being made.
          </h1>

          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[var(--color-ink-dim)]">
            Peer-to-peer work runs on trust that nobody verifies. Aegis joins
            the call as a neutral third party: it drafts the contract from what
            you said, holds the money, catches manipulation, and checks the
            work before it pays.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--color-aegis)] bg-[linear-gradient(135deg,var(--color-aegis),#21b9aa)] px-5 py-3 text-[15px] font-semibold text-[var(--color-void)] shadow-[0_8px_20px_rgb(20_201_184_/_0.16)] transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-px hover:opacity-95"
            >
              Start a negotiation
            </Link>
            <span className="text-[13px] text-[var(--color-ink-faint)]">
              Demonstration balance included
            </span>
          </div>

          <div className="mt-10 grid max-w-xl grid-cols-3 border-t border-[var(--color-line)] pt-5">
            <div>
              <div className="tnum text-[18px] font-semibold text-[var(--color-ink)]">Live</div>
              <div className="mt-1 text-[11px] tracking-wide text-[var(--color-ink-faint)] uppercase">Term capture</div>
            </div>
            <div className="border-x border-[var(--color-line)] px-5">
              <div className="tnum text-[18px] font-semibold text-[var(--color-ink)]">3-stage</div>
              <div className="mt-1 text-[11px] tracking-wide text-[var(--color-ink-faint)] uppercase">Verification</div>
            </div>
            <div className="pl-5">
              <div className="tnum text-[18px] font-semibold text-[var(--color-ink)]">24 / 7</div>
              <div className="mt-1 text-[11px] tracking-wide text-[var(--color-ink-faint)] uppercase">Risk watch</div>
            </div>
          </div>
        </div>

        <aside className="animate-rise panel relative overflow-hidden p-5 sm:p-6">
          <div className="absolute -top-24 -right-16 h-48 w-48 rounded-full bg-[var(--color-aegis)]/12 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">Escrow protocol</p>
              <p className="mt-1 text-[14px] text-[var(--color-ink-dim)]">A protected deal, in progress</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-signal)]/35 bg-[var(--color-signal)]/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--color-signal)] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              Secured
            </span>
          </div>

          <div className="relative mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-void)]/75 p-4 shadow-inner">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] tracking-[0.13em] text-[var(--color-ink-faint)] uppercase">Funds held</p>
                <p className="tnum mt-1 text-3xl font-semibold tracking-tight">$2,400<span className="opacity-45">.00</span></p>
              </div>
              <div className="rounded-lg border border-[var(--color-aegis)]/25 bg-[var(--color-aegis)]/8 px-2.5 py-1.5 text-right">
                <p className="text-[9px] tracking-[0.12em] text-[var(--color-aegis)] uppercase">Confidence</p>
                <p className="tnum mt-0.5 text-[15px] font-semibold text-[var(--color-aegis)]">98%</p>
              </div>
            </div>
            <div className="mt-5 h-px bg-[var(--color-line)]" />
            <p className="mt-4 text-[11px] tracking-[0.12em] text-[var(--color-ink-faint)] uppercase">Release condition</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-ink)]">Final website delivered and approved by the buyer.</p>
          </div>

          <div className="relative mt-5 space-y-3">
            {[
              ["Terms captured", "Both parties confirmed", "complete"],
              ["Voice presence verified", "Entropy challenge passed", "complete"],
              ["Delivery review", "Awaiting submitted proof", "pending"],
            ].map(([label, detail, state], index) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${state === "complete" ? "border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10 text-[var(--color-aegis)]" : "border-[var(--color-line-bright)] bg-[var(--color-panel-2)] text-[var(--color-ink-faint)]"}`}>
                  {state === "complete" ? "✓" : String(index + 1)}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-ink)]">{label}</p>
                  <p className="text-[11px] text-[var(--color-ink-faint)]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {/* ---------------- pillars ---------------- */}
      <section className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="panel group flex flex-col p-5">
            <div className="h-px w-9 bg-[var(--color-aegis)]/60 transition-[width] duration-200 group-hover:w-14" />
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
