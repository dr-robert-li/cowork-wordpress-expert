---
phase: 07-performance-architecture
plan: 02
subsystem: diagnostic-skills
tags: [wp-cron, wpcli-profile, performance, self-gating, graceful-degradation]
dependency_graph:
  requires: []
  provides:
    - diagnostic-cron-analysis/SKILL.md (PERF-CRON)
    - diagnostic-wpcli-profile/SKILL.md (PERF-PROF)
  affects:
    - skills/diagnostic-cron-analysis
    - skills/diagnostic-wpcli-profile
tech_stack:
  added: []
  patterns:
    - Self-gating skill pattern (WP_CLI_AVAILABLE check + exit 0)
    - Two-stage degradation (WP-CLI gate then package gate)
    - Interactive install prompt (never auto-install)
    - Cross-platform date conversion (Linux date -d / macOS date -j -f)
    - jq group_by for duplicate detection
    - jq gsub for time string-to-number conversion
key_files:
  created:
    - skills/diagnostic-cron-analysis/SKILL.md
    - skills/diagnostic-wpcli-profile/SKILL.md
  modified: []
decisions:
  - "Cron overdue threshold: >3600 seconds (1 hour) Warning, >86400 seconds (24 hours) Critical — matches plan spec"
  - "Non-repeating events (interval=0) excluded from frequency check via select(.interval > 0 and .interval < 300)"
  - "Profile skill: locked decision to never auto-install wp-cli/profile-command — always prompt user first"
  - "Itemized skip findings: two separate PERF-PROF-STAGE-SKIP and PERF-PROF-HOOK-SKIP (never a single combined skip)"
  - "Bootstrap stage description clarifies it covers plugins_loaded/init/wp_loaded internally"
metrics:
  duration: 285s
  completed: 2026-02-19
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 7 Plan 02: wp-cron Analysis and WP-CLI Profile Integration Summary

Two WP-CLI-dependent diagnostic skills for wp-cron health and runtime performance timing with two-stage graceful degradation when the optional wp-cli/profile-command package is absent.

## What Was Built

### Task 1: diagnostic-cron-analysis SKILL.md (commit: 97b14ec)

Three-check wp-cron health analysis skill covering the three LOCKED problem categories:

**Check 1 — Overdue Events (PERF-CRON-OVRD):** Detects events where `next_run_gmt` is more than 3600 seconds (1 hour) in the past. Severity escalates from Warning to Critical when overdue by more than 24 hours (86400 seconds). Uses cross-platform epoch conversion (`date -d` for Linux, `date -j -f` for macOS) with fallback to `0` on failure.

**Check 2 — Duplicate Hooks (PERF-CRON-DUP):** Uses `jq group_by(.hook)` to find hook names registered more than once. One finding per duplicate hook name (not per instance). Severity: Warning.

**Check 3 — Excessive Frequency (PERF-CRON-FREQ):** Finds recurring events with `select(.interval > 0 and .interval < 300)`. The `interval > 0` condition is critical — it excludes non-repeating events (single-shot events with `interval: 0` must not be flagged for frequency). Severity: Warning.

**Self-gate:** If `WP_CLI_AVAILABLE` is not `true`, emits `PERF-CRON-SKIP` (Info) and exits immediately.

**Clean state:** `PERF-CRON-OK` emitted when all three checks find no issues.

### Task 2: diagnostic-wpcli-profile SKILL.md (commit: 31ee7b2)

WP-CLI Profile integration with LOCKED two-stage degradation:

**Stage 1 Gate (WP-CLI):** If `WP_CLI_AVAILABLE` is false, emit exactly two skip findings (`PERF-PROF-STAGE-SKIP` and `PERF-PROF-HOOK-SKIP`) and exit. Never a single combined skip.

**Stage 2 Gate (profile command):** Check `$WP_CLI_PREFIX profile --help` exit code. If non-zero (package not installed), prompt the user interactively ("Install it now? (yes/no)"). Only install when user explicitly types "yes". Any other response emits the pair of skip findings and exits. If install fails, emit skip findings with install error details.

**Stage timing (PERF-PROF-STAGE):** Runs `wp profile stage --format=json`. Stage names are `bootstrap`, `main_query`, `template` — these are pipeline stage names, not WordPress hook names. The `bootstrap` stage internally covers `plugins_loaded`, `init`, and `wp_loaded`. Time strings (`"0.7994s"`) stripped of trailing `s` for numeric comparison. Severity: Info (<=2.0s), Warning (>2.0s), Critical (>5.0s).

**Hook timing (PERF-PROF-HOOK):** Runs `wp profile stage bootstrap --spotlight --format=json`. The `--spotlight` flag returns only hooks with non-zero execution time. Top 5 sorted using `jq '[.[] | .time_numeric = (.time | gsub("s";"") | tonumber)] | sort_by(.time_numeric) | reverse | .[0:5]'`. Severity: Warning if any hook exceeds 0.5s, otherwise Info.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Overdue threshold 3600s / 86400s | Matches plan spec exactly — 1hr for Warning, 24hr for Critical |
| `interval > 0` guard on frequency check | Non-repeating events must never be flagged for frequency — they only run once |
| Never auto-install profile-command | Locked decision from plan — unexpected installs on production servers are unacceptable |
| Two separate skip findings (not one combined) | Locked decision — each skipped check is independently reportable and actionable |
| `gsub("s";"") | tonumber` for time parsing | wp profile returns strings like "0.7994s"; jq cannot compare strings numerically |
| `--spotlight` flag for hook timing | Returns only hooks with measurable time, filtering noise from zero-time hooks |

## Deviations from Plan

None — plan executed exactly as written. All LOCKED decisions honored. Finding IDs, thresholds, and behavioral patterns match plan specification exactly.

## Self-Check: PASSED

- `skills/diagnostic-cron-analysis/SKILL.md` — FOUND
- `skills/diagnostic-wpcli-profile/SKILL.md` — FOUND
- Commit 97b14ec (feat(07-02): create diagnostic-cron-analysis skill) — FOUND
- Commit 31ee7b2 (feat(07-02): create diagnostic-wpcli-profile skill) — FOUND
