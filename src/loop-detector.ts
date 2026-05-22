import { computeFindingsHash } from "./findings-hash.js";
import type { Finding, FindingsHashEntry } from "./types.js";

/**
 * Tier-aware loop detection (TY-243).
 *
 * - A match against a non-last history entry is treated as oscillation
 *   (e.g. A → B → A) and reported as a real loop.
 * - A match against only the last entry is an escalation opportunity when
 *   that entry was repaired at the base tier (Sonnet): `isLoop` returns
 *   `false` so the next iteration can retry with the escalated tier.
 * - A match against the last entry whose tier is `"escalated"` (or missing,
 *   for state predating this feature) is a real loop and reported as such.
 *
 * Detectable cycle length is bounded by `MAX_HISTORY_ENTRIES` in
 * `state-manager.ts` (TY-296): a cycle of length `n` is only caught when
 * history retains all `n` prior hashes at the moment the cycle closes.
 * Cycles longer than the cap fall through to `max_iterations` instead of
 * `loop_detected`.
 */
export function isLoop(
  currentFindings: Finding[],
  findingsHashHistory: FindingsHashEntry[],
): boolean {
  if (findingsHashHistory.length === 0) {
    return false;
  }

  const currentHash = computeFindingsHash(currentFindings);
  const lastIndex = findingsHashHistory.length - 1;
  const lastEntry = findingsHashHistory[lastIndex];

  for (let i = 0; i < lastIndex; i += 1) {
    if (findingsHashHistory[i].hash === currentHash) {
      return true;
    }
  }

  if (lastEntry.hash !== currentHash) {
    return false;
  }

  const lastTier = lastEntry.modelTier ?? "escalated";
  return lastTier !== "base";
}
