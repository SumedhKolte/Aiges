import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieRecord = { name: string; value: string; options?: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: CookieRecord[]) => {
          try {
            list.forEach(({ name, value, options }: CookieRecord) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: middleware already refreshes
            // the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  );
}
