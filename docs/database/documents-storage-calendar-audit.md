# Documents, Storage, Calendar & Preferences — Architecture Audit

Audit scope: documents, folders, calendar events, user preferences, file attachments, avatars, exports.

Source files inspected:
- `supabase/schema.ts` (source of truth)
- `docs/database/frontend-data-mapping.md`
- `src/app/documents/page.tsx`
- `src/app/calendar/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/reports/page.tsx`

---

## 1. Documents

### 1.1 Frontend Requirements

From `src/app/documents/page.tsx` (lines 40–101), the mock documents contain:

| Frontend Field | Type | Example |
|---------------|------|---------|
| id | number | 1 |
| name | string | "Project Charter.pdf" |
| type | string | "pdf", "doc", "image", "code", "spreadsheet" |
| size | string | "2.4 MB" |
| owner | string | "John Smith" (display name) |
| modified | string | "2 hours ago" (relative time) |
| version | string | "v1.2" |
| folder | string | "Business" (folder name, not ID) |

The frontend also supports:
- Upload action (PageHeader primary action)
- Grid/list view toggle
- Search by document name
- Folder-based filtering (sidebar)

### 1.2 Analysis

Documents are distinct, independently managed files. They are NOT derived from other entities (unlike calendar events which can be partially derived from sprints). A dedicated `documents` table is required.

**Key decisions:**

- **owner** → FK to `users.id` (not a display name)
- **modified** → Use `updated_at` timestamp (relative formatting is API/presentation layer)
- **type** → Derive from file extension at upload time, store as enum or text. The frontend uses 6 categories: pdf, doc, image, code, spreadsheet, other. A `document_type` enum is cleaner.
- **version** → The frontend shows "v1.2", "v2.1" etc. This implies versioning. Two options:
  - **Option A**: Store version as a simple text field on the document row. Each upload creates a NEW row with an incremented version. Old rows are marked as superseded.
  - **Option B**: Store version as a simple integer counter on the document row. Overwrite storage path on each upload. Historical versions are lost.
  - **Recommendation**: Option A (version history rows). This preserves history and matches the frontend's version display. A `parent_version_id` self-reference links versions of the same logical document.
- **size** → Store as `bigint` (bytes). The frontend formats for display. Max value concerns: PostgreSQL `bigint` supports up to ~9.2 EB, which is sufficient.
- **folder** → FK to a `folders` table (see §2)

### 1.3 Recommended Table: `documents`

```
documents
├── id: uuid (PK)
├── project_id: uuid (FK → projects.id, NOT NULL, CASCADE)
├── folder_id: uuid (FK → folders.id, NULLABLE)
├── name: text (NOT NULL) — original filename
├── file_type: text (NOT NULL) — derived MIME category or extension
├── file_size: bigint (NOT NULL) — bytes
├── storage_path: text (NOT NULL) — Supabase Storage object path
├── storage_bucket: text (NOT NULL) — for multi-bucket support
├── owner_id: uuid (FK → users.id, NOT NULL)
├── version: integer (NOT NULL, DEFAULT 1)
├── parent_version_id: uuid (FK → documents.id, NULLABLE) — for version chain
├── is_latest: boolean (NOT NULL, DEFAULT true) — quick filter for current version
├── description: text (NULLABLE) — optional notes
├── created_at: timestamptz (NOT NULL, DEFAULT now())
├── updated_at: timestamptz (NOT NULL, DEFAULT now())
```

**Indexes:**
- `idx_documents_project_id` on `project_id`
- `idx_documents_folder_id` on `folder_id`
- `idx_documents_owner_id` on `owner_id`
- `idx_documents_project_folder` on `(project_id, folder_id)` — composite for the primary query pattern

**Classification:** **KEEP — New table required**

### 1.4 Uncertainty: Versioning Complexity

**⚠️ UNCERTAINTY**: The frontend mock shows versions like "v1.2" which suggests semantic versioning (major.minor). A simple integer `version` column only supports sequential numbering (1, 2, 3). Two paths:

