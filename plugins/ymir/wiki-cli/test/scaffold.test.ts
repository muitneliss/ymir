import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { validateWiki } from "../src/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const TPL = join(here, "..", "..", "templates", "wiki");

let proj: string;
beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "proj-")); });

describe("wiki scaffold", () => {
  it("produces a valid wiki from templates", () => {
    const wiki = join(proj, "wiki");
    for (const d of ["raw", "sources", "notes"]) {
      cpSync(join(TPL, "gitkeep"), join(wiki, d, ".gitkeep"));
    }
    const schema = readFileSync(join(TPL, "SCHEMA.md"), "utf8")
      .replaceAll("PROJECT_NAME", basename(proj));
    writeFileSync(join(wiki, "SCHEMA.md"), schema);
    cpSync(join(TPL, "index.seed.md"), join(wiki, "index.md"));
    cpSync(join(TPL, "log.seed.md"), join(wiki, "log.md"));

    expect(existsSync(join(wiki, "raw", ".gitkeep"))).toBe(true);
    expect(schema).not.toContain("PROJECT_NAME");
    const r = validateWiki(wiki);
    expect(r.ok).toBe(true);
  });
});
