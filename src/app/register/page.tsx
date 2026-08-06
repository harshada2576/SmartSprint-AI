"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Briefcase,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  User,
  Building,
  CheckCircle,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [formData, setFormData] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    organization: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    setIsLoading(true);
    // Simulate registration
    await new Promise((resolve) => setTimeout(resolve, 1000));
    router.push("/dashboard");
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
            Create your account
          </h1>
          <p className="text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required.
          </p>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            <div
              className={`h-2 flex-1 rounded-full ${
                step >= 1 ? "bg-slate-900" : "bg-slate-200"
              }`}
            />
            <div
              className={`h-2 flex-1 rounded-full ${
                step >= 2 ? "bg-slate-900" : "bg-slate-200"
              }`}
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="First Name"
                    placeholder="John"
                    required
                    leftIcon={<User className="h-4 w-4" />}
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                  />
                  <Input
                    label="Last Name"
                    placeholder="Smith"
                    required
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                  />
                </div>

                <Input
                  label="Work Email"
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
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Must be at least 8 characters with uppercase, lowercase, and
                    number.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Input
                  label="Organization Name"
                  placeholder="Acme Corporation"
                  required
                  leftIcon={<Building className="h-4 w-4" />}
                  value={formData.organization}
                  onChange={(e) =>
                    setFormData({ ...formData, organization: e.target.value })
                  }
                />

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="font-medium text-slate-900 mb-2">
                    What&apos;s included in your trial:
                  </h4>
                  <ul className="space-y-2">
                    {[
                      "Unlimited projects",
                      "AI-powered prioritization",
                      "Full requirements management",
                      "Sprint planning & execution",
                      "Advanced reporting",
                    ].map((item, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 text-sm text-slate-600"
                      >
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <label className="flex items-start gap-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    required
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>
                    I agree to the{" "}
                    <Link
                      href="/terms"
                      className="text-slate-900 hover:underline"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-slate-900 hover:underline"
                    >
                      Privacy Policy
                    </Link>
                  </span>
                </label>
              </>
            )}

            <div className="flex gap-3">
              {step === 2 && (
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
              )}
              <Button
                type="submit"
                className="flex-1"
                size="lg"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {step === 1 ? "Continue" : "Create Account"}
              </Button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-slate-900 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Preview */}
      <div className="hidden lg:flex flex-1 bg-slate-50 items-center justify-center p-12">
        <div className="max-w-lg">
          <div className="space-y-6">
            {[
              {
                quote:
                  "SmartSprint AI has transformed how we manage requirements. The AI recommendations are incredibly accurate.",
                author: "Sarah Chen",
                role: "VP of Engineering, TechCorp",
              },
              {
                quote:
                  "We reduced our planning time by 60% while improving sprint predictability. Highly recommended.",
                author: "Michael Rodriguez",
                role: "Agile Coach, StartupXYZ",
              },
              {
                quote:
                  "Finally, a tool that understands enterprise software development. The governance features are exceptional.",
                author: "Emily Watson",
                role: "CTO, Enterprise Solutions",
              },
            ].map((testimonial, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"
              >
                <p className="text-slate-700 mb-4">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div>
                  <p className="font-medium text-slate-900">
                    {testimonial.author}
                  </p>
                  <p className="text-sm text-slate-500">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
