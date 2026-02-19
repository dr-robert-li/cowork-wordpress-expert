---
name: status
description: View connected sites, sync status, diagnostic health summaries, and manage site profiles
usage: /status [subcommand] [args]
subcommands:
  - (none): List all connected sites with status details
  - remove <site-name>: Remove a saved site profile
  - default <site-name>: Set a site as the default
  - rename <old-name> <new-name>: Rename a site profile
---

# /status Command

This command manages WordPress site profiles and displays connection status with inline diagnostic summaries. It provides four operations: listing all sites (with health grades from latest diagnostic scans), removing profiles, setting the default site, and renaming profiles.

## Usage Patterns

- `/status` - List all connected sites
- `/status remove <site-name>` - Remove a site profile
- `/status default <site-name>` - Set default site
- `/status rename <old-name> <new-name>` - Rename a profile

## Implementation

### 1. Default Behavior: List All Sites (CONN-04)

When invoked without subcommands, display all saved site profiles from sites.json.

**Step 1: Check if sites.json exists**

```bash
if [ ! -f sites.json ]; then
  echo "No sites connected yet. Use /connect to add your first site."
  exit 0
fi
```

**Step 2: Check if sites object is empty**

```bash
SITE_COUNT=$(jq -r '.sites | length' sites.json 2>/dev/null || echo "0")

if [ "$SITE_COUNT" -eq 0 ]; then
  echo "No sites connected yet. Use /connect to add your first site."
  exit 0
fi
```

**Step 3: Display all sites**

