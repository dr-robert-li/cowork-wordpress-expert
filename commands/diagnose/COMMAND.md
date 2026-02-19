---
name: diagnose
description: Run diagnostic suite on a WordPress site with full, security-only, code-only, or performance modes
usage: /diagnose [mode] [on site-name]
modes:
  - full (default): All 16 diagnostic skills
  - security-only: core-integrity, config-security, user-audit
  - code-only: code-quality, malware-scan
  - performance: performance-n1, cron-analysis, wpcli-profile
---

# Diagnose Command

Run a comprehensive diagnostic suite on a WordPress site with four modes: full (default), security-only, code-only, or performance. The command orchestrates all diagnostic skills, displays inline progress with finding counts, handles errors gracefully with skip-and-continue recovery, and produces structured reports with health grades (A-F).

## Section 1: Natural Language Argument Parsing

Parse user input to extract diagnostic mode and target site using flexible pattern matching.

### Mode Detection

Use case-insensitive pattern matching to detect the requested diagnostic mode from natural language input:

```bash
# Convert input to lowercase for matching
USER_INPUT=$(echo "$@" | tr '[:upper:]' '[:lower:]')

# Mode detection patterns
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

**Mode mappings:**
- **full (default):** Runs all 16 diagnostic skills (core-integrity, config-security, user-audit, version-audit, malware-scan, code-quality, db-autoload, db-transients, db-revisions, https-audit, file-permissions, performance-n1, cron-analysis, wpcli-profile, architecture, arch-narrative)
- **security-only:** Runs security-focused skills only (core-integrity, config-security, user-audit)
- **code-only:** Runs code-quality skills only (code-quality, malware-scan)
- **performance:** Runs performance-focused skills (performance-n1, cron-analysis, wpcli-profile)

### Site Name Extraction

Extract target site from natural language patterns like "on mysite" or "for mysite":

```bash
# Look for "on {site-name}" or "for {site-name}" patterns
SITE_NAME=$(echo "$USER_INPUT" | sed -n 's/.*\(on\|for\) \+\([a-z0-9_-]\+\).*/\2/p')

# If no site specified, use default from sites.json
if [ -z "$SITE_NAME" ]; then
  SITE_NAME=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json 2>/dev/null)
fi

# If still no site found, list available sites and exit
if [ -z "$SITE_NAME" ]; then
  echo "No site specified and no default site configured."
  echo ""
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json 2>/dev/null
  echo ""
  echo "Usage: /diagnose [mode] on {site-name}"
  echo "Modes: full (default), security-only, code-only, performance"
  exit 1
fi
```

## Section 1.5: Quick Intake (Optional)

If enabled in config.json, ask the user one quick question before scanning to optionally focus the diagnostic.

```bash
# Check config for quick intake toggle
CONFIG_FILE="config.json"
QUICK_INTAKE_ENABLED=false
if [ -f "$CONFIG_FILE" ]; then
  QUICK_INTAKE_ENABLED=$(jq -r '.behavior.quick_diagnose_asks_context // false' "$CONFIG_FILE")
fi

if [ "$QUICK_INTAKE_ENABLED" == "true" ]; then
  echo "Before I scan, anything specific you're concerned about? (Type 'skip' for standard scan)"
  echo ""

  # Read user response
  # If user provides context:
  #   - Note the concern in memory/{site}/active-case.json
  #   - Adjust skill execution order (priority skills first)
  #   - Proceed with diagnostics
  # If user says "skip" or provides no input:
  #   - Proceed with standard scan (no changes)

  # Create minimal active-case.json if user provided context
  MEMORY_DIR="memory/${SITE_NAME}"
  mkdir -p "$MEMORY_DIR"
  # active-case.json written here if user provides a concern
