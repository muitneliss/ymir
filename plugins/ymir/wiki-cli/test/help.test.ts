import { describe, it, expect } from "bun:test";
import { HELP_TEXT } from "../src/commands/help.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schemaTemplate = readFileSync(
  join(import.meta.dir, "../src/templates/wiki/SCHEMA.md"),
  "utf8",
);

describe("HELP_TEXT contract", () => {
  it("documents --source as the tracked ingest path", () => {
    expect(HELP_TEXT).toContain("--source");
  });

  it("documents the init command", () => {
    expect(HELP_TEXT).toContain("init");
  });

  it("documents the status command", () => {
    expect(HELP_TEXT).toContain("status");
  });

  it("lists all four status states", () => {
    expect(HELP_TEXT).toContain("current");
    expect(HELP_TEXT).toContain("stale");
    expect(HELP_TEXT).toContain("missing");
    expect(HELP_TEXT).toContain("untracked");
  });

  it("documents source_path and source_hash in page conventions", () => {
    expect(HELP_TEXT).toContain("source_path");
    expect(HELP_TEXT).toContain("source_hash");
  });

  it("describes --raw as the external/legacy path, not the default", () => {
    const sourceIndex = HELP_TEXT.indexOf("--source");
    const rawIndex = HELP_TEXT.indexOf("--raw");
    expect(sourceIndex).toBeGreaterThan(-1);
    expect(rawIndex).toBeGreaterThan(-1);
    expect(sourceIndex).toBeLessThan(rawIndex);
  });
});

describe("SCHEMA.md scaffold template contract", () => {
  it("mentions --source as the tracked ingest path", () => {
    expect(schemaTemplate).toContain("--source");
  });

  it("mentions status command", () => {
    expect(schemaTemplate).toContain("status");
  });

  it("mentions source_path and source_hash provenance keys", () => {
    expect(schemaTemplate).toContain("source_path");
    expect(schemaTemplate).toContain("source_hash");
  });
});