```bash
echo "## Connected Sites"
echo ""

jq -r '.sites | to_entries[] | @json' sites.json | while IFS= read -r site_json; do
  SITE_NAME=$(echo "$site_json" | jq -r '.key')
  SITE_DATA=$(echo "$site_json" | jq -r '.value')

  HOST=$(echo "$SITE_DATA" | jq -r '.host')
  USER=$(echo "$SITE_DATA" | jq -r '.user')
  WP_PATH=$(echo "$SITE_DATA" | jq -r '.wp_path')
  LOCAL_PATH=$(echo "$SITE_DATA" | jq -r '.local_path')
  WP_VERSION=$(echo "$SITE_DATA" | jq -r '.wp_version // "Unknown"')
  SITE_URL=$(echo "$SITE_DATA" | jq -r '.site_url // "Not detected"')
  WP_CLI_PATH=$(echo "$SITE_DATA" | jq -r '.wp_cli_path // "Not available"')
  LAST_SYNC=$(echo "$SITE_DATA" | jq -r '.last_sync // "Never"')
  ENVIRONMENT=$(echo "$SITE_DATA" | jq -r '.environment // "Not set"')
  NOTES=$(echo "$SITE_DATA" | jq -r '.notes // "None"')
  IS_DEFAULT=$(echo "$SITE_DATA" | jq -r '.is_default // false')

  # New source-type fields (backward-compatible with null-safe defaults)
  SOURCE_TYPE=$(echo "$SITE_DATA" | jq -r '.source_type // "ssh"')
  CONTAINER_NAME=$(echo "$SITE_DATA" | jq -r '.container_name // empty')
  GIT_REMOTE=$(echo "$SITE_DATA" | jq -r '.git_remote // empty')
  GIT_BRANCH=$(echo "$SITE_DATA" | jq -r '.git_branch // empty')
  FILE_ACCESS=$(echo "$SITE_DATA" | jq -r '.file_access // "rsync"')

  # Determine source type badge
  case "$SOURCE_TYPE" in
    "local")  SOURCE_BADGE="[LOCAL]" ;;
    "docker") SOURCE_BADGE="[DOCKER]" ;;
    "git")    SOURCE_BADGE="[GIT]" ;;
    *)        SOURCE_BADGE="[SSH]" ;;
  esac

  # Show default marker
  DEFAULT_MARKER=""
  if [ "$IS_DEFAULT" = "true" ]; then
    DEFAULT_MARKER="  [DEFAULT]"
  fi

  # Calculate relative time for last_sync
  if [ "$LAST_SYNC" != "Never" ]; then
    SYNC_TIME=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_SYNC" "+%s" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    DIFF=$((NOW - SYNC_TIME))

    if [ $DIFF -lt 3600 ]; then
      MINUTES=$((DIFF / 60))
      RELATIVE_TIME="$MINUTES minutes ago"
    elif [ $DIFF -lt 86400 ]; then
      HOURS=$((DIFF / 3600))
      RELATIVE_TIME="$HOURS hours ago"
    else
      DAYS=$((DIFF / 86400))
      RELATIVE_TIME="$DAYS days ago"
    fi
  else
    RELATIVE_TIME="Never"
  fi

  # Print heading with source type badge and optional default marker
  echo "### $SITE_NAME  $SOURCE_BADGE$DEFAULT_MARKER"
  echo "- **WordPress:** $WP_VERSION at $SITE_URL"
  echo "- **WP-CLI:** $WP_CLI_PATH"

  # Source-type-specific detail lines
  case "$SOURCE_TYPE" in
    "ssh")
      echo "- **Source:** SSH ($USER@$HOST)"
      echo "- **Last sync:** $LAST_SYNC ($RELATIVE_TIME)"
      ;;
    "local")
      echo "- **Source:** local directory"
      echo "- **Path:** $LOCAL_PATH"
      echo "- **Files:** live access (no sync needed)"
      ;;
    "docker")
      echo "- **Source:** docker container ($CONTAINER_NAME)"
      echo "- **File access:** $FILE_ACCESS"
      echo "- **Container WP path:** $WP_PATH"
      if [ "$FILE_ACCESS" = "bind_mount" ]; then
        echo "- **Files:** live access via bind mount"
      else
        echo "- **Last sync:** $LAST_SYNC ($RELATIVE_TIME) (docker cp)"
      fi
      ;;
    "git")
      echo "- **Source:** git repository"
      echo "- **Remote:** $GIT_REMOTE ($GIT_BRANCH)"
      echo "- **Clone:** $LOCAL_PATH"
      echo "- **Files:** local clone ($LAST_SYNC)"
      ;;
  esac

  # Capabilities line (WP-CLI-gated skills shown conditionally)
  BASE_CAPS="code quality, malware scan, config security"
  if [ "$WP_CLI_PATH" != "null" ] && [ -n "$WP_CLI_PATH" ] && [ "$SOURCE_TYPE" != "git" ]; then
    echo "- **Capabilities:** $BASE_CAPS, database, user audit, version audit"
  else
    case "$SOURCE_TYPE" in
      "git")    DB_REASON="git source — no live database" ;;
      "local")  DB_REASON="WP-CLI not found — install from https://wp-cli.org to enable" ;;
      "docker") DB_REASON="WP-CLI not found in container" ;;
      *)        DB_REASON="WP-CLI not installed on server" ;;
    esac
    echo "- **Capabilities:** $BASE_CAPS (DB skills unavailable — $DB_REASON)"
  fi

  echo "- **Local files:** $LOCAL_PATH"
  echo "- **Environment:** $ENVIRONMENT"
  echo "- **Notes:** $NOTES"

  # Diagnostic summary from latest scan report
  REPORT_PATH="memory/${SITE_NAME}/latest.md"
  if [ -f "$REPORT_PATH" ]; then
    # Extract health grade from report (first line matching "Health Grade:")
    HEALTH_GRADE=$(grep "^\*\*Health Grade:\*\*" "$REPORT_PATH" | sed 's/.*\*\*Health Grade:\*\* //')

    # Extract finding counts from summary table
    CRITICAL_COUNT=$(grep "| Critical |" "$REPORT_PATH" | sed 's/.*| //' | sed 's/ .*//' | tr -d ' ')
    WARNING_COUNT=$(grep "| Warning |" "$REPORT_PATH" | sed 's/.*| //' | sed 's/ .*//' | tr -d ' ')
    INFO_COUNT=$(grep "| Info |" "$REPORT_PATH" | sed 's/.*| //' | sed 's/ .*//' | tr -d ' ')

    # Extract scan date
    SCAN_DATE=$(grep "^\*\*Date:\*\*" "$REPORT_PATH" | sed 's/.*\*\*Date:\*\* //')

    # Extract top critical findings (up to 3)
    TOP_CRITICAL=$(grep -A 1 "^\*\*Severity:\*\* Critical" "$REPORT_PATH" | grep "^\*\*Summary:\*\*" | head -3 | sed 's/\*\*Summary:\*\* /  - /')

    echo "- **Health Grade:** $HEALTH_GRADE"
    echo "- **Last Scan:** $SCAN_DATE"
    echo "- **Findings:** $CRITICAL_COUNT critical, $WARNING_COUNT warning, $INFO_COUNT info"

    if [ -n "$TOP_CRITICAL" ]; then
      echo "- **Top Issues:**"
      echo "$TOP_CRITICAL"
    fi

    # Suggested next action based on report age and findings
    SCAN_EPOCH=$(date -j -f "%Y-%m-%d" "$(echo $SCAN_DATE | cut -d' ' -f1)" "+%s" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    DAYS_SINCE_SCAN=$(( (NOW - SCAN_EPOCH) / 86400 ))

    if [ "$CRITICAL_COUNT" -gt 0 ]; then
      echo "- **Next action:** Fix $CRITICAL_COUNT critical issue(s), then re-scan"
    elif [ $DAYS_SINCE_SCAN -gt 7 ]; then
      echo "- **Next action:** Re-scan recommended (last scan $DAYS_SINCE_SCAN days ago)"
    else
      NEXT_SCAN_DAYS=$((7 - DAYS_SINCE_SCAN))
      echo "- **Next action:** Healthy -- next scan recommended in $NEXT_SCAN_DAYS day(s)"
    fi
  else
    echo "- **Diagnostics:** No scan results yet. Run /diagnose to analyze."
    echo "- **Next action:** Run /diagnose to analyze this site"
  fi

  echo ""
done

echo "**$SITE_COUNT site(s) connected**"
echo ""

# Show quick reconnect hint if default site exists
DEFAULT_SITE=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json 2>/dev/null)
if [ -n "$DEFAULT_SITE" ]; then
  echo "Reconnect: \`/connect $DEFAULT_SITE\`"
fi

echo ""
echo "## Available Commands"
echo "- /connect [site-name] -- Connect to a WordPress site"
echo "- /diagnose [mode] [on site-name] -- Run diagnostic scan (modes: full, security only, code only)"
echo "- /batch [site1 site2 ...] [mode] -- Run diagnostics across multiple sites with comparison matrix"
echo "- /investigate -- Full diagnostic investigation with intake and verification"
echo "- /status -- View connected sites and scan results"
```

