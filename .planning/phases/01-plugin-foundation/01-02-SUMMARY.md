---
phase: 01-plugin-foundation
plan: 02
subsystem: plugin-foundation
tags: [refactor, skills, content-migration, architecture]
dependency_graph:
  requires: []
  provides: [lean-claude-md, diagnostic-skills]
  affects: [CLAUDE.md, skills-directory]
tech_stack:
  added: []
  patterns: [skill-based-architecture, yaml-frontmatter]
key_files:
  created:
    - CLAUDE.md
    - skills/security-analysis/SKILL.md
    - skills/code-quality/SKILL.md
    - skills/performance/SKILL.md
    - skills/plugin-conflicts/SKILL.md
  modified: []
decisions:
  - Reduced CLAUDE.md from 850 lines to 96 lines (89% reduction)
  - Moved all diagnostic domain knowledge to skills for Claude auto-selection
  - Added Safe Operation Patterns section to CLAUDE.md for rsync safety
  - Added Hot Cache section to CLAUDE.md for active session state
metrics:
  duration_seconds: 277
  duration_human: 4 minutes 37 seconds
  tasks_completed: 2
  files_created: 5
  files_modified: 0
  lines_added: 627
  commits: 2
  completed_date: 2026-02-16
---

# Phase 01 Plan 02: Content Migration - CLAUDE.md Restructure

**One-liner:** Restructured CLAUDE.md into lean identity/process/hot-cache file (96 lines) and extracted Domains 1-4 into self-contained skill files for Claude auto-selection.

## Tasks Completed

### Task 1: Rework CLAUDE.md into lean identity and hot cache
**Status:** Complete
**Commit:** 0f92f8c

**What was done:**
- Replaced 850-line CLAUDE.md with focused 96-line version (89% reduction)
- Retained core identity as WordPress systems analyst and security auditor
- Condensed process section: "Ask Before You Act" discovery protocol, evidence-based diagnosis, full traceability
- Added Safe Operation Patterns section documenting rsync safety protocols:
  - Always use --dry-run first
  - Default exclusions (wp-config.php, *.log, .git, node_modules, .env)
  - Never use --delete flag
  - SSH credentials never logged
  - Cross-platform compatibility notes (macOS openrsync vs GNU rsync)
- Added Hot Cache section with three dynamic state areas:
  - Currently Connected Site (populated by connection commands)
  - Active Diagnostic Session (populated by diagnostic commands)
  - Recent Findings (populated during diagnostics)
- Bumped version to 2.0.0 to reflect major restructuring

**Verification passed:**
- Line count: 96 (under 120 limit)
- Zero diagnostic domain content remaining
- All required sections present

### Task 2: Create skills for Domains 1-4 from original CLAUDE.md
**Status:** Complete
**Commit:** 19ea571

**What was done:**
Created four self-contained skill files with complete diagnostic domain knowledge:

1. **skills/security-analysis/SKILL.md** (Domain 1)
   - OWASP Top 10 and WordPress-specific vulnerability patterns
   - Input validation & sanitization (sanitize_text_field, wp_kses, etc.)
   - Output escaping (esc_html, esc_attr, esc_js, esc_url)
   - Authentication & authorization (nonce verification, capability checks)
   - CSRF protection (wp_nonce_field, check_ajax_referer)
   - SQL injection prevention ($wpdb->prepare, esc_like)
   - File security (ABSPATH checks, upload restrictions)
   - Data exposure mitigation (WP_DEBUG settings, user enumeration)
   - Obfuscated/malicious code detection (base64_decode, eval patterns)
   - Dependency & supply chain auditing
   - WordPress Red Flags quick reference
   - Security-specific grep commands and WP-CLI integrity checks

2. **skills/code-quality/SKILL.md** (Domain 2)
   - WordPress Coding Standards (WPCS) - PHP, JS, CSS, HTML
   - Static analysis tools (PHPCS, PHPStan, Psalm, ESLint, Stylelint)
   - Architecture & design patterns (hooks system, SRP, namespacing, PSR-4)
   - Error handling (WP_Error pattern, admin notices, logging)
   - Deprecated function detection (mysql_*, create_function, each)
   - Tool usage commands for PHPCS, PHPStan, linting

3. **skills/performance/SKILL.md** (Domain 3)
   - Database performance (N+1 queries, meta_query indexing, LIKE patterns)
   - PHP performance (expensive hooks, blocking HTTP calls, object caching)
   - Frontend performance (render-blocking assets, Core Web Vitals, lazy loading)
   - Caching analysis (page cache, object cache, CDN, transients, OPcache)
   - Database analysis WP-CLI commands (autoloaded options, transients, revisions)
   - Performance monitoring commands

4. **skills/plugin-conflicts/SKILL.md** (Domain 4)
   - Conflict identification (hook priority, JavaScript namespace, CSS specificity)
   - Systematic conflict testing (binary search isolation, theme switching)
   - Common conflict patterns (page builders, SEO plugins, security plugins)
   - Systematic resolution process (reproduce, binary search, analyze, implement)
   - Plugin/theme management WP-CLI commands
   - Debugging configuration commands

**Verification passed:**
- All four skill files created with proper YAML frontmatter (name + description)
- security-analysis: 10 matches for key terms (sanitize_text_field, wp_verify_nonce, base64_decode, eval)
- code-quality: 6 matches for key terms (WordPress Coding Standards, PHPStan, PSR-4)
- performance: 3 matches for key terms (N+1 query, autoloading, Core Web Vitals)
- plugin-conflicts: 2 matches for key terms (Hook priority, binary search isolation)

## Deviations from Plan

None - plan executed exactly as written.

## Key Decisions

1. **Version bump to 2.0.0**: CLAUDE.md restructuring is a breaking change warranting major version bump
2. **Skill frontmatter format**: Used YAML with `name` and `description` fields for Claude auto-selection compatibility
3. **Complete knowledge transfer**: Transferred full domain content (not summarized) to ensure skills are self-contained
4. **Safe operation patterns**: Added rsync safety protocols as critical operational knowledge in CLAUDE.md

## Benefits Realized

1. **Focused identity file**: CLAUDE.md is now scannable and maintainable (96 lines vs 850)
2. **Skill-based architecture**: Claude can auto-select diagnostic domains as needed
3. **Safety documentation**: rsync patterns and credential handling are now explicitly documented
4. **Hot cache design**: Active state tracking is built into the plugin architecture
5. **Complete knowledge preservation**: Zero diagnostic knowledge lost in migration

## Self-Check: PASSED

**Files created verification:**
```
✓ CLAUDE.md exists (96 lines)
✓ skills/security-analysis/SKILL.md exists (6049 bytes)
✓ skills/code-quality/SKILL.md exists (3451 bytes)
✓ skills/performance/SKILL.md exists (3733 bytes)
✓ skills/plugin-conflicts/SKILL.md exists (4656 bytes)
```

**Commits verification:**
```
✓ 0f92f8c exists: refactor(01-02): rework CLAUDE.md into lean identity and hot cache
✓ 19ea571 exists: feat(01-02): create four diagnostic domain skills
```

**Content verification:**
```
✓ CLAUDE.md does NOT contain diagnostic domain content
✓ CLAUDE.md DOES contain Safe Operation Patterns and Hot Cache sections
✓ All skill files contain proper YAML frontmatter
✓ All skill files contain expected domain knowledge (verified via grep)
```

All verification checks passed.
