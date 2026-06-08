# Design Spec — Retheme frontend theo phong cách monngonmoingay.com

> Ngày: 2026-06-09 · Branch: feat/canonical-recipes · Mục tiêu: đổi toàn bộ UI frontend
> từ neo-brutalist (cam) sang phong cách clean editorial (đỏ) giống monngonmoingay.com,
> **đồng bộ tất cả trang** (không chỉ homepage).

## 1. Quyết định đã chốt

- **Độ thay đổi:** Retheme toàn bộ — bỏ hẳn neo-brutalist (viền đen 2px, shadow-block cứng).
- **Màu thương hiệu:** Đỏ cà chua `#ec2028` (trích CSS thật, biến `--Primary-02`).
- **Font:** Open Sans (body/heading) + Lobster (logo/heading trang trí) — đúng site.
- **Accent:** giữ cặp đỏ + amber `#ec9a20` + xanh healthy `#11ca24` như hệ màu thật.

## 2. Phong cách tham chiếu THẬT (trích `dist.css`/`app.css` — site dùng Tailwind)

- **Màu (biến gốc `:root`):** `--Primary-01 #330002` (maroon nhấn tiêu đề) · `--Primary-02 #ec2028` (đỏ chủ đạo) · `--Primary-03 #fbd0d2` (hồng nhạt viền/tag) · `--Primary-04 #fef6f6` (hồng phớt nền section) · `--Secondary-02 #ec9a20` (amber) · `--Secondary-03/04 #fbead0/#fefbf6` (kem) · `--Gray-01 #0a0a0a` · `--Gray-02 #666` · `--Gray-03 #f0f0f0` (viền) · `--Gray-05 #f5f5f5` · xanh healthy `#11ca24`.
- **Typography:** Open Sans 400–800 + Lobster (display). Size base 16 / sm 14 / xs 12; heading 21 / 32 / 40px.
- **Button (`.btn`):** `border-radius: .5rem` (8px), `border-width: 2px`, `font-weight: 700`, `padding: .5rem 1rem`, `gap: .5rem`, inline-flex. `.btn-primary` = nền `#ec2028` chữ trắng. (Bo vừa + viền 2px + đậm — không pill, không brutalist.)
- **Search (`.searchform`):** đặc trưng — `border: 6px solid rgba(251,208,210,.5)` (hồng-03 mờ), `box-shadow: 0 8px 24px #ec202814` (shadow đỏ rất nhạt), rộng ~622px, `margin-top: -18px` (đè lên hero).
- **Card:** `rounded-xl` (12px), bóng mềm, hover nâng. **Container:** ~1280–1390px.

## 3. Design tokens mới (`app/globals.css`) — ánh xạ token thật → shadcn

| shadcn token | Giá trị mới | Nguồn (site) |
|---|---|---|
| `--primary` | `#ec2028` | Primary-02 |
| `--primary-foreground` | `#ffffff` | — |
| primary hover | `#cc1c22` | đỏ tối ~10% |
| `--secondary` | `#ec9a20` | Secondary-02 (amber) |
| `--secondary-foreground` | `#331f00` | Secondary-01 |
| `--accent` | `#fef6f6` | Primary-04 (hồng phớt, bg hover) |
| `--accent-foreground` | `#ec2028` | — |
| `--background` | `#ffffff` | — |
| `--foreground` | `#0a0a0a` | Gray-01 |
| `--muted` | `#f5f5f5` | Gray-05 |
| `--muted-foreground` | `#666666` | Gray-02 |
| `--border` / `--input` | `#f0f0f0` | Gray-03 |
| `--ring` | `#ec2028` | Primary-02 |
| `--radius` | `0.5rem` (8px control); card `rounded-xl` 12px | `.btn`/card |

**Brand utilities thêm vào `@theme inline`:** `--color-brand-ink: #330002` (maroon nhấn heading), `--color-brand-amber: #ec9a20`, `--color-brand-pink: #fbd0d2`, `--color-brand-pink-bg: #fef6f6`, `--color-brand-cream: #fbead0`, `--color-healthy: #11ca24`.

**Shadow:** thay brutalist bằng mềm + tông đỏ như site:
- `--shadow-card`: `0 2px 8px rgba(10,10,10,.06)`
- `--shadow-warm`: `0 8px 24px rgba(236,32,40,.08)` (ám đỏ giống `.searchform`)
- Redefine `.shadow-block`, `.shadow-block-sm`, `.restaurant-card`, `.restaurant-card-hover` → mềm; trang đang dùng tự đẹp lại.

**Font:** bỏ Playfair + Be Vietnam Pro. **Open Sans** (next/font, weight 400–800, subset vietnamese) cho body + heading; **Lobster** (weight 400, subset vietnamese) cho logo "VNFood" + heading trang trí (class `.font-display`).

## 4. Components dùng chung cần sửa

1. **`app/layout.tsx`** — bỏ Playfair, set `--font-heading` = Be Vietnam Pro, body bg trắng.
2. **`components/layout/Navbar.tsx`** — đổi màu sang đỏ; thêm **mega-menu** "Danh mục" với các nhóm phân loại, link sang `/recipes?...` (theo facet/search hiện có) và `/search`.
3. **`components/layout/Footer.tsx`** — đỏ + layout sạch, bỏ viền brutalist.
4. **`components/layout/MobileBottomNav.tsx`** — màu đỏ active.
5. **`components/recipes/RecipeCard.tsx`** — thẻ ảnh-trên bóng mềm, badge đỏ, hover nâng nhẹ.
6. **`components/ui/button.tsx`, `card.tsx`, `badge.tsx`** — variant mặc định theo token mới (đa số đã dùng token nên ít sửa).

## 5. Pages còn hardcode brutalist (spot-fix)

Ưu tiên cao (nhiều class brutalist): `app/page.tsx` (homepage), `app/recipes/RecipeBrowse.tsx`,
`components/layout/*`. Trung bình: `app/search`, `app/feed`, `app/me/profile`, `components/recipes/FacetDropdown.tsx`,
`components/common/*`. Còn lại đa số ăn theo token tự đổi.

Cách xử lý: thay `border-2 border-[#2c1810] shadow-block` → `border border-border shadow-card rounded-xl`;
`#ff6b35`/`#2c1810` hardcode → class token (`bg-primary`, `text-foreground`...).

## 6. Phạm vi & không làm

- **Trong phạm vi:** màu, font, bóng, bo góc, mega-menu, thẻ recipe, đồng bộ 35 trang (gồm cả khu `/staff`).
- **Ngoài phạm vi (YAGNI):** thay đổi logic/data, thêm trang mới, animation phức tạp, dark mode.

## 7. Thứ tự thực thi

1. globals.css (tokens + shadow + redefine class brutalist) — lan tỏa ngay.
2. layout.tsx (font).
3. Shared components: Navbar (+mega-menu), Footer, RecipeCard, MobileBottomNav.
4. Spot-fix homepage + RecipeBrowse.
5. Quét nốt các trang còn hardcode màu.
6. `npm run build` / `tsc --noEmit` verify không vỡ.
