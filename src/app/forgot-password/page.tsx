"use client";

import * as React from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";
import { createClient } from "@/lib/supabase/client";
import {
  Briefcase,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        }
      );
      if (resetError) {
        setError(getAuthErrorMessage(resetError));
        return;
      }
      setSentTo(email.trim());
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-24">
        <div className="w-full max-w-md mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-slate-900">
              SmartSprint AI
            </span>
          </Link>

          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Reset your password
          </h1>
          <p className="text-slate-600 mb-8">
            Enter your account email and we&apos;ll send you a reset link.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {sentTo ? (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"
            >
              <div className="flex items-center gap-2 font-medium text-emerald-900">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Check your inbox
              </div>
              <p className="mt-2 text-emerald-700">
                If an account exists for {sentTo}, a password reset link is on
                its way. The link expires after a short time.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email Address"
                type="email"
                placeholder="john@company.com"
                required
                leftIcon={<Mail className="h-4 w-4" />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Send Reset Link
              </Button>
            </form>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Right Side - Preview */}
      <div className="hidden lg:flex flex-1 bg-slate-50 items-center justify-center p-12">
        <div className="max-w-lg">
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-slate-900">
              Secure by design
            </h3>
            <div className="space-y-3">
              {[
                "Reset links expire after a short time",
                "Passwords are never stored in plain text",
                "Sessions are validated on every request",
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  <span className="text-slate-600">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
