---
name: investigate
description: Full-workflow diagnostic investigation — intake questioning, site reconnaissance, smart skill planning, parallel execution, and findings verification
usage: /investigate [concern] [on site-name]
---

# Investigate Command

Run a thorough diagnostic investigation on a WordPress site. Unlike `/diagnose` (which runs skills immediately), `/investigate` first gathers context about what's wrong, scouts the site for environmental clues, plans which skills to run and in what order, executes them in parallel waves, and verifies that findings actually address the user's concern.

**Flow:** Intake → Scout → Plan → Execute → Review → Report

Each step is skippable via `config.json` toggles or user request.

## Section 1: Natural Language Argument Parsing

Parse user input to extract concern, urgency, and target site.

### Concern Extraction

```bash
# Convert input to lowercase for matching
USER_INPUT=$(echo "$@" | tr '[:upper:]' '[:lower:]')

# Urgency detection (emergency keywords)
if echo "$USER_INPUT" | grep -qE "(hacked|hack|malware|defaced|compromised|breach|backdoor|down|broken|white screen|500 error)"; then
  URGENCY="emergency"
elif echo "$USER_INPUT" | grep -qE "(slow|performance|speed|timeout|loading)"; then
  URGENCY="urgent"
elif echo "$USER_INPUT" | grep -qE "(review|audit|check|health|routine|before launch|proactive)"; then
  URGENCY="proactive"
else
  URGENCY="routine"
fi

# Concern type detection
if echo "$USER_INPUT" | grep -qE "(security|hack|malware|breach|backdoor|compromised|defaced)"; then
  CONCERN_TYPE="security"
elif echo "$USER_INPUT" | grep -qE "(performance|slow|speed|timeout|loading|cache)"; then
  CONCERN_TYPE="performance"
elif echo "$USER_INPUT" | grep -qE "(code|quality|review|standards|deprecat)"; then
  CONCERN_TYPE="code-quality"
elif echo "$USER_INPUT" | grep -qE "(update|outdated|version|compatibility)"; then
  CONCERN_TYPE="updates"
else
  CONCERN_TYPE="general"
fi
```

### Site Name Extraction

```bash
# Look for "on {site-name}" or "for {site-name}" patterns
SITE_NAME=$(echo "$USER_INPUT" | sed -n 's/.*\(on\|for\) \+\([a-z0-9_-]\+\).*/\2/p')

# If no site specified, use default from sites.json
if [ -z "$SITE_NAME" ]; then
  SITE_NAME=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json 2>/dev/null)
fi

# If still no site found, list available and exit
if [ -z "$SITE_NAME" ]; then
  echo "No site specified and no default site configured."
  echo ""
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json 2>/dev/null
  echo ""
  echo "Usage: /investigate [concern] on {site-name}"
  exit 1
fi
```

## Section 2: Connection Verification + Auto-Connect

Verify site profile exists and auto-connect if needed. Same pattern as `/diagnose`.

```bash
# Load sites.json
if [ ! -f sites.json ]; then
  echo "ERROR: No sites configured."
  echo "Run /connect first to set up a WordPress site connection."
  exit 1
fi

# Check if site profile exists
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)
if [ "$PROFILE" == "null" ]; then
  echo "ERROR: Site '$SITE_NAME' not found in sites.json."
  echo ""
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json
  echo ""
  echo "Run /connect to add a new site."
  exit 1
fi

# Extract connection details
HOST=$(echo "$PROFILE" | jq -r '.host')
USER=$(echo "$PROFILE" | jq -r '.user')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path')
LOCAL_PATH=$(echo "$PROFILE" | jq -r '.local_path')
WP_CLI_PATH=$(echo "$PROFILE" | jq -r '.wp_cli_path')
SITE_URL=$(echo "$PROFILE" | jq -r '.site_url')

# Auto-connect if no local files
if [ ! -d "$LOCAL_PATH" ] || [ -z "$(ls -A "$LOCAL_PATH" 2>/dev/null)" ]; then
  echo "No local files found for $SITE_NAME. Auto-connecting..."
  # Run /connect command workflow for this site using saved profile
  echo "Connection established. Proceeding with investigation..."
fi
```

## Section 3: Load Configuration

Read workflow toggles from config.json.

