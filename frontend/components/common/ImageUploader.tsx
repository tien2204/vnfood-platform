"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";
import Image from "next/image";
import { Upload, X, ImageIcon } from "lucide-react";
import api from "@/lib/api";
import type { UploadResponse } from "@/lib/types";

interface Props {
  value?: string;
  onChange: (url: string) => void;
  category?: "recipe" | "step" | "avatar";
  className?: string;
  label?: string;
}

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export default function ImageUploader({
  value,
  onChange,
  category = "recipe",
  className = "",
  label = "Ảnh công thức",
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      setError("Chỉ chấp nhận jpg, png, webp");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Ảnh quá lớn (max 10MB)");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      const res = await api.post<{ success: boolean; data: UploadResponse }>(
        "/upload/image",
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      onChange(res.data.data.url);
    } catch {
      setError("Upload thất bại, thử lại");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  const previewSrc = value
    ? value.startsWith("http")
      ? value
      : `${process.env.NEXT_PUBLIC_API_URL}${value}`
    : null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-medium text-foreground">{label}</label>

      {previewSrc ? (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border bg-muted">
          <Image src={previewSrc} alt="preview" fill className="object-cover" unoptimized />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`
            w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3
            cursor-pointer transition-all duration-150
            ${dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted hover:border-primary/50 hover:bg-primary/5"
            }
          `}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Đang upload...</span>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-full bg-primary/10">
                {dragging ? (
                  <ImageIcon className="w-6 h-6 text-primary" />
                ) : (
                  <Upload className="w-6 h-6 text-primary" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Kéo thả hoặc <span className="text-primary">chọn ảnh</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WEBP — tối đa 10MB</p>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  );
}
