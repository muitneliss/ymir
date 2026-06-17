# Wiki CLI: GitHub Release binaries + auto-fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile standalone wiki CLI binaries on every release, publish them as GitHub Release assets, and auto-download the matching-platform binary into the plugin on first session use — no fallback, fail loud.

**Architecture:** CI `compile` job (triggered by release-please) cross-compiles 4 platform binaries with `bun --compile`, attaches them + SHA256SUMS.txt to the GitHub Release. A plugin-level `SessionStart` hook (`hooks/ensure-wiki-binary.mjs`) checks for the binary on every session start, downloads and sha256-verifies it on first use or version change, exits 2 on any failure (no fallback). The SKILL calls the binary directly; `dist/` is gitignored.

**Tech Stack:** Bun 1.3.14, TypeScript, Node.js (for hook script), GitHub Actions (`googleapis/release-please-action@v4`, `oven-sh/setup-bun@v2`), `curl` + `sha256sum` (Linux/macOS standard tools).

**Branch:** `feat/wiki-cli-publish` — worktree at `.worktrees/wiki-publish`.  
**Merge order:** merge PR#3 (`feat/ci-test-step`) before this branch. It adds a `test` job that gates `release-please`; when this branch is rebased on the result, `compile` chains as `test → release-please → compile`.

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `plugins/ymir/wiki-cli/src/platform.ts` | CREATE | `detectAssetLabel(unameSM: string): string` — pure fn, tested |
| `plugins/ymir/wiki-cli/test/platform.test.ts` | CREATE | Unit tests for `detectAssetLabel` |
| `plugins/ymir/hooks/ensure-wiki-binary.mjs` | CREATE | SessionStart hook — download, verify, install binary |
| `plugins/ymir/hooks/hooks.json` | CREATE | Plugin hook config wiring `ensure-wiki-binary.mjs` to `SessionStart` |
| `.github/workflows/release-please.yml` | MODIFY | Add `outputs` to release-please job + add `compile` job |
| `plugins/ymir/wiki-cli/package.json` | MODIFY | Add `compile:*` scripts for local use |
| `plugins/ymir/wiki-cli/.gitignore` | MODIFY | Add `dist/` |
| `plugins/ymir/SKILL.md` | MODIFY | Line 87: replace `node .../dist/cli.js` → `.../bin/wiki` |
| `plugins/ymir/templates/wiki/SCHEMA.md` | MODIFY | Line 19: same replacement |

---

## Task 1: `src/platform.ts` — platform detection (TDD)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/platform.ts`
- Create: `plugins/ymir/wiki-cli/test/platform.test.ts`

- [ ] **Step 1: Write failing tests**

Create `plugins/ymir/wiki-cli/test/platform.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { detectAssetLabel } from "../src/platform.js";

test("darwin arm64", () => {
  expect(detectAssetLabel("Darwin arm64")).toBe("darwin-arm64");
});
test("darwin x64", () => {
  expect(detectAssetLabel("Darwin x86_64")).toBe("darwin-x64");
});
test("linux x64", () => {
  expect(detectAssetLabel("Linux x86_64")).toBe("linux-x64");
});
test("linux aarch64", () => {
  expect(detectAssetLabel("Linux aarch64")).toBe("linux-arm64");
});
test("linux arm64 (alternate uname output)", () => {
  expect(detectAssetLabel("Linux arm64")).toBe("linux-arm64");
});
test("trims surrounding whitespace", () => {
  expect(detectAssetLabel("  Darwin arm64  ")).toBe("darwin-arm64");
});
test("unsupported platform throws with message", () => {
  expect(() => detectAssetLabel("Windows x86_64")).toThrow("Unsupported platform");
});
```

- [ ] **Step 2: Run — expect import error**

```bash
cd plugins/ymir/wiki-cli && bun test test/platform.test.ts
```

Expected: `error: Cannot find module "../src/platform.js"`

- [ ] **Step 3: Create `src/platform.ts`**