```bash
CONFIG_FILE="config.json"
if [ -f "$CONFIG_FILE" ]; then
  INTAKE_ENABLED=$(jq -r '.workflow.intake_questions // true' "$CONFIG_FILE")
  SCOUTING_ENABLED=$(jq -r '.workflow.site_scouting // true' "$CONFIG_FILE")
  PLANNING_ENABLED=$(jq -r '.workflow.scan_planning // true' "$CONFIG_FILE")
  PARALLEL_ENABLED=$(jq -r '.workflow.parallel_skills // true' "$CONFIG_FILE")
  REVIEW_ENABLED=$(jq -r '.workflow.findings_review // true' "$CONFIG_FILE")
  TRACK_HISTORY=$(jq -r '.behavior.track_case_history // true' "$CONFIG_FILE")
  AUTO_RESYNC=$(jq -r '.behavior.auto_resync_before_scan // true' "$CONFIG_FILE")
else
  # Defaults: all enabled
  INTAKE_ENABLED=true
  SCOUTING_ENABLED=true
  PLANNING_ENABLED=true
  PARALLEL_ENABLED=true
  REVIEW_ENABLED=true
  TRACK_HISTORY=true
  AUTO_RESYNC=true
fi
```

## Section 4: Intake (Context Gathering)

Invoke the intake skill to gather user context before scanning.

**Reference:** `skills/intake/SKILL.md`

```bash
if [ "$INTAKE_ENABLED" == "true" ]; then
  echo ""
  echo "── Intake ──────────────────────────────"
  echo ""

  # If emergency urgency detected from command args, skip detailed intake
  if [ "$URGENCY" == "emergency" ]; then
    echo "Emergency detected. Skipping detailed intake — proceeding with full security scan."
    echo ""
    # Create minimal active-case.json with extracted context
    MEMORY_DIR="memory/${SITE_NAME}"
    mkdir -p "$MEMORY_DIR"
    # Write active-case.json with emergency defaults
    # (Following skills/intake/SKILL.md Section 5 output format)
  else
    # Run the intake skill
    # Reference: skills/intake/SKILL.md
    # This skill:
    # 1. Loads prior case history from memory/{site}/case-log.json
    # 2. Asks conversational questions based on gaps
    # 3. Presents readiness gate for confirmation
    # 4. Writes active-case.json with structured context

    # If user says "skip" or "just scan it", proceed with defaults
    # Intake skill handles skip detection internally
    echo "Let me understand what you're working with before I scan..."
    echo ""
  fi
else
  echo "Intake: Disabled (config.json)"
  # Create default active-case.json
fi
```

**Skip scenarios:**
- `config.json` has `intake_questions: false`
- Emergency urgency detected (auto-proceed with security focus)
- User says "skip", "just scan it", "no questions", "go"

## Section 5: Site Scouting (SSH Reconnaissance)

Invoke the site-scout skill to gather environment data.

**Reference:** `skills/site-scout/SKILL.md`

```bash
if [ "$SCOUTING_ENABLED" == "true" ]; then
  echo ""
  echo "── Site Scout ──────────────────────────"
  echo ""
  echo "Scouting site environment..."

  # Run site-scout skill
  # Reference: skills/site-scout/SKILL.md
  # This skill:
  # 1. Connects via SSH
  # 2. Runs 8 lightweight checks (debug log, PHP info, recent files, etc.)
  # 3. Generates alerts from findings
  # 4. Writes scout-report.json to memory/{site}/

  # Display scout alerts inline
  SCOUT_REPORT="memory/${SITE_NAME}/scout-report.json"
  if [ -f "$SCOUT_REPORT" ]; then
    ALERTS=$(jq -r '.alerts[]?' "$SCOUT_REPORT")
    if [ -n "$ALERTS" ]; then
      echo ""
      echo "Scout alerts:"
      echo "$ALERTS" | while read -r alert; do
        echo "  ! $alert"
      done
    fi
    CHECKS_DONE=$(jq -r '.checks_completed' "$SCOUT_REPORT")
    CHECKS_FAIL=$(jq -r '.checks_failed' "$SCOUT_REPORT")
    echo ""
    echo "Scout complete: $CHECKS_DONE checks passed, $CHECKS_FAIL failed"
  fi
else
  echo "Site scout: Disabled (config.json)"
fi
```

## Section 6: Silent File Resync

Before running diagnostic skills, resync files from remote.

