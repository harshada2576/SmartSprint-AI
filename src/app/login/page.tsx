"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AUTH_QUERY_ERRORS, getAuthErrorMessage } from "@/lib/auth/auth-errors";
import { createClient } from "@/lib/supabase/client";
import {
  Briefcase,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(() => {
    const errorCode = searchParams.get("error");
    return errorCode && AUTH_QUERY_ERRORS[errorCode]
      ? AUTH_QUERY_ERRORS[errorCode]
      : null;
  });
  const [info, setInfo] = React.useState<string | null>(() => {
    if (searchParams.get("checkEmail") === "1") {
      return "Account created. Check your inbox and verify your email, then sign in.";
    }
    if (searchParams.get("passwordReset") === "1") {
      return "Password updated. Sign in with your new password.";
    }
    return null;
  });
  const [formData, setFormData] = React.useState({
    email: "",
    password: "",
  });

  const redirectTo = searchParams.get("redirectTo");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
      });
      if (signInError) {
        setError(getAuthErrorMessage(signInError));
        return;
      }
      router.push(
        redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
          ? redirectTo
          : "/dashboard"
      );
      router.refresh();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) {
        setError(getAuthErrorMessage(oauthError));
        setIsGoogleLoading(false);
      }
      // On success the browser redirects to Google; nothing more to do here.
    } catch (err) {
      setError(getAuthErrorMessage(err));
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-24">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-slate-900">
              SmartSprint AI
            </span>
          </Link>

          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Welcome back
          </h1>
          <p className="text-slate-600 mb-8">
            Sign in to your account to continue
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

          {info && (
            <div
              role="status"
              className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              placeholder="john@company.com"
              required
              leftIcon={<Mail className="h-4 w-4" />}
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />

            <div>
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
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
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  Remember me
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-slate-900 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign In
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400 uppercase">
              or
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            isLoading={isGoogleLoading}
            leftIcon={<GoogleIcon />}
            onClick={handleGoogleSignIn}
          >
            Continue with Google
          </Button>

          <div className="mt-8 text-center">
            <p className="text-slate-600">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-medium text-slate-900 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Preview */}
      <div className="hidden lg:flex flex-1 bg-slate-50 items-center justify-center p-12">
        <div className="max-w-lg">
          <div className="relative rounded-2xl bg-white p-2 shadow-2xl mb-8">
            <div className="rounded-xl bg-white overflow-hidden border border-slate-200">
              {/* Mock Dashboard UI */}
              <div className="h-8 bg-slate-50 border-b border-slate-200 flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-48 bg-slate-200 rounded" />
                  <div className="h-8 w-24 bg-slate-900 rounded" />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="h-20 bg-slate-50 rounded-lg border border-slate-200" />
                  <div className="h-20 bg-slate-50 rounded-lg border border-slate-200" />
                  <div className="h-20 bg-slate-50 rounded-lg border border-slate-200" />
                  <div className="h-20 bg-slate-50 rounded-lg border border-slate-200" />
                </div>
                <div className="h-40 bg-slate-50 rounded-lg border border-slate-200" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-slate-900">
              Trusted by software teams worldwide
            </h3>
            <div className="space-y-3">
              {[
                "AI-powered requirement prioritization",
                "Intelligent sprint planning",
                "Real-time project monitoring",
                "Executive-ready reports",
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

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
