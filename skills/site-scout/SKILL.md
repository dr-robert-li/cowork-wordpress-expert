---
name: site-scout
description: Pre-diagnostic SSH reconnaissance — gathers environment data, recent changes, error logs, and server health to inform diagnostic skill selection and focus areas
---

# Site Scout Skill: SSH Reconnaissance

You perform lightweight reconnaissance on the WordPress site via SSH before diagnostic skills run. The goal is to gather environment context that helps the diagnostic planner choose which skills to run, what to focus on, and what to expect.

## Philosophy

Fast and non-destructive. Every check is read-only. Every check has a timeout. If a check fails, note "unable to assess" and move on — never block the diagnostic pipeline.

## Section 1: Connection Setup

```bash
SITE_NAME="${1:-default-site}"
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)

HOST=$(echo "$PROFILE" | jq -r '.host')
USER=$(echo "$PROFILE" | jq -r '.user')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path')
WP_CLI_PATH=$(echo "$PROFILE" | jq -r '.wp_cli_path')
SITE_URL=$(echo "$PROFILE" | jq -r '.site_url')

# SSH options: batch mode, 10s connect timeout, no host key prompt
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
```

## Section 2: Reconnaissance Checks

Run each check independently. If one fails, log the failure and continue to the next.

### Check 1: WordPress Debug Log

Look for recent error entries in the WordPress debug log.

```bash
# Check if debug.log exists and get recent entries
DEBUG_LOG=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "if [ -f '${WP_PATH}/wp-content/debug.log' ]; then
    echo 'EXISTS'
    wc -l < '${WP_PATH}/wp-content/debug.log'
    tail -50 '${WP_PATH}/wp-content/debug.log'
  else
    echo 'NOT_FOUND'
  fi" 2>&1)
```

**Output fields:**
- `debug_log.exists`: boolean
- `debug_log.line_count`: number (if exists)
- `debug_log.recent_entries`: last 50 lines (if exists)
- `debug_log.error_patterns`: extracted unique error types

### Check 2: PHP Error Log

Find and read the PHP error log location.

```bash
# Get PHP error log path and recent entries
PHP_ERROR_LOG=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "php -r 'echo ini_get(\"error_log\");' 2>/dev/null" 2>&1)

if [ -n "$PHP_ERROR_LOG" ] && [ "$PHP_ERROR_LOG" != "" ]; then
  PHP_ERRORS=$(ssh $SSH_OPTS "${USER}@${HOST}" \
    "if [ -f '$PHP_ERROR_LOG' ]; then tail -30 '$PHP_ERROR_LOG'; else echo 'NOT_READABLE'; fi" 2>&1)
fi
```

**Output fields:**
- `php_error_log.path`: string
- `php_error_log.recent_entries`: last 30 lines
- `php_error_log.readable`: boolean

### Check 3: Recently Modified Files

Identify files changed in the last 7 days within wp-content (where custom code and plugins live).

```bash
# Find recently modified PHP files in wp-content
RECENT_FILES=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "find '${WP_PATH}/wp-content' -name '*.php' -mtime -7 -type f 2>/dev/null | head -50" 2>&1)

# Count total and break down by directory
RECENT_COUNT=$(echo "$RECENT_FILES" | grep -c '\.php$' || echo "0")
```

**Output fields:**
- `recent_modifications.files`: array of file paths
- `recent_modifications.count`: number
- `recent_modifications.by_directory`: breakdown (plugins/, themes/, mu-plugins/, etc.)

### Check 4: wp-config.php Environment Indicators

Read key configuration values that affect diagnostic approach.

```bash
# Extract environment-relevant config values (NOT credentials)
CONFIG_VALUES=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "grep -E '(WP_DEBUG|WP_DEBUG_LOG|WP_DEBUG_DISPLAY|WP_ENVIRONMENT_TYPE|DISALLOW_FILE_EDIT|WP_CACHE|MULTISITE)' '${WP_PATH}/wp-config.php' 2>/dev/null || \
   grep -E '(WP_DEBUG|WP_DEBUG_LOG|WP_DEBUG_DISPLAY|WP_ENVIRONMENT_TYPE|DISALLOW_FILE_EDIT|WP_CACHE|MULTISITE)' '${WP_PATH}/../wp-config.php' 2>/dev/null" 2>&1)
```

