---
name: reporting
description: Structures diagnostic findings for both technical and non-technical audiences with severity ratings, evidence-based reporting, and action logging. Use when generating reports, communicating findings, or logging diagnostic actions.
---

# Diagnostic Reporting & Communication

## Communication Style

Every finding should be communicated in a way that is **understandable to both technical and non-technical users** who are familiar with WordPress as a platform.

For every finding, provide:
- **What's wrong** — plain language summary a site owner would understand
- **Why it matters** — business/user impact (security risk, performance hit, data loss potential)
- **Technical detail** — code references, line numbers, specific functions, and architectural patterns for developers
- **Recommended fix** — concrete steps with code examples where applicable
- **Severity rating** — Critical / High / Medium / Low / Informational

### For Non-Technical Users (Site Owners, Managers)

Use analogies and plain language:

**Bad Example:**
> "There's a missing nonce verification in the AJAX handler registered on wp_ajax_save_settings, allowing CSRF attacks."

**Good Example:**
> "Your settings page has a security gap. Right now, a malicious website could trick your browser into changing your site's settings without you knowing. Think of it like a door without a lock — anyone who knows where it is can walk in. We need to add verification so WordPress confirms it's really you making the change. **Severity: High.**"

Then provide the technical detail separately for developers.

### For Technical Users (Developers)

Be precise and reference-heavy:

> "Missing CSRF protection in `save_settings_handler()` at `includes/admin/class-settings.php:142`. The handler processes `$_POST['settings']` without calling `check_ajax_referer()` or `wp_verify_nonce()`. The corresponding form at `templates/admin/settings.php:28` does include `wp_nonce_field('save_settings', 'settings_nonce')`, but the handler never validates it.
>
> **Fix:** Add `check_ajax_referer('save_settings', 'settings_nonce');` as the first line of `save_settings_handler()`.
>
> **Test:** See `tests/security/Nonce/SaveSettingsNonceTest.php` — verifies that requests without valid nonce return 403."

## Severity Definitions

| Severity | Criteria | Response Time |
|---|---|---|
| **Critical** | Active exploitation possible, data loss imminent, site down | Immediate |
| **High** | Exploitable vulnerability, significant performance impact, data integrity risk | Within 24 hours |
| **Medium** | Potential vulnerability requiring specific conditions, moderate performance impact | Within 1 week |
| **Low** | Minor code quality issue, best practice deviation, cosmetic | Next release cycle |
| **Informational** | Observation, recommendation, future consideration | No deadline |

## Action Logging & Reporting

### Action Log Format

Every action you take must be logged. Maintain a running log in this format:

```markdown
## Action Log — Session [YYYY-MM-DD-HHMMSS]

### Entry [sequential number]
- **Timestamp:** [ISO 8601]
- **Phase:** Discovery | Diagnosis | Remediation | Testing | Documentation
- **Action:** [What you did]
- **Input:** [What you examined — file, screenshot, log entry, etc.]
- **Finding:** [What you found — or "N/A" if action was preparatory]
- **Severity:** Critical | High | Medium | Low | Informational | N/A
- **Evidence:** [File:line, log entry, screenshot reference, query output]
- **Recommendation:** [What should be done — or "N/A" if informational]
- **Status:** Open | In Progress | Resolved | Won't Fix | Deferred
```

### Example Action Log Entry

```markdown
### Entry 003
- **Timestamp:** 2026-02-16T14:32:00Z
- **Phase:** Diagnosis
- **Action:** Analyzed AJAX handler security
- **Input:** includes/admin/class-settings.php
- **Finding:** Missing nonce verification in save_settings_handler()
- **Severity:** High
- **Evidence:** includes/admin/class-settings.php:142 — function processes $_POST without check_ajax_referer()
- **Recommendation:** Add nonce verification as first line of handler function
- **Status:** Open
```

## Phase Reports

At the completion of each phase, generate a structured report:

### Discovery Report

**Structure:**
- Environment summary
- Symptom description
- Scope of investigation
- Assumptions and risks from incomplete information
- Estimated complexity

**Example:**
```markdown
# Discovery Report — 2026-02-16

## Environment
- WordPress: 6.4.3
- PHP: 8.2.10
- Theme: Custom child theme (based on Twenty Twenty-Four)
- Active Plugins: 18 (see full list below)
- Hosting: Managed WordPress (WP Engine)

## Symptom
Admin users report intermittent timeout errors when saving posts with large featured images.
Started approximately 2 weeks ago after a plugin update.

## Scope
- Review image upload and processing flow
- Analyze server-side timeouts
- Check plugin conflicts
- Review recent updates

## Assumptions
- Issue reproducible in production environment
- No server-level changes made during symptom onset
- User reports accurate (not browser-specific)

## Estimated Complexity
Medium — likely plugin conflict or configuration issue, not core WordPress bug.
```

### Diagnosis Report

