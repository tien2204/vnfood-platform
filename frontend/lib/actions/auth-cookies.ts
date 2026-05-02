"use server";

import { cookies } from "next/headers";

const ACCESS_MAX_AGE = 60 * 60; // 1h
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7d

export async function setTokensCookie(accessToken: string, refreshToken: string) {
  const jar = await cookies();
  jar.set("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACCESS_MAX_AGE,
    path: "/",
  });
  jar.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE,
    path: "/",
  });
}

export async function clearTokensCookie() {
  const jar = await cookies();
  jar.delete("access_token");
  jar.delete("refresh_token");
}
