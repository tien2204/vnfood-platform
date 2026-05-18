"""
Crawl công thức từ Cookpad cho các danh mục chung.
Tìm kiếm: Phở, Bún, Bánh, Xôi, Canh, Cơm, Cá, Thịt, Gỏi
Chỉ lưu những công thức mà tên bắt đầu bằng từ tìm kiếm.
Dùng Playwright để bypass 403 Forbidden.

Cài đặt:
    pip install playwright requests
    playwright install chromium
"""

import json
import time
import os
import unicodedata
import requests
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ==========================================
# CẤU HÌNH
# ==========================================
SLEEP_SEC       = 4        # nghỉ giữa các lần scrape
PAGE_TIMEOUT    = 20000    # ms
OUTPUT_FOLDER   = 'cookpad_recipe'

# KEY = từ khoá TÌM KIẾM trên Cookpad (có dấu)
# VALUE = (prefix_id, tên file, từ filter có dấu)
#
# Lý do tách "từ tìm kiếm" vs "từ filter":
#   - Tìm 'phở' → Cookpad trả về đúng loại
#   - Filter 'Phở' → khớp title bắt đầu bằng 'Phở' (có dấu)
#
SEARCH_CONFIG = {
    'Phở':   ('PHO',  'pho_recipe.json',   'Phở'),
    'Bún':   ('BUN',  'bun_recipe.json',   'Bún'),
    'Bánh':  ('BANH', 'banh_recipe.json',  'Bánh'),
    'Xôi':   ('XOI',  'xoi_recipe.json',   'Xôi'),
    'Canh':  ('CANH', 'canh_recipe.json',  'Canh'),
    'Cơm':   ('COM',  'com_recipe.json',   'Cơm'),
    'Cá':    ('CA',   'ca_recipe.json',    'Cá'),
    'Thịt':  ('THIT', 'thit_recipe.json',  'Thịt'),
    'Gỏi':   ('GOI',  'goi_recipe.json',   'Gỏi'),
}

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# ==========================================
# HELPER: NORMALIZE để so sánh có dấu
# ==========================================
def normalize(text: str) -> str:
    """
    Chuẩn hoá Unicode NFC và lowercase.
    Dùng NFC (không phải NFKD) để GIỮ dấu tiếng Việt,
    chỉ thống nhất cách encode (tránh trường hợp 'ắ' encode khác nhau).
    """
    return unicodedata.normalize('NFC', text).lower().strip()


def starts_with_keyword(title: str, keyword: str) -> bool:
    """
    Kiểm tra title (có dấu) có bắt đầu bằng keyword (có dấu) không.
    Không phân biệt hoa/thường, chuẩn hoá Unicode.

    Ví dụ:
      starts_with_keyword('Bún chả Hà Nội', 'Bún') → True
      starts_with_keyword('bún bò Huế',     'Bún') → True   (không phân biệt hoa/thường)
      starts_with_keyword('Mì bún gạo lứt', 'Bún') → False
      starts_with_keyword('Bún',            'Bún') → True   (trùng chính xác)
    """
    norm_title   = normalize(title)
    norm_keyword = normalize(keyword)

    # Phải bắt đầu bằng keyword VÀ sau keyword phải là khoảng trắng hoặc hết chuỗi
    # (tránh 'Bún' match 'Búng' nếu bạn tìm 'Bún')
    if not norm_title.startswith(norm_keyword):
        return False

    # Sau keyword phải là ' ' hoặc hết chuỗi (để 'Bánh' không match 'Bánh mì' khi search 'Bán')
    rest = norm_title[len(norm_keyword):]
    return rest == '' or rest[0] == ' '


# ==========================================
# BROWSER (dùng chung 1 instance)
# ==========================================
def make_browser_context(playwright):
    browser = playwright.chromium.launch(
        headless=True,
        args=['--no-sandbox', '--disable-dev-shm-usage'],
    )
    context = browser.new_context(
        user_agent=(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/124.0.0.0 Safari/537.36'
        ),
        locale='vi-VN',
        viewport={'width': 1280, 'height': 800},
        extra_http_headers={
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Upgrade-Insecure-Requests': '1',
        }
    )
    return browser, context


