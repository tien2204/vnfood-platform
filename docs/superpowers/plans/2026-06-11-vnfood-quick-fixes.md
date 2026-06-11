# VNFood Quick Fixes (#1–#4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the login 404, let both upload surfaces accept an image URL or a file, replace the hero headline, and remove all "search by ingredient" surfaces.

**Architecture:** Frontend-only changes plus one already-existing backend endpoint reuse. No DB changes. The AI-recognize URL backend (`POST /api/v1/ai/recognize-url`) and recipe-image URL storage already exist — we only wire the frontend.

**Tech Stack:** Next.js 16.2.4 (App Router) + TypeScript + Tailwind; axios (`@/lib/api`); FastAPI backend (untouched here).

**Verification model:** This repo has no component test runner. Each task verifies via `npx tsc --noEmit` (in `frontend/`) plus explicit manual browser checks. Commit after each task.

---

## Task 1: Fix login 404 — migrate `middleware.ts` → `proxy.ts` (Next 16)

**Context:** Next 16 deprecated the `middleware.ts` filename and `middleware` export, renaming them to `proxy.ts` / `proxy()` (Next 16 upgrade guide). The repo still ships `frontend/middleware.ts`; the dev log shows the proxy phase running then `/auth/login` 404. Confirm before assuming.

**Files:**
- Rename: `frontend/middleware.ts` → `frontend/proxy.ts`
- Modify: the function export name inside it

- [ ] **Step 1: Reproduce and confirm the cause**

Run the dev server and capture the failing request:
```bash
cd frontend && npm run dev
```
In a browser, open `http://localhost:3000/auth/login`. Confirm the 404 and note the terminal log line.
Expected: `GET /auth/login 404` reproduced. If `/auth/login` already returns 200, STOP — the 404 was stale `.next/dev`; instead run `rm -rf .next/dev` (PowerShell: `Remove-Item -Recurse -Force .next/dev`), restart, and skip to Step 5.

- [ ] **Step 2: Rename the file**

```bash
git mv frontend/middleware.ts frontend/proxy.ts
```

- [ ] **Step 3: Rename the export from `middleware` to `proxy`**

In `frontend/proxy.ts`, change the function declaration (keep the body and the exported `config` matcher identical):
```ts
// Before
export function middleware(request: NextRequest) {

// After
export function proxy(request: NextRequest) {
```
Leave everything else (imports, `decodeJWT`, the `config` matcher export) unchanged.

- [ ] **Step 4: Restart the dev server fresh**

```bash
# stop the running dev server (Ctrl+C), then:
cd frontend && rm -rf .next/dev && npm run dev
```
(PowerShell: `Remove-Item -Recurse -Force .next/dev`)

- [ ] **Step 5: Verify the login page loads**

In the browser:
- `http://localhost:3000/auth/login` → renders the login form (HTTP 200), no 404.
- Click "Đăng nhập" in the navbar → lands on the login page.
- Visit a protected route while logged out, e.g. `http://localhost:3000/meal-plan` → still redirects to `/auth/login?next=...` (proxy logic intact).

Expected: login page renders; protected-route redirect still works.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/proxy.ts
git commit -m "fix(auth): migrate middleware.ts to Next 16 proxy.ts (fixes /auth/login 404)"
```

---

## Task 2: AI-detect upload accepts an image URL (recognize page)

**Context:** `ImageDropzone` currently only emits a `File`. The recognize page posts to `/ai/recognize`. The backend already has `POST /api/v1/ai/recognize-url` taking `{ image_url }`. Add an optional URL input to the dropzone and wire the recognize page to the URL endpoint.

**Files:**
- Modify: `frontend/components/ai/ImageDropzone.tsx`
- Modify: `frontend/app/recognize/page.tsx`

- [ ] **Step 1: Add an optional URL input to `ImageDropzone`**

In `frontend/components/ai/ImageDropzone.tsx`, extend the props and render a URL field under the dropzone. Replace the `interface Props` block:
```tsx
interface Props {
  onSelect: (file: File) => void;
  onSelectUrl?: (url: string) => void;
  disabled?: boolean;
}
```
Inside the component, add URL state after the existing `error` state:
```tsx
  const [url, setUrl] = useState("");
```
Add a submit handler after `handleDrop`:
```tsx
  const handleUrlSubmit = useCallback(() => {
    const trimmed = url.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError("URL ảnh không hợp lệ (phải bắt đầu bằng http/https)");
      return;
    }
    setError(null);
    onSelectUrl?.(trimmed);
  }, [url, onSelectUrl]);
