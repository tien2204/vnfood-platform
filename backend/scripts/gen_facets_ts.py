"""Generate frontend/lib/facets.ts from a hand-authored curated CONFIG (the 6
MNMN filter categories with Vietnamese labels + group headers, from the MNMN UI).
Cross-checks every slug against cookpad_recipe/facet_vocab.json (the crawl output)
and warns on any slug missing from the crawl vocab.

Run from backend (after crawl_facets):
    python -m scripts.gen_facets_ts
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
VOCAB = ROOT / "cookpad_recipe" / "facet_vocab.json"
OUT = ROOT / "frontend" / "lib" / "facets.ts"

# Curated config: each facet -> ordered groups -> terms {label, value(slug)}.
# A group with label None renders flat (no header). Order = MNMN UI order.
CONFIG = [
    {"key": "main_ingredient", "param": "main_ingredient", "label": "Nguyên liệu", "groups": [
        {"label": "Thịt", "terms": [
            ("Thịt Vịt", "thit-vit"), ("Thịt Bò", "mon-ngon-tu-thit-bo"),
            ("Thịt Heo", "mon-ngon-tu-thit-heo"), ("Thịt Gà", "mon-ngon-tu-thit-ga"),
            ("Các Loại Thịt Khác", "thit-khac")]},
        {"label": "Hải Sản", "terms": [
            ("Ốc", "mon-oc"), ("Ếch", "mon-ech"), ("Cá", "mon-ngon-tu-ca"),
            ("Tôm", "mon-ngon-tu-tom"), ("Mực/Bạch Tuộc", "mon-ngon-tu-muc"),
            ("Hải Sản Khác", "hai-san-khac")]},
        {"label": "Rau Củ Quả", "terms": [
            ("Các Loại Rau", "cac-loai-rau"), ("Cà Rốt", "mon-ngon-tu-ca-rot"),
            ("Củ Quả", "cu-qua"), ("Cà Chua", "mon-ngon-tu-ca-chua"),
            ("Nấm", "mon-ngon-tu-nam"), ("Rau Củ Quả Khác", "rau-cu-qua-khac")]},
        {"label": "Tinh Bột", "terms": [
            ("Phở/Bún/Hủ Tiếu/Miến", "pho-bun-hu-tieu-mien"), ("Gạo", "gao"),
            ("Bánh Mì", "mon-ngon-tu-banh-mi")]},
        {"label": "Khác", "terms": [
            ("Đậu Hũ", "mon-ngon-tu-dau-hu"), ("Trứng", "mon-ngon-tu-trung"),
            ("Khác", "nguyen-lieu-khac")]},
    ]},
    {"key": "cooking_method", "param": "cooking_method", "label": "Cách nấu", "groups": [
        {"label": None, "terms": [
            ("Quay/Rôti", "cac-mon-quay-ngon"), ("Nướng", "cac-mon-nuong-ngon"),
            ("Chiên", "cac-mon-chien-ngon"), ("Hấp/Tiềm", "cac-mon-hap-ngon"),
            ("Gỏi/Trộn", "cac-mon-goi-ngon"), ("Hầm", "cac-mon-ham-ngon"),
            ("Lẩu", "cac-mon-lau-ngon"), ("Món Xào", "cac-mon-xao-ngon"),
            ("Canh/Súp", "cach-mon-canh-ngon"), ("Om/Rim", "cac-mon-om-ngon"),
            ("Kho", "cac-mon-kho-ngon"), ("Khác", "cach-nau-khac")]},
    ]},
    {"key": "occasion", "param": "occasion", "label": "Dịp lễ", "groups": [
        {"label": "Lễ Tiệc", "terms": [
            ("20/10", "20-10"), ("Trung Thu", "trung-thu"), ("Ngày Hè", "ngay-he"),
            ("Lễ Hội Hóa Trang", "le-hoi-hoa-trang"), ("Tết", "mon-ngon-ngay-tet-moi"),
            ("Giáng Sinh", "mon-ngon-dip-giang-sinh"), ("Sinh Nhật", "mon-ngon-ngay-sinh-nhat"),
            ("Khác", "le-tiec-khac")]},
        {"label": "Ngày", "terms": [
            ("Bữa Sáng", "bua-sang"), ("Bữa Trưa", "bua-trua"), ("Bữa Tối", "bua-toi"),
            ("Cuối Tuần", "mon-ngon-cuoi-tuan"), ("Thực Đơn Hàng Ngày", "thuc-don-hang-ngay")]},
    ]},
    {"key": "dish_type", "param": "dish_type", "label": "Món ăn", "groups": [
        {"label": None, "terms": [
            ("Ăn Vặt", "an-vat"), ("Các Món Ăn Kèm/Món Phụ", "cac-mon-an-kem-mon-phu"),
            ("Món Chay", "cac-mon-chay-ngon"), ("Món Nhậu", "mon-nhau"), ("Món Mặn", "mon-man")]},
    ]},
    {"key": "region", "param": "region", "label": "Vùng miền", "groups": [
        {"label": None, "terms": [
            ("Món Á", "mon-a"), ("Món Âu", "mon-au"), ("Bắc", "mon-ngon-mien-bac"),
            ("Trung", "mon-ngon-mien-trung"), ("Nam", "mon-ngon-mien-nam")]},
    ]},
    {"key": "diet", "param": "diet", "label": "Theo nhu cầu dinh dưỡng", "groups": [
        {"label": None, "terms": [
            ("Hỗ Trợ Tim Và Mạch Máu", "ho-tro-tim-va-mach-mau"),
            ("Hỗ Trợ Hệ Tiêu Hóa", "ho-tro-he-tieu-hoa"),
            ("Hỗ Trợ Xây Dựng Khối Cơ Xương", "ho-tro-xay-dung-khoi-co-xuong"),
            ("Hỗ Trợ Cho Thận Khỏe Mạnh", "ho-tro-cho-than-khoe-manh"),
            ("Hỗ Trợ Cho Gan Khỏe Mạnh", "ho-tro-cho-gan-khoe-manh"),
            ("Giúp Làm Việc Trí Não Hiệu Quả", "giup-lam-viec-tri-nao-hieu-qua"),
            ("Giảm Khối Mỡ Thừa Của Cơ Thể", "giam-khoi-mo-thua-cua-co-the"),
            ("Bổ Máu", "bo-mau"), ("Cân Bằng Dinh Dưỡng", "can-bang-dinh-duong"),
            ("Bổ Mắt", "bo-mat"), ("Cảm Cúm", "cam-cum"), ("Loãng Xương", "loang-xuong-moi")]},
    ]},
]


def main() -> None:
    vocab = json.loads(VOCAB.read_text(encoding="utf-8")) if VOCAB.exists() else {}
    # cross-check slugs against the crawl vocab
    missing = []
    for f in CONFIG:
        known = {t["value"] for t in vocab.get(f["key"], [])}
        for g in f["groups"]:
            for _label, slug in g["terms"]:
                if known and slug not in known:
                    missing.append((f["key"], slug))
    if missing:
        print("WARNING: config slugs not found in crawl vocab (verify):")
        for k, s in missing:
            print(f"  [{k}] {s}")
    # build the emitted structure
    facets = []
    total = 0
    for f in CONFIG:
        groups = []
        for g in f["groups"]:
            terms = [{"label": lbl, "value": slug} for lbl, slug in g["terms"]]
            total += len(terms)
            grp = {"terms": terms}
            if g["label"] is not None:
                grp["label"] = g["label"]
            groups.append(grp)
        facets.append({"key": f["key"], "param": f["param"], "label": f["label"], "groups": groups})
    body = (
        "// AUTO-GENERATED by backend/scripts/gen_facets_ts.py — do not edit by hand.\n"
        "export type FacetTerm = { value: string; label: string };\n"
        "export type FacetGroup = { label?: string; terms: FacetTerm[] };\n"
        "export type Facet = { key: string; param: string; label: string; groups: FacetGroup[] };\n\n"
        "export const FACETS: Facet[] = " + json.dumps(facets, ensure_ascii=False, indent=2) + ";\n"
    )
    OUT.write_text(body, encoding="utf-8")
    print(f"wrote {OUT} ({total} terms, {len(facets)} facets); missing slugs: {len(missing)}")


if __name__ == "__main__":
    main()
