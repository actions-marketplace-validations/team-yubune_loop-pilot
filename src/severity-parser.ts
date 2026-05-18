import type { ParsedComment, Severity } from "./types.js";

// Leading \n is optional so the pattern matches when the footer is the only body content
const CODEX_FOOTER_PATTERN = /\n?Useful\? React with 👍 \/ 👎\.\s*$/;
// TY-273 #B1: accept any single-severity or `/`-joined chain of severities
// (`No P0 findings`, `No P0/P1 findings`, `No P2/P3 findings`, etc.). The
// earlier expression only matched `no findings` or the literal `no p0/p1
// findings`, so wording like `No P0 findings.` slipped through and was then
// re-classified as a P0 finding by FALLBACK_KEYWORD_REGEX. Mirrors the
// `specificNoFindingsMatches` pattern in `src/review-collector.ts` so the
// two layers agree on what counts as a "no findings" sentence.
const NO_FINDINGS_PATTERN =
  /\bno\s+(?:p[0-3](?:\s*\/\s*p[0-3])*\s+)?findings?\b|\b0\s+findings?\b|\bno\s+issues?\b/i;

// Stage 1: bare badge (P0) or bracketed badge ([P0]). Extended to P0..P3 (TY-256).
//
// TY-275 #6: enforce bracket symmetry — `[?` and `]?` were independent so
// `[P0` (open only) or `P0]` (close only) would match. The alternation
// requires matched pairs; the bare form uses a `(?!\])` negative lookahead
// so `P0]` (stray closing bracket without an opener) does not slip through
// the bare branch. Group 1/2 give the severity slot; group 3 captures the
// trailing title.
const STAGE1_REGEX = /^\s*(?:\[(P[0-3])\]|(P[0-3])(?!\]))\s*(.*)/;

// Stage 2: Markdown bold variants (**P0** or **[P0]**). Extended to P0..P3 (TY-256).
//
// TY-275 #6: enforce bracket / bold **symmetry**. The original regex allowed
// `[?` and `]?` independently, so a malformed Codex output like `[P0` or `P0]`
// (mismatched brackets) — or `**P0` (unclosed bold) — would still match and
// be silently classified as a P0 finding. The alternation below requires
// matched pairs only, with a fallback to bare `P0`. Capture groups 1-4 give
// the severity slot from whichever shape matched (one of them is non-null);
// group 5 captures the trailing title.
const STAGE2_REGEX =
  /^\s*(?:\*{2}\[(P[0-3])\]\*{2}|\*{2}(P[0-3])\*{2}|\[(P[0-3])\]|(P[0-3])(?![\]*]))\s*(.*)/;

// Codex currently renders severity as an image badge:
// **<sub><sub>![P2 Badge](...)</sub></sub>  Title**
// Extended to P0..P3 (TY-256).
const IMAGE_BADGE_REGEX = /!\[(P[0-3])\s+Badge\]\([^)]+\)(?:\s*<\/sub>)*\s*(.*)$/i;

// Fallback: P0 or P1 keyword anywhere in text. Intentionally not extended to
// P2/P3 — looser patterns risk false positives (e.g., the strings "P2" / "P3"
// appearing in code or prose unrelated to severity tags). P2/P3 must carry an
// explicit badge to be recognized (TY-256).
const FALLBACK_KEYWORD_REGEX = /\b(P0|P1)\b/;

const SEVERITY_ORDER: Record<Severity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** Severity 全列挙 (urgency 順)。 */
export const SEVERITIES: readonly Severity[] = ["P0", "P1", "P2", "P3"];

/** 文字列が有効な Severity か。 */
export function isSeverity(value: string): value is Severity {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3";
}

/**
 * 2 つの severity を urgency 順で比較する。
 * 戻り値が負なら `a` の方が緊急、正なら `b` の方が緊急、0 なら同等。
 */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

/**
 * `severity` が `threshold` 以上の urgency か (= 修正対象に含めるか) を返す。
 *
 * threshold は「これより低い (= 数値が大きい) severity を除外する」境界として
 * 使う。例: threshold=`P1` → P0/P1 は含む、P2/P3 は除外。threshold=`P3` は
 * すべてを含む (実質 filter なし)。
 */
export function isAtLeastSeverity(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
}

/**
 * Parses a raw Codex inline comment body into severity, title, and body.
 *
 * Why staged regex: Codex posts severity in multiple formats (bare, bracketed,
 * Markdown bold). We cascade from most-specific to least-specific to avoid
 * false positives from looser patterns.
 */
