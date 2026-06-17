import { describe, it, expect } from "bun:test";
import { runQuery } from "../src/commands/query.js";

describe("runQuery", () => {
  it("invokes qmd query with json/files flags and returns stdout", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeRun = async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return '[{"path":"wiki/notes/a.md","score":0.9}]';
    };
    const out = await runQuery({ root: "/w", q: "rate limit", runner: fakeRun });
    expect(calls[0]!.cmd).toBe("qmd");
    expect(calls[0]!.args).toContain("query");
    expect(calls[0]!.args).toContain("rate limit");
    expect(calls[0]!.args).toContain("--json");
    expect(calls[0]!.args).toContain("--files");
    expect(out).toContain("wiki/notes/a.md");
  });
});
