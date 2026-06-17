#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { readFileSync as readFileSync2 } from "fs";

// src/commands/ingest.ts
import { existsSync as existsSync2, rmSync } from "fs";

// src/pages.ts
import matter from "gray-matter";

// src/format.ts
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
var processor = remark().use(remarkFrontmatter, ["yaml"]).use(remarkGfm);
async function formatMarkdown(input) {
  const file = await processor.process(input);
  return String(file).replace(/\\\[/g, "[");
}

// src/schema.ts
import { z } from "zod";
var isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
var NoteType = z.enum(["entity", "concept", "topic"]);
var sourceFrontmatter = z.object({
  title: z.string().min(1),
  type: z.literal("source"),
  date: isoDate,
  tags: z.array(z.string()),
  source: z.string().min(1),
  ingested: isoDate
});
var noteFrontmatter = z.object({
  title: z.string().min(1),
  type: NoteType,
  date: isoDate,
  tags: z.array(z.string()),
  source_count: z.number().int().nonnegative()
});

// src/pages.ts
async function renderSourcePage(i) {
  const fm = sourceFrontmatter.parse({
    title: i.title,
    type: "source",
    date: i.date,
    tags: i.tags,
    source: i.source,
    ingested: i.date
  });
  const md = matter.stringify(`# ${i.title}

${i.body}
`, fm);
  return formatMarkdown(md);
}
async function renderNotePage(i) {
  const fm = noteFrontmatter.parse({
    title: i.name,
    type: i.type,
    date: i.date,
    tags: i.tags,
    source_count: i.sourceCount
  });
  const md = matter.stringify(`# ${i.name}

${i.body}
`, fm);
  return formatMarkdown(md);
}

// src/store.ts
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  appendFileSync
} from "fs";
import { dirname } from "path";
function writePage(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
function readPage(path) {
  return readFileSync(path, "utf8");
}
function listPages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md"));
}
function appendFileLine(path, line) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}
`, "utf8");
}

// src/paths.ts
import { join } from "path";
function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function wikiPaths(root) {
  return {
    root,
    index: join(root, "index.md"),
    log: join(root, "log.md"),
    schema: join(root, "SCHEMA.md"),
    rawDir: join(root, "raw"),
    sourcesDir: join(root, "sources"),
    notesDir: join(root, "notes")
  };
}
function sourcePath(root, title) {
  return join(root, "sources", `${slugify(title)}.md`);
}
function notePath(root, name) {
  return join(root, "notes", `${slugify(name)}.md`);
}

// src/index-build.ts
import matter2 from "gray-matter";
import { join as join2 } from "path";
function entries(root, sub) {
  return listPages(join2(root, sub)).sort().map((file) => {
    const fm = matter2(readPage(join2(root, sub, file))).data;
    const title = fm.title ?? file.replace(/\.md$/, "");
    return `- [${title}](${sub}/${file})`;
  });
}
function buildIndex(root) {
  const sources = entries(root, "sources");
  const notes = entries(root, "notes");
  const lines = ["# Wiki Index", ""];
  lines.push("## Sources", "");
  lines.push(...sources.length ? sources : ["_none yet_"], "");
  lines.push("## Notes", "");
  lines.push(...notes.length ? notes : ["_none yet_"], "");
  return lines.join("\n") + "\n";
}

// src/wikilog.ts
function appendLog(root, op, title, date) {
  appendFileLine(wikiPaths(root).log, `## [${date}] ${op} | ${title}`);
}

