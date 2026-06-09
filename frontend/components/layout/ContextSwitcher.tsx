"use client";

import { useRouter, usePathname } from "next/navigation";
import { LayoutGrid, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/lib/hooks/useUser";

interface Ctx { key: string; label: string; href: string; }

export default function ContextSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  if (!user || user.role === "user") return null;

  const staffLabel = user.role === "admin" ? "Quản trị" : "Cộng tác viên";
  const staffHref = user.role === "admin" ? "/staff/dashboard" : "/staff/review";
  const contexts: Ctx[] = [
    { key: "user", label: "Người dùng", href: "/" },
    { key: "staff", label: staffLabel, href: staffHref },
  ];
  const currentKey = pathname.startsWith("/staff") ? "staff" : "user";
  const current = contexts.find((c) => c.key === currentKey) ?? contexts[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 border border-border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-block-sm hover:bg-muted outline-none cursor-pointer">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {contexts.map((c) => (
          <DropdownMenuItem
            key={c.key}
            className="gap-2 cursor-pointer"
            onClick={() => router.push(c.href)}
          >
            <Check className={`w-4 h-4 ${c.key === currentKey ? "text-primary" : "opacity-0"}`} />
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
