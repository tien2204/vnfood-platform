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
    <div className="grid grid-cols-3 divide-x divide-border border border-border rounded-xl overflow-hidden bg-card">
      {items.map(({ key, label, value }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onTabChange?.(key)}
            className={`
              flex flex-col items-center gap-0.5 py-3 px-2 transition-colors
              ${onTabChange ? "cursor-pointer hover:bg-muted" : "cursor-default"}
              ${isActive ? "bg-[var(--color-brand-pink-bg)]" : ""}
            `}
          >
            <span className={`text-xl font-bold ${isActive ? "text-primary" : "text-foreground"}`}>
              {value.toLocaleString()}
            </span>
            <span className={`text-xs ${isActive ? "text-primary" : "text-muted-foreground"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
