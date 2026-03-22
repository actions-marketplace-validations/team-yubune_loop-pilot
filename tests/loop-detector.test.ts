import { describe, it, expect } from "vitest";
import { isLoop } from "../src/loop-detector.js";
import { computeFindingsHash } from "../src/findings-hash.js";
import type { Finding, FindingsHashEntry } from "../src/types.js";

const baseFinding: Finding = {
  severity: "P1",
  path: "src/foo.ts",
  line: 10,
  title: "Unused variable",
  body: "Variable `x` is declared but never used.",
};

const anotherFinding: Finding = {
  severity: "P0",
  path: "src/bar.ts",
  line: 42,
  title: "Null dereference",
  body: "Potential null dereference on `obj.value`.",
};

describe("isLoop", () => {
  it("returns true when current findings hash matches a hash in history", () => {
    const currentFindings: Finding[] = [baseFinding];
    const currentHash = computeFindingsHash(currentFindings);
    const findingsHashHistory: FindingsHashEntry[] = [
      { iteration: 1, hash: currentHash },
    ];

    expect(isLoop(currentFindings, findingsHashHistory)).toBe(true);
  });

  it("returns true for oscillation (A→B→A pattern)", () => {
    const findingsA: Finding[] = [baseFinding];
    const findingsB: Finding[] = [anotherFinding];

    const hashA = computeFindingsHash(findingsA);
    const hashB = computeFindingsHash(findingsB);

    // History represents iteration 1 (A) and iteration 2 (B)
    const findingsHashHistory: FindingsHashEntry[] = [
      { iteration: 1, hash: hashA },
      { iteration: 2, hash: hashB },
    ];

    // At iteration 3, we see findings A again
    expect(isLoop(findingsA, findingsHashHistory)).toBe(true);
  });

  it("returns false when current findings hash does not match any hash in history", () => {
    const currentFindings: Finding[] = [baseFinding];
    const differentFinding: Finding = {
      ...baseFinding,
      body: "A completely different issue.",
    };
    const differentHash = computeFindingsHash([differentFinding]);

    const findingsHashHistory: FindingsHashEntry[] = [
      { iteration: 1, hash: differentHash },
    ];

    expect(isLoop(currentFindings, findingsHashHistory)).toBe(false);
  });

  it("returns false when history is empty", () => {
    const currentFindings: Finding[] = [baseFinding];
    const findingsHashHistory: FindingsHashEntry[] = [];

    expect(isLoop(currentFindings, findingsHashHistory)).toBe(false);
  });

  it("returns true when current hash matches any entry in a longer history", () => {
    const findingsA: Finding[] = [baseFinding];
    const findingsB: Finding[] = [anotherFinding];
    const findingsC: Finding[] = [
      {
        severity: "P1",
        path: "src/baz.ts",
        line: 5,
        title: "Type error",
        body: "Type `string` is not assignable to type `number`.",
      },
    ];

    const hashA = computeFindingsHash(findingsA);
    const hashB = computeFindingsHash(findingsB);
    const hashC = computeFindingsHash(findingsC);

    // History: A (iter 1), B (iter 2), C (iter 3)
    const findingsHashHistory: FindingsHashEntry[] = [
      { iteration: 1, hash: hashA },
      { iteration: 2, hash: hashB },
      { iteration: 3, hash: hashC },
    ];

    // At iteration 4, we see B again
    expect(isLoop(findingsB, findingsHashHistory)).toBe(true);
  });
});
