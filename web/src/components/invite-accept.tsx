"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PrimaryButton } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function InviteAccept({
  token,
  signedIn,
  yourRole,
}: {
  token: string;
  signedIn: boolean;
  yourRole: "BUYER" | "SELLER";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="mt-6">
        <PrimaryButton
          onClick={() =>
            router.push(`/login?next=${encodeURIComponent(`/guardian/i/${token}`)}`)
          }
          className="w-full"
        >
          Sign in to accept
        </PrimaryButton>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
          New accounts start with a demonstration balance, so you can accept
          straight away.
        </p>
      </div>
    );
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`${API}/guardian/invite/${token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.detail ?? "Could not accept this invitation.");

      router.push(`/contract/${json.contract_id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept this invitation.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <PrimaryButton onClick={accept} disabled={busy} className="w-full">
        {busy
          ? "Locking escrow…"
          : yourRole === "BUYER"
            ? "Accept and fund the escrow"
            : "Accept these terms"}
      </PrimaryButton>

      <p className="mt-3 text-center text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
        {yourRole === "BUYER"
          ? "The amount moves from your available balance into escrow. It is only released when the condition above is met."
          : "The buyer's funds are locked into escrow the moment you accept. You are paid when the condition above is verified."}
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2.5 text-[13px] text-[var(--color-halt)]">
          {error}
        </p>
      )}
    </div>
  );
}
