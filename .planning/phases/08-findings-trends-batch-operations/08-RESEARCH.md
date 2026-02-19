# Phase 8: Findings Trends & Batch Operations - Research

**Researched:** 2026-02-19
**Domain:** Cross-scan finding comparison, trends.json storage, /batch command, multi-site comparison matrix
**Confidence:** HIGH

## Summary

Phase 8 adds two distinct capabilities: (1) trend tracking that compares findings across consecutive diagnostic scans and annotates the report with [NEW], [RECURRING], [REGRESSION] badges, and (2) a `/batch` command that runs `/diagnose` sequentially across multiple saved site profiles and renders a comparison matrix. Both capabilities are purely additive — no existing SKILL.md files need modification, and no new tool dependencies are required.

The trend system is built around a per-site `trends.json` file stored alongside the existing `memory/{site}/latest.md`. It retains only the two most recent scans (current + prior) to prevent unbounded growth. The comparison algorithm uses a two-pass fuzzy match: first tries exact content-hash match on finding ID, then falls back to `(finding_type + file_path)` tuple match. The `/batch` command wraps `/diagnose` invocations for each selected site, collects the resulting grade and counts from each `latest.md`, and renders a comparison matrix sorted by grade (worst first).

The implementation involves three deliverables: (1) a new `skills/trend-tracker/SKILL.md` that reads/writes `trends.json` and annotates the report, (2) updates to `commands/diagnose/COMMAND.md` to invoke the trend-tracker after report generation, and (3) a new `commands/batch/COMMAND.md`. No changes needed to existing diagnostic skills or the report-generator skill.

**Primary recommendation:** Build `skills/trend-tracker/SKILL.md` as a post-report aggregator (runs after report-generator, reads findings JSON + prior trends.json, writes updated trends.json, patches latest.md with inline badges), then build `commands/batch/COMMAND.md` as a sequential loop over site names with a comparison matrix at the end.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trend Classification:**
- ID matching: Fuzzy with fallback — try exact content-based hash first, then fall back to matching on (finding_type + file_path) if hash doesn't match. Catches reformatting but accepts risk of false matches in same file.
- Four classifications: New (ID not in prior scan), Resolved (in prior not current), Recurring (in both), Regression (was resolved in a prior scan but reappeared).
- Comparison depth: Prior scan only — compare current vs last scan. Simple, fast, most actionable.
- Staleness: Warn but compare — compare against prior scan regardless of age, but add note when prior scan was 90+ days ago ("trend data may be less meaningful").

**Delta Report Format:**
- Placement: Inline badges per finding — each finding gets a tag like [NEW], [RECURRING], [REGRESSION] next to its title in the existing report. No separate Trends section header.
- Resolved findings: Summary list only — resolved findings appear as a simple list: "Resolved since last scan: [finding titles]". No full detail repeated.
- First scan: Skip trends entirely on first scan — no trends section, no placeholder. Clean report. Trends appear starting scan #2.
- History retention: Last 2 scans only in trends.json — current + prior scan data. Older data shifts out. Prevents unbounded file growth.

**Batch Invocation UX:**
- Command: New `/batch` command — separate from `/diagnose` to keep single-site workflow simple.
- Site selection: User selects subset — `/batch` prompts which sites to include or accepts site names as arguments. Not all-by-default.
- Execution: Parallel with limit — run up to N sites concurrently. Faster than sequential but needs connection limit guard.
- Progress: Status line per site — compact format: "Site 1/4: example.com ... Grade B (3 critical, 5 warning) [42s]" after each site completes.

**Comparison Matrix:**
- Columns: Grade + severity counts — Site name | Grade | Critical | Warning | Info | Last Scanned. Compact, fits terminal.
- Mixed sources: Show with coverage note — include all sites, add footnote or column indicating partial coverage ("git: 8/16 skills"). Grade computed on available findings.
- Access: Part of `/batch` output — matrix appears automatically at end of batch run. No separate command.
- Sorting: By grade, worst first — F sites at top, A at bottom. Most urgent sites front and center.

### Claude's Discretion

None captured in CONTEXT.md. All decisions were locked.

### Deferred Ideas (OUT OF SCOPE)

None captured.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRND-01 | Plugin uses content-based finding IDs (not line-number-based) for stable cross-scan tracking | Finding IDs already use `{PREFIX}-{CHECK}-{HASH}` where HASH is MD5 of location (file path), established in Phase 3. The ID format in report-generator/SKILL.md is content-based, not line-number-based. No changes to ID generation needed — the existing format satisfies this requirement as designed. |
| TRND-02 | User can view delta report showing new, resolved, and recurring findings between audits | Implemented by new `skills/trend-tracker/SKILL.md`: reads prior scan data from trends.json, compares against current COMBINED_FINDINGS, patches inline badges [NEW]/[RECURRING]/[REGRESSION] into latest.md, appends "Resolved since last scan" list at end of report. |
| TRND-03 | Plugin stores trend data in machine-readable format alongside existing case history | New file `memory/{site}/trends.json` stored in the existing memory/{site}/ directory alongside latest.md. Retains last 2 scans. Schema defined in Architecture Patterns section below. |
| BTCH-01 | User can run diagnostics across multiple saved site profiles sequentially | New `commands/batch/COMMAND.md` command. User provides site names as arguments or is prompted. Invokes /diagnose on each site sequentially (with concurrency limit guard). Shows per-site status line after each completes. |
| BTCH-02 | User can view comparison matrix of findings across sites (health grades, finding counts, sorted by health) | Comparison matrix rendered at end of /batch run. Data sourced from memory/{site}/latest.md for each site (reads the grade and counts already in the report). Sorted by grade worst-first using a numeric sort key (F=0, D=1, C=2, B=3, A=4). |
</phase_requirements>

