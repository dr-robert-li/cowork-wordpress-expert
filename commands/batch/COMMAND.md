---
name: batch
description: Run diagnostics across multiple saved site profiles sequentially with per-site status lines and a comparison matrix
usage: /batch [site1 site2 ...] [mode]
---

# Batch Command

Run diagnostics across multiple saved site profiles sequentially and render a comparison matrix sorted by health grade. Each site is scanned via `/diagnose`, and the results are aggregated into a side-by-side matrix showing grades, finding counts, and coverage — sorted worst-grade-first for immediate triage.

This command runs /diagnose for each site. All /diagnose features apply: reconnect, source-type gating, trend tracking. The comparison matrix reads from `trends.json` (written by trend-tracker during /diagnose). If a site's `trends.json` is missing, the matrix shows ERR.

Sequential execution. Each site runs to completion before the next begins. This avoids SSH connection exhaustion and ensures each site's `trends.json` is written before the matrix reads it.

Sites are scanned in the order provided. The matrix is sorted by grade regardless of scan order.

## Section 1: Argument Parsing

Parse user input for site names and optional diagnostic mode.

### Mode Detection

Use the same mode detection pattern as /diagnose (case-insensitive matching):

```bash
# Convert input to lowercase for matching
USER_INPUT=$(echo "$@" | tr '[:upper:]' '[:lower:]')

# Mode detection patterns (same as /diagnose Section 1)
if echo "$USER_INPUT" | grep -qE "(security|audit|security only|just security|security-only)"; then
  MODE="security-only"
elif echo "$USER_INPUT" | grep -qE "(code|quality|code only|just code|code-only)"; then
  MODE="code-only"
elif echo "$USER_INPUT" | grep -qE "(performance|perf|n\+1|n1|cron|profile)"; then
  MODE="performance"
else
  MODE="full"
fi
```

### Site Name Extraction

Extract site names from input. Mode keywords are removed; remaining words are treated as site names.

```bash
# Remove mode keywords from input to isolate site names
SITE_INPUT=$(echo "$USER_INPUT" | sed -E 's/(security-only|security|audit|code-only|code|quality|performance|perf|full)//g' | xargs)

# Split remaining words into site name candidates
REQUESTED_SITES=($SITE_INPUT)
```

### Interactive Site Selection

If no site names provided (or only a mode keyword was given), list available sites and prompt for selection:

```bash
if [ ${#REQUESTED_SITES[@]} -eq 0 ]; then
  # Check sites.json exists
  if [ ! -f sites.json ]; then
    echo "No sites configured. Use /connect to add a site first."
    exit 1
  fi

  AVAILABLE_SITES=$(jq -r '.sites | keys[]' sites.json 2>/dev/null)
  SITE_COUNT=$(echo "$AVAILABLE_SITES" | wc -l | xargs)

  if [ "$SITE_COUNT" -eq 0 ]; then
    echo "No sites configured. Use /connect to add a site first."
    exit 1
  fi

  echo "Available sites:"
  echo "$AVAILABLE_SITES" | while read -r SITE; do
    SOURCE_TYPE=$(jq -r ".sites[\"$SITE\"].source_type // \"ssh\"" sites.json)
    echo "  - $SITE ($SOURCE_TYPE)"
  done
  echo ""
  echo "Enter site names (space-separated) or 'all' for every site:"

  # Read user response
  # If user says "all": use every site in sites.json
  # If user provides names: use those names
  # If user cancels: exit gracefully

  # Example handling:
  # RESPONSE="all"
  if [ "$RESPONSE" = "all" ]; then
    REQUESTED_SITES=($(jq -r '.sites | keys[]' sites.json))
  else
    REQUESTED_SITES=($RESPONSE)
  fi
fi
```

### Site Validation

Validate each requested site exists in `sites.json`. Skip unknown sites with a warning:

```bash
if [ ! -f sites.json ]; then
  echo "No sites configured. Use /connect to add a site first."
  exit 1
fi

SITES_TO_SCAN=()

for SITE_NAME in "${REQUESTED_SITES[@]}"; do
  PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)
  if [ "$PROFILE" = "null" ]; then
    echo "Site '$SITE_NAME' not found in sites.json -- skipping"
  else
    SITES_TO_SCAN+=("$SITE_NAME")
  fi
done

# If no valid sites remain after validation, exit
if [ ${#SITES_TO_SCAN[@]} -eq 0 ]; then
  echo ""
  echo "No valid sites to scan."
  echo ""
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json
  echo ""
  echo "Usage: /batch [site1 site2 ...] [mode]"
  exit 1
fi

echo ""
echo "Batch scan: ${#SITES_TO_SCAN[@]} site(s) in $MODE mode"
echo ""
```

## Section 2: Sequential Execution

For each validated site, run `/diagnose` sequentially. After each completes, read results from `trends.json` and print a status line.

### Execution Loop

```bash
SITE_COUNT=${#SITES_TO_SCAN[@]}
SITE_NUM=0
RESULTS=()

for SITE_NAME in "${SITES_TO_SCAN[@]}"; do
  SITE_NUM=$((SITE_NUM + 1))
  START_TIME=$(date +%s)

  echo ""
  echo "━━━ Site $SITE_NUM/$SITE_COUNT: $SITE_NAME ━━━"

  # Follow commands/diagnose/COMMAND.md for this site with the selected MODE
  # /diagnose internally handles: reconnect, skill execution, report generation, trend tracking
  # Reference: commands/diagnose/COMMAND.md (all sections apply)

  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))
```

### Read Results from trends.json

After each `/diagnose` completes, read results from the generated artifacts:

```bash
  # Read grade and counts from trends.json (written by trend-tracker during /diagnose)
  TRENDS_FILE="memory/${SITE_NAME}/trends.json"

  if [ -f "$TRENDS_FILE" ]; then
    GRADE=$(jq -r '.current_scan.grade // "ERR"' "$TRENDS_FILE")
    CRITICAL=$(jq -r '.current_scan.critical_count // 0' "$TRENDS_FILE")
    WARNING=$(jq -r '.current_scan.warning_count // 0' "$TRENDS_FILE")
    INFO=$(jq -r '.current_scan.info_count // 0' "$TRENDS_FILE")
    COVERAGE=$(jq -r '.current_scan.skill_coverage // "0/0"' "$TRENDS_FILE")
    SCAN_DATE=$(jq -r '.current_scan.scan_date // ""' "$TRENDS_FILE")
  else
    # trends.json missing — diagnose may have failed
    GRADE="ERR"
    CRITICAL=0
    WARNING=0
    INFO=0
    COVERAGE="0/0"
    SCAN_DATE=""
  fi
```

### Per-Site Status Line

Print a summary status line after each site completes:

```bash
  # Status line format
  if [ "$GRADE" = "ERR" ]; then
    echo "Site $SITE_NUM/$SITE_COUNT: $SITE_NAME ... Grade ERR (connection failed) [${ELAPSED}s]"
  else
    echo "Site $SITE_NUM/$SITE_COUNT: $SITE_NAME ... Grade $GRADE ($CRITICAL critical, $WARNING warning) [${ELAPSED}s]"
  fi

  # Store result for comparison matrix
  RESULTS+=("${SITE_NAME}|${GRADE}|${CRITICAL}|${WARNING}|${INFO}|${COVERAGE}|${SCAN_DATE}")

done
```

## Section 3: Comparison Matrix

After all sites complete, render the comparison matrix sorted by grade worst-first.

### Grade Sort Key Mapping

Map letter grades to numeric sort keys so that the worst grades appear at the top:

```bash
# Grade sort key: F=0, D=1, C=2, B=3, A=4, Incomplete=5, ERR=9
get_grade_sort_key() {
  case "$1" in
    "F")          echo 0 ;;
    "D")          echo 1 ;;
    "C")          echo 2 ;;
    "B")          echo 3 ;;
    "A")          echo 4 ;;
    "Incomplete") echo 5 ;;
    "ERR")        echo 9 ;;
    *)            echo 9 ;;
  esac
}
```

### Build and Sort Matrix Rows