1. **Simple integer versioning** (recommended): `version = 1, 2, 3...` and display as "v1", "v2", "v3". The frontend mock's "v1.2" style would be slightly different from what's shown. This is the lowest complexity option.
2. **Semantic versioning**: Store `major` and `minor` as separate integers, or store the version string as text. This adds complexity but matches the mock exactly.

**Recommendation**: Use simple integer versioning. The schema-finalization agent should confirm whether the frontend can tolerate "v1" vs "v1.2" display, or whether semantic versioning is truly needed.

---

## 2. Folders

### 2.1 Frontend Requirements

From `src/app/documents/page.tsx` (lines 31–38):

| Frontend Field | Type | Example |
|---------------|------|---------|
| id | number | 1 |
| name | string | "Business" |
| count | number | 12 (derived: document count) |
| icon | Component | Folder (UI-only, not stored) |

The folder sidebar is flat in the mock (no nesting visible). However, real-world document management typically requires hierarchy.

### 2.2 Analysis

**Should folders be independent entities?**

Yes. Folders are referenced by documents and displayed independently in the sidebar. They are NOT derived from other entities.

**Hierarchy question:** The mock data shows a flat list. However:
- The "New Folder" action in the UI suggests user-created folders
- A flat-only folder structure is limiting for real usage
- Self-referencing `parent_id` is the standard pattern and costs nothing at rest

**Recommendation**: Include `parent_id` for future hierarchy support even if the initial UI is flat. This avoids a migration later.

### 2.3 Recommended Table: `folders`

```
folders
├── id: uuid (PK)
├── project_id: uuid (FK → projects.id, NOT NULL, CASCADE)
├── parent_id: uuid (FK → folders.id, NULLABLE) — self-reference for hierarchy
├── name: text (NOT NULL)
├── created_by: uuid (FK → users.id, NOT NULL)
├── created_at: timestamptz (NOT NULL, DEFAULT now())
├── updated_at: timestamptz (NOT NULL, DEFAULT now())
├── UNIQUE(project_id, parent_id, name) — prevent duplicate names within same parent
```

**Indexes:**
- `idx_folders_project_id` on `project_id`
- `idx_folders_parent_id` on `parent_id`

**Document count**: Derived via `COUNT(documents WHERE folder_id = X)`, not stored.

**Classification:** **KEEP — New table required**

### 2.4 Uncertainty: Folder Scope

**⚠️ UNCERTAINTY**: Are folders project-scoped or organization-scoped? The frontend shows a single flat list of folders without a project selector. Two interpretations:

1. **Project-scoped folders** (recommended): Each project has its own folder tree. The documents page likely filters by the current project context (which isn't visible in the mock since there's no project selector in the UI). This is the standard pattern for project management tools.
2. **Organization-wide folders**: Folders span all projects. This creates permission complexity and naming conflicts.

**Recommendation**: Project-scoped. The schema-finalization agent should confirm whether the documents page always operates within a project context, or if a global document center is intended.

---

## 3. Supabase Storage Architecture

### 3.1 Storage Requirements Summary

| Asset Type | Source Pages | Size Range | Sensitivity |
|-----------|-------------|-----------|-------------|
| Project documents | Documents page | 100 KB – 50 MB | Private (project-scoped) |
| User avatars | Settings, Team, all pages with user display | 50 KB – 2 MB | Semi-public (any org member) |
| Report exports | Reports page (client-generated) | N/A — not stored | N/A |

### 3.2 Recommended Buckets

#### Bucket 1: `project-documents` (Private)

- **Access**: Authenticated users with project membership
- **Path convention**: `{project_id}/{folder_id}/{document_id}/{filename}`
  - Example: `a1b2c3d4-.../e5f6g7h8-.../i9j0k1l2-.../Project%20Charter.pdf`
- **Why this structure**:
  - `project_id` at root enables RLS by project
  - `folder_id` mirrors logical organization (but is not required for Storage)
  - `document_id` ensures uniqueness and allows rename without re-uploading
  - Filename is human-readable in Storage dashboard
- **RLS policy**: Users can only access files under projects they are members of
- **Metadata**: All metadata (name, type, size, version, owner) lives in PostgreSQL `documents` table. Storage holds ONLY the binary content.

