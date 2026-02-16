---
phase: 04-command-workflows
plan: 01
subsystem: command-workflows
tags: [diagnose-command, orchestration, workflow, natural-language, error-recovery]
requires: [diagnostic-skills, report-generator, connect-command, sites-json]
provides: [diagnose-command-spec, three-mode-diagnostics, inline-progress-feedback]
affects: [user-experience, diagnostic-workflow]
key-files:
  created:
    - commands/diagnose/COMMAND.md
  modified: []
decisions:
  - /audit merged into /diagnose security-only mode (no separate command)
  - Skip-and-continue error recovery pattern (partial scans > no scans)
  - Auto-connect when site profile exists but local files missing
  - WP-CLI unavailability handled gracefully (skip dependent skills)
  - Health grade shows "Incomplete" when skills skipped (avoids false confidence)
tech-stack:
  added: []
  patterns: [natural-language-parsing, sequential-skill-execution, inline-progress, error-recovery, health-grading]
metrics:
  duration: 185s
  tasks_completed: 1
  files_created: 1
  lines_added: 645
  commits: 1
  completed_date: 2026-02-17
---

# Phase 04 Plan 01: Diagnose Command Orchestration Summary

Complete /diagnose command specification with three modes (full, security-only, code-only), natural language invocation, inline progress feedback, and skip-and-continue error recovery.

## What Was Built

Created `commands/diagnose/COMMAND.md` as a comprehensive 645-line command specification that orchestrates all 6 diagnostic skills into complete user workflows with:

- **Natural language argument parsing** for flexible invocation ("/diagnose security only", "diagnose code on mysite", etc.)
- **Three diagnostic modes**: full (all 6 skills), security-only (3 skills), code-only (2 skills)
- **Auto-connect logic** when site profile exists but local files are missing
- **Silent file resync** before diagnostics to ensure fresh data
- **Sequential skill execution** with inline progress (shows finding counts per skill)
- **Critical findings displayed immediately** as discovered (not just at end)
- **Skip-and-continue error recovery** (if skill fails, mark skipped and continue)
- **Report generation** with health grading (A-F or "Incomplete" when skills skipped)
- **Completion summary** with top 3 critical issues and skipped skills list
- **Suggested next actions** based on findings (specific commands for common issues)
- **Comprehensive error handling** for all failure scenarios (SSH, WP-CLI, connection, etc.)

### Command Structure

The command specification follows the established COMMAND.md format with:

1. **YAML frontmatter** defining name, description, usage, and modes
2. **8 main sections**:
   - Section 1: Natural Language Argument Parsing
   - Section 2: Connection Verification & Auto-Connect
   - Section 3: Silent File Resync
   - Section 4: Skill Execution with Inline Progress
   - Section 5: Report Generation
   - Section 6: Completion Summary
   - Section 7: Suggested Next Actions
   - Section 8: Error Handling

### Skill Integration

The command correctly references all 6 diagnostic skills with proper mode mappings:

**Full mode (default):**
- diagnostic-core-integrity
- diagnostic-config-security
- diagnostic-user-audit
- diagnostic-version-audit
- diagnostic-malware-scan
- diagnostic-code-quality

**Security-only mode:**
- diagnostic-core-integrity
- diagnostic-config-security
- diagnostic-user-audit

**Code-only mode:**
- diagnostic-code-quality
- diagnostic-malware-scan

### WP-CLI Dependency Handling

The command detects WP-CLI availability and gracefully skips WP-CLI-dependent skills (core-integrity, user-audit, version-audit) when not installed, marking them as "WP-CLI unavailable" in the report. This enables partial scans even on servers without WP-CLI.

## Deviations from Plan

None - plan executed exactly as written. All requirements met without modifications needed.

## Key Decisions

### 1. /audit Merged into /diagnose

Per user decision documented in 04-CONTEXT.md, `/audit` is NOT a separate command. It is satisfied by `/diagnose security-only`. Natural language parsing handles variations like "diagnose just security", "run a security audit", "security only please".

**Rationale:** Reduces command surface area while maintaining flexibility through natural language parsing.

### 2. Skip-and-Continue Error Recovery

If a single skill fails (SSH timeout, WP-CLI error, invalid JSON), mark it as "skipped", display warning, and continue with remaining skills. Do NOT abort entire diagnostic run.

**Rationale:** Partial diagnostic data is valuable. A scan with 5 out of 6 skills completed is better than no scan at all. The health grade shows "Incomplete" to indicate missing data, avoiding false confidence.

### 3. Auto-Connect When Files Missing

