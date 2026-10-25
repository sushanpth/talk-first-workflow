# Privacy

- Memory notes, saved plans and the hub's build and state stay on your machine. Nothing is uploaded unless you commit a repo's `.memory/` folder yourself.
- The hub is local-only and read-only. It listens on 127.0.0.1 and never changes your files.
- Hub Notes live in your browser's storage (IndexedDB) for the hub's address, not in any file and not on the hub server. They leave the browser only when you export a backup zip; the only thing the Notes page asks the server for is the memory note names of a note's project. See [Hub Notes](hub.md#notes).
- The plugin sends nothing anywhere on its own. What the agents read, including memory notes, reaches the model through Claude Code's normal model calls, the same as any other session.
- Network use you'd expect: `npx` downloads the Playwright browser package, the hub's first build downloads its packages with pnpm, the browser visits the pages the agent opens, and **Open a PR** pushes your branch to your remote and creates the pull request on GitHub with `gh`.