#### Bucket 2: `avatars` (Public)

- **Access**: Anyone (avatars appear in team lists, activity feeds, comments)
- **Path convention**: `{user_id}/avatar.{ext}`
  - Example: `a1b2c3d4-.../avatar.png`
- **Why public**: Avatars are displayed to all authenticated users. Making the bucket public avoids signed URL complexity for every avatar display. The `users.avatar_url` column stores the public URL.
- **Alternative**: If avatars should only be visible to org members, use a private bucket with signed URLs. This adds complexity but improves security.
- **Uncertainty**: See §6.1

#### No bucket needed for exports

The reports page generates PDF/Excel/CSV client-side or via API. These are streamed to the browser, not stored in Supabase Storage. If report persistence is later required, a third bucket can be added.

### 3.3 Storage vs PostgreSQL Division

| Data | Belongs In | Reason |
|------|-----------|--------|
| File binary content | Supabase Storage | Large binary objects, CDN delivery |
| File metadata (name, size, type, version) | PostgreSQL `documents` | Queryable, filterable, joinable |
| Storage path / bucket name | PostgreSQL `documents` | Needed to construct download URLs |
| Avatar binary content | Supabase Storage | Image serving |
| Avatar URL | PostgreSQL `users.avatar_url` | Quick access for display |
| Folder structure | PostgreSQL `folders` | Queryable hierarchy |

### 3.4 Classification

- **project-documents bucket**: **KEEP — Required for document storage**
- **avatars bucket**: **KEEP — Required for user avatars**
- **exports bucket**: **DEFER — Not needed now; reports are client-generated**

---

## 4. Calendar Events

### 4.1 Frontend Requirements

From `src/app/calendar/page.tsx` (lines 24–31), the mock events:

| Frontend Field | Type | Example |
|---------------|------|---------|
| id | number | 1 |
| title | string | "Sprint 4 Planning" |
| date | string | "2025-07-21" |
| type | string | "sprint", "meeting", "milestone", "deadline", "document" |
| time | string | "10:00 AM" |

Event types and their colors (lines 33–48):
- `sprint` — violet
- `meeting` — blue
- `milestone` — emerald
- `deadline` — rose
- `document` — amber

### 4.2 Analysis: Should Calendar Events Be Independent?

The mock data reveals **five event types**. Let's classify each:

| Type | Can Be Derived? | Source |
|------|----------------|--------|
| `sprint` | **YES** | `sprints.start_date` and `sprints.end_date` |
| `milestone` | **YES** (if milestones table exists) | `milestones.date` |
| `deadline` | **PARTIALLY** | Sprint end dates, requirement due dates (if added) |
| `meeting` | **NO** | Standalone user-created events |
| `document` | **UNCERTAIN** | Could derive from document expiry dates (if tracked) |

**Key insight**: 2 of 5 types are fully derivable from existing/future tables. Only `meeting` is truly standalone. The remaining 2 (`deadline`, `document`) are partially derivable.

### 4.3 Recommended Approach: Hybrid

**Option A — Fully independent `calendar_events` table**:
- All 5 types stored as rows
- Simple, consistent query pattern
- Risk: Duplicates data already in `sprints` (sprint start/end appear as both sprint entities AND calendar events)

**Option B — Derived events + standalone events** (recommended):
- The calendar API **computes** sprint events, milestone events, and deadline events from their source tables
- Only `meeting` type events are stored in a `calendar_events` table
- The API merges both sources before returning to the frontend
- **Advantage**: No data duplication. Sprint date changes automatically reflect in the calendar.
- **Disadvantage**: Slightly more complex API logic.

**Option C — All events stored, with `source_type` and `source_id`**:
- Every event is a row, but derivable types have FK references to their source
- `source_type = 'sprint'`, `source_id = sprints.id`
- When a sprint's dates change, a trigger or service updates the calendar event
- **Risk**: Cache invalidation complexity, potential for stale data

### 4.4 Recommended Table: `calendar_events`

