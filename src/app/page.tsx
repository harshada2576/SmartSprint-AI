import { PublicLayout } from "@/components/layout/PublicLayout";
import {
  ArrowRight,
  CheckCircle,
  Briefcase,
  Sparkles,
  FileText,
  Calendar,
  BarChart3,
  Users,
  Zap,
  Target,
  Shield,
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium mb-6">
                <Sparkles className="h-4 w-4" />
                <span>Now with AI-Powered Prioritization</span>
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold text-slate-900 leading-tight mb-6">
                Intelligent Software Requirements & Sprint Planning
              </h1>
              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                SmartSprint AI centralizes your complete project lifecycle—from
                requirement engineering to AI-assisted prioritization, Agile
                sprint planning, and execution tracking.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Start Free Trial
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  View Demo
                </Link>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span>14-day free trial</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl bg-slate-100 p-2 shadow-2xl">
                <div className="rounded-xl bg-white overflow-hidden">
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
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Why Software Projects Fail
            </h2>
            <p className="text-lg text-slate-600">
              70% of software projects fail due to poor requirements management,
              unclear priorities, and ineffective sprint planning.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: FileText,
                title: "Unclear Requirements",
                description:
                  "Requirements are scattered across documents, emails, and meetings, leading to misalignment.",
              },
              {
                icon: Target,
                title: "Wrong Priorities",
                description:
                  "Teams work on low-impact features while critical business needs remain unaddressed.",
              },
              {
                icon: Calendar,
                title: "Missed Deadlines",
                description:
                  "Sprint planning lacks data-driven insights, resulting in unrealistic commitments.",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="p-6 bg-white rounded-xl border border-slate-200"
              >
                <div className="h-12 w-12 rounded-lg bg-rose-50 flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Everything You Need to Deliver Great Software
            </h2>
            <p className="text-lg text-slate-600">
              A complete platform for requirements engineering, AI-powered
              prioritization, and Agile execution.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: FileText,
                title: "Requirements Engineering",
                description:
                  "Centralize requirements gathering, validation, and traceability throughout the project lifecycle.",
              },
              {
                icon: Sparkles,
                title: "AI Prioritization",
                description:
                  "Get intelligent recommendations for requirement priorities and sprint assignments based on business value.",
              },
              {
                icon: Calendar,
                title: "Sprint Planning",
                description:
                  "Plan sprints with confidence using capacity planning, dependency tracking, and velocity insights.",
              },
              {
                icon: Target,
                title: "Execution Tracking",
                description:
                  "Monitor progress in real-time with Kanban boards, burndown charts, and team workload views.",
              },
              {
                icon: BarChart3,
                title: "Executive Reports",
                description:
                  "Generate professional reports for stakeholders with variance analysis and actionable recommendations.",
              },
              {
                icon: Shield,
                title: "Governance & Compliance",
                description:
                  "Manage approvals, contracts, budgets, and compliance documents in one secure location.",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="group p-6 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all"
              >
                <div className="h-12 w-12 rounded-lg bg-slate-50 group-hover:bg-slate-100 flex items-center justify-center mb-4 transition-colors">
                  <feature.icon className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Your Complete Software Engineering Workflow
            </h2>
            <p className="text-lg text-slate-600">
              From project initiation to delivery, SmartSprint AI guides you
              through every stage.
            </p>
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { step: "1", title: "Gather", desc: "Collect requirements" },
              { step: "2", title: "Validate", desc: "Review & approve" },
              { step: "3", title: "Prioritize", desc: "AI-assisted ranking" },
              { step: "4", title: "Plan", desc: "Sprint allocation" },
              { step: "5", title: "Execute", desc: "Track & deliver" },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="h-12 w-12 rounded-full bg-slate-900 text-white flex items-center justify-center text-lg font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h4 className="font-semibold text-slate-900 mb-1">
                  {item.title}
                </h4>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Ready to Transform Your Software Development?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Join thousands of teams using SmartSprint AI to deliver better
            software, faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 text-base font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 text-base font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Schedule Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-slate-900">
                SmartSprint AI
              </span>
            </div>
            <p className="text-sm text-slate-500">
              © 2025 SmartSprint AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </PublicLayout>
  );
}
