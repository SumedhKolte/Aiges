"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AegisLogo } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

function BackChevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10 3.5 5.5 8l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TopNav({
  name,
  back,
}: {
  name: string;
  /** Back target. Omitted on the dashboard, which is the root of the app. */
  back?: { href: string; label: string };
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-void)]/78 shadow-[0_8px_26px_rgb(0_0_0_/_0.14)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-3">
          {back && (
            <Link
              href={back.href}
              className="flex items-center gap-1 rounded-lg border border-[var(--color-line)] py-1.5 pr-3 pl-2 text-[13px] font-medium text-[var(--color-ink-dim)] transition-[border-color,box-shadow,color] hover:border-[var(--color-line-bright)] hover:text-[var(--color-ink)]"
            >
              <BackChevron />
              {back.label}
            </Link>
          )}
          <Link
            href="/dashboard"
            className="transition-opacity hover:opacity-80"
          >
            <AegisLogo size={24} />
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-[14px] text-[var(--color-ink-dim)] sm:block">
            {name}
          </span>
          <button
            onClick={signOut}
            className="text-[14px] font-medium text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-ink)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
