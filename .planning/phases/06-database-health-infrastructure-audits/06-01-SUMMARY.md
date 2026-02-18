---
phase: 06-database-health-infrastructure-audits
plan: 01
subsystem: database
tags: [wp-cli, wp_options, transients, revisions, sql, database-health]

# Dependency graph
requires:
  - phase: 05-multi-source-connection
    provides: WP_CLI_PREFIX pattern for routing WP-CLI calls by source type (ssh/docker/local/git)
provides:
  - Three new diagnostic skill files for DB health analysis
  - Autoload bloat analysis with plugin attribution (diagnostic-db-autoload)
  - Transient buildup detection with ratio-based severity (diagnostic-db-transients)
  - Post revision accumulation analysis with WP_POST_REVISIONS handling (diagnostic-db-revisions)
affects:
  - 06-02 (INFR skills — infrastructure audits using same WP_CLI_PREFIX pattern)
  - 06-03 (diagnose command update — must register these three new WP_CLI_SKILLS)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic table prefix retrieval via wp db prefix with fallback to config get table_prefix"
    - "wp db query with --skip-column-names and pipe through tr -d '[:space:]' for scalar values"
    - "UNIX_TIMESTAMP() comparison in SQL for expired transient detection (never wp transient list --expired)"
    - "awk for float division in bash (EXPIRED_COUNT / LIVE_COUNT ratio)"
    - "WP_POST_REVISIONS all-4-cases handling: empty=unlimited, true=unlimited, false=disabled, number=limit"
    - "Ratio-based severity for transients (expired:live ratio + absolute count gates)"
    - "Prefix-dictionary attribution for autoload offenders (no code grepping)"

key-files:
  created:
    - skills/diagnostic-db-autoload/SKILL.md
    - skills/diagnostic-db-transients/SKILL.md
    - skills/diagnostic-db-revisions/SKILL.md
  modified: []

key-decisions:
  - "Autoload severity: Warning at 921,600 bytes (900KB), Critical at 2,097,152 bytes (2MB) — matches WP-CLI doctor threshold"
  - "Autoload offenders: all options above 10,240 bytes (10KB) sorted by size — not a fixed top-N count"
  - "Transient severity is ratio-based (expired:live), not raw count — avoids false alerts on high-turnover sites"
  - "Transient ratio thresholds: Warning at >50% expired AND >100 absolute; Info at >25% AND >50 absolute"
  - "Expired transient detection uses direct SQL on _transient_timeout_% with UNIX_TIMESTAMP() — wp transient list --expired does not exist"
  - "WP_POST_REVISIONS: all 4 value cases handled explicitly (empty, true, false, numeric)"
  - "Revision limit recommendation: 10 revisions per post — generous for editorial workflows"
  - "Revision savings estimate: (TOTAL_REVISIONS - POST_COUNT * 10) excess rows at ~2KB each"
  - "Table prefix always retrieved dynamically via wp db prefix — never hardcoded wp_"

patterns-established:
  - "DB Skill Pattern: TABLE_PREFIX from wp db prefix → wp db query with --skip-column-names → tr -d '[:space:]'"
  - "Inline attribution dictionary: ~30-entry prefix→plugin-name map inline in skill (no file I/O)"
  - "Float arithmetic in bash: awk BEGIN {printf format, calc} for ratio and percentage calculations"

requirements-completed: [DBHL-01, DBHL-02, DBHL-03, DBHL-04, DBHL-05]

# Metrics
duration: 6min
completed: 2026-02-19
---

# Phase 6 Plan 1: Database Health Skills Summary