```bash
# Build sortable lines with grade_sort_key prefix
SORTED_LINES=()
for RESULT in "${RESULTS[@]}"; do
  IFS='|' read -r R_SITE R_GRADE R_CRITICAL R_WARNING R_INFO R_COVERAGE R_SCAN_DATE <<< "$RESULT"
  SORT_KEY=$(get_grade_sort_key "$R_GRADE")
  SORTED_LINES+=("${SORT_KEY}|${R_SITE}|${R_GRADE}|${R_CRITICAL}|${R_WARNING}|${R_INFO}|${R_COVERAGE}|${R_SCAN_DATE}")
done

# Sort by grade sort key (numeric ascending = worst first)
SORTED=$(printf '%s\n' "${SORTED_LINES[@]}" | sort -t'|' -k1 -n)
```

### Render Matrix

```bash
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Comparison Matrix"
echo "═══════════════════════════════════════════════════════════════════"
printf "%-25s %-6s %-10s %-10s %-6s %-12s\n" "Site" "Grade" "Critical" "Warning" "Info" "Last Scanned"
echo "───────────────────────────────────────────────────────────────────"

# Print each row from sorted results
while IFS= read -r LINE; do
  IFS='|' read -r S_KEY S_SITE S_GRADE S_CRITICAL S_WARNING S_INFO S_COVERAGE S_SCAN_DATE <<< "$LINE"

  # Format scan date for display (extract date portion from ISO timestamp)
  if [ -n "$S_SCAN_DATE" ] && [ "$S_SCAN_DATE" != "null" ]; then
    DISPLAY_DATE=$(echo "$S_SCAN_DATE" | cut -dT -f1)
  else
    DISPLAY_DATE="--"
  fi

  printf "%-25s %-6s %-10s %-10s %-6s %-12s\n" "$S_SITE" "$S_GRADE" "$S_CRITICAL" "$S_WARNING" "$S_INFO" "$DISPLAY_DATE"
done <<< "$SORTED"

echo "───────────────────────────────────────────────────────────────────"
```

### Coverage Footnotes

After the table, add a coverage footnote for any sites with partial skill coverage:

```bash
# Determine expected full coverage based on mode
case "$MODE" in
  "full")           FULL_COVERAGE_COUNT=16 ;;
  "security-only")  FULL_COVERAGE_COUNT=3 ;;
  "code-only")      FULL_COVERAGE_COUNT=2 ;;
  "performance")    FULL_COVERAGE_COUNT=3 ;;
esac

FULL_COVERAGE="${FULL_COVERAGE_COUNT}/${FULL_COVERAGE_COUNT}"

# Check if any site has partial coverage
HAS_PARTIAL=false
NOTES=()

while IFS= read -r LINE; do
  IFS='|' read -r S_KEY S_SITE S_GRADE S_CRITICAL S_WARNING S_INFO S_COVERAGE S_SCAN_DATE <<< "$LINE"

  if [ "$S_COVERAGE" != "$FULL_COVERAGE" ] && [ "$S_COVERAGE" != "0/0" ]; then
    HAS_PARTIAL=true
    # Read source_type from sites.json for context
    SOURCE_TYPE=$(jq -r ".sites[\"$S_SITE\"].source_type // \"ssh\"" sites.json 2>/dev/null)
    NOTES+=("  * $S_SITE: $S_COVERAGE skills ($SOURCE_TYPE source)")
  elif [ "$S_COVERAGE" = "0/0" ]; then
    HAS_PARTIAL=true
    NOTES+=("  * $S_SITE: scan failed (no skills completed)")
  fi
done <<< "$SORTED"

if [ "$HAS_PARTIAL" = true ]; then
  echo ""
  echo "Notes:"
  for NOTE in "${NOTES[@]}"; do
    echo "$NOTE"
  done
fi

echo "═══════════════════════════════════════════════════════════════════"
echo ""
```

## Section 4: Error Handling

### Error: sites.json Missing or Empty

```bash
if [ ! -f sites.json ]; then
  echo "No sites configured. Use /connect to add a site first."
  exit 1
fi

TOTAL_SITES=$(jq -r '.sites | length' sites.json 2>/dev/null || echo "0")
if [ "$TOTAL_SITES" -eq 0 ]; then
  echo "No sites configured. Use /connect to add a site first."
  exit 1
fi
```