```
calendar_events
├── id: uuid (PK)
├── project_id: uuid (FK → projects.id, NOT NULL, CASCADE)
├── title: text (NOT NULL)
├── event_date: date (NOT NULL)
├── event_time: time (NULLABLE) — NULL for all-day events
├── event_type: text (NOT NULL) — 'meeting' only for stored events
├── description: text (NULLABLE)
├── created_by: uuid (FK → users.id, NOT NULL)
├── created_at: timestamptz (NOT NULL, DEFAULT now())
├── updated_at: timestamptz (NOT NULL, DEFAULT now())
```

**Note**: This table stores ONLY user-created events (meetings). Sprint/milestone/deadline events are derived at query time.

**If Option A (fully independent) is chosen instead**, add:
- `source_type: text (NULLABLE)` — 'sprint', 'milestone', 'manual'
- `source_id: uuid (NULLABLE)` — FK to source table
- `is_recurring: boolean (DEFAULT false)`
- `recurrence_rule: text (NULLABLE)` — iCal RRULE format

**Classification:** **MODIFY — Table required, but scope depends on derivation approach**

### 4.5 Uncertainty: Event Derivation Strategy

**⚠️ UNCERTAINTY**: The schema-finalization agent must decide between:

1. **Hybrid (Option B)**: Calendar API derives sprint/milestone events. Only meetings stored. Cleanest data model, no duplication.
2. **Fully independent (Option A)**: All events stored as rows. Simpler API queries, but requires sync logic to keep derived events current.
3. **Source-linked (Option C)**: All events stored with FK references. Middle ground, but adds sync complexity.

**Recommendation**: Option B (Hybrid) is architecturally cleanest. The frontend calendar is a **view** over multiple data sources, not a standalone entity. This follows the same pattern as the dashboard (which derives data from multiple tables).

---

## 5. User Preferences

### 5.1 Frontend Requirements

From `src/app/settings/page.tsx`:

**General tab (lines 55–78):**
| Field | Current DB Support | Notes |
|-------|-------------------|-------|
| First Name | `users.first_name` ✅ | Direct |
| Last Name | `users.last_name` ✅ | Direct |
| Email | `users.email` ✅ | Direct |
| Job Title | ❌ UNMAPPED | No column exists |
| Department | `users.department` ✅ | Direct |
| Avatar | `users.avatar_initials` ✅ (fallback) | Avatar URL missing |

**Appearance tab (lines 86–139):**
| Field | Current DB Support | Notes |
|-------|-------------------|-------|
| Theme (Light/Dark/System) | ❌ UNMAPPED | No preferences table |
| Sidebar (Expanded/Collapsed) | ❌ UNMAPPED | No preferences table |

**Notifications tab (lines 141–189):**
| Field | Current DB Support | Notes |
|-------|-------------------|-------|
| Task assignments (email/push) | ❌ UNMAPPED | No preferences table |
| Sprint updates (email/push) | ❌ UNMAPPED | |
| Document uploads (email/push) | ❌ UNMAPPED | |
| Approval requests (email/push) | ❌ UNMAPPED | |
| Budget alerts (email/push) | ❌ UNMAPPED | |
| System updates (email/push) | ❌ UNMAPPED | |

**Organization tab (lines 192–231):**
| Field | Current DB Support | Notes |
|-------|-------------------|-------|
| Organization Name | ❌ UNMAPPED | No organizations table |
| Organization URL | ❌ UNMAPPED | |
| Industry | ❌ UNMAPPED | |
| Timezone | ❌ UNMAPPED | |

**Security tab (lines 234–276):**
| Field | Current DB Support | Notes |
|-------|-------------------|-------|
| Password change | Supabase Auth | Not a DB column |
| 2FA | Supabase Auth | Not a DB column |

### 5.2 Analysis: What Goes Where?

The settings page mixes four distinct concerns:

| Concern | Belongs To | Implementation |
|---------|-----------|---------------|
| Profile (name, email, job title, department) | `users` table | Add `job_title` column |
| Avatar | `users` table + Storage | Add `avatar_url` column to `users` |
| UI preferences (theme, sidebar) | `user_preferences` table | New table |
| Notification preferences | `user_preferences` table | JSONB or structured columns |
| Organization settings | `organizations` table | New table (separate audit scope) |
| Security (password, 2FA) | Supabase Auth | No database changes needed |

