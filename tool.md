# Tool Reference — KS Agent vs Opencode vs Claude Code

Sources:
- **KS Agent** — this repo: `server/src/tools.ts`, `server/src/agent.ts`, `server/src/skills.ts`, `server/src/lsp.ts`, `server/src/extensions.ts`, `server/src/mcp.ts`
- **Opencode** — cloned from https://github.com/anomalyco/opencode: `packages/core/src/tool/plugin/*.ts` (+ dynamic MCP tools via `packages/core/src/tool/mcp.ts`)
- **Claude Code** — Anthropic's official CLI (built-in tool set, as emulated by the cloned https://github.com/alishahryar1/free-claude-code, which additionally supports Anthropic *server-side* tools `web_search_*` / `web_fetch_*`)

---

## 1. KS Agent (30 built-in + 3 conditional + dynamic)

### Built-in tools (`server/src/tools.ts`)

| # | Tool | Description |
|---|------|-------------|
| 1 | `read_file` | Read one file (path, offset, limit; default 400 / max 2000 lines) |
| 2 | `read_multiple_files` | Read 1–30 files at once with per-file offset/limit |
| 3 | `write_file` | Write full file content |
| 4 | `edit_file` | Exact string replacement (old_string/new_string, replace_all) |
| 5 | `apply_patch` | Apply a unified diff (`@@` hunks) to a file |
| 6 | `list_dir` | List files/dirs inside project (outside forbidden) |
| 7 | `glob` | Glob pattern search with path base and limit |
| 8 | `find_files` | Find files by name substring/glob/regex (contains/glob/regex modes, pagination) |
| 9 | `tree` | Render directory tree (depth, limit) |
| 10 | `grep` | Regex search in file contents (pattern, path) |
| 11 | `get_file_info` | File metadata (size, mtime, type) |
| 12 | `delete_file` | Delete a file |
| 13 | `move_file` | Move/rename a file |
| 14 | `create_dir` | Create a directory |
| 15 | `copy_file` | Copy a file |
| 16 | `append_file` | Append content to a file |
| 17 | `run_shell` | Run a shell command in the project |
| 18 | `preview_app` | Detect framework and start dev server preview |
| 19 | `open_preview` | Open the running app preview in browser |
| 20 | `update_plan` | Update the plan/todo list during a task |
| 21 | `set_task_report` | Set the final task report |
| 22 | `git_init` | Initialize a git repo |
| 23 | `git_status` | Git status |
| 24 | `git_diff` | Git diff |
| 25 | `git_log` | Git log |
| 26 | `git_branch` | List/create branches |
| 27 | `git_commit` | Commit changes |
| 28 | `git_push` | Push to remote |
| 29 | `git_pull` | Pull from remote |

### Conditional / extension tools

| Tool | Source | When available |
|------|--------|----------------|
| `list_chat_extensions` | `server/src/agent.ts` | Always — lists skills, MCP servers, LSP servers and their state |
| `use_skill` | `server/src/skills.ts` | When skills are configured — load a skill by name |
| `lsp_diagnostics` | `server/src/lsp.ts` | When LSP servers are running — get errors/warnings for a file |
| extension tools (manifest-defined) | `server/src/extensions.ts` | Dynamic, from extension manifests (`tools` array) |
| MCP tools (`<server>_<tool>`) | `server/src/mcp.ts` | Dynamic, one per tool exposed by each running MCP server |

---

## 2. Opencode (cloned repo)

Built-in plugin tools in `packages/core/src/tool/plugin/`:

| # | Tool | File | Description |
|---|------|------|-------------|
| 1 | `edit` | `edit.ts` | Exact-text file editing (oldString/newString, replaceAll, quote/whitespace-tolerant retry) |
| 2 | `write` | `write.ts` | Write/create a file |
| 3 | `read` | `read.ts` | Read a file with offset/limit |
| 4 | `glob` | `glob.ts` | Fast glob pattern matching (hidden files option, limit) |
| 5 | `grep` | `grep.ts` | Regex/literal content search with include glob filter |
| 6 | `patch` | `patch.ts` | Apply patch/diff to files |
| 7 | `shell` | `shell.ts` | Execute shell command (workdir, timeout, background jobs, jobID) |
| 8 | `todowrite` | `todo.ts` | Write/update the todo list |
| 9 | `webfetch` | `webfetch.ts` | Fetch a URL and convert to markdown |
| 10 | `websearch` | `websearch.ts` | Web search |
| 11 | `question` | `question.ts` | Ask the user a question (custom UI) |
| 12 | `skill` | `skill.ts` | Load/run a skill |
| 13 | `subagent` | `subagent.ts` | Spawn a subagent/task (formerly `task`) |
| 14 | `experimental_image_generate` | `image-generate.ts` | Generate images |
| 15 | `schedule` (+ `schedule_create`, `schedule_list`, `schedule_pause`, `schedule_resume`, `schedule_delete`) | `schedule.ts` | Cron/scheduled tasks scoped to a session |
| 16 | `opencode_session_rename` | `opencode.ts` | Rename a session (namespaced `opencode`) |
| 17 | `opencode_session_move` | `opencode.ts` | Move session to another worktree/dir |
| 18 | `opencode_worktree_create` | `opencode.ts` | Create git worktree |
| 19 | `opencode_worktree_list` | `opencode.ts` | List worktrees |
| 20 | `opencode_worktree_remove` | `opencode.ts` | Remove worktree |
| 21 | `opencode_models` | `opencode.ts` | Search/list available provider models |
| 22 | `opencode_artifact_create` | `artifact.ts` | Create an artifact |
| 23 | `opencode_artifact_read` | `artifact.ts` | Read artifact contents |
| 24 | `opencode_artifact_update` | `artifact.ts` | Update artifact files |
| 25 | `opencode_artifact_delete` | `artifact.ts` | Delete artifact |
| 26 | `opencode_list_mcp_resources` | `mcp-resource.ts` | List MCP resources |
| 27 | `opencode_read_mcp_resource` | `mcp-resource.ts` | Read an MCP resource |
| 28+ | `<server>_<tool>` | `mcp.ts` | Dynamic MCP tools, namespaced per server |

