import { cn } from "@/lib/utils";
import {
  STATUS_CLASS,
  STATUS_DOT,
  STATUS_LABEL,
  VERIFY_LABEL,
  confidencePercent,
  type ProjectStatus,
  type VerifyStatus,
} from "@/lib/wtf";
import { BadgeCheck, Clock, ShieldAlert, ShieldX } from "lucide-react";

export function StatusChip({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
        STATUS_CLASS[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

const VERIFY_ICON = {
  verified: BadgeCheck,
  pending_review: Clock,
  unverified: ShieldAlert,
  rejected: ShieldX,
} as const;

export function VerificationChip({
  status,
  confidence,
  className,
}: {
  status: VerifyStatus;
  confidence?: number | null;
  className?: string;
}) {
  const Icon = VERIFY_ICON[status];
  const tone =
    status === "verified"
      ? "text-status-completed"
      : status === "rejected"
        ? "text-destructive"
        : "text-tertiary";

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {VERIFY_LABEL[status]}
      {confidence != null ? ` · ${confidencePercent(confidence)}% confidence` : ""}
    </span>
  );
}
