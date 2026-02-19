---
phase: 08-findings-trends-batch-operations
plan: 01
subsystem: diagnostics
tags: [trend-tracking, findings, jq, sed, bash, memory, json]

# Dependency graph
requires:
  - phase: 07-performance-architecture
    provides: /diagnose command with 16 skills and report-generator writing latest.md
provides:
  - skills/trend-tracker/SKILL.md — post-report aggregator classifying findings as NEW/RECURRING, patching badges, writing trends.json
  - commands/diagnose/COMMAND.md Section 5.5 — trend-tracker invocation after report generation for all modes
affects:
  - 08-02-comparison-matrix — consumes trends.json schema (grade, counts, skill_coverage, findings array)
  - any plan reading memory/{site}/latest.md — report now patched with [NEW]/[RECURRING] badges after second scan

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-report aggregator pattern: skill runs after report-generator, reads findings data, does not connect to WordPress or run new checks"
    - "2-slot trends.json rotation: current_scan becomes prior_scan on each run, oldest data discarded"
    - "Content-based finding ID matching: exact ID first, fuzzy (finding_type + file_path) fallback for renamed/reformatted code"
    - "Atomic file write: jq to /tmp then mv to avoid partial writes corrupting trends.json"
    - "macOS/Linux sed compatibility: sed -i '' with || sed -i fallback"

key-files:
  created:
    - skills/trend-tracker/SKILL.md
  modified:
    - commands/diagnose/COMMAND.md

key-decisions:
  - "Trend tracker runs as post-report aggregator (after report-generator writes latest.md), never before — sequencing enforced in Section 5.5"
  - "2-scan retention policy: current + prior only, no deeper history — sufficient for NEW/RECURRING at low storage cost"
  - "REGRESSION classification explicitly not implemented: reappeared findings shown as NEW due to 2-scan limit (documented as known limitation)"
  - "Fuzzy match on finding_type + file_path accepted as trade-off: catches reformatted code but may produce false RECURRING when same type appears multiple times in same file"
  - "Mode-agnostic trend tracking: Section 5.5 runs for all modes (full, security-only, code-only, performance)"

patterns-established:
  - "Aggregator skills produce no new findings themselves — they read COMBINED_FINDINGS and write side effects (patched markdown, JSON files)"
  - "Section X.5 numbering used for post-processing steps in /diagnose that occur between major phases (report generation -> completion summary)"

requirements-completed: [TRND-01, TRND-02, TRND-03]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 8 Plan 01: Trend Tracker Summary

**Trend-tracker skill with 2-slot rotation writes NEW/RECURRING badges to latest.md and persists finding history in trends.json using exact ID match with fuzzy type+path fallback**

## Performance

- **Duration:** 4 min (222s)
- **Started:** 2026-02-19T06:01:35Z
- **Completed:** 2026-02-19T06:05:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `skills/trend-tracker/SKILL.md` as a complete post-report aggregator with 7-step implementation
- Integrated trend-tracker into `/diagnose` as Section 5.5 after report generation, runs for all diagnostic modes
- Implemented 2-pass finding classification: exact ID match then fuzzy (finding_type + file_path) fallback
- Documented REGRESSION limitation (2-scan retention cannot distinguish resolved+reappeared from new) and fuzzy match trade-offs
- Established trends.json 2-slot rotation schema compatible with Plan 08-02 comparison matrix requirements

## Task Commits

Each task was committed atomically:

1. **Task 1: Create trend-tracker skill** - `6193dd0` (feat)
2. **Task 2: Integrate trend-tracker into /diagnose command** - `73b3d99` (feat)

## Files Created/Modified

- `skills/trend-tracker/SKILL.md` - Post-report aggregator: reads COMBINED_FINDINGS, classifies as NEW/RECURRING, patches latest.md badges, writes trends.json with 2-slot rotation
- `commands/diagnose/COMMAND.md` - Added Section 5.5 (Trend Tracking Post-Report) between Section 5 and Section 6

## Decisions Made

- Mode-agnostic trend tracking: Section 5.5 runs after every diagnostic mode (full, security-only, code-only, performance). trends.json records whatever findings the current mode produced.
- 2-scan retention policy locked (current + prior): sufficient for NEW/RECURRING classification per Phase 8 research decisions. Plan 08-02 will surface grade trends using the grade/count fields in both slots.
- REGRESSION limitation explicitly documented: with only 2 scans retained, findings that resolved and reappeared are classified as [NEW] — the resolution event is not recorded. Accepted as a known constraint.
- Fuzzy match on (finding_type + file_path) accepted as trade-off for catching reformatted code even when the content hash changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 08-01 complete: trend-tracker skill available at `skills/trend-tracker/SKILL.md`, /diagnose updated with Section 5.5
- Plan 08-02 (comparison matrix) can consume trends.json schema directly — grade, critical_count, warning_count, info_count, skill_coverage, findings array all present
- trends.json written atomically with temp file + mv pattern — safe for concurrent reads by Plan 08-02

---
*Phase: 08-findings-trends-batch-operations*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: skills/trend-tracker/SKILL.md
- FOUND: commands/diagnose/COMMAND.md (with Section 5.5)
- FOUND: .planning/phases/08-findings-trends-batch-operations/08-01-SUMMARY.md
- FOUND commit: 6193dd0 (feat: create trend-tracker skill)
- FOUND commit: 73b3d99 (feat: integrate trend-tracker into /diagnose)
