import Link from "next/link";
import { UtensilsCrossed, Home, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center py-16">
      {/* 404 */}
      <div className="relative mb-6">
        <span
          className="text-[120px] sm:text-[160px] font-bold text-muted leading-none select-none"
          aria-hidden="true"
        >
          404
        </span>
        <div className="absolute inset-0 flex items-center justify-center">
          <UtensilsCrossed className="w-16 h-16 sm:w-20 sm:h-20 text-primary" aria-hidden="true" />
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
        Công thức bạn tìm đã bị &ldquo;ăn&rdquo; mất rồi!
      </h1>
      <p className="text-muted-foreground max-w-md leading-relaxed mb-8">
        Trang này không tồn tại hoặc đã bị xóa. Hãy thử tìm kiếm món ăn khác hoặc khám phá kho công thức của chúng tôi.
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/">
          <Button className="gap-2 bg-primary hover:bg-[#cc1c22] text-white">
            <Home className="w-4 h-4" aria-hidden="true" />
            Về trang chủ
          </Button>
        </Link>
        <Link href="/recipes">
          <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary hover:text-white">
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Khám phá công thức
          </Button>
        </Link>
        <Link href="/search">
          <Button variant="outline" className="gap-2 border-border text-muted-foreground hover:border-primary hover:text-primary">
            <Search className="w-4 h-4" aria-hidden="true" />
            Tìm kiếm
          </Button>
        </Link>
      </div>
    </div>
  );
}
