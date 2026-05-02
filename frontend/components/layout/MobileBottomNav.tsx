"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, ScanLine, CalendarDays, User } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: "Trang chủ" },
  { href: "/search", icon: Search, label: "Tìm kiếm" },
  { href: "/ai/scan", icon: ScanLine, label: "AI Scan", highlight: true },
  { href: "/meal-plans", icon: CalendarDays, label: "Thực đơn" },
  { href: "/profile", icon: User, label: "Cá nhân" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#FFFBF5] border-t border-[#E8DDD4] pb-safe">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map(({ href, icon: Icon, label, highlight }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-colors",
                highlight
                  ? "bg-[#E85D26] text-white -mt-4 shadow-warm p-3 rounded-2xl"
                  : active
                  ? "text-[#E85D26]"
                  : "text-[#7C6A56]"
              )}
            >
              <Icon className={cn("w-5 h-5", highlight && "w-6 h-6")} />
              {!highlight && (
                <span className="text-[10px] font-medium">{label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
