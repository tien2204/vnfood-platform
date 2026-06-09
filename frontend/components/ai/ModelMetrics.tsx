"use client";

import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";

import { ClassMetrics } from "@/lib/types";

interface Props {
  metrics: ClassMetrics;
  className?: string;
}

const METRIC_DEFS = [
  {
    key: "precision" as const,
    label: "Precision",
    tooltip:
      'Khi mô hình dự đoán "đây là món này", bao nhiêu % dự đoán đúng? ' +
      "Phạt các trường hợp báo nhầm (False Positive).",
  },
  {
    key: "recall" as const,
    label: "Recall",
    tooltip:
      "Trong các ảnh của món này thật sự, mô hình nhận ra được bao nhiêu %? " +
      "Phạt các trường hợp bỏ sót (False Negative).",
  },
  {
    key: "f1" as const,
    label: "F1",
    tooltip:
      "Trung bình hài hòa của Precision và Recall. Cân bằng cả 2 chỉ số. " +
      "F1 cao = mô hình vừa precise vừa không bỏ sót.",
  },
];

function MetricCell({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number;
  tooltip: string;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(value * 100);
  const tone =
    pct >= 85 ? "text-[#2D6A4F]" : pct >= 70 ? "text-[#C97B16]" : "text-[#9B2C2C]";

  return (
    <div className="flex-1 min-w-[110px] rounded-xl border border-border bg-white px-3 py-2.5">
      <div className="flex items-center gap-1 mb-1 relative">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setOpen(false)}
          aria-label={`Giải thích ${label}`}
          className="text-muted-foreground hover:text-foreground focus:outline-none"
        >
          <Info className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute left-0 top-5 z-10 w-56 rounded-lg border border-border bg-white p-2.5 text-[11px] leading-relaxed text-foreground shadow-lg">
            {tooltip}
          </div>
        )}
      </div>
      <div className={`text-xl font-bold ${tone}`}>
        {pct}%
      </div>
    </div>
  );
}

export default function ModelMetrics({ metrics, className = "" }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors focus:outline-none"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        <span>
          {expanded ? "Ẩn" : "Xem"} hiệu năng mô hình cho món này
        </span>
        <span className="text-[10px] text-muted-foreground">
          (test set · {metrics.support} ảnh)
        </span>
      </button>

      {expanded && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-2">
            {METRIC_DEFS.map((def) => (
              <MetricCell
                key={def.key}
                label={def.label}
                value={metrics[def.key]}
                tooltip={def.tooltip}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Đây là độ đo đánh giá mô hình trên tập kiểm tra đã có nhãn — phản ánh
            độ tin cậy chung của AI đối với loại món này, không phải cho ảnh bạn
            vừa tải lên (con số đó là &ldquo;Độ tin cậy&rdquo; phía trên).
          </p>
        </div>
      )}
    </div>
  );
}
