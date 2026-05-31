# Smart Shopping (deep-link) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-ingredient "buy" control to the grocery list that opens Bách Hóa Xanh → Tiki → GrabMart → ShopeeFood search for that ingredient (priority order), so the user can navigate to a shopping platform to order it.

**Architecture:** Pure frontend, no backend/migration. A new config module `frontend/lib/shopping-links.ts` holds the ordered platform list + URL builders; `GroceryItemRow` (in `GroceryList.tsx`) gains a cart button (opens Bách Hóa Xanh) plus a caret menu listing all four platforms. Opening is `window.open(url, "_blank", "noopener,noreferrer")`. Bách Hóa Xanh + Tiki have real keyword-search URLs; GrabMart/ShopeeFood are SPAs with no stable public search URL, so they open their homepage. (Cooky was dropped during design — its SSL cert is expired.)

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4 + Base UI, lucide-react icons.

**Conventions:**
- No frontend unit-test runner exists in this repo → verification = `npx tsc --noEmit` (type) + manual browser click. Known pre-existing tsc errors live in `app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx` and `.next/` generated files — ignore those.
- `GroceryItem` type (in `frontend/lib/types.ts`) has `ingredient_name: string`.
- Spec: `docs/superpowers/specs/2026-05-31-smart-shopping-design.md`.

---

## File Structure

**Create:**
- `frontend/lib/shopping-links.ts` — `SHOPPING_PLATFORMS` (ordered), `buildSearchUrl`, `openShopping`. One responsibility: map an ingredient name → a platform shopping URL and open it.

**Modify:**
- `frontend/components/meal-plan/GroceryList.tsx` — add the buy control to the `GroceryItemRow` subcomponent (cart button + caret dropdown). `useState` is already imported in this file.

**No backend, no DB migration, no new dependencies.**

---

## Task 1: Shopping-links config module

**Files:**
- Create: `frontend/lib/shopping-links.ts`

- [ ] **Step 1: Write the module**

```typescript
// Per-ingredient shopping deep-links. No ordering/cart API exists for these
// platforms, so we open a search (Cooky) or the homepage (GrabMart/ShopeeFood)
// in a new tab; the user completes the order on the platform.

export type ShoppingPlatformId = "bachhoaxanh" | "tiki" | "grabmart" | "shopeefood";

export interface ShoppingPlatform {
  id: ShoppingPlatformId;
  label: string;
  /** Build the URL to open for a given ingredient name. */
  searchUrl: (keyword: string) => string;
}

// Priority order: Bách Hóa Xanh + Tiki have real keyword search; GrabMart/ShopeeFood
// have no stable public search URL so they open their homepage. (Cooky was dropped:
// its SSL cert is expired → browser security warning.) All URLs curl-verified 200.
export const SHOPPING_PLATFORMS: ShoppingPlatform[] = [
  {
    id: "bachhoaxanh",
    label: "Bách Hóa Xanh",
    searchUrl: (kw) => `https://www.bachhoaxanh.com/tim-kiem?key=${encodeURIComponent(kw)}`,
  },
  {
    id: "tiki",
    label: "Tiki",
    searchUrl: (kw) => `https://tiki.vn/search?q=${encodeURIComponent(kw)}`,
  },
  {
    id: "grabmart",
    label: "GrabMart",
    // No stable public search-by-keyword URL → open GrabMart (VN) homepage.
    searchUrl: () => "https://food.grab.com/vn/vi/",
  },
  {
    id: "shopeefood",
    label: "ShopeeFood",
    // No stable public search-by-keyword URL → open ShopeeFood homepage.
    searchUrl: () => "https://shopeefood.vn/",
  },
];

export function buildSearchUrl(platformId: ShoppingPlatformId, ingredientName: string): string {
  const platform = SHOPPING_PLATFORMS.find((p) => p.id === platformId) ?? SHOPPING_PLATFORMS[0];
  return platform.searchUrl(ingredientName);
}

