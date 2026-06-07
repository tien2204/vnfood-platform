"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";
import MobileBottomNav from "./MobileBottomNav";
import ContextSwitcher from "./ContextSwitcher";

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Staff console + the staff login page render without the consumer chrome.
  const bare = pathname.startsWith("/staff") || pathname === "/auth/staff-login";

  // Role context-switcher is pinned to the same top-right corner on EVERY page
  // (consumer + staff), so it never shifts when switching views. It renders null
  // for logged-out / plain-user, so login pages stay clean.
  const switcher = (
    <div className="fixed top-2.5 right-3 sm:right-4 z-[60]">
      <ContextSwitcher />
    </div>
  );

  if (bare) {
    return (
      <>
        {switcher}
        {children}
      </>
    );
  }

  return (
    <>
      {switcher}
      <Navbar />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