fi
```

**Behavior:** This is a single optional question, not a full intake. It lets users optionally steer the scan without requiring the full `/investigate` workflow. When skipped, `/diagnose` behaves exactly as before.

## Section 2: Connection Verification & Auto-Connect

Verify site profile exists and auto-connect if needed before running diagnostics.

### Check Site Profile

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

# Extract connection details (backward-compatible: source_type defaults to "ssh")
HOST=$(echo "$PROFILE" | jq -r '.host')
USER=$(echo "$PROFILE" | jq -r '.user')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path')
LOCAL_PATH=$(echo "$PROFILE" | jq -r '.local_path')
WP_CLI_PATH=$(echo "$PROFILE" | jq -r '.wp_cli_path')
SITE_URL=$(echo "$PROFILE" | jq -r '.site_url')
SOURCE_TYPE=$(echo "$PROFILE" | jq -r '.source_type // "ssh"')
FILE_ACCESS=$(echo "$PROFILE" | jq -r '.file_access // "rsync"')
CONTAINER_NAME=$(echo "$PROFILE" | jq -r '.container_name // empty')
```

### Auto-Connect if No Local Files

If site profile exists but local directory is empty or missing, auto-connect by running the /connect workflow:

```bash
# Check if local path exists and has files
if [ ! -d "$LOCAL_PATH" ] || [ -z "$(ls -A "$LOCAL_PATH" 2>/dev/null)" ]; then
  echo "No local files found for $SITE_NAME. Auto-connecting..."
  echo ""

  # Run the /connect command workflow for this site
  # Reference: commands/connect/COMMAND.md
  # This will establish SSH connection, verify WordPress, and sync files
  # Using saved profile, so it skips the conversational gathering steps

  # Since profile exists, /connect will use saved settings
  # and proceed directly to file sync
  # (Implementation note: This references the /connect COMMAND.md workflow)

  echo "Connection established. Proceeding with diagnostics..."
fi
```

## Section 3: Source-Type-Gated File Resync

Before running diagnostics, resync files from the source. The resync method depends on the source type — SSH uses rsync, local and git sources skip resync (files are always current), docker bind_mount skips resync, and docker_cp re-copies from the container.

### Resync Process

```bash
# Gate resync by source_type (read from Section 2 above)
case "$SOURCE_TYPE" in

  "ssh")
    # SSH: rsync fresh files from remote server (existing behavior — unchanged)
    echo "Syncing files from remote..."

    # Detect rsync variant (macOS openrsync vs GNU rsync)
    RSYNC_VERSION=$(rsync --version 2>&1 | head -1)

    # Build rsync command based on variant
    if echo "$RSYNC_VERSION" | grep -q "openrsync"; then
      # macOS openrsync - use -v instead of --info=progress2
      PROGRESS_FLAG="-v"
    else
      # GNU rsync - use --info=progress2 for progress display
      PROGRESS_FLAG="--info=progress2"
    fi

    # Execute rsync with exclusions (quietly - redirect verbose output)
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
      echo "Some findings may be outdated if files have changed remotely."
    fi
    ;;

  "local")
    # Local: files are accessed directly from the local filesystem — no resync needed
    echo "Files are accessed directly from local filesystem — no resync needed."
    ;;

  "docker")
    if [ "$FILE_ACCESS" = "bind_mount" ]; then
      # Docker bind mount: files are always current via the host mount path
      echo "Files accessed via bind mount — always current."
    else
      # Docker cp: re-copy from container to get fresh files
      echo "Syncing files from container..."
      docker cp "${CONTAINER_NAME}:${WP_PATH}/." "$LOCAL_PATH" 2>&1

      DOCKER_CP_EXIT=$?
      if [ $DOCKER_CP_EXIT -eq 0 ]; then
        echo "Files synced from container."
      else
        echo "WARNING: docker cp failed. Continuing with cached files."
        echo "Some findings may be outdated. Verify container '$CONTAINER_NAME' is running."
      fi
    fi
    ;;

  "git")
    # Git: use existing local files — never auto-pull on resync
    echo "Git source — using existing local files. Run 'git pull' manually if you want to update before diagnosing."
    ;;

esac
```

**Error handling:** If resync fails (SSH or docker cp), warn user but continue with cached files. Do NOT abort diagnostics. Local, bind_mount, and git sources never attempt resync.

## Section 4: Skill Execution with Inline Progress

Execute diagnostic skills sequentially based on mode, showing inline progress with finding counts.

### Determine Skills to Run

