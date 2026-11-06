# Install

## Requirements

- Claude Code.
- Python 3, standard library only.
- Node.js with `npx`, for the bundled browser.

macOS and Linux are supported. Windows is not.

## Browser download

Install the browser build once (about 675 MB):

```
npx -y @playwright/mcp@0.0.83 install-browser chromium
```

If you skip this, the agent asks before downloading it the first time it needs the browser. See [Browsing](browsing.md) for how it is used.

## Install the plugin

From inside Claude Code:

```
/plugin marketplace add sushanpth/talk-first-workflow
/plugin install talk-first-workflow@talk-first-workflow
```

The full URL (`https://github.com/sushanpth/talk-first-workflow.git`) or a path to a local clone works too.

Restart Claude Code after installing. The first session in each repo asks where to keep that project's memory. See [Memory](memory.md).

## Update

Run `/plugin marketplace update talk-first-workflow`, then `/plugin update talk-first-workflow@talk-first-workflow`, then restart.

## Turn off

Run `/plugin disable talk-first-workflow`, or disable it for one project in that project's settings.

Once enabled, the plugin applies to every session. To use it in some repos only, disable it globally and enable it in those projects.

## Uninstall

Run `/plugin uninstall talk-first-workflow@talk-first-workflow`, then `/plugin marketplace remove talk-first-workflow` if you also want the marketplace gone.

Your memory folders stay where they are; delete them yourself if you don't want them. A few more things stay behind, which you can delete too:

- the `autoMemoryDirectory` entry in each set-up repo's gitignored `.claude/settings.local.json`
- the browser Playwright downloaded into its own cache: `~/.cache/ms-playwright/` on Linux, `~/Library/Caches/ms-playwright/` on macOS
