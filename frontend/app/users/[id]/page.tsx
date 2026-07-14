import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { ApiResponse, UserProfile } from "@/lib/types";
import UserProfileClient from "./UserProfileClient";

function decodeJWTPayload(token: string): { sub?: string; role?: string } | null {
  try {
    const part = token.split(".")[1];
    const padded = part + "==".slice(0, (4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function fetchProfile(userId: string, accessToken?: string): Promise<UserProfile | null> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/${userId}/profile`,
      accessToken ? { headers, cache: "no-store" } : { next: { revalidate: 30 } }
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json: ApiResponse<UserProfile> = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await fetchProfile(id);
  return {
    title: profile?.full_name ? `${profile.full_name} — TastyVietnam` : "Hồ sơ người dùng",
  };
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const jar = await cookies();
  const accessToken = jar.get("access_token")?.value;
  const jwtPayload = accessToken ? decodeJWTPayload(accessToken) : null;
  const currentUserId = jwtPayload?.sub ?? null;

  const profile = await fetchProfile(id, accessToken);
  if (!profile) notFound();

  return (
    <UserProfileClient
      profile={profile}
      currentUserId={currentUserId}
    />
  );
}
