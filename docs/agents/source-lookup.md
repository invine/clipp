# Bounded source lookup

Run the Clipp-owned CLI from either repository using Node.js 22.22.1 or newer and Git. Select an existing Git root and at least one relative scope explicitly. A linked worktree may be selected as the root. The command reads the working copy of tracked paths, including staged additions and current modifications.

```sh
node /path/to/clipp/scripts/source-lookup.mjs --repo /path/to/clipp --scope docs --json
node /path/to/clipp/scripts/source-lookup.mjs --repo /path/to/relay --scope internal --query 'Relay Session' --json
node /path/to/clipp/scripts/source-lookup.mjs --repo /path/to/clipp --scope .scratch/agent-workflow --include .scratch/agent-workflow/new-task.md --max-results 20
```

`--scope` may name a file, directory or `.` and may repeat. `--include` may repeat and selects an existing regular, nonignored task file in the selected scope; unselected untracked files stay outside the inventory. Paths remain relative to the root; parent traversal and absolute scope/include paths fail. Missing roots, invalid options, ignored includes and excluded scopes fail with a diagnostic and exit 1. Exit 0 can still contain truncation or skipped files: inspect coverage fields. A no-match query is successful.

`--query` searches a case-sensitive literal, with one result per matching line. Text is read as UTF-8. Neither filenames nor source text are evaluated. Symlinks and paths inside nested repositories are excluded, including tracked paths beneath a nested `.git` marker. The selected root itself may be a symlink resolved to a Git root. Git inventory commands use no shell and optional Git locks are disabled.

Default exclusions apply even to tracked paths: Git internals; dependency directories (`node_modules`, `vendor`); output directories (`dist`, `build`, `out`, `coverage`, `target`); caches; local/configuration directories (`.local`, `.config`, `.aws`, `.ssh`, `.codex`, `.agents`); worktrees; profiles; artifacts/captures/diagnostics; temporary, backup and recovery directories. Environment files, database/key files, `.DS_Store`, `rv.json` and `.clipp-cli-store.json` are excluded. Naming exclusions are conservative; use direct, informed file inspection for an intentionally excluded source. Lookup never opens private runtime profiles or recovery contents.

The [CLI source](../../scripts/source-lookup.mjs) owns the exact naming rules; `--help` describes invocation. Keep the working tree stable while looking up files; concurrent filesystem changes can fail the command.

## Version 1 output

`--json` emits one JSON object with `version: 1`, `mode` (`list` or `search`), resolved `root`, relative `scopes`, `results`, `examinedFiles`, `skipped`, `limits`, `truncated` and `reasons`. List results contain `path`; search results contain `path`, one-based `line` and `text`. Filenames and control characters are JSON escaped. Errors emit `{version: 1, error: string}` on stderr. Human output uses a summary, JSON-escaped result lines and coverage counters.

Defaults are 100 results, 65,536 output bytes and 2,000 files examined. Override with `--max-results` (1–1,000), `--max-bytes` (4,096–1,048,576) and `--max-files` (1–10,000). Hard limits: 10,000 inventory paths visited, 1 MiB per content file, 8 MiB of content read and 1,024 characters per returned line. Git inventory capture is capped at 8 MiB; exceeding it fails the command. Oversized and NUL-containing binary files are counted as skipped; clipping text or reaching a result/output/read/inventory bound records a truncation reason. A clipped line retains its original line number. Large selection metadata that cannot fit the output budget fails explicitly.

For maintained operational navigation, start from [project operations](operations.md); dated evidence remains evidence of its recorded revisions.
