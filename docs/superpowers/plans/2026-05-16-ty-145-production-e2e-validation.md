# TY-145 Production E2E Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and document fork PR, branch protection, required checks, and token-permission behavior for the auto-review loop before production migration.

**Architecture:** This task is primarily operational validation plus documentation. The workflow code already contains fork guards; the plan records what was verified in GitHub, what cannot be verified in this private non-Pro repository, and what humans must configure in production.

**Tech Stack:** GitHub Actions, GitHub REST API via `gh`, Linear, Markdown docs.

---

### Task 1: Capture Repository Guard And Permission Baseline

**Files:**
- Read: `.github/workflows/auto-review-init.yml`
- Read: `.github/workflows/auto-review-loop.yml`
- Modify: `docs/operations/security.md`
- Modify: `docs/checklists/production-migration.md`

- [ ] **Step 1: Verify workflow fork guards**

Run:

```bash
sed -n '1,120p' .github/workflows/auto-review-init.yml
sed -n '1,150p' .github/workflows/auto-review-loop.yml
```

Expected:
- Workflow A job `if` requires `github.event.pull_request.head.repo.full_name == github.repository`.
- Workflow B fetches PR data before checkout and errors before checkout if `.head.repo.full_name` is empty or different from `github.repository`.

- [ ] **Step 2: Query repository Actions and branch settings**

Run:

```bash
gh api repos/team-yubune/test-auto-ai-review/actions/permissions/workflow --jq '{default_workflow_permissions, can_approve_pull_request_reviews}'
gh api repos/team-yubune/test-auto-ai-review/actions/variables --jq '.variables | map({name,value,updated_at})'
gh api repos/team-yubune/test-auto-ai-review --jq '{full_name,private,default_branch,permissions,allow_auto_merge,delete_branch_on_merge}'
gh api repos/team-yubune/test-auto-ai-review/branches/main/protection
gh api repos/team-yubune/test-auto-ai-review/rulesets
```

Expected:
- Actions default permission and repository variables are recorded.
- Branch protection/rulesets may return HTTP 403 on private non-Pro repositories; record that as an environment limitation, not as a workflow pass.

### Task 2: Run Fork PR E2E Or Record Human Blocker

**Files:**
- Modify: `docs/operations/security.md`
- Modify: `docs/checklists/production-migration.md`

- [ ] **Step 1: Try to create a fork**

Run:

```bash
gh repo fork team-yubune/test-auto-ai-review --remote=false
```

Expected:
- If allowed, create a disposable fork PR with the `auto-review-fix` label and verify Workflow A/B do not enter the auto-fix path.
- If blocked by GitHub org/private fork policy, record the exact blocker and the manual production validation steps.

- [ ] **Step 2: If fork PR is possible, verify workflow outcomes**

Run:

```bash
gh pr view <fork-pr-number> --json comments,state,headRepositoryOwner,headRefName,baseRefName
gh run list --limit 20 --json databaseId,workflowName,status,conclusion,event,headBranch,displayTitle,url
```

Expected:
- Workflow A is skipped before creating hidden state or posting `@codex review`.
- Workflow B does not checkout, run Claude, or push.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/operations/security.md`
- Modify: `docs/checklists/production-migration.md`
- Create: `docs/operations/production-e2e-validation.md`

- [ ] **Step 1: Add a production E2E validation report**

Add a dated report covering:
- repository settings observed in this repo,
- fork PR validation result or blocker,
- branch protection/rulesets blocker,
- required checks and `CHECK_COMMAND` relationship,
- human checklist for production repositories.

- [ ] **Step 2: Link the report from existing docs**

Update `docs/operations/security.md` and `docs/checklists/production-migration.md` to link to the report and mark only the items actually verified.

### Task 4: Verify, Commit, And Update Linear

**Files:**
- Modify: Linear issue `TY-145`

- [ ] **Step 1: Run verification**

Run:

```bash
npm run check
```

Expected: 26 test files and 336 tests pass.

- [ ] **Step 2: Commit documentation**

Run:

```bash
git add docs/operations/security.md docs/checklists/production-migration.md docs/operations/production-e2e-validation.md docs/superpowers/plans/2026-05-16-ty-145-production-e2e-validation.md
git commit -m "docs: record production e2e validation constraints"
```

- [ ] **Step 3: Update Linear**

Add a Linear comment summarizing verified items and blockers. Keep `TY-145` open if any human production validation remains.
