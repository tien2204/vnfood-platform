"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

interface Props {
  onSelect: (file: File) => void;
  disabled?: boolean;
}

const MAX_SIZE = 10 * 1024 * 1024;

export default function ImageDropzone({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Chỉ chấp nhận file ảnh (JPG, PNG, WebP...)";
    if (file.size > MAX_SIZE) return "Ảnh quá lớn, tối đa 10MB";
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      onSelect(file);
    },
    [onSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={[
          "w-full max-w-xl rounded-2xl border-2 border-dashed p-12 text-center",
          "transition-all duration-200 select-none",
          disabled
            ? "opacity-50 cursor-not-allowed border-[#f0f0f0] bg-[#F7F0E8]"
            : isDragging
            ? "cursor-copy border-[#E85D26] bg-[#FFF3EE] scale-[1.02] shadow-lg"
            : "cursor-pointer border-[#f0f0f0] bg-[#F7F0E8] hover:border-[#E85D26] hover:bg-[#FFF3EE]",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={[
              "w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-200",
              isDragging ? "bg-[#E85D26]" : "bg-[#f0f0f0]",
            ].join(" ")}
          >
            <Upload
              className={[
                "w-7 h-7 transition-colors duration-200",
                isDragging ? "text-white" : "text-[#666666]",
              ].join(" ")}
            />
          </div>

          <div>
            <p className="text-lg font-semibold text-[#2D2417]">
              {isDragging ? "Thả ảnh vào đây" : "Kéo thả ảnh vào đây"}
            </p>
            <p className="text-sm text-[#666666] mt-1">hoặc click để chọn ảnh từ máy tính</p>
          </div>

          <p className="text-xs text-[#A69588] bg-[#EDE6DC] px-3 py-1 rounded-full">
            JPG · PNG · WebP · tối đa 10MB
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 font-medium">{error}</p>
      )}
    </div>
  );
}
