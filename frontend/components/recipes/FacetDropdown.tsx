"use client";

import { useState, useEffect, useRef } from "react";
import type { Facet } from "@/lib/facets";

interface Props {
  facet: Facet;
  selected: string[];               // committed slugs (from URL)
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onApply: (values: string[]) => void;
}

export default function FacetDropdown({
  facet, selected, open, onToggleOpen, onClose, onApply,
}: Props) {
  const [staged, setStaged] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);

  // re-sync staged selection whenever the panel (re)opens or the URL changes
  useEffect(() => {
    if (open) setStaged(selected);
  }, [open, selected]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  const count = selected.length;
  const toggle = (v: string) =>
    setStaged((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        // stop mousedown from reaching the document outside-click handler of
        // another open panel — switching facets should not flicker close→open
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onToggleOpen}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
          count > 0
            ? "bg-primary text-white border-primary"
            : "bg-card text-foreground border-border hover:border-primary"
        }`}
      >
        {facet.label}
        {count > 0 ? ` (${count})` : ""}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[min(92vw,28rem)] rounded-xl border border-border bg-card p-4 shadow-warm">
          {facet.groups.map((g, gi) => (
            <div key={gi} className="mb-3 last:mb-0">
              {g.label && (
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {g.terms.map((t) => (
                  <label
                    key={t.value}
                    className={`flex cursor-pointer items-center gap-2 text-sm hover:bg-muted rounded px-1 -mx-1 transition-colors ${staged.includes(t.value) ? "text-primary font-semibold" : "text-foreground"}`}
                  >
                    <input
                      type="checkbox"
                      checked={staged.includes(t.value)}
                      onChange={() => toggle(t.value)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              onApply(staged);
              onClose();
            }}
            className="mt-3 w-full rounded-lg border border-primary bg-primary py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
          >
            Lọc thông tin
          </button>
        </div>
      )}
    </div>
  );
}
