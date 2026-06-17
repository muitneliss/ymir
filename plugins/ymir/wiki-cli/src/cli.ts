import { Command } from "commander";
import { readFileSync } from "node:fs";
import { runIngest } from "./commands/ingest.js";
import { runNote } from "./commands/note.js";
import { runQuery } from "./commands/query.js";
import { runHelp } from "./commands/help.js";
import { runInit } from "./commands/init.js";
import { buildIndex } from "./index-build.js";
import { appendLog, type LogOp } from "./wikilog.js";
import { validateWiki } from "./validate.js";
import { formatMarkdown } from "./format.js";
import { writePage, readPage, listPages } from "./store.js";
import { wikiPaths } from "./paths.js";
import { NoteType } from "./schema.js";
import { join } from "node:path";

const today = () => new Date().toISOString().slice(0, 10);
const readStdin = () => readFileSync(0, "utf8");

const program = new Command();
program.name("wiki").description("Ymir wiki CLI").option("--root <dir>", "wiki root", "wiki");

program
  .command("ingest")
  .requiredOption("--raw <path>")
  .requiredOption("--title <title>")
  .action(async (opts: { raw: string; title: string }) => {
    const root = program.opts<{ root: string }>().root;
    const path = await runIngest({ root, raw: opts.raw, title: opts.title, body: readStdin(), today: today() });
    process.stdout.write(`wrote ${path}\n`);
  });

program
  .command("note")
  .requiredOption("--type <type>")
  .requiredOption("--name <name>")
  .action(async (opts: { type: string; name: string }) => {
    const root = program.opts<{ root: string }>().root;
    const type = NoteType.parse(opts.type);
    const path = await runNote({ root, type, name: opts.name, body: readStdin(), today: today() });
    process.stdout.write(`wrote ${path}\n`);
  });

program.command("index").action(async () => {
  const root = program.opts<{ root: string }>().root;
  writePage(wikiPaths(root).index, buildIndex(root));
  process.stdout.write("rebuilt index.md\n");
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

program.command("query").argument("<q>").action(async (q: string) => {
  const root = program.opts<{ root: string }>().root;
  process.stdout.write(await runQuery({ root, q }));
});

program.command("help").action(() => runHelp());

program
  .command("init")
  .option("--project-root <dir>", "project root", process.cwd())
  .option("--name <name>", "project name (defaults to basename of project root)")
  .action((opts: { projectRoot: string; name?: string }) => {
    const root = program.opts<{ root: string }>().root;
    const s = runInit({ projectRoot: opts.projectRoot, root, name: opts.name });
    for (const p of s.created) process.stdout.write(`created ${p}\n`);
    for (const p of s.skipped) process.stdout.write(`skipped ${p}\n`);
    process.stdout.write(
      s.settingsMerged ? "settings merged\n" : "settings unchanged\n",
    );
    process.stdout.write(
      s.claudeBlockAppended ? "CLAUDE.md appended\n" : "CLAUDE.md unchanged\n",
    );
    if (!s.valid) {
      process.stderr.write("wiki invalid\n");
      process.exit(1);
    }
    process.stdout.write("wiki valid\n");
  });

program.parseAsync();
