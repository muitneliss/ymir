import { describe, it, expect } from "bun:test";

// Reimplements formatSyncMessage from the hook for unit testing
function formatSyncMessage(
  stale: { title: string; source_path?: string }[],
  missing: { title: string; source_path?: string }[],
  root: string
): string {
  const lines = ["[ymir] Wiki out of date. Re-ingest these to match current files:"];
  for (const s of stale) {
    lines.push(`  - page "${s.title}"  ← ${s.source_path} (changed)`);
  }
  for (const s of missing) {
    lines.push(`  - page "${s.title}"  ← ${s.source_path ?? "(unknown)"} (missing)`);
  }
  lines.push("For each: read the file, then run:");
  lines.push(`  wiki --root ${root} ingest --source <path> --title "<page title>"`);
  return lines.join("\n") + "\n";
}

describe("wiki-sync-status hook message formatting", () => {
  it("includes stale page with source_path and (changed) label", () => {
    const msg = formatSyncMessage(
      [{ title: "Auth Module", source_path: "src/auth.ts" }],
      [],
      "./wiki"
    );
    expect(msg).toContain("[ymir] Wiki out of date");
    expect(msg).toContain('page "Auth Module"');
    expect(msg).toContain("src/auth.ts (changed)");
    expect(msg).toContain("wiki --root ./wiki ingest --source <path>");
  });

  it("includes missing page with (missing) label", () => {
    const msg = formatSyncMessage(
      [],
      [{ title: "Readme", source_path: "README.md" }],
      "./wiki"
    );
    expect(msg).toContain('page "Readme"');
    expect(msg).toContain("README.md (missing)");
  });

  it("uses (unknown) when source_path absent on missing page", () => {
    const msg = formatSyncMessage([], [{ title: "Orphan" }], "./wiki");
    expect(msg).toContain("(unknown)");
  });
});
