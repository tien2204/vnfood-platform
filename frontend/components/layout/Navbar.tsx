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
    <header className="sticky top-0 z-50 bg-[#ffffff]/95 backdrop-blur-sm border-b border-border">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-10 w-10 items-center justify-center border border-border bg-[#ec2028] shadow-block-sm">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </span>
          <span
            className="text-xl font-bold tracking-wide text-[#0a0a0a]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            VNFood
          </span>
        </Link>

        {/* Desktop Search — hidden on /search to avoid stacked search boxes */}
        {!hideSearchBar && (
          <form
            onSubmit={handleSearch}
            className="hidden md:flex flex-1 max-w-lg mx-auto relative"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ec2028]" />
            <Input
              placeholder="Tìm kiếm món ăn..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-white border border-border rounded-lg shadow-block-sm focus-visible:ring-[#ec2028]"
            />
          </form>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Mobile search toggle — also hidden on /search */}
          {!hideSearchBar && (
            <button
              className="md:hidden p-2 border border-transparent hover:border-[#0a0a0a] hover:bg-[#f5f5f5]"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              {searchOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </button>
          )}

          {/* AI Scan */}
          <Link href="/recognize">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-[#f5f5f5] text-[#0a0a0a] shadow-block-sm hover:bg-[#ec2028] hover:text-white"
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
                      <AvatarFallback className="bg-[#ec2028] text-white text-xs font-semibold">
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
                      className="hidden sm:flex rounded-lg border border-border bg-white text-[#0a0a0a] shadow-block-sm hover:bg-[#0a0a0a] hover:text-[#ffffff]"
                    >
                      Đăng nhập
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button
                      size="sm"
                      className="rounded-lg border border-border bg-[#ec2028] text-white shadow-block-sm hover:bg-[#cc1c22]"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ec2028]" />
            <Input
              autoFocus
              placeholder="Tìm kiếm món ăn..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-white border border-border rounded-lg"
            />
          </div>
        </form>
      )}
    </header>
  );
}
