# TY-257 Auto Review Push Token Design

## Goal

Allow production repositories with branch protection and required checks to make
auto-fix repair commits with a credential that triggers CI on the repair commit.

## Problem

TY-145 showed that the auto-fix loop can repair and push a same-repository PR
branch, but a repair commit pushed with `GITHUB_TOKEN` does not create the
required GitHub Actions `check` run. In repositories where branch protection
requires that check, the PR stays blocked even after the code is fixed.

## Decision

Add a separate optional push credential:

- input: `auto-review-push-token`
- environment variable / secret: `AUTO_REVIEW_PUSH_TOKEN`

When unset, the loop preserves the current behavior and uses the existing git
remote configuration. When set, post-fix uses the token only for the repair
commit push. The token is masked and is not passed to `claude-code-action`.

## Token Roles

- `GITHUB_TOKEN`: hidden state, PR metadata, comments, artifacts, and default
  GitHub API operations.
- `CODEX_REVIEW_REQUEST_TOKEN`: posting `@codex review` as a Codex-connected
  user. This token must not require push permission.
- `AUTO_REVIEW_PUSH_TOKEN`: repair commit push only. Production can back it
  with a machine-user PAT or a GitHub App installation token.

## Implementation

`Config` carries `autoReviewPushToken`. `src/git.ts` exposes a push helper that
can temporarily set `origin`'s push URL to
`https://x-access-token:<token>@github.com/<owner>/<repo>.git`, run `git push`,
and then clear the temporary push URL. post-fix calls this helper after the
repair commit.

The workflow and composite action surface the new input, and documentation
states that production repositories with required checks should configure
`AUTO_REVIEW_PUSH_TOKEN`.

## Security Constraints

- The token is masked with `core.setSecret`.
- The token is not exposed to the repair agent.
- Fork PR guards remain unchanged; auto-fix still refuses fork PRs before
  checkout and repair execution.
- Existing installations without the new token keep the old behavior.

## Verification

- Unit tests cover config fallback, token selection, push URL setup/cleanup, and
  post-fix passing the token to the push helper.
- Workflow tests cover input wiring.
- `npm run check` must pass before PR creation.
