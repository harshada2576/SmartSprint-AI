"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";
import { createClient } from "@/lib/supabase/client";
import {
  Briefcase,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  // Recovery links may land here directly with ?code= (if the dashboard
  // redirect URL is ever pointed at this page). Exchange it for a session.
  React.useEffect(() => {
    const verify = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (!code) {
          return;
        }
        const supabase = createClient();
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(getAuthErrorMessage(exchangeError));
        }
        window.history.replaceState(null, "", window.location.pathname);
      } catch (err) {
        setError(getAuthErrorMessage(err));
      } finally {
        setIsVerifying(false);
      }
    };
    verify().finally(() => setIsVerifying(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isStrongPassword(password)) {
      setError(
        "Password must be at least 8 characters with uppercase, lowercase, and number."
      );
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError(
          "This reset link is invalid or has expired. Please request a new one."
        );
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(getAuthErrorMessage(updateError));
        return;
      }
      router.push("/login?passwordReset=1");
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
            Choose a new password
          </h1>
          <p className="text-slate-600 mb-8">
            Your new password must be different from previous ones.
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

          {isVerifying ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CheckCircle className="h-4 w-4 animate-pulse" />
              Verifying your reset link…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Input
                  label="New Password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  required
                  leftIcon={<Lock className="h-4 w-4" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Must be at least 8 characters with uppercase, lowercase, and
                  number.
                </p>
              </div>
              <Input
                label="Confirm Password"
                type={showPassword ? "text" : "password"}
                placeholder="Repeat your new password"
                required
                leftIcon={<Lock className="h-4 w-4" />}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Update Password
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
