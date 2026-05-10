"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { Search, ScanLine, UtensilsCrossed, X, ChevronDown, LogOut, UserRound, Bookmark, Newspaper, ChefHat, Settings, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { user, isLoggedIn, isLoading, logout } = useUser();

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
    <header className="sticky top-0 z-50 bg-[#FFFBF5]/95 backdrop-blur border-b border-[#E8DDD4]">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <UtensilsCrossed className="w-7 h-7 text-[#E85D26]" />
          <span
            className="text-xl font-bold text-[#E85D26]"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            VNFood
          </span>
        </Link>

        {/* Desktop Search */}
        <form
          onSubmit={handleSearch}
          className="hidden md:flex flex-1 max-w-lg mx-auto relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C6A56]" />
          <Input
            placeholder="Tìm kiếm món ăn..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-[#F7F0E8] border-[#E8DDD4] focus-visible:ring-[#E85D26]"
          />
        </form>

        <div className="flex items-center gap-2 ml-auto">
          {/* Mobile search toggle */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-[#F7F0E8]"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            {searchOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Search className="w-5 h-5" />
            )}
          </button>

          {/* AI Scan */}
          <Link href="/recognize">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-1.5 border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white"
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
                  <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-[#F7F0E8] transition-colors cursor-pointer outline-none">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={avatarSrc} alt={user.full_name} />
                      <AvatarFallback className="bg-[#E85D26] text-white text-xs font-semibold">
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="w-3.5 h-3.5 text-[#7C6A56] hidden sm:block" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-auto min-w-[200px]"
                  >
                    <div className="px-2 py-2.5 border-b border-[#F7F0E8]">
                      <p className="font-semibold text-sm text-[#2D2417] truncate">
                        {user.full_name}
                      </p>
                      <p className="text-xs text-[#7C6A56] truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push(`/users/${user.id}`)}
                    >
                      <UserRound className="w-4 h-4 text-[#7C6A56]" />
                      Trang cá nhân
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/feed")}
                    >
                      <Newspaper className="w-4 h-4 text-[#7C6A56]" />
                      Bảng tin
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/me/recipes")}
                    >
                      <ChefHat className="w-4 h-4 text-[#7C6A56]" />
                      Công thức của tôi
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/me/saved")}
                    >
                      <Bookmark className="w-4 h-4 text-[#7C6A56]" />
                      Đã lưu
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/meal-plan")}
                    >
                      <CalendarDays className="w-4 h-4 text-[#7C6A56]" />
                      Meal Plan
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => router.push("/me/profile")}
                    >
                      <Settings className="w-4 h-4 text-[#7C6A56]" />
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
                      className="hidden sm:flex border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white"
                    >
                      Đăng nhập
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button
                      size="sm"
                      className="bg-[#E85D26] hover:bg-[#D44E1E] text-white"
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
          className="md:hidden px-4 pb-3 border-b border-[#E8DDD4]"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C6A56]" />
            <Input
              autoFocus
              placeholder="Tìm kiếm món ăn..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-[#F7F0E8] border-[#E8DDD4]"
            />
          </div>
        </form>
      )}
    </header>
  );
}
