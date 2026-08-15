"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  GhostButton,
  Money,
  Panel,
  PrimaryButton,
  SectionLabel,
} from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SOURCES = [
  "FIVERR",
  "UPWORK",
  "DISCORD",
  "WHATSAPP",
  "TELEGRAM",
  "EMAIL",
  "OTHER",
] as const;

type Finding = {
  quote: string;
  category: string;
  severity: "INFO" | "ELEVATED" | "HIGH" | "CRITICAL";
  rationale: string;
};

type Scan = {
  id: string;
  risk_score: number;
  verdict: "SAFE" | "CAUTION" | "HIGH_RISK" | "DO_NOT_PROCEED";
  summary: string;
  findings: Finding[];
  deal: {
    item_description: string | null;
    price_cents: number | null;
    price_usd: string | null;
    release_condition: string | null;
    confidence: number;
    complete: boolean;
  };
};

const VERDICT: Record<Scan["verdict"], { label: string; tone: string }> = {
  SAFE: {
    label: "Looks clean",
    tone: "text-[var(--color-signal)] border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10",
  },
  CAUTION: {
    label: "Proceed with caution",
    tone: "text-[var(--color-caution)] border-[var(--color-caution)]/40 bg-[var(--color-caution)]/10",
  },
  HIGH_RISK: {
    label: "High risk",
    tone: "text-[var(--color-halt)] border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10",
  },
  DO_NOT_PROCEED: {
    label: "Do not proceed",
    tone: "text-[var(--color-halt)] border-[var(--color-halt)]/60 bg-[var(--color-halt)]/15",
  },
};

const SEVERITY_TONE: Record<Finding["severity"], string> = {
  INFO: "border-[var(--color-line-bright)] text-[var(--color-ink-dim)]",
  ELEVATED: "border-[var(--color-caution)]/40 text-[var(--color-caution)]",
  HIGH: "border-[var(--color-halt)]/40 text-[var(--color-halt)]",
  CRITICAL: "border-[var(--color-halt)]/60 text-[var(--color-halt)]",
};

function readable(c: string) {
  return c
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

async function authed(path: string, body: unknown) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.detail ?? "That request failed.");
  return json;
}

const SAMPLE = `[10:03] you: I'd charge $250 for a full landing page redesign, delivered as a Figma file.
[10:04] client_marcus: Perfect, $250 works. Can you start today?
[10:07] client_marcus: Actually my accountant says the platform fees are killing us. Can we just do this directly? I'll send the $250 via PayPal friends and family, saves us both the cut.
[10:09] client_marcus: Also I'm boarding a flight in 20 minutes so I need you to confirm ASAP.
[10:10] client_marcus: Oh and since we're going direct, could you also throw in the mobile screens and a logo refresh? Same price obviously.`;