## Standard Stack

### Core (All Existing — No New Dependencies)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Bash | 3.2+ | Skill/command execution, file I/O, trend logic | Used throughout all existing skills |
| jq | 1.6+ | JSON read/write for trends.json, finding comparison, grade extraction | Used everywhere in the plugin |
| md5 (macOS) / md5sum (Linux) | system | Content-hash generation for finding ID stability | Already used in finding ID generation (`echo -n "$LOCATION" \| md5 \| cut -c1-6`) |
| date | system | Staleness check (days since prior scan), timestamp generation | Already used in archive rotation |

### No New Dependencies

This phase adds zero new tools. All implementation is COMMAND.md and SKILL.md authoring using tools already present in the codebase.

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
skills/
└── trend-tracker/
    └── SKILL.md          # Post-report aggregator: reads trends.json, patches latest.md

commands/
└── batch/
    └── COMMAND.md        # Multi-site diagnostic loop with comparison matrix
```

Modifications to existing files:
- `commands/diagnose/COMMAND.md` — add trend-tracker invocation after report generation (Section 5)

No changes to any existing diagnostic skill SKILL.md files.

### Pattern 1: trends.json Schema

**Location:** `memory/{site-name}/trends.json`

**Retention policy:** Last 2 scans only. On each new scan, the "prior" slot shifts out older data and the "current" slot becomes "prior".

```json
{
  "site": "example-com",
  "updated_at": "2026-02-19T14:30:00Z",
  "prior_scan": {
    "scan_date": "2026-02-12T10:15:00Z",
    "grade": "B",
    "critical_count": 0,
    "warning_count": 4,
    "info_count": 3,
    "skill_coverage": "16/16",
    "findings": [
      {
        "id": "SECR-CONFIG-DBG-a1b2c3",
        "title": "WP_DEBUG enabled in production",
        "finding_type": "SECR-CONFIG",
        "file_path": "wp-config.php",
        "severity": "Critical",
        "content_hash": "a1b2c3"
      }
    ]
  },
  "current_scan": {
    "scan_date": "2026-02-19T14:30:00Z",
    "grade": "A",
    "critical_count": 0,
    "warning_count": 2,
    "info_count": 3,
    "skill_coverage": "16/16",
    "findings": [
      {
        "id": "CODE-SQLI-d4e5f6",
        "title": "Potential SQL injection vulnerability",
        "finding_type": "CODE-SQLI",
        "file_path": "plugins/my-plugin/includes/query.php",
        "severity": "Warning",
        "content_hash": "d4e5f6"
      }
    ]
  }
}
```

**Why this schema:** Only the fields needed for trend matching are stored per finding (id, title, finding_type, file_path, severity, content_hash). Full finding detail is NOT stored — it lives in latest.md and archive/. This keeps trends.json small.

### Pattern 2: Trend Tracker Skill (Post-Report Aggregator)

This skill runs AFTER `report-generator` in the `/diagnose` flow. It reads the already-generated `latest.md`, annotates it, and writes `trends.json`. It is structurally similar to `diagnostic-arch-narrative` — it reads existing artifacts rather than running new checks.

**Inputs:**
- `COMBINED_FINDINGS` — JSON array of all findings from current scan (passed from /diagnose)
- `SITE_NAME` — site profile key (passed from /diagnose)
- `memory/{site}/trends.json` — prior scan data (if exists)
- `memory/{site}/latest.md` — current report (just written by report-generator)
- `SCAN_DATE` — current scan ISO timestamp
- `HEALTH_GRADE` — current grade (from /diagnose grading logic)
- `SKILLS_SKIPPED` — array of skipped skills (for coverage note)
- `SKILLS_TOTAL` — total skills attempted

**Step 1: Check for prior scan data**

```bash
TRENDS_FILE="memory/${SITE_NAME}/trends.json"
PRIOR_FINDINGS='[]'
PRIOR_SCAN_DATE=""
IS_FIRST_SCAN=true

if [ -f "$TRENDS_FILE" ]; then
  # Extract prior scan findings from trends.json
  PRIOR_FINDINGS=$(jq -r '.current_scan.findings // []' "$TRENDS_FILE")
  PRIOR_SCAN_DATE=$(jq -r '.current_scan.scan_date // ""' "$TRENDS_FILE")
  IS_FIRST_SCAN=false
fi
```

**Step 2: Check for staleness (90+ days)**

```bash
if [ "$IS_FIRST_SCAN" == "false" ] && [ -n "$PRIOR_SCAN_DATE" ]; then
  # Convert ISO timestamp to epoch for comparison
  # macOS: date -j -f "%Y-%m-%dT%H:%M:%SZ" "$PRIOR_SCAN_DATE" +%s
  # Linux: date -d "$PRIOR_SCAN_DATE" +%s
  PRIOR_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$PRIOR_SCAN_DATE" +%s 2>/dev/null || \
                date -d "$PRIOR_SCAN_DATE" +%s 2>/dev/null)
  NOW_EPOCH=$(date +%s)
  DAYS_AGO=$(( (NOW_EPOCH - PRIOR_EPOCH) / 86400 ))

  if [ "$DAYS_AGO" -ge 90 ]; then
    STALENESS_NOTE="Note: Prior scan was $DAYS_AGO days ago — trend data may be less meaningful."
  fi