```typescript
export function detectAssetLabel(unameSM: string): string {
  const s = unameSM.trim();
  if (s === "Darwin arm64")                          return "darwin-arm64";
  if (s === "Darwin x86_64")                         return "darwin-x64";
  if (s === "Linux x86_64")                          return "linux-x64";
  if (s === "Linux aarch64" || s === "Linux arm64")  return "linux-arm64";
  throw new Error(
    `Unsupported platform: "${s}". Supported: Darwin/Linux × arm64/x86_64.`
  );
}
```

- [ ] **Step 4: Run — expect 7 pass**

```bash
cd plugins/ymir/wiki-cli && bun test test/platform.test.ts
```

Expected: `7 pass  0 fail`

- [ ] **Step 5: Run full test suite — no regressions**

```bash
cd plugins/ymir/wiki-cli && bun test
```

Expected: `45 pass  0 fail  ` (38 existing + 7 new)

- [ ] **Step 6: Commit**

```bash
git add plugins/ymir/wiki-cli/src/platform.ts plugins/ymir/wiki-cli/test/platform.test.ts
git commit -m "feat(wiki-cli): add detectAssetLabel for cross-platform binary fetch"
```

---

## Task 2: `hooks/ensure-wiki-binary.mjs` — download/verify/install

**Files:**
- Create: `plugins/ymir/hooks/ensure-wiki-binary.mjs`

- [ ] **Step 1: Create hook script**

Create `plugins/ymir/hooks/ensure-wiki-binary.mjs`:

```javascript
#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync,
  readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

function detectAssetLabel(unameSM) {
  const s = unameSM.trim();
  if (s === "Darwin arm64")                         return "darwin-arm64";
  if (s === "Darwin x86_64")                        return "darwin-x64";
  if (s === "Linux x86_64")                         return "linux-x64";
  if (s === "Linux aarch64" || s === "Linux arm64") return "linux-arm64";
  throw new Error(`Unsupported platform: "${s}". Supported: Darwin/Linux × arm64/x86_64.`);
}

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT;
if (!PLUGIN_ROOT) {
  process.stderr.write("[ymir] CLAUDE_PLUGIN_ROOT not set — cannot ensure wiki binary\n");
  process.exit(2);
}

let pluginVersion;
try {
  const manifest = JSON.parse(
    readFileSync(join(PLUGIN_ROOT, ".claude-plugin/plugin.json"), "utf8")
  );
  pluginVersion = manifest.version;
} catch (e) {
  process.stderr.write(`[ymir] Cannot read plugin.json: ${e.message}\n`);
  process.exit(2);
}

const binDir    = join(PLUGIN_ROOT, "wiki-cli/bin");
const binPath   = join(binDir, "wiki");
const stampPath = join(binDir, ".version");

// Fast path: already installed and version matches
if (existsSync(binPath) && existsSync(stampPath)) {
  if (readFileSync(stampPath, "utf8").trim() === pluginVersion) process.exit(0);
}

// Detect platform
let label;
try {
  const uname = execSync("uname -sm", { encoding: "utf8" });
  label = detectAssetLabel(uname);
} catch (e) {
  process.stderr.write(`[ymir] Platform detection failed: ${e.message}\n`);
  process.exit(2);
}

const base     = `https://github.com/muitneliss/ymir/releases/download/v${pluginVersion}`;
const assetUrl = `${base}/wiki-${label}`;
const sumsUrl  = `${base}/SHA256SUMS.txt`;

mkdirSync(binDir, { recursive: true });

const tmpBin  = `${binPath}.tmp`;
const tmpSums = join(binDir, "SHA256SUMS.txt.tmp");

// Download binary
const dlBin = spawnSync("curl", ["-fsSL", "--output", tmpBin, assetUrl], { stdio: "inherit" });
if (dlBin.status !== 0) {
  process.stderr.write(`[ymir] Failed to download wiki binary: ${assetUrl}\n`);
  process.exit(2);
}

// Download checksum file
const dlSums = spawnSync("curl", ["-fsSL", "--output", tmpSums, sumsUrl], { stdio: "inherit" });
if (dlSums.status !== 0) {
  process.stderr.write(`[ymir] Failed to download SHA256SUMS: ${sumsUrl}\n`);
  process.exit(2);
}

