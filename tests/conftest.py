import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

GIT_ENV = {
    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
    "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
}


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Isolates HOME, the memory root and Claude config dir under tmp_path."""
    memory_root = tmp_path / "memory"
    claude_home = tmp_path / "claude"
    claude_home.mkdir()
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("TALK_FIRST_MEMORY_ROOT", str(memory_root))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(claude_home))
    for key, value in GIT_ENV.items():
        monkeypatch.setenv(key, value)
    return {"memory_root": memory_root, "claude_home": claude_home, "home": home, "tmp": tmp_path}


@pytest.fixture
def repo(env):
    path = env["tmp"] / "work" / "shop"
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=path, check=True)
    (path / "README.md").write_text("shop\n")
    subprocess.run(["git", "add", "."], cwd=path, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=path, check=True)
    return path


def note(name="auth-uses-session-cookies", description="Auth uses server-side session cookies, not JWTs",
         kind="project", body="Sessions live in Redis.\n\n**Why:** we need instant revocation.\n") -> str:
    return f"---\nname: {name}\ndescription: {description}\nmetadata:\n  type: {kind}\n---\n\n{body}"


def run_hook(script: str, payload: dict, env_vars: dict) -> subprocess.CompletedProcess:
    import os
    return subprocess.run(
        [sys.executable, str(ROOT / "hooks" / script)],
        input=json.dumps(payload), capture_output=True, text=True,
        env={**os.environ, **env_vars},
    )
