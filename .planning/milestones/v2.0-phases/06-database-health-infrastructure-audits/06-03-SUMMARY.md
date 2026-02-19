---
phase: 06-database-health-infrastructure-audits
plan: 03
subsystem: infra
tags: [wp-cli, diagnose, command, skill-registration, db-health, https, file-permissions]

# Dependency graph
requires:
  - phase: 06-database-health-infrastructure-audits
    provides: Three DB health skills (diagnostic-db-autoload, diagnostic-db-transients, diagnostic-db-revisions) and two INFR skills (diagnostic-https-audit, diagnostic-file-permissions)

provides:
  - /diagnose command updated with all 5 Phase 6 skills registered in full mode
  - WP_CLI_SKILLS array expanded from 3 to 6 entries (adds db-autoload, db-transients, db-revisions)
  - HTTPS audit and file permissions skills properly left to self-gate (not in WP_CLI_SKILLS)
  - Full mode now runs 11 diagnostic skills (was 6)

affects:
  - /investigate workflow (skill pool)
  - Phase 7 performance (diagnose command as reference)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-gating skills excluded from WP_CLI_SKILLS array — HTTPS and file-permissions gate themselves internally"
    - "WP_CLI_SKILLS array as the explicit gating mechanism for DB skills that require live database access"

key-files:
  created: []
  modified:
    - commands/diagnose/COMMAND.md

key-decisions:
  - "diagnostic-https-audit is NOT in WP_CLI_SKILLS — dual-gated internally, Part B (grep) runs without WP-CLI for any LOCAL_PATH source"
  - "diagnostic-file-permissions is NOT in WP_CLI_SKILLS — SSH-only skill self-gates on source_type internally"
  - "Three DB skills (db-autoload, db-transients, db-revisions) ARE in WP_CLI_SKILLS — require live database, no fallback"

patterns-established:
  - "Full skill registration pattern: full mode SKILLS array + WP_CLI_SKILLS gating + all skip messages"

requirements-completed: [DBHL-01, DBHL-02, DBHL-03, INFR-01, INFR-02]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 6 Plan 03: Diagnose Command Skill Registration Summary

**Updated /diagnose COMMAND.md to run 11 skills in full mode — 5 new Phase 6 registrations with DB skills gated via WP_CLI_SKILLS and INFR skills self-gating internally**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T23:36:33Z
- **Completed:** 2026-02-18T23:38:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Expanded full mode SKILLS array from 6 to 11 entries — added diagnostic-db-autoload, diagnostic-db-transients, diagnostic-db-revisions, diagnostic-https-audit, diagnostic-file-permissions
- Expanded WP_CLI_SKILLS array from 3 to 6 entries — added the three DB health skills that require live database access via WP-CLI
- Left diagnostic-https-audit and diagnostic-file-permissions out of WP_CLI_SKILLS correctly — both skills self-gate (HTTPS via dual-gate, file-permissions via SSH-only check)
- Updated all descriptive text: frontmatter modes line, inline mode mappings description, and all 5 skip message instances to list 6 WP-CLI-dependent skills

## Task Commits

Each task was committed atomically:

1. **Task 1: Register Phase 6 skills in /diagnose command** - `ba4af5e` (feat)

## Files Created/Modified

- `commands/diagnose/COMMAND.md` — Updated diagnose command: full mode SKILLS array (11 entries), WP_CLI_SKILLS array (6 entries), frontmatter skill count, mode description, and all skip message text

## Decisions Made

No new decisions made during execution — all gating decisions were pre-established in prior plans:
- DB skills in WP_CLI_SKILLS because they require live database (no fallback path)
- HTTPS skill excluded from WP_CLI_SKILLS (confirmed in 06-02: Part B grep runs without WP-CLI)
- File permissions skill excluded from WP_CLI_SKILLS (confirmed in 06-02: SSH-only self-gate)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. This plan only updates the diagnose command documentation to register the skills created in 06-01 and 06-02.

## Next Phase Readiness

- All Phase 6 skills (5 new + 6 existing = 11 total) are now registered and routed correctly in /diagnose
- Phase 6 is complete — all 3 plans executed (wave 1: 06-01 DB skills, 06-02 INFR skills; wave 2: 06-03 command wiring)
- Phase 7 (Performance) can proceed — note the blocker in STATE.md: wp package install for wp-cli/profile-command fails on shared hosting; degradation path must be specified in planning

---
*Phase: 06-database-health-infrastructure-audits*
*Completed: 2026-02-19*

## Self-Check: PASSED

Files verified:
- `commands/diagnose/COMMAND.md` — FOUND

Commits verified:
- `ba4af5e` — FOUND (feat(06-03): register all Phase 6 skills in /diagnose command)
