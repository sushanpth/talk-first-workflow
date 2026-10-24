# talk-first-workflow

A Claude Code plugin for talk-first AI development. The main session only talks; changes are built by sub-agents after you agree to a written brief, and every change is reviewed by expert sub-agents before you decide to merge.

Inspired by Carlos Kelkboom's workflow on the Beyond Coding podcast ("Lead Architect Reveals His Rules for Coding Agents").

## What it does

You don't run any commands or remember any steps. The main session follows the workflow by itself and asks you only when a decision is yours.

1. **Talk-only main agent.** It reads, searches, explains and discusses, but doesn't edit project files unless you explicitly ask for a direct edit. This is a soft rule (instructions, not a hard block).
2. **Per-project memory.** Claude Code's own memory system, redirected to `~/memory/<project>/` (or `<repo>/.memory/` for repos where you want notes committed). Notes keep the native format, with `**Why:**`, `**How to apply:**`, `**Where:**` pointers and `[[links]]`.
3. **Memory write check.** A hook blocks malformed notes (bad frontmatter, missing `**Why:**`, overlong description). Before writing, a Haiku sub-agent compares the note with the most similar existing notes and rejects duplicates, contradictions and vague notes. If that sub-agent can't be reached, the note is written with the format check only.
4. **Start gate.** When a conversation turns into a change, the agent restates the task, settles open questions in chat and shows the plan in plain English. Then it asks whether to start, with the option to save the plan to `<memory>/briefs/` first (recommended for medium and high complexity, skipped for small fixes), or to open the plan in the hub. Nothing is built until you choose to start.
5. **Browsing.** WebFetch and WebSearch for plain reading. A bundled Playwright MCP server starts its own headless Chromium when a page needs JavaScript, clicking, screenshots or checking your own app; it keeps its profile in memory and shuts down after 10 idle minutes. Claude in Chrome is used for sites where you are signed in or when you want to watch. It checks RAM and CPU first and closes what it opens.
6. **Implementer and tiered review.** An Opus implementer works in its own git worktree. When the plan splits into independent tracks, an optional contract step fixes shared types or file layout first, a parallel implementer builds each track in its own worktree, and an integration implementer merges the tracks and runs the full checks; the reviews then run once, on the combined result. Each implementer's branch is named from the plan, such as `tf/hub-launcher-fix` (in a parallel run, `tf/<slug>-<track>` for each track and `tf/<slug>` for the integration). Brief conformance, security and lint reviews always run; architecture review runs for medium and high complexity; test review runs when core business logic changes. Blockers go back to the implementer for up to two fix rounds. Then you choose how to finish: merge locally, open a PR (offered when the repo has a remote and `gh` is signed in), keep the branch without merging, fix the remaining should-fix items first, discard (with an option to retry), or look at the diff in the hub first. The buttons adapt to how the project ships, which is kept in a `shipping-preference` memory note, and the rest can be typed as a reply. It pushes only when you open a PR.
7. **Hub.** A local web page for each project's saved plans, memory notes, markdown docs and worktree diffs. See [Hub](#hub).

## Install

Requires Claude Code, Python 3 (standard library only) and Node.js with `npx` (for the bundled browser). The optional hub also needs Node.js 22.18+ and pnpm. Install the browser build once, about 400 MB:

```
npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing
```

If you skip this, the agent asks before downloading it the first time it needs the browser.

```
/plugin marketplace add sushanpth/talk-first-workflow
/plugin install talk-first-workflow@talk-first-workflow
```

The full URL (`https://github.com/sushanpth/talk-first-workflow.git`) or a path to a local clone works too.

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
    └── briefs/              # saved briefs, not indexed
```

Setup writes `autoMemoryDirectory` to the repo's `.claude/settings.local.json`, which is gitignored (setup adds it to `.git/info/exclude` if needed). Claude Code ignores that setting in a committed `.claude/settings.json`, so a repo can't redirect your memory. Worktrees and subfolders of a repo share the repo's memory folder. Two repos with the same folder name get `<parent>-<name>`.

Set `TALK_FIRST_MEMORY_ROOT` to use a root other than `~/memory`.

The memory tool also works from a terminal:

```
python3 scripts/memory.py status
python3 scripts/memory.py search session cookies
python3 scripts/memory.py check path/to/note.md
```

## Hub

The hub is a read-only web UI on your machine. It shows, per project:

- **Plans**: the briefs saved in `<memory>/briefs/`.
- **Memory**: every note and the `MEMORY.md` index. `[[links]]` are clickable and each note lists its backlinks.
- **Docs**: the repo's tracked `*.md` files.
- **Worktrees**: each linked worktree's changed files against its base (by default the merge-base with the main checkout's branch), in a side-by-side or inline diff. A worktree made by an agent is titled with the agent's task, with its branch, agent type and a link to its plan.

Every page has its own URL. The agent opens it for you at two moments: **Open the plan** at the start gate, and **Look first** after review. You can also open it yourself:

```
node hub/cli.ts open                         # the current repo's project page
node hub/cli.ts open plan <path>             # also: note <path>, doc <repo> <path>, worktree <path> [--base <sha>], project <repo>
node hub/cli.ts open --print-url ...         # print the URL instead of opening a browser
node hub/cli.ts stop
```

It needs Node.js 22.18 or newer and pnpm. The first run (and the first run after the plugin updates) runs `pnpm install --frozen-lockfile` and builds the UI into `~/.cache/talk-first-workflow/hub/dist`, which takes a few seconds. The server starts in the background, is reused by later commands, and exits after 30 idle minutes.

Security model:

- It listens on 127.0.0.1 only, on a random free port.
- The URL it opens carries a random token. The server swaps it for an HttpOnly, SameSite=Strict cookie, and every API call needs that cookie or the token.
- Requests whose Host header isn't `127.0.0.1:<port>` or `localhost:<port>` are refused, which blocks DNS-rebinding attacks. It sends no CORS headers.
- It only reads files inside the projects' repos and memory folders, using real paths so symlinks and `..` can't escape, and it never writes to them. Git and `memory.py` run with argument lists, never through a shell.
- The token is kept in `~/.cache/talk-first-workflow/hub/state.json`, readable only by you.

## Team notes

- Memory is per machine and per person unless a repo uses `.memory/` and commits it.
- Plugins that inject "always invoke a skill first" rules at session start (such as superpowers) pull the main session out of talk mode. Disable them while using this plugin; the implementer already follows test-first and root-cause-first rules.
- The plugin applies to every session once enabled. Teammates who want it for some repos only can disable it globally and enable it in those projects.
- Agent models: implementer and security reviewer use Opus, conformance, architecture and test reviewers use Sonnet, lint reviewer and memory reviewer use Haiku. Edit the `model:` line in `agents/*.md` to change them.

## Development

```
python3 -m pytest -q                         # unit and hook tests
claude plugin validate .                     # manifest check
claude --plugin-dir .                        # try local changes without installing
cd hub && pnpm install --frozen-lockfile     # hub dependencies
pnpm typecheck && pnpm lint && pnpm test     # hub checks: tsc, Biome, vitest
pnpm build                                   # hub UI build (the launcher does this itself)
```

Layout: `.mcp.json` (bundled browser server), `hooks/` (session start, memory write check), `skills/` (workflow steps the agent loads itself), `agents/` (implementer and reviewers), `scripts/memory.py` (setup, check, similar, search, and JSON for the hub), `hub/` (the web hub: `cli.ts` launcher, `server/` Hono API, `web/` React UI), `tests/`.