**Structure:**
- Executive summary (non-technical, 3-5 sentences)
- Findings table (sorted by severity)
- Root cause analysis
- Dependency map (which findings are related)
- Risk assessment

**Example:**
```markdown
# Diagnosis Report — 2026-02-16

## Executive Summary
The timeout issue is caused by a recently updated image optimization plugin attempting to process images larger than the server's PHP execution time limit. This affects all users uploading images over 2MB. The plugin's default settings are incompatible with the current server configuration, and there's no error handling to gracefully degrade when timeouts occur.

## Findings

| ID | Severity | Finding | File/Location |
|----|----------|---------|---------------|
| F-001 | High | Image optimization plugin exceeds max_execution_time | wp-content/plugins/image-optimizer/process.php:87 |
| F-002 | Medium | No timeout error handling in upload flow | wp-content/plugins/image-optimizer/upload-handler.php:34 |
| F-003 | Low | PHP max_execution_time set to 30s (recommended 60s for media handling) | php.ini |

## Root Cause
Plugin version 2.3.0 (released 2 weeks ago) changed image processing from asynchronous background job to synchronous inline processing. For images >2MB, processing exceeds 30s PHP timeout.

## Dependency Map
- F-001 causes the timeout
- F-002 prevents graceful fallback
- F-003 compounds the problem but is not the root cause

## Risk Assessment
**Current Risk:** High — large images cannot be uploaded by any user
**Fix Risk:** Low — configuration change + plugin update available
**Workaround Available:** Yes — disable plugin temporarily or set lower quality threshold
```

### Remediation Report

**Structure:**
- Changes made (with diff references)
- Tests added/modified
- Before/after metrics (if performance-related)
- Rollback instructions
- Remaining risks

**Example:**
```markdown
# Remediation Report — 2026-02-16

## Changes Made

### 1. Increased PHP max_execution_time
**File:** php.ini
**Change:** `max_execution_time = 30` → `max_execution_time = 60`
**Commit:** abc123f

### 2. Updated Image Optimizer Plugin
**From:** v2.3.0
**To:** v2.3.1 (includes async processing option)
**Commit:** def456a

### 3. Configured Plugin for Async Processing
**File:** wp-content/plugins/image-optimizer/config.php
**Change:** Enabled background processing for images >1MB
**Commit:** ghi789b

## Tests Added
- tests/integration/Media/LargeImageUploadTest.php — verifies uploads up to 5MB complete successfully

## Before/After Metrics
- **Before:** 3MB image upload: timeout after 30s
- **After:** 3MB image upload: completes in 8s (async processing queued)

## Rollback Instructions
```bash
# Restore previous php.ini
cp /backup/php.ini.backup /etc/php/8.2/php.ini
service php-fpm restart

# Downgrade plugin (if needed)
wp plugin install image-optimizer --version=2.2.9 --activate --force
```

## Remaining Risks
- Very large images (>10MB) still may have processing delays
- Async processing queue requires functioning WP-Cron
- Recommend monitoring server load during peak upload times
```

### Testing Report

**Structure:**
- Test suite results (pass/fail counts)
- Coverage metrics (line, branch, function)
- New tests added this session
- Previously passing tests that now fail (regressions)
- Coverage gaps identified

**Example:**
```markdown
# Testing Report — 2026-02-16

## Test Results
```
PHPUnit 10.5.10 by Sebastian Bergmann and contributors.

Runtime:       PHP 8.2.10
Configuration: phpunit.xml.dist

...............................................................  63 / 145 ( 43%)
............................................................... 126 / 145 ( 86%)
...................                                             145 / 145 (100%)

Time: 00:03.892, Memory: 38.50 MB

OK (145 tests, 423 assertions)
```

## Coverage Metrics
- **Line Coverage:** 87.3% (target: 85%+) ✓
- **Branch Coverage:** 78.9% (target: 75%+) ✓
- **Function Coverage:** 91.2% (target: 90%+) ✓

## New Tests Added
1. `tests/integration/Media/LargeImageUploadTest.php` — 3 tests
2. `tests/performance/Media/ImageProcessingTimeTest.php` — 2 tests

## Regressions
None — all previously passing tests still pass.

## Coverage Gaps
- Error handling in `includes/media/fallback-processor.php` — only 45% covered
- Recommend adding tests for timeout scenarios
```

### Documentation Report

**Structure:**
- Files updated
- Changelog entries added
- Version bumps applied
- API documentation changes
- User-facing documentation changes

**Example:**
```markdown
# Documentation Report — 2026-02-16

## Files Updated
1. CHANGELOG.md — Added v1.2.1 entry
2. README.md — Updated "Known Issues" section (removed image upload timeout)
3. docs/configuration.md — Added php.ini recommendations
4. docs/troubleshooting.md — Added image upload timeout troubleshooting steps

## Changelog Entry
```markdown
## [1.2.1] - 2026-02-16

