---
name: diagnostic-arch-narrative
description: Synthesizes findings from all diagnostic skills into a bullet-point health narrative grouped by domain (Security, Code Quality, Database Health, Performance, Architecture, Infrastructure). Applies the standard A-F grading matrix and produces a "Top 3 issues to fix first" ranked list. MUST run last in the skill sequence — it reads COMBINED_FINDINGS from all preceding skills.
---

# Diagnostic: Architecture Narrative Synthesizer

> **CRITICAL SEQUENCING REQUIREMENT:** This skill MUST run LAST in the /diagnose full-mode skill list. If it runs before other skills complete, COMBINED_FINDINGS will be incomplete and the narrative will be misleading. Register it at the end of the skill execution array.

You synthesize findings from all diagnostic skills in the current run into a single cross-domain health narrative. You do NOT run any new checks, connect to WordPress, execute WP-CLI commands, or grep files. You read structured findings and produce a single ARCH-NARR finding with an A-F health grade, domain-grouped bullet-point narrative, and "Top 3 issues to fix first" ranked list.

## Overview

Individual diagnostic skills (security, code quality, database health, performance, architecture) each produce focused technical findings in their domain. After all skills complete, COMBINED_FINDINGS contains the full picture — but users need a synthesized cross-domain view that tells them:

1. What grade is their site at overall?
2. What are the key issues per domain — in one place?
3. What three things should they fix first?

This skill is the culminating output of a full diagnostic run. It is an aggregator, not a probe.

**What this skill does NOT do:**
- Connect to the WordPress site via SSH, Docker, or direct access
- Run WP-CLI commands (no `wp` commands)
- Execute grep or find on the codebase
- Generate new findings through code analysis
- Run any bash commands except reading the prior report file

**What this skill DOES do:**
- Read COMBINED_FINDINGS (JSON array passed by /diagnose)
- Optionally read memory/{site}/latest.md for prior scan grade comparison
- Apply the grading matrix (identical to report-generator thresholds)
- Group findings by domain category
- Rank top 3 priority issues
- Produce exactly ONE structured finding: ARCH-NARR

## Input Sources

### Source 1: COMBINED_FINDINGS (Required)

The primary input is the `COMBINED_FINDINGS` JSON array assembled by /diagnose after all preceding skills complete. This array contains every finding from every skill that ran in the current session.

Expected structure (same as report-generator finding format):
```json
[
  {
    "id": "SECR-CFGSEC-a1b2c3",
    "severity": "Critical",
    "category": "Security",
    "title": "wp-config.php world-readable",
    "summary": "...",
    "detail": "...",
    "location": "wp-config.php",
    "fix": "..."
  },
  ...
]
```

### Source 2: memory/{site}/latest.md (Optional)

The prior scan report for the same site. Used only for grade comparison — to tell the user whether health has improved, degraded, or stayed the same since the last scan.

```bash
MEMORY_DIR="memory/${SITE_NAME}"
PRIOR_REPORT="${MEMORY_DIR}/latest.md"

# Check if prior report exists
PRIOR_SCAN_EXISTS=false
if [ -f "$PRIOR_REPORT" ]; then
  PRIOR_SCAN_EXISTS=true
fi
```

If `PRIOR_SCAN_EXISTS` is false (first scan or no prior report), note this in the narrative — do not fail.

## Step 1: Apply Grading Matrix

Count findings by severity from COMBINED_FINDINGS. This is an AI-driven step — parse the JSON array, count occurrences of each severity value.

```bash
CRITICAL_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length')
WARNING_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length')
INFO_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length')
```

Apply grading matrix (first-match-wins — **IDENTICAL** to report-generator thresholds):

| Grade | Condition |
|-------|-----------|
| **F** | 4 or more Critical findings |
| **D** | 2-3 Critical findings |
| **C** | Exactly 1 Critical finding OR 5+ Warnings (with 0 Critical) |
| **B** | No Critical findings AND 3 or more Warnings |
| **A** | No Critical findings AND 2 or fewer Warnings |

```bash
if [ "$CRITICAL_TOTAL" -ge 4 ]; then
  HEALTH_GRADE="F"
elif [ "$CRITICAL_TOTAL" -ge 2 ]; then
  HEALTH_GRADE="D"
elif [ "$CRITICAL_TOTAL" -eq 1 ]; then
  HEALTH_GRADE="C"
elif [ "$WARNING_TOTAL" -ge 5 ]; then
  HEALTH_GRADE="C"
elif [ "$WARNING_TOTAL" -ge 3 ]; then
  HEALTH_GRADE="B"
else
  HEALTH_GRADE="A"
fi
```

