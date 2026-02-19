---
name: trend-tracker
description: Post-report aggregator that runs after report-generator writes latest.md to classify findings as NEW or RECURRING, patch inline badges, append a resolved-findings list, and persist trend data in memory/{site}/trends.json using a 2-slot scan rotation (current + prior). Never connects to WordPress, runs WP-CLI, or greps code files.
---

# Trend Tracker

> **CRITICAL SEQUENCING REQUIREMENT:** This skill MUST run AFTER report-generator has written `memory/{site}/latest.md`. It reads that file and patches it in-place. If it runs before report-generator completes, latest.md will be incomplete or absent and patching will fail.

You classify findings from the current diagnostic scan as [NEW] or [RECURRING] by comparing against the prior scan stored in `memory/{site}/trends.json`. You patch inline badges onto finding headings in `latest.md`, append a resolved-findings summary, and write the updated `trends.json` with a 2-slot rotation (current becomes prior on the next scan).

## Overview

After each diagnostic scan, users want to know whether issues are new or have persisted since the last scan. This skill:

1. Reads the prior scan's findings from `trends.json` (if it exists)
2. Classifies each current finding as NEW or RECURRING using exact ID match with a fuzzy (finding_type + file_path) fallback
3. Patches inline `[NEW]` or `[RECURRING]` badges onto finding headings in `latest.md`
4. Appends a "Resolved Since Last Scan" section listing findings that disappeared
5. Appends a staleness warning if the prior scan is 90+ days old
6. Writes the updated `trends.json` with 2-slot rotation (prior_scan = old current_scan, current_scan = this scan)

**What this skill does NOT do:**
- Connect to the WordPress site via SSH, Docker, or direct access
- Run WP-CLI commands (no `wp` commands)
- Execute grep or find on the codebase
- Generate new findings through code analysis
- Run any diagnostic checks

**What this skill DOES do:**
- Read COMBINED_FINDINGS (JSON array passed by /diagnose)
- Read `memory/{site}/trends.json` for prior scan data (if exists)
- Patch `memory/{site}/latest.md` with inline trend badges
- Write updated `memory/{site}/trends.json`

**First scan behavior:** On first scan, no badges are patched (clean report), and `trends.json` is written with `prior_scan: null`. This ensures the first report is uncluttered and the trend data store is initialized correctly.

## Input Variables

Received from /diagnose Section 5.5:

| Variable | Source | Description |
|----------|--------|-------------|
| `COMBINED_FINDINGS` | /diagnose Section 4 | JSON array of all findings from current scan |
| `SITE_NAME` | /diagnose Section 1 | Site identifier for memory/ path resolution |
| `HEALTH_GRADE` | /diagnose Section 5 | Letter grade A-F or "Incomplete" |
| `CRITICAL_TOTAL` | /diagnose Section 5 | Count of Critical severity findings |
| `WARNING_TOTAL` | /diagnose Section 5 | Count of Warning severity findings |
| `INFO_TOTAL` | /diagnose Section 5 | Count of Info severity findings |
| `SKILLS_COMPLETED` | /diagnose Section 4 | Count of skills that actually ran (not skipped) |
| `SKILLS_TOTAL` | /diagnose Section 4 | Total skills attempted in this mode |

## Step 1: Check for Prior Scan Data

Read `memory/${SITE_NAME}/trends.json` if it exists and extract the prior scan's findings as the comparison baseline.

```bash
MEMORY_DIR="memory/${SITE_NAME}"
TRENDS_FILE="${MEMORY_DIR}/trends.json"
LATEST_FILE="${MEMORY_DIR}/latest.md"

# Determine if this is the first scan
IS_FIRST_SCAN=true
PRIOR_FINDINGS='[]'
PRIOR_SCAN_DATE=""

if [ -f "$TRENDS_FILE" ]; then
  # Extract prior scan data from current_scan slot (it becomes the comparison baseline)
  PRIOR_FINDINGS=$(jq -r '.current_scan.findings // []' "$TRENDS_FILE")
  PRIOR_SCAN_DATE=$(jq -r '.current_scan.scan_date // ""' "$TRENDS_FILE")

  # Only set IS_FIRST_SCAN=false if we actually have prior findings to compare against
  PRIOR_COUNT=$(echo "$PRIOR_FINDINGS" | jq 'length')
  if [ "$PRIOR_COUNT" -gt 0 ] || [ -n "$PRIOR_SCAN_DATE" ]; then
    IS_FIRST_SCAN=false
  fi
fi
```

