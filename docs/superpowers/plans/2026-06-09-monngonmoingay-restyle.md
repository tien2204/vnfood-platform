# Retheme frontend → phong cách monngonmoingay.com — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi toàn bộ UI frontend từ neo-brutalist (cam) sang clean editorial (đỏ #E4002B) giống monngonmoingay.com, đồng bộ cả 35 trang.

**Architecture:** Đổi tại gốc để lan tỏa: (1) token màu + redefine class tiện ích brutalist trong `globals.css` → mọi chỗ dùng `.restaurant-card`/`.shadow-block` tự mềm lại; (2) find-replace hex hardcode toàn cục (`#ff6b35→#e4002b`, viền `#2c1810`→token); (3) rewrite shared components (Navbar+mega-menu, Footer, RecipeCard, MobileBottomNav); (4) spot-fix homepage + RecipeBrowse; (5) verify build.

**Tech Stack:** Next.js 14 App Router, Tailwind v4 (CSS-config), shadcn/ui, Be Vietnam Pro (next/font).

**Verification model:** Restyle = visual, không TDD. Mỗi task verify bằng `npx tsc --noEmit` (không lỗi type) + cuối cùng `npm run build` + xem mắt qua `npm run dev`.

**Palette chốt (trích CSS thật monngonmoingay.com):**
| Vai trò | Hex | Nguồn |
|---|---|---|
| primary | `#ec2028` | Primary-02 |
| primary hover | `#cc1c22` | đỏ tối ~10% |
| primary-foreground | `#ffffff` | — |
| secondary (amber) | `#ec9a20` | Secondary-02 |
| secondary-foreground | `#331f00` | Secondary-01 |
| accent (hồng phớt bg) | `#fef6f6` | Primary-04 |
| accent-foreground | `#ec2028` | — |
| background | `#ffffff` | — |
| foreground | `#0a0a0a` | Gray-01 |
| muted | `#f5f5f5` | Gray-05 |
| muted-foreground | `#666666` | Gray-02 |
| border/input | `#f0f0f0` | Gray-03 |
| ring | `#ec2028` | Primary-02 |
| radius | `0.5rem` (card `rounded-xl` 12px) | `.btn` |
| brand-ink (maroon heading) | `#330002` | Primary-01 |
| brand-pink (viền/tag) | `#fbd0d2` | Primary-03 |
| healthy (tag dinh dưỡng) | `#11ca24` | app.css |

---

## Task 1: Đổi design tokens + redefine class brutalist (`app/globals.css`)

**Files:** Modify `frontend/app/globals.css`

- [ ] **Step 1: Cập nhật block `--color-brand-*` (dòng ~50-57) và `:root` (dòng ~66-99)**

Trong `@theme inline`, đổi cụm VNFood (token thật + brand utilities):
```css
  /* VNFood theme — monngonmoingay (real tokens) */
  --color-brand-primary: #ec2028;
  --color-brand-primary-hover: #cc1c22;
  --color-brand-ink: #330002;        /* maroon nhấn heading */
  --color-brand-amber: #ec9a20;      /* secondary accent */
  --color-brand-pink: #fbd0d2;       /* viền/tag mềm */
  --color-brand-pink-bg: #fef6f6;    /* nền section */
  --color-brand-cream: #fbead0;
  --color-healthy: #11ca24;          /* tag dinh dưỡng */
  --color-warm-bg: #ffffff;
  --color-warm-muted: #f5f5f5;
  --color-warm-border: #f0f0f0;

  --font-display: "Lobster", "Be Vietnam Pro", cursive;   /* logo/heading trang trí */
  --font-heading: "Open Sans", "Segoe UI", system-ui, sans-serif;
  --font-body: "Open Sans", "Segoe UI", system-ui, sans-serif;
```

