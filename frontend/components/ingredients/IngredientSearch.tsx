"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import api from "@/lib/api";
import type { IngredientItem } from "@/lib/types";

interface Props {
  selectedNames: Set<string>;
  onAdd: (name: string) => void;
}

export default function IngredientSearch({ selectedNames, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<IngredientItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/ingredients/search`, { params: { q: query, limit: 10 } });
        setSuggestions(res.data.data ?? []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(name: string) {
    onAdd(name);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Tìm nguyên liệu..."
          className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
          aria-label="Tìm nguyên liệu"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 top-full mt-1.5 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto"
        >
          {suggestions.map((item) => {
            const already = selectedNames.has(item.name);
            return (
              <li key={item.name} role="option" aria-selected={already}>
                <button
                  type="button"
                  onClick={() => !already && handleSelect(item.name)}
                  disabled={already}
                  className={[
                    "w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors",
                    already
                      ? "text-muted-foreground bg-muted cursor-default"
                      : "text-foreground hover:bg-[#fef6f6] hover:text-primary cursor-pointer",
                  ].join(" ")}
                >
                  <span>{item.name}</span>
                  {already ? (
                    <span className="text-[10px] text-primary font-medium">Đã chọn</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{item.usage_count} món</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
