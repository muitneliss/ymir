import { describe, it, expect } from "bun:test";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileProvenance } from "../src/provenance.js";
import { sha256Hex } from "../src/hash.js";

describe("fileProvenance", () => {
  it("returns relative path from projectRoot to file", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-test-"));
    const subdir = join(root, "src");
    mkdirSync(subdir, { recursive: true });
    const filePath = join(subdir, "auth.ts");
    writeFileSync(filePath, "export const auth = true;");
    const prov = fileProvenance(root, filePath);
    expect(prov.sourcePath).toBe(relative(root, filePath));
    expect(prov.sourcePath).toBe("src/auth.ts");
  });

  it("sourceHash matches sha256Hex of file content", () => {
    const root = mkdtempSync(join(tmpdir(), "prov-test-"));
    const filePath = join(root, "readme.md");
    const content = "# Hello";
    writeFileSync(filePath, content);
    const prov = fileProvenance(root, filePath);
    expect(prov.sourceHash).toBe(sha256Hex(content));
  });
});
