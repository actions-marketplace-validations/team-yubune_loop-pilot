import type { Finding } from "./types.js";

export type EscalationReason = "p0_finding" | "previous_check_failure";

export type ModelTier = "override" | "base" | "escalated";

export interface ModelSelectionInput {
  /** Hard override from vars.CLAUDE_CODE_MODEL. Empty string disables override. */
  override: string;
  /** Base tier model (default Sonnet) used when no escalation signal fires. */
  baseModel: string;
  /** Escalated tier model (default Opus) used when an escalation signal fires. */
  escalatedModel: string;
  /** Findings collected for the upcoming iteration. */
  findings: Finding[];
  /** Tail of the previous iteration's CHECK_COMMAND failure, null when none. */
  previousCheckFailure: string | null;
}

export interface ModelSelection {
  model: string;
  tier: ModelTier;
  escalationReasons: EscalationReason[];
}

export function selectModel(input: ModelSelectionInput): ModelSelection {
  if (input.override !== "") {
    return {
      model: input.override,
      tier: "override",
      escalationReasons: [],
    };
  }

  const reasons: EscalationReason[] = [];
  if (input.findings.some((f) => f.severity === "P0")) {
    reasons.push("p0_finding");
  }
  if (input.previousCheckFailure !== null && input.previousCheckFailure !== "") {
    reasons.push("previous_check_failure");
  }

  if (reasons.length > 0) {
    return {
      model: input.escalatedModel,
      tier: "escalated",
      escalationReasons: reasons,
    };
  }

  return {
    model: input.baseModel,
    tier: "base",
    escalationReasons: [],
  };
}