```bash
# Map mode to skill list
case $MODE in
  "security-only")
    SKILLS=(
      "diagnostic-core-integrity:Core Integrity Check"
      "diagnostic-config-security:Configuration Security"
      "diagnostic-user-audit:User Account Audit"
    )
    ;;
  "code-only")
    SKILLS=(
      "diagnostic-code-quality:Code Quality Analysis"
      "diagnostic-malware-scan:Malware Scan"
    )
    ;;
  "performance")
    SKILLS=(
      "diagnostic-performance-n1:N+1 Query Pattern Detection"
      "diagnostic-cron-analysis:Cron Event Analysis"
      "diagnostic-wpcli-profile:WP-CLI Profile Analysis"
    )
    ;;
  "full")
    SKILLS=(
      "diagnostic-core-integrity:Core Integrity Check"
      "diagnostic-config-security:Configuration Security"
      "diagnostic-user-audit:User Account Audit"
      "diagnostic-version-audit:Version Audit"
      "diagnostic-malware-scan:Malware Scan"
      "diagnostic-code-quality:Code Quality Analysis"
      "diagnostic-db-autoload:Autoload Bloat Analysis"
      "diagnostic-db-transients:Transient Buildup Check"
      "diagnostic-db-revisions:Post Revision Analysis"
      "diagnostic-https-audit:HTTPS Configuration Audit"
      "diagnostic-file-permissions:File Permission Check"
      "diagnostic-performance-n1:N+1 Query Pattern Detection"
      "diagnostic-cron-analysis:Cron Event Analysis"
      "diagnostic-wpcli-profile:WP-CLI Profile Analysis"
      "diagnostic-architecture:Architecture Review"
      "diagnostic-arch-narrative:Synthesized Narrative"
    )
    ;;
esac
```

### WP-CLI Dependency Check and Source-Type Routing

Some skills require WP-CLI. The WP-CLI invocation method depends on source_type. Check availability and configure the WP-CLI command for the active source type:

```bash
# WP-CLI dependent skills
WP_CLI_SKILLS=(
  "diagnostic-core-integrity"
  "diagnostic-user-audit"
  "diagnostic-version-audit"
  "diagnostic-db-autoload"
  "diagnostic-db-transients"
  "diagnostic-db-revisions"
  "diagnostic-cron-analysis"
  "diagnostic-wpcli-profile"
)

# Check if WP-CLI is available
if [ "$WP_CLI_PATH" == "null" ] || [ -z "$WP_CLI_PATH" ]; then
  WP_CLI_AVAILABLE=false

  # Explain why WP-CLI skills will be skipped (source-type-aware message)
  case "$SOURCE_TYPE" in
    "git")
      echo "Note: WP-CLI skills unavailable — git source has no live WordPress database."
      echo "WP-CLI-dependent skills (core-integrity, user-audit, version-audit, db-autoload, db-transients, db-revisions, cron-analysis, wpcli-profile) will be skipped."
      ;;
    "local")
      echo "Note: WP-CLI not found locally. Install from https://wp-cli.org to enable database diagnostics."
      echo "WP-CLI-dependent skills (core-integrity, user-audit, version-audit, db-autoload, db-transients, db-revisions, cron-analysis, wpcli-profile) will be skipped."
      ;;
    "docker")
      echo "Note: WP-CLI not found in container. Install WP-CLI inside the container to enable database diagnostics."
      echo "WP-CLI-dependent skills (core-integrity, user-audit, version-audit, db-autoload, db-transients, db-revisions, cron-analysis, wpcli-profile) will be skipped."
      ;;
    *)
      # ssh (or legacy profiles without source_type)
      echo "Note: WP-CLI not available on remote server."
      echo "WP-CLI-dependent skills (core-integrity, user-audit, version-audit, db-autoload, db-transients, db-revisions, cron-analysis, wpcli-profile) will be skipped."
      ;;
  esac
  echo ""
else
  WP_CLI_AVAILABLE=true

  # Set WP-CLI invocation prefix based on source type
  # This prefix is prepended to all WP-CLI commands in WP-CLI-dependent skills
  case "$SOURCE_TYPE" in
    "ssh")
      # Existing SSH behavior — unchanged: run wp over SSH
      WP_CLI_PREFIX="ssh ${USER}@${HOST} ${WP_CLI_PATH} --path=${WP_PATH}"
      ;;
    "docker")
      # Docker: run wp inside container via docker exec
      WP_CLI_PREFIX="docker exec ${CONTAINER_NAME} ${WP_CLI_PATH} --path=${WP_PATH}"
      ;;
    "local")
      # Local: run wp directly with --path flag (no SSH)
      WP_CLI_PREFIX="${WP_CLI_PATH} --path=${WP_PATH}"
      ;;
    "git")
      # Git sources never have a live database — WP-CLI DB commands will not work
      # even if WP-CLI binary is present locally
      WP_CLI_AVAILABLE=false
      echo "Note: WP-CLI DB skills unavailable — git source has no live WordPress database."
      echo "WP-CLI-dependent skills (core-integrity, user-audit, version-audit, db-autoload, db-transients, db-revisions, cron-analysis, wpcli-profile) will be skipped."
      echo ""
      ;;
  esac
fi
```

