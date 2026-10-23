---
name: brief
description: Tell-back, written brief and start gate for the talk-first workflow - restate the task, write the brief to the project's memory briefs folder, resolve open questions, then ask the user whether to start. Use when a conversation has turned into a change to build.
---

# Tell back, brief, start gate

## 1. Tell back

Without being asked, restate in a few lines: the goal, what is out of scope, and the key decisions so far. Ask the user to correct anything wrong. Don't move on until they confirm or correct.

## 2. Write the brief

Write it to `<memory folder>/briefs/YYYY-MM-DD-<slug>.md` (the memory folder is in the session context; create `briefs/` if needed). Briefs are skipped by the memory check and are not added to `MEMORY.md`.

```markdown
# Brief: <title>
Goal:
Out of scope:
Plan: (3–7 bullets: the main steps the implementer will take and the files or areas each touches)
Decisions: (each linked to memory where one exists, e.g. [[auth-uses-session-cookies]])
Done when: (concrete checks: commands, tests, observable behaviour)
Complexity: low | medium | high
Touches core business logic: yes | no
Reviewers: brief-conformance, security, lint   (+ architecture if complexity is medium/high, + tests if core logic)
Memory to read: (absolute paths of the notes the implementer needs)
Open questions:
```

Complexity: **low** is a small change within one module; **medium** spans modules or adds a new component; **high** changes structure, data models or interfaces others depend on. Core business logic is the code that encodes the product's rules (pricing, permissions, calculations, state transitions), as opposed to UI, plumbing or config.

## 3. Resolve open questions

If **Open questions** has anything in it, ask those questions now (AskUserQuestion), update the brief and clear the list. Never ask to start while questions remain.

## 4. Start gate

First print the brief in chat, with its path. If the brief is about 40 lines or less, print it whole. Otherwise print a summary: Goal, Plan, Out of scope, key Decisions, Done when, complexity and reviewers.

Then ask with AskUserQuestion, showing the brief path, complexity and reviewers in the question, for example: "Start implementation? Brief: briefs/2026-10-23-login-2fa.md · complexity medium · reviewers: conformance, security, lint, architecture". Options:

- **Start**: load `talk-first-workflow:review-and-merge` and follow it.
- **Change something**: ask what, update the brief, show it again (whole or summary), ask again.
- **Not yet**: keep talking.

Choosing Start is the only thing that starts implementation.
