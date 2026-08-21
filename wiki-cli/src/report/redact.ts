/**
 * Reduce arbitrary error text to something safe to publish on a public issue
 * tracker.
 *
 * Every report Ymir files is written from an end user's machine to
 * `muitneliss/ymir`, where it is world-readable and effectively permanent. The
 * threat is not a malicious payload — it is ordinary error text that happens to
 * carry the user's name, employer, or credentials, because error messages quote
 * whatever they were handed.
 *
 * So this denies by default on the three things that identify a person:
 * filesystem paths, hostnames, and credential-shaped strings. What survives is
 * the part that actually helps a maintainer: project-relative paths, basenames,
 * and the shape of the failure.
 */

export interface RedactContext {
  /** Absolute project root. Paths under it keep their relative tail. */
  cwd?: string;
}

const REDACTED = "<redacted>";

/**
 * Hosts whose names carry no information about who is running Ymir. Everything
 * else is replaced whole: `ci.acme-corp.internal` names an employer just as
 * surely as a home directory names a user.
 */
const PUBLIC_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "codeload.github.com",
]);

/**
 * Credential shapes, applied before any path or URL rule so that a token stays
 * redacted even when it appears as a directory name or a query parameter.
 */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprse]-[A-Za-z0-9-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
];

/** `token=…`, `api_key: …` — the value is secret whatever the key is called. */
const ASSIGNED_SECRET = /\b(token|secret|passwd|password|api[-_]?key|auth)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi;

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** `git@github.com:owner/repo.git` — matched before EMAIL, which also fits it. */
const SSH_REMOTE = /\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}:[A-Za-z0-9._/-]+/g;

const URL_PATTERN = /\bhttps?:\/\/\S+/gi;

const WINDOWS_PATH = /\b[A-Za-z]:\\(?:[^\\\s"']+\\)*([^\\\s"']+)/g;

/**
 * An absolute POSIX path.
 *
 * The lookbehind keeps the rule from re-entering text an earlier rule already
 * rewrote. Excluding `>` and `~` stops `<project>/src/a.ts` degrading to
 * `<project><path>/a.ts` (which would also cost idempotence); excluding `:` and
 * `/` stops it from eating the `//host/path` of a URL that `redactUrl` already
 * judged safe to keep.
 */
const POSIX_PATH = /(?<![\w>~:/])\/(?:[^/\s"':]+\/)+([^/\s"':]+)/g;

function redactUrl(url: string): string {
  const trailing = url.match(/[).,;:]+$/)?.[0] ?? "";
  const bare = trailing ? url.slice(0, -trailing.length) : url;

  let host: string;
  let pathname: string;
  try {
    const parsed = new URL(bare);
    host = parsed.hostname;
    pathname = parsed.pathname;
    if (parsed.username || parsed.password) return "<url>" + trailing;
  } catch {
    return "<url>" + trailing;
  }

  if (!PUBLIC_HOSTS.has(host)) return "<url>" + trailing;
  return `https://${host}${pathname}` + trailing;
}

/**
 * Strip identifying detail from `text`.
 *
 * Rule order is load-bearing: credentials first (so a token buried in a path or
 * query dies regardless of what encloses it), then structured identities, then
 * paths last — because the path rules are the greediest and would otherwise
 * consume text the earlier rules needed to see intact.
 */
export function redact(text: string, ctx: RedactContext = {}): string {
  if (text === "") return "";

  let out = text;

  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, REDACTED);
  out = out.replace(ASSIGNED_SECRET, (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`);

  out = out.replace(SSH_REMOTE, "<git-remote>");
  out = out.replace(URL_PATTERN, redactUrl);
  out = out.replace(EMAIL, "<email>");

  if (ctx.cwd) {
    const root = ctx.cwd.replace(/\/+$/, "");
    out = out.split(root).join("<project>");
  }

  out = out.replace(WINDOWS_PATH, "<path>/$1");
  out = out.replace(POSIX_PATH, "<path>/$1");

  return out;
}

/**
 * Bound a field's contribution to an issue body. Reports are filed
 * unattended, so a runaway message must not turn into a megabyte comment.
 */
export function truncate(text: string, maxChars: number, maxLines?: number): string {
  let out = text;

  if (maxLines !== undefined) {
    const lines = out.split("\n");
    if (lines.length > maxLines) out = lines.slice(0, maxLines).join("\n") + "\n…";
  }

  if (out.length > maxChars) out = out.slice(0, Math.max(0, maxChars - 1)) + "…";

  return out;
}
