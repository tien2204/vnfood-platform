"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { useRouter } from "next/navigation";
import { getStoredUser, clearTokens } from "../auth";
import type { User } from "../types";

export const USER_CACHE_KEY = "current-user";

function fetchStoredUser(): User | null {
  return getStoredUser();
}

export function useUser() {
  const router = useRouter();
  const { data: user, mutate } = useSWR<User | null>(
    USER_CACHE_KEY,
    fetchStoredUser,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const logout = async () => {
    await clearTokens();
    await mutate(null, false);
    router.push("/");
    router.refresh();
  };

  return {
    user: user ?? null,
    isLoggedIn: !!user,
    isAdmin: user?.role === "admin",
    isLoading: user === undefined,
    logout,
    mutate,
  };
}

/** Gọi sau login/register để Navbar cập nhật ngay */
export async function refreshUser() {
  await globalMutate(USER_CACHE_KEY);
}
