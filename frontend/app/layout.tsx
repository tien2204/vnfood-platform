import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
    <html lang="vi" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen flex flex-col bg-[#FFFBF5] antialiased">
        <Navbar />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <Footer />
        <MobileBottomNav />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
