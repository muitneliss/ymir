import { describe, it, expect } from "bun:test";
import { redact, truncate } from "../src/report/redact.js";

const CTX = { cwd: "/Users/alice/work/acme-corp/my-project" };

describe("redact — filesystem paths", () => {
  it("rewrites a path inside the project to <project>, keeping the relative part", () => {
    const out = redact("failed to read /Users/alice/work/acme-corp/my-project/src/auth.ts", CTX);
    expect(out).toBe("failed to read <project>/src/auth.ts");
  });

  it("reduces the project root itself to <project>", () => {
    expect(redact("/Users/alice/work/acme-corp/my-project", CTX)).toBe("<project>");
  });

  it("strips intermediate directories from any other absolute path", () => {
    const out = redact("ENOENT: /Users/alice/.config/qmd/settings.toml", CTX);
    expect(out).toBe("ENOENT: <path>/settings.toml");
  });

  it("never lets a home directory survive", () => {
    const out = redact("/Users/alice/secrets/notes.md and /home/bob/thing.log", CTX);
    expect(out).not.toContain("alice");
    expect(out).not.toContain("bob");
    expect(out).toBe("<path>/notes.md and <path>/thing.log");
  });

  it("redacts Windows paths, normalizing separators", () => {
    const out = redact("cannot open C:\\Users\\alice\\AppData\\wiki.exe", CTX);
    expect(out).not.toContain("alice");
    expect(out).toBe("cannot open <path>/wiki.exe");
  });

  it("leaves relative paths untouched — they are the diagnostic signal", () => {
    expect(redact("wiki/sources/auth.md is stale", CTX)).toBe("wiki/sources/auth.md is stale");
  });
});

describe("redact — credentials", () => {
  it.each([
    ["ghp_", "gh" + "p_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"],
    ["gho_", "gh" + "o_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"],
    ["github_pat_", "github" + "_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz123456"],
    ["sk-", "sk" + "-proj0A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6"],
    ["AKIA", "AK" + "IAIOSFODNN7EXAMPLE"],
    ["xoxb-", "xo" + "xb-123456789012-abcdefghijklmnop"],
  ])("redacts a %s token", (_label, token) => {
    const out = redact(`auth failed using ${token} on retry`, CTX);
    expect(out).not.toContain(token);
    expect(out).toContain("<redacted>");
  });

  it("redacts a bearer header value", () => {
    const out = redact("Authorization: Bearer aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRva2Vu", CTX);
    expect(out).not.toContain("aGVsbG8");
    expect(out).toContain("<redacted>");
  });

  it.each(["token", "secret", "password", "api_key", "API-KEY"])(
    "redacts the value after a %s assignment",
    (key) => {
      const out = redact(`${key}=hunter2supersecretvalue`, CTX);
      expect(out).not.toContain("hunter2supersecretvalue");
      expect(out).toContain("<redacted>");
    },
  );

  it("redacts a private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ\n-----END RSA PRIVATE KEY-----";
    const out = redact(`loaded ${pem}`, CTX);
    expect(out).not.toContain("MIIEowIBAAKCAQ");
    expect(out).toContain("<redacted>");
  });

  it("redacts a token even when embedded in a path", () => {
    const out = redact("/tmp/gh" + "p_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8/cache", CTX);
    expect(out).not.toContain("A1b2C3d4E5f6");
  });

  it("keeps a sha256 hash — provenance hashes are diagnostic, not secret", () => {
    const sha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(redact(`source_hash mismatch: ${sha}`, CTX)).toContain(sha);
  });
});

describe("redact — identities and network", () => {
  it("redacts email addresses", () => {
    const out = redact("owner alice.smith+dev@acme-corp.com failed", CTX);
    expect(out).not.toContain("acme-corp.com");
    expect(out).toContain("<email>");
  });

  it("keeps an allowlisted host's endpoint but drops its query string", () => {
    const out = redact(
      "GET https://github.com/muitneliss/ymir/releases/download/ymir-v0.7.0/wiki-linux-x64?token=abc 404",
      CTX,
    );
    expect(out).toContain("https://github.com/muitneliss/ymir/releases");
    expect(out).not.toContain("abc");
  });

  it("redacts a non-allowlisted URL whole — an internal hostname names the employer", () => {
    const out = redact("GET https://ci.acme-corp.internal/v1/items?user=alice 500", CTX);
    expect(out).not.toContain("acme-corp");
    expect(out).not.toContain("alice");
    expect(out).toContain("<url>");
  });

  it("strips credentials embedded in a URL", () => {
    const out = redact("https://alice:hunter2@git.acme-corp.com/repo", CTX);
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("alice");
  });

  it("redacts an ssh git remote", () => {
    const out = redact("remote git@github.com:acme-corp/private-thing.git rejected", CTX);
    expect(out).not.toContain("acme-corp");
    expect(out).toContain("<git-remote>");
  });
});

describe("redact — invariants", () => {
  it("is idempotent", () => {
    const input = "/Users/alice/p/x.ts gh" + "p_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 a@b.com";
    const once = redact(input, CTX);
    expect(redact(once, CTX)).toBe(once);
  });

  it("handles empty and whitespace input", () => {
    expect(redact("", CTX)).toBe("");
    expect(redact("   ", CTX)).toBe("   ");
  });

  it("leaks nothing from a realistic composite failure", () => {
    const input = [
      "ingest rejected: /Users/alice/work/acme-corp/my-project/src/auth.ts",
      "  upstream https://internal.acme-corp.com/api?key=s3cr3t",
      "  as alice@acme-corp.com with token=gh" + "p_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
      "  cache at /Users/alice/.ymir/cache.json",
    ].join("\n");
    const out = redact(input, CTX);

    for (const leak of ["alice", "s3cr3t", "ghp_A1b2", "acme-corp.com"]) {
      expect(out).not.toContain(leak);
    }
    expect(out).toContain("<project>/src/auth.ts");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 100)).toBe("short");
  });

  it("caps long text and marks the elision", () => {
    const out = truncate("x".repeat(500), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out).toContain("…");
  });

  it("caps line count as well as characters", () => {
    const out = truncate(Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n"), 10_000, 8);
    expect(out.split("\n").length).toBeLessThanOrEqual(9);
  });
});
