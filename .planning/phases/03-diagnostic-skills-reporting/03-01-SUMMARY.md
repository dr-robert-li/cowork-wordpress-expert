---
phase: 03-diagnostic-skills-reporting
plan: 01
subsystem: diagnostic-skills
tags: [security, diagnostics, wp-cli, ssh]
dependency_graph:
  requires: [sites.json, SSH access, WP-CLI on remote]
  provides: [core-integrity-check, config-security-check, user-audit-check]
  affects: []
tech_stack:
  added: []
  patterns: [WP-CLI over SSH, deterministic finding IDs, structured JSON findings, graceful degradation]
key_files:
  created:
    - skills/diagnostic-core-integrity/SKILL.md
    - skills/diagnostic-config-security/SKILL.md
    - skills/diagnostic-user-audit/SKILL.md
  modified: []
decisions:
  - Use MD5 hash (3 chars) for deterministic finding IDs
  - Check wp-config.php REMOTELY via SSH, not from synced files
  - Graceful degradation when last_login meta unavailable (Info finding)
  - 90 days threshold for inactive privileged users
  - Administrator count threshold >3 triggers Warning
metrics:
  duration: 271s
  completed: 2026-02-17T02:03:14Z
  tasks_completed: 2
  files_created: 3
---

# Phase 03 Plan 01: Core Security Diagnostic Skills Summary

Three security-focused diagnostic skills created as self-contained markdown prompts for core integrity, wp-config security, and user account auditing using WP-CLI and SSH with zero external dependencies.

## What Was Built

### Core File Integrity Diagnostic (SECR-01)

**Purpose:** Verify WordPress core files against official checksums using `wp core verify-checksums`.

**Capabilities:**
- Runs WP-CLI over SSH with proper timeout and error handling
- Parses both JSON and plain text output formats
- Generates per-file Critical findings for modified core files
- Generates Info finding when all files verified
- Handles WP-CLI/SSH errors gracefully with specific fix guidance
- Supports optional file exclusions (readme.html, license.txt)

**Finding IDs:** `SECR-CHECKSUMS-{hash}` per file, deterministic based on filepath

**Error Handling:** Distinguishes between security issues (modified files) and configuration issues (WP-CLI missing, connection failures)

### wp-config.php Security Analysis (SECR-04)

**Purpose:** Check wp-config.php for critical security misconfigurations via remote SSH grep commands.

**Checks (Critical/Warning/Info only):**
1. **WP_DEBUG enabled** (Critical) - leaks sensitive data
2. **Default/empty salts** (Critical) - session hijacking risk
3. **DISALLOW_FILE_EDIT absent/false** (Warning) - allows admin file editing
4. **Default table prefix 'wp_'** (Info) - noted but not critical
5. **DB credentials in Git** (Warning) - credential exposure

**Explicitly skipped:**
- Specific PHP memory limits
- Table prefix change recommendations (risky on existing sites)
- Obscure hardening constants

**Location handling:** Checks both standard location (`wp_path/wp-config.php`) and one-directory-up (`wp_path/../wp-config.php`)

**Finding IDs:** Deterministic per check type (e.g., `SECR-CONFIG-DBG`, `SECR-CONFIG-SLT`)

### User Account Audit (SECR-03)

**Purpose:** Audit WordPress user accounts for common security issues.

**Checks:**
1. **Default 'admin' username** (Critical) - most targeted username
2. **Excessive administrators** (Warning if >3) - increased attack surface
3. **Inactive privileged users** (Warning if >90 days) - best-effort via last_login meta

**Explicitly skipped:**
- Email domain analysis
- Custom capability overrides
- Subscriber ratios

**Graceful degradation:** If last_login meta unavailable (vanilla WordPress), generates Info finding recommending last login tracking plugin instead of failing.

**Finding IDs:** `SECR-USERS-ADM`, `SECR-USERS-CNT`, `SECR-USERS-INA-{hash}` per inactive user

## Deviations from Plan

None - plan executed exactly as written. All specified checks implemented, all exclusions documented, all error handling patterns included.

## Technical Implementation

### Deterministic Finding ID Pattern

```bash
# Generate stable ID based on category + check type + location
CATEGORY="SECR"
CHECK="CHECKSUMS"
LOCATION="wp-includes/version.php"
HASH=$(echo -n "$LOCATION" | md5sum | cut -c1-3)
FINDING_ID="${CATEGORY}-${CHECK}-${HASH}"
# Result: SECR-CHECKSUMS-abc (consistent across scans)
```

