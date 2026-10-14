"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/Tabs";
import { Save } from "lucide-react";

interface ProfileState {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  avatarInitials: string | null;
}

export default function SettingsPage() {
  const [theme, setTheme] = React.useState<string>("light");
  const [sidebarCollapsed, setSidebarCollapsed] =
    React.useState<boolean>(false);

  const [notifPrefs, setNotifPrefs] = React.useState<
    Record<string, { email: boolean; push: boolean }>
  >({});

  const [profile, setProfile] = React.useState<ProfileState>({
    firstName: "",
    lastName: "",
    email: "",
    jobTitle: "",
    department: "",
    avatarInitials: null,
  });

  const [profileLoading, setProfileLoading] = React.useState(true);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileMessage, setProfileMessage] = React.useState("");
  const [profileError, setProfileError] = React.useState("");

  React.useEffect(() => {
  let cancelled = false;

  const loadProfile = async () => {
    try {
      const [meResponse, settingsResponse] = await Promise.all([
        fetch("/api/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        }),
        fetch("/api/settings", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        }),
      ]);

      const mePayload = await meResponse.json().catch(() => null);
      const settingsPayload = await settingsResponse
        .json()
        .catch(() => null);

      if (cancelled) return;

      /*
       * /api/me is the source of truth for the authenticated
       * user's registered identity.
       */
      const meUser =
        mePayload?.data?.user ??
        mePayload?.user ??
        null;

      /*
       * /api/settings can provide editable profile information
       * such as job title and department.
       */
      const settingsProfile =
        settingsPayload?.data?.profile ??
        null;

      if (meUser || settingsProfile) {
        setProfile({
          firstName:
            meUser?.firstName ??
            settingsProfile?.firstName ??
            "",

          lastName:
            meUser?.lastName ??
            settingsProfile?.lastName ??
            "",

          email:
            meUser?.email ??
            settingsProfile?.email ??
            "",

          jobTitle:
            settingsProfile?.jobTitle ??
            meUser?.jobTitle ??
            "",

          department:
            settingsProfile?.department ??
            meUser?.department ??
            "",

          avatarInitials:
            settingsProfile?.avatarInitials ??
            meUser?.avatarInitials ??
            null,
        });
      }

      if (settingsPayload?.success) {
        const data = settingsPayload.data;

        if (typeof data?.theme === "string") {
          setTheme(data.theme);
        }

        if (typeof data?.sidebarCollapsed === "boolean") {
          setSidebarCollapsed(data.sidebarCollapsed);
        }

        if (
          data?.notificationPreferences &&
          typeof data.notificationPreferences === "object"
        ) {
          setNotifPrefs(data.notificationPreferences);
        }
      }

      if (!meResponse.ok && !settingsResponse.ok) {
        setProfileError("Failed to load your profile.");
      }
    } catch (error) {
      console.error("Failed to load settings:", error);

      if (!cancelled) {
        setProfileError("Failed to load your profile.");
      }
    } finally {
      if (!cancelled) {
        setProfileLoading(false);
      }
    }
  };

  loadProfile();

  return () => {
    cancelled = true;
  };
}, []);

  const persistPrefs = React.useCallback(
    (patch: Record<string, unknown>) => {
      fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      }).catch(() => {});
    },
    [],
  );

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          jobTitle: profile.jobTitle || null,
          department: profile.department || null,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error("Profile update failed");
      }

      const updated = payload.data?.profile;

      if (updated) {
        setProfile({
          firstName: updated.firstName ?? "",
          lastName: updated.lastName ?? "",
          email: updated.email ?? "",
          jobTitle: updated.jobTitle ?? "",
          department: updated.department ?? "",
          avatarInitials: updated.avatarInitials ?? null,
        });
      }

      setProfileMessage("Profile updated successfully.");
    } catch {
      setProfileError("Could not update your profile. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  };

  const NOTIF_ROWS = [
    {
      key: "task_assignments",
      label: "Task assignments",
      email: true,
      push: true,
    },
    {
      key: "sprint_updates",
      label: "Sprint updates",
      email: true,
      push: false,
    },
    {
      key: "document_uploads",
      label: "Document uploads",
      email: false,
      push: true,
    },
    {
      key: "approval_requests",
      label: "Approval requests",
      email: true,
      push: true,
    },
    {
      key: "budget_alerts",
      label: "Budget alerts",
      email: true,
      push: false,
    },
    {
      key: "system_updates",
      label: "System updates",
      email: false,
      push: false,
    },
  ];

  const initials =
    profile.avatarInitials ||
    `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`
      .toUpperCase()
      .trim() ||
    "U";

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
                  {initials}
                </div>

                <div>
                  <Button variant="secondary" size="sm" type="button">
                    Change Avatar
                  </Button>

                  <p className="text-xs text-slate-500 mt-2">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>

              {profileLoading ? (
                <p className="text-sm text-slate-500">
                  Loading your profile...
                </p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="First Name"
                      value={profile.firstName}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          firstName: event.target.value,
                        }))
                      }
                    />

                    <Input
                      label="Last Name"
                      value={profile.lastName}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          lastName: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <Input
                    label="Email Address"
                    type="email"
                    value={profile.email}
                    disabled
                    description="Your authentication email is managed by your account."
                  />

                  <Input
                    label="Job Title"
                    value={profile.jobTitle}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        jobTitle: event.target.value,
                      }))
                    }
                  />

                  <Input
                    label="Department"
                    value={profile.department}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        department: event.target.value,
                      }))
                    }
                  />

                  {profileMessage && (
                    <p className="text-sm text-emerald-600">
                      {profileMessage}
                    </p>
                  )}

                  {profileError && (
                    <p className="text-sm text-rose-600">
                      {profileError}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      isLoading={profileSaving}
                      onClick={saveProfile}
                      leftIcon={<Save className="h-4 w-4" />}
                    >
                      Save Changes
                    </Button>
                  </div>
                </>
              )}
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
                  {(
                    [
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                      { value: "system", label: "System" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTheme(option.value);
                        persistPrefs({ theme: option.value });
                      }}
                      className={
                        theme === option.value
                          ? "p-4 rounded-lg border-2 border-slate-900 bg-white text-center"
                          : "p-4 rounded-lg border border-slate-200 bg-white text-center hover:border-slate-300"
                      }
                    >
                      <div className="h-12 bg-white border border-slate-200 rounded mb-2" />
                      <span className="text-sm font-medium">
                        {option.label}
                      </span>
                    </button>
                  ))}
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
                      checked={!sidebarCollapsed}
                      onChange={() => {
                        setSidebarCollapsed(false);
                        persistPrefs({ sidebarCollapsed: false });
                      }}
                      className="text-slate-900"
                    />
                    <span className="text-sm">Expanded</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="sidebar"
                      checked={sidebarCollapsed}
                      onChange={() => {
                        setSidebarCollapsed(true);
                        persistPrefs({ sidebarCollapsed: true });
                      }}
                      className="text-slate-900"
                    />
                    <span className="text-sm">Collapsed</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  leftIcon={<Save className="h-4 w-4" />}
                  type="button"
                >
                  Save Changes
                </Button>
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
              {NOTIF_ROWS.map((item) => {
                const stored = notifPrefs[item.key];
                const email = stored?.email ?? item.email;
                const push = stored?.push ?? item.push;

                const update = (next: {
                  email: boolean;
                  push: boolean;
                }) => {
                  const merged = {
                    ...notifPrefs,
                    [item.key]: next,
                  };

                  setNotifPrefs(merged);
                  persistPrefs({
                    notificationPreferences: merged,
                  });
                };

                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-sm font-medium text-slate-900">
                      {item.label}
                    </span>

                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={email}
                          onChange={(event) =>
                            update({
                              email: event.target.checked,
                              push,
                            })
                          }
                          className="rounded border-slate-300 text-slate-900"
                        />
                        Email
                      </label>

                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={push}
                          onChange={(event) =>
                            update({
                              email,
                              push: event.target.checked,
                            })
                          }
                          className="rounded border-slate-300 text-slate-900"
                        />
                        Push
                      </label>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end pt-4">
                <Button
                  leftIcon={<Save className="h-4 w-4" />}
                  type="button"
                >
                  Save Changes
                </Button>
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
              <Input
                label="Organization Name"
                defaultValue="Acme Corporation"
              />

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
                <Button
                  leftIcon={<Save className="h-4 w-4" />}
                  type="button"
                >
                  Save Changes
                </Button>
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
                  <Input
                    label="Current Password"
                    type="password"
                  />

                  <Input
                    label="New Password"
                    type="password"
                  />

                  <Input
                    label="Confirm New Password"
                    type="password"
                  />
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

                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                  >
                    Enable
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  leftIcon={<Save className="h-4 w-4" />}
                  type="button"
                >
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AuthenticatedLayout>
  );
}