Trong `:root`:
```css
  --background: #ffffff;
  --foreground: #0a0a0a;
  --card: #ffffff;
  --card-foreground: #0a0a0a;
  --popover: #ffffff;
  --popover-foreground: #0a0a0a;
  --primary: #ec2028;
  --primary-foreground: #ffffff;
  --secondary: #ec9a20;
  --secondary-foreground: #331f00;
  --muted: #f5f5f5;
  --muted-foreground: #666666;
  --accent: #fef6f6;
  --accent-foreground: #ec2028;
  --border: #f0f0f0;
  --input: #f0f0f0;
  --ring: #ec2028;
  --chart-1: #ec2028;
  --chart-2: #ec9a20;
  --chart-3: #11ca24;
  --radius: 0.5rem;
  --sidebar: #fef6f6;
  --sidebar-primary: #ec2028;
  --sidebar-accent: #ec9a20;
  --sidebar-border: #f0f0f0;
  --sidebar-ring: #ec2028;
```
(Giữ nguyên các dòng `--destructive`, `--chart-4/5`, `color-scheme`.)

- [ ] **Step 2: Heading dùng Open Sans extrabold, bỏ letter-spacing serif (dòng ~110-113)**

```css
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
    letter-spacing: -0.01em;
    font-weight: 800;
  }
  .font-display { font-family: var(--font-display); font-weight: 400; }
```

- [ ] **Step 3: Redefine cụm `@layer utilities` (dòng ~116-141) — biến brutalist → mềm**

Đây là đòn bẩy chính: mọi page dùng `.restaurant-card`/`.shadow-block` tự đẹp lại.
```css
@layer utilities {
  .shadow-warm   { box-shadow: 0 8px 24px rgba(236, 32, 40, 0.08); } /* ám đỏ như .searchform */
  .shadow-card   { box-shadow: 0 2px 8px rgba(10, 10, 10, 0.06); }
  /* hero search signature: viền hồng dày + shadow đỏ nhạt */
  .searchform-hero {
    border: 6px solid rgba(251, 208, 210, 0.5);
    box-shadow: 0 8px 24px rgba(236, 32, 40, 0.08);
    border-radius: 9999px;
  }
  /* brutalist shadows neutralized → soft */
  .shadow-block    { box-shadow: 0 4px 14px rgba(20, 16, 14, 0.08); }
  .shadow-block-sm { box-shadow: 0 1px 4px rgba(20, 16, 14, 0.06); }
  .restaurant-card {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    box-shadow: 0 2px 8px rgba(20, 16, 14, 0.06);
    transition: all 200ms ease;
  }
  .restaurant-card-hover:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px rgba(20, 16, 14, 0.12);
  }
}
```

- [ ] **Step 4: Verify** — `cd frontend && npx tsc --noEmit` → no error (CSS không ảnh hưởng type nhưng chạy để chắc dự án build). Mở `npm run dev`, xem 1 trang bất kỳ: nền trắng, thẻ bo mềm, hết viền đen cứng.

- [ ] **Step 5: Commit** — `git add frontend/app/globals.css && git commit -m "style(theme): retheme tokens to monngonmoingay red (#e4002b), soften brutalist utilities"`

---

## Task 2: Font swap (`app/layout.tsx`)

**Files:** Modify `frontend/app/layout.tsx`

- [ ] **Step 1:** Bỏ import `Playfair_Display` + `Be_Vietnam_Pro`, dùng Open Sans + Lobster.

Đổi dòng 2 + block font (dòng 7-19):
```tsx
import { Open_Sans, Lobster } from "next/font/google";

const openSans = Open_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

const lobster = Lobster({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});
```
Dòng 34: `<html lang="vi" className={`${openSans.variable} ${lobster.variable}`}>`
Dòng 35: `<body className="min-h-screen flex flex-col bg-white antialiased">`
(`--font-heading`/`--font-body` đã trỏ Open Sans, `--font-display` trỏ Lobster trong globals.css → đồng nhất.)
> NOTE execute: nếu next/font báo Lobster không có subset `vietnamese`, bỏ `latin-ext`/`vietnamese` khỏi Lobster (Lobster chỉ dùng cho logo chữ Latin "VNFood").

- [ ] **Step 2: Verify** `npx tsc --noEmit` → no error. Xem heading trang chủ: sans-serif đậm, hết serif.

- [ ] **Step 3: Commit** `git add frontend/app/layout.tsx && git commit -m "style(font): drop Playfair serif, use Be Vietnam Pro for headings"`

---

## Task 3: Find-replace hex hardcode toàn cục (19 files)

