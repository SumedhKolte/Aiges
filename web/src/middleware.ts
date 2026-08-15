import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieRecord = { name: string; value: string; options?: CookieOptions };

const PROTECTED = ["/dashboard", "/room", "/contract"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieRecord[]) => {
          list.forEach(({ name, value }: CookieRecord) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }: CookieRecord) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session on every request; do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Signed-in users skip the login screen. The landing page stays reachable
  // so it can still be shown during a demo.
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)"],
};
