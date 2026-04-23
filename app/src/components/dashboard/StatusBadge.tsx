import { cn } from "@/lib/utils";

type StatusVariant = "pending" | "active" | "verified" | "inactive" | "failed" | "unattempted" | "info";

interface StatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<StatusVariant, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  verified: "bg-violet-100 text-violet-800",
  inactive: "bg-gray-100 text-gray-800",
  failed: "bg-red-100 text-red-800",
  unattempted: "bg-slate-100 text-slate-600",
  info: "bg-blue-100 text-blue-800",
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
