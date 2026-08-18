import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runIngest } from "../src/commands/ingest.js";
import { parseFrontmatter } from "../src/frontmatter.js";
import { readPage } from "../src/store.js";
import { sha256Hex } from "../src/hash.js";
import { sourcePath } from "../src/paths.js";

function initWiki(projectRoot: string): string {
  const wikiRoot = join(projectRoot, "wiki");
  mkdirSync(join(wikiRoot, "sources"), { recursive: true });
  mkdirSync(join(wikiRoot, "notes"), { recursive: true });
  // Write minimal SCHEMA.md to pass validation
  writeFileSync(join(wikiRoot, "SCHEMA.md"), "# Schema\n");
  return wikiRoot;
}

describe("runIngest with provenance", () => {
  it("stores source_path and source_hash when provided", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ingest-src-"));
    const wikiRoot = initWiki(projectRoot);
    const srcDir = join(projectRoot, "src");
    mkdirSync(srcDir, { recursive: true });
    const srcFile = join(srcDir, "auth.ts");
    const content = "export const auth = true;";
    writeFileSync(srcFile, content);

    await runIngest({
      root: wikiRoot,
      raw: "src/auth.ts",
      title: "Auth Module",
      body: "Auth module summary.",
      today: "2026-06-17",
      sourcePath: "src/auth.ts",
      sourceHash: sha256Hex(content),
      noReindex: true,
    });

    const path = sourcePath(wikiRoot, "Auth Module");
    const { data } = parseFrontmatter(readPage(path));
    expect(data.source_path).toBe("src/auth.ts");
    expect(data.source_hash).toBe(sha256Hex(content));
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("re-ingest updates source_hash", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ingest-src-"));
    const wikiRoot = initWiki(projectRoot);

    await runIngest({
      root: wikiRoot,
      raw: "src/auth.ts",
      title: "Auth Module",
      body: "First summary.",
      today: "2026-06-17",
      sourcePath: "src/auth.ts",
      sourceHash: "oldhash",
      noReindex: true,
    });

    await runIngest({
      root: wikiRoot,
      raw: "src/auth.ts",
      title: "Auth Module",
      body: "Updated summary.",
      today: "2026-06-17",
      sourcePath: "src/auth.ts",
      sourceHash: "newhash",
      noReindex: true,
    });

    const path = sourcePath(wikiRoot, "Auth Module");
    const { data } = parseFrontmatter(readPage(path));
    expect(data.source_hash).toBe("newhash");
    rmSync(projectRoot, { recursive: true, force: true });
  });
});