### Fixed
- Fixed timeout errors when uploading large images (>2MB)
- Added async processing option for image optimization

### Changed
- Increased recommended max_execution_time to 60s
- Updated Image Optimizer plugin to v2.3.1

### Added
- Tests for large image upload scenarios
- Troubleshooting documentation for media upload issues
```

## Version Bump
- **Previous:** 1.2.0
- **New:** 1.2.1 (PATCH — bug fix only)

## API Changes
None — no breaking changes, no new endpoints.

## User-Facing Documentation
Updated WordPress admin help text for media upload page to reference async processing setting.
```

## Input Materials

You can and should work with **any material the user provides** to support your diagnosis:

| Material Type | What You Extract |
|---|---|
| **Screenshots** | Visual errors, console errors, network waterfall issues, layout breaks, admin error notices |
| **Access logs** | Request patterns, 404s, 500s, slow requests, suspicious IPs, bot traffic |
| **Error logs** | PHP fatals, warnings, notices, deprecated function usage, stack traces |
| **Code files** | Full codebase analysis as detailed in diagnostic domains |
| **Database exports** | Schema review, data integrity, index analysis, option bloat |
| **wp-config.php** | Configuration review (security, debugging, performance constants) |
| **.htaccess / nginx.conf** | Rewrite rules, security headers, caching directives |
| **php.ini / wp-cli.yml** | PHP configuration, CLI configuration |
| **Composer / package.json** | Dependency analysis, version conflicts |
| **Git history** | Recent changes correlated with symptom onset |
| **Performance reports** | GTmetrix, PageSpeed Insights, WebPageTest results |
| **Plugin/theme list** | Version checks against vulnerability databases |

## Self-Generated Validation

You are encouraged to **generate your own diagnostic materials** to validate your approach:

- **Write test scripts** to reproduce reported issues
- **Create database queries** to identify data problems
- **Build proof-of-concept fixes** to validate solutions before recommending them
- **Generate load test scenarios** to confirm performance improvements
- **Create comparison documents** showing before/after states
- **Use browser automation** (when browser use is available) to verify frontend behavior, test user flows, capture screenshots, and validate fixes visually

## File Organization for Deliverables

```
wp-diagnostics-session-[YYYY-MM-DD]/
├── README.md                         # Session overview
├── CHANGELOG.md                      # Version history
├── reports/
│   ├── 01-discovery-report.md
│   ├── 02-diagnosis-report.md
│   ├── 03-remediation-report.md
│   ├── 04-testing-report.md
│   └── 05-documentation-report.md
├── logs/
│   └── action-log.md                 # Complete action trail
├── findings/
│   ├── security-findings.md
│   ├── performance-findings.md
│   ├── code-quality-findings.md
│   └── architecture-findings.md
├── fixes/
│   ├── [fix-description].patch       # Or inline code blocks in reports
│   └── ...
├── tests/
│   ├── [test files created during session]
│   └── coverage/
│       └── summary.md
└── evidence/
    ├── screenshots/
    ├── logs/
    └── queries/
```

## Versioning & Changelog

### Semantic Versioning

All deliverables follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** — Breaking changes to theme/plugin behavior, database schema changes requiring migration, removed functionality
- **MINOR** — New features, new hooks, new admin pages, new REST endpoints (backward-compatible)
- **PATCH** — Bug fixes, security patches, performance improvements, documentation updates (backward-compatible)

### Changelog Format

Maintain a `CHANGELOG.md` in Keep a Changelog format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- [description of new feature]

### Changed
- [description of change to existing functionality]

### Deprecated
- [description of soon-to-be-removed feature]

### Removed
- [description of removed feature]

### Fixed
- [description of bug fix]

### Security
- [description of security fix — include CVE if applicable]

## [1.0.0] - YYYY-MM-DD

### Added
- Initial release
```

Update the changelog with **every change**, no matter how small. Batch related changes under a single version bump.

## Report Writing Best Practices

### Be Concise but Complete
- Lead with the most important information
- Use bullet points for scannability
- Include all necessary technical detail in expandable sections
- Provide code snippets inline, not as separate files (unless very long)

### Use Visual Hierarchy
- Clear section headings
- Tables for structured data (findings, metrics)
- Code blocks with syntax highlighting
- Callout boxes for critical information

### Make It Actionable
Every finding should answer:
- What is the problem?
- Why does it matter?
- What should be done?
- How urgent is it?

### Evidence Over Opinion
- Link to specific files and line numbers
- Include relevant code snippets
- Reference error logs with timestamps
- Provide before/after comparisons

### Anticipate Questions
- Include "Why this approach?" sections for non-obvious decisions
- Document alternatives considered
- Explain trade-offs made
- Provide rollback/undo instructions

### Version Everything
- Date all reports
- Include WordPress, PHP, theme, plugin versions
- Note when recommendations may become outdated
- Link to versioned external documentation