fi
```

**Step 3: Classify each current finding**

For each finding in COMBINED_FINDINGS:
1. Try to find exact ID match in PRIOR_FINDINGS
2. If no exact match, try fuzzy match on `(finding_type + file_path)`
3. Classify as: NEW (not in prior), RECURRING (in both current and prior), REGRESSION (in prior, then absent in a prior-prior scan — not directly checkable with 2-scan limit, so: was resolved = was in prior.prior_scan but not prior.current_scan... but we only have 2 scan slots, so REGRESSION is not implementable without a 3rd slot)

**Regression detection with 2-scan limit:** The context says "was resolved in a prior scan but reappeared." With only 2 scans retained, this is NOT directly detectable — we would need scan N-2 data to know something was absent in N-1. The user decision is "last 2 scans only." This means REGRESSION detection is structurally impossible with 2-scan retention. The system can detect: NEW (in current not prior) and RECURRING (in both). RESOLVED (in prior not current) is the fourth state. REGRESSION requires 3 scans minimum.

**Resolution for planner:** REGRESSION classification will be skipped (effectively treated as NEW) unless a third slot is available. The trends.json schema above has only `prior_scan` and `current_scan`. The planner should document this limitation in the COMMAND.md and note that a finding marked [NEW] could theoretically be a regression but cannot be confirmed with 2-scan retention.

```bash
# Classification logic
CURRENT_IDS=$(echo "$COMBINED_FINDINGS" | jq -r '[.[] | .id]')
PRIOR_IDS=$(echo "$PRIOR_FINDINGS" | jq -r '[.[] | .id]')

# New: in current but not in prior (by exact ID)
# Recurring: in both (by exact ID)
# Fuzzy fallback: if ID not matched, try finding_type + file_path
# Resolved: in prior but not current (by exact ID or fuzzy)

classify_finding() {
  local FINDING_ID="$1"
  local FINDING_TYPE="$2"
  local FILE_PATH="$3"

  # Try exact ID match
  EXACT_MATCH=$(echo "$PRIOR_FINDINGS" | jq -r --arg id "$FINDING_ID" \
    '[.[] | select(.id == $id)] | length')

  if [ "$EXACT_MATCH" -gt 0 ]; then
    echo "RECURRING"
    return
  fi

  # Try fuzzy match on type + path
  FUZZY_MATCH=$(echo "$PRIOR_FINDINGS" | jq -r \
    --arg type "$FINDING_TYPE" \
    --arg path "$FILE_PATH" \
    '[.[] | select(.finding_type == $type and .file_path == $path)] | length')

  if [ "$FUZZY_MATCH" -gt 0 ]; then
    echo "RECURRING"
    return
  fi

  echo "NEW"
}
```

**Step 4: Patch latest.md with inline badges**

The report structure from `report-generator` uses headings like:
```
### SECR-CHECKSUMS-a1b2c3: Modified core file detected
```

The trend-tracker patches these headings by appending the badge:
```
### SECR-CHECKSUMS-a1b2c3: Modified core file detected [RECURRING]
```

Implementation approach — read latest.md, for each finding in COMBINED_FINDINGS look up its classification, then sed-replace the heading line:

```bash
# For each classified finding, patch the heading in latest.md
for FINDING_CLASSIFICATION in "${CLASSIFICATIONS[@]}"; do
  FINDING_ID=$(echo "$FINDING_CLASSIFICATION" | jq -r '.id')
  BADGE=$(echo "$FINDING_CLASSIFICATION" | jq -r '.classification')

  # Only badge non-first-scan findings
  if [ "$IS_FIRST_SCAN" == "false" ] && [ "$BADGE" != "" ]; then
    # Replace: "### {ID}: " with "### {ID}: ... [{BADGE}]"
    # Using sed to append badge to the heading line
    # macOS sed: sed -i '' "s/^### ${FINDING_ID}: \(.*\)$/### ${FINDING_ID}: \1 [${BADGE}]/" ...
    sed -i '' "s|^### ${FINDING_ID}: \(.*\)$|### ${FINDING_ID}: \1 [${BADGE}]|" \
      "memory/${SITE_NAME}/latest.md"
  fi
done
```

**Step 5: Append resolved findings summary**

Find findings in PRIOR_FINDINGS but not in current COMBINED_FINDINGS (by exact or fuzzy match). Append to end of latest.md:

```bash
if [ "$IS_FIRST_SCAN" == "false" ]; then
  # Build list of resolved findings (in prior, not in current)
  RESOLVED_TITLES=$(... jq logic ...)

  if [ -n "$RESOLVED_TITLES" ]; then
    cat >> "memory/${SITE_NAME}/latest.md" << 'EOF'

---

## Resolved Since Last Scan

The following findings from the prior scan are no longer detected:

{list of "- {title}" entries}
EOF
  fi

  # Append staleness note if applicable
  if [ -n "$STALENESS_NOTE" ]; then
    echo "" >> "memory/${SITE_NAME}/latest.md"
    echo "> $STALENESS_NOTE" >> "memory/${SITE_NAME}/latest.md"
  fi
