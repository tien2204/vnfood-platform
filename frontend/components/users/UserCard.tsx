"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FollowButton from "./FollowButton";
import type { FollowerOut } from "@/lib/types";

interface Props {
  user: FollowerOut;
  currentUserId?: string;
}

export default function UserCard({ user, currentUserId }: Props) {
  const [followState, setFollowState] = useState({
    is_following: user.is_following ?? false,
  });

  const avatarSrc = user.avatar_url
    ? user.avatar_url.startsWith("http")
      ? user.avatar_url
      : `${process.env.NEXT_PUBLIC_API_URL}${user.avatar_url}`
    : undefined;

  const isSelf = currentUserId === user.id;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#E8DDD4] hover:border-[#E85D26]/30 transition-colors">
      <Link href={`/users/${user.id}`} className="shrink-0">
        <Avatar className="w-11 h-11">
          <AvatarImage src={avatarSrc} alt={user.full_name ?? "User"} />
          <AvatarFallback className="bg-[#F7F0E8] text-[#E85D26] font-semibold text-sm">
            {user.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/users/${user.id}`}>
          <p className="font-semibold text-sm text-[#1C1209] truncate hover:text-[#E85D26] transition-colors">
            {user.full_name ?? "Người dùng"}
          </p>
        </Link>
        {user.bio && (
          <p className="text-xs text-[#7C6A56] truncate mt-0.5">{user.bio}</p>
        )}
      </div>

      {user.is_following !== null && !isSelf && (
        <FollowButton
          userId={user.id}
          initialFollowing={followState.is_following}
          initialCount={0}
          isSelf={isSelf}
          onToggle={(isFollowing) => setFollowState({ is_following: isFollowing })}
        />
      )}
    </div>
  );
}