```bash
if [ "$AUTO_RESYNC" == "true" ]; then
  echo ""
  echo "Syncing files from remote..."

  # Detect rsync variant
  RSYNC_VERSION=$(rsync --version 2>&1 | head -1)
  if echo "$RSYNC_VERSION" | grep -q "openrsync"; then
    PROGRESS_FLAG="-v"
  else
    PROGRESS_FLAG="--info=progress2"
  fi

  # Execute rsync with exclusions
  rsync -az \
    $PROGRESS_FLAG \
    --exclude='wp-content/uploads/' \
    --exclude='wp-content/cache/' \
    --exclude='wp-content/w3tc-cache/' \
    --exclude='node_modules/' \
    --exclude='vendor/' \
    --exclude='.git/' \
    --exclude='.env' \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    "${USER}@${HOST}:${WP_PATH}/" "$LOCAL_PATH/" 2>&1 | grep -v "^[^ ]" || true

  RSYNC_EXIT=$?

  if [ $RSYNC_EXIT -eq 0 ]; then
    echo "Files synced."
  else
    echo "WARNING: File sync failed. Continuing with cached files."
  fi
fi
```

## Section 7: Diagnostic Planning

Based on intake context and scout report, decide which skills to run and in what order.

```bash
echo ""
echo "── Diagnostic Plan ─────────────────────"
echo ""

# Load context from intake and scout
ACTIVE_CASE="memory/${SITE_NAME}/active-case.json"
SCOUT_REPORT="memory/${SITE_NAME}/scout-report.json"

# Read priority skills from active case (set by intake)
if [ -f "$ACTIVE_CASE" ]; then
  PRIORITY_SKILLS=$(jq -r '.diagnostic_focus.priority_skills[]?' "$ACTIVE_CASE" 2>/dev/null)
  SECONDARY_SKILLS=$(jq -r '.diagnostic_focus.secondary_skills[]?' "$ACTIVE_CASE" 2>/dev/null)
  SKIP_SKILLS=$(jq -r '.diagnostic_focus.skip_skills[]?' "$ACTIVE_CASE" 2>/dev/null)
fi

# If no intake data, use concern-type defaults
if [ -z "$PRIORITY_SKILLS" ]; then
  case $CONCERN_TYPE in
    "security")
      PRIORITY_SKILLS="diagnostic-core-integrity diagnostic-malware-scan diagnostic-config-security diagnostic-user-audit"
      SECONDARY_SKILLS="diagnostic-code-quality diagnostic-version-audit"
      ;;
    "performance")
      PRIORITY_SKILLS="diagnostic-code-quality diagnostic-config-security"
      SECONDARY_SKILLS="diagnostic-version-audit"
      ;;
    "code-quality")
      PRIORITY_SKILLS="diagnostic-code-quality diagnostic-malware-scan"
      SECONDARY_SKILLS="diagnostic-config-security"
      ;;
    "updates")
      PRIORITY_SKILLS="diagnostic-version-audit"
      SECONDARY_SKILLS="diagnostic-config-security"
      ;;
    *)
      # General: run everything
      PRIORITY_SKILLS="diagnostic-core-integrity diagnostic-config-security diagnostic-version-audit diagnostic-malware-scan diagnostic-code-quality diagnostic-user-audit"
      SECONDARY_SKILLS=""
      ;;
  esac
fi

# Adjust based on scout report alerts
if [ -f "$SCOUT_REPORT" ]; then
  # If debug mode is on, ensure config-security is in priority
  WP_DEBUG_ON=$(jq -r '.environment.wp_debug // false' "$SCOUT_REPORT")
  if [ "$WP_DEBUG_ON" == "true" ] && ! echo "$PRIORITY_SKILLS" | grep -q "diagnostic-config-security"; then
    PRIORITY_SKILLS="diagnostic-config-security $PRIORITY_SKILLS"
  fi

  # If many recent file changes, ensure malware-scan is in priority
  RECENT_CHANGES=$(jq -r '.recent_activity.modified_files_7d // 0' "$SCOUT_REPORT")
  if [ "$RECENT_CHANGES" -gt 10 ] && ! echo "$PRIORITY_SKILLS" | grep -q "diagnostic-malware-scan"; then
    PRIORITY_SKILLS="diagnostic-malware-scan $PRIORITY_SKILLS"
  fi
fi

# Check WP-CLI availability
WP_CLI_SKILLS="diagnostic-core-integrity diagnostic-user-audit diagnostic-version-audit"
if [ "$WP_CLI_PATH" == "null" ] || [ -z "$WP_CLI_PATH" ]; then
  WP_CLI_AVAILABLE=false
  echo "Note: WP-CLI not available. WP-CLI-dependent skills will be skipped."
else
  WP_CLI_AVAILABLE=true
fi
```

