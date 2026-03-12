# Compatibility

## Versioning policy

Smart Memory Companion is versioned independently from Smart Memory core.

- Companion versions use semver.
- Smart Memory compatibility is documented explicitly.
- Breaking API or runtime assumptions should increment the companion major version.

## Current baseline

The current companion targets the Smart Memory v3.1 transcript-first API shape as the primary backend contract.

## Expected matrix

Use this table format for releases:

| Companion version | Smart Memory versions | Notes |
| --- | --- | --- |
| `0.1.x` | `3.1.x` | Primary supported baseline |

## Capability degradation

The orchestrator probes Smart Memory at startup and degrades when endpoints are unavailable.

Examples:

- missing transcript endpoints
  - transcript views become degraded
- missing lane endpoints
  - lane actions and lane inspection become unavailable
- missing retrieve endpoint
  - workspace assembly is degraded or blocked depending on the action

## Upgrade discipline

When Smart Memory changes:

1. update companion client parsing
2. update compatibility docs
3. refresh tests and fixtures
4. release a companion version that states the supported Smart Memory range clearly
