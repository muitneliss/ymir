import { describe, it, expect } from "bun:test";
import { writeFileSync, mkdtempSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Hex, hashFile } from "../src/hash.js";

describe("sha256Hex", () => {
  it("returns known hash for empty string", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb924" +
      "27ae41e4649b934ca495991b7852b855"
    );
  });

  it("returns same hash for Buffer and string of same content", () => {
    const content = "hello world";
    expect(sha256Hex(content)).toBe(sha256Hex(Buffer.from(content)));
  });
});

describe("hashFile", () => {
  it("matches sha256Hex of file content", () => {
    const dir = mkdtempSync(join(tmpdir(), "hash-test-"));
    const path = join(dir, "test.txt");
    const content = "test file content";
    writeFileSync(path, content);
    expect(hashFile(path)).toBe(sha256Hex(content));
    unlinkSync(path);
  });
});