### 2. Remove a Site Profile (CONN-05)

Remove a saved site profile and optionally delete synced files.

**Step 1: Parse arguments**

```bash
SITE_NAME="$1"

if [ -z "$SITE_NAME" ]; then
  echo "Error: Site name required. Usage: /status remove <site-name>"
  exit 1
fi
```

**Step 2: Verify site exists**

```bash
if [ ! -f sites.json ]; then
  echo "Error: No sites.json file found."
  exit 1
fi

SITE_EXISTS=$(jq -r --arg name "$SITE_NAME" '.sites | has($name)' sites.json)

if [ "$SITE_EXISTS" != "true" ]; then
  echo "Error: Site '$SITE_NAME' not found in sites.json"
  echo ""
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json
  exit 1
fi
```

**Step 3: Get site details before removal**

```bash
LOCAL_PATH=$(jq -r --arg name "$SITE_NAME" '.sites[$name].local_path' sites.json)
IS_DEFAULT=$(jq -r --arg name "$SITE_NAME" '.sites[$name].is_default // false' sites.json)
```

**Step 4: Confirm removal**

```bash
echo "Remove profile '$SITE_NAME'? This won't delete synced files in $LOCAL_PATH."
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi
```

**Step 5: Remove from sites.json atomically**

```bash
jq --arg name "$SITE_NAME" 'del(.sites[$name])' sites.json > /tmp/sites.json.tmp

# Validate JSON
if ! jq empty /tmp/sites.json.tmp 2>/dev/null; then
  echo "Error: Failed to update sites.json (invalid JSON)"
  rm -f /tmp/sites.json.tmp
  exit 1
fi

mv /tmp/sites.json.tmp sites.json
echo "Profile '$SITE_NAME' removed."
```

**Step 6: Warn if default was removed**

```bash
if [ "$IS_DEFAULT" = "true" ]; then
  echo ""
  echo "Warning: Removed default site. Use \`/status default <name>\` to set a new default."
fi
```

**Step 7: Offer to delete local files**

```bash
if [ -d "$LOCAL_PATH" ]; then
  echo ""
  read -p "Delete synced files at $LOCAL_PATH? (yes/no): " DELETE_FILES

  if [ "$DELETE_FILES" = "yes" ]; then
    rm -rf "$LOCAL_PATH"
    echo "Local files deleted."
  else
    echo "Local files kept at $LOCAL_PATH"
  fi
fi
```

### 3. Set Default Site

Set a site profile as the default (used when /connect is called without arguments).

**Step 1: Parse arguments**

```bash
SITE_NAME="$1"

if [ -z "$SITE_NAME" ]; then
  echo "Error: Site name required. Usage: /status default <site-name>"
  exit 1
fi
```

**Step 2: Verify site exists**

```bash
if [ ! -f sites.json ]; then
  echo "Error: No sites.json file found."
  exit 1
fi

SITE_EXISTS=$(jq -r --arg name "$SITE_NAME" '.sites | has($name)' sites.json)

if [ "$SITE_EXISTS" != "true" ]; then
  echo "Error: Site '$SITE_NAME' not found in sites.json"
  echo ""
  echo "Available sites:"
  jq -r '.sites | keys[]' sites.json
  exit 1
fi
```

**Step 3: Update default site atomically**

First set all sites to is_default: false, then set the specified site to is_default: true.

