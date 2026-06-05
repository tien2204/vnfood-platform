# Thiết kế — Facet filter v2: parity 6 hạng mục monngonmoingay.com (MNMN)

**Ngày:** 2026-06-05
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Facet filter v1 (sub-project 3/3, spec `2026-06-04-facet-filter*`) đã có 4 facet (regions/occasions/dish_types/diets) crawl từ MNMN + LLM-fill, UI chip phẳng, label = slug thô. User muốn UI giống hệt trang tìm kiếm MNMN (`monngonmoingay.com/tim-kiem-mon-ngon`): **6 hạng mục** với panel dropdown checkbox theo nhóm + nút "Lọc thông tin".

**Điều tra MNMN (đã làm):** `sitemap_index.xml` có đúng 6 taxonomy sitemap khớp 6 hạng mục UI. v1 mới crawl 4; thiếu **nguyenlieu** (Nguyên liệu, 25 term) + **cachnau** (Cách nấu, 12 term). Nhóm con (Thịt/Hải Sản…) và label tiếng Việt nằm trong UI MNMN (lấy từ screenshot user cấp), KHÔNG trong sitemap.

---

## Quyết định đã chốt (với user)
- **Parity đầy đủ 6 hạng mục.** Thêm 2 taxonomy còn thiếu (Nguyên liệu, Cách nấu) qua crawl + LLM-fill. Label tiếng Việt chuẩn + nhóm con lấy từ screenshot MNMN (curated config). UI dropdown grouped-checkbox + nút Apply.
- **Correctness:** chấp nhận LLM-fill cho canonical MNMN không có (crawl = authoritative nơi MNMN có; LLM-fill phần còn lại). Không drop LLM-fill.
- **Interaction model = MNMN:** check nhiều box → staged → bấm **"Lọc thông tin" (Apply)** mới commit vào URL + refetch (khác v1 instant-on-click).
- **Bỏ chip meal (Sáng/Trưa/Tối)** — trùng Dịp lễ → Ngày → Bữa Sáng/Trưa/Tối. Giữ keyword chips + search + sort + difficulty (orthogonal).
- Cột mới `main_ingredients` + `cooking_methods` (tránh đụng bảng `recipe_ingredients`).

### Non-goals
- Không scrape lại label từ term-page title (dùng curated config từ screenshot).
- Không thêm taxonomy ngoài 6 cái MNMN.
- Không đổi keyword/search/sort/difficulty logic.

---

## Curated facet config (artifact lõi — từ screenshot MNMN + slug đã verify từ crawl)

`value` = term slug MNMN (đã xác nhận tồn tại trong sitemap term-page). Facet có `groups` (header nhóm) hoặc phẳng (1 group không header).

### 1. Nguyên liệu — `main_ingredients` (param `main_ingredient`) — có nhóm
- **Thịt:** Thịt Vịt=`thit-vit`, Thịt Bò=`mon-ngon-tu-thit-bo`, Thịt Heo=`mon-ngon-tu-thit-heo`, Thịt Gà=`mon-ngon-tu-thit-ga`, Các Loại Thịt Khác=`thit-khac`
- **Hải Sản:** Ốc=`mon-oc`, Ếch=`mon-ech`, Cá=`mon-ngon-tu-ca`, Tôm=`mon-ngon-tu-tom`, Mực/Bạch Tuộc=`mon-ngon-tu-muc`, Hải Sản Khác=`hai-san-khac`
- **Rau Củ Quả:** Các Loại Rau=`cac-loai-rau`, Cà Rốt=`mon-ngon-tu-ca-rot`, Củ Quả=`cu-qua`, Cà Chua=`mon-ngon-tu-ca-chua`, Nấm=`mon-ngon-tu-nam`, Rau Củ Quả Khác=`rau-cu-qua-khac`
- **Tinh Bột:** Phở/Bún/Hủ Tiếu/Miến=`pho-bun-hu-tieu-mien`, Gạo=`gao`, Bánh Mì=`mon-ngon-tu-banh-mi` _(Tinh Bột Khác: MNMN không có slug riêng → bỏ)_
- **Khác:** Đậu Hũ=`mon-ngon-tu-dau-hu`, Trứng=`mon-ngon-tu-trung`, Khác=`nguyen-lieu-khac`

