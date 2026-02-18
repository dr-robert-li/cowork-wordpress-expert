---
phase: 05-multi-source-connection
plan: 02
subsystem: diagnostics, status
tags: [wordpress, bash, jq, docker, git, ssh, sites-json, source-type-gating]

# Dependency graph
requires:
  - phase: 05-01
    provides: source_type + file_access + container_name fields in sites.json; capability summary pattern from connect COMMAND.md

provides:
  - /diagnose: source-type-gated resync (SSH=rsync, local=skip, docker_bind=skip, docker_cp=re-copy, git=skip)
  - /diagnose: source-type-routed WP-CLI invocation (ssh via SSH, docker via docker exec, local via direct wp)
  - /diagnose: inline skip messages with source type + actionable guidance per WP-CLI-dependent skill
  - /diagnose: end-of-run summary of skipped skills with reason
  - /status: source type badges ([SSH], [LOCAL], [DOCKER], [GIT]) in profile headings
  - /status: source-specific detail lines (SSH host, local path, docker container, git remote/branch)
  - /status: source-aware sync status display (live access vs timestamp)
  - /status: capabilities line per profile (DB skills shown only when WP-CLI available and not git)

affects:
  - 06-database-performance (WP_CLI_PREFIX pattern established here for routing WP-CLI by source type)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Case-on-source_type resync gate: ssh=rsync, local=skip, docker/bind_mount=skip, docker/docker_cp=re-copy, git=skip-and-inform"
    - "WP_CLI_PREFIX variable pattern: set once at top of skill loop, used by all WP-CLI-dependent skills"
    - "Source-type-specific skip messages: include source type name and concrete remediation action"
    - "Backward-compatible source_type read in status: .source_type // 'ssh' null-coalescing"
    - "Capabilities line in /status: base skills always shown, DB skills gated on wp_cli_path AND not git"

key-files:
  created: []
  modified:
    - commands/diagnose/COMMAND.md
    - commands/status/COMMAND.md

key-decisions:
  - "WP_CLI_PREFIX pattern: set once before skill loop, consumed by all WP-CLI skills — clean single point of source-type routing"
  - "Git source always skips WP-CLI skills even if local wp binary exists — git sources have no live DB by design"
  - "Capability gating in /status matches /diagnose and /connect Section 10 — same three skills (core-integrity, user-audit, version-audit), same reasons per source type"
  - "End-of-run skipped skills summary distinguishes WP-CLI skips from execution errors — user sees which were structural vs failures"

patterns-established:
  - "All WP-CLI invocation routing via WP_CLI_PREFIX — Phase 6 database skills should follow same pattern"
  - "Source-type-specific user-facing messages use consistent language: 'git source — no live WordPress database', 'install from https://wp-cli.org'"
  - "Inline skip messages always end with concrete next step (install X, connect via Y)"

requirements-completed: [MSRC-06]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 5 Plan 02: Source-Type Gating for /diagnose and /status Summary

**Source-type-aware resync routing and WP-CLI skill gating in /diagnose, plus source type badges and source-specific detail display in /status — completing consistent multi-source behavior across all three core commands**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T21:02:31Z
- **Completed:** 2026-02-18T21:05:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Updated Section 2 of `/diagnose` to read `SOURCE_TYPE`, `FILE_ACCESS`, and `CONTAINER_NAME` from profile with backward-compatible `// "ssh"` null-coalescing
- Replaced unconditional rsync in Section 3 of `/diagnose` with a `case "$SOURCE_TYPE"` gate:
  - `ssh`: existing rsync logic unchanged
  - `local`: skips resync ("files are accessed directly from local filesystem")
  - `docker/bind_mount`: skips resync ("files accessed via bind mount — always current")
  - `docker/docker_cp`: re-copies via `docker cp "${CONTAINER_NAME}:${WP_PATH}/." "$LOCAL_PATH"` with error handling
  - `git`: skips resync, informs user to pull manually if needed
- Updated Section 4 WP-CLI check to set `WP_CLI_PREFIX` variable based on source type:
  - `ssh`: `ssh user@host wp_cli_path --path=wp_path` (existing behavior)
  - `docker`: `docker exec container_name wp_cli_path --path=wp_path`
  - `local`: `wp_cli_path --path=wp_path` (direct local invocation)
  - `git`: always marks WP-CLI as unavailable even if binary exists (no live DB)
- Source-type-aware WP-CLI unavailability messages (explains why, not just "unavailable")
- Inline per-skill skip messages include source type and concrete next step (install URL or connect method)
- End-of-run skipped skills summary distinguishes WP-CLI structural skips from execution errors
- Updated `/status` Step 3 to read all new profile fields with null-safe defaults
- Added source type badge (`[SSH]`, `[LOCAL]`, `[DOCKER]`, `[GIT]`) to profile heading line
- Added source-specific detail lines per source type:
  - SSH: `Source: SSH (user@host)`, `Last sync: timestamp`
  - Local: `Source: local directory`, `Path: /path`, `Files: live access (no sync needed)`
  - Docker: `Source: docker container (name)`, `File access: bind_mount/docker_cp`, bind shows "live access via bind mount", docker_cp shows last sync timestamp
  - Git: `Source: git repository`, `Remote: url (branch)`, `Clone: /path`, `Files: local clone (timestamp)`
- Added capabilities line to every profile: base skills always shown; DB/user-audit/version-audit appended only when WP-CLI available AND source is not git; reason for unavailability is source-type-specific

## Task Commits

Each task was committed atomically:

1. **Task 1: Source-type-gated resync and WP-CLI routing in /diagnose** - `cfb4afb` (feat)
2. **Task 2: Source type badges and sync status in /status** - `347a9ca` (feat)

## Files Created/Modified

- `commands/diagnose/COMMAND.md` — Section 2 extended with source-type fields; Section 3 replaced with case-gated resync; Section 4 WP-CLI check extended with source-type routing via WP_CLI_PREFIX variable and source-type-aware skip messages
- `commands/status/COMMAND.md` — Step 3 extended with new field reads, source type badges in headings, source-type-specific detail lines, source-aware sync status, capabilities line per profile

## Decisions Made

- WP_CLI_PREFIX set once before the skill execution loop — clean single-responsibility pattern; each WP-CLI skill just uses `$WP_CLI_PREFIX {command}` without needing to know the source type
- Git source always skips WP-CLI skills even when local `wp` binary exists — git repos have no live database by design; this prevents confusing "command succeeded but returned no data" behavior
- Capability gating logic is identical across /connect (Section 10), /diagnose (Section 4), and /status (capabilities line) — same three skills gated, same per-source reasons — ensures what the user sees at connection time matches runtime behavior
- End-of-run skip summary separates WP-CLI structural skips from execution errors — users can tell if skipping was due to source type vs a transient failure

## Deviations from Plan

None — plan executed exactly as written. All verification criteria confirmed before commits.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 6 (Database Performance) can use the `WP_CLI_PREFIX` pattern established here for all WP-CLI commands
- The `source_type // "ssh"` backward-compatible read is now consistently applied in connect, diagnose, and status
- All three commands are consistent: what /connect shows as unavailable at connection time, /diagnose actually skips at runtime, and /status shows in the capabilities line
- No blockers for Phase 6

---
*Phase: 05-multi-source-connection*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: commands/diagnose/COMMAND.md
- FOUND: commands/status/COMMAND.md
- FOUND: .planning/phases/05-multi-source-connection/05-02-SUMMARY.md
- FOUND commit: cfb4afb
- FOUND commit: 347a9ca
