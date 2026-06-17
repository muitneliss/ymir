import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { validateWiki } from "../validate.js";
import {
  SCHEMA_TPL, INDEX_SEED, LOG_SEED, BLOCK_HOOK, SETTINGS_HOOK_ENTRY,
} from "../templates/embedded.js";
import {
  mergeSettings, appendClaudeBlock, claudeBlockPresent,
  type Settings,
} from "../scaffold.js";

export type InitSummary = {
  created: string[];
  skipped: string[];
  settingsMerged: boolean;
  claudeBlockAppended: boolean;
  valid: boolean;
};

export function runInit(opts: {
  projectRoot: string;
  root: string;
  name?: string;
}): InitSummary {
  const projectRoot = resolve(opts.projectRoot);
  const wikiRoot = resolve(projectRoot, opts.root);
  const name = opts.name ?? basename(projectRoot);

  const created: string[] = [];
  const skipped: string[] = [];

  const writeIfMissing = (path: string, body: string) => {
    if (existsSync(path)) { skipped.push(path); return; }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    created.push(path);
  };

  for (const d of ["raw", "sources", "notes"]) {
    writeIfMissing(join(wikiRoot, d, ".gitkeep"), "");
  }
  writeIfMissing(
    join(wikiRoot, "SCHEMA.md"),
    SCHEMA_TPL.replaceAll("PROJECT_NAME", name),
  );
  writeIfMissing(join(wikiRoot, "index.md"), INDEX_SEED);
  writeIfMissing(join(wikiRoot, "log.md"), LOG_SEED);

  const hookPath = join(projectRoot, ".claude", "hooks", "block-wiki-edits.mjs");
  const hookExisted = existsSync(hookPath);
  mkdirSync(dirname(hookPath), { recursive: true });
  writeFileSync(hookPath, BLOCK_HOOK);
  (hookExisted ? skipped : created).push(hookPath);

  const settingsPath = join(projectRoot, ".claude", "settings.json");
  const existing: Settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, "utf8")) as Settings)
    : {};
  const beforeCount = existing.hooks?.PreToolUse?.length ?? 0;
  const merged = mergeSettings(existing, SETTINGS_HOOK_ENTRY);
  const afterCount = merged.hooks?.PreToolUse?.length ?? 0;
  const settingsMerged = afterCount !== beforeCount;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`);

  const claudePath = join(projectRoot, "CLAUDE.md");
  const claudeContent = existsSync(claudePath)
    ? readFileSync(claudePath, "utf8")
    : "";
  const claudeBlockAppended = !claudeBlockPresent(claudeContent);
  writeFileSync(claudePath, appendClaudeBlock(claudeContent));

  const v = validateWiki(wikiRoot);
  return {
    created,
    skipped,
    settingsMerged,
    claudeBlockAppended,
    valid: v.ok,
  };
}
