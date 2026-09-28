"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { Briefcase, CheckCircle2, AlertCircle, ArrowRight, Lock, User } from "lucide-react";

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invite, setInvite] = React.useState<{
    id: string;
    email: string;
    role: string;
    organizationName: string;
  } | null>(null);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    if (!token) {
      setError("No invitation token provided.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/invitations/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error?.message ?? "Invalid or expired invitation.");
        } else {
          setInvite(data.data);
        }
      } catch {
        setError("Failed to verify invitation. Please check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invite) return;

    if (!firstName.trim() || !lastName.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message ?? "Failed to accept invitation.");
        setSubmitting(false);
        return;
      }

      // Log in with credentials
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });

      if (signInError) {
        // If signIn has any issue, redirect to login with notification
        router.push(`/login?message=Account+activated.+Please+sign+in.`);
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 1000);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-md">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-2xl text-slate-900">SmartSprint AI</span>
        </div>

        <Card className="shadow-lg border-slate-200">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Team Invitation</CardTitle>
            <CardDescription>
              {loading
                ? "Verifying invitation token..."
                : invite
                ? `You've been invited to join ${invite.organizationName}`
                : "Invalid Invitation"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="py-8 text-center text-slate-500 text-sm">
                Validating invitation details...
              </div>
            )}

            {error && !invite && (
              <div className="py-6 text-center space-y-4">
                <div className="inline-flex p-3 rounded-full bg-red-100 text-red-600">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="text-sm text-red-600 font-medium">{error}</p>
                <div>
                  <Link href="/login">
                    <Button variant="outline" className="w-full">
                      Back to Sign In
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {invite && !success && (
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>Organization</span>
                    <span className="font-semibold text-slate-800">{invite.organizationName}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>Email</span>
                    <span className="font-mono text-slate-800">{invite.email}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>Assigned Role</span>
                    <Badge variant="secondary" className="uppercase font-semibold text-[10px]">
                      {invite.role.replace("_", " ")}
                    </Badge>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                    <Input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                    <Input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Choose Password</label>
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Joining Organization..." : "Accept Invitation & Join Team"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </form>
            )}

            {success && (
              <div className="py-6 text-center space-y-3">
                <div className="inline-flex p-3 rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Welcome to the Team!</h3>
                <p className="text-xs text-slate-500">
                  Your account is activated. Redirecting you to your dashboard...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function InviteAcceptancePage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="text-slate-500 text-sm">Loading invitation...</div>
        </div>
      }
    >
      <InviteContent />
    </React.Suspense>
  );
}
