---
name: status
description: View connected sites, sync status, and manage site profiles
usage: /status [subcommand] [args]
subcommands:
  - (none): List all connected sites with status details
  - remove <site-name>: Remove a saved site profile
  - default <site-name>: Set a site as the default
  - rename <old-name> <new-name>: Rename a site profile
---

# /status Command

This command manages WordPress site profiles and displays connection status. It provides four operations: listing all sites, removing profiles, setting the default site, and renaming profiles.

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

  # Show default marker
  DEFAULT_MARKER=""
  if [ "$IS_DEFAULT" = "true" ]; then
    DEFAULT_MARKER=" [DEFAULT]"
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

  echo "### $SITE_NAME$DEFAULT_MARKER"
  echo "- **Host:** $USER@$HOST"
  echo "- **WordPress:** $WP_VERSION at $SITE_URL"
  echo "- **WP-CLI:** $WP_CLI_PATH"
  echo "- **Last sync:** $LAST_SYNC ($RELATIVE_TIME)"
  echo "- **Local files:** $LOCAL_PATH"
  echo "- **Environment:** $ENVIRONMENT"
  echo "- **Notes:** $NOTES"
  echo ""
done

echo "**$SITE_COUNT site(s) connected**"
echo ""

# Show quick reconnect hint if default site exists
DEFAULT_SITE=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json 2>/dev/null)
if [ -n "$DEFAULT_SITE" ]; then
  echo "Reconnect: \`/connect $DEFAULT_SITE\`"
fi
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
