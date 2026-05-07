"use client";

import type { UserStats } from "@/lib/types";

interface Props {
  stats: UserStats;
  activeTab?: "recipes" | "followers" | "following";
  onTabChange?: (tab: "recipes" | "followers" | "following") => void;
}

export default function UserStatsBar({ stats, activeTab, onTabChange }: Props) {
  const items = [
    { key: "recipes" as const, label: "Công thức", value: stats.recipe_count },
    { key: "followers" as const, label: "Người theo dõi", value: stats.follower_count },
    { key: "following" as const, label: "Đang theo dõi", value: stats.following_count },
  ];

  return (
    <div className="grid grid-cols-3 divide-x divide-[#E8DDD4] border border-[#E8DDD4] rounded-xl overflow-hidden bg-white">
      {items.map(({ key, label, value }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onTabChange?.(key)}
            className={`
              flex flex-col items-center gap-0.5 py-3 px-2 transition-colors
              ${onTabChange ? "cursor-pointer hover:bg-[#F7F0E8]" : "cursor-default"}
              ${isActive ? "bg-[#FFF5F0]" : ""}
            `}
          >
            <span className={`text-xl font-bold ${isActive ? "text-[#E85D26]" : "text-[#1C1209]"}`}>
              {value.toLocaleString()}
            </span>
            <span className={`text-xs ${isActive ? "text-[#E85D26]" : "text-[#7C6A56]"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
