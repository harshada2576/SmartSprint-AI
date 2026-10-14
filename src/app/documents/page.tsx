"use client";

import * as React from "react";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Folder,
  FileText,
  ImageIcon,
  FileCode,
  Download,
  Share2,
  Clock,
  User,
  Grid3X3,
  List,
  ChevronRight,
  FileSpreadsheet,
  File,
  Loader2,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// API rows are snake_case.
interface FolderRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
}

interface DocumentRow {
  id: string;
  project_id: string;
  folder_id: string | null;
  name: string;
  file_type: string;
  file_size: number | string;
  storage_path: string;
  storage_bucket: string;
  owner_id: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

const getFileIcon = (type: string) => {
  switch (type) {
    case "pdf":
      return <FileText className="h-5 w-5 text-rose-500" />;
    case "doc":
      return <FileText className="h-5 w-5 text-blue-500" />;
    case "image":
      return <ImageIcon className="h-5 w-5 text-violet-500" />;
    case "code":
      return <FileCode className="h-5 w-5 text-emerald-500" />;
    case "spreadsheet":
      return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
    default:
      return <File className="h-5 w-5 text-slate-500" />;
  }
};

const formatBytes = (value: number | string): string => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return "—";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value: string): string => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? "—" : new Date(value).toLocaleDateString();
};

const shortId = (value: string): string =>
  value.length > 8 ? `${value.slice(0, 8)}…` : value;

const inferFileType = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["md", "json", "yaml", "yml", "xml", "ts", "tsx", "js", "py", "html", "css"].includes(ext))
    return "code";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "spreadsheet";
  return "other";
};

