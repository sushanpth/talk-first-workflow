# Limitations

- The talk-only rule is advisory. It comes from instructions loaded at session start, not from a hard block, so the main session can still edit files if it ignores them.
- Windows is not supported.

## Good to know

- Memory is per machine. To share notes across machines, use `.memory/` in the repo and commit it.
- Plugins that inject "always invoke a skill first" rules at session start (such as superpowers) pull the main session out of talk mode. Disable them while using this plugin; the implementer already follows test-first and root-cause-first rules.
- Once enabled, the plugin applies to every session. To use it in some repos only, disable it globally and enable it in those projects.
- Agent models: the implementer and the security reviewer use Opus; the conformance, architecture and test reviewers use Sonnet; the lint reviewer uses Haiku. Edit the `model:` line in `agents/*.md` to change them.