### 2. Cách nấu — `cooking_methods` (param `cooking_method`) — phẳng
Quay/Rôti=`cac-mon-quay-ngon`, Nướng=`cac-mon-nuong-ngon`, Chiên=`cac-mon-chien-ngon`, Hấp/Tiềm=`cac-mon-hap-ngon`, Gỏi/Trộn=`cac-mon-goi-ngon`, Hầm=`cac-mon-ham-ngon`, Lẩu=`cac-mon-lau-ngon`, Món Xào=`cac-mon-xao-ngon`, Canh/Súp=`cach-mon-canh-ngon`, Om/Rim=`cac-mon-om-ngon`, Kho=`cac-mon-kho-ngon`, Khác=`cach-nau-khac`

### 3. Dịp lễ — `occasions` (param `occasion`) — có nhóm
- **Lễ Tiệc:** 20/10=`20-10`, Trung Thu=`trung-thu`, Ngày Hè=`ngay-he`, Lễ Hội Hóa Trang=`le-hoi-hoa-trang`, Tết=`mon-ngon-ngay-tet-moi`, Giáng Sinh=`mon-ngon-dip-giang-sinh`, Sinh Nhật=`mon-ngon-ngay-sinh-nhat`, Khác=`le-tiec-khac`
- **Ngày:** Bữa Sáng=`bua-sang`, Bữa Trưa=`bua-trua`, Bữa Tối=`bua-toi`, Cuối Tuần=`mon-ngon-cuoi-tuan`, Thực Đơn Hàng Ngày=`thuc-don-hang-ngay`

### 4. Món ăn — `dish_types` (param `dish_type`) — phẳng
Ăn Vặt=`an-vat`, Các Món Ăn Kèm/Món Phụ=`cac-mon-an-kem-mon-phu`, Món Chay=`cac-mon-chay-ngon`, Món Nhậu=`mon-nhau`, Món Mặn=`mon-man`

### 5. Vùng miền — `regions` (param `region`) — phẳng
Món Á=`mon-a`, Món Âu=`mon-au`, Bắc=`mon-ngon-mien-bac`, Trung=`mon-ngon-mien-trung`, Nam=`mon-ngon-mien-nam`

### 6. Theo nhu cầu dinh dưỡng — `diets` (param `diet`) — phẳng
Hỗ Trợ Tim Và Mạch Máu=`ho-tro-tim-va-mach-mau`, Hỗ Trợ Hệ Tiêu Hóa=`ho-tro-he-tieu-hoa`, Hỗ Trợ Xây Dựng Khối Cơ Xương=`ho-tro-xay-dung-khoi-co-xuong`, Hỗ Trợ Cho Thận Khỏe Mạnh=`ho-tro-cho-than-khoe-manh`, Hỗ Trợ Cho Gan Khỏe Mạnh=`ho-tro-cho-gan-khoe-manh`, Giúp Làm Việc Trí Não Hiệu Quả=`giup-lam-viec-tri-nao-hieu-qua`, Giảm Khối Mỡ Thừa Của Cơ Thể=`giam-khoi-mo-thua-cua-co-the`, Bổ Máu=`bo-mau`, Cân Bằng Dinh Dưỡng=`can-bang-dinh-duong`, Bổ Mắt=`bo-mat`, Cảm Cúm=`cam-cum`, Loãng Xương=`loang-xuong-moi`

> Slug đã tag sẵn trong DB (4 facet cũ) khớp config này. DB tag toàn bộ term sitemap (kể cả term không hiện UI — vô hại). Config chỉ định term + label + nhóm hiển thị.

---

## Components

### 1. Migration — `backend/alembic/versions/0012_recipe_facets_v2.py`
- `ADD COLUMN main_ingredients ARRAY(String) NULL`, `cooking_methods ARRAY(String) NULL`. Downgrade drop. ORM `recipe.py` thêm 2 cột (cạnh 4 cột facet cũ). (Head hiện tại là 0011 → 0012.)

### 2. Crawl — mở rộng `backend/scripts/crawl_facets.py`
- Thêm 2 entry vào `FACETS`: `main_ingredient→(nguyenlieu, main_ingredients)`, `cooking_method→(cachnau, cooking_methods)`. Logic crawl/tag không đổi (single-segment term + `/page/N/` pagination + join `cookpad_url`→`canonical_dish_slug`). `facet_vocab.json` giờ 6 key. Idempotent (rebuild union). Chạy lại full → tag 6 cột.

### 3. LLM-fill — mở rộng `backend/scripts/backfill_facets.py`
- Thêm 2 entry vào `FACETS` (desc tiếng Việt cho prompt): nguyên liệu chính, cách nấu. Cùng pattern NULL-only idempotent. Chạy → 6 facet NULL=0.