**WP_CLI_PREFIX usage:** When executing WP-CLI-dependent skills, skills substitute `wp {command}` with `$WP_CLI_PREFIX {command}`. For SSH: `ssh user@host /usr/local/bin/wp --path=/var/www/html core verify-checksums`. For Docker: `docker exec mycontainer wp --path=/var/www/html core verify-checksums`. For Local: `/usr/local/bin/wp --path=/var/www/mysite core verify-checksums`.

### Sequential Skill Execution

Execute each skill with inline progress feedback and error recovery:

```bash
# Initialize tracking arrays
COMBINED_FINDINGS='[]'
SKILLS_COMPLETED=()
SKILLS_SKIPPED=()

echo ""
echo "Running diagnostics in $MODE mode..."
echo ""

# Execute each skill sequentially
for SKILL_ENTRY in "${SKILLS[@]}"; do
  SKILL_ID="${SKILL_ENTRY%%:*}"
  SKILL_DISPLAY_NAME="${SKILL_ENTRY##*:}"

  # Check if skill requires WP-CLI
  REQUIRES_WP_CLI=false
  for WP_CLI_SKILL in "${WP_CLI_SKILLS[@]}"; do
    if [ "$SKILL_ID" == "$WP_CLI_SKILL" ]; then
      REQUIRES_WP_CLI=true
      break
    fi
  done

  # Skip if WP-CLI required but not available
  if [ "$REQUIRES_WP_CLI" == "true" ] && [ "$WP_CLI_AVAILABLE" == "false" ]; then
    # Inline skip message with source type and actionable guidance
    case "$SOURCE_TYPE" in
      "git")
        echo "[$SKILL_DISPLAY_NAME] Skipped — WP-CLI not available (git source). Connect via SSH or Docker with WP-CLI for this check."
        ;;
      "local")
        echo "[$SKILL_DISPLAY_NAME] Skipped — WP-CLI not available (local source). Install WP-CLI from https://wp-cli.org to enable this check."
        ;;
      "docker")
        echo "[$SKILL_DISPLAY_NAME] Skipped — WP-CLI not available (docker source). Install WP-CLI inside the container to enable this check."
        ;;
      *)
        echo "[$SKILL_DISPLAY_NAME] Skipped — WP-CLI not available (${SOURCE_TYPE} source). Install WP-CLI on the server to enable this check."
        ;;
    esac
    SKILLS_SKIPPED+=("$SKILL_DISPLAY_NAME")
    continue
  fi

  # Run the skill
  echo -n "[$SKILL_DISPLAY_NAME] Running..."

  # Execute the skill following its SKILL.md instructions
  # Each skill is in skills/{skill-id}/SKILL.md
  # Skills return JSON array of findings
  # WP-CLI-dependent skills use $WP_CLI_PREFIX for all wp commands

  SKILL_OUTPUT=$(bash -c "
    # Source the skill logic from skills/${SKILL_ID}/SKILL.md
    # Skills read from sites.json and execute checks
    # (Implementation follows each skill's SKILL.md specification)

    # For this command documentation, we reference the skill by path
    # Actual execution happens by following the skill's instructions
    echo '[]'  # Placeholder - actual skill execution returns findings JSON
  " 2>&1)

  SKILL_EXIT=$?

  # Handle skill execution outcome
  if [ $SKILL_EXIT -eq 0 ]; then
    # Parse findings
    SKILL_FINDINGS="$SKILL_OUTPUT"

    # Count findings by severity
    CRITICAL_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length')
    WARNING_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length')
    INFO_COUNT=$(echo "$SKILL_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length')

    # Display count summary
    echo -e "\r[$SKILL_DISPLAY_NAME] $CRITICAL_COUNT critical, $WARNING_COUNT warning, $INFO_COUNT info"

    # Show critical findings immediately (inline)
    CRITICAL_FINDINGS=$(echo "$SKILL_FINDINGS" | jq -r '.[] | select(.severity == "Critical") | "  ! " + .title + ": " + .summary')
    if [ -n "$CRITICAL_FINDINGS" ] && [ "$CRITICAL_FINDINGS" != "" ]; then
      echo "$CRITICAL_FINDINGS"
    fi

    # Append to combined findings
    COMBINED_FINDINGS=$(echo "$COMBINED_FINDINGS" "$SKILL_FINDINGS" | jq -s 'add')

    # Track completion
    SKILLS_COMPLETED+=("$SKILL_DISPLAY_NAME")

  else
    # Skill failed (SSH timeout, error, invalid JSON)
    echo -e "\r[$SKILL_DISPLAY_NAME] Skipped (error: $SKILL_EXIT)"
    SKILLS_SKIPPED+=("$SKILL_DISPLAY_NAME (execution error)")
  fi

done

# If any skills were skipped due to source type limitations, show a summary
WP_CLI_SKIPPED_COUNT=0
WP_CLI_SKIPPED_NAMES=()
for SKIPPED in "${SKILLS_SKIPPED[@]}"; do
  if [[ "$SKIPPED" != *"execution error"* ]]; then
    WP_CLI_SKIPPED_COUNT=$((WP_CLI_SKIPPED_COUNT + 1))
    WP_CLI_SKIPPED_NAMES+=("$SKIPPED")
  fi
done

if [ "$WP_CLI_SKIPPED_COUNT" -gt 0 ]; then
  echo ""
  echo "Note: $WP_CLI_SKIPPED_COUNT skill(s) skipped due to source type limitations."
  echo "Skipped: $(IFS=', '; echo "${WP_CLI_SKIPPED_NAMES[*]}")"
  echo "Reason: ${SOURCE_TYPE} source without WP-CLI access"
fi

echo ""
```

