# Memory

## Per-project memory

The plugin uses Claude Code's own memory system. The first session in each repo asks where to keep the notes:

- **Outside the repo** (recommended): `~/memory/<project>/`.
- **Inside the repo**: `<repo>/.memory/`, committed with the code.
- **Claude's default folder**: `~/.claude/projects/<repo>/memory/`, where Claude Code keeps them by default.

Saving notes, search, the write check and saved briefs work the same in all three.

Notes keep the native format, with `**Why:**`, `**How to apply:**` and `**Where:**` lines and `[[links]]` between notes. Saved plans go in `briefs/`.

Memory is per machine. To share notes across machines, use `.memory/` in the repo and commit it.

## Folder layout

```
~/memory/
├── .skipped                 # read only: repos skipped in older versions, which now use Claude's default folder
└── <project>/
    ├── .source              # the repo this folder belongs to
    ├── MEMORY.md            # index: one short line per note, loaded every session
    ├── <note>.md            # one fact per note
    └── briefs/              # saved briefs, not indexed
```

## Settings

Setup writes `autoMemoryDirectory` to the repo's `.claude/settings.local.json`, which is gitignored (setup adds it to `.git/info/exclude` if needed). Claude Code ignores that setting in a committed `.claude/settings.json`, so a repo can't redirect your memory.

Worktrees and subfolders of a repo share the repo's memory folder. Two repos with the same folder name get `<parent>-<name>`.

Set `TALK_FIRST_MEMORY_ROOT` to use a root other than `~/memory`.

## Memory write check

A hook runs before every file write and blocks malformed notes: bad frontmatter, a missing `**Why:**` line or a description that is too long.

## Memory reviewer

Before writing a note, the main session has a Haiku reviewer check the draft against existing notes. It fails:

- state claims (what exists, what's live, what's planned) without an `**As of:** YYYY-MM-DD` line, and progress updates that only matter this week
- facts the code, docs or knowledge base already hold; save a `reference` note pointing there instead
- vague notes, and notes that only matter to the current conversation

When the draft is a newer take on an existing note, the verdict is UPDATE (merge into it) or REPLACE (supersede it). The main session acts on these only for an existing note directly in the memory folder, and never edits or deletes anything outside it. If it's unclear which is right, the main session checks the code and `git log`, or asks you.

When you and a note disagree, the main session trusts neither blindly: it checks the code and `git log` since the note's `**As of:**` date, then fixes the note or shows you the evidence. If that doesn't settle it, it asks you and updates the note.

## memory.py

`scripts/memory.py` handles memory setup, the note format check and search. It never writes notes: the main session writes them itself after the [memory reviewer](#memory-reviewer) checks each draft, and the write check hook runs `memory.py`'s check on each one. It uses the Python standard library only.

It also works from a terminal:

```
python3 scripts/memory.py status
python3 scripts/memory.py search session cookies
python3 scripts/memory.py check path/to/note.md
```
