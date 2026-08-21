import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import { runIngest } from "./commands/ingest.js";
import { runNote } from "./commands/note.js";
import { runQuery } from "./commands/query.js";
import { runHelp } from "./commands/help.js";
import { runInit } from "./commands/init.js";
import { buildIndex } from "./index-build.js";
import { appendLog, type LogOp } from "./wikilog.js";
import { validateWiki } from "./validate.js";
import { runStatus } from "./commands/status.js";
import { runCoverage } from "./commands/coverage.js";
import { runCheckCmd } from "./commands/check.js";
import { runRemove } from "./commands/remove.js";
import { runRename } from "./commands/rename.js";
import { formatMarkdown } from "./format.js";
import { writePage, readPage, listPages } from "./store.js";
import { wikiPaths } from "./paths.js";
import { NoteType } from "./schema.js";
import { join, resolve } from "node:path";
import { fileProvenance } from "./provenance.js";
import { reindex } from "./reindex.js";
import { runReport } from "./commands/report.js";
import { capture, draftFromError, maybeFlush, REPORT_HINT } from "./report.js";
import { loadConfig, reportHome } from "./report/store.js";
import { readFileSync as readVersionFile } from "node:fs";
import { dirname } from "node:path";

const today = () => new Date().toISOString().slice(0, 10);
const readStdin = () => readFileSync(0, "utf8");

function version(): string {
  try {
    return readVersionFile(join(dirname(process.execPath), ".version"), "utf8").trim() || "dev";
  } catch {
    return "dev";
  }
}

const program = new Command();
program
  .name("wiki")
  .description("Ymir wiki CLI")
  .version(version())
  .option("--root <dir>", "wiki root", "wiki");

program
  .command("ingest")
  .option("--raw <path>", "raw source identifier (legacy)")
  .option("--source <path>", "tracked source file (computes hash for drift detection)")
  .requiredOption("--title <title>")
  .option("--no-reindex", "skip qmd reindex after write")
  .action(async (opts: { raw?: string; source?: string; title: string; reindex: boolean }) => {
    const root = program.opts<{ root: string }>().root;

    if (!opts.raw && !opts.source) {
      process.stderr.write("error: --raw or --source is required\n");
      process.exit(1);
    }

    let raw: string;
    let ingestSourcePath: string | undefined;
    let ingestSourceHash: string | undefined;

    if (opts.source) {
      const absPath = resolve(opts.source);
      if (!existsSync(absPath)) {
        process.stderr.write(`error: --source file not found: ${opts.source}\n`);
        process.exit(1);
      }
      const projectRoot = resolve(root, "..");
      const prov = fileProvenance(projectRoot, absPath);
      raw = opts.source;
      ingestSourcePath = prov.sourcePath;
      ingestSourceHash = prov.sourceHash;
    } else {
      raw = opts.raw!;
      const absRaw = resolve(opts.raw!);
      const rawDir = resolve(root, "raw");
      if (existsSync(absRaw) && !absRaw.startsWith(rawDir + "/") && absRaw !== rawDir) {
        process.stderr.write(
          `warning: "${opts.raw}" exists in the project; the resulting page will be untracked.\n` +
          `  Use --source instead to record provenance and enable drift detection.\n`,
        );
      }
    }

    const path = await runIngest({
      root,
      raw,
      title: opts.title,
      body: readStdin(),
      today: today(),
      sourcePath: ingestSourcePath,
      sourceHash: ingestSourceHash,
      noReindex: !opts.reindex,
    });
    process.stdout.write(`wrote ${path}\n`);
  });

program
  .command("note")
  .requiredOption("--type <type>")
  .requiredOption("--name <name>")
  .option("--no-reindex", "skip qmd reindex after write")
  .action(async (opts: { type: string; name: string; reindex: boolean }) => {
    const root = program.opts<{ root: string }>().root;

    const parsed = NoteType.safeParse(opts.type);
    if (!parsed.success) {
      process.stderr.write(
        `error: --type must be one of ${NoteType.options.join("|")} (got "${opts.type}")\n`,
      );
      process.exit(1);
    }

    const type = parsed.data;
    const path = await runNote({ root, type, name: opts.name, body: readStdin(), today: today(), noReindex: !opts.reindex });
    process.stdout.write(`wrote ${path}\n`);
  });