**Narrative severity mapping** (for the ARCH-NARR finding's severity field):
- Grade A or B → severity `"Info"`
- Grade C → severity `"Warning"`
- Grade D or F → severity `"Critical"`

## Step 2: Group Findings by Domain

Group findings from COMBINED_FINDINGS by their `category` field. Use these exact category-to-domain mappings:

| Domain | Expected category values |
|--------|--------------------------|
| Security | `"Security"` |
| Code Quality | `"Code Quality"` |
| Database Health | `"Database Health"` |
| Performance | `"Performance"` |
| Architecture | `"Architecture"` |
| Infrastructure | `"Infrastructure"` |

For each domain, collect:
- All findings matching the category
- Count of Critical findings in domain
- Count of Warning findings in domain
- Count of Info findings in domain

```bash
# Example for Security domain (apply pattern to all 6 domains)
SECURITY_FINDINGS=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.category == "Security")]')
SECURITY_CRITICAL=$(echo "$SECURITY_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length')
SECURITY_WARNING=$(echo "$SECURITY_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length')
SECURITY_INFO=$(echo "$SECURITY_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length')
```

## Step 3: Derive Top 3 Issues

Priority ordering for the "Top 3 issues to fix first" ranked list:

**Priority tier 1:** All Critical findings, ordered by domain business impact:
`Security > Database Health > Performance > Code Quality > Architecture > Infrastructure`

**Priority tier 2:** If fewer than 3 Critical findings, fill remaining slots with Warning findings (same domain priority order).

**Priority tier 3:** If fewer than 3 total Critical+Warning findings, fill remaining slots with highest-impact Info findings.

```bash
# Derive top 3 by severity tier then domain priority
# Claude reads and ranks directly — no bash needed for AI synthesis
# The jq below is a reference implementation only:
TOP_3=$(echo "$COMBINED_FINDINGS" | jq '
  [
    (.[] | select(.severity == "Critical")),
    (.[] | select(.severity == "Warning")),
    (.[] | select(.severity == "Info"))
  ] | .[0:3]
')
```

**Note on domain priority sorting:** When multiple Critical findings exist across domains, Claude should reorder them by domain priority (Security first, etc.) rather than relying on array insertion order alone.

## Step 4: Compose Narrative Body

The NARRATIVE_BODY is the `detail` field of the ARCH-NARR finding. It MUST be formatted as bullet-point grouped by domain — NOT prose paragraphs.

**LOCKED format (do not deviate):**

```
## Overall Health: Grade {A-F}

Scan covered {N} domains with {TOTAL} findings total ({CRITICAL_TOTAL} critical, {WARNING_TOTAL} warning, {INFO_TOTAL} informational).
{If PRIOR_SCAN_EXISTS: "Prior scan data included from memory/{site}/latest.md. Prior grade: {prior_grade} → Current grade: {current_grade}. {Health improved/degraded/unchanged since last scan.}"}
{If NOT PRIOR_SCAN_EXISTS: "First scan for this site — no prior data available for trend comparison."}

### Security
{If findings exist:}
- [Critical] {finding.title}: {one-sentence fix summary}
- [Warning] {finding.title}: {one-sentence fix summary}
- [Info] {finding.title}: {one-sentence fix summary}
Total: {X} critical, {Y} warning, {Z} info

{If no findings:}
- No issues found.
Total: 0 critical, 0 warning, 0 info

### Code Quality
{Same pattern}

### Database Health
{Same pattern}

### Performance
{Same pattern}

### Architecture
{Same pattern}

### Infrastructure
{Same pattern}

{If any domain had zero findings across all severity levels, also add:}
Domains with no issues: {comma-separated list}
```

**Bullet format for individual findings:**
`- [{Severity}] {finding.title}: {one-sentence summary of fix}`

**Condensing rule for large domains:** If a domain has more than 5 findings, group Critical findings as a summary line rather than one bullet per finding:
`- {N} critical findings: {title_1}, {title_2}, {title_3}... (see full report for details)`

**Prior scan grade extraction:** If memory/{site}/latest.md exists, read the `**Health Grade:**` line from the report header to extract the prior grade letter. Example pattern in the report: `**Health Grade:** B`. Parse the grade letter from this line.

```bash
if [ "$PRIOR_SCAN_EXISTS" = true ]; then
  PRIOR_GRADE=$(grep "Health Grade:" "$PRIOR_REPORT" | head -1 | grep -oE '[A-F]' | head -1)
fi
```

## Step 5: Compose the ARCH-NARR Finding

Produce exactly ONE finding object. This is the only output from this skill.

```json
{
  "id": "ARCH-NARR",
  "severity": "{Info for A/B | Warning for C | Critical for D/F}",
  "category": "Architecture",
  "title": "Site Health Narrative — Grade {HEALTH_GRADE}",
  "summary": "Overall site health: {HEALTH_GRADE}. {CRITICAL_TOTAL} critical, {WARNING_TOTAL} warning, {INFO_TOTAL} informational findings across {DOMAIN_COUNT} domains.",
  "detail": "{NARRATIVE_BODY — the full bullet-point narrative from Step 4}",
  "location": "Cross-domain synthesis",
  "fix": "Top 3 issues to fix first:\n1. {issue_1_title} ({issue_1_severity}) — {issue_1_fix_one_sentence}\n2. {issue_2_title} ({issue_2_severity}) — {issue_2_fix_one_sentence}\n3. {issue_3_title} ({issue_3_severity}) — {issue_3_fix_one_sentence}"
}
```

**DOMAIN_COUNT:** Count of domains that had at least one finding (0 to 6).

**fix field format:** Plain text, newline-separated, numbered 1-3. Each line is the finding title, its severity in parentheses, and a one-sentence action item from its `fix` field.

## Empty or Missing COMBINED_FINDINGS

If COMBINED_FINDINGS is empty (`[]`) or was not passed correctly, produce this fallback finding instead:

```json
{
  "id": "ARCH-NARR",
  "severity": "Warning",
  "category": "Architecture",
  "title": "Narrative synthesis skipped — no findings data",
  "summary": "No findings were available to synthesize. This skill must run after all other skills complete.",
  "detail": "COMBINED_FINDINGS is empty or was not passed correctly. Ensure diagnostic-arch-narrative runs last in the skill list and that at least one other skill completed successfully.\n\nIf all other skills returned zero findings (a perfectly clean site), this is expected behavior — all findings being Info-level with a Grade A is a valid outcome. If you expected findings but got none, re-run /diagnose in full mode.",
  "location": "Cross-domain synthesis",
  "fix": "Re-run /diagnose in full mode to generate a complete findings set. Verify the skill sequence has diagnostic-arch-narrative registered last."
}
```

## Output Format

Return findings as a JSON array containing exactly one element — the ARCH-NARR finding:

```json
[
  {
    "id": "ARCH-NARR",
    "severity": "Warning",
    "category": "Architecture",
    "title": "Site Health Narrative — Grade C",
    "summary": "Overall site health: C. 1 critical, 4 warning, 6 informational findings across 4 domains.",
    "detail": "## Overall Health: Grade C\n\nScan covered 4 domains with 11 findings total (1 critical, 4 warning, 6 informational).\nFirst scan for this site — no prior data available for trend comparison.\n\n### Security\n- [Critical] wp-config.php world-readable: Change file permissions to 640 using chmod 640 wp-config.php.\n- [Warning] Debug log world-readable: Set WP_DEBUG to false in production and remove debug.log.\nTotal: 1 critical, 1 warning, 0 info\n\n### Code Quality\n- [Warning] Direct SQL query without prepare: Use $wpdb->prepare() for all database queries.\n- [Info] Missing output escaping in template: Wrap all echo calls with esc_html() or esc_attr().\nTotal: 0 critical, 1 warning, 1 info\n\n### Database Health\n- [Warning] Autoload data exceeds 900KB warning threshold: Regenerate caches for Yoast SEO and Elementor.\nTotal: 0 critical, 1 warning, 0 info\n\n### Performance\n- [Warning] Slow query detected on posts table: Add a composite index on (post_status, post_type, post_date).\nTotal: 0 critical, 1 warning, 0 info\n\n### Architecture\n- No issues found.\nTotal: 0 critical, 0 warning, 0 info\n\n### Infrastructure\n- No issues found.\nTotal: 0 critical, 0 warning, 0 info\n\nDomains with no issues: Architecture, Infrastructure",
    "location": "Cross-domain synthesis",
    "fix": "Top 3 issues to fix first:\n1. wp-config.php world-readable (Critical) — Run chmod 640 wp-config.php on the server immediately.\n2. Direct SQL query without prepare (Warning) — Audit all $wpdb->query calls and wrap with $wpdb->prepare().\n3. Autoload data exceeds 900KB warning threshold (Warning) — Go to Elementor > Tools > Regenerate Files and Yoast SEO > Tools > Reset."
  }
]
```

## Skill Registration Requirement

This skill MUST be registered at the end of the /diagnose full-mode skill execution array. It depends on all other skills completing and their findings being merged into COMBINED_FINDINGS before this skill runs.

In the /diagnose command's skill orchestration section, add `diagnostic-arch-narrative` as the final skill in the sequence, after all domain-specific skills have completed and findings have been merged.

**Never run this skill in parallel with other skills.** It requires the complete COMBINED_FINDINGS array, which is only assembled after all other skills finish.

## Success Criteria

Narrative synthesis is complete when:
- COMBINED_FINDINGS read and parsed (or empty-findings fallback applied)
- Grading matrix applied with identical thresholds to report-generator
- Narrative severity mapped correctly (Info=A/B, Warning=C, Critical=D/F)
- Findings grouped by all 6 domains, with bullet points for each finding
- Domains with no findings noted separately
- Top 3 issues ranked by severity tier then domain priority
- Prior scan grade comparison included (if memory/{site}/latest.md exists)
- First-scan case handled gracefully (notes no prior data)
- Exactly ONE finding returned: ARCH-NARR
- Finding output in standard JSON array format