**Output fields:**
- `config.wp_debug`: boolean
- `config.wp_debug_log`: boolean
- `config.wp_debug_display`: boolean
- `config.environment_type`: string (production/staging/development/local)
- `config.disallow_file_edit`: boolean
- `config.wp_cache`: boolean
- `config.multisite`: boolean

### Check 5: PHP Environment

Get PHP version and key settings that affect site behavior.

```bash
# PHP version and settings
PHP_INFO=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "php -r 'echo json_encode([
    \"version\" => PHP_VERSION,
    \"memory_limit\" => ini_get(\"memory_limit\"),
    \"max_execution_time\" => ini_get(\"max_execution_time\"),
    \"upload_max_filesize\" => ini_get(\"upload_max_filesize\"),
    \"post_max_size\" => ini_get(\"post_max_size\"),
    \"display_errors\" => ini_get(\"display_errors\")
  ]);' 2>/dev/null" 2>&1)
```

**Output fields:**
- `php.version`: string
- `php.memory_limit`: string
- `php.max_execution_time`: string
- `php.upload_max_filesize`: string
- `php.display_errors`: string

### Check 6: Active Plugins and Theme (WP-CLI)

If WP-CLI is available, get the active plugin and theme list.

```bash
if [ "$WP_CLI_PATH" != "null" ] && [ -n "$WP_CLI_PATH" ]; then
  # Active plugins
  ACTIVE_PLUGINS=$(ssh $SSH_OPTS "${USER}@${HOST}" \
    "${WP_CLI_PATH} plugin list --status=active --format=json --path='${WP_PATH}'" 2>&1)

  # Active theme
  ACTIVE_THEME=$(ssh $SSH_OPTS "${USER}@${HOST}" \
    "${WP_CLI_PATH} theme list --status=active --format=json --path='${WP_PATH}'" 2>&1)

  # Plugin count
  PLUGIN_COUNT=$(echo "$ACTIVE_PLUGINS" | jq 'length' 2>/dev/null || echo "unknown")
fi
```

**Output fields:**
- `plugins.active`: array of {name, version, update_available}
- `plugins.count`: number
- `theme.active`: {name, version}
- `wp_cli_available`: boolean

### Check 7: HTTP Status Check

Verify the site is responding and check for common issues.

```bash
# HTTP status check (from remote server to avoid CDN/firewall differences)
HTTP_STATUS=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "curl -sI -o /dev/null -w '%{http_code}' --max-time 10 '${SITE_URL}'" 2>&1)

# Check for maintenance mode
MAINTENANCE_MODE=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "test -f '${WP_PATH}/.maintenance' && echo 'true' || echo 'false'" 2>&1)
```

**Output fields:**
- `http.status_code`: number
- `http.maintenance_mode`: boolean

### Check 8: Disk Usage

Overview of space consumption in wp-content subdirectories.

```bash
DISK_USAGE=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "du -sh '${WP_PATH}/wp-content'/*/ 2>/dev/null | sort -rh | head -10" 2>&1)

# Total wp-content size
TOTAL_SIZE=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "du -sh '${WP_PATH}/wp-content' 2>/dev/null" 2>&1)
```

**Output fields:**
- `disk.wp_content_total`: string (e.g., "2.3G")
- `disk.by_directory`: array of {directory, size}

## Section 3: Output

Write the structured scout report to `memory/{site}/scout-report.json`:

