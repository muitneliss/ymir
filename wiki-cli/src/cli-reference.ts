import { relative, sep } from "node:path";

/**
 * How a scaffolded wiki refers to the CLI that owns it.
 *
 * `wiki/SCHEMA.md` is committed, so the invocation it documents is read by every
 * contributor and every CI checkout — not just the machine that ran `init`.
 * Writing the scaffolding binary's own path there encodes the machine *and* the
 * install layout (skill root on one host, plugin cache on another), so the line
 * resolves for exactly one person; the rest find a path that does not exist and
 * conclude the CLI is not installed. The reference is therefore always the
 * repo-local shim, which resolves the binary at run time.
 */

/** Project-relative, POSIX-separated reference to a directory inside the repo. */
export function projectRelative(projectRoot: string, target: string): string {
  const rel = relative(projectRoot, target).split(sep).join("/");
  if (rel === "") return ".";
  return rel.startsWith("..") ? rel : `./${rel}`;
}

export function shimReference(wikiRootRef: string): string {
  return `${wikiRootRef}/bin/wiki`;
}

export function invocation(wikiRootRef: string): string {
  return `${shimReference(wikiRootRef)} --root ${wikiRootRef}`;
}

/**
 * The generated header of SCHEMA.md's `## The CLI` section: the heading, the
 * prose that introduces it, and the fenced invocation — up to but not including
 * the command list, which a project may have annotated.
 */
const INVOCATION_BLOCK = /^## The CLI\n[\s\S]*?^```\n[\s\S]*?^```\n/m;

/**
 * Bring an already-scaffolded SCHEMA.md's invocation back in line with the
 * template, or return `null` when there is nothing to change.
 *
 * Wikis scaffolded before the shim existed carry one machine's absolute path in
 * a tracked file (issue #71), and re-running `init` is the only repair route
 * they have — by then SCHEMA.md exists, so `init`'s write-if-missing rule would
 * otherwise leave the dead path in place forever. Only the generated block is
 * replaced; a project's own edits further down the section survive.
 */
export function repairInvocation(existing: string, renderedTemplate: string): string | null {
  const fresh = renderedTemplate.match(INVOCATION_BLOCK)?.[0];
  if (fresh === undefined) return null;

  const current = existing.match(INVOCATION_BLOCK)?.[0];
  if (current === undefined || current === fresh) return null;

  return existing.replace(INVOCATION_BLOCK, fresh);
}
