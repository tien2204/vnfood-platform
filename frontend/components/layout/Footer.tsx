import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";

const KEYWORD_LINKS = [
  { label: "Bánh", href: "/keyword/banh" },
  { label: "Bún / Phở", href: "/keyword/bun" },
  { label: "Cơm", href: "/keyword/com" },
  { label: "Canh", href: "/keyword/canh" },
  { label: "Món Khô", href: "/keyword/thit" },
  { label: "Xôi", href: "/keyword/xoi" },
  { label: "Gỏi Cuốn", href: "/keyword/goi" },
  { label: "Đặc Biệt", href: "/keyword/dac-biet" },
];

export default function Footer() {
  return (
    <footer className="bg-[#F7F0E8] border-t border-[#E8DDD4] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3">
              <UtensilsCrossed className="w-6 h-6 text-[#E85D26]" />
              <span
                className="text-lg font-bold text-[#E85D26]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                VNFood
              </span>
            </Link>
            <p className="text-sm text-[#7C6A56] leading-relaxed">
              Khám phá hương vị Việt Nam qua hàng nghìn công thức nấu ăn
              truyền thống và hiện đại.
            </p>
          </div>

          {/* Categories */}
          <div>
            <h4
              className="font-semibold text-[#1C1209] mb-3"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Danh mục món ăn
            </h4>
            <ul className="grid grid-cols-2 gap-1">
              {KEYWORD_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#7C6A56] hover:text-[#E85D26] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Links */}
          <div>
            <h4
              className="font-semibold text-[#1C1209] mb-3"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Thông tin
            </h4>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-[#7C6A56] hover:text-[#E85D26] transition-colors"
                >
                  Về VNFood
                </Link>
              </li>
              <li>
                <Link
                  href="/recipes"
                  className="text-sm text-[#7C6A56] hover:text-[#E85D26] transition-colors"
                >
                  Tất cả công thức
                </Link>
              </li>
              <li>
                <Link
                  href="/ai/scan"
                  className="text-sm text-[#7C6A56] hover:text-[#E85D26] transition-colors"
                >
                  AI Nhận diện món ăn
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[#E8DDD4] text-center text-sm text-[#7C6A56]">
          © 2025 VNFood Platform. Tổng hợp từ Cookpad & cộng đồng.
        </div>
      </div>
    </footer>
  );
}
