import { describe, it, expect, beforeEach } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "plugins", "ymir", "hooks", "ensure-wiki-binary.mjs",
);

let skillRoot: string;
let home: string;
let stubDir: string;
let ledger: string;

beforeEach(() => {
  skillRoot = mkdtempSync(join(tmpdir(), "race-skill-"));
  home = mkdtempSync(join(tmpdir(), "race-home-"));
  stubDir = mkdtempSync(join(tmpdir(), "race-bin-"));
  ledger = join(stubDir, "ledger.txt");

  mkdirSync(join(skillRoot, ".claude-plugin"), { recursive: true });
  writeFileSync(join(skillRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "9.9.9" }));

  // Stand in for curl: record the --output path this process was told to use,
  // then fail so the hook bails without touching the network.
  writeFileSync(
    join(stubDir, "curl"),
    `#!/bin/sh
while [ $# -gt 0 ]; do
  if [ "$1" = "--output" ]; then shift; echo "$1" >> "${ledger}"; fi
  shift
done
exit 1
`,
  );
  chmodSync(join(stubDir, "curl"), 0o755);
});

function runHook(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("node", [HOOK], {
      stdio: "ignore",
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: skillRoot,
        YMIR_HOME: home,
        PATH: `${stubDir}:${process.env.PATH}`,
      },
    });
    child.on("exit", (code) => resolve(code ?? -1));
  });
}

function recordedOutputPaths(): string[] {
  if (!existsSync(ledger)) return [];
  return readFileSync(ledger, "utf8").split("\n").filter((l) => l.trim() !== "");
}

describe("ensure-wiki-binary concurrency", () => {
  it("gives each concurrent run its own download target", async () => {
    const codes = await Promise.all([runHook(), runHook()]);
    expect(codes).toEqual([2, 2]);

    const paths = recordedOutputPaths();
    expect(paths).toHaveLength(2);
    expect(new Set(paths).size).toBe(2);
  });

  it("leaves no temp debris behind", async () => {
    await Promise.all([runHook(), runHook(), runHook()]);

    const binDir = join(skillRoot, "wiki-cli", "bin");
    const leftovers = existsSync(binDir) ? readdirSync(binDir).filter((f) => f.includes(".tmp")) : [];
    expect(leftovers).toEqual([]);
  });

  it("scopes the temp name to the running process", async () => {
    await runHook();
    const [path] = recordedOutputPaths();
    expect(path).toMatch(/\.\d+\.tmp$/);
  });
});
