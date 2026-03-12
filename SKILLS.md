# Smart Memory Companion Agent Guide

Use this file when working in the `smart-memory-companion` repo.

## Mission

Preserve the boundary between:

- Smart Memory core as the canonical memory substrate
- the orchestrator as the context and workspace control plane
- the UI as the inspection surface

This repo contains only the companion. Smart Memory itself should live in a separate checkout.

## Repo Boundary

- This repo:
  - `smart-memory-orchestrator/`
  - `smart-memory-ui/`
  - root launch/build/test/doctor/package scripts
  - docs and workflows
- External repo:
  - `smart-memory/`

Do not pull Smart Memory core logic into this repo unless the user explicitly asks for cross-repo changes.

## Runtime Rules To Preserve

- Agents should talk to the orchestrator, not directly to Smart Memory, for normal reads and writes.
- The UI should only talk to the orchestrator.
- The orchestrator should only talk to Smart Memory over HTTP.
- `/api/*` is the permanent API namespace.
- `/api/runtime/*` is the stable agent-facing surface.

## Smart Memory Resolution

The repo resolves the Smart Memory checkout from:

1. `SMART_MEMORY_PROJECT_ROOT`
2. local `./smart-memory`
3. sibling `../smart-memory`

If Smart Memory is not in one of those locations, set the environment variable rather than hardcoding paths.

## Where To Look First

### Orchestration and contracts

- `smart-memory-orchestrator/src/app.ts`
- `smart-memory-orchestrator/src/pipeline.ts`
- `smart-memory-orchestrator/src/contracts.ts`
- `smart-memory-orchestrator/src/retrievalGrouping.ts`
- `smart-memory-orchestrator/src/workspaceAssembler.ts`

### Launching, packaging, and repo-level operations

- `package.json`
- `scripts/launcher.mjs`
- `scripts/build.mjs`
- `scripts/test.mjs`
- `scripts/doctor.mjs`
- `scripts/package-release.mjs`
- `scripts/lib/shared.mjs`
- `scripts/lib/launcher-core.mjs`

### Smart Memory pathing and orchestration config

- `smart-memory-orchestrator/orchestrator.config.ts`
- `smart-memory-orchestrator/src/config.ts`
- `smart-memory-orchestrator/src/smartMemorySupervisor.ts`

### UI shell and operator experience

- `smart-memory-ui/src/components/AppLayout.tsx`
- `smart-memory-ui/src/components/UiPrimitives.tsx`
- `smart-memory-ui/src/pages/RunsPage.tsx`
- `smart-memory-ui/src/pages/RunDetailPage.tsx`
- `smart-memory-ui/src/pages/RebuildPage.tsx`
- `smart-memory-ui/src/api/hooks.ts`

## Contract Change Workflow

When changing orchestrator payloads or routes:

1. Update `smart-memory-orchestrator/src/contracts.ts`
2. Update route schemas in `smart-memory-orchestrator/src/app.ts`
3. Export OpenAPI
4. Regenerate UI API types
5. Update UI hooks and pages
6. Run `npm run test`

## Commands

Run from the repo root:

```powershell
npm run dev
npm run app
npm run build
npm run test
npm run doctor
npm run package:release
```

## Important Guardrails

- Do not create a second canonical memory store in the orchestrator.
- Do not make the UI bypass the orchestrator.
- Do not solve companion problems by editing Smart Memory core unless explicitly asked.
- Keep the orchestrator opinionated in stages, bundle contracts, and traces.
- Keep extensibility at the hook and runtime-adapter edges.

## Testing Standard

Before closing work:

- refresh contracts if needed
- run `npm run build`
- run `npm run test`
- state clearly whether a live multi-process stack was actually launched or only build/test verified

## Release Standard

When preparing a repo/release change:

- keep the repo free of `node_modules`, `dist`, runtime DBs, and secrets
- keep Smart Memory out of this repo
- update docs if startup, compatibility, or packaging behavior changed
- keep GitHub workflows green