# ==========================================
# 1. TÌM KIẾM + CRAWL BẰNG INFINITE SCROLL
# ==========================================
def collect_links_on_page(page, seen_urls: set) -> list[dict]:
    """Lấy tất cả link công thức hiện có trên trang, bỏ qua đã thấy."""
    new_items = []
    for link in page.query_selector_all('a[href*="/vn/cong-thuc/"]'):
        href  = link.get_attribute('href') or ''
        title = link.inner_text().strip()
        if 'tao-moi' in href or not title or len(title) < 4:
            continue
        full_url = 'https://cookpad.com' + href
        if full_url not in seen_urls:
            seen_urls.add(full_url)
            new_items.append({'title': title, 'url': full_url})
    return new_items


def search_all_recipes(page, keyword: str, max_scrolls: int = 600,
                       no_new_limit: int = 5) -> list[dict]:
    """
    Crawl bằng infinite scroll thay vì pagination.

    Cookpad dùng lazy-load khi cuộn xuống — KHÔNG có URL ?page=N thật sự.
    Mỗi lần scroll xuống cuối trang, Cookpad tự động load thêm ~30 kết quả.

    Tham số:
        max_scrolls   : số lần scroll tối đa (600 scroll ~ 18.000 kết quả)
        no_new_limit  : dừng nếu liên tiếp N lần scroll mà không có kết quả mới
    """
    search_url = f"https://cookpad.com/vn/tim-kiem/{requests.utils.quote(keyword)}"
    results    = []
    seen_urls  = set()

    try:
        print(f"      -> Load trang tìm kiếm...", end='', flush=True)
        page.goto(search_url, wait_until='domcontentloaded', timeout=PAGE_TIMEOUT)
        page.wait_for_timeout(2000)

        # Lấy kết quả lần đầu
        new_items = collect_links_on_page(page, seen_urls)
        results.extend(new_items)
        print(f" [{len(results)} kết quả ban đầu]")

    except Exception as e:
        print(f" [Lỗi load trang: {e}]")
        return results

    no_new_count = 0

    for scroll_idx in range(1, max_scrolls + 1):
        # Scroll xuống cuối trang
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        # Đợi Cookpad lazy-load thêm kết quả
        page.wait_for_timeout(3000)

        # Thu thập link mới xuất hiện
        new_items = collect_links_on_page(page, seen_urls)

        if new_items:
            results.extend(new_items)
            no_new_count = 0  # reset bộ đếm
            # XÓA IF TẠI ĐÂY, IN RA LUÔN ĐỂ DỄ THEO DÕI
            print(f"      -> Đang scroll {scroll_idx}... Lấy thêm {len(new_items)} món (Tổng: {len(results)})")
        else:
            no_new_count += 1
            print(f"      -> Scroll {scroll_idx}: Không có kết quả mới (Lần {no_new_count}/{no_new_limit})")
            if no_new_count >= no_new_limit:
                print(f"      -> Dừng scroll. Tổng thu thập: {len(results)}")
                break

    return results


# ==========================================
# 2. FILTER: title phải bắt đầu bằng keyword CÓ DẤU
# ==========================================
def filter_by_prefix(results: list[dict], keyword: str) -> list[dict]:
    """
    Giữ lại những recipe mà title bắt đầu bằng keyword (có dấu, không phân biệt hoa/thường).
    Dùng hàm starts_with_keyword để so sánh chính xác Unicode.
    """
    return [item for item in results if starts_with_keyword(item['title'], keyword)]


# ==========================================
# 3. SCRAPE CÔNG THỨC
# ==========================================
def scrape_recipe(page, url: str) -> dict | None:
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=PAGE_TIMEOUT)
        page.wait_for_timeout(1500)

        # Nguyên liệu
        ingredients = []
        for sel in [
            '[class*="ingredient"] li',
            '[id*="ingredient"] li',
            '.ingredient_list li',
            '[data-testid*="ingredient"] li',
            'ul[class*="Ingredient"] li',
        ]:
            els = page.query_selector_all(sel)
            if els:
                ingredients = [e.inner_text().strip() for e in els if e.inner_text().strip()]
                break

        # Hướng dẫn
        instructions = []
        for sel in [
            '[class*="step"] p',
            '[class*="Step"] p',
            '.step_list li',
            '[data-testid*="step"]',
            '[class*="instruction"] li',
        ]:
            els = page.query_selector_all(sel)
            if els:
                instructions = [e.inner_text().strip() for e in els if e.inner_text().strip()]
                break

        # Ảnh
        image_url = ''
        og_img = page.query_selector('meta[property="og:image"]')
        if og_img:
            image_url = og_img.get_attribute('content') or ''

        # Mô tả
        description = ''
        og_desc = (page.query_selector('meta[property="og:description"]') or
                   page.query_selector('meta[name="description"]'))
        if og_desc:
            description = og_desc.get_attribute('content') or ''

        return {
            'ingredients':  ingredients,
            'instructions': instructions,
            'description':  description,
            'image_url':    image_url,
        }

    except PWTimeout:
        print(f"          [!] Timeout scrape")
        return None
    except Exception as e:
        print(f"          [!] Lỗi scrape: {e}")
        return None


