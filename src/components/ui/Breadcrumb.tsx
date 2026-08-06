"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
}

export function Breadcrumb({ items, className, showHome = true }: BreadcrumbProps) {
  return (
    <nav className={cn("flex items-center text-sm text-slate-500", className)}>
      <ol className="flex items-center gap-1.5">
        {showHome && (
          <li>
            <Link
              href="/"
              className="flex items-center hover:text-slate-900 transition-colors"
            >
              <Home className="h-4 w-4" />
            </Link>
          </li>
        )}
        {showHome && items.length > 0 && (
          <li>
            <ChevronRight className="h-4 w-4" />
          </li>
        )}
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <li>
              {item.href ? (
                <Link
                  href={item.href}
                  className="hover:text-slate-900 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-slate-900 font-medium">{item.label}</span>
              )}
            </li>
            {index < items.length - 1 && (
              <li>
                <ChevronRight className="h-4 w-4" />
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}