**Files:** Modify mọi `.tsx` trong `frontend/app` + `frontend/components` chứa hex cũ.

Lý do: page hardcode `#ff6b35`/`#2c1810` không ăn token nên không tự đổi. Replace có chủ đích:

- [ ] **Step 1: Replace màu cam → đỏ (an toàn, đổi mọi sắc cam thành đỏ)**

Trên thư mục `frontend/app` và `frontend/components`, thay literal:
- `#ff6b35` → `#ec2028`
- `#e55a2b` → `#cc1c22`
- `fill-[#ff6b35]` → `fill-[#ec2028]` (sau replace tự thành) — OK.

Lệnh tham chiếu (xem từng file trước khi apply):
```
rg -l "#ff6b35|#e55a2b" frontend/app frontend/components
```
Rồi dùng Edit `replace_all` trên từng file. KHÔNG đổi `#ff6b35` trong `globals.css` (đã xử lý Task 1).

- [ ] **Step 2: Mềm hóa viền brutalist nâu**

Replace literal trên cùng phạm vi:
- `border-2 border-[#2c1810]` → `border border-border`
- `border-b-2 border-[#2c1810]` → `border-b border-border`
- `border-t-2 border-[#2c1810]` → `border-t border-border`
- `rounded-none ` → `` (xóa, để radius token áp dụng) — kiểm tra không dính chữ khác.

- [ ] **Step 3: Text/nền nâu → token**
- `text-[#2c1810]` → `text-foreground`
- `text-[#6b5344]` → `text-muted-foreground`
- `bg-[#fffaf0]` → `bg-background`
- `bg-[#fff5e6]` → `bg-muted`
- `border-[#e8ddd4]` → `border-border`

(Giữ `#2D6A4F`/`#7C6A56`/`#2e7d32` xanh — là accent cộng đồng/healthy, hợp tông mới.)

- [ ] **Step 4: Verify** `rg "#ff6b35|#e55a2b|border-2 border-\[#2c1810\]" frontend/app frontend/components` → **0 kết quả**. `npx tsc --noEmit` → no error.

- [ ] **Step 5: Commit** `git add -A frontend && git commit -m "style: replace hardcoded orange/brutalist colors with red theme tokens"`

---

## Task 4: Rewrite Navbar — đỏ + mega-menu danh mục (`components/layout/Navbar.tsx`)

**Files:** Modify `frontend/components/layout/Navbar.tsx`

- [ ] **Step 1: Header + logo (dòng 54-68)** — bỏ viền đen, dùng token đỏ.
```tsx
<header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border">
  <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
    <Link href="/" className="flex items-center gap-2 shrink-0">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-sm">
        <UtensilsCrossed className="w-5 h-5 text-white" />
      </span>
      <span className="text-2xl text-primary font-display leading-none">VNFood</span>
    </Link>
```

- [ ] **Step 2: Thêm mega-menu "Danh mục" sau logo (desktop)** — dùng `DropdownMenu` đã import hoặc nhóm grid. Thêm trước form search:
```tsx
    {/* Mega-menu danh mục (desktop) */}
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
```

- [ ] **Step 2b: Định nghĩa `CATEGORY_GROUPS` ở đầu file** (sau imports, trước `getInitials`). Link sang `/recipes` với query phù hợp facet hiện có; nếu facet chưa hỗ trợ thì trỏ `/search?q=`:
```tsx
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
    { label: "Bữa cơm gia đình", href: "/recipes" },
    { label: "Món chay", href: "/search?q=chay" },
    { label: "Ăn vặt", href: "/search?q=%C4%83n%20v%E1%BA%B7t" },
    { label: "Tết", href: "/search?q=t%E1%BA%BFt" },
  ]},
] as const;
```
> NOTE khi execute: kiểm tra `app/recipes/RecipeBrowse.tsx` xem có param facet (vd `?category=`) để link chuẩn hơn `/search?q=`; nếu có, đổi href cho khớp.

- [ ] **Step 3: Search input (dòng 76-82, 233-239)** — bỏ brutalist:
```tsx
<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
<Input ... className="pl-9 bg-muted border border-border rounded-full focus-visible:ring-primary" />
```