```
Then, immediately AFTER the closing `</div>` of the dropzone container and BEFORE the `{error && (...)}` block, insert the URL row (only when `onSelectUrl` is provided):
```tsx
      {onSelectUrl && (
        <div className="w-full max-w-xl flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            placeholder="hoặc dán URL ảnh (https://...)"
            className="flex-1 h-10 px-3 rounded-lg border border-border bg-muted text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleUrlSubmit(); } }}
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            disabled={disabled || !url.trim()}
            className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            Dùng URL
          </button>
        </div>
      )}
```

- [ ] **Step 2: Wire the recognize page to the URL endpoint**

In `frontend/app/recognize/page.tsx`, add a URL handler next to `handleSelect`:
```tsx
  const handleSelectUrl = useCallback(async (url: string) => {
    setPreview(url);
    setState("loading");
    setResult(null);
    try {
      const res = await api.post("/ai/recognize-url", { image_url: url });
      setResult(res.data.data as AIRecognitionResult);
      setState("done");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Nhận diện thất bại, thử lại sau";
      toast.error(msg);
      setState("error");
    }
  }, []);
```
Then pass it to the dropzone — replace the existing render:
```tsx
          <ImageDropzone onSelect={handleSelect} onSelectUrl={handleSelectUrl} disabled={isLoading} />
```

- [ ] **Step 3: Guard the preview cleanup for URLs**

In `handleReset`, `URL.revokeObjectURL(preview)` must not run on a plain URL string. Replace the reset body:
```tsx
  const handleReset = useCallback(() => {
    if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(null);
    setResult(null);
    setState("idle");
  }, [preview]);
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verify**

With backend + frontend running, open `http://localhost:3000/recognize`:
- Paste a public food-image URL (e.g. one of the Unsplash URLs in `app/page.tsx`) → "Dùng URL" → recognition runs and shows a result + suggested recipes.
- File upload path still works (drag/drop or click).
- An invalid URL (e.g. `abc`) shows the inline error and does not call the API.

Expected: all three behaviors as described.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ai/ImageDropzone.tsx frontend/app/recognize/page.tsx
git commit -m "feat(ai): accept image URL in AI recognize dropzone"
```

---

## Task 3: Recipe-image uploader accepts an image URL

**Context:** `ImageUploader` (used by `RecipeForm`) only uploads files via `POST /upload/image` and stores the returned URL string. Its preview already handles `http`-prefixed values. Add a URL input that calls `onChange(url)` directly — no upload, no backend change.

**Files:**
- Modify: `frontend/components/common/ImageUploader.tsx`

- [ ] **Step 1: Add URL state**

In `frontend/components/common/ImageUploader.tsx`, after the existing `const [error, ...]` line, add:
```tsx
  const [urlInput, setUrlInput] = useState("");
```

- [ ] **Step 2: Add a URL submit handler**

After the `onInputChange` function, add:
```tsx
  function handleUrlSubmit() {
    const trimmed = urlInput.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError("URL ảnh không hợp lệ (http/https)");
      return;
    }
    setError(null);
    onChange(trimmed);
    setUrlInput("");
  }
