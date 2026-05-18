import type { Metadata } from "next";
import "./globals.css";
import ConditionalLayout from "@/components/layout/ConditionalLayout";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "VNFood — Khám phá ẩm thực Việt",
    template: "%s | VNFood",
  },
  description:
    "Hàng nghìn công thức nấu ăn Việt Nam với AI nhận diện món ăn và lập kế hoạch bữa ăn thông minh.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-screen flex flex-col bg-[#fffaf0] antialiased">
        <ConditionalLayout>{children}</ConditionalLayout>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
