"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  AlertTriangle,
  Bot,
  Flame,
  Layers,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { buildQuery, normalizeProject, useCollection, type ProjectItem } from "@/lib/api-client";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

const QUICK_PROMPTS = [
  "Which tasks are at risk?",
  "What is the status of the current sprint?",
  "How is developer workload distributed?",
  "Give me a project health summary",
];

export default function AiAssistantPage() {
  const { items: projects, isLoading: projectsLoading } = useCollection<ProjectItem>(
    "/api/projects",
    normalizeProject,
    React.useMemo(() => buildQuery({ page: 1, pageSize: 50 }), [])
  );

  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("");

  React.useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "intro",
      sender: "assistant",
      text: "👋 Welcome to **SmartSprint AI Assistant**! I have live access to your active sprints, task statuses, developer workloads, and project risks.\n\nAsk me anything about your project's health, or click one of the suggested prompts below.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [inputQuery, setInputQuery] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (queryToSend?: string) => {
    const text = (queryToSend ?? inputQuery).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryToSend) setInputQuery("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          projectId: selectedProjectId || undefined,
        }),
      });

      const json = await res.json();
      const answer = json?.data?.answer || "I processed your request, but could not produce a response.";

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "assistant",
        text: answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: "⚠️ AI assistance is temporarily unavailable. Your project data is safe. Please check your connection and try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <AuthenticatedLayout>
      <div className="space-y-6 max-w-5xl mx-auto pb-8 flex flex-col h-[calc(100vh-120px)]">
        {/* Page Header */}
        <PageHeader
          title="Contextual AI Assistant"
          description="Ask questions about live sprint health, deadline proximity, blocker causes, and team velocity."
          actions={
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Project Context:</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={projectsLoading || projects.length === 0}
                className="h-9 px-3 rounded-lg border border-input bg-background text-xs font-medium focus:ring-2 focus:ring-primary"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {projects.length === 0 && <option value="">No projects available</option>}
              </select>
            </div>
          }
        />

        {/* Chat Container */}
        <Card className="flex-1 flex flex-col overflow-hidden border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
          {/* Messages Area */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 max-w-2xl ${
                  msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-semibold shadow-sm ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 border border-primary/20 text-primary"
                  }`}
                >
                  {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className="space-y-1">
                  <div
                    className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted/40 border border-border/60 text-foreground rounded-tl-none whitespace-pre-line"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div
                    className={`text-[10px] text-muted-foreground px-1 ${
                      msg.sender === "user" ? "text-right" : "text-left"
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex gap-3.5 max-w-2xl mr-auto animate-pulse">
                <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Analyzing real-time project metrics...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="p-3 bg-muted/20 border-t border-border/40 flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 pl-1 flex-shrink-0">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              Suggested:
            </span>
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                disabled={isSending}
                className="text-xs px-3 py-1.5 rounded-full bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-border/60 bg-card">
            <div className="relative flex items-center">
              <textarea
                rows={1}
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about active sprint health, blocked tasks, developer workload... (Enter to send)"
                disabled={isSending}
                className="w-full pl-4 pr-12 py-3 rounded-xl border border-input bg-background text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:outline-none resize-none shadow-sm"
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={isSending || !inputQuery.trim()}
                size="icon"
                className="absolute right-2 h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center shadow-sm"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}
