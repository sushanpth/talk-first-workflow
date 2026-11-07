import json

import memory
from conftest import note, run_hook

BAD = note(kind="project", body="A fact without a reason.\n")


def hook_env(env):
    return {"TALK_FIRST_MEMORY_ROOT": str(env["memory_root"]), "CLAUDE_CONFIG_DIR": str(env["claude_home"])}


def write(path, content, cwd):
    return {"tool_name": "Write", "tool_input": {"file_path": str(path), "content": content}, "cwd": str(cwd)}


class TestMemoryGate:
    def test_blocks_bad_note_in_memory_root(self, repo, env):
        result = run_hook("check_memory_write.py", write(env["memory_root"] / "shop" / "x.md", BAD, repo), hook_env(env))
        assert result.returncode == 2
        assert "**Why:**" in result.stderr

    def test_allows_good_note(self, repo, env):
        result = run_hook("check_memory_write.py", write(env["memory_root"] / "shop" / "x.md", note(), repo), hook_env(env))
        assert result.returncode == 0

    def test_ignores_non_memory_files(self, repo, env):
        result = run_hook("check_memory_write.py", write(repo / "docs" / "notes.md", BAD, repo), hook_env(env))
        assert result.returncode == 0

    def test_ignores_index_and_briefs(self, repo, env):
        base = env["memory_root"] / "shop"
        for path in (base / "MEMORY.md", base / "briefs" / "2026-10-23-x.md"):
            assert run_hook("check_memory_write.py", write(path, "free text", repo), hook_env(env)).returncode == 0

    def test_in_repo_memory_folder(self, repo, env):
        result = run_hook("check_memory_write.py", write(repo / ".memory" / "x.md", BAD, repo), hook_env(env))
        assert result.returncode == 2
        brief = repo / ".memory" / "briefs" / "b.md"
        assert run_hook("check_memory_write.py", write(brief, "free text", repo), hook_env(env)).returncode == 0

    def test_claude_default_memory_folder(self, repo, env):
        path = env["claude_home"] / "projects" / memory.sanitize(repo) / "memory" / "x.md"
        assert run_hook("check_memory_write.py", write(path, BAD, repo), hook_env(env)).returncode == 2
        other = env["claude_home"] / "projects" / "notes.md"
        assert run_hook("check_memory_write.py", write(other, BAD, repo), hook_env(env)).returncode == 0
        for free in (path.parent / "MEMORY.md", path.parent / "briefs" / "2026-10-23-x.md"):
            assert run_hook("check_memory_write.py", write(free, "free text", repo), hook_env(env)).returncode == 0

    def test_default_folder_configured_by_init(self, repo, env):
        memory.init(repo, in_repo=False, do_migrate=False, default=True)
        path = env["claude_home"] / "projects" / memory.sanitize(repo) / "memory" / "x.md"
        assert run_hook("check_memory_write.py", write(path, BAD, repo), hook_env(env)).returncode == 2
        assert run_hook("check_memory_write.py", write(path, note(), repo), hook_env(env)).returncode == 0
        brief = path.parent / "briefs" / "b.md"
        assert run_hook("check_memory_write.py", write(brief, "free text", repo), hook_env(env)).returncode == 0

    def test_custom_configured_folder(self, repo, env):
        custom = env["tmp"] / "elsewhere"
        (repo / ".claude").mkdir()
        (repo / ".claude" / "settings.local.json").write_text(json.dumps({"autoMemoryDirectory": str(custom)}))
        assert run_hook("check_memory_write.py", write(custom / "x.md", BAD, repo), hook_env(env)).returncode == 2

    def test_edit_checks_resulting_content(self, repo, env):
        path = env["memory_root"] / "shop" / "x.md"
        path.parent.mkdir(parents=True)
        path.write_text(note())
        breaking = {"tool_name": "Edit", "cwd": str(repo), "tool_input": {
            "file_path": str(path), "old_string": "**Why:** we need instant revocation.", "new_string": "",
        }}
        assert run_hook("check_memory_write.py", breaking, hook_env(env)).returncode == 2
        fine = {"tool_name": "Edit", "cwd": str(repo), "tool_input": {
            "file_path": str(path), "old_string": "Redis", "new_string": "Valkey",
        }}
        assert run_hook("check_memory_write.py", fine, hook_env(env)).returncode == 0

    def test_other_tools_and_bad_input_pass(self, repo, env):
        assert run_hook("check_memory_write.py", {"tool_name": "Read", "tool_input": {}}, hook_env(env)).returncode == 0
        result = run_hook("check_memory_write.py", {}, hook_env(env))
        assert result.returncode == 0


class TestSessionStart:
    def context(self, cwd, env):
        result = run_hook("session_start.py", {"cwd": str(cwd), "source": "startup"}, hook_env(env))
        assert result.returncode == 0
        output = json.loads(result.stdout)["hookSpecificOutput"]
        assert output["hookEventName"] == "SessionStart"
        return output["additionalContext"]

    def test_injects_workflow_and_memory_tool(self, repo, env):
        text = self.context(repo, env)
        assert "Rule 1: talk, don't touch" in text
        assert "scripts/memory.py" in text
        assert "name: talk-first" not in text

    def test_injects_project_claude_md_precedence(self, repo, env):
        assert "The project's CLAUDE.md takes precedence over this workflow" in self.context(repo, env)

    def test_has_no_hub_line(self, repo, env):
        text = self.context(repo, env)
        assert not any(line.startswith("- Hub:") for line in text.splitlines())

    def test_lists_memory_subcommands(self, repo, env):
        text = self.context(repo, env)
        tool_line = next(line for line in text.splitlines() if line.startswith("- Memory tool:"))
        assert "(subcommands: status, init, check, search)" in tool_line

    def test_asks_for_setup_in_new_repo(self, repo, env):
        assert "NOT set up" in self.context(repo, env)

    def test_reports_configured_memory(self, repo, env):
        memory.init(repo, in_repo=False, do_migrate=False)
        assert f"Memory for this project: {env['memory_root'] / 'shop'}" in self.context(repo, env)

    def test_large_index_nudge(self, repo, env):
        memory.init(repo, in_repo=False, do_migrate=False)
        (env["memory_root"] / "shop" / "MEMORY.md").write_text("".join(f"- [n{i}](n{i}.md)\n" for i in range(101)))
        assert "group related notes under topic notes" in self.context(repo, env)

    def test_default_folder_is_reported(self, repo, env):
        memory.init(repo, in_repo=False, do_migrate=False, default=True)
        dest = env["claude_home"] / "projects" / memory.sanitize(repo) / "memory"
        assert f"Memory for this project: {dest} (0 notes)." in self.context(repo, env)

    def test_legacy_skipped_repo_reports_default_folder(self, repo, env):
        env["memory_root"].mkdir()
        (env["memory_root"] / ".skipped").write_text(str(repo) + "\n")
        text = self.context(repo, env)
        dest = env["claude_home"] / "projects" / memory.sanitize(repo) / "memory"
        assert f"Memory for this project: {dest}" in text
        assert "Do not ask" not in text and "NOT set up" not in text

    def test_non_git_does_not_ask(self, env):
        plain = env["tmp"] / "plain"
        plain.mkdir()
        assert "Do not ask" in self.context(plain, env)
