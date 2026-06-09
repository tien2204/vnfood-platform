"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ApiResponse, CreatedUserResponse } from "@/lib/types";

function errMsg(e: unknown, fallback: string) {
  const anyE = e as { response?: { data?: { detail?: string; error?: { message?: string } } } };
  return anyE?.response?.data?.error?.message ?? anyE?.response?.data?.detail ?? fallback;
}

export default function NewUserPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"user" | "collaborator" | "admin">("collaborator");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedUserResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<ApiResponse<CreatedUserResponse>>("/admin/users", { email, full_name: fullName, role });
      setCreated(res.data.data);
      toast.success("Đã tạo tài khoản");
    } catch (e2) {
      toast.error(errMsg(e2, "Tạo thất bại"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="max-w-md">
        <h1 className="text-xl font-bold text-[#1C1209] mb-3">Tài khoản đã tạo</h1>
        <div className="bg-white border border-[#f0f0f0] rounded-xl p-4 space-y-2">
          <p className="text-sm"><b>Email:</b> {created.user.email}</p>
          <p className="text-sm"><b>Vai trò:</b> {created.user.role}</p>
          <div className="bg-[#FFF7ED] border border-[#E85D26]/40 rounded-lg p-3">
            <p className="text-xs text-[#666666] mb-1">Mật khẩu tạm (chỉ hiển thị 1 lần — gửi cho người dùng):</p>
            <code className="text-sm font-mono text-[#1C1209] break-all">{created.temp_password}</code>
            <button onClick={() => { navigator.clipboard.writeText(created.temp_password); toast.success("Đã copy"); }} className="ml-2 text-xs text-[#E85D26] underline">Copy</button>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => router.push("/staff/users")} className="px-3 py-1.5 text-sm rounded-lg bg-[#E85D26] text-white">Về danh sách</button>
          <button onClick={() => { setCreated(null); setEmail(""); setFullName(""); setRole("collaborator"); }} className="px-3 py-1.5 text-sm rounded-lg border border-[#f0f0f0] text-[#666666]">Tạo tiếp</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <Link href="/staff/users" className="inline-block text-sm text-[#666666] hover:text-[#E85D26] mb-3">
        ← Quay lại danh sách
      </Link>
      <h1 className="text-xl font-bold text-[#1C1209] mb-4">Tạo tài khoản</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm text-[#666666] mb-1">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-[#f0f0f0] rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-[#666666] mb-1">Họ tên</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full border border-[#f0f0f0] rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-[#666666] mb-1">Vai trò</label>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-full border border-[#f0f0f0] rounded-lg px-3 py-2 text-sm">
            <option value="collaborator">Cộng tác viên</option>
            <option value="user">Người dùng</option>
            <option value="admin">Quản trị</option>
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button disabled={busy} className="px-4 py-2 rounded-lg bg-[#E85D26] text-white disabled:opacity-50">Tạo tài khoản</button>
          <button type="button" onClick={() => router.push("/staff/users")} className="px-4 py-2 rounded-lg border border-[#f0f0f0] text-[#666666] hover:bg-[#F7F0E8]">Hủy</button>
        </div>
      </form>
    </div>
  );
}
