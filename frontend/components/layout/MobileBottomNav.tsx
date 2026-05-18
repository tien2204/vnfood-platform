"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, ScanLine, Newspaper, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/hooks/useUser";

const STATIC_ITEMS = [
  { href: "/", icon: Home, label: "Trang chủ" },
  { href: "/search", icon: Search, label: "Tìm kiếm" },
  { href: "/ai/scan", icon: ScanLine, label: "AI Scan", highlight: true },
  { href: "/feed", icon: Newspaper, label: "Bảng tin" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useUser();

  const profileHref = user ? `/users/${user.id}` : "/auth/login";
  const allItems = [
    ...STATIC_ITEMS,
    { href: profileHref, icon: User, label: "Cá nhân", highlight: false },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#fffaf0] border-t-2 border-[#2c1810] pb-safe">
      <div className="flex items-center justify-around h-16">
        {allItems.map(({ href, icon: Icon, label, highlight }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 transition-colors",
                highlight
                  ? "bg-[#ff6b35] text-white -mt-4 border-2 border-[#2c1810] shadow-block-sm p-3"
                  : active
                  ? "text-[#ff6b35]"
                  : "text-[#6b5344]"
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
