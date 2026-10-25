# talk-first-workflow

A Claude Code plugin for talk-first AI development. You talk with the main session, and it only talks back. When you agree on a plan and say start, sub-agents build the change in their own git worktrees, expert reviewers check it, and you decide what happens to it. The point is that nothing gets built before you and the agent agree on what to build, and nothing lands without review and your say.

**Status:** early (0.x), so expect changes between versions. Works on macOS and Linux. Windows is not supported.

## Install

```
/plugin marketplace add sushanpth/talk-first-workflow
/plugin install talk-first-workflow@talk-first-workflow
```

Restart Claude Code after installing. The first session in each repo asks where to keep that project's memory. Requires Claude Code, Python 3 and Node.js with `npx`; the optional hub also needs Node.js 22.18 or newer and pnpm. See [docs/install.md](docs/install.md) for the browser download, updating, turning it off and uninstalling.

## Hub commands

The agent opens the hub for you when you choose **Open the plan** or **Look first**. To open it yourself, run these from the plugin folder:

```
node hub/cli.ts open                         # the current repo's project page
node hub/cli.ts open plan <path>             # also: note <path>, doc <repo> <path>, worktree <path> [--base <sha>], project <repo>
node hub/cli.ts open --print-url ...         # print the URL instead of opening a browser
node hub/cli.ts restart                      # stop the running hub and start this plugin's version, without a browser
node hub/cli.ts stop
```

See [docs/hub.md](docs/hub.md) for what it shows, the build cache, the port and the security model.

## How it works

You don't run commands or remember steps. The main session follows the workflow by itself and asks you only when a decision is yours.

1. **Talk.** You discuss the problem. The main session reads, searches and explains, but doesn't edit your files.
2. **Plan.** When the talk turns into a change, it restates the task, settles open questions and shows a plan in plain English.
3. **Start.** Nothing is built until you choose to start. You can save the plan to memory first, or open it in the hub.
4. **Implement.** An implementer agent builds the change on its own branch in its own git worktree, test first, and runs the plan's checks.
5. **Review.** Reviewer agents check the result. Blockers go back to the implementer for up to two fix rounds.
6. **You decide.** Merge locally, open a PR, keep the branch or discard it. You can look at the diff in the hub first.

## Architecture

```mermaid
flowchart TB
    subgraph CC[Claude Code]
        Main[Main session]
        Skills[Skills: workflow steps]
        Agents[Agents: implementer, reviewers]
        Hooks[Hooks: session start, memory write check]
        Browser[Bundled Playwright browser]
    end
    Worktrees[Git worktrees]
    MemPy[scripts/memory.py]
    Memory[(Memory folder: notes and briefs)]
    Hub["Hub: cli.ts → Hono server → React app"]
    Transcripts[(Claude Code transcripts)]

    Main -- loads --> Skills
    Main -- starts --> Agents
    Main -- uses --> Browser
    Main -- opens --> Hub
    Main -- writes notes, built-in auto memory --> Memory
    Agents -- build in --> Worktrees
    Hooks -- check note writes --> MemPy
    MemPy -- setup, search --> Memory
    Hub -- reads memory via --> MemPy
    Hub -- git diffs --> Worktrees
    Hub -- agent labels --> Transcripts
```

- **Hooks** load the workflow and the project's memory status at session start, and block malformed memory notes before every file write.
- **Skills** hold each workflow step. The main session loads them when it needs them.
- **Agents** do the building and reviewing, each as a separate Claude Code sub-agent.
- **`scripts/memory.py`** handles memory setup, the note format check, search and JSON for the hub, using the Python standard library only. The main session writes the notes itself under Claude Code's built-in memory rules.
- **The memory folder** is `~/memory/<project>/` by default, with saved plans in `briefs/`.
- **The hub** is a small local web app: `hub/cli.ts` starts a Hono server, which serves a React app.

## Features

- **Talk-only main agent.** It reads, searches, explains and discusses, but doesn't edit project files unless you ask. [Workflow](docs/workflow.md)
- **Per-project memory.** Claude Code's own memory system, moved to a folder per project, in the native note format. [Memory](docs/memory.md)
- **Memory write check.** A hook blocks malformed notes. [Memory](docs/memory.md#memory-write-check)
- **Start gate.** Nothing is built until you choose to start, and the plan can be saved first. [Workflow](docs/workflow.md#start-gate-and-saved-briefs)
- **Implementer.** An agent builds the change test first in its own git worktree and never pushes. [Workflow](docs/workflow.md#implementer)
- **Parallel tracks.** Independent parts of a plan are built at the same time and merged by an integration step. [Workflow](docs/workflow.md#parallel-tracks)
- **Branch names.** Each branch is named from the plan, such as `tf/hub-launcher-fix`. [Workflow](docs/workflow.md#branch-names)
- **Reviewers.** Conformance, security and lint always run; architecture and test reviews run when the change calls for them. [Workflow](docs/workflow.md#reviewers)
- **Fix rounds.** Blockers go back to the implementer for up to two rounds. [Workflow](docs/workflow.md#fix-rounds)
- **Merge options.** Merge locally, open a PR, keep the branch, discard or look first. [Workflow](docs/workflow.md#merge-options)
- **Browsing.** WebFetch, a bundled headless browser, and Claude in Chrome for signed-in sites. [Browsing](docs/browsing.md)
- **Hub.** A local web page for each project's plans, memory notes, docs, worktree diffs and code. [Hub](docs/hub.md)
- **Hub Notes.** Your own markdown notes with links, tags and folders, stored in the browser. [Notes](docs/hub.md#notes)

## Documentation

- [Install](docs/install.md): requirements, install, update, turn off and uninstall
- [Workflow](docs/workflow.md): the steps, start gate, implementer, tracks, reviewers, merge options and agent models
- [Memory](docs/memory.md): note format, folder layout, settings and the `memory.py` CLI
- [Hub](docs/hub.md): pages, Notes, launcher commands, port and security model
- [Browsing](docs/browsing.md): how the agent reads and drives web pages
- [Privacy](docs/privacy.md): what stays on your machine and what uses the network
- [Limitations](docs/limitations.md): known limits and good-to-know notes
- [Contributing](docs/contributing.md): local runs, checks, version bumps and repo layout

## Contributing

Issues and pull requests are welcome. If something breaks or reads unclearly, [open an issue](https://github.com/sushanpth/talk-first-workflow/issues). See [docs/contributing.md](docs/contributing.md) for how to run and check local changes.

## Credits

Inspired by Carlos Kelkboom's workflow on the Beyond Coding podcast: [Lead Architect Reveals His Rules for Coding Agents](https://podcasts.apple.com/nz/podcast/lead-architect-reveals-his-rules-for-coding-agents/id1572440477?i=1000796296724).

## License

MIT, see [LICENSE](LICENSE).
