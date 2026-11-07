---
name: memory-setup
description: One-time memory setup for a project in the talk-first workflow - asks where to keep notes (~/memory/<project>, the repo's .memory folder or Claude's default folder) and offers to migrate notes from Claude's default memory folder. Use when the session context says memory is not set up.
---

# Memory setup

The memory tool command is given in the session context (`python3 <plugin>/scripts/memory.py`). Run `status` first to see the repo root, the default target and how many notes are in Claude's default folder.

Ask the user once, with AskUserQuestion:

- **Outside the repo (Recommended)**: notes go to `~/memory/<project>/`, nothing lands in the repo.
- **Inside the repo**: notes go to `<repo>/.memory/` and get committed with the code. Suits personal repos.
- **Claude's default folder**: notes stay in `~/.claude/projects/<repo>/memory/`, where Claude Code keeps them by default.

If `legacy_count` is above zero and they chose outside or inside the repo, add a second question in the same AskUserQuestion call: copy the existing notes from Claude's default folder (the originals stay where they are)?

Then run:

```
<memory tool> init [--in-repo | --default] [--migrate]
```

`--migrate` does not go with `--default`; those notes are already in place.

`init` writes `autoMemoryDirectory` to the repo's `.claude/settings.local.json` and makes sure git ignores that file. Tell the user in one or two lines where memory now lives, and that it takes effect from the next session; for the rest of this session, save notes straight to the new folder path that `init` printed.