### Error: /diagnose Fails for a Site

If `/diagnose` fails for a site (connection error, all skills skipped, SSH timeout):

- Record ERR grade in results
- Show in status line as "Grade ERR (connection failed)"
- Continue to next site — do NOT abort the batch

```bash
# Inside the execution loop, if /diagnose exits with error:
if [ $DIAGNOSE_EXIT -ne 0 ]; then
  GRADE="ERR"
  CRITICAL=0
  WARNING=0
  INFO=0
  COVERAGE="0/0"
  SCAN_DATE=""
  echo "Site $SITE_NUM/$SITE_COUNT: $SITE_NAME ... Grade ERR (connection failed) [${ELAPSED}s]"
  RESULTS+=("${SITE_NAME}|ERR|0|0|0|0/0|")
  continue
fi
```

### Error: User Cancels During Site Selection

If user cancels or provides empty input during the interactive prompt, exit gracefully:

```bash
if [ -z "$RESPONSE" ]; then
  echo "Batch scan cancelled."
  exit 0
fi
```

## Section 5: Registration

### Plugin Manifest Entry

Add to `.claude-plugin/plugin.json` commands object:

```json
{
  "batch": {
    "description": "Run diagnostics across multiple saved site profiles with comparison matrix",
    "status": "implemented"
  }
}
```

### Integration with /status

Update the /status command's "Available Commands" footer to include /batch:

```
Available commands: /connect, /diagnose, /batch, /investigate, /status
```

Note: The /status COMMAND.md needs a one-line addition to its Available Commands section to include `/batch`.

### Help Text

When user runs `/batch` with no arguments and no sites configured, show usage help:

```bash
echo "Usage: /batch [site1 site2 ...] [mode]"
echo ""
echo "Run diagnostics across multiple sites and view a comparison matrix."
echo ""
echo "Modes: full (default), security-only, code-only, performance"
echo ""
echo "Examples:"
echo "  /batch mysite1 mysite2          -- Run full diagnostics on two sites"
echo "  /batch mysite1 security-only    -- Run security scan on one site"
echo "  /batch all                      -- Run full diagnostics on all configured sites"
echo "  /batch                          -- Prompted to select from available sites"
```

## Implementation Notes

**Command format:** This is a CoWork plugin COMMAND.md containing procedural instructions for Claude to follow, not a standalone bash script. When a user says "/batch" or "/batch site1 site2", Claude reads this file and executes the steps described above.

**Relationship to /diagnose:** This command orchestrates multiple sequential invocations of /diagnose. All /diagnose features apply per site: source-type routing, WP-CLI gating, skill execution, report generation, and trend tracking. The /batch command adds the orchestration layer (site iteration) and the comparison matrix (reading from trends.json after each site completes).

**JSON data source:** The comparison matrix reads grade, counts, and coverage from `memory/{site}/trends.json` — the same file written by the trend-tracker skill (skills/trend-tracker/SKILL.md) during each /diagnose run. This avoids re-parsing reports and ensures consistent data.

**Sort order:** The matrix is always sorted worst-grade-first (F at top, A at bottom) regardless of scan order. This puts the sites needing the most attention at the top for immediate triage.

**Error recovery:** If /diagnose fails for one site, the batch continues to the next. Failed sites appear in the matrix with grade "ERR" so no data is silently lost.

## Success Criteria

The /batch command is successful when:

- User can invoke with site names: `/batch site1 site2`, `/batch site1 security-only`
- User can invoke without arguments and be prompted to select from available sites
- Each site runs /diagnose to completion before the next begins
- Per-site status lines show: `Site N/M: {name} ... Grade {X} ({N} critical, {N} warning) [{N}s]`
- Comparison matrix displays all sites sorted by grade worst-first
- Matrix columns: Site | Grade | Critical | Warning | Info | Last Scanned
- Coverage notes appear for sites with partial skill coverage
- Failed sites show ERR grade and do not abort the batch
- Plugin manifest and /status command updated to include /batch
