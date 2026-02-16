# Phase 3 Context: Diagnostic Skills & Reporting

## Vulnerability Data Sources

**Decision:** WP-CLI + WordPress.org data only. No external API keys required.

- Use `wp core verify-checksums` over SSH for core file integrity (SECR-01)
- Use `wp plugin list --update=available` and `wp theme list --update=available` for outdated checks (SECR-02)
- Check plugin/theme update status against wordpress.org — no WPScan API, no API keys
- Rationale: Zero setup, no credentials to manage, sufficient for v1 diagnostics

## Malware & Suspicious Code Scanning

**Decision:** Pattern scan as a separate finding category, distinct from core integrity.

- Core integrity: WP-CLI verify-checksums (clean/modified/unknown)
- Suspicious code: Grep synced files for common malicious patterns:
  - `base64_decode` chains, `eval()` with variable input, obfuscated variable names
  - Backdoor signatures (e.g., `FilesMan`, `WSO`, `c99shell` references)
  - Suspicious file placements (PHP in uploads/, unexpected files in wp-includes/)
- Report as separate "Suspicious Code" category, not mixed with core integrity findings
- Each pattern match gets its own finding with file:line reference

## wp-config.php Security Stance

**Decision:** Flag critical issues only. Skip debatable recommendations.

**Flag these (Critical/Warning):**
- `WP_DEBUG` set to `true` in production
- Default/empty authentication salts
- `$table_prefix` = `wp_` (Info only — not Critical since changing is risky on existing sites)
- Database credentials visible in version control (if detectable)
- `define('DISALLOW_FILE_EDIT', false)` or absent (should be true in production)

**Skip these (too debatable for v1):**
- Table prefix recommendations on existing sites
- Specific PHP memory limit values
- Obscure wp-config hardening that varies by hosting environment

## User Account Auditing

**Decision:** Standard checks only.

- Check for default `admin` username (Critical)
- Count users with `administrator` role — flag if excessive (Warning threshold: >3 admins)
- Detect inactive privileged users if last login data is available via WP-CLI user meta
- Do NOT include: email domain analysis, capability overrides, subscriber ratios

## AI Code Analysis Scope

**Decision:** Active theme + custom plugins only. WP.org plugins get version check only.

### Target Selection
- Scan the active theme (detected via `wp option get template`)
- Scan plugins NOT from wordpress.org (detect by checking if slug exists on wordpress.org API or by checking plugin headers for "Plugin URI" pointing to wordpress.org)
- Simple heuristic: if plugin has a readme.txt with "Stable tag" and matches a wordpress.org slug, treat as WP.org plugin — version check only
- WP.org plugins: only check if up to date, no source code analysis

### Analysis Depth — Tiered Approach
1. **Quick pattern scan** (all targeted files): Grep for known anti-patterns
   - Deprecated WordPress functions (e.g., `mysql_query`, `get_bloginfo('url')`)
   - Direct SQL queries without `$wpdb->prepare()`
   - Missing nonce checks on form handlers
   - Direct `$_GET/$_POST/$_REQUEST` usage without sanitization
   - Hardcoded credentials or API keys
   - `extract()` usage, `eval()` usage
   - Direct file includes with user input
2. **Deep contextual analysis** (flagged files only): AI reads the file in context
   - Understands plugin/theme architecture
   - Identifies logic issues, poor patterns relative to WP coding standards
   - Checks hook usage, action/filter patterns
   - Reviews class structure and separation of concerns

### Output
- Include fix snippets alongside each finding
- Show problematic code AND suggested replacement
- Reference file:line for every finding

## Report Structure

**Decision:** Executive summary + detailed category sections.

### Format
```markdown
# WordPress Diagnostic Report: {site-name}
**Date:** {date}
**Health Grade:** {A-F}
**Site:** {url}

## Executive Summary
{2-3 sentences: overall health, critical count, top concern}

### Finding Summary
| Severity | Count |
|----------|-------|
| Critical | X     |
| Warning  | X     |
| Info     | X     |

## Security Findings
### {Finding ID}: {Title}
**Severity:** Critical | Warning | Info
**Summary:** {One sentence, non-technical}
**Detail:** {Technical explanation with evidence}
**Location:** {file:line or command output}
**Fix:** {Code snippet or action to take}

## Code Quality Findings
{Same structure as security}

## Version & Compatibility
{Same structure}

## Suspicious Code
{Same structure, if any patterns found}
```

### Severity Scale
- **Critical**: Actively exploitable or causing immediate risk. Act now.
- **Warning**: Should be fixed but not immediately dangerous. Plan to address.
- **Info**: Awareness item, best practice recommendation. Nice to have.

### Health Grade
Letter grade (A-F) based on weighted findings:
- A: No critical, <=2 warnings
- B: No critical, 3+ warnings
- C: 1 critical or 5+ warnings
- D: 2-3 critical findings
- F: 4+ critical findings

## Finding Storage

**Decision:** Latest + archive in `memory/{site-name}/`.

### Directory Structure
```
memory/
  {site-name}/
    latest.md          # Most recent scan report (full markdown)
    archive/
      scan-2026-02-16.md  # Previous scans, timestamped
```

- Each scan overwrites `latest.md` and moves the previous one to `archive/`
- Archive files are timestamped: `scan-{YYYY-MM-DD}.md`
- If multiple scans same day, append time: `scan-{YYYY-MM-DD}-{HHMMSS}.md`

### Finding IDs
- Each finding gets a deterministic ID based on type + location
- Format: `{CATEGORY}-{CHECK}-{NNN}` (e.g., `SECR-CHECKSUMS-001`, `CODE-SQLI-003`)
- IDs enable tracking fixes across scans
- Same issue in same location = same ID across scans

### Status Integration
The `/status` command shows inline summary for each site:
- Health grade from latest scan
- Finding counts by severity
- Top 3 critical issues (if any)
- Last scan date

## Deferred Ideas

None captured during discussion.

---
*Context gathered: 2026-02-16*
*Areas discussed: Vulnerability data sources, AI code analysis scope, Report structure & severity, Finding storage format*
