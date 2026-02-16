---
name: report-generator
description: Compiles diagnostic findings from all diagnostic skills into structured markdown reports with health grades (A-F), executive summaries, categorized findings, and archives them in memory/{site-name}/ with latest.md and archive/ rotation.
---

# Report Generator Skill

This skill takes findings from all diagnostic skills (core-integrity, config-security, user-audit, version-audit, malware-scan, code-quality) and compiles them into a single structured markdown report with a health grade, executive summary, and categorized findings. It handles archive rotation so previous reports are preserved.

## Section 1: Input

### Finding Format

Accept findings from all diagnostic skills as JSON arrays. Each finding object has these fields:

```json
{
  "id": "SECR-CHECKSUMS-001",
  "severity": "Critical",
  "category": "Security",
  "title": "Modified core file detected",
  "summary": "A core WordPress file has been changed from its original version, which could indicate a security breach.",
  "detail": "wp-includes/version.php has been modified. Checksum mismatch detected via wp core verify-checksums. File size differs from expected: 2847 bytes vs 2340 bytes expected.",
  "location": "wp-includes/version.php",
  "fix": "Run `wp core download --force` to restore original core files, or manually compare the file to identify intentional customizations."
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Deterministic finding ID for cross-scan tracking |
| `severity` | string | One of: `Critical`, `Warning`, `Info` |
| `category` | string | One of: `Security`, `Code Quality`, `Version & Compatibility`, `Suspicious Code` |
| `title` | string | Short descriptive title |
| `summary` | string | One-sentence non-technical explanation |
| `detail` | string | Technical explanation with evidence |
| `location` | string | File path, file:line, or command reference |
| `fix` | string | Concrete remediation steps or code snippet |

### Category Sources

Each category maps to specific diagnostic skills:

- **Security**: Findings from `diagnostic-core-integrity`, `diagnostic-config-security`, `diagnostic-user-audit`
- **Code Quality**: Findings from `diagnostic-code-quality`
- **Version & Compatibility**: Findings from `diagnostic-version-audit`
- **Suspicious Code**: Findings from `diagnostic-malware-scan`

### Aggregating Findings

Collect findings from each skill into a single combined JSON array:

```bash
# Each diagnostic skill produces a findings array. Combine them:
COMBINED_FINDINGS='[]'

# Append each skill's output (each is a JSON array of finding objects)
COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$CORE_INTEGRITY_FINDINGS" | jq -s 'add')
COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$CONFIG_SECURITY_FINDINGS" | jq -s 'add')
COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$USER_AUDIT_FINDINGS" | jq -s 'add')
COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$VERSION_AUDIT_FINDINGS" | jq -s 'add')
COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$MALWARE_SCAN_FINDINGS" | jq -s 'add')
COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$CODE_QUALITY_FINDINGS" | jq -s 'add')
```

## Section 2: Health Grade Calculation

Count findings by severity, then apply the grading matrix deterministically.

### Counting

```bash
CRITICAL_COUNT=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length')
WARNING_COUNT=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length')
INFO_COUNT=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length')
```

### Grading Matrix

Apply these rules **in order** (first match wins):

| Grade | Condition |
|-------|-----------|
| **F** | 4 or more critical findings |
| **D** | 2-3 critical findings |
| **C** | Exactly 1 critical finding OR 5+ warnings (with 0 critical) |
| **B** | No critical findings AND 3 or more warnings |
| **A** | No critical findings AND 2 or fewer warnings |

### Grade Calculation Logic

```bash
if [ "$CRITICAL_COUNT" -ge 4 ]; then
  HEALTH_GRADE="F"
elif [ "$CRITICAL_COUNT" -ge 2 ]; then
  HEALTH_GRADE="D"
elif [ "$CRITICAL_COUNT" -eq 1 ]; then
  HEALTH_GRADE="C"
elif [ "$WARNING_COUNT" -ge 5 ]; then
  HEALTH_GRADE="C"
elif [ "$WARNING_COUNT" -ge 3 ]; then
  HEALTH_GRADE="B"
else
  HEALTH_GRADE="A"
fi
```

### Severity Scale Reference

- **Critical**: Actively exploitable or causing immediate risk. Act now.
- **Warning**: Should be fixed but not immediately dangerous. Plan to address.
- **Info**: Awareness item, best practice recommendation. Nice to have.

## Section 3: Report Markdown Template

Generate a report with this exact structure. Replace all `{placeholders}` with actual values.

```markdown
# WordPress Diagnostic Report: {site-name}
**Date:** {YYYY-MM-DD}
**Health Grade:** {A-F}
**Site:** {site-url}

## Executive Summary
{2-3 sentences: overall health assessment, critical finding count, top concern. Written for non-technical reader.}

### Finding Summary
| Severity | Count |
|----------|-------|
| Critical | {N}   |
| Warning  | {N}   |
| Info     | {N}   |

## Security Findings
{For each finding where category == "Security", sorted by severity (Critical first):}
### {finding.id}: {finding.title}
**Severity:** {finding.severity}
**Summary:** {finding.summary}
**Detail:** {finding.detail}
**Location:** {finding.location}
**Fix:** {finding.fix}

## Code Quality Findings
{For each finding where category == "Code Quality", sorted by severity (Critical first):}
### {finding.id}: {finding.title}
**Severity:** {finding.severity}
**Summary:** {finding.summary}
**Detail:** {finding.detail}
**Location:** {finding.location}
**Fix:** {finding.fix}

