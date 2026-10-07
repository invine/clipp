import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const usage = `Read-only source lookup (schema version 1)
node scripts/source-lookup.mjs --repo PATH --scope PATH [--scope PATH ...]
  [--include FILE] [--query LITERAL] [--json]
  [--max-results N] [--max-bytes N] [--max-files N]
Scopes and included files are relative to the explicitly selected Git root.
Tracked paths only; --include adds an explicit nonignored task file.
Defaults: 100 results, 65536 output bytes, 2000 files examined.
See docs/agents/source-lookup.md for exclusions and coverage limits.`;
const excluded =
  /^(?:\.git|\.local|\.cache|\.config|\.worktrees?|worktrees?|node_modules|vendor|dist|build|out|coverage|target|tmp|temp|artifacts?|captures?|diagnostics?|recovery|backups?|profiles?|.*[-_]profiles?|.*[-_]cache|\.gradle|\.idea|\.next|\.turbo|\.aws|\.ssh|\.codex|\.agents)$/i;

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function parse(args) {
  const options = {
    scopes: [],
    includes: [],
    json: false,
    maxResults: 100,
    maxBytes: 65536,
    maxFiles: 2000,
  };
  const numbers = {
    "--max-results": ["maxResults", 1, 1000],
    "--max-bytes": ["maxBytes", 4096, 1048576],
    "--max-files": ["maxFiles", 1, 10000],
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--json") {
      options.json = true;
      continue;
    }
    const value = args[++i];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === "--repo") options.root = value;
    else if (flag === "--scope") options.scopes.push(value);
    else if (flag === "--include") options.includes.push(value);
    else if (flag === "--query") {
      if (!value) throw new Error("Query must be nonempty");
      options.query = value;
    } else if (numbers[flag]) {
      const [key, min, max] = numbers[flag];
      if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)
        throw new Error(`${flag} must be ${min}..${max}`);
      options[key] = Number(value);
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (!options.root || !options.scopes.length)
    throw new Error("Select --repo and at least one --scope explicitly");
  return options;
}
function localPath(root, input) {
  if (isAbsolute(input) || input.split(/[\\/]/).includes(".."))
    throw new Error(
      `Path must stay inside the repository: ${JSON.stringify(input)}`
    );
  const path = relative(root, resolve(root, input)).split(sep).join("/");
  if (!existsSync(join(root, path)))
    throw new Error(`Missing path: ${JSON.stringify(input)}`);
  return path;
}
function allowed(root, path) {
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    if (
      excluded.test(parts[i]) ||
      /^(?:\.env(?:\..*)?|.*\.(?:sqlite(?:-.*)?|db|pem|key)|\.DS_Store|\.clipp-cli-store\.json|rv\.json)$/i.test(
        parts[i]
      )
    )
      return false;
    const current = join(root, ...parts.slice(0, i + 1));
    if (!existsSync(current) || lstatSync(current).isSymbolicLink())
      return false;
    if (existsSync(join(current, ".git"))) return false;
  }
  return true;
}
try {
  if (process.argv[2] === "--help") {
    console.log(usage);
    process.exit(0);
  }
  const options = parse(process.argv.slice(2));
  const root = realpathSync(options.root);
  if (
    !lstatSync(root).isDirectory() ||
    realpathSync(
      git(root, "rev-parse", "--show-toplevel").replace(/\n$/, "")
    ) !== root
  )
    throw new Error("--repo must select an existing Git repository root");
  const scopes = options.scopes.map((scope) => localPath(root, scope));
  for (const scope of scopes)
    if (scope && !allowed(root, scope))
      throw new Error(`Excluded scope: ${JSON.stringify(scope)}`);
  const candidates = new Set(
    git(root, "ls-files", "--cached", "-z").split("\0").filter(Boolean)
  );
  for (const input of options.includes) {
    const path = localPath(root, input);
    if (!allowed(root, path) || !lstatSync(join(root, path)).isFile())
      throw new Error(
        `Included path must be an allowed regular file: ${JSON.stringify(input)}`
      );
    const visible = git(
      root,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      path
    ).split("\0");
    if (!visible.includes(path))
      throw new Error(`Included file is ignored: ${JSON.stringify(input)}`);
    candidates.add(path);
  }
  const report = {
    version: 1,
    mode: options.query ? "search" : "list",
    root,
    scopes,
    results: [],
    truncated: false,
    reasons: [],
    examinedFiles: 0,
    skipped: { largeFiles: 0, binaryFiles: 0 },
    limits: {
      maxResults: options.maxResults,
      maxBytes: options.maxBytes,
      maxFiles: options.maxFiles,
      maxInventoryPaths: 10000,
      maxFileBytes: 1048576,
      maxReadBytes: 8388608,
      maxTextCharacters: 1024,
    },
  };
  const truncate = (reason) => {
    report.truncated = true;
    if (!report.reasons.includes(reason)) report.reasons.push(reason);
  };
  function add(item) {
    if (report.results.length >= options.maxResults) {
      truncate("max-results");
      return false;
    }
    report.results.push(item);
    // Reserve space for final counters, truncation reasons and the human header.
    if (Buffer.byteLength(JSON.stringify(report)) + 512 > options.maxBytes) {
      report.results.pop();
      truncate("max-bytes");
      return false;
    }
    return true;
  }
  let readBytes = 0;
  let inventoryPaths = 0;
  for (const path of [...candidates].sort()) {
    if (inventoryPaths++ >= report.limits.maxInventoryPaths) {
      truncate("max-inventory-paths");
      break;
    }
    if (
      !scopes.some(
        (scope) => !scope || path === scope || path.startsWith(`${scope}/`)
      ) ||
      !allowed(root, path)
    )
      continue;
    const stat = lstatSync(join(root, path));
    if (!stat.isFile()) continue;
    if (report.examinedFiles >= options.maxFiles) {
      truncate("max-files");
      break;
    }
    report.examinedFiles++;
    if (!options.query) {
      if (!add({ path })) break;
      continue;
    }
    if (stat.size > report.limits.maxFileBytes) {
      report.skipped.largeFiles++;
      continue;
    }
    if (readBytes + stat.size > report.limits.maxReadBytes) {
      truncate("max-read-bytes");
      break;
    }
    const handle = openSync(
      join(root, path),
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    const buffer = Buffer.alloc(report.limits.maxFileBytes + 1);
    let length;
    try {
      length = readSync(handle, buffer, 0, buffer.length, 0);
    } finally {
      closeSync(handle);
    }
    if (length > report.limits.maxFileBytes) {
      report.skipped.largeFiles++;
      continue;
    }
    const bytes = buffer.subarray(0, length);
    readBytes += bytes.length;
    if (bytes.includes(0)) {
      report.skipped.binaryFiles++;
      continue;
    }
    let full = false;
    const lines = bytes.toString("utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(options.query)) continue;
      if (lines[i].length > report.limits.maxTextCharacters)
        truncate("line-text");
      if (
        !add({
          path,
          line: i + 1,
          text: lines[i].slice(0, report.limits.maxTextCharacters),
        })
      ) {
        full = true;
        break;
      }
    }
    if (full) break;
  }
  const output = options.json
    ? JSON.stringify(report)
    : [
        `Source lookup v1: ${report.mode}; ${report.results.length} results; truncated=${report.truncated}`,
        ...report.results.map((item) => JSON.stringify(item)),
        JSON.stringify({
          reasons: report.reasons,
          examinedFiles: report.examinedFiles,
          skipped: report.skipped,
        }),
      ].join("\n");
  if (Buffer.byteLength(output) + 1 > options.maxBytes)
    throw new Error(
      "Selection metadata exceeds --max-bytes; use fewer scopes or a larger output limit"
    );
  console.log(output);
} catch (error) {
  console.error(JSON.stringify({ version: 1, error: error.message }));
  process.exitCode = 1;
}