# ==========================================
# 4. MAIN
# ==========================================
def main():
    with sync_playwright() as pw:
        browser, context = make_browser_context(pw)
        page = context.new_page()

        # Warm-up: lấy cookie trước
        print("Khởi động browser, warm-up cookie Cookpad...")
        try:
            page.goto("https://cookpad.com/vn", wait_until='domcontentloaded', timeout=PAGE_TIMEOUT)
            page.wait_for_timeout(2000)
            print(f"  Trang chủ: {page.title()}\n")
        except Exception as e:
            print(f"  Cảnh báo: {e}\n")

        for search_kw, (prefix_id, filename, filter_kw) in SEARCH_CONFIG.items():
            output_file = os.path.join(OUTPUT_FOLDER, filename)

            # Resume nếu bị ngắt
            if os.path.exists(output_file):
                with open(output_file, 'r', encoding='utf-8') as f:
                    final_results = json.load(f)
                done_urls = {r['cookpad_url'] for r in final_results}
                print(f"[{prefix_id}] Resume: đã có {len(final_results)} recipes")
            else:
                final_results = []
                done_urls     = set()

            print(f"\n[{prefix_id}] Tìm kiếm '{search_kw}' | filter bắt đầu bằng '{filter_kw}'")

            # Bước 1: Crawl tất cả trang tìm kiếm
            all_results = search_all_recipes(page, search_kw)
            print(f"  -> Tổng tìm được: {len(all_results)}")

            # Bước 2: Filter — chỉ giữ title bắt đầu bằng filter_kw (có dấu)
            filtered = filter_by_prefix(all_results, filter_kw)
            print(f"  -> Sau filter '{filter_kw}': {len(filtered)} kết quả")

            # Debug: in thử 5 title đầu để kiểm tra
            if filtered:
                print(f"  -> Ví dụ: {[r['title'] for r in filtered[:5]]}")

            # Bước 3: Scrape từng công thức
            scraped_count = 0
            for idx, result in enumerate(filtered, start=1):
                url = result['url']

                if url in done_urls:
                    print(f"    [{idx}] Skip: {result['title']}")
                    continue

                recipe_id = f"{prefix_id}_{len(final_results) + 1:03d}"
                print(f"    [{idx}/{len(filtered)}] {recipe_id} | {result['title']}")

                recipe = scrape_recipe(page, url)
                if not recipe or not recipe['ingredients']:
                    print(f"          -> Không có nguyên liệu, bỏ qua")
                    time.sleep(2)
                    continue

                final_results.append({
                    'id':                  recipe_id,
                    'keyword':             search_kw,
                    'name':                result['title'],
                    'cookpad_url':         url,
                    'ingredients_display': recipe['ingredients'],
                    'description':         recipe['description'],
                    'instructions':        recipe['instructions'],
                    'image_url':           recipe['image_url'],
                })
                done_urls.add(url)
                scraped_count += 1

                print(f"          -> OK | {len(recipe['ingredients'])} nguyên liệu | {len(recipe['instructions'])} bước")

                # Ghi ngay sau mỗi món
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(final_results, f, ensure_ascii=False, indent=2)

                time.sleep(SLEEP_SEC)

            print(f"  -> Hoàn tất: +{scraped_count} mới | {len(final_results)} tổng | {output_file}\n")

        browser.close()

    print(f"\n[✓ HOÀN TẤT] Tất cả recipes đã lưu vào folder '{OUTPUT_FOLDER}'")


if __name__ == '__main__':
    main()