---
phase: 07-performance-architecture
plan: 01
subsystem: performance
tags: [n+1-queries, static-analysis, grep, php, wordpress-performance, diagnostic-skill]

# Dependency graph
requires:
  - phase: 03-diagnostic-skills-reporting
    provides: skill structure pattern (two-pass grep+AI analysis, finding ID format, WP.org plugin skip logic)
  - phase: 06-database-health-infrastructure-audits
    provides: self-gating skill pattern (LOCAL_PATH check, WP_CLI_AVAILABLE gate, output format)

provides:
  - N+1 query pattern detection skill with three confidence tiers (High/Medium/Low)
  - PERF-N1-{hash} finding ID format for performance diagnostic findings
  - WP.org plugin skip list (22 patterns) for custom-code-only scanning
  - Two-pass analysis pattern: grep candidates then AI contextual confirmation

affects:
  - 07-02-PLAN.md (establishes PERF-* finding ID prefix convention)
  - 07-05-PLAN.md (diagnostic-arch-narrative reads PERF-N1-* findings for synthesis)
  - commands/diagnose/COMMAND.md (skill registered under performance mode)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-gating skill: check LOCAL_PATH presence before any file operations"
    - "Two-pass analysis: grep for pattern candidates, AI reads ±20 lines for context"
    - "WP.org plugin skip list applied via shell glob case matching"
    - "Finding ID: MD5 of file_path:line_number:pattern_type truncated to 6 chars"
    - "Severity stratification: Warning for High/Medium confidence, Info for Low confidence"

key-files:
  created:
    - skills/diagnostic-performance-n1/SKILL.md
  modified: []

key-decisions:
  - "Three confidence tiers LOCKED: High=query-inside-loop, Medium=get_post-with-loop-in-context, Low=sequential-queries-no-loop"
  - "Custom code only — skip 22 well-known WP.org plugin patterns (woocommerce, yoast, elementor, etc.)"
  - "Rewrite suggestions use actual variable names from scanned code, never generic $posts/$post_ids"
  - "No WP-CLI required — purely static analysis on locally synced PHP files"
  - "Low confidence findings use Info severity (speculative), High/Medium use Warning"

patterns-established:
  - "PERF-N1-{hash}: MD5-based content-addressable finding ID for performance findings at specific code locations"
  - "PERF-N1-CLEAN: clean-scan sentinel finding when no patterns found"
  - "PERF-N1-SKIP: skip sentinel finding when LOCAL_PATH missing"

requirements-completed: [PERF-01]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 7 Plan 01: N+1 Query Detection Skill Summary

**N+1 query pattern detection skill with three-tier confidence (High/Medium/Low), WP.org plugin skip list, and variable-name-aware rewrite suggestions for WordPress custom code**

## Performance

- **Duration:** ~3 min (146 seconds)
- **Started:** 2026-02-19T01:03:30Z
- **Completed:** 2026-02-19T01:05:56Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `skills/diagnostic-performance-n1/SKILL.md` — complete skill specification for N+1 query detection
- Implemented three-tier confidence system with LOCKED definitions matching user decisions from CONTEXT.md
- WP.org plugin skip list with 22 patterns (woocommerce, yoast, elementor, jetpack, wordfence, gravityforms, ACF, etc.)
- Two-pass analysis: grep for candidate patterns, AI contextual analysis to confirm and extract variable names
- Rewrite suggestion examples using actual variable names (`$event_ids`, `$venue`, `$member_list`) not generic names
- Self-gating pattern: returns PERF-N1-SKIP immediately if LOCAL_PATH missing or empty
- Full output format: PERF-N1-{hash} findings, PERF-N1-CLEAN (clean scan), PERF-N1-SKIP (no local files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create diagnostic-performance-n1 SKILL.md** - `6f6086e` (feat)

## Files Created/Modified

- `skills/diagnostic-performance-n1/SKILL.md` — Complete N+1 query detection skill specification covering all three confidence tiers, WP.org skip list, grep patterns, AI analysis protocol, rewrite suggestion examples, and all required JSON output formats

## Decisions Made

- Confidence tier definitions follow LOCKED user decisions: High = query function directly inside foreach/while body; Medium = get_post/get_post_meta with loop confirmed in 10 lines of context; Low = sequential $wpdb->get_results on same table within 10 lines
- Low confidence severity is Info (not Warning) — these are speculative and require user investigation before acting
- Rewrite suggestions must extract actual variable names from file content (Pass 2 requirement), not use generic template names
- WP.org skip list uses shell glob case matching for efficient directory filtering
- MD5 hash of `{file_path}:{line_number}:{pattern_type}` truncated to 6 chars for finding IDs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `diagnostic-performance-n1` skill is complete and ready to be registered in `commands/diagnose/COMMAND.md`
- PERF-N1-{hash} finding ID format established as the convention for Phase 7 performance skills
- Ready to proceed with 07-02 (diagnostic-cron-analysis skill)

---
*Phase: 07-performance-architecture*
*Completed: 2026-02-19*

## Self-Check: PASSED

- [x] `skills/diagnostic-performance-n1/SKILL.md` exists
- [x] Task commit `6f6086e` exists in git log
- [x] Frontmatter present with name and description
- [x] Three confidence tier definitions present (High, Medium, Low)
- [x] WP.org plugin skip list includes all required entries
- [x] Finding ID format is PERF-N1-{hash}
- [x] Fix field uses actual variable names (event_ids, event_id, venue, capacity)
- [x] JSON output format has all 8 required fields (id, severity, category, title, summary, detail, location, fix)
- [x] PERF-N1-CLEAN finding defined
- [x] Skill does NOT require WP-CLI
