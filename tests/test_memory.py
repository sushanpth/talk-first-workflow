import json
import subprocess

import memory
from conftest import note


class TestCheck:
    def test_valid_note_passes(self):
        assert memory.check_text(note()) == []

    def test_missing_frontmatter(self):
        assert "Missing frontmatter" in memory.check_text("just text")[0]

    def test_name_must_be_kebab_case(self):
        errors = memory.check_text(note(name="Auth_Cookies"))
        assert any("kebab-case" in e for e in errors)

    def test_description_length_limit(self):
        errors = memory.check_text(note(description="x" * 151))
        assert any("151 chars" in e for e in errors)
        assert memory.check_text(note(description="x" * 150)) == []

    def test_type_must_be_valid(self):
        errors = memory.check_text(note(kind="decision"))
        assert any("metadata.type" in e for e in errors)

    def test_top_level_type_accepted(self):
        text = "---\nname: a-note\ndescription: d\ntype: reference\n---\n\nhttps://example.com\n"
        assert memory.check_text(text) == []

    def test_project_and_feedback_need_why(self):
        for kind in ("project", "feedback"):
            errors = memory.check_text(note(kind=kind, body="A fact without a reason.\n"))
            assert any("**Why:**" in e for e in errors)

    def test_user_and_reference_do_not_need_why(self):
        for kind in ("user", "reference"):
            assert memory.check_text(note(kind=kind, body="A fact.\n")) == []

    def test_empty_body(self):
        assert any("empty" in e for e in memory.check_text(note(body="")))

    def test_harness_added_fields_and_quotes_are_fine(self):
        text = (
            '---\nname: gpu-hang\ndescription: "Frozen screen: a GL reset, not RAM"\nmetadata:\n'
            "  node_type: memory\n  type: project\n  modified: 2026-08-07T09:19:32.910Z\n---\n\n"
            "Body.\n\n**Why:** saves debugging time.\n"
        )
        assert memory.check_text(text) == []


class TestSimilarAndSearch:
    def write_notes(self, directory):
        directory.mkdir(parents=True)
        (directory / "MEMORY.md").write_text("- index\n")
        (directory / "auth-uses-session-cookies.md").write_text(
            note(body="Sessions live in Redis.\n\n**Why:** instant revocation.\nRelated: [[redis-layout]]\n"))
        (directory / "redis-layout.md").write_text(
            note(name="redis-layout", description="Redis key naming and TTL conventions",
                 body="Keys are prefixed by service.\n\n**Why:** shared cluster.\n"))
        (directory / "deploy-target.md").write_text(
            note(name="deploy-target", description="Production deploys to Fly.io in two regions",
                 body="Two regions.\n\n**Why:** latency for EU users.\n"))
        (directory / "briefs").mkdir()
        (directory / "briefs" / "2026-10-23-login.md").write_text("# Brief: session login cookies\n")

    def test_similar_ranks_closest_note_first(self, tmp_path):
        self.write_notes(tmp_path / "m")
        draft = note(name="session-cookie-expiry", description="Session cookies expire after 14 days of inactivity",
                     body="Sliding expiry.\n\n**Why:** fewer forced logins.\n")
        results = memory.similar(draft, tmp_path / "m")
        assert results[0]["name"] == "auth-uses-session-cookies"
        assert all("deploy" not in r["name"] for r in results)

    def test_similar_excludes_the_note_being_edited(self, tmp_path):
        self.write_notes(tmp_path / "m")
        path = tmp_path / "m" / "auth-uses-session-cookies.md"
        results = memory.similar(path.read_text(), tmp_path / "m", exclude=path)
        assert all(r["name"] != "auth-uses-session-cookies" for r in results)

    def test_index_and_briefs_are_not_notes(self, tmp_path):
        self.write_notes(tmp_path / "m")
        names = {p.name for p in memory.note_files(tmp_path / "m")}
        assert names == {"auth-uses-session-cookies.md", "redis-layout.md", "deploy-target.md"}

    def test_search_follows_links_one_hop(self, tmp_path):
        self.write_notes(tmp_path / "m")
        results = memory.search("session revocation", tmp_path / "m")
        assert results[0]["name"] == "auth-uses-session-cookies"
        linked = [r for r in results if r.get("linked_from")]
        assert [r["name"] for r in linked] == ["redis-layout"]

    def test_search_with_no_match(self, tmp_path):
        self.write_notes(tmp_path / "m")
        assert memory.search("kubernetes", tmp_path / "m") == []


