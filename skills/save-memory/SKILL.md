---
name: save-memory
description: How the talk-first main agent saves a memory note - draft in the native note format, run the format check, have the Haiku memory-reviewer check it against similar notes, then write it and tell the user in one line. Use whenever a decision, preference, lesson or durable project fact should be remembered.
---

# Saving a memory note

Memory is Claude Code's own memory system pointed at this project's memory folder (the folder named in the session context). Keep its native format and index; this skill adds a format check and a review.

## 1. Draft

One fact per note, using the native frontmatter:

```markdown
---
name: kebab-case-slug
description: one line, 150 characters or fewer, used to decide relevance later
metadata:
  type: user | feedback | project | reference
---

The fact.

**Why:** the reason (required for project and feedback notes)
**How to apply:** when this matters
**Where:** src/path.ts · commit abc1234 · https://...   (pointers for deeper reading, when there are any)
Related: [[other-note]]
```

Decisions about the project are `project`; the user's preferences are `user` or `feedback`; external resources are `reference`. If an existing note already covers it, update that note instead of writing a new one. Briefs are not memory notes.

## 2. Check

Pipe the draft to the memory tool's `check -` with a heredoc and fix anything it reports. Don't write draft files anywhere. The same check runs as a hook on Write and Edit in the memory folder.

## 3. Review

Pipe the draft to the memory tool's `similar -` to get the closest existing notes. Then start the `talk-first-workflow:memory-reviewer` sub-agent with the full draft text in its prompt and those notes' paths. It answers PASS or FAIL with a reason.

- **FAIL**: revise the draft (merge into the duplicate, resolve the contradiction, make it specific) or drop it if it isn't worth keeping.
- **The reviewer call errors** (network error, usage limit): skip the review, write the note with the format check only, and say so in your one-line report.

## 4. Write and report

Write the note with the Write tool, or change an existing one with Edit, never with a shell command, so the format-check hook runs. Then add or update its one-line pointer in the folder's `MEMORY.md`: `- [Title](file.md) — short hook`. Keep index lines short; the whole index loads into every session.

Tell the user in one line, for example: `Saved memory: auth-uses-session-cookies`. Don't ask before saving; if the user says undo, delete the note and its index line.
