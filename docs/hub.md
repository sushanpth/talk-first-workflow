# Hub

The hub is a local web page on your machine. Its server is read-only: it never writes to your repos, memory folders or transcripts. The one writable part is [Notes](#notes), which the browser stores itself.

`hub/cli.ts` starts a Hono server, which serves a React app. The server reads memory only through `scripts/memory.py`, and reads git and Claude Code's transcript folders directly.

## What it shows

Per project:

- **Plans**: the briefs saved in `<memory>/briefs/`.
- **Memory**: every note and the `MEMORY.md` index. `[[links]]` are clickable and each note lists its backlinks.
- **Docs**: the repo's tracked `*.md` files.
- **Worktrees**: each linked worktree's changed files against its base (by default the merge-base with the main checkout's branch), in a side-by-side or inline diff. A worktree made by an agent is titled with the agent's task, with its branch, agent type and a link to its plan.
- **Code**: the repo's tracked files in a folder tree and a read-only viewer whose `?line=` links jump to a line. Ctrl/Cmd+P quick-opens a file by name, and a search page finds text in files, grouped by file. Code references in plans, notes and docs, such as `hub/server/app.ts:42`, link into the viewer.

Across projects, the header's **Notes** link opens your own notes; see [Notes](#notes). On the Notes page, the header's **Projects** menu jumps back to a project's pages.

## Lists

Every list has a filter box, a sort menu with an order toggle, and Prev and Next buttons. Filtering, sorting and paging happen on the server, 50 items per page, and the current filter, sort and page are kept in the URL.

## Notes

Notes are your own markdown notes, separate from project memory. They are global, and each one can carry an optional project.

**Where they are stored:** only in your browser, in IndexedDB for the hub's address. They are not files on disk, and the hub server never sees them. Each address is its own browser origin, so notes made at `127.0.0.1` don't show at `localhost` (the page warns when it isn't opened at `127.0.0.1`), and clearing that site's data in the browser deletes them. The page asks the browser for persistent storage so it won't evict them under pressure. Use the zip backup to keep a copy.

- **Editor.** A CodeMirror live-preview markdown editor: formatting shows and markdown markers hide on lines away from the cursor. Lists continue on Enter and indent with Tab, task checkboxes can be ticked, and pasted or dropped images are stored with the note (SVG is refused). Edits save a moment after you stop typing. Ctrl/Cmd+E switches between editing and reading mode.
- **Titles.** A note's title is its first line of text.
- **Links.** `[[Title]]`, `[[Title#heading]]` and `[[Title|alias]]` link notes by title, case-insensitive, newest match first. When no note matches and the note has a project, the link opens that project's memory note of the same name. A link to a missing title creates that note. Typing `[[` completes note titles and memory note names; Ctrl/Cmd+click opens a link in the editor.
- **Backlinks.** Under the note's date, a count opens the notes that link here and the notes that mention its title without linking; **Link** turns such a mention into a `[[link]]`.
- **Tags.** `#tags` in the text, as Obsidian reads them (not all digits, not inside code or links). Typing `#` completes existing tags, and the sidebar lists every tag with its count.
- **Folders.** Nested folders in the sidebar, which you can add, rename and delete. Deleting a folder moves its notes to Recently Deleted. Each note has a folder and a project menu.
- **Note list.** Pinned notes first, then Today, Yesterday, Previous 7 Days, Previous 30 Days and one group per month. The search box matches words in titles and text, with `tag:x` (or `#x`) and `folder:x` filters and quotes to group words. Ctrl/Cmd+Shift+F focuses it.
- **Daily note.** Ctrl/Cmd+Shift+D, or **Daily note** in the sidebar, opens today's note titled `YYYY-MM-DD`, creating it if needed.
- **Quick switcher.** Ctrl/Cmd+O opens a note by title, or creates one with the typed title. Ctrl/Cmd+Alt+N makes a new note in the folder the list shows.
- **Outline.** A note's headings show as short bars on the editor's right edge; hover or focus shows the list, and a click scrolls to the heading.
- **Pins.** A pinned note stays at the top of the list.
- **Sidebar.** The folders and tags sidebar collapses to a rail of icons on wide screens.
- **Recently deleted.** Deleted notes stay here for 30 days, then are deleted for good. You can restore a note, delete it now or empty the list.
- **Backup.** Export downloads every note outside Recently Deleted as a zip of `.md` files that Obsidian can open: folders as directories, metadata in front matter, images under `attachments/`. Import takes such a zip or `.md` files; a note already in the browser is replaced only by a newer copy. Imports skip files that aren't notes or images, files over 20 MB and anything past 200 MB in total.

## When it opens

Every page has its own URL. The agent opens the hub for you at two moments: **Open the plan** at the start gate, and **Look first** after review. You can also open it yourself:

```
node hub/cli.ts open                         # the current repo's project page
node hub/cli.ts open plan <path>             # also: note <path>, doc <repo> <path>, worktree <path> [--base <sha>], project <repo>
node hub/cli.ts open --print-url ...         # print the URL instead of opening a browser
node hub/cli.ts restart                      # stop the running hub and start this plugin's version, without a browser
node hub/cli.ts stop
```

## First run and build cache

It needs Node.js 22.18 or newer and pnpm. The first run (and the first run after the plugin updates) runs `pnpm install --frozen-lockfile` and builds the UI into `~/.cache/talk-first-workflow/hub/dist/<hash>/`, which takes a few seconds. The two most recently used builds are kept and older ones are deleted; a plain `pnpm build` in `hub/` writes to `dist/dev` instead. The server starts in the background, is reused by later commands, and exits after 30 idle minutes.

## Port

The hub runs on port 47321, or on `TALK_FIRST_HUB_PORT` when that is set. If another program already listens on the port, the hub exits with an error that asks you to set `TALK_FIRST_HUB_PORT`.

## Several Claude config folders

One hub serves every Claude config folder on the machine, so sessions started with different `CLAUDE_CONFIG_DIR` settings share it. When their plugin versions differ, the newest version wins: an older hub is stopped and replaced, and an older plugin reuses a newer hub that is already running. For the same version, a hub built from different sources is restarted. Agent labels come from the transcripts in `~/.claude`, every `~/.claude-*` folder that has a `projects/` folder, and `CLAUDE_CONFIG_DIR` when it is set, whichever session started the hub.

## Security model

- It listens on 127.0.0.1 only, on port 47321 or `TALK_FIRST_HUB_PORT`.
- The URL it opens carries a random token. The server swaps it for an HttpOnly, SameSite=Strict cookie, and every API call needs that cookie or the token.
- Requests whose Host header isn't `127.0.0.1:<port>` or `localhost:<port>` are refused, which blocks DNS-rebinding attacks. It sends no CORS headers.
- It only reads files inside each project's repo, memory folder and Claude Code transcript folders, using real paths so symlinks and `..` can't escape, and it never writes to them. Git and `memory.py` run with argument lists, never through a shell.
- The token is made once and kept in a `token` file in `~/.cache/talk-first-workflow/hub/`, readable only by you (mode 0600). It survives restarts, so open tabs keep working.
- Before `cli.ts` sends the token to whatever holds the port, it checks that the listener is your hub: it sends a random challenge, and the hub answers with an HMAC of it keyed by the token. A listener that can't answer counts as another program. The launcher only stops a hub whose pid also matches `state.json`, and only opens URLs on the hub's own origin.
