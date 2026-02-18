---
phase: 06-database-health-infrastructure-audits
plan: 02
subsystem: infra
tags: [https, ssl, mixed-content, file-permissions, security, ssh, wp-cli, grep]

# Dependency graph
requires:
  - phase: 05-multi-source-connection
    provides: source_type routing, WP_CLI_PREFIX pattern, WP_CLI_AVAILABLE flag, LOCAL_PATH for synced files

provides:
  - HTTPS/SSL audit skill with dual-gated structure (WP-CLI + code grep independently)
  - File permission security check skill (SSH-only with explanatory skip for non-SSH)
  - Finding IDs: INFR-HTTPS-URL, INFR-HTTPS-SSL, INFR-HTTPS-MXD, INFR-HTTPS-OK
  - Finding IDs: INFR-PERM-CFG, INFR-PERM-HTA, INFR-PERM-UPL, INFR-PERM-DBG, INFR-PERM-SKP, INFR-PERM-OK

affects:
  - diagnose command (skill selection and execution)
  - investigate workflow (skill pool)
  - reporting (INFR-category findings)
  - phase 07 performance (skill pattern reference)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dual-gated skill: Part A (WP-CLI) and Part B (local grep) gate independently on different capabilities
    - Self-gating skill pattern: skill checks its own preconditions rather than being gated by skill array
    - Linux stat -c %a for remote permission checking (not macOS stat -f %OLp)
    - Octal bit operations for permission threshold detection ($((8#$PERMS & 4)) for world-read)
    - WP_DEBUG conditional logic: check flag before flagging debug.log exposure

key-files:
  created:
    - skills/diagnostic-https-audit/SKILL.md
    - skills/diagnostic-file-permissions/SKILL.md
  modified: []

key-decisions:
  - "HTTPS skill is NOT in WP_CLI_SKILLS array — dual-gated internally, Part B runs without WP-CLI"
  - "File permissions skill is SSH-only; non-SSH sources get INFR-PERM-SKP explaining rsync normalizes permissions"
  - "debug.log only flagged when WP_DEBUG=enabled AND file exists AND world-readable"
  - "wp-config.php world-readable detection uses octal bit ops (8#$PERMS & 4), not exact value match — catches 644, 755, 777 etc."
  - "False-positive grep filters exclude: localhost, example.com/org/net, php.net, wordpress.org, w3.org, ietf.org, XML namespaces"

patterns-established:
  - "Self-gating skill: check preconditions at top (source_type, WP_CLI_AVAILABLE, LOCAL_PATH) before running"
  - "Dual-gated skill: two independently-conditional sections within a single skill file"
  - "Linux stat syntax for SSH: stat -c %a (NOT macOS stat -f %OLp)"
  - "Octal bit operations for permission thresholds: $((8#$PERMS & 4)) world-read, $((8#$PERMS & 2)) world-write"
  - "Conditional debug.log: check WP_DEBUG via WP-CLI first, fall back to SSH grep on wp-config.php"

requirements-completed: [INFR-01, INFR-02]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 6 Plan 02: Infrastructure Audit Skills Summary

**HTTPS audit skill with dual-gated WP-CLI+grep checks plus SSH-only file permission auditor with per-file severity thresholds and conditional debug.log logic**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T23:26:41Z
- **Completed:** 2026-02-18T23:30:50Z
- **Tasks:** 2 completed
- **Files modified:** 2 created

## Accomplishments

- Created `skills/diagnostic-https-audit/SKILL.md` with dual-gating: Part A (WP-CLI) checks siteurl scheme, home URL scheme, and FORCE_SSL_ADMIN; Part B (grep) scans PHP/JS files for hardcoded http:// URLs with false-positive filtering
- Created `skills/diagnostic-file-permissions/SKILL.md` with SSH-only gating, four file checks (wp-config.php/htaccess/uploads/debug.log), WP_DEBUG-conditional debug.log logic, and explanatory skip finding for non-SSH sources
- Established self-gating skill pattern — both skills manage their own precondition checks rather than relying on WP_CLI_SKILLS array membership

## Task Commits

Each task was committed atomically:

1. **Task 1: Create HTTPS/SSL configuration audit skill** - `fdbf356` (feat)
2. **Task 2: Create file permission check skill** - `dcc9455` (feat)

## Files Created/Modified

- `skills/diagnostic-https-audit/SKILL.md` — HTTPS/SSL audit skill with dual-gated structure; Part A WP-CLI checks for URL schemes and FORCE_SSL_ADMIN; Part B grep scan for hardcoded http:// URLs across PHP/JS files; finding IDs: INFR-HTTPS-URL, INFR-HTTPS-SSL, INFR-HTTPS-MXD, INFR-HTTPS-OK
- `skills/diagnostic-file-permissions/SKILL.md` — File permission audit skill with SSH-only gating; checks wp-config.php (Critical if 644+), .htaccess (Warning if 666/777), uploads/ (Warning if 777), debug.log (Warning if world-readable when WP_DEBUG enabled); finding IDs: INFR-PERM-CFG, INFR-PERM-HTA, INFR-PERM-UPL, INFR-PERM-DBG, INFR-PERM-SKP, INFR-PERM-OK

## Decisions Made

- HTTPS skill is NOT in WP_CLI_SKILLS array — it self-gates internally because Part B (grep) runs without WP-CLI for any source with LOCAL_PATH. Adding it to the array would prevent Part B from running on local/docker/git sources.
- File permissions skill is SSH-only because rsync normalizes permissions during sync — local file copies do not reflect actual server permissions and would give false readings.
- debug.log is only flagged when WP_DEBUG is actively enabled — a stale debug.log from a previous debug session while WP_DEBUG is now off is not an active risk.
- World-readable detection uses octal bit operations (`$((8#$PERMS & 4))`) rather than exact value matching — this correctly catches 644, 664, 666, 755, 775, 777 and any other scheme where the others-read bit is set.
- False-positive grep filters are conservative: exclude php.net, wordpress.org, w3.org, ietf.org, XML namespace prefixes (`http://schemas.`, `http://www.w3.`), example.com/org/net, and localhost to reduce noise in large codebases.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both infrastructure audit skills are ready for use by `/diagnose` and `/investigate` commands
- Skills follow the self-gating pattern established in this plan — consume WP_CLI_AVAILABLE, SOURCE_TYPE, and LOCAL_PATH from the site profile
- Plan 06-03 (DB health checks) can proceed — it uses the same WP_CLI_PREFIX pattern used in Part A of the HTTPS skill

---
*Phase: 06-database-health-infrastructure-audits*
*Completed: 2026-02-19*

## Self-Check: PASSED

- `skills/diagnostic-https-audit/SKILL.md` — FOUND
- `skills/diagnostic-file-permissions/SKILL.md` — FOUND
- Commit `fdbf356` (HTTPS audit skill) — FOUND in git log
- Commit `dcc9455` (file permissions skill) — FOUND in git log