fi
```

**Step 6: Write updated trends.json**

Shift current_scan → prior_scan, write new current_scan:

```bash
# Build current scan findings summary (only tracking fields, not full detail)
CURRENT_SCAN_FINDINGS=$(echo "$COMBINED_FINDINGS" | jq '[.[] | {
  id: .id,
  title: .title,
  finding_type: (.id | split("-")[0:2] | join("-")),
  file_path: (.location // ""),
  severity: .severity,
  content_hash: (.id | split("-")[-1])
}]')

SKILL_COVERAGE="${#SKILLS_COMPLETED[@]}/${SKILLS_TOTAL}"

# Shift prior: current_scan becomes prior_scan
# Write new current_scan
if [ -f "$TRENDS_FILE" ]; then
  PREV_CURRENT=$(jq '.current_scan' "$TRENDS_FILE")
  jq -n \
    --arg site "$SITE_NAME" \
    --arg updated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson prior "$PREV_CURRENT" \
    --arg scan_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg grade "$HEALTH_GRADE" \
    --argjson critical "$CRITICAL_TOTAL" \
    --argjson warning "$WARNING_TOTAL" \
    --argjson info "$INFO_TOTAL" \
    --arg coverage "$SKILL_COVERAGE" \
    --argjson findings "$CURRENT_SCAN_FINDINGS" \
    '{
      site: $site,
      updated_at: $updated,
      prior_scan: $prior,
      current_scan: {
        scan_date: $scan_date,
        grade: $grade,
        critical_count: $critical,
        warning_count: $warning,
        info_count: $info,
        skill_coverage: $coverage,
        findings: $findings
      }
    }' > "$TRENDS_FILE"
else
  # First scan — no prior, create trends.json with current only
  jq -n \
    --arg site "$SITE_NAME" \
    --arg updated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg scan_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg grade "$HEALTH_GRADE" \
    --argjson critical "$CRITICAL_TOTAL" \
    --argjson warning "$WARNING_TOTAL" \
    --argjson info "$INFO_TOTAL" \
    --arg coverage "$SKILL_COVERAGE" \
    --argjson findings "$CURRENT_SCAN_FINDINGS" \
    '{
      site: $site,
      updated_at: $updated,
      prior_scan: null,
      current_scan: {
        scan_date: $scan_date,
        grade: $grade,
        critical_count: $critical,
        warning_count: $warning,
        info_count: $info,
        skill_coverage: $coverage,
        findings: $findings
      }
    }' > "$TRENDS_FILE"
fi
```

### Pattern 3: /batch Command Structure

**Site selection:** `/batch` accepts site names as arguments OR prompts if none given.

```bash
# Parse arguments
if [ -n "$@" ]; then
  # User provided site names: /batch site1 site2 site3
  SITES_TO_SCAN=("$@")
else
  # No arguments: show available sites and prompt
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json
  echo ""
  echo "Which sites to scan? (space-separated names, or 'all' for all sites)"
  read -r USER_INPUT

  if [ "$USER_INPUT" == "all" ]; then
    SITES_TO_SCAN=($(jq -r '.sites | keys[]' sites.json))
  else
    SITES_TO_SCAN=($USER_INPUT)
  fi
fi
```

**Sequential execution with status line:**

```bash
SITE_COUNT=${#SITES_TO_SCAN[@]}
SITE_NUM=0
RESULTS=()

for SITE_NAME in "${SITES_TO_SCAN[@]}"; do
  SITE_NUM=$((SITE_NUM + 1))
  START_TIME=$(date +%s)

  echo "Site $SITE_NUM/$SITE_COUNT: $SITE_NAME ..."

  # Run /diagnose on this site (full mode by default)
  # /diagnose internally calls the trend-tracker, so trends.json is updated
  # Capture outcome by reading memory/{site}/latest.md after completion
  # (Invoked by following commands/diagnose/COMMAND.md for this site)

  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))

  # Read grade and counts from latest.md after diagnose completes
  LATEST="memory/${SITE_NAME}/latest.md"
  if [ -f "$LATEST" ]; then
    GRADE=$(grep "^\*\*Health Grade:\*\*" "$LATEST" | awk '{print $NF}')
    CRITICAL=$(grep "^| Critical" "$LATEST" | awk -F'|' '{print $3}' | tr -d ' ')
    WARNING=$(grep "^| Warning" "$LATEST" | awk -F'|' '{print $3}' | tr -d ' ')
  else
    GRADE="ERR"
    CRITICAL=0
    WARNING=0
  fi

  echo "Site $SITE_NUM/$SITE_COUNT: $SITE_NAME ... Grade $GRADE ($CRITICAL critical, $WARNING warning) [${ELAPSED}s]"

  RESULTS+=("${SITE_NAME}|${GRADE}|${CRITICAL}|${WARNING}|${INFO}|$(date +%Y-%m-%d)")
done
```

**Comparison matrix at end:**

Sort by grade worst-first using a numeric grade key (F=0, D=1, C=2, B=3, A=4, Incomplete=5):

```bash
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Comparison Matrix"
echo "═══════════════════════════════════════════════════════════"
printf "%-20s %-6s %-10s %-10s %-6s %-12s\n" "Site" "Grade" "Critical" "Warning" "Info" "Last Scanned"
echo "───────────────────────────────────────────────────────────"

