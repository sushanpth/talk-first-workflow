---
name: review-and-merge
description: After the user chooses Start in the talk-first workflow - run the implementer in a worktree, run the tiered reviewers, loop blockers back for at most two fix rounds, report, then merge, open a PR, keep the branch or discard on the user's choice.
---

# Implement, review, merge

## 1. Check the machine

Run `free -h`, `nproc` and `uptime`. If available memory is under about 2 GB, or load is far above the core count, tell the user and wait or run everything one at a time.

For parallel tracks, run at most 5 agents at once that build, test or run a browser; read-only agents can go higher. If there are more tracks than that, run them in batches, and start a new batch only when the previous one has finished.

## 2. Implementer

Start `talk-first-workflow:implementer` with the Agent tool and `isolation: "worktree"`. The prompt gives:

- the brief (its absolute path if saved, otherwise the full text)
- the memory paths the brief lists
- the current branch name, which is the base for the work
- the base commit, from `git rev-parse HEAD` in the main checkout; the worktree may start from an older remote commit, and the implementer resets to this one
- a branch name, `tf/<slug>`, where the slug is a short kebab-case name from the plan title; the implementer renames its branch to it

The Agent `description` reads `<role>: <plan title>`, such as `implementer: Task-named branches`; in a parallel run the role is `contract`, the track's name or `integration`.

If it comes back blocked with a question, ask the user, then continue the same implementer with SendMessage so it keeps its worktree and context. When it finishes, its report names the worktree path, branch and base commit; you need them for everything below.

If the brief's Tracks is "none", that is all. Otherwise start each implementer as above, and have its prompt also name its role (contract, track or integration), the files it owns and its checks. The branch names are `tf/<slug>-contract` for the contract, `tf/<slug>-<track>` for each track and `tf/<slug>` for Integration. Run them in this order:

1. **Contract**, if there is one, from the main checkout's base commit. Its last commit (`git rev-parse HEAD` in its worktree) is where the tracks start.
2. **Tracks**: start every track implementer in one message, each with `isolation: "worktree"` and, as its base commit, the contract's last commit (or the main checkout's base commit when there is no contract). A track's prompt doesn't include other tracks' reports.
3. A contract or track agent that needs a file it doesn't own reports `STATUS: BLOCKED` with a question. Ask the user, then continue that agent with SendMessage. Finished tracks wait; go on only when every track is DONE.
4. **Integration**: start one more implementer from the main checkout's base commit, with the Contract branch (if any) and each track's branch, taken from that agent's report. It merges them all, so its diff against that base holds the contract and every track. Its worktree, branch and base commit are what the reviewers, the report, Look first and the final decision use.

## 3. Reviewers

Take the list from the brief's reviewers:

| Reviewer | Agent | Runs |
|---|---|---|
| Brief conformance | `talk-first-workflow:review-conformance` | always |
| Security | `talk-first-workflow:review-security` | always |
| Lint | `talk-first-workflow:review-lint` | always |
| Architecture | `talk-first-workflow:review-architecture` | complexity medium or high |
| Tests | `talk-first-workflow:review-tests` | touches core business logic |

Each reviewer gets the worktree path, the base commit (always the main checkout's original one, including in a parallel run), the brief (its path if saved, otherwise the full text) and the memory paths. The lint reviewer also gets the path of the `project-checks` memory note if one exists.

Start the read-only reviewers (conformance, security, architecture) together in one message. Run lint and then tests one at a time after that, because they run the project's tooling.

Every reviewer ends with `VERDICT: PASS` or `VERDICT: FAIL` and findings marked **blocker**, **should-fix** or **nit**.

## 4. Fix rounds

If any reviewer reports blockers, send all blockers to the same implementer with SendMessage (in a parallel run, the Integration implementer), then rerun only the reviewers that failed. After two fix rounds with blockers still open, stop and ask the user what to do.

## 5. Report and decide

Give the user a short report: what was built, the Done-when check results, each reviewer's verdict, remaining should-fix items and nits (with `file:line`), and the branch name. Then ask with AskUserQuestion.

In a parallel run, "remove the worktree" in the options below also removes the Contract and track worktrees and branches, before the integration worktree, in this way:

- Remove only worktrees that `git worktree list` shows as this run's agent worktrees, at the paths the agents reported.
- Before deleting each contract or track branch, check `git merge-base --is-ancestor <branch> <integration branch>`.
- Never force-delete: use `git worktree remove` without `--force`, and delete each branch with `git -C <integration worktree> branch -d <branch>`, where it counts as merged.
- If a check or command fails, stop and tell the user.

Options:

- **Merge locally**: from the main checkout, confirm the working tree is clean, then `git merge --no-ff <branch>` into the current branch. If the merge conflicts, run `git merge --abort`, tell the user, and offer to have the implementer rebase its branch onto the current branch. After a clean merge, remove the worktree (and in a parallel run the contract and track ones, as above) and delete the branch.
- **Open a PR**: remove the worktree (and in a parallel run the contract and track ones, as above; only the integration branch is kept), `git push -u origin <branch>`, then `gh pr create --base <base branch> --body-file <file>`. Write the title and body in plain English: the goal, what changed, the Done-when results and the reviewer verdicts. One paragraph per line, no hard wrapping. Leave local paths (home, /tmp, memory) and unfixed security findings out of the body. Give the user the PR link. Offer this option only when `git remote` lists a remote and `gh auth status` succeeds; otherwise leave it out.
- **Keep the branch**: remove the worktree (and in a parallel run the contract and track ones, as above; only the integration branch is kept), and tell the user the branch name.
- **Discard**: remove the worktree (and in a parallel run the contract and track ones, as above) and the branch, name every branch you deleted, then ask whether to retry. A retry means: talk with the user about what went wrong, save the reason to memory, revise the plan, and go back to the start gate.
- **Look first**: give the worktree path, the branch and a command to see the diff: `git -C <worktree path> diff <base commit>...HEAD`. Wait until the user says they are done looking, then ask this question again.
- **Fix should-fix first**: send the remaining should-fix items to the same implementer with SendMessage (in a parallel run, the Integration implementer), rerun the reviewers that raised them, report again, then ask this question again. If the rerun raises blockers, fix them as in step 4; those fix rounds count toward the same two-round limit, so once two rounds have run with blockers still open, stop and ask the user what to do. Offer this option only when should-fix items remain, and at most twice per run.

AskUserQuestion shows at most four options, so choose the buttons on each run:

1. Read the project's `shipping-preference` memory note, if there is one, and the project's CLAUDE.md, to learn how this project ships.
2. Put the preferred finish first, with "(Recommended)" in its label.
3. Next, Fix should-fix first, when it is offered and the project fixes should-fix items before shipping.
4. Next, Look first.
5. Fill any place left with the next likeliest option.

Name every offered option that has no button in the question text, so the user can type it as a reply.

With no note and nothing in CLAUDE.md about shipping, the buttons are Merge locally, Open a PR (when offered), Look first and Keep the branch, with none marked Recommended. After the user chooses a finish, save the `shipping-preference` note if there is none, or update it if the choice differs from it: how the project ships and which option to recommend.

These git commands are the user's explicit choice, so they are allowed despite talk mode. Push only when the user picks Open a PR.

## 6. Remember

Save only what a future session would get wrong without a note: why a retry was needed, and, if the lint reviewer discovered the project's check commands, a `project-checks` reference note listing them.
