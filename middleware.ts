import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Canonical host for cookies, PWA scope, and auth redirects. */
const CANONICAL_HOST = "www.uniquevocal.ru";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (host === "uniquevocal.ru") {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Skip Next internals and static assets; redirect all page/API hits
     * from apex → www so mobile PWA + Supabase auth stay on one origin.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|workbox|manifest.json).*)",
  ],
};
