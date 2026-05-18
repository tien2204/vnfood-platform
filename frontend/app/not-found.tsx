import Link from "next/link";
import { UtensilsCrossed, Home, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center py-16">
      {/* 404 */}
      <div className="relative mb-6">
        <span
          className="text-[120px] sm:text-[160px] font-bold text-[#F7F0E8] leading-none select-none"
          style={{ fontFamily: "var(--font-playfair)" }}
          aria-hidden="true"
        >
          404
        </span>
        <div className="absolute inset-0 flex items-center justify-center">
          <UtensilsCrossed className="w-16 h-16 sm:w-20 sm:h-20 text-[#E85D26]" aria-hidden="true" />
        </div>
      </div>

      <h1
        className="text-2xl sm:text-3xl font-bold text-[#1C1209] mb-3"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        Công thức bạn tìm đã bị &ldquo;ăn&rdquo; mất rồi!
      </h1>
      <p className="text-[#7C6A56] max-w-md leading-relaxed mb-8">
        Trang này không tồn tại hoặc đã bị xóa. Hãy thử tìm kiếm món ăn khác hoặc khám phá kho công thức của chúng tôi.
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/">
          <Button className="gap-2 bg-[#E85D26] hover:bg-[#D44E1E] text-white">
            <Home className="w-4 h-4" aria-hidden="true" />
            Về trang chủ
          </Button>
        </Link>
        <Link href="/recipes">
          <Button variant="outline" className="gap-2 border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white">
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Khám phá công thức
          </Button>
        </Link>
        <Link href="/search">
          <Button variant="outline" className="gap-2 border-[#E8DDD4] text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26]">
            <Search className="w-4 h-4" aria-hidden="true" />
            Tìm kiếm
          </Button>
        </Link>
      </div>
    </div>
  );
}
