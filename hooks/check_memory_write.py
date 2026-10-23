#!/usr/bin/env python3
"""PreToolUse gate: blocks Write/Edit of a memory note that fails the format check."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import memory  # noqa: E402


def memory_dirs(cwd: Path) -> list[Path]:
    dirs = [memory.memory_root(), memory.claude_home() / "projects"]
    configured = memory.configured_dir(memory.repo_root(cwd)[0])
    if configured:
        dirs.append(configured)
    return [d.expanduser().resolve() for d in dirs]


def is_memory_note(path: Path, cwd: Path) -> bool:
    if path.suffix != ".md" or path.name == memory.INDEX_NAME:
        return False
    parts = path.parts
    if ".memory" in parts:
        base = Path(*parts[: parts.index(".memory") + 1])
        return memory.BRIEFS_DIR not in path.relative_to(base).parts[:-1]
    for base in memory_dirs(cwd):
        if base == memory.claude_home().expanduser().resolve() / "projects":
            # Claude's default layout: projects/<sanitized-cwd>/memory/<note>.md
            if base in path.parents and "memory" in path.relative_to(base).parts[1:2]:
                return True
            continue
        if base in path.parents:
            return memory.BRIEFS_DIR not in path.relative_to(base).parts[:-1]
    return False


def new_content(tool: str, tool_input: dict, path: Path) -> str | None:
    if tool == "Write":
        return tool_input.get("content", "")
    if not path.exists():
        return None
    text = path.read_text()
    edits = tool_input.get("edits") or [tool_input]
    for edit in edits:
        old, new = edit.get("old_string", ""), edit.get("new_string", "")
        if not old:
            continue
        text = text.replace(old, new) if edit.get("replace_all") else text.replace(old, new, 1)
    return text


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        tool = payload.get("tool_name", "")
        tool_input = payload.get("tool_input") or {}
        if tool not in ("Write", "Edit", "MultiEdit") or not tool_input.get("file_path"):
            return 0
        cwd = Path(payload.get("cwd") or ".")
        path = Path(tool_input["file_path"]).expanduser()
        path = (cwd / path if not path.is_absolute() else path).resolve()
        if not is_memory_note(path, cwd):
            return 0
        text = new_content(tool, tool_input, path)
        if text is None:
            return 0
        errors = memory.check_text(text)
    except Exception:
        # A bug in the gate must never block normal work.
        return 0
    if not errors:
        return 0
    print(
        f"Memory note {path.name} failed the format check:\n- " + "\n- ".join(errors)
        + "\nFix the note and write it again.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
