---
phase: 03-diagnostic-skills-reporting
plan: 03
subsystem: diagnostic-skills
tags: [code-quality, ai-analysis, pattern-scan, wordpress-standards]
dependency_graph:
  requires: [WP-CLI via SSH, rsync file sync, WordPress.org API]
  provides: [AI-powered code quality analysis with tiered scanning]
  affects: [diagnostic findings, report generation]
tech_stack:
  added: []
  patterns: [two-pass tiered analysis, grep-based pattern detection, AI contextual review]
key_files:
  created:
    - skills/diagnostic-code-quality/SKILL.md
  modified: []
decisions:
  - Skip WP.org plugins (version audit only) to focus AI analysis on custom code
  - Use tiered approach (pattern scan first, AI deep analysis second) for efficiency
  - Generate deterministic finding IDs based on type + location hash
  - Provide before/after code snippets in all findings
metrics:
  duration: 100s
  completed: 2026-02-17T03:01:00Z
---

# Phase 03 Plan 03: Code Quality Diagnostic Skill Summary

AI-powered code quality diagnostic skill using two-pass tiered analysis (pattern scan + deep AI review) with before/after fix snippets

## What Was Built

Created **skills/diagnostic-code-quality/SKILL.md** - A comprehensive 468-line diagnostic skill that performs WordPress-specific code quality analysis using a two-pass approach:

**Pass 1: Quick Pattern Scan** - grep-based detection for 7 anti-pattern categories:
1. Deprecated WordPress/PHP functions (mysql_*, create_function, each())
2. SQL injection risks ($wpdb queries without prepare())
3. Missing input sanitization ($_GET/$_POST without sanitization)
4. Missing nonce verification (form handlers without wp_verify_nonce)
5. Hardcoded credentials/API keys
6. extract() usage
7. Direct file includes with user input

**Pass 2: Deep AI Analysis** - Contextual review of flagged files covering:
- WordPress hook usage patterns
- Class structure and separation of concerns
- Error handling (WP_Error, try/catch)
- Script/style enqueueing patterns
- Database operations (dbDelta, prefix usage, transients)
- WordPress API usage correctness

**Target Selection Logic**:
- Active theme + child theme (via `wp option get template/stylesheet`)
- Custom plugins only (detect WP.org plugins via API check - skip those)
- Skips WordPress core files

**Structured Findings Output**:
- Deterministic IDs: `CODE-{TYPE}-{hash}` (e.g., CODE-SQLI-a3f)
- Severity levels: Critical, Warning, Info
- Non-technical summaries for stakeholders
- Technical details with file:line references
- Before/after code snippets showing the fix
- JSON array output for report generation

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create AI-powered code quality diagnostic skill with tiered analysis | c5d0da0 | skills/diagnostic-code-quality/SKILL.md |

## Deviations from Plan

None - plan executed exactly as specified.

## Key Decisions

1. **Two-pass tiered approach** - Run fast grep pattern scan first (all files), then expensive AI analysis only on flagged files for efficiency
2. **WP.org plugin detection** - Use WordPress.org API to distinguish custom plugins from WP.org plugins; only analyze custom code
3. **Deterministic finding IDs** - Generate IDs from type + file:line hash for consistent tracking across multiple scans
4. **Contextual validation** - Pass 2 AI analysis validates Pass 1 pattern matches to eliminate false positives before reporting

##Technical Implementation

**Target Selection**:
- Uses `wp option get template` and `wp option get stylesheet` over SSH to detect active themes
- Checks plugin slug against WordPress.org API (`/plugins/info/1.2/`) to identify custom vs WP.org plugins
- Analyzes locally synced files (no remote file reading)

**Pattern Detection (Pass 1)**:
- 7 grep-based checks with specific regular expressions
- Context extraction (3-5 lines before/after) for validation
- Records all matches with file:line:content

**AI Deep Analysis (Pass 2)**:
- Reads full file content for flagged files
- Understands WordPress architecture and coding standards
- Validates pattern matches (eliminates false positives)
- Discovers additional issues beyond pattern matches

**Finding Structure**:
```json
{
  "id": "CODE-SQLI-a3f",
  "severity": "Critical",
  "category": "Code Quality",
  "title": "SQL query without prepared statement",
  "summary": "Non-technical explanation for stakeholders",
  "detail": "Technical explanation with code evidence",
  "location": "wp-content/themes/custom/functions.php:142",
  "fix": {
    "before": "Problematic code",
    "after": "Fixed code"
  }
}
```

## Verification Completed

- File exists at skills/diagnostic-code-quality/SKILL.md
- 468 lines (exceeds 150-line minimum)
- Valid YAML frontmatter with name and description
- Contains target selection logic with WP-CLI commands
- Contains WordPress.org API reference for plugin detection
- Pass 1 covers all 7 required anti-pattern categories with grep commands
- Pass 2 describes contextual AI analysis approach
- Finding format includes before/after code snippets
- Finding IDs use CODE-{TYPE}-{hash} format
- Severity uses 3 levels (Critical, Warning, Info)
- Original skills/code-quality/SKILL.md is untouched

## Next Steps

Plan 03-04 will create the final diagnostic skill(s) to complete the diagnostic skills set for Phase 03.

## Self-Check: PASSED

Verified file existence:
- FOUND: /Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/skills/diagnostic-code-quality/SKILL.md

Verified commit exists:
- FOUND: c5d0da0 (feat(03-01): create core integrity and config security diagnostic skills)

All artifacts created and committed successfully.
