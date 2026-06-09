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
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">{description}</p>
      {ctaText && ctaHref && (
        <Link href={ctaHref}>
          <Button className="bg-primary hover:bg-[#cc1c22] text-white">
            {ctaText}
          </Button>
        </Link>
      )}
    </div>
  );
}
