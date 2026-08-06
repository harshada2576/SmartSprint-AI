"use client";

import * as React from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";

interface PublicLayoutProps {
  children: React.ReactNode;
  showNav?: boolean;
}

export function PublicLayout({ children, showNav = true }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      {showNav && (
        <nav className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 z-50">
          <div className="h-full max-w-7xl mx-auto px-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-slate-900">SmartSprint AI</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link
                href="/#features"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Features
              </Link>
              <Link
                href="/#workflow"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Workflow
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>
      )}

      <main className={showNav ? "pt-16" : ""}>{children}</main>
    </div>
  );
}
