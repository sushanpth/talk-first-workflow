---
name: brief
description: Tell-back, plan and start gate for the talk-first workflow - restate the task, settle open questions in chat, show the plan in chat, then ask whether to start and whether to save the plan to a file first. Use when a conversation has turned into a change to build.
---

# Tell back, plan, start gate

## 1. Tell back

Without being asked, restate in a few lines: the goal, what is out of scope, and the key decisions so far. Ask the user to correct anything wrong. Don't move on until they confirm or correct.

## 2. Settle open questions

Ask about anything still open with AskUserQuestion, before you show or write a plan. Never show the plan while a major question remains.

## 3. Show the plan

Post the brief in chat, whole. It is the plan the user agrees to, and the text the implementer and reviewers get.

```markdown
# Brief: <title>
Goal:
Plan: (one concrete action per bullet, naming the files)
Out of scope:
Decisions: (each linked to memory where one exists, e.g. [[auth-uses-session-cookies]])
Done when: (concrete checks: commands, tests, observable behaviour)

Complexity: low | medium | high · core logic: yes | no · reviewers: conformance, security, lint (+ architecture if complexity is medium/high, + tests if core logic) · memory to read: (absolute paths of the notes the implementer needs, or "none")
```

Complexity: **low** is a small change within one module; **medium** spans modules or adds a new component; **high** changes structure, data models or interfaces others depend on. Core business logic is the code that encodes the product's rules (pricing, permissions, calculations, state transitions), as opposed to UI, plumbing or config.

### How to write the plan

- Write for a person, not a model. Short sentences, everyday words.
- Name the real files and the behaviour the user will see.
- One concrete action per bullet. Say each thing once; don't restate the goal in every section.
- No filler, hype or hedging. Avoid words like "robust", "seamless", "comprehensive", "leverage", "ensure", "streamline", "enhance" and "it's worth noting".
- If a section has nothing in it, write "none".

## 4. Start gate

Ask one question with AskUserQuestion: "Start implementation?" Put "(Recommended)" on **Save and start** when complexity is medium or high, and on **Start** when it is low. Options:

- **Start**: load `talk-first-workflow:review-and-merge` and follow it. No file is written; the implementer and reviewers get the plan text in their prompts.
- **Save and start**: write the plan to `<memory folder>/briefs/YYYY-MM-DD-<slug>.md` (the memory folder is in the session context; create `briefs/` if needed), then load `talk-first-workflow:review-and-merge` and pass that path. Briefs are skipped by the memory check and are not added to `MEMORY.md`.
- **Open the plan**: write the plan to `<memory folder>/briefs/YYYY-MM-DD-<slug>.md` as in Save and start, run the Hub command from the session context with `open plan <that path>` so it opens in the browser, tell the user, then ask "Start implementation?" again. If the hub can't run (no Node 22.18+ or pnpm), give its one-line error and the file path instead. If the user then chooses Save and start, reuse the file; don't write it twice.
- **Change something**: ask what, update the plan, show it again, ask again.
- **Not yet**: keep talking.

AskUserQuestion shows at most four options, so leave **Not yet** off the buttons; the user can still give that answer in the free-text reply.

Choosing Start (or Save and start) is the only thing that starts implementation.
