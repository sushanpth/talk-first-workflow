# Memory

## Per-project memory

The plugin uses Claude Code's own memory system, moved to `~/memory/<project>/` (or `<repo>/.memory/` if you want notes committed). The first session in each repo asks which one to use.

Notes keep the native format, with `**Why:**`, `**How to apply:**` and `**Where:**` lines and `[[links]]` between notes. Saved plans go in `briefs/`.

Memory is per machine. To share notes across machines, use `.memory/` in the repo and commit it.

## Folder layout

```
~/memory/
├── .skipped                 # repos where you chose not to use memory
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

## memory.py

`scripts/memory.py` handles memory setup, the note format check and search. It never writes notes: the main session writes them itself under Claude Code's built-in memory rules, and the write check hook runs `memory.py`'s check on each one. It uses the Python standard library only.

It also works from a terminal:

```
python3 scripts/memory.py status
python3 scripts/memory.py search session cookies
python3 scripts/memory.py check path/to/note.md
```