- [ ] **Step 4: Nút AI + Auth (dòng 102-219)** — đổi sang token theo `.btn` thật (radius 8px = `rounded-lg`, viền 2px cùng màu, `font-bold`): nút AI `variant="outline"` bỏ `rounded-none border-2 border-[#2c1810] shadow-block-sm`, dùng `rounded-lg border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white`. Nút Đăng ký: `className="rounded-lg border-2 border-primary bg-primary text-white font-bold hover:bg-[#cc1c22]"`. Avatar fallback `bg-primary`. Bỏ mọi `border-2 border-[#2c1810] shadow-block-sm rounded-none`.

- [ ] **Step 4b: Retheme `components/ui/button.tsx` default theo `.btn`** — variant `default`: `rounded-lg border-2 border-primary bg-primary font-bold` hover `bg-[#cc1c22]`; `outline`: `border-2 border-primary text-primary font-bold`; `secondary`: `bg-secondary text-[#331f00] border-2 border-secondary` (amber). Đa số page gọi `<Button>` nên sửa đây lan tỏa rộng.

- [ ] **Step 5: Verify** `npx tsc --noEmit` → no error. `npm run dev`: hover "Danh mục" ra mega-menu 3 cột; navbar đỏ, bo tròn, hết viền đen.

- [ ] **Step 6: Commit** `git add frontend/components/layout/Navbar.tsx && git commit -m "feat(navbar): red theme + category mega-menu (monngonmoingay style)"`

---

## Task 5: Rewrite RecipeCard (`components/recipes/RecipeCard.tsx`)

**Files:** Modify `frontend/components/recipes/RecipeCard.tsx`

- [ ] **Step 1: DIFFICULTY_COLOR (dòng 17-21)** → token mềm:
```tsx
const DIFFICULTY_COLOR = {
  easy: "bg-accent text-white",
  medium: "bg-muted text-foreground",
  hard: "bg-primary text-white",
} as const;
```

- [ ] **Step 2: Card shell (dòng 47-51)** — `.restaurant-card` đã được redefine mềm ở Task 1 nên giữ class, chỉ bỏ `border-b-2 border-[#2c1810]` ở image wrapper:
```tsx
<div className="relative aspect-[4/3] bg-muted">
```

- [ ] **Step 3: Badges (dòng 69-105)** — bỏ `border-2 border-[#2c1810]`, badge bo tròn:
  - Cookpad badge: `... rounded-full bg-white/95 ... text-muted-foreground border border-border` ; chấm `bg-primary`.
  - Difficulty badge: `absolute bottom-2 left-2 z-10 text-xs px-2 py-0.5 rounded-full font-semibold ${DIFFICULTY_COLOR[...]}` (bỏ border-2).

- [ ] **Step 4: Content (dòng 115-127)** — `fill-[#ec2028] text-[#ec2028]` cho sao rating (sau Task 3 tự thành); title `text-foreground`; rating số `text-foreground`.

- [ ] **Step 5: Nút "Tạo biến thể" (dòng 196-207)** — `className="mt-3 w-full text-center text-xs font-medium rounded-full border border-border bg-muted text-foreground py-1.5 hover:bg-primary hover:text-white transition-colors"`

- [ ] **Step 6: Verify** `npx tsc --noEmit` → no error. Xem `/recipes`: thẻ ảnh-trên bóng mềm, hover nâng nhẹ, badge bo tròn đỏ/xanh.

- [ ] **Step 7: Commit** `git add frontend/components/recipes/RecipeCard.tsx && git commit -m "style(recipe-card): soft editorial card, rounded badges, red accents"`

---

## Task 6: Footer + MobileBottomNav (`components/layout/`)

**Files:** Modify `frontend/components/layout/Footer.tsx`, `frontend/components/layout/MobileBottomNav.tsx`

- [ ] **Step 1: Footer** — sau Task 3 đa số hex đã đổi; mở file, bỏ mọi `border-2`/`rounded-none`/`shadow-block` còn sót, nền `bg-secondary` (đỏ trầm `#8a0019`) hoặc `bg-[#1f1a17]` text trắng cho khối footer; link hover `text-primary`. Giữ layout cột hiện có.

