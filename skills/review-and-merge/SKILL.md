---
name: review-and-merge
description: After the user chooses Start in the talk-first workflow - run the implementer in a worktree, run the tiered reviewers, loop blockers back for at most two fix rounds, report, then merge, open a PR, keep the branch or discard on the user's choice.
---

# Implement, review, merge

## 1. Check the machine

Run `free -h`, `nproc` and `uptime`. If available memory is under about 2 GB, or load is far above the core count, tell the user and wait or run everything one at a time.

## 2. Implementer

Start `talk-first-workflow:implementer` with the Agent tool and `isolation: "worktree"`. The prompt gives:

- the brief (its absolute path if saved, otherwise the full text)
- the memory paths the brief lists
- the current branch name, which is the base for the work
- the base commit, from `git rev-parse HEAD` in the main checkout; the worktree may start from an older remote commit, and the implementer resets to this one

If it comes back blocked with a question, ask the user, then continue the same implementer with SendMessage so it keeps its worktree and context. When it finishes, its report names the worktree path, branch and base commit; you need them for everything below.

## 3. Reviewers

Take the list from the brief's reviewers:

| Reviewer | Agent | Runs |
|---|---|---|
| Brief conformance | `talk-first-workflow:review-conformance` | always |
| Security | `talk-first-workflow:review-security` | always |
| Lint | `talk-first-workflow:review-lint` | always |
| Architecture | `talk-first-workflow:review-architecture` | complexity medium or high |
| Tests | `talk-first-workflow:review-tests` | touches core business logic |

Each reviewer gets the worktree path, the base commit, the brief (its path if saved, otherwise the full text) and the memory paths. The lint reviewer also gets the path of the `project-checks` memory note if one exists.

Start the read-only reviewers (conformance, security, architecture) together in one message. Run lint and then tests one at a time after that, because they run the project's tooling.

Every reviewer ends with `VERDICT: PASS` or `VERDICT: FAIL` and findings marked **blocker**, **should-fix** or **nit**.

## 4. Fix rounds

If any reviewer reports blockers, send all blockers to the same implementer with SendMessage, then rerun only the reviewers that failed. After two fix rounds with blockers still open, stop and ask the user what to do.

## 5. Report and decide

Give the user a short report: what was built, the Done-when check results, each reviewer's verdict, remaining should-fix items and nits (with `file:line`), and the branch name. Then ask with AskUserQuestion:

- **Merge locally**: from the main checkout, confirm the working tree is clean, then `git merge --no-ff <branch>` into the current branch. If the merge conflicts, run `git merge --abort`, tell the user, and offer to have the implementer rebase its branch onto the current branch. After a clean merge, remove the worktree and delete the branch.
- **Open a PR**: remove the worktree, rename the branch to a short kebab-case name from the plan title (`git branch -m <branch> <name>`), `git push -u origin <name>`, then `gh pr create --base <base branch> --body-file <file>`. Write the title and body in plain English: the goal, what changed, the Done-when results and the reviewer verdicts. One paragraph per line, no hard wrapping. Leave local paths (home, /tmp, memory) and unfixed security findings out of the body. Give the user the PR link. Offer this option only when `git remote` lists a remote and `gh auth status` succeeds; otherwise leave it out.
- **Keep the branch**: remove the worktree, rename the branch the same way, and tell the user the branch name.
- **Discard**: remove the worktree and branch, then ask whether to retry. A retry means: talk with the user about what went wrong, save the reason to memory, revise the plan, and go back to the start gate.
- **Look first**: run the Hub command from the session context with `open worktree <worktree path> --base <base commit>` so the diff opens in the browser, and give the worktree path and branch (if the hub can't run, give its one-line error with the path and branch). Wait until the user says they are done looking, then ask this question again.

AskUserQuestion shows at most four options. When Open a PR is offered, leave **Keep the branch** off the buttons; the user can still choose it in the free-text reply.

These git commands are the user's explicit choice, so they are allowed despite talk mode. Push only when the user picks Open a PR.

## 6. Remember

Save anything worth keeping through `talk-first-workflow:save-memory`: decisions made during implementation, why a retry was needed, and, if the lint reviewer discovered the project's check commands, a `project-checks` reference note listing them.