/**
 * If a line is wrapped in an outer `**...**` pair (with no other `**`
 * inside), return the inner content; otherwise return the line unchanged.
 *
 * TY-275 #6 tightened STAGE1 / STAGE2 to require matched `[ ]` / `**`
 * pairs, but that regressed the fully-bold heading case Codex emits in
 * the wild — `**P2 Memory leak in parser**` (entire line bolded). Neither
 * stage matched it, and the bare-`P0|P1` fallback skipped it because the
 * severity was P2/P3 → finding dropped at the default threshold.
 *
 * Pre-stripping the outer wrapper lets STAGE1 / STAGE2 see `P2 Memory
 * leak in parser` and match cleanly, while still rejecting half-bold
 * shapes like `**P0 ...` (no closing `**`). The `!inner.includes("**")`
 * guard avoids incorrectly unwrapping `**A** **B**` (two separate bold
 * spans, not one outer wrapper).
 *
 * Codex review on PR #95 (r3258007790): trim trailing whitespace before
 * the `endsWith("**")` check. GitHub Markdown allows trailing spaces in
 * headings, so a line like `**P2 Memory leak**   ` (trailing spaces from
 * a copy-paste or markdown line-break) would otherwise fail the unwrap
 * and silently drop the finding. We normalize the suffix here rather
 * than at the caller because the unwrap is the only consumer that cares.
 */
function stripOuterBold(line: string): string {
  const trimmed = line.replace(/\s+$/, "");
  if (trimmed.length < 5) return line;
  if (!trimmed.startsWith("**") || !trimmed.endsWith("**")) return line;
  const inner = trimmed.slice(2, -2);
  if (inner.includes("**")) return line;
  return inner;
}

export function parseSeverity(rawBody: string): ParsedComment {
  // Preprocess: strip leading whitespace/newlines before regex application
  const stripped = rawBody.replace(/^[\s\n]+/, "");

  // Split into first line (title candidate) and remainder (body candidate)
  const doubleNewlineIndex = stripped.indexOf("\n\n");
  const firstLine =
    doubleNewlineIndex === -1
      ? stripped
      : stripped.slice(0, doubleNewlineIndex);
  const rawBodyPart =
    doubleNewlineIndex === -1 ? "" : stripped.slice(doubleNewlineIndex + 2);

  // Remove Codex footer from body
  const body = rawBodyPart.replace(CODEX_FOOTER_PATTERN, "").trim();

  // Strip an outer `**...**` wrapper (TY-275 #6 follow-up, Codex r3257480247):
  // fully-bold headings like `**P2 Memory leak in parser**` would otherwise
  // miss STAGE1/STAGE2 after the bracket/bold symmetry tightening and fall
  // through to the P0/P1-only keyword fallback — losing every P2/P3 fully-
  // bold finding at the default threshold.
  const firstLineForBadge = stripOuterBold(firstLine);

  // Attempt Stage 1 match against first line
  const stage1Match = STAGE1_REGEX.exec(firstLineForBadge);
  if (stage1Match) {
    // Groups 1-2 capture severity from `[P0]` vs bare `P0` respectively
    // (mutually exclusive due to the alternation); pick whichever fired.
    const severity = (stage1Match[1] ?? stage1Match[2]) as Severity;
    const title = (stage1Match[3] ?? "").trim();
    // Only accept if the match is not just a keyword buried in prose —
    // stage1 anchors at start so a match here is always a badge prefix.
    // However we must not accept a line like "Some text P0 buried" via stage1
    // because stage1 is anchored with \s* which would skip all leading space
    // but would still require the badge to be the first non-space token.
    return { severity, title: cleanTitle(title), body };
  }

  // Attempt Stage 2 match against first line (Markdown bold variants)
  const stage2Match = STAGE2_REGEX.exec(firstLineForBadge);
  if (stage2Match) {
    // Groups 1-4 each capture the severity from a different bracket/bold shape
    // (mutually exclusive); pick whichever one fired.
    const severity = (stage2Match[1] ?? stage2Match[2] ?? stage2Match[3] ?? stage2Match[4]) as Severity;
    const title = (stage2Match[5] ?? "").trim();
    return { severity, title: cleanTitle(title), body };
  }

  const imageBadgeMatch = IMAGE_BADGE_REGEX.exec(firstLine);
  if (imageBadgeMatch) {
    const severity = imageBadgeMatch[1].toUpperCase() as Severity;
    const title = imageBadgeMatch[2].trim();
    return { severity, title: cleanTitle(title), body };
  }

  // Fallback: search entire stripped text for P0 or P1 keyword
  if (NO_FINDINGS_PATTERN.test(firstLine)) {
    return { severity: null, title: firstLine.trim(), body };
  }
  const fallbackMatch = FALLBACK_KEYWORD_REGEX.exec(stripped);
  if (fallbackMatch) {
    const severity = fallbackMatch[1] as "P0" | "P1";
    // Use first line as title in fallback
    return { severity, title: firstLine.trim(), body };
  }

  // No severity found
  return { severity: null, title: firstLine.trim(), body };
}

function cleanTitle(title: string): string {
  return title
    .trim()
    .replace(/^\*\*/, "")
    .replace(/\*\*$/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .trim();
}
