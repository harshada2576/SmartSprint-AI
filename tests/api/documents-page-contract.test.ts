/**
 * Documents page wiring contract tests (STATIC — no database, no Storage).
 *
 * Pins that the Document Center renders persisted metadata instead of
 * mock arrays: project-scoped fetching, signed-URL download, server-path
 * upload with orphan cleanup, folder staging through the supported
 * on-demand lane, and honest loading/error/empty states.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

const PAGE = readSource("src", "app", "documents", "page.tsx");

describe("documents page real-data wiring", () => {
  it("renders persisted rows instead of mock arrays", () => {
    expect(PAGE).not.toMatch(/const folders = \[/);
    expect(PAGE).not.toMatch(/const documents = \[/);
    expect(PAGE).not.toMatch(/Project Charter\.pdf/);
    expect(PAGE).toMatch(/\/api\/documents\?projectId=/);
  });

  it("downloads through the signed-URL lane", () => {
    expect(PAGE).toMatch(/"signed-url"/);
    expect(PAGE).toMatch(/signedUrl/);
  });

  it("uploads metadata-first, then the object at the server path", () => {
    expect(PAGE).toMatch(/\/api\/documents/);
    expect(PAGE).toMatch(/storage_path/);
    expect(PAGE).toMatch(/storage_bucket/);
    // Failed object uploads clean up the metadata row.
    expect(PAGE).toMatch(/method: "DELETE"/);
  });

  it("stages new folders through the supported on-demand lane", () => {
    expect(PAGE).toMatch(/pendingFolderName/);
    expect(PAGE).toMatch(/folderName/);
  });

  it("handles loading, error, and empty states honestly", () => {
    expect(PAGE).toMatch(/Loading documents/);
    expect(PAGE).toMatch(/No documents found/);
    expect(PAGE).toMatch(/Retry/);
  });
});
