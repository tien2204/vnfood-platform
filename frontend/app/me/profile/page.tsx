"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ImageUploader from "@/components/common/ImageUploader";
import { toast } from "sonner";
import api from "@/lib/api";
import { useUser, refreshUser } from "@/lib/hooks/useUser";
import type { ApiResponse, UserProfile } from "@/lib/types";

export default function EditProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useUser();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    api.get<ApiResponse<UserProfile>>(`/users/${user.id}/profile`)
      .then((res) => {
        const p = res.data.data;
        setProfile(p);
        setFullName(p.full_name ?? "");
        setBio(p.bio ?? "");
        setAvatarUrl(p.avatar_url ?? "");
      })
      .catch(() => {
        setFullName(user.full_name ?? "");
        setAvatarUrl(user.avatar_url ?? "");
      })
      .finally(() => setFetching(false));
  }, [user]);

  if (isLoading || fetching) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 flex justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    router.replace("/auth/login");
    return null;
  }

  const previewAvatar = avatarUrl
    ? avatarUrl.startsWith("http")
      ? avatarUrl
      : `${process.env.NEXT_PUBLIC_API_URL}${avatarUrl}`
    : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Tên hiển thị không được để trống");
      return;
    }
    setSaving(true);
    try {
      await api.put("/users/me/profile", {
        full_name: fullName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
      });
      await refreshUser();
      toast.success("Cập nhật hồ sơ thành công");
      router.push(`/users/${user?.id}`);
    } catch {
      toast.error("Cập nhật thất bại, thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 pb-24 lg:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Chỉnh sửa hồ sơ
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Cập nhật thông tin cá nhân của bạn</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar section */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4" />
            Ảnh đại diện
          </h2>

          <div className="flex items-center gap-4 mb-4">
            <Avatar className="w-16 h-16 shrink-0">
              <AvatarImage src={previewAvatar} alt={fullName} />
              <AvatarFallback className="bg-primary text-white text-xl font-bold">
                {fullName?.charAt(0)?.toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-foreground">{fullName || "Tên hiển thị"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ảnh hiển thị trên toàn bộ trang</p>
            </div>
          </div>

          <ImageUploader
            value={avatarUrl}
            onChange={setAvatarUrl}
            category="avatar"
            label="Tải ảnh đại diện mới"
            className="max-w-sm"
          />
        </div>

        {/* Profile info */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Thông tin cá nhân</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Tên hiển thị <span className="text-red-500">*</span>
            </label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              maxLength={100}
              className="border-border focus-visible:ring-primary"
            />
            <p className="text-xs text-muted-foreground">{fullName.length}/100 ký tự</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Giới thiệu bản thân</label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tôi yêu thích nấu ăn và khám phá ẩm thực Việt Nam..."
              maxLength={500}
              rows={3}
              className="resize-none border-border focus-visible:ring-primary"
            />
            <p className="text-xs text-muted-foreground">{bio.length}/500 ký tự</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="flex-1 border-border text-muted-foreground"
          >
            Hủy
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary hover:bg-[#cc1c22] text-white gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </div>
  );
}
