---
name: save-memory
description: How the talk-first main agent saves a memory note - draft it, have the memory reviewer check it for stale or copied facts, then write, merge, replace or drop it by the verdict.
---

# Save memory

1. **Draft** the note under Claude Code's built-in auto-memory rules. Add a `**Where:**` line (commit and files) when the fact comes from a commit, and an `**As of:** YYYY-MM-DD` line for any claim about current state.
2. **Review.** Start `talk-first-workflow:memory-reviewer` with the full draft text, the memory folder, the memory tool command and today's date.
3. **Act on the verdict:**
   - PASS: write the note.
   - FAIL: fix the draft as suggested, or drop it. If the fact is owned elsewhere, write a `reference` note pointing there instead.
   - Act on UPDATE or REPLACE only when <note> matches `[A-Za-z0-9._-]+\.md`, doesn't start with `-`, isn't `MEMORY.md` and is an existing file directly in the memory folder. Otherwise treat it as FAIL.
   - UPDATE <note>: Edit that note to merge the draft in; don't write a new one.
   - REPLACE <note>: write the draft, then delete the old note (quote its path) and its `MEMORY.md` line.
   - Reviewer error: write without review and say so in your report.
4. **Write** with Write or Edit, not the shell, so the check hook runs. Every write, edit or delete here stays inside the memory folder. Keep the note's `MEMORY.md` line.
5. **Report** in one line, e.g. `Saved memory: x (replaced y)`. Don't ask first.