**Why current_scan becomes the baseline:** `trends.json` always stores the most recent scan as `current_scan`. When this skill runs, it needs to compare against what was stored from the last run — which is `current_scan`. After classification, this skill will shift `current_scan` to `prior_scan` and write a new `current_scan`.

## Step 2: Staleness Check

If a prior scan exists, compute how many days ago it was. If 90+ days, set a staleness note to append to the report.

```bash
STALENESS_NOTE=""

if [ "$IS_FIRST_SCAN" = false ] && [ -n "$PRIOR_SCAN_DATE" ]; then
  # Get current timestamp as epoch
  NOW_EPOCH=$(date +%s)

  # Parse prior scan date to epoch (macOS and Linux compatible)
  if date --version >/dev/null 2>&1; then
    # GNU date (Linux)
    PRIOR_EPOCH=$(date -d "$PRIOR_SCAN_DATE" +%s 2>/dev/null || echo "0")
  else
    # macOS date (BSD)
    PRIOR_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$PRIOR_SCAN_DATE" +%s 2>/dev/null || echo "0")
  fi

  if [ "$PRIOR_EPOCH" -gt 0 ]; then
    SECONDS_AGO=$((NOW_EPOCH - PRIOR_EPOCH))
    DAYS_AGO=$((SECONDS_AGO / 86400))

    if [ "$DAYS_AGO" -ge 90 ]; then
      STALENESS_NOTE="> Note: Prior scan was ${DAYS_AGO} days ago — trend data may be less meaningful."
    fi
  fi
fi
```

## Step 3: Classify Each Current Finding

Implement `classify_finding` with two-pass matching to determine whether each finding is NEW or RECURRING.

**Algorithm:**

For each finding in COMBINED_FINDINGS:
1. **Pass 1 (exact):** Check if the finding's `.id` field exactly matches any `.id` in PRIOR_FINDINGS. If yes: RECURRING.
2. **Pass 2 (fuzzy fallback):** If no exact match, extract the finding_type by stripping the last hyphen-hash segment from the ID, then check if any prior finding shares the same finding_type AND file_path (from `.location`). If yes: RECURRING.
3. Otherwise: NEW.

```bash
# Extract finding_type from an ID by stripping the last hyphen-hash segment
# Example: "SECR-CFGSEC-a1b2c3" → "SECR-CFGSEC"
# Example: "PERF-N1QUERY-wp-content-plugins-my-plugin-php-d4e5f6" → strips last segment
get_finding_type() {
  local FINDING_ID="$1"
  echo "$FINDING_ID" | rev | cut -d'-' -f2- | rev
}

# Build CLASSIFICATIONS array: [{id, badge}]
CLASSIFICATIONS='[]'

# Iterate over current findings and classify each one
FINDING_COUNT=$(echo "$COMBINED_FINDINGS" | jq 'length')
for i in $(seq 0 $((FINDING_COUNT - 1))); do
  FINDING=$(echo "$COMBINED_FINDINGS" | jq ".[$i]")
  FINDING_ID=$(echo "$FINDING" | jq -r '.id')
  FINDING_LOCATION=$(echo "$FINDING" | jq -r '.location // ""')
  FINDING_TYPE=$(get_finding_type "$FINDING_ID")

  BADGE="NEW"

  if [ "$IS_FIRST_SCAN" = false ]; then
    # Pass 1: Exact ID match
    EXACT_MATCH=$(echo "$PRIOR_FINDINGS" | jq --arg id "$FINDING_ID" '[.[] | select(.id == $id)] | length')

    if [ "$EXACT_MATCH" -gt 0 ]; then
      BADGE="RECURRING"
    else
      # Pass 2: Fuzzy match on finding_type + file_path
      FUZZY_MATCH=$(echo "$PRIOR_FINDINGS" | jq --arg ftype "$FINDING_TYPE" --arg floc "$FINDING_LOCATION" \
        '[.[] | select(
          (.id | split("-") | .[:-1] | join("-")) == $ftype
          and (.file_path == $floc or .location == $floc)
        )] | length')

      if [ "$FUZZY_MATCH" -gt 0 ]; then
        BADGE="RECURRING"
      fi
    fi
  fi

  CLASSIFICATIONS=$(echo "$CLASSIFICATIONS" | jq \
    --arg id "$FINDING_ID" \
    --arg badge "$BADGE" \
    '. + [{"id": $id, "badge": $badge}]')
done
```