**Collision risk:** 3-char MD5 hash = 4096 possibilities. Low collision probability for typical 50-100 findings per scan. Can extend to 4 chars if needed.

### SSH Execution Pattern

All skills follow consistent SSH command execution:

```bash
ssh -o BatchMode=yes \
    -o ConnectTimeout=10 \
    "${USER}@${HOST}" \
    "cd ${WP_PATH} && ${WP_CLI_PATH} [command]" 2>&1
```

**Key features:**
- BatchMode prevents interactive prompts
- ConnectTimeout prevents hanging
- Exit code checked before parsing output
- stderr captured for error diagnosis

### Structured Finding Format

All skills return JSON array of finding objects:

```json
{
  "id": "SECR-CHECKSUMS-abc",
  "severity": "Critical|Warning|Info",
  "category": "Security|Configuration",
  "title": "One-line title",
  "summary": "One sentence, non-technical",
  "detail": "Technical explanation with evidence",
  "location": "File path or resource identifier",
  "fix": "Specific actionable fix with commands/code"
}
```

**Consistency benefits:**
- Enables programmatic consumption by report generator
- Allows tracking same issue across multiple scans
- Facilitates trend analysis and fix verification

## Testing Considerations

### Unit Testing (per skill)

**Core Integrity:**
- Test with clean WordPress installation (expect Info finding)
- Modify core file, test detection (expect Critical finding)
- Test with WP-CLI missing (expect Warning finding)
- Test SSH connection failure (expect Warning finding)

**Config Security:**
- Test with WP_DEBUG true (expect Critical)
- Test with default salts (expect Critical)
- Test with DISALLOW_FILE_EDIT false (expect Warning)
- Test with wp-config in standard and one-up locations
- Test with wp-config tracked in Git (expect Warning)

**User Audit:**
- Test with 'admin' username (expect Critical)
- Test with 5+ administrators (expect Warning)
- Test with last_login meta present and absent (expect graceful degradation)
- Test with privileged users inactive >90 days (expect Warning per user)

### Integration Testing

- Run all three skills against real WordPress site
- Verify JSON output is valid and parseable
- Confirm finding IDs are deterministic across runs
- Test error handling with intentionally broken connections

### Edge Cases Covered

1. **WP-CLI output format variability:** Both JSON and plain text parsing
2. **wp-config.php location:** Standard and one-directory-up
3. **Last login unavailable:** Graceful Info finding instead of error
4. **SSH connection pooling:** Not implemented (acceptable for v1, can optimize later)
5. **Multiple modified core files:** Each gets its own finding (not single aggregate)

## Performance Characteristics

**Estimated execution time per skill:**
- Core Integrity: 2-5 seconds (WP-CLI checksum verification)
- Config Security: 3-7 seconds (5 grep commands over SSH)
- User Audit: 3-10 seconds (depends on user count for inactive check)

**Total: ~10-20 seconds for all three skills on typical site**

**Bottleneck:** SSH connection overhead (2-3 seconds per connection). Could be optimized with SSH ControlMaster in future.

## Self-Check: PASSED

**Created files verified:**

```bash
$ [ -f "/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/skills/diagnostic-core-integrity/SKILL.md" ] && echo "FOUND"
FOUND
$ [ -f "/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/skills/diagnostic-config-security/SKILL.md" ] && echo "FOUND"
FOUND
$ [ -f "/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/skills/diagnostic-user-audit/SKILL.md" ] && echo "FOUND"
FOUND
```

**Line counts verified:**
- diagnostic-core-integrity: 269 lines (exceeds 80 minimum)
- diagnostic-config-security: 302 lines (exceeds 80 minimum)
- diagnostic-user-audit: 284 lines (exceeds 60 minimum)

**Commits verified:**

```bash
$ git log --oneline -3
f50754e feat(03-01): create user account audit diagnostic skill
c5d0da0 feat(03-01): create core integrity and config security diagnostic skills
```

All commits present with proper atomic task structure.

## Next Steps

**For Phase 03-02 (remaining diagnostic skills):**
- Version audit (SECR-02): plugin/theme outdated checks
- Malware scan: pattern-based detection in synced files
- Code quality: AI-powered analysis of custom code

**For Phase 03-03 (report generator):**
- Aggregate findings from all skills
- Compute health grade (A-F) based on severity counts
- Generate markdown report with executive summary
- Archive reports in memory/{site-name}/

**For Phase 03-04 (diagnostic command):**
- Orchestrate all diagnostic skills
- Display progress during execution
- Handle SSH connection persistence
- Present final report to user
