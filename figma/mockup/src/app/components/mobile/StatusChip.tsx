interface StatusChipProps {
  status: "todo" | "inprogress" | "done" | "pending" | "approved" | "ordered" | "delivered";
  size?: "sm" | "md";
}

export function StatusChip({ status, size = "sm" }: StatusChipProps) {
  const config = {
    todo: { label: "To Do", color: "bg-gray-100 text-gray-700" },
    inprogress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
    done: { label: "Done", color: "bg-green-100 text-green-700" },
    pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
    approved: { label: "Approved", color: "bg-blue-100 text-blue-700" },
    ordered: { label: "Ordered", color: "bg-purple-100 text-purple-700" },
    delivered: { label: "Delivered", color: "bg-green-100 text-green-700" },
  };

  const { label, color } = config[status];
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${color} ${sizeClass}`}>
      {label}
    </span>
  );
}