### 5.3 Recommended Table: `user_preferences`

```
user_preferences
├── user_id: uuid (PK, FK → users.id, CASCADE) — one row per user
├── theme: text (NOT NULL, DEFAULT 'light') — 'light', 'dark', 'system'
├── sidebar_collapsed: boolean (NOT NULL, DEFAULT false)
├── notification_preferences: jsonb (NOT NULL, DEFAULT '{}') — structured notification toggles
├── created_at: timestamptz (NOT NULL, DEFAULT now())
├── updated_at: timestamptz (NOT NULL, DEFAULT now())
```

**Notification preferences JSONB structure:**
```json
{
  "task_assignments": { "email": true, "push": true },
  "sprint_updates": { "email": true, "push": false },
  "document_uploads": { "email": false, "push": true },
  "approval_requests": { "email": true, "push": true },
  "budget_alerts": { "email": true, "push": false },
  "system_updates": { "email": false, "push": false }
}
```

**Why JSONB for notification preferences**: The notification types are a fixed set defined by the UI, not a queryable domain. JSONB avoids creating 6+ boolean columns that change when the UI adds a new notification type. The API layer validates the structure.

**Alternative**: Individual boolean columns (`task_assignments_email`, `task_assignments_push`, etc.). More type-safe but creates 12 columns for 6 notification types. If the notification types are truly fixed, this is viable.

### 5.4 Missing Columns on `users`

| Column | Type | Purpose | Priority |
|--------|------|---------|----------|
| `job_title` | text, NULLABLE | Profile display | Low |
| `avatar_url` | text, NULLABLE | Avatar image URL (from Storage) | Medium |
| `last_active_at` | timestamptz, NULLABLE | "Last active" on Team page | Low |
| `organization_id` | uuid, FK → organizations.id, NULLABLE | Multi-tenancy | High (separate audit) |

### 5.5 Classification

- **`user_preferences` table**: **KEEP — Required for theme and notification settings**
- **`users.job_title`**: **KEEP — Low-effort column addition**
- **`users.avatar_url`**: **KEEP — Required for avatar display across the app**
- **`users.last_active_at`**: **DEFER — Nice-to-have, can be added later**
- **`organizations` table**: **DEFER — Out of scope for this audit (separate multi-tenancy concern)**

### 5.6 Uncertainty: Notification Preferences Granularity

**⚠️ UNCERTAINTY**: Should notification preferences be stored per-user (as proposed) or per-organization with user overrides?

- **Per-user only** (proposed): Each user fully controls their notifications. Simple.
- **Org defaults + user overrides**: Organization sets defaults, users can override. More complex but enterprise-appropriate.

**Recommendation**: Per-user for now. Organization-level defaults can be added later as an override layer.

---

## 6. Avatars

### 6.1 Current State

The `users` table has `avatar_initials` (text, nullable) which serves as a fallback when no avatar image is set. The Settings page (line 56) shows a circular initial display ("JS") with a "Change Avatar" button.

### 6.2 Requirements

- Upload: JPG, PNG, GIF, max 2MB (Settings page line 63)
- Display: Team page, activity feeds, any user reference
- Fallback: Use `avatar_initials` when `avatar_url` is NULL

### 6.3 Recommended Approach

1. Add `avatar_url: text (NULLABLE)` column to `users` table
2. Use `avatars` Storage bucket (see §3.2)
3. On upload: store file in `avatars/{user_id}/avatar.{ext}`, set `users.avatar_url` to the public URL
4. Frontend logic: if `avatar_url` is set, display image; else, display `avatar_initials`

**Classification:** **MODIFY — Add `avatar_url` column to existing `users` table**

---

## 7. Exports

### 7.1 Frontend Requirements

From `src/app/reports/page.tsx` (lines 134–143), the reports page has PDF, Excel, and CSV export buttons. These appear on:
- Sprint report
- Budget report
- (Other report categories show placeholder UI)