program
  .command("index")
  .option("--no-reindex", "skip qmd reindex after write")
  .action(async (opts: { reindex: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    writePage(wikiPaths(root).index, buildIndex(root));
    process.stdout.write("rebuilt index.md\n");
    if (opts.reindex) reindex(root);
  });

program.command("log").argument("<op>").argument("<title>").action((op: string, title: string) => {
  const root = program.opts<{ root: string }>().root;
  appendLog(root, op as LogOp, title, today());
});

program.command("validate").action(() => {
  const root = program.opts<{ root: string }>().root;
  const r = validateWiki(root);
  for (const w of r.warnings) process.stdout.write(`warning: ${w}\n`);
  for (const e of r.errors) process.stderr.write(`error: ${e}\n`);
  if (!r.ok) process.exit(1);
  process.stdout.write("wiki valid\n");
});

program.command("fmt").action(async () => {
  const root = program.opts<{ root: string }>().root;
  for (const sub of ["sources", "notes"] as const) {
    for (const f of listPages(join(root, sub))) {
      const p = join(root, sub, f);
      writePage(p, await formatMarkdown(readPage(p)));
    }
  }
  process.stdout.write("formatted\n");
});

program
  .command("query")
  .argument("<q>")
  .option("--limit <n>", "max results", (v: string) => Number.parseInt(v, 10))
  .option("--chunks", "return matching chunks instead of whole files", false)
  .option("--verbatim", "search the query exactly as typed (skip keyword extraction)", false)
  .option("--full", "return each hit's whole page instead of a passage", false)
  .option("--snippet", "return qmd's raw fixed-width snippet (no expansion)", false)
  .option("--context <chars>", "passage size budget", (v: string) => Number.parseInt(v, 10))
  .action(async (q: string, opts: { limit?: number; chunks: boolean; verbatim: boolean; full: boolean; snippet: boolean; context?: number }) => {
    const root = program.opts<{ root: string }>().root;
    if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
      process.stderr.write("error: --limit must be a positive integer\n");
      process.exit(1);
    }
    process.stdout.write(
      await runQuery({
        root,
        q,
        limit: opts.limit,
        chunks: opts.chunks,
        verbatim: opts.verbatim,
        full: opts.full,
        snippet: opts.snippet,
        context: opts.context,
      }),
    );
  });

program.command("help").action(() => runHelp());