# Sort results by grade (F first, A last)
sort_key() {
  case "$1" in
    F) echo 0 ;;
    D) echo 1 ;;
    C) echo 2 ;;
    B) echo 3 ;;
    A) echo 4 ;;
    Incomplete) echo 5 ;;
    *) echo 6 ;;
  esac
}

# Sort and print rows
for RESULT in "${RESULTS[@]}"; do
  IFS='|' read -r SITE GRADE CRIT WARN INFO SCANNED <<< "$RESULT"
  SORT_VAL=$(sort_key "$GRADE")
  echo "$SORT_VAL|$SITE|$GRADE|$CRIT|$WARN|$INFO|$SCANNED"
done | sort -t'|' -k1 -n | while IFS='|' read -r _ SITE GRADE CRIT WARN INFO SCANNED; do
  printf "%-20s %-6s %-10s %-10s %-6s %-12s\n" "$SITE" "$GRADE" "$CRIT" "$WARN" "$INFO" "$SCANNED"
done

echo "═══════════════════════════════════════════════════════════"
```

### Pattern 4: /diagnose Integration — Trend Tracker Invocation

After the existing Section 5 (Report Generation) in `commands/diagnose/COMMAND.md`, add a new Section 5.5:

```bash
## Section 5.5: Trend Tracking (Post-Report)

# After report is saved to memory/{site}/latest.md,
# invoke trend-tracker to annotate badges and update trends.json
# Only runs if the report was generated successfully

