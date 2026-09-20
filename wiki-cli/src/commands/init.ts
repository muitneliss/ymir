import {
  chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { validateWiki } from "../validate.js";
import {
  SCHEMA_TPL, INDEX_SEED, LOG_SEED, WIKI_SHIM, BLOCK_HOOK, SETTINGS_HOOK_ENTRY,
} from "../templates/embedded.js";
import {
  mergeSettings, appendClaudeBlock, claudeBlockPresent,
  type Settings,
} from "../scaffold.js";
import {
  invocation, projectRelative, repairInvocation, shimReference,
} from "../cli-reference.js";

export type InitSummary = {
  created: string[];
  skipped: string[];
  settingsMerged: boolean;
  claudeBlockAppended: boolean;
  hookSkipped: boolean;
  schemaRepaired: boolean;
  valid: boolean;
};

export function runInit(opts: {
  projectRoot: string;
  root: string;
  name?: string;
  skipHook?: boolean;
}): InitSummary {
  const projectRoot = resolve(opts.projectRoot);
  const wikiRoot = resolve(projectRoot, opts.root);
  const name = opts.name ?? basename(projectRoot);
  const wikiRootRef = projectRelative(projectRoot, wikiRoot);

  const created: string[] = [];
  const skipped: string[] = [];

  const writeIfMissing = (path: string, body: string) => {
    if (existsSync(path)) { skipped.push(path); return; }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    created.push(path);
  };

  const writeExecutable = (path: string, body: string) => {
    const existed = existsSync(path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    // `writeFileSync`'s mode option only applies on creation, so an existing
    // shim would keep whatever bits it had — including none.
    chmodSync(path, 0o755);
    (existed ? skipped : created).push(path);
  };

  for (const d of ["raw", "sources", "notes"]) {
    writeIfMissing(join(wikiRoot, d, ".gitkeep"), "");
  }

  // The shim is generated output, like the hook: always rewritten, so a repo
  // that re-runs `init` under a newer Ymir never keeps an older resolver.
  writeExecutable(join(wikiRoot, "bin", "wiki"), WIKI_SHIM);

  const schemaPath = join(wikiRoot, "SCHEMA.md");
  const renderedSchema = SCHEMA_TPL
    .replaceAll("PROJECT_NAME", name)
    .replaceAll("{{WIKI_BIN}}", shimReference(wikiRootRef))
    .replaceAll("{{WIKI_ROOT}}", wikiRootRef);
  const schemaExisted = existsSync(schemaPath);
  writeIfMissing(schemaPath, renderedSchema);

  let schemaRepaired = false;
  if (schemaExisted) {
    const repaired = repairInvocation(readFileSync(schemaPath, "utf8"), renderedSchema);
    if (repaired !== null) {
      writeFileSync(schemaPath, repaired);
      schemaRepaired = true;
    }
  }

  writeIfMissing(join(wikiRoot, "index.md"), INDEX_SEED);
  writeIfMissing(join(wikiRoot, "log.md"), LOG_SEED);

  const hookSkipped = opts.skipHook === true;
  let settingsMerged = false;
  let claudeBlockAppended = false;

  if (!hookSkipped) {
    const hookPath = join(projectRoot, ".claude", "hooks", "block-wiki-edits.mjs");
    const hookExisted = existsSync(hookPath);
    mkdirSync(dirname(hookPath), { recursive: true });
    // The deny message names the resolved command itself. Sending the reader to
    // SCHEMA.md instead is how issue #71 ended with an agent concluding the CLI
    // was not installed and asking to bypass this very hook.
    writeFileSync(hookPath, BLOCK_HOOK.replaceAll("{{WIKI_BIN}}", invocation(wikiRootRef)));
    (hookExisted ? skipped : created).push(hookPath);

    const settingsPath = join(projectRoot, ".claude", "settings.json");
    const existing: Settings = existsSync(settingsPath)
      ? (JSON.parse(readFileSync(settingsPath, "utf8")) as Settings)
      : {};
    const beforeCount = existing.hooks?.PreToolUse?.length ?? 0;
    const merged = mergeSettings(existing, SETTINGS_HOOK_ENTRY);
    const afterCount = merged.hooks?.PreToolUse?.length ?? 0;
    settingsMerged = afterCount !== beforeCount;
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`);

    const claudePath = join(projectRoot, "CLAUDE.md");
    const claudeContent = existsSync(claudePath) ? readFileSync(claudePath, "utf8") : "";
    claudeBlockAppended = !claudeBlockPresent(claudeContent);
    writeFileSync(claudePath, appendClaudeBlock(claudeContent));
  }

  const v = validateWiki(wikiRoot);
  return {
    created,
    skipped,
    settingsMerged,
    claudeBlockAppended,
    hookSkipped,
    schemaRepaired,
    valid: v.ok,
  };
}
