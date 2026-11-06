# Contributing

Issues and pull requests are welcome. If something breaks or reads unclearly, [open an issue](https://github.com/sushanpth/talk-first-workflow/issues).

## Run local changes

To try local changes without installing, run Claude Code with the plugin folder:

```
claude --plugin-dir .
```

## Checks

Run these before a PR:

```
python3 -m pytest -q                         # unit and hook tests
claude plugin validate .                     # manifest check
```

## Version bump

Bump `version` in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` in each PR, following [Semantic Versioning](https://semver.org). The two must match, because `claude plugin update` only picks up a change when the version goes up. See [CLAUDE.md](../CLAUDE.md) for details.

## Repo layout

- `.mcp.json`: the bundled browser server
- `hooks/`: session start, memory write check
- `skills/`: workflow steps the agent loads itself
- `agents/`: implementer and reviewers
- `scripts/memory.py`: setup, check and search
- `tests/`
- `docs/`: these pages
