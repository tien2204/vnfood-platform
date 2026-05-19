"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

  // Always call the latest onSearch via ref so a new inline arrow function
  // from the parent doesn't retrigger the effect on every parent re-render
  // (which would call onSearch('') and stomp on other URL params like page).
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Fire only when the debounced VALUE changes (not when callback reference
  // changes). Initialize with initialValue so the first run is a no-op.
  const lastFiredRef = useRef<string>(initialValue);
  useEffect(() => {
    if (lastFiredRef.current === debounced) return;
    lastFiredRef.current = debounced;

    if (autoNavigate && debounced.trim()) {
      router.push(`/search?q=${encodeURIComponent(debounced.trim())}`);
    }
    onSearchRef.current?.(debounced);
  }, [debounced, autoNavigate, router]);

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
