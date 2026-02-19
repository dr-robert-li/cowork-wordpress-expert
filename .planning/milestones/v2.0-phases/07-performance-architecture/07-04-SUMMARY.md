---
phase: 07-performance-architecture
plan: "04"
subsystem: diagnostics
tags: [wp-diagnostics, skill, architecture, narrative, health-grade, synthesis, aggregator]

# Dependency graph
requires:
  - phase: 03-diagnostic-skills-reporting
    provides: report-generator skill with A-F grading matrix (thresholds copied exactly)
  - phase: 07-performance-architecture
    provides: diagnostic skills producing COMBINED_FINDINGS (N+1, cron, profile, architecture)
provides:
  - AI-synthesized cross-domain health narrative skill (diagnostic-arch-narrative)
  - Single ARCH-NARR finding with A-F grade, domain-grouped bullet-points, Top 3 ranked issues
affects:
  - /diagnose command (must register diagnostic-arch-narrative last in full-mode skill list)
  - 07-05 (phase 7 wrap-up, if any)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aggregator skill pattern: read COMBINED_FINDINGS, produce ONE synthesized finding"
    - "Must-run-last skill registration: sequencing constraint documented prominently at top of file"
    - "Narrative severity mapping: A/B=Info, C=Warning, D/F=Critical"
    - "Domain priority for Top 3 ranking: Security > DB Health > Performance > Code Quality > Architecture > Infrastructure"

key-files:
  created:
    - skills/diagnostic-arch-narrative/SKILL.md
  modified: []

key-decisions:
  - "Narrative output is bullet-point by domain (LOCKED) — not prose paragraphs"
  - "Grading matrix is identical first-match-wins thresholds from report-generator — no divergence"
  - "Skill produces exactly ONE finding with fixed ID ARCH-NARR regardless of finding count"
  - "Empty COMBINED_FINDINGS produces Warning fallback (not silent failure)"
  - "Prior scan grade comparison is supplementary context only — grade always computed fresh"
  - "Domain priority ordering for Top 3: Security > Database Health > Performance > Code Quality > Architecture > Infrastructure"
  - "Condensing rule for large domains: >5 findings → group Critical as summary line"

patterns-established:
  - "Aggregator skill pattern: reads COMBINED_FINDINGS instead of running new checks — documented as precedent"
  - "Must-run-last constraint: prominent warning at top of SKILL.md + dedicated Skill Registration section"

requirements-completed:
  - ARCH-03

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 7 Plan 04: Diagnostic Architecture Narrative Summary

**AI-synthesis aggregator skill that reads all diagnostic findings, applies the standard A-F grading matrix, and outputs a single ARCH-NARR finding with domain-grouped bullet-point narrative and "Top 3 issues to fix first"**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T01:03:25Z
- **Completed:** 2026-02-19T01:05:42Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Created `skills/diagnostic-arch-narrative/SKILL.md` — the culminating synthesis skill for full diagnostic runs
- Grading matrix thresholds copied exactly from report-generator (first-match-wins, identical thresholds)
- Locked output format: bullet-point by domain (Security, Code Quality, Database Health, Performance, Architecture, Infrastructure) — not prose paragraphs
- Top 3 issues ranking by severity tier then domain business impact priority
- Prior scan grade comparison via memory/{site}/latest.md with improved/degraded/unchanged verdict
- Empty COMBINED_FINDINGS fallback handled with Warning finding (not silent failure)
- Sequencing requirement prominently documented: must run last in /diagnose skill list

## Task Commits

Each task was committed atomically:

1. **Task 1: Create diagnostic-arch-narrative SKILL.md** - `cf5bb09` (feat)

## Files Created/Modified

- `skills/diagnostic-arch-narrative/SKILL.md` - Aggregator skill spec: reads COMBINED_FINDINGS, applies grading matrix, produces ARCH-NARR finding with cross-domain bullet narrative and Top 3 ranked issues

## Decisions Made

- Locked output to bullet-point format by domain (not prose) — ensures consistent scannable output that scales to any number of findings
- Grading matrix is strictly identical to report-generator — no drift between the two report paths
- Single ARCH-NARR finding ID regardless of input size — enables consistent downstream handling
- Domain priority for Top 3: Security first (exploitability), then Database Health (data integrity), then Performance (user impact), then Code Quality, Architecture, Infrastructure
- Prior scan context is supplementary only — the narrative grade is always freshly computed from COMBINED_FINDINGS, never inherited from prior report

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- diagnostic-arch-narrative skill ready for registration as final skill in /diagnose full-mode sequence
- Phase 7 plan 05 can proceed (final phase 7 plan if any remaining)
- All 4 phase 7 skills now complete: N+1 detection (07-01), cron audit (07-02), query profiling (07-03), architecture narrative (07-04)

---
*Phase: 07-performance-architecture*
*Completed: 2026-02-19*

## Self-Check: PASSED

- `skills/diagnostic-arch-narrative/SKILL.md` — FOUND
- Commit `cf5bb09` — verified via git log
