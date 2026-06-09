"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { Search, ScanLine, UtensilsCrossed, X, ChevronDown, LogOut, UserRound, Bookmark, Newspaper, ChefHat, Settings, CalendarDays, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/lib/hooks/useUser";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const CATEGORY_GROUPS = [
  { title: "Nguyên liệu", items: [
    { label: "Thịt bò", href: "/search?q=b%C3%B2" },
    { label: "Thịt heo", href: "/search?q=heo" },
    { label: "Thịt gà", href: "/search?q=g%C3%A0" },
    { label: "Hải sản", href: "/search?q=h%E1%BA%A3i%20s%E1%BA%A3n" },
    { label: "Rau củ", href: "/search?q=rau" },
  ]},
  { title: "Cách nấu", items: [
    { label: "Món canh", href: "/search?q=canh" },
    { label: "Món xào", href: "/search?q=x%C3%A0o" },
    { label: "Món kho", href: "/search?q=kho" },
    { label: "Món nướng", href: "/search?q=n%C6%B0%E1%BB%9Bng" },
    { label: "Món chiên", href: "/search?q=chi%C3%AAn" },
  ]},
  { title: "Bữa & dịp", items: [
    { label: "Bữa sáng", href: "/search?q=s%C3%A1ng" },
    { label: "Cơm gia đình", href: "/recipes" },
    { label: "Món chay", href: "/search?q=chay" },
    { label: "Ăn vặt", href: "/search?q=%C4%83n%20v%E1%BA%B7t" },
    { label: "Tết", href: "/search?q=t%E1%BA%BFt" },
  ]},
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { user, isLoggedIn, isLoading, logout } = useUser();

  // /search already has its own search input — hide the navbar one there
  // to avoid two stacked search boxes.
  const hideSearchBar = pathname?.startsWith("/search");

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        setSearchOpen(false);
      }
    },
    [query, router]
  );

  const avatarSrc = user?.avatar_url
    ? `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${user.avatar_url}`
    : undefined;

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-sm">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </span>
          <span className="text-2xl text-primary font-display leading-none">
            VNFood
          </span>
        </Link>

        {/* Danh mục mega-menu — desktop only */}
        <div className="hidden lg:block relative group">
          <button className="flex items-center gap-1 px-3 h-16 text-sm font-semibold text-foreground hover:text-primary transition-colors">
            Danh mục <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all absolute left-0 top-full w-[640px] bg-white border border-border rounded-xl shadow-warm p-5 grid grid-cols-3 gap-x-6 gap-y-4 z-50">
            {CATEGORY_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="text-xs font-bold uppercase tracking-wide text-primary mb-2">{g.title}</p>
                <ul className="space-y-1">
                  {g.items.map((it) => (
                    <li key={it.label}>
                      <Link href={it.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">{it.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Search — hidden on /search to avoid stacked search boxes */}
        {!hideSearchBar && (
          <form
            onSubmit={handleSearch}
            className="hidden md:flex flex-1 max-w-lg mx-auto relative"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              placeholder="Tìm kiếm món ăn..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-muted border border-border rounded-full focus-visible:ring-primary"
            />
          </form>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Mobile search toggle — also hidden on /search */}
          {!hideSearchBar && (
            <button
              className="md:hidden p-2 rounded-lg border border-transparent hover:border-border hover:bg-muted"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              {searchOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </button>
          )}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* AI Scan */}
          <Link href="/recognize">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-1.5 rounded-lg border-2 border-primary bg-card text-primary font-bold hover:bg-primary hover:text-white"
            >
              <ScanLine className="w-4 h-4" />
              <span>AI Nhận diện</span>
            </Button>
          </Link>

          {/* Auth area — hide until SWR resolves to avoid flash */}
          {!isLoading && (
            <>
              {isLoggedIn && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1.5 border border-transparent pl-1 pr-2 py-1 hover:border-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors cursor-pointer outline-none">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={avatarSrc} alt={user.full_name} />
                      <AvatarFallback className="bg-primary text-white text-xs font-semibold">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="w-3.5 h-3.5 text-[#666666] hidden sm:block" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-auto min-w-[200px]"
                  >
                    <div className="px-2 py-2.5 border-b border-[#f0f0f0]">
                      <p className="font-semibold text-sm text-[#0a0a0a] truncate">
                        {user.full_name}
                      </p>
                      <p className="text-xs text-[#666666] truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push(`/users/${user.id}`)}
                    >
                      <UserRound className="w-4 h-4 text-[#666666]" />
                      Trang cá nhân
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/feed")}
                    >
                      <Newspaper className="w-4 h-4 text-[#666666]" />
                      Bảng tin
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/me/recipes")}
                    >
                      <ChefHat className="w-4 h-4 text-[#666666]" />
                      Công thức của tôi
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/me/saved")}
                    >
                      <Bookmark className="w-4 h-4 text-[#666666]" />
                      Đã lưu
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/meal-plan")}
                    >
                      <CalendarDays className="w-4 h-4 text-[#666666]" />
                      Meal Plan
                    </DropdownMenuItem>
                    {(user.role === "collaborator" || user.role === "admin") && (
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => router.push("/me/change-requests")}
                      >
                        <ClipboardList className="w-4 h-4 text-[#666666]" />
                        Đề xuất của tôi
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/me/profile")}
                    >
                      <Settings className="w-4 h-4 text-[#666666]" />
                      Cài đặt hồ sơ
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      className="gap-2 cursor-pointer"
                      onClick={logout}
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/auth/login">
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden sm:flex rounded-lg border-2 border-primary bg-white text-primary font-bold hover:bg-primary hover:text-white"
                    >
                      Đăng nhập
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button
                      size="sm"
                      className="rounded-lg border-2 border-primary bg-primary text-white font-bold hover:bg-[#cc1c22] hover:border-[#cc1c22]"
                    >
                      <span className="sm:hidden">Đăng nhập</span>
                      <span className="hidden sm:inline">Đăng ký</span>
                    </Button>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Mobile search bar */}
      {searchOpen && (
        <form
          onSubmit={handleSearch}
          className="md:hidden px-4 pb-3 border-b border-border"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              autoFocus
              placeholder="Tìm kiếm món ăn..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-muted border border-border rounded-full focus-visible:ring-primary"
            />
          </div>
        </form>
      )}
    </header>
  );
}
