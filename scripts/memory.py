#!/usr/bin/env python3
"""Memory tool for the talk-first workflow: setup, note checks and search."""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

VALID_TYPES = {"user", "feedback", "project", "reference"}
NEEDS_WHY = {"project", "feedback"}
MAX_DESCRIPTION = 150
INDEX_NAME = "MEMORY.md"
BRIEFS_DIR = "briefs"
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
WORD_RE = re.compile(r"[a-z0-9]{3,}")
STOPWORDS = set(
    "the and for that this with from are was were has have had not but you your our its "
    "use used uses when what why how where which who into than then them they their there "
    "can will should would could does did done all any each also only just more most some "
    "about over under after before because while need needs".split()
)


def memory_root() -> Path:
    return Path(os.environ.get("TALK_FIRST_MEMORY_ROOT", Path.home() / "memory")).expanduser()


def claude_home() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")).expanduser()


def claude_homes() -> list[Path]:
    """CLAUDE_CONFIG_DIR, ~/.claude and every ~/.claude-* with a projects folder."""
    home = Path.home()
    configured = os.environ.get("CLAUDE_CONFIG_DIR")
    extra = sorted(p for p in home.glob(".claude-*") if (p / "projects").is_dir())
    found: list[Path] = []
    seen: set[Path] = set()
    for path in ([Path(configured).expanduser()] if configured else []) + [home / ".claude", *extra]:
        if path.resolve() not in seen:
            seen.add(path.resolve())
            found.append(path)
    return found


def sanitize(path: Path) -> str:
    # Mirrors Claude Code's ~/.claude/projects/<sanitized-cwd> naming.
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def git(cwd: Path, *args: str) -> str | None:
    try:
        out = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def repo_root(cwd: Path) -> tuple[Path, bool]:
    """Main checkout root, so worktrees share their repo's memory. Returns (root, is_git)."""
    common = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if common:
        common_path = Path(common)
        if common_path.name == ".git":
            return common_path.parent, True
        top = git(cwd, "rev-parse", "--show-toplevel")
        if top:
            return Path(top), True
    return cwd.resolve(), False


def read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def configured_dir(root: Path) -> Path | None:
    for settings in (root / ".claude" / "settings.local.json", claude_home() / "settings.json"):
        value = read_json(settings).get("autoMemoryDirectory")
        if value:
            return Path(value).expanduser()
    return None


def skipped_file() -> Path:
    return memory_root() / ".skipped"


def is_skipped(root: Path) -> bool:
    try:
        return str(root) in skipped_file().read_text().splitlines()
    except OSError:
        return False


def project_dir(root: Path) -> Path:
    """~/memory/<repo name>, falling back to <parent>-<name> if another repo already owns that name."""
    base = memory_root()
    for name in (root.name, f"{root.parent.name}-{root.name}"):
        candidate = base / name
        source = candidate / ".source"
        if not candidate.exists() or not source.exists() or source.read_text().strip() == str(root):
            return candidate
    return base / sanitize(root).strip("-")


def legacy_dir(root: Path) -> Path:
    return claude_home() / "projects" / sanitize(root) / "memory"


def transcript_dirs(root: Path) -> list[str]:
    """Claude Code's session folders for this repo, across every config folder."""
    dirs = (home / "projects" / sanitize(root) for home in claude_homes())
    return [str(d) for d in dirs if d.is_dir()]


def note_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(
        p for p in directory.rglob("*.md")
        if p.name != INDEX_NAME and BRIEFS_DIR not in p.relative_to(directory).parts[:-1]
    )


def status(cwd: Path) -> dict:
    root, is_git = repo_root(cwd)
    configured = configured_dir(root)
    legacy = legacy_dir(root)
    # Repos skipped before the default-folder option existed keep Claude's default folder.
    memory_dir = configured or (legacy if is_skipped(root) else project_dir(root))
    index = memory_dir / INDEX_NAME
    index_lines = index.read_text().splitlines() if index.exists() else []
    return {
        "repo_root": str(root),
        "is_git": is_git,
        "configured": configured is not None or memory_dir == legacy,
        "memory_dir": str(memory_dir),
        "in_repo": configured is not None and root in configured.parents,
        "default_folder": memory_dir == legacy,
        "legacy_dir": str(legacy),
        "legacy_count": len(note_files(legacy)),
        "note_count": len(note_files(memory_dir)),
        "index_lines": len([line for line in index_lines if line.strip()]),
        "transcript_dirs": transcript_dirs(root),
    }


