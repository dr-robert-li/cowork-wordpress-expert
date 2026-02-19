---
phase: 05-multi-source-connection
plan: 01
subsystem: connection
tags: [wordpress, bash, jq, docker, git, ssh, sites-json]

# Dependency graph
requires:
  - phase: 02-connection-file-sync
    provides: SSH-based /connect flow, sites.json atomic-update pattern, rsync file sync

provides:
  - /connect with 4-option source type menu (no args)
  - Auto-detection: git URL / local path / SSH user@host / ambiguous token
  - Local directory flow: 4-marker WP validation, partial match warning, local WP-CLI probe
  - Docker container flow: container listing, WP path probe sequence, bind mount detection + docker cp fallback, docker exec WP-CLI probe
  - Git repository flow: fresh shallow clone + existing checkout sub-flows, branch listing, reconnect pull prompt
  - Extended sites.json schema: source_type, container_name, git_remote, git_branch, file_access fields
  - Backward-compatible source_type read (// "ssh" null-coalescing)
  - Capability summary display at connection time

affects:
  - 05-02 (diagnose source-type gating — reads source_type and file_access from profiles written here)
  - 06-database-performance (WP-CLI skill gating reads wp_cli_path + source_type)
  - commands/status (source type badge display reads source_type field)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Section 0 detection-first pattern: source type determined before any source-specific logic"
    - "4-marker WP validation with partial-match warning (not hard abort)"
    - "Docker bind mount detection: both directions checked (full mount + partial mount detection)"
    - "git clone --depth 1 for fresh clones; git ls-remote --symref for default branch detection"
    - "jq --arg null-string pattern for JSON null handling in bash"
    - "Capability summary block at connection completion listing WP-CLI-gated skills"

key-files:
  created: []
  modified:
    - commands/connect/COMMAND.md

key-decisions:
  - "Both tasks (source detection + Docker/git flows) implemented in single atomic write — no functional deviation, same output artifact"
  - "Section 0 precedes the saved profile shortcut check — detection runs on any unrecognized argument before profile lookup"
  - "Ambiguous bare token asks user to clarify (ssh/docker) rather than guessing — matches locked user decision"
  - "Partial bind mount edge case handled: check both startswith directions, fall back to docker cp if only subdirectory mounted"
  - "file_access field values: rsync (ssh), direct (local/git), bind_mount (docker with bind), docker_cp (docker without bind)"

patterns-established:
  - "Source type detection order: git URL first (before user@host to avoid false SSH match), then local path, then SSH pattern, then ambiguous"
  - "All source-specific SSH sections labeled 'This section runs only when source_type is ssh' for clarity"
  - "Reconnect behavior per source type: SSH re-verifies, Docker re-copies if docker_cp, Git asks before pull, Local skips (always live)"

requirements-completed: [MSRC-01, MSRC-02, MSRC-03, MSRC-04, MSRC-05, MSRC-07]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 5 Plan 01: Multi-Source Connection Command Summary

**Extended /connect from SSH-only to 4-source-type command (SSH/Local/Docker/Git) with auto-detection, per-source acquisition flows, and extended sites.json schema including source_type, file_access, and git/docker metadata fields**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T20:54:25Z
- **Completed:** 2026-02-18T20:58:49Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added Section 0 (source type detection) to /connect: 4-option menu for bare `/connect`, auto-detection via pattern matching (git URL, local path, SSH user@host, ambiguous token), and per-type routing
- Added Section 1A (local directory flow): `~` expansion + `realpath` path resolution, 4-marker WordPress validation with partial-match warning, local WP-CLI probe, profile name from basename
- Added Section 1B (Docker container flow): container listing via `docker ps`, WP path probe across 6 known paths, dual-direction bind mount detection with docker cp fallback, WP-CLI probe via docker exec, partial bind mount edge case documented
- Added Section 1C (Git repository flow): fresh clone sub-flow (shallow `--depth 1`, branch listing via `git ls-remote`, clone auth error guidance) + existing checkout sub-flow (metadata read, branch switch offer, reconnect pull prompt)
- Extended sites.json profile save logic with new fields for all source types: source_type, container_name, git_remote, git_branch, file_access (with null-handling via jq `--arg` string-null pattern)
- Preserved all existing SSH flow sections intact, each labeled "This section runs only when source_type is 'ssh'"
- Added backward-compatible source_type read: `.source_type // "ssh"` null-coalescing throughout
- Added Section 10 (capability summary): WP-CLI-gated skills shown as checked/unchecked with reason per source type
- Added reconnect behavior per source type: git asks before pull (not auto-pull), docker re-probes container status, local skips resync (always live)

## Task Commits

Each task was committed atomically:

1. **Task 1: Source type detection and local directory flow** - `bc546b0` (feat)

Note: Task 2 content (Docker and Git flows) was included in the same write operation as Task 1 since both tasks modify the same single-file artifact. Both tasks' done criteria are fully satisfied by commit `bc546b0`.

**Plan metadata:** (created in this summary commit)

## Files Created/Modified

- `commands/connect/COMMAND.md` - Extended from SSH-only to 4-source-type command: added Section 0 (detection), Sections 1A/1B/1C (local/docker/git flows), Section 10 (capability summary), extended profile save logic in Section 9, backward-compatible reconnect in Section 1

## Decisions Made

- Both tasks implemented in a single write operation because they modify the same file — this is not a deviation, it's a natural consequence of the output artifact being a single COMMAND.md. Both tasks' verification criteria are confirmed met.
- Section 0 is placed as the absolute first logic step, before even the saved profile shortcut check — this ensures detection runs on any unrecognized argument
- Ambiguous bare token (bare alphanumeric) prompts user to clarify (ssh/docker) rather than guessing — matches the locked user decision from CONTEXT.md
- Partial bind mount edge case (only wp-content mounted, not full WP root) falls back to docker cp — this matches the research finding in 05-RESEARCH.md Pitfall 1

## Deviations from Plan

None — plan executed exactly as written. Both tasks modified the same file and were captured in a single commit. All verification criteria confirmed before commit.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 5 Plan 02 (diagnose source-type gating) can now read `source_type` and `file_access` from any saved profile
- The `// "ssh"` null-coalescing pattern is established — Plan 02 and all later phases should use it when reading source_type
- Capability gating logic demonstrated in Section 10 of COMMAND.md — Plan 02 follows this same pattern to gate WP-CLI-dependent skills in /diagnose
- No blockers for Plan 02

---
*Phase: 05-multi-source-connection*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: commands/connect/COMMAND.md
- FOUND: .planning/phases/05-multi-source-connection/05-01-SUMMARY.md
- FOUND commit: bc546b0
