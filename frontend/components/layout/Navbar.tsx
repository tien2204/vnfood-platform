"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { Search, ScanLine, UtensilsCrossed, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/lib/hooks";

export default function Navbar() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

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

  return (
    <header className="sticky top-0 z-50 bg-[#FFFBF5]/95 backdrop-blur border-b border-[#E8DDD4]">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <UtensilsCrossed className="w-7 h-7 text-[#E85D26]" />
          <span
            className="text-xl font-bold text-[#E85D26]"
            style={{ fontFamily: "var(--font-heading)" }}
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
          <Link href="/ai/scan">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-1.5 border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white"
            >
              <ScanLine className="w-4 h-4" />
              <span>AI Nhận diện</span>
            </Button>
          </Link>

          {/* Auth */}
          <Link href="/auth/login">
            <Button
              size="sm"
              className="bg-[#E85D26] hover:bg-[#D44E1E] text-white"
            >
              Đăng nhập
            </Button>
          </Link>
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