### Wave Grouping

Group skills into parallel waves for efficient execution:

```bash
# Wave 1: Infrastructure skills (can run in parallel)
WAVE_1=()
for SKILL in diagnostic-core-integrity diagnostic-config-security diagnostic-version-audit; do
  if echo "$PRIORITY_SKILLS $SECONDARY_SKILLS" | grep -q "$SKILL"; then
    # Check WP-CLI requirement
    if echo "$WP_CLI_SKILLS" | grep -q "$SKILL" && [ "$WP_CLI_AVAILABLE" == "false" ]; then
      continue
    fi
    WAVE_1+=("$SKILL")
  fi
done

# Wave 2: Analysis skills (can run in parallel)
WAVE_2=()
for SKILL in diagnostic-malware-scan diagnostic-code-quality; do
  if echo "$PRIORITY_SKILLS $SECONDARY_SKILLS" | grep -q "$SKILL"; then
    WAVE_2+=("$SKILL")
  fi
done

# Wave 3: User-dependent skills
WAVE_3=()
for SKILL in diagnostic-user-audit; do
  if echo "$PRIORITY_SKILLS $SECONDARY_SKILLS" | grep -q "$SKILL"; then
    if echo "$WP_CLI_SKILLS" | grep -q "$SKILL" && [ "$WP_CLI_AVAILABLE" == "false" ]; then
      continue
    fi
    WAVE_3+=("$SKILL")
  fi
done
```

### Display Plan

```bash
echo "Diagnostic plan for $SITE_NAME:"
echo ""
echo "  Concern: ${CONCERN_TYPE}"
echo "  Urgency: ${URGENCY}"
echo ""

if [ ${#WAVE_1[@]} -gt 0 ]; then
  echo "  Wave 1: ${WAVE_1[*]}"
fi
if [ ${#WAVE_2[@]} -gt 0 ]; then
  echo "  Wave 2: ${WAVE_2[*]}"
fi
if [ ${#WAVE_3[@]} -gt 0 ]; then
  echo "  Wave 3: ${WAVE_3[*]}"
fi
echo ""
```

### Store Strategy

Update active-case.json with the planned strategy:

```bash
# Update active-case.json with planned skills and waves
if [ -f "$ACTIVE_CASE" ]; then
  # Add execution plan to active case
  jq '.execution_plan = {
    "wave_1": $wave1,
    "wave_2": $wave2,
    "wave_3": $wave3
  }' --argjson wave1 "$(printf '%s\n' "${WAVE_1[@]}" | jq -R . | jq -s .)" \
     --argjson wave2 "$(printf '%s\n' "${WAVE_2[@]}" | jq -R . | jq -s .)" \
     --argjson wave3 "$(printf '%s\n' "${WAVE_3[@]}" | jq -R . | jq -s .)" \
     "$ACTIVE_CASE" > "${ACTIVE_CASE}.tmp" && mv "${ACTIVE_CASE}.tmp" "$ACTIVE_CASE"
fi
```

## Section 8: Skill Execution (Parallel Waves)

Execute diagnostic skills in waves. Within each wave, skills run in parallel via Task() subagents.

```bash
echo ""
echo "── Running Diagnostics ─────────────────"
echo ""

COMBINED_FINDINGS='[]'
SKILLS_COMPLETED=()
SKILLS_SKIPPED=()

# Skill display name mapping
declare -A SKILL_NAMES
SKILL_NAMES=(
  ["diagnostic-core-integrity"]="Core Integrity Check"
  ["diagnostic-config-security"]="Configuration Security"
  ["diagnostic-user-audit"]="User Account Audit"
  ["diagnostic-version-audit"]="Version Audit"
  ["diagnostic-malware-scan"]="Malware Scan"
  ["diagnostic-code-quality"]="Code Quality Analysis"
)
```

