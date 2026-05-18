"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/lib/hooks";

interface Props {
  placeholder?: string;
  autoNavigate?: boolean;
  initialValue?: string;
  onSearch?: (query: string) => void;
  className?: string;
}

export default function SearchBar({
  placeholder = "Tìm kiếm món ăn...",
  autoNavigate = false,
  initialValue = "",
  onSearch,
  className,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    if (autoNavigate && debounced.trim()) {
      router.push(`/search?q=${encodeURIComponent(debounced.trim())}`);
    }
    if (onSearch) onSearch(debounced);
  }, [debounced, autoNavigate, router, onSearch]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    },
    [query, router]
  );

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#ff6b35]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-12 pr-4 h-12 text-base bg-white border-2 border-[#2c1810] focus-visible:ring-[#ff6b35] rounded-none shadow-block-sm placeholder:text-[#6b5344]"
        />
      </div>
    </form>
  );
}
