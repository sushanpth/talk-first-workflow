# Privacy

- Memory notes and saved plans stay on your machine. Nothing is uploaded unless you commit a repo's `.memory/` folder yourself.
- The plugin sends nothing anywhere on its own. What the agents read, including memory notes, reaches the model through Claude Code's normal model calls, the same as any other session.
- Network use you'd expect: `npx` downloads the Playwright browser package, the browser visits the pages the agent opens, and **Open a PR** pushes your branch to your remote and creates the pull request on GitHub with `gh`.