### 4. Vocab UI — `backend/scripts/gen_facets_ts.py` (viết lại) + `frontend/lib/facets.ts`
- Thay đổi: thay vì dump raw vocab phẳng, gen từ một **CONFIG hand-authored** (dict 6 facet → groups → {label, value}) đúng bảng config ở trên. Emit `facets.ts`:
  ```ts
  export type FacetTerm = { value: string; label: string };
  export type FacetGroup = { label?: string; terms: FacetTerm[] };  // label undefined = phẳng
  export type Facet = { key: string; param: string; label: string; groups: FacetGroup[] };
  export const FACETS: Facet[] = [...];  // 6 facet, thứ tự: Nguyên liệu, Cách nấu, Dịp lễ, Món ăn, Vùng miền, Dinh dưỡng
  ```
- **Verify step:** assert mọi `value` trong CONFIG có mặt trong `facet_vocab.json[facet]` (bắt typo/slug sai). CONFIG là nguồn sự thật cho UI; `facet_vocab.json` (crawl) để tag + cross-check.

### 5. API — `recipe_service.list_recipes` + `recipes.py`
- Thêm 2 param `main_ingredient`, `cooking_method` (comma-list) vào vòng overlap `&&` (allow-list cột → 6: regions/occasions/dish_types/diets/main_ingredients/cooking_methods). Endpoint forward 6 param facet. **Param `meal` của `list_recipes`/endpoint GIỮ NGUYÊN** (có thể caller khác dùng) — chỉ frontend ngừng gửi. Không đụng cột `meal_types`.

### 6. UI — `frontend/app/recipes/RecipeBrowse.tsx` + `frontend/components/recipes/FacetDropdown.tsx` (mới)
- **`FacetDropdown.tsx`** (1 panel cho 1 facet): props `facet` (config entry) + selected slugs (từ URL) + onApply(values). Render groups (header nếu có) → checkbox; staged local state; nút "Lọc thông tin" gọi onApply → commit URL; click ngoài/đóng huỷ staged.
- **`RecipeBrowse.tsx`:** hàng 6 nút category (mở/đóng 1 dropdown), counter "Hiện Bộ Lọc: N" (tổng slug đã chọn cả 6), giữ search+sort+difficulty+keyword chips. **Bỏ block meal chips + biến `meal` + `MEALS` const + ngừng gửi `meal` lên API** (chỉ frontend; backend không đụng). Đọc/ghi 6 URL param comma. Gửi 6 param vào API + effect deps. `hasFilters` gộp 6 (bỏ meal). "Xóa bộ lọc" clear cả 6.

## Data flow
```
crawl_facets (6 sitemap) → facet_vocab.json (6 key) + tag 6 cột
backfill_facets (6 facet) → NULL=0
gen_facets_ts (CONFIG curated) → facets.ts (6 facet, groups, label VN)
UI 6 nút → FacetDropdown (staged check) → Apply → ?main_ingredient=a,b&cooking_method=c&...
  → list_recipes 6× (recipes.<col> && :vals) → grid
```

## Error handling
- Crawl/backfill: như v1 (fetch fail skip, LLM lỗi→[], idempotent).
- gen verify: slug config không có trong vocab → in cảnh báo + fail (không emit facets.ts sai).
- API: param rỗng/space bỏ qua; term lạ → overlap rỗng.
- UI: Apply không chọn gì cho facet → xoá param facet đó; click ngoài huỷ staged (không commit).

## Verification
- Crawl: `facet_vocab.json` 6 key non-empty (nguyenlieu ~24, cachnau 12); tag count 6 cột.
- Backfill: 6 cột NULL=0 trên canonical.
- gen: facets.ts 6 facet đúng nhóm/label; verify slug pass.
- API: smoke mỗi facet mới (`?main_ingredient=mon-oc`, `?cooking_method=cac-mon-xao-ngon`) → card overlap; AND 2 facet.
- Frontend: `tsc` 0 lỗi mới (3 pre-existing); manual: mở từng panel, check nhiều → Apply đổi URL+grid+counter, click ngoài huỷ, "Xóa bộ lọc" clear, bỏ meal chips không vỡ layout.

## Vị trí
Nâng cấp facet filter v1 → parity 6 hạng mục MNMN. Sau khi xong: trang `/recipes` filter khớp `monngonmoingay.com/tim-kiem-mon-ngon`.

## Ghi chú vận hành
- Backend từ `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Frontend từ `frontend/`. Giữ Docker chạy khi backfill.
- KHÔNG commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json` (gồm `facet_vocab.json`). Commit `frontend/lib/facets.ts`. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
