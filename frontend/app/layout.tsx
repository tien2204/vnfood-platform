import type { Metadata } from "next";
import { Open_Sans, Lobster } from "next/font/google";
import "./globals.css";
import ConditionalLayout from "@/components/layout/ConditionalLayout";
import { Toaster } from "@/components/ui/sonner";

const openSans = Open_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

const lobster = Lobster({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

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
    <html lang="vi" className={`${openSans.variable} ${lobster.variable}`}>
      <body className="min-h-screen flex flex-col bg-white antialiased">
        <ConditionalLayout>{children}</ConditionalLayout>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
