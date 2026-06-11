import { NextRequest, NextResponse } from "next/server";

interface JWTPayload { sub: string; role: string; exp: number; }

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

const STAFF_RE = /^\/staff(\/.*)?$/;

const PUBLIC_EXACT = new Set(["/", "/recognize"]);
const PUBLIC_PREFIXES = ["/auth/", "/recognize/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const dest = pathname.replace(/^\/admin/, "/staff");
    return NextResponse.redirect(new URL(dest + search, request.url));
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const nextParam = encodeURIComponent(pathname + search);
  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL(`/auth/login?next=${nextParam}`, request.url));
  }

  const payload = decodeJWT(token);
  if (!payload || payload.exp * 1000 < Date.now()) {
    const res = NextResponse.redirect(new URL(`/auth/login?next=${nextParam}`, request.url));
    res.cookies.delete("access_token");
    return res;
  }

  if (STAFF_RE.test(pathname)) {
    if (payload.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