// Verify sha256
const sumsText     = readFileSync(tmpSums, "utf8");
const expectedLine = sumsText.split("\n").find((l) => l.includes(`wiki-${label}`));
if (!expectedLine) {
  process.stderr.write(`[ymir] No sha256 entry for wiki-${label} in SHA256SUMS.txt\n`);
  process.exit(2);
}
const expectedHash = expectedLine.trim().split(/\s+/)[0];
const actualHash   = createHash("sha256").update(readFileSync(tmpBin)).digest("hex");
if (actualHash !== expectedHash) {
  process.stderr.write(
    `[ymir] SHA256 mismatch for wiki-${label}:\n  expected ${expectedHash}\n  got      ${actualHash}\n`
  );
  process.exit(2);
}

// Install
renameSync(tmpBin, binPath);
chmodSync(binPath, 0o755);
writeFileSync(stampPath, pluginVersion);
try { unlinkSync(tmpSums); } catch { /* ignore cleanup failure */ }

process.stdout.write(`[ymir] Installed wiki binary v${pluginVersion} (${label})\n`);
```

- [ ] **Step 2: Smoke-test fast path (no network)**

Simulate the fast path by calling the script with a fake env where binary + matching stamp already exist:

```bash
mkdir -p /tmp/ymir-test-plugin/wiki-cli/bin
echo "0.2.0" > /tmp/ymir-test-plugin/wiki-cli/bin/.version
touch /tmp/ymir-test-plugin/wiki-cli/bin/wiki
# Create minimal plugin.json
mkdir -p /tmp/ymir-test-plugin/.claude-plugin
echo '{"version":"0.2.0"}' > /tmp/ymir-test-plugin/.claude-plugin/plugin.json

CLAUDE_PLUGIN_ROOT=/tmp/ymir-test-plugin node plugins/ymir/hooks/ensure-wiki-binary.mjs
echo "exit: $?"
```

Expected: exits 0, no output (fast path).

- [ ] **Step 3: Smoke-test version mismatch path (intentional error)**

```bash
echo "0.1.0" > /tmp/ymir-test-plugin/wiki-cli/bin/.version
CLAUDE_PLUGIN_ROOT=/tmp/ymir-test-plugin node plugins/ymir/hooks/ensure-wiki-binary.mjs
echo "exit: $?"
```

Expected: exit non-zero, stderr shows `Failed to download` (no real release for 0.2.0 yet — correct loud failure).

- [ ] **Step 4: Cleanup test artifacts**

```bash
rm -rf /tmp/ymir-test-plugin
```

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/hooks/ensure-wiki-binary.mjs
git commit -m "feat(ymir): add SessionStart hook to auto-download wiki binary"
```

---

## Task 3: `hooks/hooks.json` — wire SessionStart hook

**Files:**
- Create: `plugins/ymir/hooks/hooks.json`

- [ ] **Step 1: Create hook config**

Create `plugins/ymir/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/ensure-wiki-binary.mjs\"",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('plugins/ymir/hooks/hooks.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add plugins/ymir/hooks/hooks.json
git commit -m "feat(ymir): register ensure-wiki-binary as SessionStart hook"
```

---

## Task 4: `.github/workflows/release-please.yml` — add compile job

**Files:**
- Modify: `.github/workflows/release-please.yml`

- [ ] **Step 1: Read current file**

```bash
cat .github/workflows/release-please.yml
```

Note: if PR#3 has already been merged + rebased, the file will have a `test` job and `needs: test` on the `release-please` job. In that case replace the entire `jobs:` block below accordingly — the `compile` job only needs `needs: release-please`.

- [ ] **Step 2: Replace file contents**

Overwrite `.github/workflows/release-please.yml` with:

