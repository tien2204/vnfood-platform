import { NextRequest, NextResponse } from "next/server";

interface JWTPayload {
  sub: string;
  role: string;
  exp: number;
}

function decodeJWT(token: string): JWTPayload | null {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JWTPayload;
  } catch {
    return null;
  }
}

const ADMIN_RE = /^\/admin(\/.*)?$/;

// Paths that anonymous (not-logged-in) users may access freely.
// Everything else requires a valid access_token cookie.
const PUBLIC_EXACT = new Set(["/", "/recognize"]);
const PUBLIC_PREFIXES = ["/auth/", "/recognize/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Anonymous-allowed paths bypass the auth check entirely.
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Preserve the full original URL (path + query string) in `next` so e.g.
  // /search?q=Bánh%20bèo round-trips through login back with the keyword intact.
  const nextParam = encodeURIComponent(pathname + search);

  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    return NextResponse.redirect(
      new URL(`/auth/login?next=${nextParam}`, request.url)
    );
  }

  const payload = decodeJWT(token);
  if (!payload || payload.exp * 1000 < Date.now()) {
    const res = NextResponse.redirect(
      new URL(`/auth/login?next=${nextParam}`, request.url)
    );
    res.cookies.delete("access_token");
    return res;
  }

  if (ADMIN_RE.test(pathname) && payload.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on every route EXCEPT Next.js internals and static files.
  // The handler then whitelists "/" and "/recognize" (+ /auth/* for login flow).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
