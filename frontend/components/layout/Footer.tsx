import Link from "next/link";
import { UtensilsCrossed, Mail } from "lucide-react";
import NewsletterForm from "@/components/common/NewsletterForm";

const KEYWORD_LINKS = [
  { label: "Bánh", href: `/recipes?keyword=${encodeURIComponent("Bánh")}` },
  { label: "Bún / Phở", href: `/recipes?keyword=${encodeURIComponent("Bún")}` },
  { label: "Cơm", href: `/recipes?keyword=${encodeURIComponent("Cơm")}` },
  { label: "Canh", href: `/recipes?keyword=${encodeURIComponent("Canh")}` },
  { label: "Món Khô", href: `/recipes?keyword=${encodeURIComponent("Thịt")}` },
  { label: "Xôi", href: `/recipes?keyword=${encodeURIComponent("Xôi")}` },
  { label: "Gỏi Cuốn", href: `/recipes?keyword=${encodeURIComponent("Gỏi")}` },
  { label: "Đặc Biệt", href: `/recipes?keyword=${encodeURIComponent("Đặc biệt")}` },
];

const INFO_LINKS = [
  { label: "Về TastyVietnam", href: "/about" },
  { label: "Tất cả công thức", href: "/recipes" },
  { label: "AI Nhận diện món ăn", href: "/ai/scan" },
  { label: "Đăng công thức", href: "/recipes/new" },
];

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "#",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "#",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "#",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
        <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
      </svg>
    ),
  },
  {
    label: "GitHub",
    href: "#",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer className="bg-[#330002] mt-auto text-white/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-6">

        {/* ── 4-column grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-4">

          {/* Col 1: Brand */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2 mb-3">
              <span className="flex h-9 w-9 items-center justify-center border-2 border-white bg-[#ec2028]">
                <UtensilsCrossed className="w-5 h-5 text-white" />
              </span>
              <span className="text-lg font-display tracking-wide text-white">TastyVietnam</span>
            </Link>
            <p className="text-sm text-white/70 leading-relaxed">
              Khám phá hương vị Việt Nam qua hàng nghìn công thức nấu ăn truyền thống và hiện đại.
            </p>
          </div>

          {/* Col 2: Categories */}
          <div>
            <h4 className="font-bold text-white mb-3">Danh mục món ăn</h4>
            <ul className="grid grid-cols-2 gap-1">
              {KEYWORD_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 hover:text-white transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Info */}
          <div>
            <h4 className="font-bold text-white mb-3">Thông tin</h4>
            <ul className="space-y-1.5">
              {INFO_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 hover:text-white transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Contact */}
          <div>
            <h4 className="font-bold text-white mb-3">Liên hệ</h4>
            <a
              href="mailto:contact@vnfood.local"
              className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-[#ec2028] transition-colors duration-150 mb-4"
            >
              <Mail className="w-4 h-4" />
              contact@vnfood.local
            </a>

            <div className="flex items-center gap-3 mt-1">
              {SOCIAL_LINKS.map(({ label, href, svg }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors duration-150"
                >
                  {svg}
                </a>
              ))}
            </div>
          </div>

        </div>

        {/* ── Newsletter ── */}
        <NewsletterForm />

        {/* ── Bottom row ── */}
        <div className="border-t border-white/15 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-white/60">
            © 2026 TastyVietnam Platform. Tổng hợp từ Cookpad & cộng đồng.
          </p>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Chính sách bảo mật
            </Link>
            <span className="text-white/20">•</span>
            <Link href="/terms" className="hover:text-white transition-colors">
              Điều khoản
            </Link>
            <span className="text-white/20">•</span>
            <Link href="/contact" className="hover:text-white transition-colors">
              Liên hệ
            </Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
