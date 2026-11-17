import { it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { runNote } from "../src/commands/note.js";
import { readPage } from "../src/store.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts");

it("`wiki index` renames pages named by the pre-0.9.3 slug and lists them", async () => {
  const project = mkdtempSync(join(tmpdir(), "slug-migration-"));
  const root = join(project, "wiki");
  await runNote({ root, type: "topic", name: "Bản đồ repo", body: "Map.", today: "2026-06-17", noReindex: true });
  renameSync(join(root, "notes", "ban-do-repo.md"), join(root, "notes", "b-n-repo.md")); // as a 0.9.2 CLI named it

  const r = spawnSync(process.execPath, [CLI, "--root", "wiki", "index", "--no-reindex"], {
    cwd: project, encoding: "utf8", env: { ...process.env, YMIR_HOME: project },
  });

  expect(r.status).toBe(0);
  expect(r.stdout).toContain("renamed notes/b-n-repo.md → notes/ban-do-repo.md");
  expect(existsSync(join(root, "notes", "b-n-repo.md"))).toBe(false);
  expect(readPage(join(root, "index.md"))).toContain("(notes/ban-do-repo.md)");
});
