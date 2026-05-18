import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaText?: string;
  ctaHref?: string;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  ctaText,
  ctaHref,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      <div className="w-16 h-16 rounded-full bg-[#221E19] flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-[#9A8066]" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-[#F2ECE0] mb-2">{title}</h3>
      <p className="text-sm text-[#9A8066] max-w-sm leading-relaxed mb-6">{description}</p>
      {ctaText && ctaHref && (
        <Link href={ctaHref}>
          <Button className="bg-[#E85D26] hover:bg-[#D44E1E] text-white">
            {ctaText}
          </Button>
        </Link>
      )}
    </div>
  );
}