class TestSetup:
    def test_status_before_setup(self, repo, env):
        info = memory.status(repo)
        assert info["is_git"] and not info["configured"] and not info["skipped"]
        assert info["memory_dir"] == str(env["memory_root"] / "shop")

    def test_init_outside_repo(self, repo, env):
        result = memory.init(repo, in_repo=False, do_migrate=False)
        dest = env["memory_root"] / "shop"
        assert result["memory_dir"] == str(dest) and dest.is_dir()
        settings = json.loads((repo / ".claude" / "settings.local.json").read_text())
        assert settings["autoMemoryDirectory"] == str(dest)
        info = memory.status(repo)
        assert info["configured"] and not info["in_repo"]

    def test_init_keeps_other_local_settings(self, repo):
        (repo / ".claude").mkdir()
        (repo / ".claude" / "settings.local.json").write_text('{"permissions": {"allow": ["Bash(ls)"]}}')
        memory.init(repo, in_repo=False, do_migrate=False)
        settings = json.loads((repo / ".claude" / "settings.local.json").read_text())
        assert settings["permissions"] == {"allow": ["Bash(ls)"]}

    def test_init_makes_git_ignore_local_settings(self, repo):
        memory.init(repo, in_repo=False, do_migrate=False)
        ignored = subprocess.run(["git", "check-ignore", "-q", ".claude/settings.local.json"], cwd=repo)
        assert ignored.returncode == 0
        assert "settings.local.json" not in subprocess.run(
            ["git", "status", "--porcelain"], cwd=repo, capture_output=True, text=True).stdout

    def test_init_in_repo(self, repo):
        memory.init(repo, in_repo=True, do_migrate=False)
        info = memory.status(repo)
        assert info["memory_dir"] == str(repo / ".memory") and info["in_repo"]

    def test_migrate_copies_and_keeps_originals(self, repo, env):
        legacy = env["claude_home"] / "projects" / memory.sanitize(repo) / "memory"
        legacy.mkdir(parents=True)
        (legacy / "MEMORY.md").write_text("- [A](a.md) — a\n")
        (legacy / "a.md").write_text(note(name="a"))
        assert memory.status(repo)["legacy_count"] == 1
        result = memory.init(repo, in_repo=False, do_migrate=True)
        dest = env["memory_root"] / "shop"
        assert result["migrated"] == 2
        assert (dest / "a.md").read_text() == note(name="a")
        assert (legacy / "a.md").exists()

    def test_migrate_merges_index_without_duplicates(self, repo, env):
        legacy = env["claude_home"] / "projects" / memory.sanitize(repo) / "memory"
        legacy.mkdir(parents=True)
        (legacy / "MEMORY.md").write_text("- [A](a.md) — a\n- [B](b.md) — b\n")
        dest = env["memory_root"] / "shop"
        dest.mkdir(parents=True)
        (dest / "MEMORY.md").write_text("- [A](a.md) — a\n")
        memory.init(repo, in_repo=False, do_migrate=True)
        assert (dest / "MEMORY.md").read_text().splitlines() == ["- [A](a.md) — a", "- [B](b.md) — b"]

    def test_worktree_maps_to_main_repo(self, repo, env):
        worktree = env["tmp"] / "wt"
        subprocess.run(["git", "worktree", "add", "-q", str(worktree)], cwd=repo, check=True)
        assert memory.repo_root(worktree) == (repo, True)

    def test_subfolder_maps_to_repo_root(self, repo):
        sub = repo / "apps" / "api"
        sub.mkdir(parents=True)
        assert memory.repo_root(sub) == (repo, True)

    def test_name_collision_uses_parent_prefix(self, repo, env):
        other = env["tmp"] / "clients" / "shop"
        other.mkdir(parents=True)
        subprocess.run(["git", "init", "-q"], cwd=other, check=True)
        memory.init(repo, in_repo=False, do_migrate=False)
        result = memory.init(other, in_repo=False, do_migrate=False)
        assert result["memory_dir"] == str(env["memory_root"] / "clients-shop")

    def test_skip_and_unskip(self, repo):
        memory.skip(repo)
        assert memory.status(repo)["skipped"]
        memory.init(repo, in_repo=False, do_migrate=False)
        assert not memory.status(repo)["skipped"]

    def test_non_git_directory(self, env):
        plain = env["tmp"] / "plain"
        plain.mkdir()
        assert memory.status(plain)["is_git"] is False


class TestCli:
    def test_check_reads_stdin_and_sets_exit_code(self, capsys, monkeypatch):
        import io
        monkeypatch.setattr("sys.stdin", io.StringIO(note(kind="project", body="no reason\n")))
        assert memory.main(["check", "-"]) == 1
        assert json.loads(capsys.readouterr().out)["ok"] is False

    def test_search_uses_configured_dir(self, repo, env, capsys):
        memory.init(repo, in_repo=False, do_migrate=False)
        (env["memory_root"] / "shop" / "deploy-target.md").write_text(
            note(name="deploy-target", description="Deploys go to Fly.io", body="x\n\n**Why:** y\n"))
        assert memory.main(["--cwd", str(repo), "search", "fly.io", "deploys"]) == 0
        assert json.loads(capsys.readouterr().out)[0]["name"] == "deploy-target"
