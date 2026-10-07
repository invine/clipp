# Clipp agent entry point

Clipp is an npm workspaces monorepo for Electron, Chrome extension and Android/Capacitor. Electron is the most complete reference runtime.

Start operational work from [project operations](docs/agents/operations.md): verification, runtime acceptance, operator setup, recovery and coordination. For implementation, use the [architecture map](docs/agent-guide.md), [glossary](GLOSSARY.md) and the relevant [accepted ADRs](docs/adr/). Settled feature requirements live under [`.scratch/`](.scratch/).

## Project constraints

- Use npm; development tooling requires Node.js 22.22.1 or newer.
- Put cross-runtime behavior in `packages/core` and shared UI in `packages/ui`; update each affected runtime bridge when its action surface changes.
- Electron main/preload are CommonJS bundles and use relative shared-module imports; Vite aliases apply only to the browser runtimes.
- Extension networking spans background and offscreen. `apps/extension/src/offscreen.ts` is the source loaded by `offscreen.html`.
- Managed-relay settings start empty in every runtime; preserve accepted [single-session transport fallback](docs/adr/0012-relay-transport-fallback-and-concurrent-sessions.md).
- Run `npm run check` before committing code. The [pre-commit hook](.husky/pre-commit) formats staged files and checks them; fix failures before retrying.

## Task sources

- Source boundaries, runtime differences and anchor files: [agent guide](docs/agent-guide.md).
- Domain vocabulary and decision conflicts: [domain docs](docs/agents/domain.md).
- Local ticket lifecycle: [issue tracker](docs/agents/issue-tracker.md) and [triage labels](docs/agents/triage-labels.md).
- Bounded source listing/search: [lookup command](docs/agents/source-lookup.md). Select the repository and scope explicitly.
- This cross-repository effort: [canonical tracker](.scratch/agent-workflow/README.md). The coordinator owns claims, integration and resolution.