**Error recovery:** If a skill fails (SSH timeout, invalid JSON, command error), mark it as "skipped", display warning, and continue to next skill. Do NOT abort the entire diagnostic run.

**Source-type routing summary:**
- **SSH:** WP-CLI runs via SSH (`ssh user@host wp --path=... command`)
- **Docker:** WP-CLI runs via docker exec (`docker exec container wp --path=... command`)
- **Local:** WP-CLI runs directly (`wp --path=... command`)
- **Git:** WP-CLI skills always skipped — no live database in a git checkout

## Section 5: Report Generation

Compile findings into a structured report using the report-generator skill.

### Generate Report

```bash
echo "Generating report..."

# Determine scan status
if [ ${#SKILLS_SKIPPED[@]} -gt 0 ]; then
  SCAN_STATUS="Incomplete"
else
  SCAN_STATUS="Complete"
fi

# Pass combined findings to report-generator skill
# Reference: skills/report-generator/SKILL.md
# Report generator handles:
# - Health grade calculation (A-F)
# - Executive summary generation
# - Categorized findings sections
# - Archive rotation (latest.md + archive/scan-YYYY-MM-DD.md)

# Report saves to memory/{site-name}/latest.md
MEMORY_DIR="memory/${SITE_NAME}"
mkdir -p "$MEMORY_DIR/archive"

# Archive previous report if exists
LATEST="${MEMORY_DIR}/latest.md"
if [ -f "$LATEST" ]; then
  TIMESTAMP=$(date +%Y-%m-%d)
  ARCHIVE_PATH="${MEMORY_DIR}/archive/scan-${TIMESTAMP}.md"
  # Handle same-day multiple scans
  if [ -f "$ARCHIVE_PATH" ]; then
    TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
    ARCHIVE_PATH="${MEMORY_DIR}/archive/scan-${TIMESTAMP}.md"
  fi
  mv "$LATEST" "$ARCHIVE_PATH"
  echo "Previous report archived: $ARCHIVE_PATH"
fi

# Calculate health grade following report-generator's grading matrix
CRITICAL_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length')
WARNING_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length')
INFO_TOTAL=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Info")] | length')

# Apply grading matrix (first match wins)
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

# Generate report markdown following report-generator's template
# (Implementation follows skills/report-generator/SKILL.md specification)
# Report includes:
# - Health grade
# - Executive summary (2-3 sentences for non-technical reader)
# - Finding summary table
# - Security findings section
# - Code quality findings section
# - Version & compatibility section
# - Suspicious code section

# Save report to latest.md
# (Actual report generation code follows report-generator SKILL.md template)

echo "Report saved: $LATEST"
```