## Version & Compatibility
{For each finding where category == "Version & Compatibility", sorted by severity (Critical first):}
### {finding.id}: {finding.title}
**Severity:** {finding.severity}
**Summary:** {finding.summary}
**Detail:** {finding.detail}
**Location:** {finding.location}
**Fix:** {finding.fix}

## Suspicious Code
{For each finding where category == "Suspicious Code", sorted by severity (Critical first):}
### {finding.id}: {finding.title}
**Severity:** {finding.severity}
**Summary:** {finding.summary}
**Detail:** {finding.detail}
**Location:** {finding.location}
**Fix:** {finding.fix}
```

**If no findings exist in a category, show under that heading:**

```markdown
No issues found.
```

### Executive Summary Guidelines

The executive summary must be 2-3 sentences written for a non-technical reader:

1. **Sentence 1:** Overall health assessment using the grade ("Your site received a grade of B, indicating generally good health with some areas for improvement.")
2. **Sentence 2:** Critical finding count and top concern if any ("We found 0 critical issues but 4 warnings, primarily related to outdated plugins.")
3. **Sentence 3 (optional):** Most impactful recommendation ("The most important action is to update your plugins to their latest versions.")

### Sorting Findings Within Categories

Within each category section, sort findings by severity in this order:
1. Critical (first)
2. Warning (second)
3. Info (last)

Within the same severity level, maintain the order received from the diagnostic skills.

## Section 4: Archive Management

Before writing a new report, archive the previous one if it exists.

### Archive Rotation Process

```bash
SITE_NAME="{site-name}"
MEMORY_DIR="memory/${SITE_NAME}"
LATEST="${MEMORY_DIR}/latest.md"
ARCHIVE_DIR="${MEMORY_DIR}/archive"

mkdir -p "$ARCHIVE_DIR"

if [ -f "$LATEST" ]; then
  TIMESTAMP=$(date +%Y-%m-%d)
  ARCHIVE_PATH="${ARCHIVE_DIR}/scan-${TIMESTAMP}.md"
  if [ -f "$ARCHIVE_PATH" ]; then
    TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
    ARCHIVE_PATH="${ARCHIVE_DIR}/scan-${TIMESTAMP}.md"
  fi
  mv "$LATEST" "$ARCHIVE_PATH"
fi
```

### Directory Structure

```
memory/
  {site-name}/
    latest.md              # Most recent scan report (full markdown)
    archive/
      scan-2026-02-16.md   # Previous scans, timestamped
      scan-2026-02-16-143022.md  # Same-day second scan
```

### Write New Report

After archiving, write the generated report:

```bash
# Write the compiled report to latest.md
cat > "$LATEST" << 'REPORT_EOF'
{generated report content}
REPORT_EOF
```

### Archive Listing

To show available archives for a site:

```bash
SITE_NAME="{site-name}"
ARCHIVE_DIR="memory/${SITE_NAME}/archive"

if [ -d "$ARCHIVE_DIR" ]; then
  echo "Previous scans:"
  ls -1 "$ARCHIVE_DIR" | sort -r | while read -r file; do
    SCAN_DATE=$(echo "$file" | sed 's/scan-//' | sed 's/\.md//')
    echo "  - $SCAN_DATE"
  done
else
  echo "No previous scans found."
fi
```

## Section 5: Finding ID Reference

Finding IDs enable tracking the same issue across multiple scans. If the same issue exists in the same location, it gets the same ID -- enabling diff between reports.

### ID Format by Category

| Category | Prefix | Source Skills | Example |
|----------|--------|--------------|---------|
| Security | `SECR-{CHECK}-{hash}` | core-integrity, config-security, user-audit | `SECR-CHECKSUMS-a1b2c3` |
| Code Quality | `CODE-{CHECK}-{hash}` | diagnostic-code-quality | `CODE-SQLI-d4e5f6` |
| Version & Compatibility | `DIAG-{CHECK}-{hash}` | version-audit | `DIAG-OUTDATED-g7h8i9` |
| Suspicious Code | `SUSP-{CHECK}-{hash}` | malware-scan | `SUSP-EVAL-j0k1l2` |

### ID Generation Rules

1. **Prefix**: Based on category (SECR, CODE, DIAG, SUSP)
2. **CHECK**: Short identifier for the specific check type (e.g., CHECKSUMS, SQLI, OUTDATED, EVAL)
3. **Hash**: Short hash derived from the finding's location (file path + line number if applicable). Use first 6 characters of the location's MD5 hash.

### Cross-Scan Tracking

Same issue + same location = same ID across scans. This enables:
- **Tracking fixes**: A finding present in scan 1 but absent in scan 2 was fixed
- **Detecting regressions**: A finding absent in scan 1 but present in scan 2 is a regression
- **Progress reports**: Compare finding counts across scans to show improvement over time

### Generating Deterministic IDs

```bash
# Generate a finding ID
CATEGORY_PREFIX="SECR"  # or CODE, DIAG, SUSP
CHECK_NAME="CHECKSUMS"
LOCATION="wp-includes/version.php"

HASH=$(echo -n "$LOCATION" | md5 | cut -c1-6)
FINDING_ID="${CATEGORY_PREFIX}-${CHECK_NAME}-${HASH}"
# Result: SECR-CHECKSUMS-a1b2c3
```

## Return Value

After generating and saving the report, return the path to the generated report file:

```
memory/{site-name}/latest.md
```

Also output a brief summary for inline display:

```
Report generated: Health Grade {GRADE} | {CRITICAL} critical, {WARNING} warning, {INFO} info findings
Saved to: memory/{site-name}/latest.md
```

If a previous report was archived, also note:

```
Previous report archived to: memory/{site-name}/archive/scan-{date}.md
```
