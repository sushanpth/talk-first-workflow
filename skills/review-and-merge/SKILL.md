---
name: review-and-merge
description: After the user chooses Start in the talk-first workflow - run the implementer in a worktree, run the tiered reviewers, loop blockers back for at most two fix rounds, report, then merge, retry or discard on the user's choice.
---

# Implement, review, merge

## 1. Check the machine

Run `free -h`, `nproc` and `uptime`. If available memory is under about 2 GB, or load is far above the core count, tell the user and wait or run everything one at a time.

## 2. Implementer

Start `talk-first-workflow:implementer` with the Agent tool and `isolation: "worktree"`. The prompt gives:

- the brief's absolute path
- the absolute paths from **Memory to read**
- the current branch name, which is the base for the work

If it comes back blocked with a question, ask the user, then continue the same implementer with SendMessage so it keeps its worktree and context. When it finishes, its report names the worktree path, branch and base commit; you need them for everything below.

## 3. Reviewers

Take the list from the brief's **Reviewers** line:

| Reviewer | Agent | Runs |
|---|---|---|
| Brief conformance | `talk-first-workflow:review-conformance` | always |
| Security | `talk-first-workflow:review-security` | always |
| Lint | `talk-first-workflow:review-lint` | always |
| Architecture | `talk-first-workflow:review-architecture` | complexity medium or high |
| Tests | `talk-first-workflow:review-tests` | touches core business logic |

Each reviewer gets the worktree path, the base commit, the brief path and the memory paths. The lint reviewer also gets the path of the `project-checks` memory note if one exists.

Start the read-only reviewers (conformance, security, architecture) together in one message. Run lint and then tests one at a time after that, because they run the project's tooling.

Every reviewer ends with `VERDICT: PASS` or `VERDICT: FAIL` and findings marked **blocker**, **should-fix** or **nit**.

## 4. Fix rounds

If any reviewer reports blockers, send all blockers to the same implementer with SendMessage, then rerun only the reviewers that failed. After two fix rounds with blockers still open, stop and ask the user what to do.

## 5. Report and decide

Give the user a short report: what was built, the Done-when check results, each reviewer's verdict, remaining should-fix items and nits (with `file:line`), and the branch name. Then ask with AskUserQuestion:

- **Merge**: from the main checkout, confirm the working tree is clean, then `git merge --no-ff <branch>` into the current branch. Never push. If the merge conflicts, run `git merge --abort`, tell the user, and offer to have the implementer rebase its branch onto the current branch. After a clean merge, remove the worktree and delete the branch.
- **I'll look first**: give the worktree path and branch, and wait.
- **Retry from scratch**: remove the worktree and branch, talk with the user about what went wrong, save the reason to memory, revise the brief, and go back to the start gate.
- **Discard**: remove the worktree and branch.

These git commands are the user's explicit choice, so they are allowed despite talk mode.

## 6. Remember

Save anything worth keeping through `talk-first-workflow:save-memory`: decisions made during implementation, why a retry was needed, and, if the lint reviewer discovered the project's check commands, a `project-checks` reference note listing them.
