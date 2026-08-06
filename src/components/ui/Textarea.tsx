"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  description?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, description, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-900 mb-1.5">
            {label}
            {props.required && (
              <span className="text-rose-500 ml-0.5">*</span>
            )}
          </label>
        )}
        <textarea
          className={cn(
            "flex min-h-[100px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 transition-all duration-150 resize-y",
            error && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/10",
            className
          )}
          ref={ref}
          {...props}
        />
        {description && !error && (
          <p className="mt-1.5 text-xs text-slate-500">{description}</p>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-rose-600">{error}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