export function openShopping(platformId: ShoppingPlatformId, ingredientName: string): void {
  if (typeof window === "undefined") return;
  window.open(buildSearchUrl(platformId, ingredientName), "_blank", "noopener,noreferrer");
}
```

- [ ] **Step 2: Sanity-check the URL encoding (no FE test runner — use node)**

Run from `frontend/`:
```
node -e "const kw='Nước mắm'; console.log('https://www.bachhoaxanh.com/tim-kiem?key='+encodeURIComponent(kw))"
```
Expected output exactly:
```
https://www.bachhoaxanh.com/tim-kiem?key=N%C6%B0%E1%BB%9Bc%20m%E1%BA%AFm
```
This confirms the Bách Hóa Xanh template + encoding produce a valid URL (the module uses the same expression).

- [ ] **Step 3: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors referencing `lib/shopping-links.ts` (ignore the known pre-existing files and `.next/` generated errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/shopping-links.ts
git commit -m "feat(meal-plan): shopping deep-link config (Cooky/GrabMart/ShopeeFood)"
```
(git CWD = repo root `d:/Download_D/ĐATN 20252/demo/vnfood-platform`, branch feat/canonical-recipes. End commit body with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 2: Buy control in GroceryItemRow

**Files:**
- Modify: `frontend/components/meal-plan/GroceryList.tsx`

The `GroceryItemRow` subcomponent currently renders a checkbox + name/quantity + an action cluster `<div className="flex items-center gap-1 shrink-0">` containing an optional expand button and a delete button. We add a cart button (opens Cooky) and a caret that toggles a small dropdown of all 3 platforms.

- [ ] **Step 1: Add imports**

At the top of `GroceryList.tsx`, the lucide import line is currently:
```tsx
import { ChevronDown, ChevronUp, Trash2, Plus, Loader2 } from "lucide-react";
```
Replace it with (add `ShoppingCart`):
```tsx
import { ChevronDown, ChevronUp, Trash2, Plus, Loader2, ShoppingCart } from "lucide-react";
```
And add, after the existing `import { toast } from "sonner";` line:
```tsx
import { SHOPPING_PLATFORMS, openShopping } from "@/lib/shopping-links";
```

- [ ] **Step 2: Add menu state to `GroceryItemRow`**

`GroceryItemRow` is the function component at the bottom of the file with signature `function GroceryItemRow({ item, expanded, onToggleExpand, onCheck, onDelete }: {...})`. Add a local state hook as its first line inside the function body (before the `return`):
```tsx
  const [shopOpen, setShopOpen] = useState(false);
```
(`useState` is already imported at the top of this file.)

- [ ] **Step 3: Add the buy control to the action cluster**

Find the action cluster inside `GroceryItemRow`:
```tsx
        <div className="flex items-center gap-1 shrink-0">
          {item.from_recipes.length > 0 && (
            <button
              onClick={onToggleExpand}
              className="p-1 text-[#7C6A56] hover:text-[#E85D26] transition-colors"
              title="Từ công thức nào"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 text-[#B8A898] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
```
Replace it with (adds the cart button + caret dropdown before the delete button):
```tsx
        <div className="flex items-center gap-1 shrink-0">
          {item.from_recipes.length > 0 && (
            <button
              onClick={onToggleExpand}
              className="p-1 text-[#7C6A56] hover:text-[#E85D26] transition-colors"
              title="Từ công thức nào"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Buy: cart opens Cooky; caret reveals all platforms in priority order */}
          <div className="relative flex items-center">
            <button
              onClick={() => openShopping("bachhoaxanh", item.ingredient_name)}
              className="p-1 text-[#2D6A4F] hover:text-[#E85D26] transition-colors"
              title={`Mua "${item.ingredient_name}" trên Bách Hóa Xanh`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShopOpen((v) => !v)}
              className="px-0.5 text-[#B8A898] hover:text-[#2D6A4F] transition-colors"
              title="Chọn nền tảng mua"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            {shopOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShopOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-[#E8DDD4] bg-white shadow-lg py-1">
                  {SHOPPING_PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        openShopping(p.id, item.ingredient_name);
                        setShopOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#2D2417] hover:bg-[#F7F0E8]"
                    >
                      <ShoppingCart className="w-3 h-3 text-[#2D6A4F]" />
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={onDelete}
            className="p-1 text-[#B8A898] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
```

- [ ] **Step 4: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no NEW errors in `GroceryList.tsx` (ignore the known pre-existing files + `.next/` generated errors).

- [ ] **Step 5: Manual browser verification**

1. `cd frontend; npm run dev`; log in; open a meal plan with recipes; go to `/meal-plan/[id]/grocery`.
2. Each grocery row shows a green cart icon + a small caret.
3. Click the cart → a new tab opens `https://www.bachhoaxanh.com/tim-kiem?key=<ingredient>` (the Bách Hóa Xanh search for that ingredient).
4. Click the caret → dropdown lists "Bách Hóa Xanh", "Tiki", "GrabMart", "ShopeeFood" in that order. Tiki opens `tiki.vn/search?q=<ingredient>`; GrabMart opens `food.grab.com/vn/vi/`; ShopeeFood opens `shopeefood.vn/`. Menu closes after click and on outside-click.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/meal-plan/GroceryList.tsx
git commit -m "feat(meal-plan): per-ingredient buy button + platform menu on grocery list"
```
(End commit body with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 3: Finalize — session-state

**Files:**
- Modify: `.claude/session-state.md`

- [ ] **Step 1: Append a dated section**

Summarize: Smart shopping (sub-project 6/6) — per-ingredient buy control on grocery list, `lib/shopping-links.ts` config (Cooky search deep-link; GrabMart/ShopeeFood homepage — no stable public search URL; no ordering/cart API by platform design). Frontend-only, no migration. Note remaining sub-projects: 2 (personalization engine), 3 (substitution), 4 (cooking mode + voice), 5 (video).

- [ ] **Step 2: Commit**

```bash
git add .claude/session-state.md
git commit -m "docs: session-state update for smart shopping"
```

---

## Self-Review notes

- **Spec coverage:** config module + ordered platforms + `buildSearchUrl` → Task 1. Per-item cart (Bách Hóa Xanh primary) + caret menu of all 4 in priority order → Task 2. `window.open` new tab noopener → `openShopping` (Task 1). BHX/Tiki search URLs + GrabMart/ShopeeFood homepage → Task 1 templates. Frontend-only, no backend/migration → confirmed. User-driven fallback (menu, no auto stock detection) → caret menu (Task 2).
- **Type consistency:** `ShoppingPlatformId` (`bachhoaxanh | tiki | grabmart | shopeefood`) / `openShopping(platformId, ingredientName)` used identically in Task 1 (def) and Task 2 (call); `item.ingredient_name` matches the `GroceryItem` type.
- **Placeholder scan:** none — concrete code + commands throughout. All four URLs were curl-verified 200 + valid cert during design; manual step re-confirms live behavior.
- **Note for implementer:** if a search param turns out wrong when click-testing (Step 5), the only change needed is that platform's `searchUrl` template in `shopping-links.ts` (e.g. fall back to its homepage); everything else is independent of the exact URL.
```
