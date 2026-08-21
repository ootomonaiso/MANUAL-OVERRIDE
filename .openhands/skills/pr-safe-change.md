---
name: pr-safe-change
description: Use when Codex is asked to implement, review, repair, or prepare a pull request. Enforces small scoped changes, test-backed fixes, reviewable diffs, and merge-safety checks. Trigger on requests involving PRs, branches, GitHub pull requests, issue fixes, review comments, or CI-driven code changes.
type: knowledge
version: 1.0
agent: Agents-A1
triggers:
- github
- git
- pr
---

# PR Safe Change


## Prime Directive


Create the smallest reviewable PR that solves the stated issue without weakening existing behavior.


If the requested change is broad, split it into smaller PR-sized units before editing.


## Workflow


1. Identify the exact target issue, PR, bug, or review comment.
2. Inspect existing code, tests, comments, and recent related changes before editing.
3. State the intended scope in one or two sentences.
4. Change only files required for that scope.
5. Add or update tests that would fail before the fix.
6. Run the relevant validation.
7. Before finishing, inspect the diff and reject your own work if it violates the guardrails.
8. Summarize changed files, tests run, and residual risks.
9. When creating a PR, be sure to add the `openhands-review` label.


## Hard Blocks


Block and ask for human confirmation before proceeding if the change would:


- delete or weaken tests
- remove guards, cleanup code, event emits, locks, or invariants
- change public APIs or data formats
- mix unrelated fixes, formatting, refactors, or features
- revert prior fixes
- silence lint, TypeScript, CodeQL, or CI warnings without fixing the cause
- require broad rewrites to solve a narrow bug
- touch security-sensitive behavior without tests


## Diff Rules


Do not include opportunistic cleanup.


Do not reformat files unless formatting is the explicit task.


Do not change generated files unless the generation step is part of the task.


Do not edit snapshots or golden files until implementation behavior is verified.


Prefer adding focused tests over modifying broad E2E flows.


## Test Rules


A PR is not complete unless at least one of these is true:


- a relevant automated test was added or updated
- an existing relevant test failed before the fix and passes after
- the change is docs-only or config-only and that is stated clearly


Never remove a failing test to make CI pass.


If tests cannot be run, state exactly why and what command should be run.


## Review Checklist


Before final output, inspect `git diff` and answer:


- Does every changed file relate to the stated issue?
- Did any test coverage become weaker?
- Did any existing comment explaining an invariant get removed?
- Did any edge case become untested?
- Are there warnings or suspicious unused arguments/imports?
- Would a reviewer understand the root cause from the PR body?


If any answer is bad, fix it before finishing.


## PR Body Format


Use this format:


### Summary
- one or two bullets


### Root Cause
- short explanation


### Fix
- what changed and why


### Tests
- exact commands run


### Risk
- remaining risk or `Low`
