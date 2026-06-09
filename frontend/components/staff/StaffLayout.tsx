"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, BookOpen, MessageSquare, Leaf, Menu, X, ChefHat,
  LogOut, ClipboardCheck, ClipboardList, FileCheck2, Inbox,
} from "lucide-react";
import { clearTokens } from "@/lib/auth";
import { useUser } from "@/lib/hooks/useUser";

interface NavItem { href: string; label: string; icon: typeof Users; exact?: boolean; }

const COLLAB_ITEMS: NavItem[] = [
  { href: "/staff/review", label: "Hàng đợi duyệt", icon: Inbox },
  { href: "/staff/proposals", label: "Đề xuất của tôi", icon: ClipboardList },
];
const ADMIN_ITEMS: NavItem[] = [
  { href: "/staff/dashboard", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/staff/admin-review", label: "Chờ đăng", icon: ClipboardCheck },
  { href: "/staff/change-requests", label: "Duyệt đề xuất", icon: FileCheck2 },
  { href: "/staff/users", label: "Người dùng", icon: Users },
  { href: "/staff/recipes", label: "Công thức", icon: BookOpen },
  { href: "/staff/comments", label: "Bình luận", icon: MessageSquare },
  { href: "/staff/ingredients", label: "Nguyên liệu", icon: Leaf },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? "bg-primary text-white shadow-sm shadow-primary/30"
               : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";
  const title = isAdmin ? "Quản trị" : "Cộng tác viên";

  async function handleLogout() {
    await clearTokens();
    router.push("/auth/staff-login");
  }

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground font-heading leading-none">VNFood</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{title}</p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {COLLAB_ITEMS.map((item) => <NavLink key={item.href} item={item} onClick={onNav} />)}
        {isAdmin && (
          <>
            <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quản trị</p>
            {ADMIN_ITEMS.map((item) => <NavLink key={item.href} item={item} onClick={onNav} />)}
          </>
        )}
      </nav>
      <div className="px-3 py-4 border-t border-border">
        <Link href="/" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all mb-1">
          <ChefHat className="w-4 h-4" />
          Về trang người dùng
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-all">
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex">
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 bg-white border-r border-border fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-border flex flex-col transform transition-transform duration-200 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-bold text-foreground font-heading">{title}</span>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto"><SidebarContent onNav={() => setSidebarOpen(false)} /></div>
      </aside>
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <span className="lg:hidden font-semibold text-foreground font-heading">VNFood {title}</span>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