### Wave Execution

For each wave, spawn parallel Task() subagents:

```bash
for WAVE_NUM in 1 2 3; do
  # Get skills for this wave
  case $WAVE_NUM in
    1) WAVE_SKILLS=("${WAVE_1[@]}") ;;
    2) WAVE_SKILLS=("${WAVE_2[@]}") ;;
    3) WAVE_SKILLS=("${WAVE_3[@]}") ;;
  esac

  # Skip empty waves
  if [ ${#WAVE_SKILLS[@]} -eq 0 ]; then
    continue
  fi

  echo "Wave $WAVE_NUM: ${WAVE_SKILLS[*]}"

  if [ "$PARALLEL_ENABLED" == "true" ] && [ ${#WAVE_SKILLS[@]} -gt 1 ]; then
    # PARALLEL EXECUTION via Task() subagents
    # Spawn one Task() subagent per skill in this wave
    # Each subagent:
    # 1. Reads the skill's SKILL.md
    # 2. Loads site connection details from sites.json
    # 3. Executes the skill's checks
    # 4. Returns findings as JSON array
    #
    # Example Task() invocation per skill:
    # Task(
    #   description: "Run {skill-name} diagnostic",
    #   prompt: "Follow skills/{skill-id}/SKILL.md to diagnose site {site-name}.
    #            Read sites.json for connection details.
    #            Return findings as a JSON array following the standard finding format.",
    #   subagent_type: "general-purpose"
    # )
    #
    # Wait for all subagents in this wave to complete before proceeding to next wave

    for SKILL_ID in "${WAVE_SKILLS[@]}"; do
      DISPLAY_NAME="${SKILL_NAMES[$SKILL_ID]}"
      echo "  [$DISPLAY_NAME] Running (parallel)..."
    done

    # Collect results from all subagents
    for SKILL_ID in "${WAVE_SKILLS[@]}"; do
      DISPLAY_NAME="${SKILL_NAMES[$SKILL_ID]}"
      # SKILL_FINDINGS comes from the subagent result

      # Parse and display inline
      CRITICAL_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length' 2>/dev/null || echo "0")
      WARNING_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length' 2>/dev/null || echo "0")
      INFO_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length' 2>/dev/null || echo "0")

      echo "  [$DISPLAY_NAME] $CRITICAL_COUNT critical, $WARNING_COUNT warning, $INFO_COUNT info"

      # Show critical findings immediately
      echo "$SKILL_FINDINGS" | jq -r '.[] | select(.severity == "Critical") | "    ! " + .title + ": " + .summary' 2>/dev/null

      # Append to combined findings
      COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$SKILL_FINDINGS" | jq -s 'add')
      SKILLS_COMPLETED+=("$DISPLAY_NAME")
    done

  else
    # SEQUENTIAL EXECUTION (parallel disabled or single skill in wave)
    for SKILL_ID in "${WAVE_SKILLS[@]}"; do
      DISPLAY_NAME="${SKILL_NAMES[$SKILL_ID]}"
      echo -n "  [$DISPLAY_NAME] Running..."

      # Execute skill following its SKILL.md
      # (Same pattern as /diagnose Section 4)

      SKILL_EXIT=$?

      if [ $SKILL_EXIT -eq 0 ]; then
        CRITICAL_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length' 2>/dev/null || echo "0")
        WARNING_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length' 2>/dev/null || echo "0")
        INFO_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length' 2>/dev/null || echo "0")
        echo -e "\r  [$DISPLAY_NAME] $CRITICAL_COUNT critical, $WARNING_COUNT warning, $INFO_COUNT info"

        echo "$SKILL_FINDINGS" | jq -r '.[] | select(.severity == "Critical") | "    ! " + .title + ": " + .summary' 2>/dev/null

        COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$SKILL_FINDINGS" | jq -s 'add')
        SKILLS_COMPLETED+=("$DISPLAY_NAME")
      else
        echo -e "\r  [$DISPLAY_NAME] Skipped (error: $SKILL_EXIT)"
        SKILLS_SKIPPED+=("$DISPLAY_NAME (execution error)")
      fi
    done
  fi

  echo ""
done
```

**Error recovery:** Same skip-and-continue pattern as `/diagnose`. If a subagent fails, mark its skill as skipped and continue with the rest of the wave.

## Section 9: Findings Review