### Known Limitations

**REGRESSION limitation:** REGRESSION classification (a finding that was resolved and reappeared) requires 3+ scan history. With the 2-scan retention policy (current + prior), reappeared findings are classified as [NEW] because the resolution event is not recorded. This is a known limitation of the 2-scan retention policy. Plan 08-02 (comparison matrix) will surface these patterns through grade-over-grade comparisons.

**Fuzzy match risk:** Fuzzy matching on (finding_type + file_path) may produce false RECURRING classifications when multiple findings of the same type exist in the same file (e.g., two N+1 query patterns in the same plugin file). This is an accepted trade-off for catching reformatted code where the content hash changes but the structural finding is the same.

## Step 4: Identify Resolved Findings

Findings that were in the prior scan but are NOT in the current scan are RESOLVED. Collect their titles for the resolved summary.

```bash
RESOLVED_TITLES=()

if [ "$IS_FIRST_SCAN" = false ]; then
  PRIOR_COUNT=$(echo "$PRIOR_FINDINGS" | jq 'length')

  for i in $(seq 0 $((PRIOR_COUNT - 1))); do
    PRIOR_FINDING=$(echo "$PRIOR_FINDINGS" | jq ".[$i]")
    PRIOR_ID=$(echo "$PRIOR_FINDING" | jq -r '.id')
    PRIOR_TITLE=$(echo "$PRIOR_FINDING" | jq -r '.title')
    PRIOR_TYPE=$(get_finding_type "$PRIOR_ID")
    PRIOR_LOCATION=$(echo "$PRIOR_FINDING" | jq -r '.file_path // .location // ""')

    # Check if this prior finding exists in current scan (exact or fuzzy)
    EXACT_MATCH=$(echo "$COMBINED_FINDINGS" | jq --arg id "$PRIOR_ID" '[.[] | select(.id == $id)] | length')

    if [ "$EXACT_MATCH" -eq 0 ]; then
      # Fuzzy check: same type + location in current findings
      FUZZY_MATCH=$(echo "$COMBINED_FINDINGS" | jq --arg ftype "$PRIOR_TYPE" --arg floc "$PRIOR_LOCATION" \
        '[.[] | select(
          ((.id | split("-") | .[:-1] | join("-")) == $ftype)
          and (.location == $floc)
        )] | length')

      if [ "$FUZZY_MATCH" -eq 0 ]; then
        RESOLVED_TITLES+=("$PRIOR_TITLE")
      fi
    fi
  done
fi
```

## Step 5: Patch latest.md with Inline Badges (Skip on First Scan)

Only runs when `IS_FIRST_SCAN=false`. Use sed to append the badge to the heading line for each finding in `latest.md`.

Report headings follow the format: `### {FINDING_ID}: {title}`

The badge is appended after the title text.