```yaml
name: release-please

on:
  push:
    branches:
      - main

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.rp.outputs.release_created }}
      tag_name: ${{ steps.rp.outputs.tag_name }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: rp
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  compile:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: plugins/ymir/wiki-cli
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
      - run: bun install --frozen-lockfile
      - name: Compile all targets
        run: |
          bun build ./src/cli.ts --compile --target=bun-darwin-arm64  --outfile dist/wiki-darwin-arm64
          bun build ./src/cli.ts --compile --target=bun-darwin-x64    --outfile dist/wiki-darwin-x64
          bun build ./src/cli.ts --compile --target=bun-linux-x64     --outfile dist/wiki-linux-x64
          bun build ./src/cli.ts --compile --target=bun-linux-aarch64 --outfile dist/wiki-linux-arm64
      - name: Generate checksums
        run: cd dist && sha256sum wiki-darwin-arm64 wiki-darwin-x64 wiki-linux-x64 wiki-linux-arm64 > SHA256SUMS.txt
      - name: Upload to release
        working-directory: plugins/ymir/wiki-cli
        run: |
          gh release upload "$TAG" \
            dist/wiki-darwin-arm64 \
            dist/wiki-darwin-x64 \
            dist/wiki-linux-x64 \
            dist/wiki-linux-arm64 \
            dist/SHA256SUMS.txt
        env:
          TAG: ${{ needs.release-please.outputs.tag_name }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> **If PR#3 is already merged:** the `release-please` job will already have `needs: test` and `outputs` from that PR. In that case only ADD the `compile` job block — do not overwrite the `release-please` job's existing changes.

- [ ] **Step 3: Validate YAML**

```bash
node -e "
const fs = require('fs');
const txt = fs.readFileSync('.github/workflows/release-please.yml','utf8');
// Basic checks: no tabs, has 'compile:', has 'release_created'
if (txt.includes('\t')) throw new Error('TAB in YAML');
if (!txt.includes('compile:')) throw new Error('missing compile job');
if (!txt.includes('release_created')) throw new Error('missing output');
console.log('checks pass');
"
```

Expected: `checks pass`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-please.yml
git commit -m "ci: add compile job to attach binaries to GitHub Releases"
```

---

## Task 5: Update CLI invocation paths in SKILL.md and SCHEMA.md

**Files:**
- Modify: `plugins/ymir/SKILL.md` line 87
- Modify: `plugins/ymir/templates/wiki/SCHEMA.md` line 19

- [ ] **Step 1: Update SKILL.md line 87**

Find:
```
   `node ${CLAUDE_PLUGIN_ROOT}/wiki-cli/dist/cli.js --root ./wiki validate`
```