```json
{
  "site": "{site-name}",
  "scouted_at": "{ISO8601 timestamp}",
  "duration_seconds": 15,
  "checks_completed": 7,
  "checks_failed": 1,
  "environment": {
    "php_version": "8.2.14",
    "wp_debug": true,
    "environment_type": "production",
    "multisite": false,
    "maintenance_mode": false,
    "http_status": 200,
    "wp_cli_available": true
  },
  "recent_activity": {
    "modified_files_7d": 12,
    "modified_files_by_area": {
      "plugins": 8,
      "themes": 3,
      "mu-plugins": 1
    },
    "debug_log_exists": true,
    "debug_log_lines": 4521,
    "recent_errors": ["Fatal error: Allowed memory size exhausted", "Warning: Cannot modify header information"]
  },
  "resources": {
    "php_memory_limit": "256M",
    "wp_content_size": "2.3G",
    "largest_directories": [
      {"directory": "uploads", "size": "1.8G"},
      {"directory": "plugins", "size": "320M"}
    ]
  },
  "plugins": {
    "active_count": 14,
    "active_list": ["woocommerce", "yoast-seo", "contact-form-7"]
  },
  "alerts": [
    "WP_DEBUG is enabled in production",
    "12 PHP files modified in last 7 days",
    "Debug log has 4521 lines — active error logging"
  ],
  "failed_checks": [
    {"check": "php_error_log", "reason": "PHP error log path not set"}
  ]
}
```

### Alert Generation

Generate alerts from scout data to highlight things that warrant attention:

| Condition | Alert |
|-----------|-------|
| WP_DEBUG true + environment_type != development | "WP_DEBUG is enabled in production" |
| HTTP status != 200 | "Site returning HTTP {status}" |
| maintenance_mode true | "Site is in maintenance mode" |
| modified_files_7d > 10 | "{N} PHP files modified in last 7 days" |
| debug_log_lines > 1000 | "Debug log has {N} lines — active error logging" |
| plugin_count > 20 | "{N} active plugins — high plugin count" |
| PHP version < 8.0 | "PHP {version} is outdated — security risk" |
| display_errors on + production | "PHP display_errors is on in production" |

## Section 4: Error Handling

### SSH Connection Failure

If the SSH connection fails entirely, return a minimal scout report:

```json
{
  "site": "{site-name}",
  "scouted_at": "{timestamp}",
  "checks_completed": 0,
  "checks_failed": 8,
  "error": "SSH connection failed: {error_message}",
  "alerts": ["Cannot connect to server — all reconnaissance skipped"],
  "failed_checks": [{"check": "all", "reason": "SSH connection failed"}]
}
```

### Individual Check Failure

If a single check times out or errors, record it in `failed_checks` and continue:

```bash
# Example: wrap each check with error handling
CHECK_RESULT=$(ssh $SSH_OPTS "${USER}@${HOST}" "..." 2>&1)
CHECK_EXIT=$?

if [ $CHECK_EXIT -ne 0 ]; then
  # Record failure, continue to next check
  FAILED_CHECKS+=("{\"check\": \"check_name\", \"reason\": \"$CHECK_RESULT\"}")
fi
```

### Timeout Handling

Each SSH command should have a reasonable timeout to prevent hanging:

```bash
# Use ConnectTimeout in SSH options (already set to 10s)
# For long-running commands, use timeout wrapper:
ssh $SSH_OPTS "${USER}@${HOST}" "timeout 15 find '${WP_PATH}/wp-content' -name '*.php' -mtime -7 -type f 2>/dev/null | head -50"
```

## Section 5: Integration with Diagnostic Planning

The scout report informs the `/investigate` command's diagnostic planning (Section 5 of COMMAND.md).

**How scout data influences skill selection:**

| Scout Finding | Diagnostic Impact |
|--------------|-------------------|
| WP_DEBUG enabled | Prioritize config-security |
| Many recent file changes | Prioritize malware-scan, core-integrity |
| PHP errors in logs | Prioritize code-quality with focus on error sources |
| Outdated PHP version | Flag in version-audit focus |
| High plugin count | Prioritize code-quality for plugin conflicts |
| HTTP non-200 | Emergency mode — run security skills first |
| Maintenance mode | Note in report, may affect HTTP checks |

## Notes

- All checks are read-only — never modify anything on the remote server
- SSH credentials are never logged or included in output
- Scout report is saved to memory/ which is gitignored
- Check duration target: entire scout should complete in < 30 seconds
- If WP-CLI is unavailable, skip WP-CLI-dependent checks (plugin list, theme list) and note in report
- Scout data is informational — it guides diagnostics but doesn't replace them
