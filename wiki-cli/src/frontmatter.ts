import { load, dump, JSON_SCHEMA } from "js-yaml";

// JSON_SCHEMA stops js-yaml from coercing unquoted YYYY-MM-DD into Date objects
// (which would break the z.string() date check) and disables YAML 1.1 merge-key
// aliasing — the vector for the js-yaml quadratic-DoS advisory.
const YAML_OPTS = { schema: JSON_SCHEMA } as const;

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export interface ParsedDocument {
  data: Record<string, unknown>;
  content: string;
}

export function parseFrontmatter(input: string): ParsedDocument {
  const match = FRONTMATTER_RE.exec(input);
  if (!match) return { data: {}, content: input };
  const parsed = load(match[1]!, YAML_OPTS);
  const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return { data, content: match[2]! };
}

export function stringifyFrontmatter(body: string, data: Record<string, unknown>): string {
  const yaml = dump(data, YAML_OPTS);
  return `---\n${yaml}---\n${body}`;
}
