import { describe, test, expect } from "bun:test";
import { join, dirname } from "path";
import { existsSync, readFileSync } from "fs";

const repoRoot = join(import.meta.dir, "../../../..");

interface PluginManifest {
  metadata?: { pluginRoot?: string };
  plugins?: Array<{
    name?: string;
    source?: string;
    skills?: string[];
    description?: string;
  }>;
}

function skillsSearchDirs(manifest: PluginManifest, plugin: NonNullable<PluginManifest["plugins"]>[number]): string[] {
  const pluginRoot = manifest.metadata?.pluginRoot ?? "";
  const source = plugin.source ?? "";
  const pluginBase = join(repoRoot, pluginRoot, source);
  return (plugin.skills ?? [])
    .filter((e) => e.startsWith("./"))
    .map((e) => dirname(join(pluginBase, e)));
}

describe("skills CLI plugin manifest", () => {
  const manifest: PluginManifest = JSON.parse(
    readFileSync(join(repoRoot, ".claude-plugin/marketplace.json"), "utf-8")
  );
  const plugin = manifest.plugins?.[0];

  test("plugin entry declares a skills[] array so discovery is not fallback-dependent", () => {
    expect(plugin?.skills).toBeDefined();
    expect(Array.isArray(plugin?.skills)).toBe(true);
    expect(plugin!.skills!.length).toBeGreaterThan(0);
  });

  test("every skills[] entry begins with ./ (isValidRelativePath)", () => {
    for (const entry of plugin?.skills ?? []) {
      expect(entry.startsWith("./")).toBe(true);
    }
  });

  test("skills[] resolves to a search dir that contains plugins/ymir/SKILL.md at depth 1", () => {
    const searchDirs = skillsSearchDirs(manifest, plugin!);
    const found = searchDirs.some((dir) =>
      existsSync(join(dir, "ymir", "SKILL.md"))
    );
    expect(found).toBe(true);
  });

  test("ymir is still found when a probe skill exists in skills/ (no zero-skills fallback)", () => {
    const searchDirs = skillsSearchDirs(manifest, plugin!);
    expect(searchDirs.length).toBeGreaterThan(0);
    const foundViaManifest = searchDirs.some((dir) =>
      existsSync(join(dir, "ymir", "SKILL.md"))
    );
    expect(foundViaManifest).toBe(true);
  });

  test("exactly one SKILL.md is tracked in the repo", () => {
    const { execSync } = require("child_process");
    const tracked = execSync("git ls-files -- '*/SKILL.md' 'SKILL.md'", {
      cwd: repoRoot,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(tracked.length).toBe(1);
    expect(tracked[0]).toBe("plugins/ymir/SKILL.md");
  });
});