```

- [ ] **Step 3: Render the URL row when no image is set**

The empty-state dropzone renders only when `!previewSrc`. Add the URL row directly AFTER the closing `)}` of the `previewSrc ? (...) : (...)` ternary and BEFORE the `{error && ...}` line, so users can paste a URL instead of uploading:
```tsx
      {!previewSrc && (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="hoặc dán URL ảnh (https://...)"
            className="flex-1 h-9 px-3 rounded-lg border border-border bg-muted text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleUrlSubmit(); } }}
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim()}
            className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            Dùng URL
          </button>
        </div>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verify**

Open the recipe create/edit form (e.g. `http://localhost:3000/recipes/new` or an edit page that renders `RecipeForm`):
- Paste an image URL → "Dùng URL" → preview shows the remote image; the form value is the URL.
- The X button clears it back to the empty state with the URL row again.
- File upload still works and still stores the uploaded URL.

Expected: all behaviors as described.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/common/ImageUploader.tsx
git commit -m "feat(recipe): accept image URL in recipe image uploader"
```

---

## Task 4: Replace the hero headline

**Context:** `app/page.tsx` hero currently reads "Thưởng thức công thức Việt theo phong cách nhà hàng." Replace with a short intro to the system's purpose (dish recognition + recipe advice), preserving the red-italic emphasis style.

**Files:**
- Modify: `frontend/app/page.tsx:103-107`

- [ ] **Step 1: Replace the `<h1>`**

In `frontend/app/page.tsx`, replace the hero heading block:
```tsx
            <h1 className="mb-6 max-w-2xl text-4xl font-extrabold leading-tight text-foreground sm:text-5xl lg:text-6xl">
              Thưởng thức{" "}
              <strong className="text-primary font-display font-normal">công thức Việt</strong> theo
              phong cách nhà hàng.
            </h1>
```
with:
```tsx
            <h1 className="mb-6 max-w-2xl text-4xl font-extrabold leading-tight text-foreground sm:text-5xl lg:text-6xl">
              Chụp ảnh món ăn,{" "}
              <strong className="text-primary font-display font-normal">AI nhận diện</strong> và{" "}
              <strong className="text-primary font-display font-normal">gợi ý công thức</strong> nấu ngay.
            </h1>
```

- [ ] **Step 2: Verify no leftover old copy**

Run: `cd frontend && rg "phong cách nhà hàng"`
Expected: no matches.

- [ ] **Step 3: Manual verify**

Open `http://localhost:3000/` → hero shows the new headline with "AI nhận diện" and "gợi ý công thức" in red. Sub-text, search bar, buttons unchanged.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "style(home): replace hero headline with system intro (dish recognition + recipe advice)"
```

---

## Task 5: Remove all "search by ingredient" surfaces

**Context:** Three surfaces expose ingredient-based search. Remove the facet filter and the navbar group; `/suggest` already has no entry point (leave the page dormant, just confirm nothing links to it).

**Files:**
- Modify: `frontend/app/recipes/RecipeBrowse.tsx` (filter out the `main_ingredient` facet)
- Modify: `frontend/components/layout/Navbar.tsx` (remove the "Nguyên liệu" mega-menu group)

- [ ] **Step 1: Hide the `main_ingredient` facet in the browse bar**

In `frontend/app/recipes/RecipeBrowse.tsx`, the facets come from `import { FACETS } from "@/lib/facets"` (line 19) and are iterated in three places (`FACETS.forEach` ~line 101, `FACETS.reduce` ~line 131, `FACETS.map` ~line 281). `lib/facets.ts` is auto-generated — do NOT edit it. Instead add a filtered constant right after the imports (top-level, above the component):
```tsx
const VISIBLE_FACETS = FACETS.filter((f) => f.key !== "main_ingredient");
```
Then replace the three `FACETS` usages that drive the UI/active-filter count with `VISIBLE_FACETS`:
- `FACETS.forEach((f) => {` → `VISIBLE_FACETS.forEach((f) => {`
- `const facetCount = FACETS.reduce(` → `const facetCount = VISIBLE_FACETS.reduce(`
- `{FACETS.map((f) => (` → `{VISIBLE_FACETS.map((f) => (`

Read the surrounding lines first to confirm these are the only three references and that each is the UI/derived-state usage.

- [ ] **Step 2: Remove the navbar "Nguyên liệu" mega-menu group**

In `frontend/components/layout/Navbar.tsx`, delete the first object in `CATEGORY_GROUPS` (lines 21–27):
```tsx
  { title: "Nguyên liệu", items: [
    { label: "Thịt bò", href: "/search?q=b%C3%B2" },
    { label: "Thịt heo", href: "/search?q=heo" },
    { label: "Thịt gà", href: "/search?q=g%C3%A0" },
    { label: "Hải sản", href: "/search?q=h%E1%BA%A3i%20s%E1%BA%A3n" },
    { label: "Rau củ", href: "/search?q=rau" },
  ]},
```
Leave the "Cách nấu" and "Bữa & dịp" groups. The mega-menu grid uses `grid-cols-3`; with two groups it still renders fine (two columns occupied). If you prefer tighter layout, that is optional and out of scope.

- [ ] **Step 3: Confirm `/suggest` has no entry point**

Run: `cd frontend && rg -n "\"/suggest\"|'/suggest'|href=\{?[\"'\`]/suggest|push\(\"/suggest"`
Expected: no matches (only `app/suggest/page.tsx` itself exists, unlinked). No code change needed — page stays dormant.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verify**

- `http://localhost:3000/recipes` → facet bar no longer shows the "Nguyên liệu" dropdown; other facets and search still work.
- Navbar "Danh mục" mega-menu → no "Nguyên liệu" column; "Cách nấu" and "Bữa & dịp" remain.
- No UI path leads to `/suggest`.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/recipes/RecipeBrowse.tsx frontend/components/layout/Navbar.tsx
git commit -m "feat(search): remove search-by-ingredient surfaces (facet + navbar group)"
```

---

## Self-Review Notes

- **Spec coverage:** #1 (Task 1), #2 (Tasks 2–3, both surfaces), #3 (Task 4), #4 (Task 5, all three surfaces). #5 is a separate plan (`2026-06-11-vnfood-role-collapse.md`).
- **No placeholders:** all steps contain concrete code/commands.
- **Type consistency:** new prop `onSelectUrl?: (url: string) => void` is defined in `ImageDropzone` (Task 2 Step 1) and consumed in the recognize page (Task 2 Step 2). `recognize-url` request shape `{ image_url }` matches the backend `RecognizeUrlRequest` in `backend/app/api/v1/ai.py:55`.
- **Dependency:** Task 1 (proxy rename) should land first so login/testing works; Tasks 2–5 are independent of each other.
