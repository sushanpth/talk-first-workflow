#!/usr/bin/env python3
"""SessionStart hook: injects the talk-first workflow and this project's memory status."""
import json
import sys
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PLUGIN_ROOT / "scripts"))
import memory  # noqa: E402


def skill_body(name: str) -> str:
    text = (PLUGIN_ROOT / "skills" / name / "SKILL.md").read_text()
    _, body = memory.parse_note(text)
    return body.strip()


def memory_line(info: dict) -> str:
    if info["configured"]:
        line = f"Memory for this project: {info['memory_dir']} ({info['note_count']} notes)."
        if info["index_lines"] > 100:
            line += (
                f" The index has {info['index_lines']} lines; when you next save a note, group related"
                " notes under topic notes so the index lists topics, not every note."
            )
        return line
    if info["skipped"] or not info["is_git"]:
        return "Memory setup: not used for this directory. Do not ask about it."
    legacy = (
        f" Claude's default memory folder for this repo has {info['legacy_count']} notes that can be migrated."
        if info["legacy_count"] else ""
    )
    return (
        "Memory is NOT set up for this project yet." + legacy
        + " Before anything else this session, load the talk-first-workflow:memory-setup skill and ask the user."
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        payload = {}
    cwd = Path(payload.get("cwd") or ".")
    tool = f'python3 "{PLUGIN_ROOT / "scripts" / "memory.py"}"'
    try:
        status_line = memory_line(memory.status(cwd))
    except Exception as exc:
        status_line = f"Memory status unavailable ({exc}); continue without it."

    context = (
        "<talk-first-workflow>\n"
        + skill_body("talk-first")
        + f"\n\n## This session\n\n- Memory tool: `{tool}` (subcommands: status, init, skip, check, similar, search).\n"
        + f"- {status_line}\n"
        + "</talk-first-workflow>"
    )
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": context}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