**If skills were skipped:** Pass "Incomplete" as scan status so health grade shows "Incomplete" instead of A-F. This avoids false confidence when data is missing.

## Section 5.5: Trend Tracking (Post-Report)

After the report is saved to `memory/{site}/latest.md`, invoke the trend-tracker skill to annotate badges and update trends.json. This step only runs if the report was generated successfully.

### Invoke Trend Tracker

Following `skills/trend-tracker/SKILL.md`:
- Pass COMBINED_FINDINGS (the same JSON array built in Section 4)
- Pass SITE_NAME (from Section 1 site resolution)
- Pass HEALTH_GRADE (computed in Section 5 by report-generator)
- Pass CRITICAL_TOTAL, WARNING_TOTAL, INFO_TOTAL (severity counts from Section 4)
- Pass SKILLS_COMPLETED (count of skills that actually ran, not skipped)
- Pass SKILLS_TOTAL (total skills attempted in this mode)
- The trend-tracker reads memory/{site}/trends.json (if exists) and memory/{site}/latest.md
- The trend-tracker writes updated memory/{site}/trends.json and patches latest.md with inline badges

```bash
echo "Updating trend history..."

# Invoke the trend-tracker skill following skills/trend-tracker/SKILL.md
# Pass all required context variables:
#   COMBINED_FINDINGS  — JSON array from Section 4
#   SITE_NAME          — from Section 1
#   HEALTH_GRADE       — from Section 5
#   CRITICAL_TOTAL     — from Section 5
#   WARNING_TOTAL      — from Section 5
#   INFO_TOTAL         — from Section 5
#   SKILLS_COMPLETED   — count of skills that ran (not skipped)
#   SKILLS_TOTAL       — total skills in the current mode's skill list

# SKILLS_COMPLETED count from Section 4 tracking
SKILLS_COMPLETED_COUNT="${#SKILLS_COMPLETED[@]}"
SKILLS_TOTAL_COUNT="${#SKILLS[@]}"

# Re-assign as scalars for trend-tracker (expects SKILLS_COMPLETED and SKILLS_TOTAL as integers)
SKILLS_COMPLETED="${SKILLS_COMPLETED_COUNT}"
SKILLS_TOTAL="${SKILLS_TOTAL_COUNT}"

# (Implementation follows skills/trend-tracker/SKILL.md specification)

echo "Trend data updated: memory/${SITE_NAME}/trends.json"
```

This section runs for ALL modes (full, security-only, code-only, performance) — trend tracking is mode-agnostic. The trends.json records whatever findings the current mode produced, enabling per-mode trend comparison across scans of the same type.

## Section 6: Completion Summary

Display inline summary after report generation.

```bash
echo ""
echo "═══════════════════════════════════════"
echo "Diagnostic Complete"
echo "═══════════════════════════════════════"
echo "Site: $SITE_NAME ($SITE_URL)"
echo "Health Grade: $HEALTH_GRADE"
echo ""
echo "Findings:"
echo "  Critical: $CRITICAL_TOTAL"
echo "  Warning:  $WARNING_TOTAL"
echo "  Info:     $INFO_TOTAL"
echo ""

# Show top 3 critical issues (title only)
if [ "$CRITICAL_TOTAL" -gt 0 ]; then
  echo "Top Critical Issues:"
  echo "$COMBINED_FINDINGS" | jq -r '[.[] | select(.severity == "Critical")] | .[0:3] | .[] | "  • " + .title'
  echo ""
fi

# If skills were skipped, list them
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

## Section 7: Suggested Next Actions

Based on findings, suggest concrete next actions to the user.

```bash
echo "Suggested Next Actions:"
echo ""