def ensure_ignored(root: Path, relative: str) -> None:
    if git(root, "check-ignore", "-q", relative) is not None:
        return
    common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if not common:
        return
    exclude = Path(common) / "info" / "exclude"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    existing = exclude.read_text() if exclude.exists() else ""
    if relative not in existing.splitlines():
        exclude.write_text(existing + ("" if existing.endswith("\n") or not existing else "\n") + relative + "\n")


def migrate(source: Path, dest: Path) -> int:
    copied = 0
    for path in source.rglob("*"):
        if not path.is_file():
            continue
        target = dest / path.relative_to(source)
        if path.name == INDEX_NAME and target.exists():
            have = set(target.read_text().splitlines())
            extra = [line for line in path.read_text().splitlines() if line.strip() and line not in have]
            if extra:
                text = target.read_text()
                target.write_text(text + ("" if text.endswith("\n") or not text else "\n") + "\n".join(extra) + "\n")
            continue
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied += 1
    return copied


def init(cwd: Path, in_repo: bool, do_migrate: bool, default: bool = False) -> dict:
    root, _ = repo_root(cwd)
    if default:
        dest, do_migrate = legacy_dir(root), False
    else:
        dest = root / ".memory" if in_repo else project_dir(root)
    dest.mkdir(parents=True, exist_ok=True)
    if not in_repo and not default:
        (dest / ".source").write_text(str(root) + "\n")

    settings_path = root / ".claude" / "settings.local.json"
    settings = read_json(settings_path)
    settings["autoMemoryDirectory"] = str(dest)
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    ensure_ignored(root, ".claude/settings.local.json")
    # Claude Code creates the implementer's worktrees here.
    ensure_ignored(root, ".claude/worktrees/")

    copied = migrate(legacy_dir(root), dest) if do_migrate and legacy_dir(root).is_dir() else 0
    unskip(root)
    return {"memory_dir": str(dest), "settings": str(settings_path), "migrated": copied}


def unskip(root: Path) -> None:
    if is_skipped(root):
        lines = [line for line in skipped_file().read_text().splitlines() if line != str(root)]
        skipped_file().write_text("".join(line + "\n" for line in lines))


def parse_note(text: str) -> tuple[dict | None, str]:
    """Parses the small frontmatter subset memory notes use: top-level keys plus one nested level."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, text
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return None, text
    meta: dict = {}
    parent = None
    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, _, value = line.strip().partition(":")
        value = value.strip().strip('"').strip("'")
        if line.startswith((" ", "\t")) and parent is not None:
            meta[parent][key.strip()] = value
        else:
            parent = None
            if value:
                meta[key.strip()] = value
            else:
                meta[key.strip()] = {}
                parent = key.strip()
    return meta, "\n".join(lines[end + 1:])


def note_type(meta: dict) -> str | None:
    nested = meta.get("metadata")
    if isinstance(nested, dict) and nested.get("type"):
        return nested["type"]
    value = meta.get("type")
    return value if isinstance(value, str) else None


def check_text(text: str) -> list[str]:
    meta, body = parse_note(text)
    if meta is None:
        return ["Missing frontmatter: the note must start with a '---' block containing name, description and metadata.type."]
    errors = []
    name = meta.get("name")
    if not isinstance(name, str) or not name:
        errors.append("Missing 'name' in frontmatter.")
    elif not NAME_RE.match(name):
        errors.append(f"'name' must be kebab-case (got '{name}').")
    description = meta.get("description")
    if not isinstance(description, str) or not description:
        errors.append("Missing 'description' in frontmatter.")
    elif len(description) > MAX_DESCRIPTION:
        errors.append(f"'description' is {len(description)} chars; keep it to {MAX_DESCRIPTION} or fewer so the index stays small.")
    kind = note_type(meta)
    if kind not in VALID_TYPES:
        errors.append(f"'metadata.type' must be one of {', '.join(sorted(VALID_TYPES))} (got '{kind}').")
    if not body.strip():
        errors.append("The note body is empty.")
    elif kind in NEEDS_WHY and "**Why:**" not in body:
        errors.append(f"A {kind} note needs a '**Why:**' line explaining the reason.")
    return errors


def tokens(text: str) -> list[str]:
    return [w for w in WORD_RE.findall(text.lower()) if w not in STOPWORDS]


def note_terms(path: Path) -> tuple[dict, list[str], set[str]]:
    text = path.read_text(errors="replace")
    meta, body = parse_note(text)
    meta = meta or {}
    header = f"{meta.get('name', path.stem)} {meta.get('description', '')}".replace("-", " ")
    # Header words count double: name and description are the note's own summary.
    return meta, tokens(header) * 2 + tokens(body), set(LINK_RE.findall(body))


def rank(query_terms: list[str], directory: Path, limit: int = 5) -> list[dict]:
    notes = note_files(directory)
    if not notes or not query_terms:
        return []
    parsed = {p: note_terms(p) for p in notes}
    doc_freq: dict[str, int] = {}
    for _, terms, _ in parsed.values():
        for term in set(terms):
            doc_freq[term] = doc_freq.get(term, 0) + 1
    total = len(notes)
    scored = []
    for path, (meta, terms, links) in parsed.items():
        counts: dict[str, int] = {}
        for term in terms:
            counts[term] = counts.get(term, 0) + 1
        score = sum(
            math.log(1 + total / doc_freq[term]) * (1 + math.log(counts[term]))
            for term in set(query_terms) if term in counts
        )
        if score > 0:
            scored.append({
                "path": str(path),
                "name": meta.get("name", path.stem),
                "description": meta.get("description", ""),
                "links": sorted(links),
                "score": round(score, 3),
            })
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]


def notes_by_name(directory: Path) -> dict[str, Path]:
    """Link targets: a note's frontmatter name first, then its file stem."""
    by_name = {}
    for path in note_files(directory):
        meta, _ = parse_note(path.read_text(errors="replace"))
        by_name[(meta or {}).get("name", path.stem)] = path
        by_name.setdefault(path.stem, path)
    return by_name