Replace with:
```
   `${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki --root ./wiki validate`
```

- [ ] **Step 2: Verify SKILL.md has no remaining dist/cli.js references**

```bash
grep -n "dist/cli.js" plugins/ymir/SKILL.md
```

Expected: no output (zero matches).

- [ ] **Step 3: Update SCHEMA.md line 19**

Find:
```
node ${CLAUDE_PLUGIN_ROOT}/wiki-cli/dist/cli.js --root ./wiki <command>
```

Replace with:
```
${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki --root ./wiki <command>
```

- [ ] **Step 4: Verify SCHEMA.md has no remaining dist/cli.js references**

```bash
grep -n "dist/cli.js" plugins/ymir/templates/wiki/SCHEMA.md
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/SKILL.md plugins/ymir/templates/wiki/SCHEMA.md
git commit -m "feat(ymir): invoke wiki CLI via binary, not node dist/cli.js"
```

---

## Task 6: Cleanup — gitignore dist, add compile scripts, remove tracked dist/cli.js

**Files:**
- Modify: `plugins/ymir/wiki-cli/.gitignore`
- Modify: `plugins/ymir/wiki-cli/package.json`

- [ ] **Step 1: Update .gitignore**

Current content of `plugins/ymir/wiki-cli/.gitignore`:
```
node_modules/
```

New content:
```
node_modules/
dist/
```

- [ ] **Step 2: Remove dist/cli.js from git tracking**

```bash
git rm --cached plugins/ymir/wiki-cli/dist/cli.js
```

Expected: `rm 'plugins/ymir/wiki-cli/dist/cli.js'`

- [ ] **Step 3: Add compile scripts to package.json**

Current `scripts` block in `plugins/ymir/wiki-cli/package.json`:
```json
"scripts": {
  "build": "bun build ./src/cli.ts --outfile dist/cli.js --target node --format esm --banner \"#!/usr/bin/env node\" && chmod +x dist/cli.js",
  "test": "bun test",
  "typecheck": "tsc --noEmit"
},
```

New `scripts` block:
```json
"scripts": {
  "build": "bun build ./src/cli.ts --outfile dist/cli.js --target node --format esm --banner \"#!/usr/bin/env node\" && chmod +x dist/cli.js",
  "test": "bun test",
  "typecheck": "tsc --noEmit",
  "compile:darwin-arm64": "bun build ./src/cli.ts --compile --target=bun-darwin-arm64  --outfile dist/wiki-darwin-arm64",
  "compile:darwin-x64":   "bun build ./src/cli.ts --compile --target=bun-darwin-x64    --outfile dist/wiki-darwin-x64",
  "compile:linux-x64":    "bun build ./src/cli.ts --compile --target=bun-linux-x64     --outfile dist/wiki-linux-x64",
  "compile:linux-arm64":  "bun build ./src/cli.ts --compile --target=bun-linux-aarch64 --outfile dist/wiki-linux-arm64"
},
```

- [ ] **Step 4: Verify tests still pass (bun test excludes dist, no regressions)**

```bash
cd plugins/ymir/wiki-cli && bun test
```

Expected: `45 pass  0 fail`

- [ ] **Step 5: Verify typecheck passes**

```bash
cd plugins/ymir/wiki-cli && bun run typecheck
```

Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add plugins/ymir/wiki-cli/.gitignore plugins/ymir/wiki-cli/package.json
git commit -m "chore(wiki-cli): gitignore dist/, add compile scripts for local use"
```

---

## Task 7: Final verification + push

- [ ] **Step 1: Confirm all expected files exist**

```bash
ls plugins/ymir/hooks/hooks.json plugins/ymir/hooks/ensure-wiki-binary.mjs \
   plugins/ymir/wiki-cli/src/platform.ts plugins/ymir/wiki-cli/test/platform.test.ts
```

Expected: all four paths printed, no "No such file" errors.

- [ ] **Step 2: Confirm dist/cli.js no longer tracked**

```bash
git ls-files plugins/ymir/wiki-cli/dist/
```

Expected: no output (empty — dist no longer tracked).

- [ ] **Step 3: Confirm no remaining dist/cli.js invocation references**

```bash
grep -rn "wiki-cli/dist/cli.js" plugins/
```

Expected: no output.

- [ ] **Step 4: Run full test suite one final time**

```bash
cd plugins/ymir/wiki-cli && bun test
```

Expected: `45 pass  0 fail`

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/wiki-cli-publish
```

- [ ] **Step 6: Open PR against main**

```bash
gh pr create \
  --base main \
  --head feat/wiki-cli-publish \
  --title "feat: publish wiki CLI binaries to GitHub Releases with auto-fetch hook" \
  --body "$(cat <<'EOF'
## Summary
- CI `compile` job cross-compiles 4 platform binaries (darwin-arm64/x64, linux-x64/arm64) on every release and uploads them + SHA256SUMS.txt to the GitHub Release.
- Plugin `SessionStart` hook (`hooks/ensure-wiki-binary.mjs`) auto-downloads the matching binary on first session use or version change. Fails loudly (exit 2) on any failure — no fallback.
- SKILL and SCHEMA.md updated to invoke `wiki-cli/bin/wiki` instead of `node dist/cli.js`.
- `dist/` gitignored and untracked.

## Merge order
Merge PR#3 (`feat/ci-test-step`) first. Then rebase this branch if needed.

## Test plan
- [ ] `bun test` — 45 pass / 0 fail (38 existing + 7 platform detection tests)
- [ ] `bun run typecheck` — exit 0
- [ ] Smoke-test hook fast path: existing stamp matches → exits 0
- [ ] Smoke-test hook failure: mismatched stamp → loud stderr + non-zero exit
- [ ] CI compile job runs green on first release
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- Platform detection module → Task 1 ✓
- Hook download/verify/fail-loud → Task 2 ✓
- Plugin hook config → Task 3 ✓
- CI compile job + release upload → Task 4 ✓
- SKILL invocation path → Task 5 ✓
- gitignore dist + untrack dist/cli.js → Task 6 ✓
- Version source = plugin.json (not wiki-cli/package.json) → Task 2 step 1 ✓
- Fail fast, no fallback → Task 2 (hook exits 2), Task 5 (no node fallback in SKILL) ✓

**Merge note (flagged in Task 4):** If PR#3 is already merged before this branch, the release-please.yml will already have the `test` job. Do not overwrite it; only add the `compile` job.