# Decision tree for suggested actions
if [ "$SCAN_STATUS" == "Incomplete" ]; then
  echo "⚠ Scan was incomplete. Fix connectivity issues or install WP-CLI, then re-run /diagnose."

elif [ "$CRITICAL_TOTAL" -gt 0 ]; then
  echo "⚠ Critical issues found. Address these immediately:"
  echo ""

  # Provide specific commands based on finding types
  # Check for common critical issues and suggest fixes

  HAS_MODIFIED_CORE=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.id | startswith("SECR-CHECKSUMS-"))] | length')
  if [ "$HAS_MODIFIED_CORE" -gt 0 ]; then
    echo "  • Modified core files detected:"
    echo "    Run: ssh $USER@$HOST 'cd $WP_PATH && wp core download --force --skip-content'"
    echo ""
  fi

  HAS_DEBUG_ENABLED=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.id == "SECR-CONFIG-DBG")] | length')
  if [ "$HAS_DEBUG_ENABLED" -gt 0 ]; then
    echo "  • WP_DEBUG enabled in production:"
    echo "    Disable debug mode in wp-config.php"
    echo ""
  fi

  HAS_DEFAULT_SALTS=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.id == "SECR-CONFIG-SLT")] | length')
  if [ "$HAS_DEFAULT_SALTS" -gt 0 ]; then
    echo "  • Default authentication salts:"
    echo "    Generate new salts at: https://api.wordpress.org/secret-key/1.1/salt/"
    echo ""
  fi

  echo "After fixing critical issues, run /diagnose again to verify."

elif [ "$WARNING_TOTAL" -ge 5 ]; then
  echo "⚙ Multiple warnings found. Prioritize these actions:"
  echo ""

  # Check for common warning patterns
  HAS_OUTDATED=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.category == "Version & Compatibility")] | length')
  if [ "$HAS_OUTDATED" -gt 0 ]; then
    echo "  • Update outdated plugins and themes"
    echo "    Run: ssh $USER@$HOST 'cd $WP_PATH && wp plugin update --all && wp theme update --all'"
    echo ""
  fi

  echo "Review full report for details: $LATEST"

elif [ "$HEALTH_GRADE" == "A" ] || [ "$HEALTH_GRADE" == "B" ]; then
  echo "✓ Site health is good."
  echo ""
  echo "  • Schedule regular scans (weekly or monthly) to catch issues early"
  echo "  • Review info-level findings in full report for best practices"
  echo ""

else
  echo "Review findings in full report: $LATEST"
  echo ""
fi

echo "Run /diagnose again after making changes to verify fixes."
echo ""
```

**Guidance principles:**
- **Critical findings:** Provide specific commands/actions for each critical issue type
- **Many warnings:** Suggest category-specific bulk actions (update all plugins, etc.)
- **Healthy site:** Encourage regular scanning, review best practices
- **Incomplete scan:** Guide to fix connectivity/tooling issues
- Always end with: "Run /diagnose again after making changes to verify fixes."

## Section 8: Error Handling

Document error scenarios and recovery strategies.

### Error: sites.json Not Found

```bash
if [ ! -f sites.json ]; then
  echo "ERROR: No sites configured."
  echo ""
  echo "sites.json file not found. You need to connect to a WordPress site first."
  echo ""
  echo "Run: /connect"
  echo ""
  exit 1
fi
```

### Error: Site Not Found in sites.json

```bash
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)
if [ "$PROFILE" == "null" ]; then
  echo "ERROR: Site '$SITE_NAME' not found."
  echo ""
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json
  echo ""
  echo "To add this site, run: /connect $SITE_NAME"
  exit 1
