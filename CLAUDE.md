# Project rules

## Bump the plugin version before merging or opening a PR

Before merging a branch into master or opening a PR, bump `version` in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. The two must match. `claude plugin update` only picks up a change when the version goes up.

Follow [Semantic Versioning](https://semver.org):

- **Patch** (0.1.0 → 0.1.1): bug fixes and wording fixes that don't change behaviour.
- **Minor** (0.1.0 → 0.2.0): new features or behaviour changes that keep working with existing setups.
- **Major** (0.1.0 → 1.0.0): breaking changes, such as a renamed skill or agent, a changed memory layout, or a removed option.

Bump once per merge or PR, by the largest change in it.

In the talk-first flow the main agent makes this bump. It commits the bump on the branch right before Merge locally or Open a PR. This is allowed despite talk mode, like the git commands at that step.
