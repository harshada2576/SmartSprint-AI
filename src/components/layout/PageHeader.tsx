"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: { label: string; href?: string }[];
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryActions?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  }[];
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  primaryAction,
  secondaryActions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && (
        <div className="mb-4">
          <Breadcrumb
            items={breadcrumb.map((item) => ({
              label: item.label,
              href: item.href,
            }))}
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {secondaryActions?.map((action, index) => (
            <Button
              key={index}
              variant="secondary"
              onClick={action.onClick}
              leftIcon={action.icon}
            >
              {action.label}
            </Button>
          ))}
          {primaryAction && (
            <Button
              onClick={primaryAction.onClick}
              leftIcon={primaryAction.icon}
            >
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