```bash
if [ "$IS_FIRST_SCAN" = false ] && [ -f "$LATEST_FILE" ]; then
  CLASSIF_COUNT=$(echo "$CLASSIFICATIONS" | jq 'length')

  for i in $(seq 0 $((CLASSIF_COUNT - 1))); do
    ENTRY=$(echo "$CLASSIFICATIONS" | jq ".[$i]")
    FINDING_ID=$(echo "$ENTRY" | jq -r '.id')
    BADGE=$(echo "$ENTRY" | jq -r '.badge')

    # Escape special characters in FINDING_ID for sed
    # IDs contain hyphens and alphanumerics — safe for basic sed patterns
    # macOS: sed -i ''; Linux: sed -i (without '')
    sed -i '' "s|^### ${FINDING_ID}: \(.*\)$|### ${FINDING_ID}: \1 [${BADGE}]|" "$LATEST_FILE" 2>/dev/null \
      || sed -i "s|^### ${FINDING_ID}: \(.*\)$|### ${FINDING_ID}: \1 [${BADGE}]|" "$LATEST_FILE"
  done
fi
```

**macOS/Linux compatibility note:** The sed -i '' syntax is required on macOS (BSD sed). Linux (GNU sed) uses sed -i without the empty string argument. The fallback pattern above tries macOS first and falls back to Linux if the first command fails.

## Step 6: Append Resolved Findings Summary (Skip on First Scan)

Only runs when `IS_FIRST_SCAN=false`. If there are resolved findings, append a summary section to `latest.md`. Always append the staleness note if set.

```bash
if [ "$IS_FIRST_SCAN" = false ] && [ -f "$LATEST_FILE" ]; then
  # Append resolved findings section if any findings were resolved
  if [ "${#RESOLVED_TITLES[@]}" -gt 0 ]; then
    {
      echo ""
      echo "---"
      echo "## Resolved Since Last Scan"
      echo ""
      echo "The following findings from the prior scan are no longer detected:"
      for TITLE in "${RESOLVED_TITLES[@]}"; do
        echo "- ${TITLE}"
      done
    } >> "$LATEST_FILE"

    # Append staleness note after resolved section if set
    if [ -n "$STALENESS_NOTE" ]; then
      echo "" >> "$LATEST_FILE"
      echo "$STALENESS_NOTE" >> "$LATEST_FILE"
    fi
  elif [ -n "$STALENESS_NOTE" ]; then
    # No resolved findings but staleness note exists — append to end of report
    {
      echo ""
      echo "---"
      echo ""
      echo "$STALENESS_NOTE"
    } >> "$LATEST_FILE"
  fi
fi
```

## Step 7: Write Updated trends.json

Build the current scan's findings record from COMBINED_FINDINGS (tracking fields only), then write the updated `trends.json` with 2-slot rotation.

**Tracking fields extracted from each finding:**
- `id` — deterministic finding identifier
- `title` — finding title for resolved display
- `finding_type` — derived from ID by stripping last hash segment (e.g., `SECR-CFGSEC`)
- `file_path` — from `.location` field (used for fuzzy matching on next scan)
- `severity` — Critical, Warning, or Info
- `content_hash` — last segment of the ID (the hash portion, e.g., `a1b2c3`)

```bash
SCAN_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SKILL_COVERAGE="${SKILLS_COMPLETED}/${SKILLS_TOTAL}"

# Build current scan findings array with only tracking fields
CURRENT_SCAN_FINDINGS=$(echo "$COMBINED_FINDINGS" | jq '[.[] | {
  id: .id,
  title: .title,
  finding_type: (.id | split("-") | .[:-1] | join("-")),
  file_path: (.location // ""),
  severity: .severity,
  content_hash: (.id | split("-") | last)
}]')

# Build the new current_scan object
NEW_CURRENT_SCAN=$(jq -n \
  --arg scan_date "$SCAN_DATE" \
  --arg grade "$HEALTH_GRADE" \
  --argjson critical "$CRITICAL_TOTAL" \
  --argjson warning "$WARNING_TOTAL" \
  --argjson info "$INFO_TOTAL" \
  --arg skill_coverage "$SKILL_COVERAGE" \
  --argjson findings "$CURRENT_SCAN_FINDINGS" \
  '{
    scan_date: $scan_date,
    grade: $grade,
    critical_count: $critical,
    warning_count: $warning,
    info_count: $info,
    skill_coverage: $skill_coverage,
    findings: $findings
  }')

# Build the full trends.json (shift current_scan → prior_scan if it exists)
if [ -f "$TRENDS_FILE" ]; then
  # Read existing current_scan to become the new prior_scan
  EXISTING_CURRENT=$(jq '.current_scan' "$TRENDS_FILE")

  jq -n \
    --arg site "$SITE_NAME" \
    --arg updated_at "$SCAN_DATE" \
    --argjson prior_scan "$EXISTING_CURRENT" \
    --argjson current_scan "$NEW_CURRENT_SCAN" \
    '{
      site: $site,
      updated_at: $updated_at,
      prior_scan: $prior_scan,
      current_scan: $current_scan
    }' > /tmp/trends.json.tmp && mv /tmp/trends.json.tmp "$TRENDS_FILE"
else
  # First scan: write with null prior_scan
  jq -n \
    --arg site "$SITE_NAME" \
    --arg updated_at "$SCAN_DATE" \
    --argjson current_scan "$NEW_CURRENT_SCAN" \
    '{
      site: $site,
      updated_at: $updated_at,
      prior_scan: null,
      current_scan: $current_scan
    }' > /tmp/trends.json.tmp && mv /tmp/trends.json.tmp "$TRENDS_FILE"
fi
```