export function GuardianConsole({ siteUrl }: { siteUrl: string }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("FIVERR");
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // contract draft, seeded from the extraction but editable
  const [role, setRole] = useState<"BUYER" | "SELLER">("SELLER");
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const analyse = useCallback(async () => {
    setBusy("scan");
    setError(null);
    setScan(null);
    setInviteUrl(null);
    try {
      const result: Scan = await authed("/guardian/scan", { text, source });
      setScan(result);
      setItem(result.deal.item_description ?? "");
      setPrice(
        result.deal.price_cents ? String(result.deal.price_cents / 100) : "",
      );
      setCondition(result.deal.release_condition ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setBusy(null);
    }
  }, [text, source]);

  async function makeInvite() {
    setBusy("invite");
    setError(null);
    try {
      const inv = await authed("/guardian/invite", {
        scan_id: scan?.id ?? null,
        role,
        item_description: item.trim(),
        price_usd: Number(price),
        release_condition: condition.trim(),
      });
      setInviteUrl(`${siteUrl}/guardian/i/${inv.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invite.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const canInvite =
    item.trim().length > 2 &&
    Number(price) > 0 &&
    condition.trim().length > 2;

  return (
    <div className="space-y-4">
      {/* ---------------- paste ---------------- */}
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Paste the conversation</SectionLabel>
          <button
            onClick={() => {
              setText(SAMPLE);
              setSource("FIVERR");
            }}
            className="text-[13px] font-medium text-[var(--color-aegis)] hover:underline"
          >
            Use a sample
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                source === s
                  ? "border-[var(--color-aegis)] bg-[var(--color-aegis)]/10 text-[var(--color-aegis)]"
                  : "border-[var(--color-line)] text-[var(--color-ink-dim)] hover:bg-[var(--color-panel-2)]"
              }`}
            >
              {s[0] + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Paste the whole thread. Aegis reads it the way the other party wrote it — timestamps, usernames and all."
          className="mt-3 w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3.5 py-3 font-mono text-[13px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-aegis)] focus:outline-none"
        />

        <div className="mt-3 flex items-center gap-3">
          <PrimaryButton
            onClick={analyse}
            disabled={busy !== null || text.trim().length < 20}
          >
            {busy === "scan" ? "Analysing…" : "Analyse for fraud"}
          </PrimaryButton>
          <span className="tnum text-[12px] text-[var(--color-ink-faint)]">
            {text.length.toLocaleString()} characters
          </span>
        </div>

        {busy === "scan" && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
            <div
              className="h-full w-1/3 rounded-full bg-[var(--color-aegis)]"
              style={{ animation: "aegis-sweep 1.1s ease-in-out infinite" }}
            />
          </div>
        )}
      </Panel>

      {error && (
        <p className="rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-4 py-3 text-[14px] text-[var(--color-halt)]">
          {error}
        </p>
      )}

      {/* ---------------- verdict ---------------- */}
      {scan && (
        <Panel className="animate-rise p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <SectionLabel>Verdict</SectionLabel>
              <span
                className={`mt-2 inline-block rounded-full border px-3 py-1 text-[13px] font-semibold ${VERDICT[scan.verdict].tone}`}
              >
                {VERDICT[scan.verdict].label}
              </span>
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-[0.14em] text-[var(--color-ink-faint)] uppercase">
                Risk score
              </div>
              <div
                className={`tnum text-4xl font-semibold ${
                  scan.risk_score >= 70
                    ? "text-[var(--color-halt)]"
                    : scan.risk_score >= 30
                      ? "text-[var(--color-caution)]"
                      : "text-[var(--color-signal)]"
                }`}
              >
                {scan.risk_score}
              </div>
            </div>
          </div>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${scan.risk_score}%`,
                background:
                  scan.risk_score >= 70
                    ? "var(--color-halt)"
                    : scan.risk_score >= 30
                      ? "var(--color-caution)"
                      : "var(--color-signal)",
              }}
            />
          </div>

          <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-ink)]">
            {scan.summary}
          </p>

          {scan.findings.length > 0 && (
            <div className="mt-5 space-y-2.5 border-t border-[var(--color-line)] pt-4">
              <p className="text-[11px] tracking-[0.12em] text-[var(--color-ink-faint)] uppercase">
                {scan.findings.length} finding
                {scan.findings.length === 1 ? "" : "s"}
              </p>
              {scan.findings.map((f, i) => (
                <div
                  key={i}
                  className={`animate-rise rounded-lg border bg-[var(--color-void)] p-3.5 ${SEVERITY_TONE[f.severity]}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">
                      {readable(f.category)}
                    </span>
                    <span className="text-[10px] tracking-wider opacity-75">
                      {f.severity}
                    </span>
                  </div>
                  <p className="mt-2 border-l-2 border-current pl-2.5 text-[13px] leading-relaxed italic opacity-90">
                    “{f.quote}”
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
                    {f.rationale}
                  </p>
                </div>
              ))}
            </div>
          )}

          {scan.findings.length === 0 && (
            <p className="mt-4 rounded-lg border border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10 px-3 py-2.5 text-[13px] text-[var(--color-signal)]">
              No fraud patterns matched. Aegis found nothing worth flagging in
              this conversation.
            </p>
          )}
        </Panel>
      )}

      {/* ---------------- protect the deal ---------------- */}
      {scan && (
        <Panel className="animate-rise p-5">
          <SectionLabel>Protect this deal</SectionLabel>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
            {scan.deal.complete
              ? "Aegis pulled these terms out of the conversation. Check them, then send the other party a link to fund the escrow."
              : "Aegis could not find every term in the conversation. Fill in what is missing — nothing is locked until both sides accept."}
          </p>

          {scan.deal.complete && (
            <p className="tnum mt-2 text-[12px] text-[var(--color-ink-faint)]">
              Extraction confidence {Math.round(scan.deal.confidence * 100)}%
            </p>
          )}

          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              {(["SELLER", "BUYER"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-[14px] font-medium transition-colors ${
                    role === r
                      ? "border-[var(--color-aegis)] bg-[var(--color-aegis)]/10 text-[var(--color-aegis)]"
                      : "border-[var(--color-line)] text-[var(--color-ink-dim)] hover:bg-[var(--color-panel-2)]"
                  }`}
                >
                  I am the {r === "BUYER" ? "buyer" : "seller"}
                </button>
              ))}
            </div>

            <input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="What is being bought"
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3.5 py-2.5 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-aegis)] focus:outline-none"
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="Price in USD"
              className="tnum w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3.5 py-2.5 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-aegis)] focus:outline-none"
            />
            <textarea
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              rows={2}
              placeholder="What must be delivered for funds to release"
              className="w-full resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3.5 py-2.5 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-aegis)] focus:outline-none"
            />

            {Number(price) > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-void)] px-3.5 py-3">
                <span className="text-[13px] text-[var(--color-ink-dim)]">
                  {role === "BUYER" ? "You will fund" : "You will receive"}
                </span>
                <Money cents={Math.round(Number(price) * 100)} size="md" />
              </div>
            )}

            <PrimaryButton
              onClick={makeInvite}
              disabled={!canInvite || busy !== null}
              className="w-full"
            >
              {busy === "invite" ? "Creating…" : "Create escrow invite"}
            </PrimaryButton>
          </div>

          {inviteUrl && (
            <div className="animate-rise mt-4 rounded-lg border border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10 p-4">
              <p className="text-[13px] font-semibold text-[var(--color-aegis)]">
                Send this link to the other party
              </p>
              <p className="mt-2 rounded border border-[var(--color-line)] bg-[var(--color-void)] px-2.5 py-2 font-mono text-[12px] break-all text-[var(--color-ink)]">
                {inviteUrl}
              </p>
              <div className="mt-3 flex gap-2">
                <GhostButton onClick={copy}>
                  {copied ? "Copied" : "Copy link"}
                </GhostButton>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-dim)]">
                Funds are only pulled once they accept. The link expires in
                seven days.
              </p>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
