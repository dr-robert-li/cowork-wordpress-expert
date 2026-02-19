---
phase: 07-performance-architecture
plan: 05
subsystem: command-registration
tags: [diagnose-command, skill-registration, performance-mode, wp-cli-gating]
dependency_graph:
  requires:
    - 07-01 (diagnostic-performance-n1 skill)
    - 07-02 (diagnostic-cron-analysis, diagnostic-wpcli-profile skills)
    - 07-03 (diagnostic-architecture skill)
    - 07-04 (diagnostic-arch-narrative skill)
  provides:
    - /diagnose command updated with all 16 skills registered
    - performance mode (3 skills: n1, cron-analysis, wpcli-profile)
    - WP_CLI_SKILLS gating for cron-analysis and wpcli-profile
  affects:
    - commands/diagnose/COMMAND.md
tech_stack:
  added: []
  patterns:
    - skill-registration pattern (SKILLS array entries)
    - WP_CLI_SKILLS gating pattern (extended)
    - mode detection pattern (performance added)
key_files:
  created: []
  modified:
    - commands/diagnose/COMMAND.md
decisions:
  - Frontmatter modes list updated to 4 modes including performance
  - full mode extended from 11 to 16 skills with arch-narrative as final entry
  - performance mode added with 3 skills (n1, cron-analysis, wpcli-profile)
  - WP_CLI_SKILLS extended from 6 to 8 (added cron-analysis, wpcli-profile)
  - diagnostic-performance-n1 excluded from WP_CLI_SKILLS (pure grep, no WP-CLI)
  - diagnostic-architecture excluded from WP_CLI_SKILLS (self-gating internally)
  - diagnostic-arch-narrative excluded from WP_CLI_SKILLS (AI synthesis, no WP-CLI)
  - All 4 WP-CLI skip message locations updated for consistency
metrics:
  duration: 116s
  completed: 2026-02-19
  tasks_completed: 1
  files_modified: 1
---

# Phase 7 Plan 05: Diagnose Command Registration Summary

Wired all five Phase 7 diagnostic skills into /diagnose by adding a performance mode, extending the full-mode SKILLS array to 16 entries (arch-narrative last), adding cron-analysis and wpcli-profile to WP_CLI_SKILLS, and updating all skip messages and mode descriptions.

## What Was Built

Updated `commands/diagnose/COMMAND.md` to register all Phase 7 skills and add a performance-focused diagnostic mode.

### Changes Made

**1. Frontmatter (modes list)**
- Updated description from "full, security-only, or code-only" to "full, security-only, code-only, or performance"
- Updated full mode count from "All 11 diagnostic skills" to "All 16 diagnostic skills"
- Added performance mode entry: `performance: performance-n1, cron-analysis, wpcli-profile`

**2. Section 1 Mode Detection**
- Added performance pattern: `elif echo "$USER_INPUT" | grep -qE "(performance|perf|n\+1|n1|cron|profile)"; then MODE="performance"`
- Updated mode mappings comment to document all 4 modes
- Updated full mode description to list all 16 skills

**3. Section 4 Skills Arrays**
- Added `performance` case to SKILLS switch with 3 skills
- Extended `full` case from 11 to 16 skills with correct ordering (arch-narrative last)
- Extended `WP_CLI_SKILLS` from 6 to 8 entries (added `diagnostic-cron-analysis` and `diagnostic-wpcli-profile`)

**4. WP-CLI Skip Messages**
- Updated all 4 instances (git, local, docker, default/ssh cases) to include `cron-analysis, wpcli-profile` in the parenthetical skill list

**5. Success Criteria section**
- Updated to reference all four modes (full, security-only, code-only, performance)

## Verification Results

| Check | Expected | Result |
|-------|----------|--------|
| Full mode skills count | 16 | 16 (lines 280-295) |
| arch-narrative position | Last (index 15) | Last entry (line 295) |
| Performance mode skills count | 3 | 3 (lines 273-275) |
| WP_CLI_SKILLS count | 8 | 8 (lines 307-316) |
| performance-n1 in WP_CLI_SKILLS | No | Absent |
| architecture in WP_CLI_SKILLS | No | Absent |
| arch-narrative in WP_CLI_SKILLS | No | Absent |
| Performance mode detection | Present | grep pattern added line 33 |
| Skip messages updated | 4 locations | All 4 updated |
| Frontmatter count | 16 | Updated |

## Task Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Register Phase 7 skills in /diagnose command | 3dc0849 | commands/diagnose/COMMAND.md |

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Satisfied

- PERF-01: diagnostic-performance-n1 accessible via `/diagnose` (full mode + performance mode)
- PERF-02: diagnostic-cron-analysis accessible via `/diagnose` (full mode + performance mode)
- PERF-03: diagnostic-wpcli-profile accessible via `/diagnose` (full mode + performance mode)
- ARCH-01: diagnostic-architecture accessible via `/diagnose` (full mode only)
- ARCH-02: diagnostic-arch-narrative accessible via `/diagnose` (full mode, last position)
- ARCH-03: Architecture narrative synthesizes all findings via COMBINED_FINDINGS (runs last)

## Self-Check: PASSED

- commands/diagnose/COMMAND.md exists and was modified (1 file changed, 30 insertions, 12 deletions)
- Commit 3dc0849 exists in git log
- Full mode: 16 entries confirmed by reading lines 279-296
- arch-narrative is entry at line 295 (last before closing parenthesis)
- Performance mode: 3 entries at lines 272-276
- WP_CLI_SKILLS: 8 entries at lines 307-316