program
  .command("init")
  .option("--project-root <dir>", "project root", process.cwd())
  .option("--name <name>", "project name (defaults to basename of project root)")
  .option("--no-hook", "skip Claude-specific hook, settings, and CLAUDE.md (for non-Claude agent targets)")
  .action((opts: { projectRoot: string; name?: string; hook: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const s = runInit({ projectRoot: opts.projectRoot, root, name: opts.name, skipHook: !opts.hook });
    for (const p of s.created) process.stdout.write(`created ${p}\n`);
    for (const p of s.skipped) process.stdout.write(`skipped ${p}\n`);
    if (s.hookSkipped) {
      process.stdout.write("hook skipped (non-Claude target)\n");
    } else {
      process.stdout.write(
        s.settingsMerged ? "settings merged\n" : "settings unchanged\n",
      );
      process.stdout.write(
        s.claudeBlockAppended ? "CLAUDE.md appended\n" : "CLAUDE.md unchanged\n",
      );
    }
    if (!s.valid) {
      process.stderr.write("wiki invalid\n");
      process.exit(1);
    }
    process.stdout.write("wiki valid\n");
  });

program
  .command("status")
  .option("--json", "emit JSON output", false)
  .action((opts: { json: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const { text, exitCode } = runStatus({ root, json: opts.json });
    process.stdout.write(text);
    if (exitCode !== 0) process.exit(exitCode);
  });

program
  .command("coverage")
  .option("--json", "emit JSON output", false)
  .action((opts: { json: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const { text, exitCode } = runCoverage({ root, json: opts.json });
    process.stdout.write(text);
    if (exitCode !== 0) process.exit(exitCode);
  });

program
  .command("check")
  .option("--json", "emit JSON output", false)
  .option("--error-on-orphan-notes", "treat orphan notes as hard failures", false)
  .option("--error-on-untracked-sources", "treat untracked sources as hard failures", false)
  .action((opts: { json: boolean; errorOnOrphanNotes: boolean; errorOnUntrackedSources: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const { text, exitCode } = runCheckCmd({
      root,
      json: opts.json,
      errorOnOrphanNotes: opts.errorOnOrphanNotes,
      errorOnUntrackedSources: opts.errorOnUntrackedSources,
    });
    process.stdout.write(text);
    if (exitCode !== 0) process.exit(exitCode);
  });

program.command("reindex").action(() => {
  const root = program.opts<{ root: string }>().root;
  const r = reindex(root);
  if (r.ok) process.stdout.write(`reindexed as "${r.name}"\n`);
  else process.stdout.write(`reindex skipped (qmd unavailable)\n`);
});

program
  .command("remove")
  .requiredOption("--title <title>")
  .option("--preview", "show what would be removed without writing", false)
  .option("--no-reindex", "skip qmd reindex after write")
  .action((opts: { title: string; preview: boolean; reindex: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const result = runRemove({ root, title: opts.title, today, preview: opts.preview, noReindex: !opts.reindex });
      if (result.inboundLinks.length > 0) {
        for (const l of result.inboundLinks) process.stdout.write(`  inbound: ${l.from}: ${l.link}\n`);
      }
      if (opts.preview) {
        process.stdout.write(`preview: would remove ${result.path}\n`);
      } else {
        process.stdout.write(`removed ${result.path}\n`);
      }
    } catch (e) {
      process.stderr.write(`${(e as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("rename")
  .requiredOption("--old-title <title>")
  .requiredOption("--new-title <title>")
  .option("--preview", "show what would change without writing", false)
  .option("--no-reindex", "skip qmd reindex after write")
  .action(async (opts: { oldTitle: string; newTitle: string; preview: boolean; reindex: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const result = await runRename({ root, oldTitle: opts.oldTitle, newTitle: opts.newTitle, today, preview: opts.preview, noReindex: !opts.reindex });
      if (opts.preview) {
        process.stdout.write(`preview: would rename "${opts.oldTitle}" → "${opts.newTitle}"\n`);
        process.stdout.write(`  links to update: ${result.linksUpdated}\n`);
        for (const p of result.affectedPaths) process.stdout.write(`  ${p}\n`);
      } else {
        process.stdout.write(`renamed "${opts.oldTitle}" → "${opts.newTitle}"\n`);
        if (result.linksUpdated > 0) process.stdout.write(`  updated ${result.linksUpdated} link(s)\n`);
      }
    } catch (e) {
      process.stderr.write(`${(e as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("report")
  .description("review, file, or disable Ymir self-reports")
  .option("--yes", "consent and file pending reports now", false)
  .option("--flush", "file pending reports if already consented; silent otherwise", false)
  .option("--skill", "record a skill-flow failure", false)
  .option("--title <title>", "short summary (with --skill)")
  .option("--detail <detail>", "what happened (with --skill)")
  .option("--feedback <text>", "record an improvement idea")
  .option("--off", "opt out and discard anything captured", false)
  .action((opts: {
    yes: boolean;
    flush: boolean;
    skill: boolean;
    title?: string;
    detail?: string;
    feedback?: string;
    off: boolean;
  }) => {
    const { text, exitCode } = runReport({
      yes: opts.yes,
      flush: opts.flush,
      off: opts.off,
      feedback: opts.feedback,
      skill: opts.skill ? { title: opts.title ?? "", detail: opts.detail ?? "" } : undefined,
    });
    process.stdout.write(text);
    if (exitCode !== 0) process.exit(exitCode);
  });

/**
 * The one place a command's failure becomes a user-facing message.
 *
 * Before this existed, `program.parseAsync()` ran unattended: anything an async
 * action threw escaped as an unhandled rejection and reached the user as a raw
 * V8 dump. The compiled binary makes that worse, not better — it prints no stack
 * frames at all, so the dump is noise with nothing to act on.
 *
 * Only genuine exceptions are captured. The inline `process.exit(1)` paths — a
 * bad flag, a failing `check` — are the CLI working correctly, and reporting
 * them would bury real bugs under everyone's typos.
 */
async function main(): Promise<void> {
  maybeFlush();

  try {
    await program.parseAsync();
  } catch (e) {
    const command = program.args[0] ? `wiki ${program.args[0]}` : "wiki";
    process.stderr.write(`error: ${(e as Error)?.message ?? String(e)}\n`);

    if (capture(draftFromError(command, e)) !== null) process.stderr.write(`${REPORT_HINT}\n`);

    process.exit(1);
  }
}

void main();
