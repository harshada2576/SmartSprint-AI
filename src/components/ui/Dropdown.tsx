"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  danger?: boolean;
}

interface DropdownSeparatorProps {
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  align = "left",
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative inline-block">
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={cn(
            "absolute z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1",
            align === "right" ? "right-0" : "left-0",
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  disabled,
  className,
  icon,
  danger,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2 text-sm text-left transition-colors",
        "hover:bg-slate-50 focus:bg-slate-50 focus:outline-none",
        disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
        danger && "text-rose-600 hover:bg-rose-50",
        !danger && "text-slate-700",
        className
      )}
    >
      {icon && <span className="text-slate-400">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownSeparator({ className }: DropdownSeparatorProps) {
  return (
    <div className={cn("my-1 border-t border-slate-200", className)} />
  );
}

export function DropdownLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-4 py-2 text-xs font-medium text-slate-500",
        className
      )}
    >
      {children}
    </div>
  );
}
