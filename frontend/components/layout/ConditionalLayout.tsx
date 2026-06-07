"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";
import MobileBottomNav from "./MobileBottomNav";

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Staff console + the staff login page render without the consumer chrome.
  const bare = pathname.startsWith("/staff") || pathname === "/auth/staff-login";

  if (bare) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