```bash
jq --arg name "$SITE_NAME" '
  (.sites | to_entries | map(.value.is_default = false) | from_entries) as $reset |
  .sites = $reset |
  .sites[$name].is_default = true
' sites.json > /tmp/sites.json.tmp

# Validate JSON
if ! jq empty /tmp/sites.json.tmp 2>/dev/null; then
  echo "Error: Failed to update sites.json (invalid JSON)"
  rm -f /tmp/sites.json.tmp
  exit 1
fi

mv /tmp/sites.json.tmp sites.json
echo "'$SITE_NAME' is now the default site."
```

### 4. Rename a Site Profile

Rename a site profile key in sites.json and optionally rename the local directory.

**Step 1: Parse arguments**

```bash
OLD_NAME="$1"
NEW_NAME="$2"

if [ -z "$OLD_NAME" ] || [ -z "$NEW_NAME" ]; then
  echo "Error: Both old and new names required. Usage: /status rename <old-name> <new-name>"
  exit 1
fi
```

**Step 2: Verify old name exists and new name doesn't**

```bash
if [ ! -f sites.json ]; then
  echo "Error: No sites.json file found."
  exit 1
fi

OLD_EXISTS=$(jq -r --arg name "$OLD_NAME" '.sites | has($name)' sites.json)
NEW_EXISTS=$(jq -r --arg name "$NEW_NAME" '.sites | has($name)' sites.json)

if [ "$OLD_EXISTS" != "true" ]; then
  echo "Error: Site '$OLD_NAME' not found in sites.json"
  exit 1
fi

if [ "$NEW_EXISTS" = "true" ]; then
  echo "Error: Site '$NEW_NAME' already exists"
  exit 1
fi
```

**Step 3: Get current local_path**

```bash
OLD_LOCAL_PATH=$(jq -r --arg name "$OLD_NAME" '.sites[$name].local_path' sites.json)
```

**Step 4: Rename the profile key**

```bash
jq --arg old "$OLD_NAME" --arg new "$NEW_NAME" '
  .sites[$new] = .sites[$old] |
  del(.sites[$old])
' sites.json > /tmp/sites.json.tmp

# Validate JSON
if ! jq empty /tmp/sites.json.tmp 2>/dev/null; then
  echo "Error: Failed to update sites.json (invalid JSON)"
  rm -f /tmp/sites.json.tmp
  exit 1
fi

mv /tmp/sites.json.tmp sites.json
echo "Profile renamed from '$OLD_NAME' to '$NEW_NAME'."
```

**Step 5: Offer to rename local directory**

If the local_path contains the old site name, offer to rename it.

```bash
if [[ "$OLD_LOCAL_PATH" == *"$OLD_NAME"* ]]; then
  NEW_LOCAL_PATH="${OLD_LOCAL_PATH//$OLD_NAME/$NEW_NAME}"

  echo ""
  echo "Local directory path contains the old name:"
  echo "  Current: $OLD_LOCAL_PATH"
  echo "  Suggested: $NEW_LOCAL_PATH"
  echo ""
  read -p "Rename local directory? (yes/no): " RENAME_DIR

  if [ "$RENAME_DIR" = "yes" ]; then
    if [ -d "$OLD_LOCAL_PATH" ]; then
      # Create parent directory if needed
      mkdir -p "$(dirname "$NEW_LOCAL_PATH")"

      mv "$OLD_LOCAL_PATH" "$NEW_LOCAL_PATH"

      # Update local_path in sites.json
      jq --arg name "$NEW_NAME" --arg path "$NEW_LOCAL_PATH" '
        .sites[$name].local_path = $path
      ' sites.json > /tmp/sites.json.tmp

      if ! jq empty /tmp/sites.json.tmp 2>/dev/null; then
        echo "Error: Failed to update local_path (invalid JSON)"
        rm -f /tmp/sites.json.tmp
        # Revert directory rename
        mv "$NEW_LOCAL_PATH" "$OLD_LOCAL_PATH"
        exit 1
      fi

      mv /tmp/sites.json.tmp sites.json
      echo "Local directory renamed to: $NEW_LOCAL_PATH"
    else
      echo "Warning: Local directory $OLD_LOCAL_PATH doesn't exist, skipping rename."
    fi
  else
    echo "Local directory not renamed."
  fi
fi
```

## Error Handling

All operations include:
- JSON validation using `jq empty` before atomic writes
- Existence checks before modifying profiles
- User confirmation for destructive operations
- Temp file pattern for atomic updates (prevents corruption)

## Edge Cases

1. **No sites.json**: Handled by showing "No sites connected yet" message
2. **Empty sites object**: Same as no sites.json
3. **Removing default site**: Warning shown, user must set new default manually
4. **Renaming to existing name**: Blocked with error message
5. **Local directory doesn't exist during delete/rename**: Handled gracefully with warnings

## Security Notes

- Never executes remote commands
- rm -rf only used after explicit user confirmation
- All jq operations use --arg for safe parameter passing (prevents injection)
- Atomic writes prevent sites.json corruption if interrupted