If site profile exists in sites.json but local directory is empty or missing, automatically run the /connect workflow before proceeding with diagnostics.

**Rationale:** Improves UX by removing the need for users to remember to sync first. The command "just works" as long as a site profile exists.

### 4. Inline Progress with Immediate Critical Findings

Show each skill running with finding counts (`3 critical, 5 warning, 2 info`) and display critical findings immediately as discovered (title + summary), not just at the end.

**Rationale:** Users get faster feedback on serious issues while scan is running. They don't have to wait for entire scan to complete before seeing critical problems.

### 5. Health Grade Shows "Incomplete" When Skills Skipped

When any skills are skipped (SSH failure, WP-CLI unavailable), set scan status to "Incomplete" and show health grade as "Incomplete" instead of A-F.

**Rationale:** Avoids false confidence. An "A" grade with 3 skills skipped is misleading. "Incomplete" accurately reflects the partial nature of the scan.

## Testing Notes

The command specification is written as procedural instructions for Claude to follow, not as a standalone bash script. Testing requires:

1. A CoWork environment with Claude reading the COMMAND.md file
2. A configured site in sites.json with valid SSH credentials
3. Remote WordPress installation with or without WP-CLI
4. All 6 diagnostic skills implemented and accessible

**Test scenarios to cover:**
- `/diagnose` (default full mode)
- `/diagnose security only` (security mode)
- `/diagnose code only on sitename` (code mode with site specification)
- WP-CLI unavailable (should skip 3 skills gracefully)
- SSH connection failure during resync (should warn and continue with cached files)
- Single skill failure (should skip and continue with remaining skills)
- All skills fail (should error and suggest troubleshooting steps)

## Verification

Task completion verified against plan requirements:

- [x] COMMAND.md exists with 645 lines (requirement: 200+ lines)
- [x] YAML frontmatter with name, description, usage, modes
- [x] Natural language parsing section with mode + site extraction
- [x] Auto-connect logic referencing /connect
- [x] Silent resync section with rsync variant detection
- [x] Skill execution loop with all 6 skills mapped to modes correctly
- [x] Inline progress with finding counts and critical findings shown immediately
- [x] Skip-and-continue error recovery documented
- [x] Report generation referencing report-generator skill
- [x] Completion summary with health grade
- [x] Suggested next actions section with specific commands
- [x] Error handling section covering all failure scenarios
- [x] All three modes documented: full, security-only, code-only
- [x] All 6 diagnostic skills referenced by correct path (skills/diagnostic-*/SKILL.md)
- [x] Report generator skill referenced for report compilation
- [x] sites.json referenced for site profile lookup

## Related Files

**Dependencies:**
- `commands/connect/COMMAND.md` - Auto-connect workflow reference
- `skills/report-generator/SKILL.md` - Report generation and health grading
- `skills/diagnostic-core-integrity/SKILL.md` - Core file integrity checks
- `skills/diagnostic-config-security/SKILL.md` - wp-config.php security analysis
- `skills/diagnostic-user-audit/SKILL.md` - User account auditing
- `skills/diagnostic-version-audit/SKILL.md` - Plugin/theme/core version checks
- `skills/diagnostic-malware-scan/SKILL.md` - Suspicious code detection
- `skills/diagnostic-code-quality/SKILL.md` - SQL injection and code smell detection
- `sites.json` - Site connection profiles

**Provides to:**
- Users: Primary diagnostic command for WordPress site health checks
- Phase 04 Plan 02: /status command enhancement (will reference /diagnose availability)

## Next Steps

1. Test /diagnose command with real WordPress site
2. Verify all three modes work correctly (full, security-only, code-only)
3. Validate error recovery with SSH failures and WP-CLI absence
4. Verify report generation and health grading
5. Move to Phase 04 Plan 02: Enhance /status command

## Commits

- `14cbe84` - feat(04-01): create /diagnose command with full orchestration workflow

## Self-Check

Verifying file existence and commit.

```bash
# Check file exists
[ -f "commands/diagnose/COMMAND.md" ] && echo "FOUND: commands/diagnose/COMMAND.md" || echo "MISSING: commands/diagnose/COMMAND.md"
# FOUND: commands/diagnose/COMMAND.md

# Check line count
wc -l commands/diagnose/COMMAND.md
# 645 commands/diagnose/COMMAND.md

# Check commit exists
git log --oneline --all | grep -q "14cbe84" && echo "FOUND: 14cbe84" || echo "MISSING: 14cbe84"
# FOUND: 14cbe84
```

Self-Check: **PASSED**

All artifacts verified on disk and in git history.
