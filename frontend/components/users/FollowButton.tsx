"use client";

import { useRef, useState } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import type { FollowResponse } from "@/lib/types";

interface Props {
  userId: string;
  initialFollowing: boolean;
  initialCount: number;
  isSelf?: boolean;
  onToggle?: (isFollowing: boolean, count: number) => void;
}

export default function FollowButton({ userId, initialFollowing, initialCount, isSelf, onToggle }: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const inFlight = useRef(false);

  if (isSelf) return null;

  async function handleToggle() {
    if (inFlight.current) return;
    inFlight.current = true;

    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setCount((c) => wasFollowing ? c - 1 : c + 1);

    try {
      const method = wasFollowing ? "delete" : "post";
      const res = await api[method]<{ success: boolean; data: FollowResponse }>(
        `/users/${userId}/follow`
      );
      const data = res.data.data;
      setFollowing(data.is_following);
      setCount(data.follower_count);
      onToggle?.(data.is_following, data.follower_count);
      router.refresh();
    } catch (err: unknown) {
      setFollowing(wasFollowing);
      setCount((c) => wasFollowing ? c + 1 : c - 1);
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (msg?.includes("401") || (err as { response?: { status?: number } })?.response?.status === 401) {
        router.push("/auth/login");
      } else {
        toast.error(msg ?? "Thao tác thất bại, thử lại");
      }
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <Button
      onClick={handleToggle}
      variant={following ? "outline" : "default"}
      size="sm"
      className={
        following
          ? "border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white gap-1.5"
          : "bg-[#E85D26] hover:bg-[#D44E1E] text-white gap-1.5"
      }
    >
      {following ? (
        <>
          <UserCheck className="w-4 h-4" />
          Đang theo dõi
        </>
      ) : (
        <>
          <UserPlus className="w-4 h-4" />
          Theo dõi
        </>
      )}
    </Button>
  );
}