Invoke the scan-reviewer skill to verify findings address the concern.

**Reference:** `skills/scan-reviewer/SKILL.md`

```bash
if [ "$REVIEW_ENABLED" == "true" ]; then
  echo "── Findings Review ─────────────────────"
  echo ""

  # Run scan-reviewer skill
  # Reference: skills/scan-reviewer/SKILL.md
  # This skill:
  # 1. Loads active-case.json (user's concern)
  # 2. Checks findings address the concern
  # 3. Checks all planned skills ran
  # 4. Checks for internal contradictions
  # 5. Generates confidence rating

  # Display confidence inline
  CONFIDENCE=$(jq -r '.confidence' "memory/${SITE_NAME}/review-result.json" 2>/dev/null || echo "unknown")
  CONFIDENCE_SCORE=$(jq -r '.confidence_score' "memory/${SITE_NAME}/review-result.json" 2>/dev/null || echo "?")

  echo "Diagnostic confidence: $CONFIDENCE ($CONFIDENCE_SCORE/100)"

  # Show any review concerns
  REVIEW_NOTES=$(jq -r '.notes' "memory/${SITE_NAME}/review-result.json" 2>/dev/null)
  if [ -n "$REVIEW_NOTES" ] && [ "$REVIEW_NOTES" != "null" ]; then
    echo "  $REVIEW_NOTES"
  fi

  RECOMMENDATIONS=$(jq -r '.recommendations[]?' "memory/${SITE_NAME}/review-result.json" 2>/dev/null)
  if [ -n "$RECOMMENDATIONS" ]; then
    echo ""
    echo "Review recommendations:"
    echo "$RECOMMENDATIONS" | while read -r rec; do
      echo "  - $rec"
    done
  fi

  echo ""
else
  echo "Findings review: Disabled (config.json)"
  CONFIDENCE="N/A"
fi
```

## Section 10: Report Generation

Compile findings into a structured report using the report-generator skill, with added investigation context.

**Reference:** `skills/report-generator/SKILL.md`

```bash
echo "── Report ──────────────────────────────"
echo ""
echo "Generating report..."

MEMORY_DIR="memory/${SITE_NAME}"
mkdir -p "$MEMORY_DIR/archive"

# Archive previous report
LATEST="${MEMORY_DIR}/latest.md"
if [ -f "$LATEST" ]; then
  TIMESTAMP=$(date +%Y-%m-%d)
  ARCHIVE_PATH="${MEMORY_DIR}/archive/scan-${TIMESTAMP}.md"
  if [ -f "$ARCHIVE_PATH" ]; then
    TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
    ARCHIVE_PATH="${MEMORY_DIR}/archive/scan-${TIMESTAMP}.md"
  fi
  mv "$LATEST" "$ARCHIVE_PATH"
  echo "Previous report archived: $ARCHIVE_PATH"
fi

# Calculate health grade
CRITICAL_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length')
WARNING_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length')
INFO_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length')

SCAN_STATUS="Complete"
if [ ${#SKILLS_SKIPPED[@]} -gt 0 ]; then
  SCAN_STATUS="Incomplete"
fi

# Apply grading matrix
if [ "$SCAN_STATUS" == "Incomplete" ]; then
  HEALTH_GRADE="Incomplete"
elif [ "$CRITICAL_TOTAL" -ge 4 ]; then
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

# Generate report using report-generator skill template
# ADDITIONAL sections for /investigate (not present in /diagnose reports):
#
# ## Investigation Context
# **Concern:** {concern summary from intake}
# **Urgency:** {urgency level}
# **Scout alerts:** {list of alerts from site-scout}
# **Skills planned:** {planned skill list}
# **Skills completed:** {completed list}
# **Skills skipped:** {skipped list with reasons}
#
# ## Diagnostic Confidence
# **Confidence:** {High/Medium/Low} ({score}/100)
# {Review notes and recommendations from scan-reviewer}

echo "Report saved: $LATEST"
```

## Section 11: Case Log Update

Record this investigation in the site's case history.

