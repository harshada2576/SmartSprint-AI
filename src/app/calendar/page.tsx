"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Users,
  Flag,
  FileText,
  Plus,
} from "lucide-react";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const events = [
  { id: 1, title: "Sprint 4 Planning", date: "2025-07-21", type: "sprint", time: "10:00 AM" },
  { id: 2, title: "Team Standup", date: "2025-07-22", type: "meeting", time: "9:00 AM" },
  { id: 3, title: "Client Review", date: "2025-07-23", type: "milestone", time: "2:00 PM" },
  { id: 4, title: "Sprint 4 End", date: "2025-07-28", type: "sprint", time: "5:00 PM" },
  { id: 5, title: "Budget Review", date: "2025-07-25", type: "deadline", time: "11:00 AM" },
  { id: 6, title: "Document Expiry", date: "2025-07-30", type: "document", time: "-" },
];

const getEventColor = (type: string) => {
  switch (type) {
    case "sprint":
      return "bg-violet-100 text-violet-700 border-violet-200";
    case "meeting":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "milestone":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "deadline":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "document":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

const getEventIcon = (type: string) => {
  switch (type) {
    case "sprint":
      return <Flag className="h-3 w-3" />;
    case "meeting":
      return <Users className="h-3 w-3" />;
    case "milestone":
      return <Flag className="h-3 w-3" />;
    case "deadline":
      return <Clock className="h-3 w-3" />;
    case "document":
      return <FileText className="h-3 w-3" />;
    default:
      return <CalendarIcon className="h-3 w-3" />;
  }
};

export default function CalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = React.useState(new Date(2025, 6, 1)); // July 2025
  const [view, setView] = React.useState<"month" | "week" | "agenda">("month");

  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  ).getDay();

  const calendarDays = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDayOfMonth + 1;
    if (day > 0 && day <= daysInMonth) {
      return day;
    }
    return null;
  });

  const getEventsForDay = (day: number) => {
    const dateStr = `2025-07-${day.toString().padStart(2, "0")}`;
    return events.filter((e) => e.date === dateStr);
  };

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Calendar"
        description="View project events, sprints, and deadlines"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Calendar" },
        ]}
        primaryAction={{
          label: "Add Event",
          onClick: () => {},
        }}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-900">{monthName}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "month"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "week"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView("agenda")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "agenda"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              Agenda
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {view === "month" && (
            <div>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-t-lg overflow-hidden">
                {days.map((day) => (
                  <div
                    key={day}
                    className="bg-slate-50 py-2 text-center text-xs font-medium text-slate-500 uppercase"
                  >
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 rounded-b-lg overflow-hidden">
                {calendarDays.map((day, index) => (
                  <div
                    key={index}
                    className={`bg-white min-h-24 p-2 ${
                      day === null ? "bg-slate-50/50" : ""
                    }`}
                  >
                    {day && (
                      <>
                        <span
                          className={`text-sm font-medium ${
                            day === new Date().getDate()
                              ? "h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center"
                              : "text-slate-700"
                          }`}
                        >
                          {day}
                        </span>
                        <div className="mt-1 space-y-1">
                          {getEventsForDay(day).map((event) => (
                            <div
                              key={event.id}
                              className={`px-2 py-1 rounded text-xs border ${getEventColor(
                                event.type
                              )} flex items-center gap-1 cursor-pointer hover:opacity-80`}
                            >
                              {getEventIcon(event.type)}
                              <span className="truncate">{event.title}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "agenda" && (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center ${getEventColor(
                      event.type
                    )}`}
                  >
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{event.title}</p>
                    <p className="text-sm text-slate-500">
                      {event.date} • {event.time}
                    </p>
                  </div>
                  <Badge variant="outline" size="sm">
                    {event.type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AuthenticatedLayout>
  );
}
