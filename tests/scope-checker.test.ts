import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCOPE_POLICY,
  checkScope,
  parseGitNumstat,
  type ChangedFile,
  type ScopeCheckPolicy,
} from "../src/scope-checker.js";

function file(path: string, added = 1, deleted = 0): ChangedFile {
  return { path, added, deleted };
}

describe("checkScope (default policy)", () => {
  it("accepts a small diff within src/", () => {
    const result = checkScope([
      file("src/main-loop.ts", 5, 2),
      file("tests/main-loop.test.ts", 10, 0),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedFiles).toBe(2);
      expect(result.totalLines).toBe(17);
    }
  });

  it("rejects a change to .github/workflows", () => {
    const result = checkScope([
      file("src/main-loop.ts", 1, 0),
      file(".github/workflows/auto-review-loop.yml", 4, 0),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hard_block_path");
      expect(result.offendingPaths).toEqual([
        ".github/workflows/auto-review-loop.yml",
      ]);
    }
  });

  it("rejects a change to package.json", () => {
    const result = checkScope([file("package.json", 1, 1)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hard_block_path");
    }
  });

  it("rejects a change to package-lock.json", () => {
    const result = checkScope([file("package-lock.json", 100, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hard_block_path");
    }
  });

  it("rejects a change to tsconfig.json", () => {
    const result = checkScope([file("tsconfig.json", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hard_block_path");
    }
  });

  it("rejects a root-level dotfile change", () => {
    const result = checkScope([file(".gitignore", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hard_block_path");
    }
  });

  it("accepts a dotfile nested inside an allowed path", () => {
    // src/.eslintrc would be allowed; the hard-block only matches root dotfiles.
    const result = checkScope([file("src/.eslintrc.json", 1, 0)]);
    expect(result.ok).toBe(true);
  });

  it("rejects a change to a path outside the allow-list", () => {
    const result = checkScope([file("lib/utils.ts", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("disallowed_path");
      expect(result.offendingPaths).toEqual(["lib/utils.ts"]);
    }
  });

  it("rejects a node_modules change", () => {
    const result = checkScope([file("node_modules/foo/index.js", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hard_block_path");
    }
  });

  it("rejects a dist/ change", () => {
    const result = checkScope([file("dist/main.js", 5, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hard_block_path");
    }
  });
});

describe("checkScope (path safety)", () => {
  it("rejects absolute paths", () => {
    const result = checkScope([file("/etc/passwd", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_traversal");
  });

  it("rejects `..` traversal", () => {
    const result = checkScope([file("../outside.ts", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_traversal");
  });

  it("rejects mid-path traversal segments", () => {
    const result = checkScope([file("src/../etc/foo", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_traversal");
  });

  it("rejects empty path", () => {
    const result = checkScope([file("", 1, 0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_traversal");
  });
});

describe("checkScope (size budgets)", () => {
  it("rejects more than 20 files", () => {
    const files: ChangedFile[] = Array.from({ length: 21 }, (_, i) =>
      file(`src/file-${i}.ts`, 1, 0),
    );
    const result = checkScope(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_files");
  });

  it("accepts exactly 20 files", () => {
    const files: ChangedFile[] = Array.from({ length: 20 }, (_, i) =>
      file(`src/file-${i}.ts`, 1, 0),
    );
    const result = checkScope(files);
    expect(result.ok).toBe(true);
  });

  it("rejects more than 1000 total changed lines", () => {
    const result = checkScope([file("src/big.ts", 600, 500)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_lines");
  });

  it("accepts exactly 1000 total changed lines", () => {
    const result = checkScope([file("src/big.ts", 600, 400)]);
    expect(result.ok).toBe(true);
  });
});

describe("checkScope (binary files)", () => {
  it("rejects binary changes (git numstat `-` markers)", () => {
    const result = checkScope([file("src/asset.bin", -1, -1)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("binary_change");
  });
});

describe("checkScope (custom policy)", () => {
  it("honors a tighter file budget", () => {
    const tight: ScopeCheckPolicy = { ...DEFAULT_SCOPE_POLICY, maxFiles: 3 };
    const files: ChangedFile[] = Array.from({ length: 4 }, (_, i) =>
      file(`src/f${i}.ts`),
    );
    const result = checkScope(files, tight);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_files");
  });

  it("honors a broader allowed path list", () => {
    const policy: ScopeCheckPolicy = {
      ...DEFAULT_SCOPE_POLICY,
      allowedPathPrefixes: ["src/", "tests/", "docs/", "lib/"],
    };
    const result = checkScope([file("lib/utils.ts")], policy);
    expect(result.ok).toBe(true);
  });
});

describe("parseGitNumstat", () => {
  it("parses a basic three-line output", () => {
    const output = [
      "5\t2\tsrc/main-loop.ts",
      "10\t0\ttests/main-loop.test.ts",
      "1\t1\tdocs/README.md",
    ].join("\n");
    expect(parseGitNumstat(output)).toEqual([
      { path: "src/main-loop.ts", added: 5, deleted: 2 },
      { path: "tests/main-loop.test.ts", added: 10, deleted: 0 },
      { path: "docs/README.md", added: 1, deleted: 1 },
    ]);
  });

  it("marks binary files with -1/-1", () => {
    const output = "-\t-\tsrc/asset.bin";
    expect(parseGitNumstat(output)).toEqual([
      { path: "src/asset.bin", added: -1, deleted: -1 },
    ]);
  });

  it("preserves paths containing tabs", () => {
    // Tabs in filenames are pathological but possible. Anything after the
    // second tab is the path.
    const output = "1\t0\tsrc/weird\tname.ts";
    expect(parseGitNumstat(output)).toEqual([
      { path: "src/weird\tname.ts", added: 1, deleted: 0 },
    ]);
  });

  it("ignores blank lines", () => {
    const output = "1\t0\tsrc/a.ts\n\n\n2\t0\tsrc/b.ts\n";
    expect(parseGitNumstat(output)).toHaveLength(2);
  });

  it("ignores malformed numeric fields", () => {
    const output = "abc\t1\tsrc/a.ts\n1\txyz\tsrc/b.ts\n2\t0\tsrc/c.ts";
    const parsed = parseGitNumstat(output);
    expect(parsed).toEqual([{ path: "src/c.ts", added: 2, deleted: 0 }]);
  });
});
