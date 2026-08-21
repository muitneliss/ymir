import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { pending } from "../src/report/store.js";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "plugins", "ymir", "hooks", "ensure-wiki-binary.mjs",
);

let home: string;
let skillRoot: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "hook-report-home-"));
  skillRoot = mkdtempSync(join(tmpdir(), "hook-report-skill-"));
});

function runHook(extraEnv: Record<string, string> = {}) {
  const result = spawnSync("node", [HOOK], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: skillRoot, YMIR_HOME: home, ...extraEnv },
  });
  return { stderr: result.stderr ?? "", status: result.status };
}

function incoming(): string {
  const path = join(home, "reports", "incoming", "hooks.jsonl");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** A manifest whose version is not semver — fails before any network access. */
function writeBadManifest(): void {
  mkdirSync(join(skillRoot, ".claude-plugin"), { recursive: true });
  writeFileSync(join(skillRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "not-semver" }));
}

describe("ensure-wiki-binary failure reporting", () => {
  it("still fails the install with the blocking exit code", () => {
    writeBadManifest();
    const { status, stderr } = runHook();

    expect(status).toBe(2);
    expect(stderr).toContain("[ymir]");
  });

  it("leaves a record the CLI can adopt", () => {
    writeBadManifest();
    runHook();

    const record = JSON.parse(incoming().trim());
    expect(record.kind).toBe("hook");
    expect(record.command).toBe("ensure-wiki-binary");
    expect(record.errorName).toBe("InvalidVersion");
  });

  it("reports a missing manifest too", () => {
    const { status } = runHook();
    expect(status).toBe(2);
    expect(JSON.parse(incoming().trim()).errorName).toBe("ManifestUnreadable");
  });

  it("writes nothing when the user has opted out", () => {
    writeBadManifest();
    runHook({ DO_NOT_TRACK: "1" });
    expect(incoming()).toBe("");
  });

  it("honours YMIR_REPORT=off", () => {
    writeBadManifest();
    runHook({ YMIR_REPORT: "off" });
    expect(incoming()).toBe("");
  });

  it("produces a record the store adopts, redacts and fingerprints", () => {
    runHook();

    const all = pending(home);
    expect(all).toHaveLength(1);
    expect(all[0]!.kind).toBe("hook");
    expect(all[0]!.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(all)).not.toContain(skillRoot);
  });
});