- [ ] **Step 2: MobileBottomNav** — item active dùng `text-primary`, bỏ viền brutalist; nền `bg-white border-t border-border`.

- [ ] **Step 3: Verify** `npx tsc --noEmit` → no error. Xem footer + bottom nav (mobile viewport).

- [ ] **Step 4: Commit** `git add frontend/components/layout && git commit -m "style(footer,bottomnav): align to red editorial theme"`

---

## Task 7: Spot-fix homepage + RecipeBrowse

**Files:** Modify `frontend/app/page.tsx`, `frontend/app/recipes/RecipeBrowse.tsx`

- [ ] **Step 1: Homepage** — mở `app/page.tsx`. Sau Task 1+3 phần lớn đã đổi; rà soát hero/section: hero nền `bg-[var(--color-brand-pink-bg)]` (#fef6f6) hoặc ảnh + overlay; **ô search hero dùng class `searchform-hero`** (viền hồng 6px + shadow đỏ — chữ ký của site); tiêu đề heading Open Sans extrabold, có thể điểm chữ Lobster qua `.font-display` cho dòng nhấn. CTA `bg-primary text-white rounded-lg border-2 border-primary font-bold`. Bỏ mọi `shadow-block`/`border-2 border-[#2c1810]`/`rounded-none` còn sót → `shadow-card rounded-xl`. Section heading gạch nhấn đỏ (`border-l-4 border-primary pl-3`) cho cảm giác editorial.

- [ ] **Step 2: RecipeBrowse** — mở `app/recipes/RecipeBrowse.tsx` (17 chỗ). Filter chips/facet: `rounded-full border border-border`, active `bg-primary text-white`. Bỏ brutalist.

- [ ] **Step 3: Verify** `npx tsc --noEmit` → no error. Xem `/` và `/recipes`.

- [ ] **Step 4: Commit** `git add frontend/app/page.tsx frontend/app/recipes/RecipeBrowse.tsx && git commit -m "style(home,browse): editorial sections, rounded filter chips, red accents"`

---

## Task 8: Quét sạch tàn dư + build verify

**Files:** Mọi file còn hex/brutalist sót (search, feed, me/profile, FacetDropdown, common/*, staff/*).

- [ ] **Step 1: Tìm tàn dư**
```
rg -n "shadow-block|restaurant-card|border-2 border-\[|rounded-none|#ff6b35|#2c1810|#fff5e6|#fffaf0|#8b4513" frontend/app frontend/components
```
`.restaurant-card`/`.shadow-block` còn lại OK (đã redefine mềm). Xử lý các `border-2 border-[...]`/`rounded-none`/hex nâu-cam còn sót theo mapping Task 3.

- [ ] **Step 2: Khu /staff** — mở `app/staff/layout.tsx` + vài trang staff, đảm bảo sidebar/nav dùng token (`bg-sidebar`, `text-primary`), không còn cam.

- [ ] **Step 3: Build verify**
```
cd frontend && npx tsc --noEmit && npm run build
```
Expected: tsc no error; build success.

- [ ] **Step 4: Visual sweep** — `npm run dev`, click qua: `/`, `/recipes`, `/recipes/[id]`, `/search`, `/feed`, `/meal-plan`, `/me/profile`, `/recognize`, `/staff/dashboard`, auth pages. Mỗi trang: nền trắng, đỏ #e4002b nhất quán, thẻ mềm, font sans, không còn cam/viền đen.

- [ ] **Step 5: Commit** `git add -A frontend && git commit -m "style: sweep remaining brutalist/orange residue, verify build"`

---

## Self-review notes
- Spec coverage: token(T1), font(T2), hex-sweep(T3), Navbar+mega-menu(T4), RecipeCard(T5), Footer/BottomNav(T6), homepage+browse(T7), all-pages sweep+build(T8) — phủ hết mục 3-7 của spec.
- Mega-menu href trỏ `/search?q=` an toàn; khi execute kiểm tra facet thật của RecipeBrowse để nâng cấp link (đã note trong T4).
- Không đổi logic/data — chỉ class/màu/font. Dark mode & animation phức tạp = ngoài scope (YAGNI).
