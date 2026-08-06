"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  Image,
  FileCode,
  MoreHorizontal,
  Upload,
  FolderPlus,
  Download,
  Share2,
  Clock,
  User,
  Grid3X3,
  List,
  ChevronRight,
  FileSpreadsheet,
  File,
} from "lucide-react";

const folders = [
  { id: 1, name: "Business", count: 12, icon: Folder },
  { id: 2, name: "Technical", count: 24, icon: Folder },
  { id: 3, name: "Legal", count: 8, icon: Folder },
  { id: 4, name: "Financial", count: 15, icon: Folder },
  { id: 5, name: "Requirements", count: 18, icon: Folder },
  { id: 6, name: "Testing", count: 32, icon: Folder },
];

const documents = [
  {
    id: 1,
    name: "Project Charter.pdf",
    type: "pdf",
    size: "2.4 MB",
    owner: "John Smith",
    modified: "2 hours ago",
    version: "v1.2",
    folder: "Business",
  },
  {
    id: 2,
    name: "Software Requirements Specification.docx",
    type: "doc",
    size: "1.8 MB",
    owner: "Sarah Chen",
    modified: "5 hours ago",
    version: "v2.1",
    folder: "Requirements",
  },
  {
    id: 3,
    name: "System Architecture.png",
    type: "image",
    size: "4.2 MB",
    owner: "Mike Johnson",
    modified: "1 day ago",
    version: "v1.0",
    folder: "Technical",
  },
  {
    id: 4,
    name: "API Documentation.md",
    type: "code",
    size: "156 KB",
    owner: "Emily Davis",
    modified: "2 days ago",
    version: "v3.0",
    folder: "Technical",
  },
  {
    id: 5,
    name: "Budget Estimate.xlsx",
    type: "spreadsheet",
    size: "892 KB",
    owner: "David Wilson",
    modified: "3 days ago",
    version: "v1.5",
    folder: "Financial",
  },
  {
    id: 6,
    name: "Contract Agreement.pdf",
    type: "pdf",
    size: "3.1 MB",
    owner: "John Smith",
    modified: "1 week ago",
    version: "v1.0",
    folder: "Legal",
  },
];

const getFileIcon = (type: string) => {
  switch (type) {
    case "pdf":
      return <FileText className="h-5 w-5 text-rose-500" />;
    case "doc":
      return <FileText className="h-5 w-5 text-blue-500" />;
    case "image":
      return <Image className="h-5 w-5 text-violet-500" />;
    case "code":
      return <FileCode className="h-5 w-5 text-emerald-500" />;
    case "spreadsheet":
      return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
    default:
      return <File className="h-5 w-5 text-slate-500" />;
  }
};

export default function DocumentsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("list");
  const [selectedFolder, setSelectedFolder] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredDocuments = documents.filter((doc) => {
    const matchesFolder = selectedFolder === null || 
      folders.find(f => f.id === selectedFolder)?.name === doc.folder;
    const matchesSearch = searchQuery === "" ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  return (
    <AuthenticatedLayout>
      <PageHeader
        title="Document Center"
        description="Store and manage all project documents"
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Documents" },
        ]}
        primaryAction={{
          label: "Upload",
          onClick: () => {},
        }}
        secondaryActions={[
          {
            label: "New Folder",
            onClick: () => {},
          },
        ]}
      />

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar - Folder Tree */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Folders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
                    <folder.icon className="h-4 w-4 text-amber-400" />
                    {folder.name}
                    <Badge variant="default" size="sm" className="ml-auto">
                      {folder.count}
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
              {viewMode === "list" ? (
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
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDocuments.map((doc) => (
                      <tr
                        key={doc.id}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {getFileIcon(doc.type)}
                            <span className="font-medium text-slate-900">
                              {doc.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {doc.folder}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {doc.owner}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {doc.modified}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {doc.size}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" size="sm">
                            {doc.version}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
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
                    >
                      <div className="flex items-start justify-between mb-3">
                        {getFileIcon(doc.type)}
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="font-medium text-slate-900 text-sm mb-1 truncate">
                        {doc.name}
                      </p>
                      <p className="text-xs text-slate-500">{doc.folder}</p>
                      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                        <span>{doc.size}</span>
                        <Badge variant="outline" size="sm">
                          {doc.version}
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
