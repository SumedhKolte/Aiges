"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AegisLogo } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.86-3c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("error"));

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name || email.split("@")[0] } },
      });
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        setNotice("Check your inbox to confirm the address, then sign in.");
        setMode("signin");
      } else {
        router.push(next);
        router.refresh();
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push(next);
        router.refresh();
        return;
      }
    }
    setBusy(false);
  }

  const field =
    "field";

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-9 flex flex-col items-center text-center">
          <AegisLogo size={36} showTagline />
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--color-ink-dim)]">
            Negotiate out loud. Aegis holds the money.
          </p>
        </div>

        <div className="panel p-6">
          <button
            onClick={handleGoogle}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--color-line-bright)] bg-[var(--color-panel-2)] px-4 py-2.5 text-[15px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-line)] disabled:opacity-50"
          >
            <GoogleGlyph />
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--color-line)]" />
            <span className="text-[11px] font-medium tracking-[0.12em] text-[var(--color-ink-faint)] uppercase">
              or
            </span>
            <span className="h-px flex-1 bg-[var(--color-line)]" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                className={field}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            )}
            <input
              className={field}
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              className={field}
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[var(--color-aegis)] px-4 py-2.5 text-[15px] font-semibold text-[var(--color-void)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy
                ? "Working…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-lg border border-[var(--color-halt)]/40 bg-[var(--color-halt)]/10 px-3 py-2 text-[13px] text-[var(--color-halt)]">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded-lg border border-[var(--color-aegis)]/40 bg-[var(--color-aegis)]/10 px-3 py-2 text-[13px] text-[var(--color-aegis)]">
              {notice}
            </p>
          )}

          <p className="mt-5 text-center text-[13px] text-[var(--color-ink-dim)]">
            {mode === "signin" ? "New to Aegis?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
              className="font-medium text-[var(--color-aegis)] hover:underline"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
          New accounts start with a $2,500.00 demonstration balance.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
