# Deployment

## Local development

Recommended layout:

```text
workspace/
  smart-memory/
  smart-memory-companion/
```

From `smart-memory-companion/`:

```powershell
npm run dev
```

## Local app mode

For the smoother operator workflow:

```powershell
npm run app
```

This starts:

- Smart Memory
- orchestrator

The orchestrator serves the built UI at `/`.

## Smart Memory location

The companion resolves Smart Memory from:

1. `SMART_MEMORY_PROJECT_ROOT`
2. local `./smart-memory`
3. sibling `../smart-memory`

Set `SMART_MEMORY_PROJECT_ROOT` explicitly in CI, unusual local layouts, or packaged environments.

## Environment variables

Most useful variables:

- `SMART_MEMORY_PROJECT_ROOT`
- `SMART_MEMORY_START_MODE`
- `SMART_MEMORY_HOST`
- `SMART_MEMORY_PORT`
- `SMART_MEMORY_COMMAND`
- `ORCHESTRATOR_HOST`
- `ORCHESTRATOR_PORT`
- `UI_SERVING_MODE`
- `UI_DEV_SERVER_URL`

## GitHub release packaging

This repo includes:

- CI workflow
- tag-driven release workflow
- root `npm run package:release`

Release flow:

1. tag the repo
2. GitHub Actions installs dependencies
3. build and test run
4. a clean release staging directory is prepared under `artifacts/`
5. the workflow uploads a zipped artifact to GitHub Releases

The release artifact is a clean companion repo snapshot without:

- Smart Memory core
- `node_modules`
- build output
- runtime DBs
- secrets

## Distribution guidance

If you want a turn-key local bundle, create that as a release artifact or internal package derived from this repo. Do not commit packaged runtime bundles back into the source repo.
