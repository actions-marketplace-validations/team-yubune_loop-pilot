import { describe, it, expect } from "vitest";
import codexFixtures from "./fixtures/codex-inline-comments.json";
import {
  SEVERITIES,
  compareSeverity,
  isAtLeastSeverity,
  isSeverity,
  parseSeverity,
} from "../src/severity-parser.js";

describe("parseSeverity", () => {
  // --- Stage 1: bare or bracketed badge ---

  it('parses "P0 Title" → P0, "Title"', () => {
    const result = parseSeverity("P0 Title");
    expect(result.severity).toBe("P0");
    expect(result.title).toBe("Title");
  });

  it('parses "[P1] Title" → P1, "Title"', () => {
    const result = parseSeverity("[P1] Title");
    expect(result.severity).toBe("P1");
    expect(result.title).toBe("Title");
  });

  it('parses "[P0]Title" (no space) → P0, "Title"', () => {
    const result = parseSeverity("[P0]Title");
    expect(result.severity).toBe("P0");
    expect(result.title).toBe("Title");
  });

  it('parses "P2 Low priority" → P2', () => {
    const result = parseSeverity("P2 Low priority");
    expect(result.severity).toBe("P2");
    expect(result.title).toBe("Low priority");
  });

  // --- Stage 2: Markdown bold ---

  it('parses "**P0** Title" → P0, "Title"', () => {
    const result = parseSeverity("**P0** Title");
    expect(result.severity).toBe("P0");
    expect(result.title).toBe("Title");
  });

  it('parses "**[P0]** Title" → P0, "Title"', () => {
    const result = parseSeverity("**[P0]** Title");
    expect(result.severity).toBe("P0");
    expect(result.title).toBe("Title");
  });

  it("rejects mismatched brackets in stage-2 (TY-275 #6)", () => {
    // Before the fix, `[?` and `]?` were independent so `[P2` (opening only)
    // and `P2]` (closing only) both matched. Codex doesn't emit these in
    // practice but a malformed body should NOT be silently classified.
    // Using P2/P3 avoids the FALLBACK_KEYWORD_REGEX which matches bare
    // `P0`/`P1` anywhere as a defensive escalation (intentional).
    const openOnly = parseSeverity("[P2 Title without close");
    expect(openOnly.severity).toBeNull();

    const closeOnly = parseSeverity("P3] Title without open");
    expect(closeOnly.severity).toBeNull();
  });

  it("rejects mismatched markdown bold in stage-2 (TY-275 #6)", () => {
    // Half-bold `**P2 Title` (no closing `**`) must not match. P2 (not P0/P1)
    // bypasses the bare-keyword fallback so we can assert STAGE2 rejection
    // cleanly.
    const result = parseSeverity("**P2 Title without close");
    expect(result.severity).toBeNull();
  });

  it("accepts fully-bold heading `**P2 Title**` (Codex r3257480247 — TY-275 #6 regression fix)", () => {
    // Codex emits fully-bold P2/P3 headings in the wild. TY-275 #6 tightened
    // STAGE2 to require matched bold pairs, which inadvertently dropped this
    // shape (the line as a whole is bold, but the badge isn't separately
    // bold-wrapped). `stripOuterBold` pre-processing restores acceptance
    // without re-introducing the half-bold tolerance.
    const result = parseSeverity("**P2 Memory leak in parser**");
    expect(result.severity).toBe("P2");
    expect(result.title).toBe("Memory leak in parser");
  });

  it("accepts fully-bold heading with bracketed badge `**[P3] Title**` (Codex r3257480247)", () => {
    const result = parseSeverity("**[P3] Minor logging cleanup**");
    expect(result.severity).toBe("P3");
    expect(result.title).toBe("Minor logging cleanup");
  });

  it("still rejects half-bold lines even with the outer-strip helper (Codex r3257480247)", () => {
    // Sanity: the unwrap should NOT trigger for `**P2 Title` (no closing
    // `**`), so the original asymmetry rejection from TY-275 #6 still
    // applies.
    const result = parseSeverity("**P2 Half-bold without close");
    expect(result.severity).toBeNull();
  });

  it("unwraps fully-bold heading even with trailing whitespace (Codex r3258007790)", () => {
    // GitHub Markdown permits trailing spaces in headings (notably for line
    // breaks). `**P2 Title**  ` should still unwrap correctly so the badge
    // matches; otherwise P2/P3 findings with stray trailing whitespace from
    // copy-paste are silently dropped.
    const result = parseSeverity("**P2 Memory leak**   ");
    expect(result.severity).toBe("P2");
    expect(result.title).toBe("Memory leak");
  });

  it("handles trailing CRLF / tabs after the bold wrapper (Codex r3258007790)", () => {
    const result = parseSeverity("**[P3] Trailing CRLF**\r\n");
    expect(result.severity).toBe("P3");
    expect(result.title).toBe("Trailing CRLF");
  });

  it("parses Codex image badge comments including P2", () => {
    const raw =
      "**<sub><sub>![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat)</sub></sub>  Reject soft restart for exhausted/looped states**\n\nThe restart can stop again immediately.\n\nUseful? React with 👍 / 👎.";

    const result = parseSeverity(raw);

    expect(result.severity).toBe("P2");
    expect(result.title).toBe("Reject soft restart for exhausted/looped states");
    expect(result.body).toBe("The restart can stop again immediately.");
  });

  // --- Preprocessing: leading whitespace/newlines ---

  it('strips leading whitespace before matching ("\\n  P0 Title" → P0, "Title")', () => {
    const result = parseSeverity("\n  P0 Title");
    expect(result.severity).toBe("P0");
    expect(result.title).toBe("Title");
  });

  // --- Fallback: P0/P1 keyword anywhere in text ---

  it('finds P0 in middle of text via fallback ("Some text with P0 in the middle" → P0)', () => {
    const result = parseSeverity("Some text with P0 in the middle");
    expect(result.severity).toBe("P0");
    // First line is used as title in fallback
    expect(result.title).toBe("Some text with P0 in the middle");
  });

  it("does not suppress fallback P0/P1 matches when no-findings wording appears only in the body", () => {
    const raw =
      "Review details\n\nThe previous run reported no issues, but this comment flags a P1 regression.";
    const result = parseSeverity(raw);
    expect(result.severity).toBe("P1");
    expect(result.title).toBe("Review details");
  });

  // --- TY-273 #B1: single-severity "No PN findings" forms must not fall
  //                 through to FALLBACK_KEYWORD_REGEX and be reclassified
  //                 as a finding of that severity. ---

  it('TY-273 #B1: "No P0 findings" returns null severity (not P0)', () => {
    const result = parseSeverity("No P0 findings");
    expect(result.severity).toBeNull();
    expect(result.title).toBe("No P0 findings");
  });

  it('TY-273 #B1: "No P1 findings" returns null severity (not P1)', () => {
    const result = parseSeverity("No P1 findings");
    expect(result.severity).toBeNull();
  });

  it('TY-273 #B1: "No P2 findings" returns null severity', () => {
    const result = parseSeverity("No P2 findings");
    expect(result.severity).toBeNull();
  });

  it('TY-273 #B1: "No P0/P1 findings" continues to match (regression guard)', () => {
    const result = parseSeverity("No P0/P1 findings");
    expect(result.severity).toBeNull();
  });

  it('TY-273 #B1: "No P0/P1/P2 findings" matches the extended chain', () => {
    const result = parseSeverity("No P0/P1/P2 findings");
    expect(result.severity).toBeNull();
  });

  it('TY-273 #B1: "No P2/P3 findings" matches the extended chain', () => {
    const result = parseSeverity("No P2/P3 findings");
    expect(result.severity).toBeNull();
  });

  // --- No match ---

  it('returns null severity for "No severity badge at all"', () => {
    const result = parseSeverity("No severity badge at all");
    expect(result.severity).toBeNull();
    expect(result.title).toBe("No severity badge at all");
  });

  // --- Title/body separation at \n\n ---

  it("separates title from body at double newline", () => {
    const raw = "P1 Fix memory leak\n\nThe allocator is never freed after use.";
    const result = parseSeverity(raw);
    expect(result.severity).toBe("P1");
    expect(result.title).toBe("Fix memory leak");
    expect(result.body).toBe("The allocator is never freed after use.");
  });

  it("returns empty string for body when no double newline is present", () => {
    const raw = "P0 Critical issue";
    const result = parseSeverity(raw);
    expect(result.body).toBe("");
  });

  // --- Footer removal ---

  it("strips Codex footer from body", () => {
    const raw =
      "P0 Crash on null input\n\nDereference without nil check.\nUseful? React with 👍 / 👎.";
    const result = parseSeverity(raw);
    expect(result.body).toBe("Dereference without nil check.");
  });

  it("handles body that is only the footer (strips to empty string)", () => {
    const raw = "P0 Title\n\nUseful? React with 👍 / 👎.";
    const result = parseSeverity(raw);
    expect(result.body).toBe("");
  });

  describe("Codex inline comment fixtures", () => {
    for (const fixture of codexFixtures) {
      it(`parses ${fixture.name}`, () => {
        const result = parseSeverity(fixture.body);
        expect(result).toEqual(fixture.expected);
      });
    }
  });

  // --- P3 recognition (TY-256) ---

  describe("P3 recognition (TY-256)", () => {
    it('parses "P3 Title" → P3 via Stage 1', () => {
      const result = parseSeverity("P3 Low-priority hint");
      expect(result.severity).toBe("P3");
      expect(result.title).toBe("Low-priority hint");
    });

    it('parses "[P3] Title" → P3 via Stage 1', () => {
      const result = parseSeverity("[P3] Low-priority hint");
      expect(result.severity).toBe("P3");
      expect(result.title).toBe("Low-priority hint");
    });

    it('parses "**P3** Title" → P3 via Stage 2', () => {
      const result = parseSeverity("**P3** Low-priority hint");
      expect(result.severity).toBe("P3");
      expect(result.title).toBe("Low-priority hint");
    });

    it("parses Codex image badge for P3", () => {
      const raw =
        "**<sub><sub>![P3 Badge](https://img.shields.io/badge/P3-green?style=flat)</sub></sub>  Cosmetic nit**\n\nMinor whitespace issue.\n\nUseful? React with 👍 / 👎.";

      const result = parseSeverity(raw);

      expect(result.severity).toBe("P3");
      expect(result.title).toBe("Cosmetic nit");
      expect(result.body).toBe("Minor whitespace issue.");
    });

    it("does NOT pick up bare P3 keyword via fallback (P0/P1 fallback only)", () => {
      // No explicit badge prefix on the first line, body mentions P3 only.
      // Stage1 would match "Some" as the title with no severity, so we expect null.
      const result = parseSeverity("Some prose\n\nThis discusses P3 issues without a badge.");
      expect(result.severity).toBeNull();
    });

    it("does NOT pick up bare P2 keyword via fallback (P0/P1 fallback only)", () => {
      const result = parseSeverity("Some prose\n\nThis discusses P2 issues without a badge.");
      expect(result.severity).toBeNull();
    });
  });

  // --- Severity helpers (TY-256) ---

  describe("severity helpers (TY-256)", () => {
    it("exposes all four severities in urgency order via SEVERITIES", () => {
      expect(SEVERITIES).toEqual(["P0", "P1", "P2", "P3"]);
    });

    it("isSeverity narrows valid values", () => {
      expect(isSeverity("P0")).toBe(true);
      expect(isSeverity("P3")).toBe(true);
      expect(isSeverity("P4")).toBe(false);
      expect(isSeverity("foo")).toBe(false);
      expect(isSeverity("")).toBe(false);
    });

    it("compareSeverity orders urgency-first (P0 most urgent)", () => {
      expect(compareSeverity("P0", "P1")).toBeLessThan(0);
      expect(compareSeverity("P2", "P0")).toBeGreaterThan(0);
      expect(compareSeverity("P3", "P3")).toBe(0);
    });

    it("isAtLeastSeverity keeps severities at or above the threshold", () => {
      // threshold = P2 (default): P0/P1/P2 in, P3 out
      expect(isAtLeastSeverity("P0", "P2")).toBe(true);
      expect(isAtLeastSeverity("P1", "P2")).toBe(true);
      expect(isAtLeastSeverity("P2", "P2")).toBe(true);
      expect(isAtLeastSeverity("P3", "P2")).toBe(false);

      // threshold = P1: P0/P1 in, P2/P3 out
      expect(isAtLeastSeverity("P0", "P1")).toBe(true);
      expect(isAtLeastSeverity("P2", "P1")).toBe(false);
      expect(isAtLeastSeverity("P3", "P1")).toBe(false);

      // threshold = P0: only P0 in
      expect(isAtLeastSeverity("P0", "P0")).toBe(true);
      expect(isAtLeastSeverity("P1", "P0")).toBe(false);

      // threshold = P3: everything in
      expect(isAtLeastSeverity("P0", "P3")).toBe(true);
      expect(isAtLeastSeverity("P3", "P3")).toBe(true);
    });
  });
});
