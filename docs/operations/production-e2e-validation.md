# Production E2E Validation Notes

This document records the TY-145 production-migration validation performed
against `team-yubune/test-auto-ai-review`.

Validation date: 2026-05-16

## Repository Settings Observed

Repository:

- `full_name`: `team-yubune/test-auto-ai-review`
- `private`: `true`
- `default_branch`: `main`
- Current operator permissions: `admin`, `maintain`, `push`, `triage`, `pull`
- `allow_auto_merge`: `false`
- `delete_branch_on_merge`: `true`

GitHub Actions workflow permission:

```json
{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": false
}
```

Repository variables:

| Variable | Value |
|---|---|
| `AUTO_REVIEW_AUTO_MERGE` | `true` |
| `AUTO_REVIEW_FULL_AUTO` | `true` |
| `CHECK_COMMAND` | `npm run check` |

The repository default workflow permission is read-only, but the workflow files
request the job-level permissions needed by the loop:

- `contents: write`
- `pull-requests: write`
- `issues: write`

The current repository accepts those explicit workflow permissions. This does
not prove that a production organization policy will allow the same elevation;
production must verify this on the target repository.

## Same-Repository PR Validation

The same-repository E2E path was validated with PR #58:

- PR: <https://github.com/team-yubune/test-auto-ai-review/pull/58>
- Auto-fix run: <https://github.com/team-yubune/test-auto-ai-review/actions/runs/25952862118>
- Seed commit: `da7ebb58ef0726e5e5bb0c6b8491abfbad02eab7`
- Auto-fix commit: `e1b1d28ea5af4a071d739b50ea329d4615a36c00`
- Merge commit: `de8c25009f8750f3a2927333d2ad21d402f6192e`

Observed result:

- Codex produced a finding for the seeded regression.
- Workflow B checked out the same-repository PR branch.
- `anthropics/claude-code-action@v1` produced a repair.
- post-fix ran `CHECK_COMMAND`.
- post-fix committed and pushed the repair commit.
- the loop re-requested Codex review.
- Codex returned no major issues.
- the state reached `done / no_findings`.

The final run used:

- `actions/checkout@v5`
- `actions/upload-artifact@v6`

No Node.js 20 action deprecation warning was observed in that run.

## External Fork PR Validation

This repository cannot currently run the external-fork PR E2E because forking is
disabled:

```text
failed to fork: HTTP 403: The repository exists, but forking is disabled.
```

The workflow guard still exists in code:

- Workflow A requires
  `github.event.pull_request.head.repo.full_name == github.repository` in the
  job `if`.
- Workflow B fetches PR data with GitHub API and stops before checkout when
  `.head.repo.full_name` is empty or different from `github.repository`.

What remains for production:

1. Enable or use a repository where external forks are allowed.
2. Create a fork-owned branch with a harmless docs-only change.
3. Open a PR from the fork into the production repository.
4. Add the normal auto-review trigger label or enable the production trigger
   mode being validated.
5. Confirm Workflow A does not create hidden state or post `@codex review`.
6. If a Codex review/comment is manually posted, confirm Workflow B stops before
   `actions/checkout`, `claude-code-action`, and any push-capable step.
7. Close the disposable fork PR without merging.

Acceptance criteria for production:

- no secrets are exposed to the fork run,
- no checkout of fork code occurs in the auto-fix job,
- no Claude repair step runs,
- no commit or push is attempted.

## Branch Protection And Rulesets

This private repository cannot expose branch protection or ruleset data through
the GitHub API in the current plan:

```text
HTTP 403: Upgrade to GitHub Pro or make this repository public to enable this feature.
```

That means this repository cannot prove branch-protection behavior. Production
must verify the target repository directly.

Production validation steps:

1. Open the target repository settings.
2. Identify branch protection rules or repository rulesets that apply to the
   default branch and PR branches.
3. Confirm whether Actions `GITHUB_TOKEN` is allowed to push to the PR branch.
4. Confirm whether required checks include the same command configured as
   `CHECK_COMMAND`.
5. Run a same-repository PR through the loop.
6. Confirm one of the following outcomes:
   - the auto-fix push succeeds and the required checks run on the repair commit,
   - or branch protection blocks the push, in which case production needs a
     documented alternative token or a human-only repair mode.

## Required Checks And `CHECK_COMMAND`

`CHECK_COMMAND` is currently:

```text
npm run check
```

Local verification on 2026-05-16:

```text
26 test files passed
336 tests passed
```

Production guidance:

- Keep repository required checks aligned with `CHECK_COMMAND`.
- If the production repo requires additional CI checks, keep auto-merge disabled
  until those checks report on the repair commit.
- If `CHECK_COMMAND` differs from the required checks, document which signal is
  authoritative for auto-review completion.

## Human-Required Items

The following cannot be completed from this repository as currently configured:

- external fork PR E2E, because forking is disabled;
- branch protection/ruleset validation, because the private repository does not
  expose those APIs on the current GitHub plan;
- production organization policy validation, because org-level token caps are
  specific to the target organization/repository.

Use the steps above on the production target before treating TY-145 as fully
closed.