```bash
if [ "$TRACK_HISTORY" == "true" ]; then
  CASE_LOG="${MEMORY_DIR}/case-log.json"

  # Initialize case log if it doesn't exist
  if [ ! -f "$CASE_LOG" ]; then
    echo '{"cases": []}' > "$CASE_LOG"
  fi

  # Generate case ID
  DATE=$(date +%Y-%m-%d)
  EXISTING=$(jq "[.cases[] | select(.case_id | startswith(\"case-${DATE}\"))] | length" "$CASE_LOG" 2>/dev/null || echo "0")
  NEXT_NUM=$(printf "%03d" $((EXISTING + 1)))
  CASE_ID="case-${DATE}-${NEXT_NUM}"

  # Determine concern text
  CONCERN_TEXT="$CONCERN_TYPE investigation"
  if [ -f "$ACTIVE_CASE" ]; then
    CONCERN_TEXT=$(jq -r '.concern.summary // "General investigation"' "$ACTIVE_CASE")
  fi

  # Build open items from critical and warning findings
  OPEN_ITEMS=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Critical" or .severity == "Warning") | .fix] | unique | .[0:5]')

  # Append to case log
  jq ".cases += [{
    \"case_id\": \"$CASE_ID\",
    \"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"concern\": $(echo "$CONCERN_TEXT" | jq -R .),
    \"mode\": \"investigate\",
    \"skills_run\": $(printf '%s\n' "${SKILLS_COMPLETED[@]}" | jq -R . | jq -s .),
    \"skills_skipped\": $(printf '%s\n' "${SKILLS_SKIPPED[@]}" | jq -R . | jq -s .),
    \"health_grade\": \"$HEALTH_GRADE\",
    \"confidence\": \"$CONFIDENCE\",
    \"finding_counts\": {
      \"critical\": $CRITICAL_TOTAL,
      \"warning\": $WARNING_TOTAL,
      \"info\": $INFO_TOTAL
    },
    \"open_items\": $OPEN_ITEMS,
    \"report_path\": \"$LATEST\"
  }]" "$CASE_LOG" > "${CASE_LOG}.tmp" && mv "${CASE_LOG}.tmp" "$CASE_LOG"
fi
```

## Section 12: Completion Summary

Display the final summary referencing the original concern.

```bash
echo ""
echo "═══════════════════════════════════════"
echo "Investigation Complete"
echo "═══════════════════════════════════════"
echo ""

# Reference the original concern
if [ -f "$ACTIVE_CASE" ]; then
  CONCERN=$(jq -r '.concern.summary // "General diagnostic"' "$ACTIVE_CASE")
  echo "You asked about: $CONCERN"
  echo ""
fi

echo "Site: $SITE_NAME ($SITE_URL)"
echo "Health Grade: $HEALTH_GRADE"
echo "Confidence: $CONFIDENCE"
echo ""
echo "Findings:"
echo "  Critical: $CRITICAL_TOTAL"
echo "  Warning:  $WARNING_TOTAL"
echo "  Info:     $INFO_TOTAL"
echo ""

# Top critical issues
if [ "$CRITICAL_TOTAL" -gt 0 ]; then
  echo "Top Critical Issues:"
  echo "$COMBINED_FINDINGS" | jq -r '[.[] | select(.severity == "Critical")] | .[0:3] | .[] | "  • " + .title'
  echo ""
fi

# Skipped skills
if [ ${#SKILLS_SKIPPED[@]} -gt 0 ]; then
  echo "Skipped Skills:"
  for SKIPPED in "${SKILLS_SKIPPED[@]}"; do
    echo "  • $SKIPPED"
  done
  echo ""
fi

echo "Full report: $LATEST"
echo "═══════════════════════════════════════"
echo ""
```

## Section 13: Suggested Next Actions

Based on findings and confidence, suggest concrete next steps.