Export buttons also appear on list pages (Projects, Requirements, Team, Governance) per the frontend data mapping.

### 7.2 Analysis

Exports in the current frontend are **client-side generation** (or future API endpoints that stream data). There is:

- No persisted export history
- No export queue
- No export download library
- No "recent exports" UI

The export buttons trigger generation + download. The generated file is streamed to the browser and not stored.

### 7.3 Classification

**REMOVE — No database persistence needed for exports**

If export history or scheduled reports are needed in the future, a `report_exports` table can be added then. The current UI does not require it.

---

## 8. File Attachments

### 8.1 Analysis

The frontend data mapping mentions "file attachments" in the storage requirements section. However, inspecting the actual frontend pages:

- **No page has an attachment upload flow** beyond the Documents page
- The Governance page (contracts, approvals, etc.) shows table rows but no file attachment UI
- The Task/Requirement detail views (not present as separate pages) don't show attachment sections

**Attachments are NOT currently required by the frontend.** If task/requirement attachments are needed later, they can use the same `documents` table with a polymorphic relationship (entity_type + entity_id) or a dedicated `attachments` join table.

### 8.2 Classification

**DEFER — Not needed by current frontend. The `documents` table covers all current file management needs.**

---

## 9. Summary: Entity Classification

### New Tables Required

| Entity | Classification | Priority | Dependencies |
|--------|---------------|----------|-------------|
| `documents` | **KEEP** | High | `folders`, `projects`, `users` |
| `folders` | **KEEP** | High | `projects`, `users` |
| `calendar_events` | **MODIFY** (scope TBD) | Medium | `projects`, `users` |
| `user_preferences` | **KEEP** | Low | `users` |

### Column Additions to Existing Tables

| Table | Column | Classification | Priority |
|-------|--------|---------------|----------|
| `users` | `avatar_url` | **MODIFY** | Medium |
| `users` | `job_title` | **MODIFY** | Low |
| `users` | `organization_id` | **MODIFY** | High (separate audit) |
| `users` | `last_active_at` | **DEFER** | Low |

### Storage Buckets

| Bucket | Classification | Priority |
|--------|---------------|----------|
| `project-documents` (private) | **KEEP** | High |
| `avatars` (public or private) | **KEEP** | Medium |
| Report exports | **REMOVE** | N/A |

### Entities NOT Needed

| Entity | Reason |
|--------|--------|
| Standalone file attachments table | No attachment UI in frontend |
| Export persistence table | Exports are client-generated |
| Document folder permissions | No permission UI in frontend; defer to RLS |

---

## 10. Recommended Relationships

```
projects
 └── has many folders (folders.project_id → projects.id)
      └── has many documents (documents.folder_id → folders.id)
 └── has many documents (documents.project_id → projects.id)
 └── has many calendar_events (calendar_events.project_id → projects.id)

users
 ├── owns documents (documents.owner_id → users.id)
 ├── creates folders (folders.created_by → users.id)
 ├── creates calendar_events (calendar_events.created_by → users.id)
 ├── has one user_preferences (user_preferences.user_id → users.id)
 └── has avatar_url (users.avatar_url → avatars Storage path)

documents (self-referencing)
 └── has parent version (documents.parent_version_id → documents.id)

folders (self-referencing)
 └── has parent folder (folders.parent_id → folders.id)
```

---

## 11. Open Questions for Schema-Finalization Agent

1. **Document versioning**: Simple integer (v1, v2, v3) or semantic (v1.2, v2.1)? Frontend mock shows semantic style.
2. **Folder scope**: Project-scoped or organization-wide? Recommendation: project-scoped.
3. **Calendar derivation**: Hybrid (derive sprint/milestone events at query time) or fully independent table? Recommendation: hybrid.
4. **Avatar bucket visibility**: Public (simpler) or private with signed URLs (more secure)? Recommendation: public for v1.
5. **Notification preferences**: JSONB blob or individual boolean columns? Recommendation: JSONB for flexibility.
6. **Organizations table**: When should this be designed? It's referenced by users but is a separate multi-tenancy concern.