---

## 3. Claude Code (Anthropic official CLI — from knowledge; free-claude-code emulates it)

| # | Tool | Description |
|---|------|-------------|
| 1 | `Bash` | Execute shell commands (with timeout, background) |
| 2 | `BashOutput` | Read output from a background bash shell |
| 3 | `KillShell` | Kill a running background shell |
| 4 | `Edit` | Exact string replacement in a file |
| 5 | `MultiEdit` | Multiple edits to one file in a single operation |
| 6 | `Write` | Create/overwrite a file |
| 7 | `Read` | Read a file (offset/limit for large files) |
| 8 | `NotebookRead` | Read a Jupyter notebook |
| 9 | `NotebookEdit` | Edit notebook cells |
| 10 | `Glob` | Fast file pattern matching |
| 11 | `Grep` | Content search (ripgrep-based) |
| 12 | `LS` | List directory contents |
| 13 | `WebFetch` | Fetch URL, convert to markdown |
| 14 | `WebSearch` | Web search |
| 15 | `TodoWrite` | Manage the task/todo list |
| 16 | `Task` | Launch a subagent for a task |
| 17 | `AskUserQuestion` | Ask the user clarifying questions |
| 18 | `Skill` | Invoke a skill |
| 19 | `SlashCommand` | Run a custom slash command |
| 20 | `EnterPlanMode` / `ExitPlanMode` | Enter/exit plan mode |
| 21 | `EnterWorktree` / `ExitWorktree` | Create/enter and exit a git worktree |
| 22 | `ListMcpResourcesTool` | List MCP resources |
| 23 | `ReadMcpResource` | Read an MCP resource |
| 24 | `CronCreate` / `CronList` / `CronRemove` | Manage scheduled cron jobs |
| 25 | `SendMessage` (Team/Swarm) | Agent-to-agent messaging |
| 26 | `TaskOutput` / `TaskStop` / `TaskList` | Manage background tasks |
| 27 | `web_search` / `web_fetch` / `code_execution` (server-side) | Anthropic-hosted server tools used by free-claude-code (`web_search_*`, `web_fetch_*` types) |
| 28+ | MCP tools | Dynamic, from configured MCP servers |

---

## 4. Quick comparison

| Capability | KS Agent | Opencode | Claude Code |
|------------|:---:|:---:|:---:|
| Read / write / edit / patch files | ✅ (5 tools) | ✅ (`read`, `write`, `edit`, `patch`) | ✅ (`Read`, `Write`, `Edit`, `MultiEdit`) |
| Glob / grep / find | ✅ (`glob`, `grep`, `find_files`, `list_dir`, `tree`) | ✅ (`glob`, `grep`) | ✅ (`Glob`, `Grep`, `LS`) |
| Shell | ✅ `run_shell` | ✅ `shell` | ✅ `Bash`, `BashOutput`, `KillShell` |
| Web fetch / search | ❌ (via MCP/extensions) | ✅ `webfetch`, `websearch` | ✅ `WebFetch`, `WebSearch` |
| Todo / plan | ✅ `update_plan`, `set_task_report` | ✅ `todowrite` | ✅ `TodoWrite` |
| Subagent / task | ❌ | ✅ `subagent` | ✅ `Task` (+ `TaskOutput`, `TaskStop`) |
| Ask user question | ❌ | ✅ `question` | ✅ `AskUserQuestion` |
| Skills | ✅ `use_skill` + `list_chat_extensions` | ✅ `skill` | ✅ `Skill`, `SlashCommand` |
| Git (dedicated tools) | ✅ 8 git_* tools | ⚠️ via `shell` / worktrees | ⚠️ via `Bash` |
| Preview/dev server | ✅ `preview_app`, `open_preview` | ❌ | ❌ |
| LSP diagnostics | ✅ `lsp_diagnostics` | ❌ | ❌ |
| Scheduling / cron | ❌ | ✅ `schedule*` | ✅ `CronCreate/List/Remove` |
| Image generation | ❌ | ✅ `experimental_image_generate` | ⚠️ (provider-dependent) |
| Plan mode / worktrees | ❌ | ✅ worktree tools | ✅ `EnterPlanMode`, `EnterWorktree` |
| MCP tools | ✅ dynamic | ✅ dynamic | ✅ dynamic |
| Extension/plugin tools | ✅ dynamic (manifests) | ✅ plugins | ✅ plugins |