```bash
echo "Suggested Next Actions:"
echo ""

# Low confidence — suggest re-scan
if [ "$CONFIDENCE" == "Low" ]; then
  echo "! Diagnostic confidence is low. Consider:"
  echo "  • Install WP-CLI on the remote server for more thorough scanning"
  echo "  • Re-run /investigate with more context about the concern"
  echo "  • Manually inspect areas the scout flagged"
  echo ""
fi

# Critical findings
if [ "$CRITICAL_TOTAL" -gt 0 ]; then
  echo "Address critical issues immediately:"
  echo ""

  HAS_MODIFIED_CORE=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.id | startswith("SECR-CHECKSUMS-"))] | length')
  if [ "$HAS_MODIFIED_CORE" -gt 0 ]; then
    echo "  • Restore modified core files:"
    echo "    ssh $USER@$HOST 'cd $WP_PATH && wp core download --force --skip-content'"
    echo ""
  fi

  HAS_DEBUG_ENABLED=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.id == "SECR-CONFIG-DBG")] | length')
  if [ "$HAS_DEBUG_ENABLED" -gt 0 ]; then
    echo "  • Disable debug mode in wp-config.php"
    echo ""
  fi

  HAS_DEFAULT_SALTS=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.id == "SECR-CONFIG-SLT")] | length')
  if [ "$HAS_DEFAULT_SALTS" -gt 0 ]; then
    echo "  • Generate new authentication salts:"
    echo "    https://api.wordpress.org/secret-key/1.1/salt/"
    echo ""
  fi

  echo "After fixing critical issues, run /investigate again to verify."

elif [ "$WARNING_TOTAL" -ge 5 ]; then
  echo "Multiple warnings found. Prioritize:"
  echo ""
  HAS_OUTDATED=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.category == "Version & Compatibility")] | length')
  if [ "$HAS_OUTDATED" -gt 0 ]; then
    echo "  • Update outdated plugins and themes"
  fi
  echo ""
  echo "Review full report for details: $LATEST"

elif [ "$HEALTH_GRADE" == "A" ] || [ "$HEALTH_GRADE" == "B" ]; then
  echo "Site health is good."
  echo ""
  echo "  • Schedule regular scans to catch issues early"
  echo "  • Review info-level findings for best practices"

else
  echo "Review findings in full report: $LATEST"
fi

echo ""
echo "Run /investigate again after making changes to verify fixes."
echo ""
```

## Error Handling

### Error: sites.json Not Found

```bash
if [ ! -f sites.json ]; then
  echo "ERROR: No sites configured."
  echo "Run /connect first to set up a WordPress site connection."
  exit 1
fi
```

### Error: All Skills Fail

```bash
if [ ${#SKILLS_COMPLETED[@]} -eq 0 ]; then
  echo ""
  echo "ERROR: All diagnostic skills failed."
  echo ""
  echo "This may indicate:"
  echo "  • SSH connection issues"
  echo "  • Remote server issues"
  echo "  • WordPress installation moved or corrupted"
  echo ""
  echo "Run /connect $SITE_NAME to re-verify connection."
  exit 1
fi
```

### Error: Intake Times Out

If the user doesn't respond to intake questions, auto-proceed with defaults after two unanswered prompts.

### Error: Scout Fails Completely

If SSH connection fails during scout, skip scouting and proceed with default diagnostic plan (all skills). Note in report that scout was unavailable.

## Implementation Notes

**Command format:** This is a CoWork plugin COMMAND.md containing procedural instructions for Claude to follow, not a standalone bash script. When a user says "/investigate" or "/investigate security on mysite", Claude reads this file and executes the steps described above.

**Parallel execution:** Wave-based parallel execution uses Task() subagents. Each skill in a wave is spawned as an independent Task() that reads its SKILL.md and returns findings. The orchestrator waits for all tasks in a wave before starting the next wave.

**Difference from /diagnose:** The key differences are:
1. Intake questioning before scanning (understanding the concern)
2. Site scouting via SSH (gathering environmental context)
3. Smart skill planning (choosing skills based on concern + scout data)
4. Parallel wave execution (faster for full scans)
5. Findings review (verifying results address the concern)
6. Investigation context in the report (concern, scout alerts, confidence)
7. Case history tracking (building diagnostic memory)

**When to use /investigate vs /diagnose:**
- `/diagnose` — Quick scan, known issue, just need data
- `/investigate` — Complex concern, first time looking at a site, need thorough analysis

## Success Criteria

The /investigate command is successful when:

- User can invoke with natural language: "/investigate", "/investigate my site got hacked", "/investigate security on mysite"
- Intake gathers context conversationally (or skips when appropriate)
- Site scout runs SSH reconnaissance and reports alerts
- Diagnostic plan adapts based on concern type and scout findings
- Skills execute in parallel waves with inline progress
- Scan reviewer verifies findings address the original concern
- Report includes investigation context and confidence assessment
- Case log tracks investigation for future reference
- Each step can be disabled via config.json without breaking the flow
- Emergency urgency auto-proceeds with security-focused scan
