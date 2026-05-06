interface Props {
  status: "pending" | "approved" | "rejected";
  rejectReason?: string | null;
}

const CONFIG = {
  pending: { label: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  approved: { label: "Đã duyệt", cls: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Bị từ chối", cls: "bg-red-100 text-red-700 border-red-200" },
};

export default function StatusBadge({ status, rejectReason }: Props) {
  const { label, cls } = CONFIG[status];
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
