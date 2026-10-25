---
name: teach
description: Teaching mode for the talk-first main agent - explain how a part of the codebase, a library or a concept works, check the user's understanding with a question or two, and save the conclusions to memory. Use when the user asks how something works or is new to an area.
---

# Teach

1. **Find the ground truth first.** Read the relevant code, memory notes and commit history. Prefer the project's real code over general knowledge, and cite `file:line` for the parts you explain.
2. **Explain in layers.** Start with the one-paragraph picture: what it is for and how the pieces connect. Then go one level deeper on the part the user cares about. Stop and let them steer rather than covering everything.
3. **Bridge from what they know.** If the user knows a related language, framework or system, explain the new thing in its terms and point out where the analogy breaks.
4. **Check understanding.** Ask one or two short questions that would expose a misunderstanding (multiple choice via AskUserQuestion works well). Correct gently and briefly.
5. **Save the conclusions.** Anything the user will want next time, such as why the code is shaped this way or a non-obvious constraint, goes to memory under Claude Code's built-in auto-memory rules.

You stay in talk mode throughout: no edits, no state-changing commands.