fi
```

### Error: SSH Connection Fails During Resync

```bash
# Already handled in Section 3 - resync failure
# Warn user but continue with cached files
# Do NOT abort diagnostics
```

**Outcome:** Show warning, continue with cached files. Findings may be outdated but partial scan is better than no scan.

### Error: All Skills Fail

```bash
# After skill execution loop
if [ ${#SKILLS_COMPLETED[@]} -eq 0 ]; then
  echo ""
  echo "ERROR: All diagnostic skills failed."
  echo ""
  echo "This may indicate:"
  echo "  • SSH connection issues (firewall, credentials)"
  echo "  • Remote server issues (disk full, high load)"
  echo "  • WordPress installation moved or corrupted"
  echo ""
  echo "Troubleshooting steps:"
  echo "  1. Verify SSH connection: ssh $USER@$HOST 'echo connected'"
  echo "  2. Check WordPress path is correct: ssh $USER@$HOST 'ls -la $WP_PATH/wp-config.php'"
  echo "  3. Verify site profile in sites.json is up to date"
  echo ""
  echo "Run /connect $SITE_NAME to re-verify connection."
  exit 1
fi
```

### Error: Report Generation Fails

```bash
# If report generation fails
if [ $REPORT_EXIT -ne 0 ]; then
  echo "WARNING: Report generation failed."
  echo ""
  echo "Displaying findings inline instead:"
  echo ""

  # Show findings directly without saving to file
  echo "$COMBINED_FINDINGS" | jq -r '.[] | "[\(.severity)] \(.title)\n  \(.summary)\n  Fix: \(.fix)\n"'

  echo ""
  echo "Findings were not saved to file."
  exit 1
fi
```

## Implementation Notes

**Command format:** This is a CoWork plugin COMMAND.md containing procedural instructions for Claude to follow, not a standalone bash script. When a user says "/diagnose" or "/diagnose security only", Claude reads this file and executes the steps described above.

**Skill invocation:** Each diagnostic skill is referenced by its SKILL.md path (e.g., `skills/diagnostic-core-integrity/SKILL.md`). Claude follows the instructions in each skill file to execute the checks and return findings as JSON.

**JSON manipulation:** Use `jq` for all JSON operations (finding aggregation, severity counting, profile lookup). This ensures reliable parsing and prevents shell escaping issues.

**Finding format:** All skills return findings following the standardized format from `skills/report-generator/SKILL.md`:
- `id` (string): Deterministic identifier for cross-scan tracking
- `severity` (string): One of "Critical", "Warning", "Info"
- `category` (string): One of "Security", "Code Quality", "Version & Compatibility", "Suspicious Code"
- `title` (string): Short descriptive title
- `summary` (string): One-sentence non-technical explanation
- `detail` (string): Technical explanation with evidence
- `location` (string): File path, file:line, or command reference
- `fix` (string): Concrete remediation steps or code snippet

**Mode aliases:** The /audit command is NOT separate — it is satisfied by `/diagnose security-only`. Natural language parsing handles variations like "diagnose just security", "run a security audit", "security only please".

**Auto-connect behavior:** If site profile exists but local files are missing/empty, the command automatically runs the /connect workflow before proceeding with diagnostics. This ensures seamless UX without requiring users to remember to sync first.

**Error recovery philosophy:** Skip-and-continue. If a single skill fails (SSH drop, WP-CLI timeout, malformed output), mark it as skipped, warn the user, and continue with remaining skills. Partial diagnostic data is valuable — don't discard everything due to one failure. The health grade will show "Incomplete" to indicate missing data.

## Success Criteria

The /diagnose command is successful when:

- User can invoke with natural language: "/diagnose", "/diagnose security only", "/diagnose code only on mysite", "/diagnose performance"
- All four modes work correctly (full, security-only, code-only, performance)
- Inline progress shows each skill running with finding counts
- Critical findings appear immediately as discovered (not just at the end)
- Skip-and-continue error recovery prevents one failure from aborting entire scan
- Health grade calculated correctly using report-generator's grading matrix
- Report saved to memory/{site-name}/latest.md with previous reports archived
- Suggested next actions are specific and actionable based on findings
- WP-CLI unavailability is handled gracefully (skip dependent skills, note in report)
- Auto-connect works when site profile exists but local files are missing