**Three WP-CLI database health SKILL.md files — autoload bloat (with 30-entry plugin attribution dictionary), transient buildup (UNIX_TIMESTAMP SQL, ratio-based severity), and post revisions (WP_POST_REVISIONS 4-case handling, savings estimate) — all using dynamic table prefix via wp db prefix**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-19T12:46:45Z
- **Completed:** 2026-02-19T12:52:55Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- Created `diagnostic-db-autoload` skill: queries `${TABLE_PREFIX}options` for total autoloaded size, applies Warning/Critical thresholds (921,600 / 2,097,152 bytes), lists all options above 10KB with plugin attribution from a 30-entry inline prefix dictionary, produces `DBHL-AUTOLD-SZ` and `DBHL-AUTOLD-OFF` findings
- Created `diagnostic-db-transients` skill: counts live and expired transients via direct SQL using `UNIX_TIMESTAMP()` comparison on `_transient_timeout_` rows (never `wp transient list --expired`), computes ratio with awk float division, applies ratio-based severity gates, recommends `wp transient delete --expired`, produces `DBHL-TRANS-EXP` / `DBHL-TRANS-OK` findings
- Created `diagnostic-db-revisions` skill: gets total revisions via `wp post list --post_type=revision --format=count`, per-type breakdown via SQL JOIN on `${TABLE_PREFIX}posts`, checks `WP_POST_REVISIONS` constant with all 4 value cases, calculates savings estimate for limit of 10, recommends `define('WP_POST_REVISIONS', 10)`, produces `DBHL-REV-UNL` / `DBHL-REV-CNT` / `DBHL-REV-OK` findings

## Task Commits

Each task was committed atomically:

1. **Task 1: Create autoload bloat analysis skill** - `9cd73d9` (feat)
2. **Task 2: Create transient buildup detection skill** - `2c3e2f6` (feat)
3. **Task 3: Create post revision analysis skill** - `12d5a24` (feat)

## Files Created/Modified

- `skills/diagnostic-db-autoload/SKILL.md` - Autoload bloat analysis: total size check (900KB/2MB thresholds), offenders list above 10KB, plugin attribution via 30-entry prefix dictionary, findings DBHL-AUTOLD-SZ and DBHL-AUTOLD-OFF
- `skills/diagnostic-db-transients/SKILL.md` - Transient buildup detection: live count, expired count via UNIX_TIMESTAMP SQL, ratio severity, aggregate counts only, finding DBHL-TRANS-EXP and DBHL-TRANS-OK
- `skills/diagnostic-db-revisions/SKILL.md` - Revision accumulation: total count, per-type breakdown JOIN, WP_POST_REVISIONS 4-case check, savings estimate at limit 10, findings DBHL-REV-UNL / DBHL-REV-CNT / DBHL-REV-OK

## Decisions Made

No new decisions were made during execution — all decisions were pre-established in the plan based on CONTEXT.md locked decisions and Claude's Discretion resolutions from the research phase:
- Autoload thresholds: 900KB Warning, 2MB Critical (from user lock + WP-CLI doctor alignment)
- Offender threshold: >10KB options (Claude's discretion — plan specified)
- Transient ratio thresholds: >50%/100 = Warning, >25%/50 = Info (Claude's discretion from research)
- Revision recommendation: 10 per post (user-suggested, confirmed in plan)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. All three skills are passive analysis tools that read from the existing WordPress database via WP-CLI.

## Next Phase Readiness

- All three DB health skills ready for use by `/diagnose` command
- Phase 06-02 can proceed with INFR skills (HTTPS audit, file permissions) using same WP_CLI_PREFIX pattern
- Phase 06-03 must update `commands/diagnose/COMMAND.md` to register `diagnostic-db-autoload`, `diagnostic-db-transients`, and `diagnostic-db-revisions` in the `WP_CLI_SKILLS` array

---
*Phase: 06-database-health-infrastructure-audits*
*Completed: 2026-02-19*

## Self-Check: PASSED

Files verified:
- `skills/diagnostic-db-autoload/SKILL.md` — FOUND
- `skills/diagnostic-db-transients/SKILL.md` — FOUND
- `skills/diagnostic-db-revisions/SKILL.md` — FOUND

Commits verified:
- `9cd73d9` — FOUND (feat(06-01): create autoload bloat analysis skill)
- `2c3e2f6` — FOUND (feat(06-01): create transient buildup detection skill)
- `12d5a24` — FOUND (feat(06-01): create post revision analysis skill)
