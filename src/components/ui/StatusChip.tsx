"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { STATUS_COLORS } from "@/lib/constants";

type StatusType = keyof typeof STATUS_COLORS;

interface StatusChipProps {
  status: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusChip({ status, label, size = "md", className }: StatusChipProps) {
  const colors = STATUS_COLORS[status as StatusType] || STATUS_COLORS.pending;
  const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      <span className={cn("rounded-full", size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5", colors.dot)} />
      {displayLabel}
    </span>
  );
}

export function PriorityChip({ priority, size = "md", className }: { priority: string; size?: "sm" | "md"; className?: string }) {
  const colors = STATUS_COLORS[priority as StatusType] || STATUS_COLORS.medium;
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      <span className={cn("rounded-full", size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5", colors.dot)} />
      {label}
    </span>
  );
}
