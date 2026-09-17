import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// `ymir apply` reads each playbook section's **Target:** line to learn which
// artifact to plan (SKILL.md, "Applying the spec"). A section without one
// cannot be planned — the skill-flow failure reported in #63.
const playbookDir = join(import.meta.dir, "../../plugins/ymir/templates/playbook");

// header.md is the playbook preamble, not a concern section.
const sections = readdirSync(playbookDir)
  .filter((f) => f.endsWith(".md") && f !== "header.md");

describe("playbook concern templates", () => {
  test.each(sections)("%s declares a Target line", (file) => {
    const text = readFileSync(join(playbookDir, file), "utf8");
    expect(text).toMatch(/^- \*\*Target:\*\* \S/m);
  });
});
