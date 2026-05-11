"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  MessageSquare,
  Leaf,
  Menu,
  X,
  ChefHat,
  LogOut,
} from "lucide-react";
import { clearTokens } from "@/lib/auth";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Người dùng", icon: Users, exact: false },
  { href: "/admin/recipes", label: "Công thức", icon: BookOpen, exact: false },
  { href: "/admin/comments", label: "Bình luận", icon: MessageSquare, exact: false },
  { href: "/admin/ingredients", label: "Nguyên liệu", icon: Leaf, exact: false },
];

function NavLink({ item, onClick }: { item: typeof NAV_ITEMS[0]; onClick?: () => void }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
        ${active
          ? "bg-[#E85D26] text-white shadow-sm shadow-[#E85D26]/30"
          : "text-[#7C6A56] hover:bg-[#F7F0E8] hover:text-[#1C1209]"
        }
      `}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await clearTokens();
    router.push("/auth/login");
  }

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#E8DDD4]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#E85D26] rounded-lg flex items-center justify-center">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#1C1209] font-heading leading-none">VNFood</p>
            <p className="text-[10px] text-[#7C6A56] uppercase tracking-wider mt-0.5">Admin</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} onClick={onNav} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-[#E8DDD4]">
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-[#7C6A56] hover:bg-[#F7F0E8] hover:text-[#1C1209] transition-all mb-1"
        >
          <ChefHat className="w-4 h-4" />
          Về trang chủ
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-[#7C6A56] hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 bg-white border-r border-[#E8DDD4] fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E8DDD4] flex flex-col
          transform transition-transform duration-200 lg:hidden
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8DDD4]">
          <span className="font-bold text-[#1C1209] font-heading">Admin</span>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-[#F7F0E8]">
            <X className="w-4 h-4 text-[#7C6A56]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarContent onNav={() => setSidebarOpen(false)} />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-[#E8DDD4] px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-[#F7F0E8] text-[#7C6A56]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-[#1C1209] font-heading">VNFood Admin</span>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