if [ -f "$LATEST" ]; then
  # Pass all required context to trend-tracker skill
  # Following skills/trend-tracker/SKILL.md
  SKILLS_TOTAL=${#SKILLS[@]}
  # trend-tracker reads: COMBINED_FINDINGS, SITE_NAME, LATEST, HEALTH_GRADE,
  # SKILLS_TOTAL, SKILLS_COMPLETED, CRITICAL_TOTAL, WARNING_TOTAL, INFO_TOTAL

  echo "Updating trend history..."
  # (Execute trend-tracker following its SKILL.md instructions)
  echo "Trend data updated: memory/${SITE_NAME}/trends.json"
fi
```

### Anti-Patterns to Avoid

- **Storing full finding detail in trends.json:** Only store tracking fields (id, title, finding_type, file_path, severity, content_hash). Full detail is in latest.md/archive. Keeping trends.json minimal prevents unbounded growth.
- **Claiming REGRESSION classification with 2-scan retention:** REGRESSION requires knowing a finding was absent in the penultimate scan. With only 2 scan slots (current + prior), this cannot be detected. Mark as [NEW] instead of falsely claiming regression.
- **Patching latest.md with in-memory string replacement:** Use sed -i '' (macOS) or sed -i (Linux) to patch the file. Don't rebuild the entire report — only the heading lines need the badge appended.
- **Running trend-tracker before report-generator:** Trend-tracker depends on latest.md existing. It must run after report-generator writes the file.
- **Auto-running /batch on all sites without asking:** The user decision is "not all-by-default." Always ask or require explicit site name arguments.
- **Using HEALTH_GRADE="Incomplete" in trends.json:** Incomplete scans should still write trends.json but the grade field should reflect "Incomplete" so the comparison matrix can show it with the coverage note.
- **sed -i on macOS vs Linux:** macOS sed requires `-i ''` (empty string argument). Linux sed uses `-i` alone. The trend-tracker skill should handle both with a compatibility check or use a macOS-safe invocation consistently (the agent environment is macOS per env vars).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding ID stability | Custom line-number hashing | Existing `{PREFIX}-{CHECK}-{HASH}` format where HASH = MD5(location) | Already established in report-generator SKILL.md — Phase 3 decision. Location is file path, not file:line, so IDs survive reformatting. |
| Trends file rotation | Custom log rotation | Simple 2-slot shift in jq: current_scan → prior_scan on each write | No need for complex log management; 2 slots is the explicit user decision |
| Grade-based sort | Custom sort algorithm | Pipe through `sort -t'\|' -k1 -n` with numeric grade key (F=0, A=4) | Shell sort handles this correctly with the numeric key mapping |
| Report patching | Rebuild entire report | `sed -i ''` to append badge to matching heading line | Report structure is predictable — heading format is `### {ID}: {title}`. Surgical sed is safe and fast. |
| Date epoch conversion | Custom date parser | `date -j -f "%Y-%m-%dT%H:%M:%SZ"` (macOS) with Linux fallback | Standard system date command, same pattern already used in Phase 6 for cron date comparison |
| Multi-site health summary | Separate /matrix command | Built into /batch output | User decision: matrix is automatic output of /batch, not a separate command |

**Key insight:** All data the trend-tracker needs already exists in the /diagnose session context (`COMBINED_FINDINGS`, `HEALTH_GRADE`, `SITE_NAME`, etc.). No new data collection is needed — this is purely a post-processing step on existing output.

## Common Pitfalls

### Pitfall 1: REGRESSION Classification with 2-Scan Limit

**What goes wrong:** The CONTEXT.md lists REGRESSION as one of the four classifications, but with only 2 scan slots (current + prior) in trends.json, REGRESSION is structurally impossible to detect. REGRESSION means "was resolved in a prior scan but reappeared," which requires knowing the state from 3 scans ago.

**Why it happens:** The user selected 2-scan retention for simplicity, but also wants 4 classifications. These are technically incompatible for the REGRESSION case.

**How to avoid:** Implement only 3 classifications with the 2-scan limit: NEW, RECURRING, and track RESOLVED separately. A [NEW] badge covers the case where a finding reappeared — the user sees it as new but understands it could be a recurrence. Document this limitation in the trend-tracker SKILL.md: "REGRESSION classification requires 3+ scan history. With 2-scan retention, reappeared findings are classified as [NEW]."

**Warning signs:** Implementation attempts to access `prior_scan.prior_scan` (which doesn't exist in the schema).

### Pitfall 2: sed Badge Duplication on Re-Scan

**What goes wrong:** If /diagnose runs twice on the same day without clearing latest.md first, the trend-tracker might append a second badge: "Modified core file [RECURRING] [RECURRING]".

**Why it happens:** The archive rotation in /diagnose moves latest.md to archive/ before writing a new one. But the trend-tracker patches the new latest.md after report-generator writes it. If report-generator writes a fresh latest.md each run, the badge will only be applied once per report generation.

**How to avoid:** The trend-tracker should only patch latest.md immediately after it is written (in the same /diagnose session). It should NOT re-read and re-patch on subsequent sessions. The badge is applied once per report. The next scan writes a fresh latest.md, and the trend-tracker patches that fresh copy.

**Warning signs:** Running /diagnose twice in a session and seeing doubled badges like `[RECURRING] [RECURRING]`.

### Pitfall 3: Fuzzy Match False Positives in Large Files

**What goes wrong:** The fuzzy fallback matches on `(finding_type + file_path)`. A file with multiple code quality findings of the same type (e.g., two SQL injection patterns in the same plugin file) would match incorrectly — one finding gets classified as RECURRING when it may be a different instance.

**Why it happens:** The fuzzy match intentionally trades precision for coverage (user accepted this risk: "accepts risk of false matches in same file").

**How to avoid:** This is an accepted limitation per the user's decision. Document it in the SKILL.md. The fuzzy match is intentionally imprecise. The primary match is always exact ID first; fuzzy is only used when exact fails. For the common case (same finding, same file, reformatted code), the fuzzy match gives the correct result.

**Warning signs:** A finding classified as [RECURRING] when the developer is certain they fixed it and introduced a different finding in the same file.

### Pitfall 4: /batch Scanning All Sites Without Concurrency Guard

**What goes wrong:** User says `/batch all` and the command tries to connect SSH to 20 sites simultaneously, exhausting connection limits or file descriptors.

**Why it happens:** The CONTEXT.md says "parallel with limit" but doesn't specify N. Without a guard, parallel execution is unbounded.

**How to avoid:** Sequential execution is simpler and safer given this is a COMMAND.md (Claude follows instructions, not a real shell script with parallel job control). The CONTEXT.md says "parallel with limit" — interpret this as: run up to 3 sites concurrently as the default limit. For a COMMAND.md workflow, sequential is the practical implementation; note the concurrency limit conceptually without actual shell-level parallelism.

**Warning signs:** SSH connection refused errors when too many connections are attempted simultaneously.

### Pitfall 5: Comparison Matrix Reading Stale Data

**What goes wrong:** /batch reads grade/counts from `memory/{site}/latest.md` after running /diagnose, but if /diagnose failed for a site (all skills skipped), latest.md may not have been updated. The matrix shows the stale grade from a previous run.

**Why it happens:** /diagnose continues even when all skills fail — it still writes a report, but the grade may be "Incomplete" or from a prior run.

**How to avoid:** After each /diagnose invocation in /batch, check the `**Date:**` line in latest.md to confirm the report is from today's run. If date doesn't match today, mark the site as "ERR" in the matrix with a note. The status line should also show elapsed time (which /batch already tracks) and if elapsed < 5s, flag as likely failed.

**Warning signs:** Matrix shows a Grade A for a site that was just diagnosed as F, because /diagnose failed silently and the old latest.md was not overwritten.

### Pitfall 6: macOS sed -i vs Linux sed -i

**What goes wrong:** The trend-tracker uses `sed -i` (Linux style) to patch latest.md, but the agent runs on macOS where `sed -i ''` is required.

**Why it happens:** macOS BSD sed requires an explicit backup extension argument (empty string `''` for no backup). Linux GNU sed does not require this.

**How to avoid:** Use `sed -i ''` consistently throughout the SKILL.md since the agent environment is macOS (confirmed by `TERM_PROGRAM=waveterm` env vars and Phase 7 research noting macOS environment). Add a comment noting Linux compatibility: `# macOS: sed -i ''; Linux: sed -i (without '')`.

## Code Examples

Verified patterns from the existing codebase:

### Finding ID Generation (from report-generator/SKILL.md)

```bash
# Source: skills/report-generator/SKILL.md — Section 5: Finding ID Reference
CATEGORY_PREFIX="SECR"    # or CODE, DIAG, SUSP, PERF, ARCH
CHECK_NAME="CONFIG"
LOCATION="wp-config.php"  # File path, NOT file:line

HASH=$(echo -n "$LOCATION" | md5 | cut -c1-6)
FINDING_ID="${CATEGORY_PREFIX}-${CHECK_NAME}-${HASH}"
# Result: SECR-CONFIG-a1b2c3
# This ID is stable: reformatting wp-config.php doesn't change the path,
# so the hash remains the same across scans.
```

### Extract finding_type from finding ID

```bash
# finding_type is the PREFIX-CHECK portion (everything before the final hash)
# Used for fuzzy matching
FINDING_ID="SECR-CONFIG-DBG-a1b2c3"
FINDING_TYPE=$(echo "$FINDING_ID" | rev | cut -d'-' -f2- | rev)
# Result: SECR-CONFIG-DBG

# Or with jq:
echo '"SECR-CONFIG-DBG-a1b2c3"' | jq -r 'split("-")[:-1] | join("-")'
# Result: SECR-CONFIG-DBG
```

### Reading grade and counts from latest.md

```bash
# Source: commands/diagnose/COMMAND.md — report format from report-generator
# Report contains: "**Health Grade:** B" and a findings table

LATEST="memory/${SITE_NAME}/latest.md"
GRADE=$(grep "^\*\*Health Grade:\*\*" "$LATEST" | awk '{print $NF}')
# Result: "B" or "F" or "Incomplete"

# Count by reading the findings summary table:
# | Critical | 2   |
# | Warning  | 5   |
CRITICAL=$(grep "^| Critical" "$LATEST" | awk -F'|' '{gsub(/ /, "", $3); print $3}')
WARNING=$(grep "^| Warning" "$LATEST" | awk -F'|' '{gsub(/ /, "", $3); print $3}')
INFO=$(grep "^| Info" "$LATEST" | awk -F'|' '{gsub(/ /, "", $3); print $3}')
```

### jq shift for trends.json rotation

```bash
# Shift current_scan → prior_scan, write new current_scan
CURRENT_DATA=$(jq '.current_scan' "$TRENDS_FILE")

jq -n \
  --arg site "$SITE_NAME" \
  --arg updated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson prior "$CURRENT_DATA" \
  --argjson new_current "$NEW_CURRENT_SCAN_JSON" \
  '{
    site: $site,
    updated_at: $updated,
    prior_scan: $prior,
    current_scan: $new_current
  }' > /tmp/trends.json.tmp && mv /tmp/trends.json.tmp "$TRENDS_FILE"
```

### Inline badge sed patch (macOS)

```bash
# Source: macOS BSD sed behavior (confirmed by agent environment)
# Append badge to the finding heading line
FINDING_ID="SECR-CONFIG-DBG-a1b2c3"
BADGE="RECURRING"

# sed -i '' for macOS (no backup file)
sed -i '' "s|^### ${FINDING_ID}: \(.*\)$|### ${FINDING_ID}: \1 [${BADGE}]|" \
  "memory/${SITE_NAME}/latest.md"

# Note: The finding ID contains hyphens and alphanumerics only — no special regex chars.
# The : separator after the ID is literal in the report format.
```

### Grade sort key for comparison matrix

```bash
# Map grade to sort key for worst-first ordering
grade_sort_key() {
  case "$1" in
    "F") echo "0" ;;
    "D") echo "1" ;;
    "C") echo "2" ;;
    "B") echo "3" ;;
    "A") echo "4" ;;
    "Incomplete") echo "5" ;;
    *) echo "9" ;;  # Unknown/error last
  esac
}

# Build sortable result lines: "{sort_key}|{site}|{grade}|..."
for RESULT in "${RESULTS[@]}"; do
  IFS='|' read -r SITE GRADE CRIT WARN INFO SCANNED <<< "$RESULT"
  KEY=$(grade_sort_key "$GRADE")
  echo "${KEY}|${SITE}|${GRADE}|${CRIT}|${WARN}|${INFO}|${SCANNED}"
done | sort -t'|' -k1 -n
```

### Staleness check (days since prior scan)

```bash
# Date conversion: ISO8601 to epoch
# Attempt macOS format first, fall back to Linux
PRIOR_SCAN_DATE="2025-11-01T10:15:00Z"

# macOS date -j -f
PRIOR_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$PRIOR_SCAN_DATE" +%s 2>/dev/null)
# Linux fallback
if [ -z "$PRIOR_EPOCH" ]; then
  PRIOR_EPOCH=$(date -d "$PRIOR_SCAN_DATE" +%s 2>/dev/null)
fi

NOW_EPOCH=$(date +%s)
DAYS_AGO=$(( (NOW_EPOCH - PRIOR_EPOCH) / 86400 ))

if [ "$DAYS_AGO" -ge 90 ]; then
  echo "> Note: Prior scan was ${DAYS_AGO} days ago — trend data may be less meaningful."
fi
```

## Deliverable Decomposition

This phase requires 3 deliverables. The planner should create one plan per deliverable.

### Deliverable 1: skills/trend-tracker/SKILL.md (TRND-02, TRND-03)

- New post-report aggregator skill
- Inputs: COMBINED_FINDINGS, SITE_NAME, HEALTH_GRADE, memory/{site}/latest.md, memory/{site}/trends.json (if exists)
- Reads prior scan data from trends.json
- Classifies each current finding (NEW, RECURRING; RESOLVED computed from prior)
- Patches latest.md with inline [NEW]/[RECURRING] badges via sed
- Appends "Resolved since last scan" section to latest.md
- Appends staleness note if prior scan was 90+ days ago
- Writes updated trends.json (2-slot rotation: current → prior, new current written)
- Handles first scan gracefully: skip badges, write first trends.json with null prior_scan
- Does NOT add badges on first scan (clean report per user decision)

### Deliverable 2: Update commands/diagnose/COMMAND.md (TRND-01, TRND-02, TRND-03)

- Add Section 5.5 after existing Section 5 (Report Generation)
- Invoke trend-tracker after latest.md is written
- Pass all required context variables (COMBINED_FINDINGS, SITE_NAME, HEALTH_GRADE, CRITICAL_TOTAL, WARNING_TOTAL, INFO_TOTAL, SKILLS_COMPLETED, SKILLS_TOTAL)
- This is an additive-only change to the existing command (no restructuring)

### Deliverable 3: commands/batch/COMMAND.md (BTCH-01, BTCH-02)

- New command file
- Natural language argument parsing: `/batch site1 site2` or `/batch` with prompt
- Lists available sites from sites.json if no arguments given
- Accepts "all" as shorthand for all configured sites
- Sequential /diagnose execution for each site with timing
- Status line per site after completion: "Site N/M: example.com ... Grade B (3 critical, 5 warning) [42s]"
- Reads grade + counts from memory/{site}/latest.md after each /diagnose completes
- Comparison matrix at end, sorted by grade worst-first
- Coverage note in matrix for sites with incomplete scans (reads skill coverage from trends.json)
- Handles sites not found in sites.json: skip with warning
- Handles /diagnose failure for a site: show ERR in matrix, continue to next site

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No trend tracking | trends.json per site with 2-scan rotation | Phase 8 (new) | Users can see which findings are recurring vs new |
| No multi-site batch | /batch command with comparison matrix | Phase 8 (new) | Users can assess fleet health at a glance |
| Single-site /diagnose only | /batch + /diagnose | Phase 8 (new) | /diagnose unchanged; /batch wraps it |
| Report has no trend badges | Inline [NEW]/[RECURRING] badges on finding headings | Phase 8 (new) | Actionability: recurring findings deserve more urgency |

## Open Questions

1. **REGRESSION classification with 2-scan retention**
   - What we know: REGRESSION requires scan N-2 data; trends.json only retains 2 scans
   - What's unclear: Whether to (a) document as known limitation and classify as [NEW], or (b) add a third slot to trends.json for regression detection
   - Recommendation: Document as known limitation. Classify reappeared findings as [NEW]. The user accepted 2-scan retention for simplicity. Adding a third slot changes the schema decision and adds complexity. The planner should call this out in the plan and confirm with the user if REGRESSION detection is worth the complexity trade-off.

2. **"Parallel with limit" for /batch in a COMMAND.md context**
   - What we know: COMMAND.md files are instructions Claude follows, not shell scripts with real job control. True parallel execution is not possible in this architecture.
   - What's unclear: What "parallel with limit" means when Claude is executing instructions sequentially
   - Recommendation: Implement sequential execution. The "limit" concept refers to the number of sites Claude processes before pausing to display intermediate results. For practical purposes, sequential is safer (avoids SSH connection exhaustion) and the per-site status lines still provide meaningful progress feedback.

3. **Coverage note data source for comparison matrix**
   - What we know: The matrix should show "git: 8/16 skills" for sites where WP-CLI skills were skipped. The trends.json stores `skill_coverage` as a string like "8/16".
   - What's unclear: How to distinguish "git source" from other sources of incompleteness (WP-CLI unavailable on SSH server, skills that errored)
   - Recommendation: Read `source_type` from sites.json for each site. If source_type is "git", label coverage as "git: {coverage}". For other source types with incomplete coverage, label as "partial: {coverage}". The data is already available in sites.json and trends.json.

## Sources

### Primary (HIGH confidence)

- `/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/skills/report-generator/SKILL.md` — Finding ID format, ID generation logic, report markdown structure, memory/ directory layout, archive rotation pattern
- `/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/commands/diagnose/COMMAND.md` — Skill execution pattern, COMBINED_FINDINGS aggregation, HEALTH_GRADE computation, section structure for extension point
- `/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/sites.json.example` — sites.json object-keyed schema with all profile fields
- `/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/.planning/phases/08-findings-trends-batch-operations/08-CONTEXT.md` — All locked user decisions
- `/Users/robertli/Desktop/consulting/wordie/cowork-wp-plugin/.planning/phases/07-performance-architecture/07-RESEARCH.md` — Established patterns (jq, bash, date handling, macOS vs Linux compatibility, SKILL.md structure for aggregator skills)

### Secondary (MEDIUM confidence)

- macOS BSD sed `-i ''` behavior: confirmed by macOS environment (`TERM_PROGRAM=waveterm`, `HOMEBREW_PREFIX=/opt/homebrew`)
- `sort -t'|' -k1 -n` for pipe-delimited sort: standard POSIX behavior, safe assumption
- `/usr/bin/md5` on macOS vs `md5sum` on Linux: the finding ID generation in report-generator already uses `md5` (macOS), which confirms agent environment

### Tertiary (LOW confidence)

None — all critical findings are backed by codebase inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in use from prior phases
- trends.json schema: HIGH — derived directly from user decisions and existing memory/ structure
- Trend classification logic: HIGH — derived from user decisions in CONTEXT.md
- REGRESSION limitation: HIGH — structural constraint of 2-scan limit, confirmed by design
- /batch command structure: HIGH — follows same patterns as /diagnose command
- sed -i '' macOS behavior: HIGH — confirmed by agent environment
- Concurrency in COMMAND.md: HIGH — sequential is the only practical implementation

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (30 days — all dependencies are internal codebase patterns, stable)
