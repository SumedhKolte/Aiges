"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Panel, PrimaryButton, SectionLabel } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Take the free seat in a room you arrived at by link.
 *
 * Opening a room URL used to leave you an observer forever — only the
 * dashboard's join box actually seated anyone. That made sharing the link
 * useless: the other party would sit watching an empty negotiation while the
 * host waited for someone who, as far as the database was concerned, had never
 * arrived.
 */
export function JoinSeat({
  code,
  freeSeat,
}: {
  code: string;
  /** Which side is still open, or null when the room is full. */
  freeSeat: "BUYER" | "SELLER" | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`${API}/rooms/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.detail ?? "Could not join this room.");

      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join this room.");
      setBusy(false);
    }
  }

  if (!freeSeat) {
    return (
      <Panel className="animate-rise mt-5 p-5">
        <SectionLabel>Observing</SectionLabel>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
          This negotiation already has both parties. You can follow along, but
          you are not a party to it and cannot agree to terms.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="animate-rise mt-5 border-[var(--color-aegis)]/40 p-5">
      <SectionLabel>You have not joined yet</SectionLabel>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
        The {freeSeat === "BUYER" ? "buyer" : "seller"} seat is open. Take it to
        become a party to this negotiation — until you do, Aegis will not let
        the deal lock.
      </p>

      <PrimaryButton onClick={join} disabled={busy} className="mt-4">
        {busy
          ? "Joining…"
          : `Join as the ${freeSeat === "BUYER" ? "buyer" : "seller"}`}
      </PrimaryButton>

      {error && (
        <p className="mt-3 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2 text-[13px] text-[var(--color-halt)]">
          {error}
        </p>
      )}
    </Panel>
  );
}
