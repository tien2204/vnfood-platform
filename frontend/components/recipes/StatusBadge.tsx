import type { RecipeStatus } from "@/lib/types";

interface Props {
  status: RecipeStatus | string;
  rejectReason?: string | null;
}

const CONFIG: Record<string, { label: string; cls: string }> = {
  private: { label: "Riêng tư", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  pending_admin: { label: "Chờ Admin duyệt", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  approved: { label: "Đã đăng", cls: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Bị từ chối", cls: "bg-red-100 text-red-700 border-red-200" },
};

export default function StatusBadge({ status, rejectReason }: Props) {
  const { label, cls } = CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}
      title={status === "rejected" && rejectReason ? rejectReason : undefined}
    >
      {label}
      {status === "rejected" && rejectReason && (
        <span className="ml-0.5 cursor-help underline decoration-dotted" title={rejectReason}>
          ?
        </span>
      )}
    </span>
  );
}
