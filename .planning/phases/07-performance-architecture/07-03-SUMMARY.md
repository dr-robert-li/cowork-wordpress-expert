---
phase: 07-performance-architecture
plan: 03
subsystem: diagnostic-skills
tags: [wordpress, architecture, cpt, hooks, caching, grep, wpcli, static-analysis]

# Dependency graph
requires:
  - phase: 07-performance-architecture
    provides: Research establishing CPT row-count patterns, hook abuse thresholds, WP_CLI_PREFIX routing, and WP.org plugin skip list
  - phase: 06-database-health-infrastructure-audits
    provides: Self-gating skill pattern (WP_CLI_AVAILABLE check), WP_CLI_PREFIX routing, dynamic table prefix retrieval

provides:
  - Architecture skill covering CPT misuse (dead CPTs, data-store abuse via row counts), hook abuse (excessive callbacks, expensive init hooks, priority conflicts), and caching anti-patterns (no persistent cache, permanent transients, uncached DB queries)
  - Independent 3-part gating: Part A (WP-CLI required), Part B (always runs), Part C (mixed)
  - WP.org plugin skip list applied across all grep-based checks
  - Partial-results behavior: WP-CLI unavailable emits ARCH-CPT-SKIP finding and continues to Parts B+C

affects: [diagnostic-arch-narrative, commands/diagnose, 07-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-gating skill pattern: WP-CLI check emits skip finding and continues other sections (not full abort)"
    - "WP.org plugin skip list applied at grep level via --exclude-dir flags"
    - "CPT custom-code filter: grep register_post_type before flagging any WP-CLI CPT row count result"
    - "Heuristic findings (ARCH-CACHE-DB) use Info severity with explicit note that manual review is needed"
    - "Finding IDs: ARCH-{domain}-{md5-hash-6-chars} for location-specific, ARCH-{domain}-{CODE} for structural"

key-files:
  created:
    - skills/diagnostic-architecture/SKILL.md
  modified: []

key-decisions:
  - "CPT misuse thresholds: 0 posts = Warning (dead CPT), 1-5 = Info (possibly orphaned), >10000 = Warning (data-store misuse), 6-10000 = no finding"
  - "Hook abuse callback threshold: >=20 registrations = Warning, 10-19 = Info; triggered per hook name not per file"
  - "Expensive init operations: flag WP_Query, $wpdb->query/get_results, wp_remote_get, file_get_contents on init/wp_loaded"
  - "C3 uncached DB query check is heuristic (Info only) — may be false positive for admin-only or infrequently-called functions"
  - "Object cache fallback: when WP-CLI unavailable, check for object-cache.php drop-in file instead of wp cache type"
  - "Permanent transient regex targets set_transient with literal 0 as third argument (not variables)"

patterns-established:
  - "Independent multi-part skill gating: emit domain-specific skip finding + continue to remaining parts"
  - "CPT scope enforcement: cross-reference WP-CLI post-type list against grep for register_post_type in custom dirs"

requirements-completed: [ARCH-01, ARCH-02]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 7 Plan 03: Diagnostic Architecture Summary

**WordPress architecture skill covering CPT misuse detection (dead/excessive), hook abuse (callback count, expensive init hooks, priority conflicts), and caching anti-patterns — with independent per-section WP-CLI gating**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T01:03:34Z
- **Completed:** 2026-02-19T01:07:17Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `skills/diagnostic-architecture/SKILL.md` with three independently-gated sections covering all ARCH-01 and ARCH-02 requirements
- Part A CPT checks: WP-CLI gated with skip-and-continue pattern; custom-code-only scope via register_post_type grep cross-reference; dead/few/excessive row count thresholds
- Part B hook abuse: always-runs static grep — excessive callbacks (>=20 Warning, 10-19 Info), expensive operations on init/wp_loaded, same hook+priority cross-plugin conflicts
- Part C caching: wp cache type with object-cache.php fallback, set_transient 0-expiry detection, heuristic uncached DB query finder
- WP.org plugin skip list (30 well-known plugins) applied consistently across all grep-based checks

## Task Commits

Each task was committed atomically:

1. **Task 1: Create diagnostic-architecture SKILL.md** - `a96e995` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/skills/diagnostic-architecture/SKILL.md` — Complete architecture review skill with CPT misuse, hook abuse, and caching anti-pattern detection

## Decisions Made

- CPT thresholds delegated to Claude's discretion per CONTEXT.md: 0 posts = Warning, 1-5 = Info, >10,000 = Warning, 6-10,000 = no finding (reasonable count)
- Hook callback threshold: >=20 Warning (same threshold as plan spec), 10-19 Info added for early warning
- Heuristic C3 (uncached DB queries) set to Info only — too prone to false positives at Warning level for frontend context detection
- Object cache fallback: when WP-CLI unavailable, check wp-content/object-cache.php existence — less authoritative but provides a useful signal without requiring WP-CLI

## Deviations from Plan

None - plan executed exactly as written. All plan-specified check patterns, thresholds, finding IDs, and gating behaviors implemented per specification.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 complete: diagnostic-architecture skill ready
- Plan 04 (diagnostic-wpcli-profile) can execute next
- Plan 05 (diagnostic-arch-narrative) depends on Plans 01-04 all being complete since it aggregates findings
- The diagnostic-architecture skill should be registered in commands/diagnose under full mode — this will be handled in Plan 04's diagnose command update or a dedicated registration task

---
*Phase: 07-performance-architecture*
*Completed: 2026-02-19*