**Write safety:** The temp file + mv pattern (`> /tmp/trends.json.tmp && mv`) prevents partial writes from corrupting the trends.json file if the jq command fails or is interrupted.

### trends.json Schema

```json
{
  "site": "mysite",
  "updated_at": "2026-02-19T06:00:00Z",
  "prior_scan": {
    "scan_date": "2026-01-15T10:00:00Z",
    "grade": "C",
    "critical_count": 1,
    "warning_count": 4,
    "info_count": 6,
    "skill_coverage": "14/16",
    "findings": [
      {
        "id": "SECR-CFGSEC-a1b2c3",
        "title": "wp-config.php world-readable",
        "finding_type": "SECR-CFGSEC",
        "file_path": "wp-config.php",
        "severity": "Critical",
        "content_hash": "a1b2c3"
      }
    ]
  },
  "current_scan": {
    "scan_date": "2026-02-19T06:00:00Z",
    "grade": "B",
    "critical_count": 0,
    "warning_count": 3,
    "info_count": 5,
    "skill_coverage": "16/16",
    "findings": [
      {
        "id": "CQ-SQLINJ-d4e5f6",
        "title": "Direct SQL query without prepare",
        "finding_type": "CQ-SQLINJ",
        "file_path": "wp-content/plugins/my-plugin/includes/db.php",
        "severity": "Warning",
        "content_hash": "d4e5f6"
      }
    ]
  }
}
```

**Retention policy:** trends.json retains exactly 2 scan slots — `current_scan` and `prior_scan`. On each run, `current_scan` becomes `prior_scan` and a new `current_scan` is written. The scan before prior_scan is discarded. This is the 2-scan retention policy.

**Why 2 slots:** Sufficient for NEW/RECURRING classification per the locked user decision. Plan 08-02 uses the grade and count fields from both slots for the comparison matrix without requiring deeper history.

## Output

This skill produces no findings JSON (it does not add to COMBINED_FINDINGS). Its outputs are:

1. `memory/{site}/latest.md` — patched in-place with inline [NEW] / [RECURRING] badges on finding headings, optional resolved-findings section, and optional staleness note
2. `memory/{site}/trends.json` — updated with 2-slot rotation

**Display to user (from /diagnose Section 5.5):**
- Before: "Updating trend history..."
- After: "Trend data updated: memory/${SITE_NAME}/trends.json"

## Success Criteria

Trend tracking is complete when:
- trends.json exists at `memory/{site}/trends.json` with correct 2-slot schema
- First scan: prior_scan is null, no badges patched, latest.md is unmodified
- Subsequent scans: findings classified as NEW or RECURRING, badges patched inline, resolved findings appended
- Staleness warning appended when prior scan is 90+ days old
- trends.json written atomically via temp file + mv
- REGRESSION limitation documented — 2-scan retention cannot detect reappeared findings (they show as NEW)
- Fuzzy match trade-off documented — false RECURRING possible when multiple findings of same type in same file
