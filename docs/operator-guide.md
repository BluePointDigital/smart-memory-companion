# Operator Guide

## Normal usage

1. run `npm run doctor`
2. start the stack with `npm run app`
3. open the UI
4. assemble a workspace from the Runs page
5. inspect framing policy, retrieval decisions, stage timing, and adapter output

## What to trust

Trust Smart Memory for:

- transcript truth
- memory truth
- evidence
- revision state

Trust the companion for:

- workspace assembly
- retrieval shaping
- execution traces
- operator visibility

## Common pages

- Runs & Workspace
  - launch new orchestration runs
  - inspect run detail tabs
- Transcripts
  - browse known sessions
  - perform manual session lookup
- Memory
  - inspect evidence, history, and revision chains
- Rebuild & Debug
  - inspect readiness and capabilities
  - run guarded rebuild actions

## Degraded mode

If Smart Memory is unhealthy or missing endpoints:

- the health bar will show degraded status
- mutating actions stay disabled
- affected pages still render with explicit degraded-state messaging

## Troubleshooting checklist

- run `npm run doctor`
- inspect `/api/system/status`
- confirm Smart Memory `/health`
- confirm orchestrator `/api/health`
- if UI looks stale after schema changes, run `npm run build`
