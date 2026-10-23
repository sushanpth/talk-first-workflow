# talk-first-workflow

A Claude Code plugin for talk-first AI development. The main session only talks; changes are built by sub-agents after you agree to a written brief, and every change is reviewed by expert sub-agents before you decide to merge.

Inspired by Carlos Kelkboom's workflow on the Beyond Coding podcast ("Lead Architect Reveals His Rules for Coding Agents").

## What it does

You don't run any commands or remember any steps. The main session follows the workflow by itself and asks you only when a decision is yours.

1. **Talk-only main agent.** It reads, searches, explains and discusses, but doesn't edit project files unless you explicitly ask for a direct edit. This is a soft rule (instructions, not a hard block).
2. **Per-project memory.** Claude Code's own memory system, redirected to `~/memory/<project>/` (or `<repo>/.memory/` for repos where you want notes committed). Notes keep the native format, with `**Why:**`, `**How to apply:**`, `**Where:**` pointers and `[[links]]`.
3. **Memory write check.** A hook blocks malformed notes (bad frontmatter, missing `**Why:**`, overlong description). Before writing, a Haiku sub-agent compares the note with the most similar existing notes and rejects duplicates, contradictions and vague notes. If that sub-agent can't be reached, the note is written with the format check only.
4. **Start gate.** When a conversation turns into a change, the agent restates the task, writes a brief to `<memory>/briefs/`, asks any open questions, then asks whether to start. Nothing is built until you choose Start.
5. **Browsing.** WebFetch and WebSearch for plain reading, and Claude in Chrome for JavaScript-heavy pages, signed-in sites, click-through flows and checking your own app. It checks RAM and CPU first and closes its tabs when done.
6. **Implementer and tiered review.** An Opus implementer works in its own git worktree. Brief conformance, security and lint reviews always run; architecture review runs for medium and high complexity; test review runs when core business logic changes. Blockers go back to the implementer for up to two fix rounds. Then you choose merge, look first, retry from scratch, or discard. It never pushes.

## Install

Requires Claude Code and Python 3 (standard library only).

```
/plugin marketplace add <git url of this repo>
/plugin install talk-first-workflow@talk-first-workflow
```

A local clone works too: `/plugin marketplace add ~/projects/personal/talk-first-workflow`.

Restart Claude Code after installing. The first session in each repo asks where to keep that project's memory.

**Update:** `/plugin marketplace update talk-first-workflow`, then restart.

**Turn off:** `/plugin disable talk-first-workflow` (or disable it per project in that project's settings).

## Memory layout

```
~/memory/
├── .skipped                 # repos where you chose not to use memory
└── <project>/
    ├── .source              # the repo this folder belongs to
    ├── MEMORY.md            # index: one short line per note, loaded every session
    ├── <note>.md            # one fact per note
    └── briefs/              # agreed briefs, not indexed
```

Setup writes `autoMemoryDirectory` to the repo's `.claude/settings.local.json`, which is gitignored (setup adds it to `.git/info/exclude` if needed). Claude Code ignores that setting in a committed `.claude/settings.json`, so a repo can't redirect your memory. Worktrees and subfolders of a repo share the repo's memory folder. Two repos with the same folder name get `<parent>-<name>`.

Set `TALK_FIRST_MEMORY_ROOT` to use a root other than `~/memory`.

The memory tool also works from a terminal:

```
python3 scripts/memory.py status
python3 scripts/memory.py search session cookies
python3 scripts/memory.py check path/to/note.md
```

## Team notes

- Memory is per machine and per person unless a repo uses `.memory/` and commits it.
- Plugins that inject "always invoke a skill first" rules at session start (such as superpowers) pull the main session out of talk mode. Disable them while using this plugin; the implementer already follows test-first and root-cause-first rules.
- The plugin applies to every session once enabled. Teammates who want it for some repos only can disable it globally and enable it in those projects.
- Agent models: implementer and security reviewer use Opus, conformance, architecture and test reviewers use Sonnet, lint reviewer and memory reviewer use Haiku. Edit the `model:` line in `agents/*.md` to change them.

## Development

```
python3 -m pytest -q                         # unit and hook tests
claude plugin validate .                     # manifest check
claude --plugin-dir ~/projects/personal/talk-first-workflow   # try local changes without installing
```

Layout: `hooks/` (session start, memory write check), `skills/` (workflow steps the agent loads itself), `agents/` (implementer and reviewers), `scripts/memory.py` (setup, check, similar, search), `tests/`.
