"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  User,
  Bell,
  Building,
  Briefcase,
  Shield,
  Mail,
  Palette,
  Save,
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Settings"
        description="Manage your account and organization preferences"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings" },
        ]}
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and profile settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-full bg-slate-200 flex items-center justify-center text-2xl font-medium text-slate-600">
                  JS
                </div>
                <div>
                  <Button variant="secondary" size="sm">
                    Change Avatar
                  </Button>
                  <p className="text-xs text-slate-500 mt-2">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="First Name" defaultValue="John" />
                <Input label="Last Name" defaultValue="Smith" />
              </div>
              <Input
                label="Email Address"
                type="email"
                defaultValue="john@example.com"
              />
              <Input label="Job Title" defaultValue="Project Manager" />
              <Input label="Department" defaultValue="Engineering" />
              <div className="flex justify-end">
                <Button leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of your workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Theme
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <button className="p-4 rounded-lg border-2 border-slate-900 bg-white text-center">
                    <div className="h-12 bg-white border border-slate-200 rounded mb-2" />
                    <span className="text-sm font-medium">Light</span>
                  </button>
                  <button className="p-4 rounded-lg border border-slate-200 bg-white text-center hover:border-slate-300">
                    <div className="h-12 bg-slate-900 border border-slate-700 rounded mb-2" />
                    <span className="text-sm">Dark</span>
                  </button>
                  <button className="p-4 rounded-lg border border-slate-200 bg-white text-center hover:border-slate-300">
                    <div className="h-12 bg-gradient-to-r from-white to-slate-900 border border-slate-200 rounded mb-2" />
                    <span className="text-sm">System</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Sidebar
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="sidebar"
                      defaultChecked
                      className="text-slate-900"
                    />
                    <span className="text-sm">Expanded</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="sidebar" className="text-slate-900" />
                    <span className="text-sm">Collapsed</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <Button leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how you want to be notified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Task assignments", email: true, push: true },
                { label: "Sprint updates", email: true, push: false },
                { label: "Document uploads", email: false, push: true },
                { label: "Approval requests", email: true, push: true },
                { label: "Budget alerts", email: true, push: false },
                { label: "System updates", email: false, push: false },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
                >
                  <span className="text-sm font-medium text-slate-900">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        defaultChecked={item.email}
                        className="rounded border-slate-300 text-slate-900"
                      />
                      Email
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        defaultChecked={item.push}
                        className="rounded border-slate-300 text-slate-900"
                      />
                      Push
                    </label>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-4">
                <Button leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>
                Manage your organization details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input label="Organization Name" defaultValue="Acme Corporation" />
              <Input
                label="Organization URL"
                defaultValue="acme-corp"
                description="https://smartsprint.ai/o/acme-corp"
              />
              <Select
                label="Industry"
                options={[
                  { value: "tech", label: "Technology" },
                  { value: "finance", label: "Finance" },
                  { value: "healthcare", label: "Healthcare" },
                  { value: "retail", label: "Retail" },
                ]}
                defaultValue="tech"
              />
              <Select
                label="Timezone"
                options={[
                  { value: "utc", label: "UTC" },
                  { value: "est", label: "Eastern Time" },
                  { value: "pst", label: "Pacific Time" },
                  { value: "gmt", label: "GMT" },
                ]}
                defaultValue="est"
              />
              <div className="flex justify-end">
                <Button leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage your account security
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">
                  Change Password
                </h4>
                <div className="space-y-4">
                  <Input label="Current Password" type="password" />
                  <Input label="New Password" type="password" />
                  <Input label="Confirm New Password" type="password" />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-medium text-slate-900 mb-2">
                  Two-Factor Authentication
                </h4>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Enable 2FA
                    </p>
                    <p className="text-xs text-slate-500">
                      Add an extra layer of security to your account
                    </p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Enable
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AuthenticatedLayout>
  );
}
