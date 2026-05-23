import { createHash } from "node:crypto";
import type { Finding } from "./types.js";

export function computeFindingsHash(findings: Finding[]): string {
  // Duplicates are kept (no Set dedup): two findings that share
  // (severity, path, bodyHash) but sit on different lines must contribute
  // separate hash entries. Collapsing them would make a 2-finding iteration
  // and a 1-finding iteration (after one is fixed) hash identically, tripping
  // a phantom `loop_detected`. `line` stays excluded from the key so genuine
  // line shifts still don't change the hash (TY-276 #7 / TY-280 invariant).
  const normalized = findings.map(normalizeFinding).sort();
  return stableHash(JSON.stringify(normalized));
}

function normalizeFinding(finding: Finding): string {
  // line is intentionally excluded: it shifts when code is edited,
  // so including it would cause false "different findings" detections.
  // title is also intentionally excluded (TY-276 #7) — Codex sometimes
  // refines the title between iterations while pointing at the same issue,
  // and including it would let those cosmetic rewrites bypass loop detection.
  //
  // TY-305: extend the same tolerance to `body` whitespace. Codex re-renders
  // a logically identical finding with cosmetic whitespace drift (CRLF↔LF
  // from the renderer's OS, trailing line whitespace from markdown line
  // breaks, outer trim from summary template edits), and hashing the raw
  // body would let those drifts bypass loop detection. Internal whitespace
  // runs (inside a line) are preserved so code snippets / stack-trace
  // indentation stays distinguishable.
  const normalizedBody = finding.body
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  const bodyHash = stableHash(normalizedBody);
  return JSON.stringify([finding.severity, finding.path, bodyHash]);
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
