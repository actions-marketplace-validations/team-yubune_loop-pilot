# TY-257 Auto Review Push Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add an optional dedicated push token so auto-fix repair commits can trigger required checks in protected repositories.

**Architecture:** Keep `GITHUB_TOKEN` and `CODEX_REVIEW_REQUEST_TOKEN` roles unchanged. Add `AUTO_REVIEW_PUSH_TOKEN` as a post-fix-only credential used by a git push helper that temporarily sets `origin`'s push URL, pushes, and clears the temporary URL.

**Tech Stack:** TypeScript, GitHub composite actions, Git CLI, Vitest.

---

### Task 1: Config And Token Wiring

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/review-request-token.test.ts`

- [x] **Step 1: Write failing config tests**

Add tests proving `autoReviewPushToken` defaults to `githubToken` when unset and uses `AUTO_REVIEW_PUSH_TOKEN` when set.

- [x] **Step 2: Run targeted tests**

Run: `npx vitest run tests/review-request-token.test.ts`
Expected: FAIL because `Config` has no `autoReviewPushToken`.

- [x] **Step 3: Add config field**

Add `autoReviewPushToken` to `Config`, read `auto-review-push-token` / `AUTO_REVIEW_PUSH_TOKEN`, and default to `githubToken`.

- [x] **Step 4: Re-run targeted tests**

Run: `npx vitest run tests/review-request-token.test.ts`
Expected: PASS.

### Task 2: Git Push Helper

**Files:**
- Modify: `src/git.ts`
- Modify: `tests/git.test.ts`

- [x] **Step 1: Write failing git helper tests**

Add tests for plain `push()` and tokenized `pushWithToken(owner, repo, token)`.

- [x] **Step 2: Run targeted tests**

Run: `npx vitest run tests/git.test.ts`
Expected: FAIL because `pushWithToken` does not exist.

- [x] **Step 3: Implement helper**

Implement `pushWithToken(owner, repo, token)` so an empty token calls `push()`,
and a non-empty token runs:

```bash
git remote set-url --push origin https://x-access-token:<token>@github.com/<owner>/<repo>.git
git push
git remote set-url --delete --push origin https://x-access-token:<token>@github.com/<owner>/<repo>.git
```

- [x] **Step 4: Re-run targeted tests**

Run: `npx vitest run tests/git.test.ts`
Expected: PASS.

### Task 3: Post-Fix Integration

**Files:**
- Modify: `src/main-post-fix.ts`
- Modify: `tests/main-post-fix.test.ts`

- [x] **Step 1: Write failing post-fix tests**

Update the clean-run test to assert the push helper receives owner, repo, and
`autoReviewPushToken`.

- [x] **Step 2: Run targeted tests**

Run: `npx vitest run tests/main-post-fix.test.ts`
Expected: FAIL until post-fix calls the new helper signature.

- [x] **Step 3: Integrate tokenized push**

Mask `autoReviewPushToken` and call `deps.push(config.repoOwner, config.repoName, config.autoReviewPushToken)`.

- [x] **Step 4: Re-run targeted tests**

Run: `npx vitest run tests/main-post-fix.test.ts`
Expected: PASS.

### Task 4: Workflow And Docs

**Files:**
- Modify: `loop/action.yml`
- Modify: `loop/post-fix/action.yml`
- Modify: `.github/workflows/auto-review-loop.yml`
- Modify: `tests/workflow-trigger.test.ts`
- Modify: `docs/architecture/system-overview.md`
- Modify: `docs/architecture/event-design.md`
- Modify: `docs/operations/security.md`
- Modify: `docs/operations/production-e2e-validation.md`
- Modify: `docs/checklists/production-migration.md`

- [x] **Step 1: Write failing workflow tests**

Add assertions that the loop and post-fix actions expose and forward
`auto-review-push-token`.

- [x] **Step 2: Run workflow tests**

Run: `npx vitest run tests/workflow-trigger.test.ts`
Expected: FAIL until YAML wiring exists.

- [x] **Step 3: Wire YAML**

Add `auto-review-push-token` inputs and pass `${{ secrets.AUTO_REVIEW_PUSH_TOKEN }}` from the workflow.

- [x] **Step 4: Update docs**

Document token roles, required scopes, and the TY-145 required-check finding.

- [x] **Step 5: Run full verification**

Run: `npm run check`
Expected: 26 test files and all tests passing.
