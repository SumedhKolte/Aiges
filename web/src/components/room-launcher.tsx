"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GhostButton, Panel, PrimaryButton, SectionLabel } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const DEMO_SCENARIOS = [
  {
    label: "Landing page",
    title: "Landing page redesign",
    detail: "Buyer + designer",
  },
  {
    label: "Brand kit",
    title: "Brand identity package",
    detail: "Fast visual proof",
  },
  {
    label: "Data cleanup",
    title: "Customer data cleanup",
    detail: "Clear acceptance test",
  },
] as const;

async function authedPost(path: string, body: unknown) {
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

export function RoomLauncher() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<"BUYER" | "SELLER">("BUYER");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const room = await authedPost("/rooms", {
        title: title.trim() || "Untitled negotiation",
        role,
      });
      router.push(`/room/${room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the room.");
      setBusy(null);
    }
  }

  async function join() {
    setBusy("join");
    setError(null);
    try {
      const room = await authedPost("/rooms/join", { code: code.trim() });
      router.push(`/room/${room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join that room.");
      setBusy(null);
    }
  }

  const field =
    "field";

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Start a negotiation</SectionLabel>
          <p className="mt-1.5 text-[13px] text-[var(--color-ink-faint)]">
            Pick a scenario or make your own.
          </p>
        </div>
        <span className="rounded-full border border-[#8d9bff]/30 bg-[#8d9bff]/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-[#aeb7ff] uppercase">
          Demo ready
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {DEMO_SCENARIOS.map((scenario) => (
          <button
            key={scenario.label}
            type="button"
            onClick={() => {
              setTitle(scenario.title);
              setRole("BUYER");
              setSelectedDemo(scenario.label);
              setError(null);
            }}
            className={`rounded-lg border p-2.5 text-left transition-colors ${
              selectedDemo === scenario.label
                ? "border-[var(--color-aegis)]/60 bg-[var(--color-aegis)]/10"
                : "border-[var(--color-line)] bg-[var(--color-void)] hover:border-[var(--color-line-bright)]"
            }`}
          >
            <span className="block truncate text-[11px] font-semibold text-[var(--color-ink)]">
              {scenario.label}
            </span>
            <span className="mt-1 block truncate text-[10px] text-[var(--color-ink-faint)]">
              {scenario.detail}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <input
          className={field}
          placeholder="What is being bought?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="flex gap-2">
          {(["BUYER", "SELLER"] as const).map((r) => (
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

        <PrimaryButton
          onClick={create}
          disabled={busy !== null}
          className="w-full"
        >
          {busy === "create" ? "Opening…" : "Open room"}
        </PrimaryButton>
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-line)]" />
        <span className="text-[11px] tracking-[0.12em] text-[var(--color-ink-faint)] uppercase">
          or join
        </span>
        <span className="h-px flex-1 bg-[var(--color-line)]" />
      </div>

      <div className="flex gap-2">
        <input
          className={`${field} tnum flex-1 tracking-[0.2em] uppercase`}
          placeholder="CODE"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && code.length >= 4 && join()}
        />
        <GhostButton onClick={join} disabled={busy !== null || code.length < 4}>
          {busy === "join" ? "Joining…" : "Join"}
        </GhostButton>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2 text-[13px] text-[var(--color-halt)]">
          {error}
        </p>
      )}
    </Panel>
  );
}
