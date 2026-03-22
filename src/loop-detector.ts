import { computeFindingsHash } from "./findings-hash.js";
import type { Finding, FindingsHashEntry } from "./types.js";

export function isLoop(
  currentFindings: Finding[],
  findingsHashHistory: FindingsHashEntry[],
): boolean {
  const currentHash = computeFindingsHash(currentFindings);
  return findingsHashHistory.some((entry) => entry.hash === currentHash);
}
