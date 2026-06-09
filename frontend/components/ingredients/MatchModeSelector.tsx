"use client";

const MODES = [
  { value: "any", label: "Có ít nhất 1", desc: "Tìm công thức có bất kỳ nguyên liệu nào bạn chọn" },
  { value: "most", label: "Có nhiều nhất", desc: "Ưu tiên công thức khớp nhiều nguyên liệu nhất" },
  { value: "all", label: "Phải có đủ", desc: "Chỉ hiện công thức có tất cả nguyên liệu đã chọn" },
] as const;

interface Props {
  value: "any" | "all" | "most";
  onChange: (mode: "any" | "all" | "most") => void;
}

export default function MatchModeSelector({ value, onChange }: Props) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground mb-2">Chế độ tìm kiếm</legend>
      <div className="flex flex-wrap gap-2">
        {MODES.map((mode) => (
          <label
            key={mode.value}
            title={mode.desc}
            className={[
              "flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all text-sm select-none",
              value === mode.value
                ? "border-primary bg-primary/5 text-primary font-medium"
                : "border-border bg-card text-foreground hover:border-primary/50",
            ].join(" ")}
          >
            <input
              type="radio"
              name="match_mode"
              value={mode.value}
              checked={value === mode.value}
              onChange={() => onChange(mode.value)}
              className="sr-only"
            />
            <span
              className={[
                "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                value === mode.value ? "border-primary" : "border-border",
              ].join(" ")}
            >
              {value === mode.value && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </span>
            {mode.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