export default function DocumentsPage() {
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("list");
  const [selectedFolder, setSelectedFolder] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>("");
  const [folders, setFolders] = React.useState<FolderRow[]>([]);
  const [documents, setDocuments] = React.useState<DocumentRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<boolean>(false);
  const [showFolderForm, setShowFolderForm] = React.useState<boolean>(false);
  const [folderName, setFolderName] = React.useState<string>("");
  // Folders are created on demand by the metadata endpoint (POST
  // /api/documents with `folderName`), so "New Folder" stages a pending
  // name that the next upload consumes.
  const [pendingFolderName, setPendingFolderName] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load projects for the selector.
  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/projects", { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const list = (data?.projects || data?.data || []) as ProjectOption[];
        if (cancelled) return;
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      } catch {
        // Loading state below covers the failure; never demo data.
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const loadDocuments = React.useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/documents?projectId=${encodeURIComponent(projectId)}`,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.success !== true) {
        throw new Error(
          (json?.error?.message as string | undefined) ||
            "Failed to load documents",
        );
      }
      setFolders(Array.isArray(json.data?.folders) ? json.data.folders : []);
      setDocuments(
        Array.isArray(json.data?.documents) ? json.data.documents : [],
      );
      setSelectedFolder(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      setFolders([]);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Async boundary: state updates land in the continuation, not
    // synchronously in the effect body.
    void (async () => {
      if (!selectedProjectId) {
        setLoading(false);
        return;
      }
      await loadDocuments(selectedProjectId);
    })();
  }, [selectedProjectId, loadDocuments]);

  const folderCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      if (doc.folder_id) counts.set(doc.folder_id, (counts.get(doc.folder_id) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  const folderNameOf = (folderId: string | null): string => {
    if (!folderId) return "—";
    return folders.find((f) => f.id === folderId)?.name ?? "—";
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesFolder = selectedFolder === null || doc.folder_id === selectedFolder;
    const matchesSearch =
      searchQuery === "" ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const handleDownload = async (doc: DocumentRow) => {
    setBusyId(doc.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signed-url" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.signedUrl) {
        throw new Error(
          (json?.error?.message as string | undefined) || "Download failed",
        );
      }
      window.open(json.data.signedUrl as string, "_blank", "noopener");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: DocumentRow) => {
    setBusyId(doc.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (json?.error?.message as string | undefined) || "Delete failed",
        );
      }
      await loadDocuments(selectedProjectId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedProjectId) return;
    setUploading(true);
    setActionError(null);
    try {
      // 1. Metadata first: the server generates the storage path and the
      // Storage INSERT policy requires this row to exist.
      const metaRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          name: file.name,
          fileType: inferFileType(file.name),
          fileSize: file.size,
          // A staged "New Folder" name creates the folder on demand;
          // otherwise the upload lands in the selected folder (if any).
          ...(pendingFolderName
            ? { folderName: pendingFolderName }
            : selectedFolder
              ? { folderId: selectedFolder }
              : {}),
        }),
      });
      const metaJson = await metaRes.json().catch(() => null);
      if (!metaRes.ok || !metaJson?.data) {
        throw new Error(
          (metaJson?.error?.message as string | undefined) ||
            "Upload rejected by the server",
        );
      }
      const row = metaJson.data as DocumentRow;
      // 2. Object second, at exactly the server-generated path.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(row.storage_bucket || "project-documents")
        .upload(row.storage_path, file, { upsert: false });
      if (uploadError) {
        // Best-effort cleanup so a failed object upload does not leave a
        // misleading metadata row behind.
        await fetch(`/api/documents/${row.id}`, { method: "DELETE" }).catch(
          () => null,
        );
        throw new Error(uploadError.message || "Object upload failed");
      }
      await loadDocuments(selectedProjectId);
      setPendingFolderName(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = folderName.trim().slice(0, 120);
    if (!name) return;
    // Staged until the next upload, which creates the folder on demand
    // through the supported metadata lane.
    setPendingFolderName(name);
    setFolderName("");
    setShowFolderForm(false);
  };

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Document Center"
        description="Store and manage all project documents"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Documents" },
        ]}
        actions={
          <select
            aria-label="Select Project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-card text-card-foreground border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
        primaryAction={{
          label: uploading ? "Uploading..." : "Upload",
          onClick: () => fileInputRef.current?.click(),
        }}
        secondaryActions={[
          {
            label: "New Folder",
            onClick: () => setShowFolderForm((v) => !v),
          },
        ]}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        aria-label="Choose file to upload"
        onChange={handleFileSelected}
      />

      {actionError && (
        <Card className="mb-4 p-4 border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-500">{actionError}</p>
        </Card>
      )}

      {pendingFolderName && (
        <Card className="mb-4 p-4 border-amber-500/30 bg-amber-500/5 flex items-center justify-between">
          <p className="text-sm text-amber-700">
            Next upload will create folder “{pendingFolderName}”.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPendingFolderName(null)}
          >
            Clear
          </Button>
        </Card>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar - Folder Tree */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Folders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {showFolderForm && (
                <form
                  onSubmit={handleCreateFolder}
                  className="flex gap-2 px-4 py-3 border-b border-slate-100"
                >
                  <input
                    aria-label="Folder name"
                    required
                    placeholder="Folder name"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="flex-1 min-w-0 bg-card text-card-foreground border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button variant="secondary" size="sm" type="submit">
                    Add
                  </Button>
                </form>
              )}
              <div className="divide-y divide-slate-100">
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                    selectedFolder === null
                      ? "bg-slate-50 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Folder className="h-4 w-4 text-slate-400" />
                  All Documents
                  <Badge variant="default" size="sm" className="ml-auto">
                    {documents.length}
                  </Badge>
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                      selectedFolder === folder.id
                        ? "bg-slate-50 text-slate-900 font-medium"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Folder className="h-4 w-4 text-amber-400" />
                    {folder.name}
                    <Badge variant="default" size="sm" className="ml-auto">
                      {folderCounts.get(folder.id) ?? 0}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-4 flex-1">
                <SearchInput
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  className="w-80"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded ${
                      viewMode === "grid"
                        ? "bg-white shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 rounded ${
                      viewMode === "list"
                        ? "bg-white shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                  <p>Loading documents...</p>
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-red-500">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => loadDocuments(selectedProjectId)}
                  >
                    Retry
                  </Button>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <p className="text-base font-semibold">No documents found</p>
                  <p className="text-sm mt-1">
                    Upload your first document to get started.
                  </p>
                </div>
              ) : viewMode === "list" ? (
                <table className="w-full">
                  <thead className="border-b border-slate-200 bg-slate-50/50">
                    <tr>
                      <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                        Name
                      </th>
                      <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                        Folder
                      </th>
                      <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                        Owner
                      </th>
                      <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                        Modified
                      </th>
                      <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                        Size
                      </th>
                      <th className="h-11 px-4 text-left text-xs font-medium text-slate-500 uppercase">
                        Version
                      </th>
                      <th className="w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDocuments.map((doc) => (
                      <tr
                        key={doc.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleDownload(doc)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {getFileIcon(doc.file_type)}
                            <span className="font-medium text-slate-900">
                              {doc.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {folderNameOf(doc.folder_id)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {shortId(doc.owner_id)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {formatDate(doc.updated_at)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {formatBytes(doc.file_size)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" size="sm">
                            v{doc.version}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Download ${doc.name}`}
                              disabled={busyId === doc.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(doc);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${doc.name}`}
                              disabled={busyId === doc.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(doc);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="grid grid-cols-3 gap-4 p-4">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => handleDownload(doc)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        {getFileIcon(doc.file_type)}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Download ${doc.name}`}
                          disabled={busyId === doc.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(doc);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="font-medium text-slate-900 text-sm mb-1 truncate">
                        {doc.name}
                      </p>
                      <p className="text-xs text-slate-500">{folderNameOf(doc.folder_id)}</p>
                      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                        <span>{formatBytes(doc.file_size)}</span>
                        <Badge variant="outline" size="sm">
                          v{doc.version}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