def search(query: str, directory: Path, limit: int = 5) -> list[dict]:
    results = rank(tokens(query), directory, limit=limit)
    by_name = notes_by_name(directory)
    seen = {r["path"] for r in results}
    for result in list(results):
        for link in result["links"]:
            target = by_name.get(link)
            if target and str(target) not in seen:
                seen.add(str(target))
                meta, _ = parse_note(target.read_text(errors="replace"))
                results.append({
                    "path": str(target),
                    "name": (meta or {}).get("name", target.stem),
                    "description": (meta or {}).get("description", ""),
                    "linked_from": result["name"],
                })
    return results


def resolve_dir(args) -> Path:
    if getattr(args, "dir", None):
        return Path(args.dir).expanduser()
    return Path(status(Path(args.cwd))["memory_dir"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="memory", description=__doc__)
    parser.add_argument("--cwd", default=os.getcwd(), help="project directory (default: current)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="show memory setup for this project")
    p_init = sub.add_parser("init", help="set up memory for this project")
    where = p_init.add_mutually_exclusive_group()
    where.add_argument("--in-repo", action="store_true", help="store notes in <repo>/.memory so they get committed")
    where.add_argument("--default", action="store_true", help="keep notes in Claude's default memory folder")
    p_init.add_argument("--migrate", action="store_true", help="copy notes from Claude's default memory folder")
    p_check = sub.add_parser("check", help="check a note; reads stdin when FILE is '-'")
    p_check.add_argument("file")
    p_search = sub.add_parser("search", help="find notes for a query and follow their links one hop")
    p_search.add_argument("query", nargs="+")
    p_search.add_argument("--dir")
    p_search.add_argument("--limit", type=int, default=5)

    args = parser.parse_args(argv)
    cwd = Path(args.cwd).resolve()

    if args.command == "status":
        result = status(cwd)
    elif args.command == "init":
        if args.default and args.migrate:
            parser.error("--migrate does not apply to --default: the notes are already there")
        result = init(cwd, args.in_repo, args.migrate, args.default)
    elif args.command == "check":
        text = sys.stdin.read() if args.file == "-" else Path(args.file).read_text()
        errors = check_text(text)
        print(json.dumps({"ok": not errors, "errors": errors}, indent=2))
        return 0 if not errors else 1
    else:
        result = search(" ".join(args.query), resolve_dir(args), args.limit)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