// src/validate.ts
import matter3 from "gray-matter";
import { load, JSON_SCHEMA } from "js-yaml";
import { join as join3 } from "path";
var matterOptions = {
  engines: {
    yaml: {
      parse: (str) => load(str, { schema: JSON_SCHEMA })
    }
  }
};
function loadDir(root, sub, errors) {
  const out = [];
  for (const file of listPages(join3(root, sub))) {
    const rel = `${sub}/${file}`;
    const parsed = matter3(readPage(join3(root, sub, file)), matterOptions);
    const schema = sub === "sources" ? sourceFrontmatter : noteFrontmatter;
    const res = schema.safeParse(parsed.data);
    if (!res.success) {
      errors.push(`${rel}: invalid frontmatter \u2014 ${res.error.issues.map((i) => i.message).join("; ")}`);
    }
    const title = parsed.data.title ?? file.replace(/\.md$/, "");
    const links = [...parsed.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim());
    out.push({ rel, title, body: parsed.content, links });
  }
  return out;
}
function validateWiki(root) {
  const errors = [];
  const warnings = [];
  const sources = loadDir(root, "sources", errors);
  const notes = loadDir(root, "notes", errors);
  const all = [...sources, ...notes];
  const slugs = new Set(all.map((p) => slugify(p.title)));
  const inbound = /* @__PURE__ */ new Set();
  for (const p of all) {
    for (const link of p.links) {
      const target = slugify(link);
      if (!slugs.has(target)) {
        errors.push(`${p.rel}: broken link [[${link}]]`);
      } else {
        inbound.add(target);
      }
    }
  }
  for (const n of notes) {
    if (!inbound.has(slugify(n.title))) {
      warnings.push(`orphan note: ${n.rel} (${n.title})`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// src/commands/ingest.ts
async function runIngest(i) {
  const page = await renderSourcePage({
    title: i.title,
    source: i.raw,
    date: i.today,
    tags: [],
    body: i.body
  });
  const path = sourcePath(i.root, i.title);
  const prev = existsSync2(path) ? readPage(path) : null;
  writePage(path, page);
  const result = validateWiki(i.root);
  if (!result.ok) {
    if (prev === null) rmSync(path);
    else writePage(path, prev);
    throw new Error(`ingest rejected:
${result.errors.join("\n")}`);
  }
  writePage(wikiPaths(i.root).index, buildIndex(i.root));
  appendLog(i.root, "ingest", i.title, i.today);
  return path;
}

// src/commands/note.ts
import { existsSync as existsSync3, rmSync as rmSync2 } from "fs";
import matter4 from "gray-matter";
async function runNote(i) {
  const path = notePath(i.root, i.name);
  const existed = existsSync3(path);
  const prevSourceCount = existed ? matter4(readPage(path)).data.source_count ?? 0 : 0;
  const page = await renderNotePage({
    name: i.name,
    type: i.type,
    date: i.today,
    tags: [],
    sourceCount: prevSourceCount,
    body: i.body
  });
  const prev = existed ? readPage(path) : null;
  writePage(path, page);
  const result = validateWiki(i.root);
  if (!result.ok) {
    if (prev === null) rmSync2(path);
    else writePage(path, prev);
    throw new Error(`note rejected:
${result.errors.join("\n")}`);
  }
  writePage(wikiPaths(i.root).index, buildIndex(i.root));
  appendLog(i.root, "note", i.name, i.today);
  return path;
}

// src/commands/query.ts
import { spawn } from "child_process";
var defaultRunner = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => out += d);
  child.stderr.on("data", (d) => err += d);
  child.on("error", reject);
  child.on(
    "close",
    (code) => code === 0 ? resolve(out) : reject(new Error(err || `qmd exited ${code}`))
  );
});
async function runQuery(i) {
  const run = i.runner ?? defaultRunner;
  return run("qmd", ["query", i.q, "--json", "--files"]);
}

// src/commands/help.ts
var HELP_TEXT = `wiki \u2014 Ymir wiki CLI (the ONLY way to write wiki docs)

You must NOT hand-write or hand-edit files under wiki/sources, wiki/notes,
index.md, or log.md. Use these commands; they format + validate every write.

Commands:
  ingest --raw <path> --title <t>     Ingest a source from wiki/raw into a summary page.
                                      Body is read from STDIN.
  note --type <entity|concept|topic> --name <n>
                                      Create/update a synthesis note. Body from STDIN.
  index                               Rebuild index.md from all pages.
  log <op> <title>                    Append a dated entry to log.md.
  validate                            Check frontmatter, [[links]], orphans. Exit !=0 on error.
  fmt                                 Format all wiki markdown (remark).
  query <q>                           Search the wiki via qmd (read side).
  help                                Show this text.

Page conventions:
  Source page frontmatter: title, type=source, date, tags[], source, ingested
  Note page frontmatter:   title, type=entity|concept|topic, date, tags[], source_count
  Cross-reference other pages with [[Exact Title]].

Examples:
  echo "Key points..." | wiki ingest --raw raw/paper.pdf --title "Rate Limiting"
  echo "A token-bucket limiter. See [[Rate Limiting]]." | wiki note --type concept --name "Token Bucket"
  wiki query "how does backoff work"
  wiki validate
`;
function runHelp() {
  process.stdout.write(HELP_TEXT);
}

// src/cli.ts
import { join as join4 } from "path";
var today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
var readStdin = () => readFileSync2(0, "utf8");
var program = new Command();
program.name("wiki").description("Ymir wiki CLI").option("--root <dir>", "wiki root", "wiki");
program.command("ingest").requiredOption("--raw <path>").requiredOption("--title <title>").action(async (opts) => {
  const root = program.opts().root;
  const path = await runIngest({ root, raw: opts.raw, title: opts.title, body: readStdin(), today: today() });
  process.stdout.write(`wrote ${path}
`);
});
program.command("note").requiredOption("--type <type>").requiredOption("--name <name>").action(async (opts) => {
  const root = program.opts().root;
  const type = NoteType.parse(opts.type);
  const path = await runNote({ root, type, name: opts.name, body: readStdin(), today: today() });
  process.stdout.write(`wrote ${path}
`);
});
program.command("index").action(async () => {
  const root = program.opts().root;
  writePage(wikiPaths(root).index, buildIndex(root));
  process.stdout.write("rebuilt index.md\n");
});
program.command("log").argument("<op>").argument("<title>").action((op, title) => {
  const root = program.opts().root;
  appendLog(root, op, title, today());
});
program.command("validate").action(() => {
  const root = program.opts().root;
  const r = validateWiki(root);
  for (const w of r.warnings) process.stdout.write(`warning: ${w}
`);
  for (const e of r.errors) process.stderr.write(`error: ${e}
`);
  if (!r.ok) process.exit(1);
  process.stdout.write("wiki valid\n");
});
program.command("fmt").action(async () => {
  const root = program.opts().root;
  for (const sub of ["sources", "notes"]) {
    for (const f of listPages(join4(root, sub))) {
      const p = join4(root, sub, f);
      writePage(p, await formatMarkdown(readPage(p)));
    }
  }
  process.stdout.write("formatted\n");
});
program.command("query").argument("<q>").action(async (q) => {
  const root = program.opts().root;
  process.stdout.write(await runQuery({ root, q }));
});
program.command("help").action(() => runHelp());
program.parseAsync();
