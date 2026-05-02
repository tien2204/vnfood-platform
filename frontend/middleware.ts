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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    return NextResponse.redirect(
      new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  const payload = decodeJWT(token);
  if (!payload || payload.exp * 1000 < Date.now()) {
    const res = NextResponse.redirect(
      new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, request.url)
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
  matcher: [
    "/me/:path*",
    "/admin/:path*",
    "/recipes/new",
    "/recipes/:id/edit",
  ],
};
