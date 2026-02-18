---
name: diagnostic-file-permissions
description: Checks WordPress file permissions via SSH for security misconfigurations — audits wp-config.php, .htaccess, wp-content/uploads/, and debug.log with per-file severity thresholds. SSH-only; skips with explanatory finding for non-SSH sources.
---

# Diagnostic Skill: File Permission Security Checks

You audit WordPress file permissions via SSH to detect insecure configurations that could expose sensitive data or allow unauthorized code execution.

## Why File Permissions Matter

WordPress sites on shared and managed hosting frequently have overly permissive file permissions set by automated installers or misconfigured deployment scripts:

1. **wp-config.php** — Contains database credentials and authentication keys. If world-readable (644+), any other user on the same server can read database passwords. Should be 640 or stricter.
2. **.htaccess** — Controls Apache URL routing and security directives. If world-writable (666/777), any compromised process can inject redirects or disable security rules.
3. **wp-content/uploads/** — The only directory WordPress needs to write to. If world-writable (777), any user or compromised process can upload arbitrary files. Should be 755.
4. **wp-content/debug.log** — When WP_DEBUG is enabled, this file captures PHP errors including stack traces, file paths, and database query details. If world-readable, server users can read debug output that reveals internal architecture.

## SSH-Only Skill

This skill checks permissions REMOTELY via SSH using Linux `stat -c %a` syntax. It cannot use local synced file copies because rsync normalizes permissions during the sync process — local copies do not reflect the actual server permissions.

**This skill is NOT in the `WP_CLI_SKILLS` array** — it manages its own SSH-only gating internally.

## Connection Setup

```bash
SITE_NAME="${1:-default-site}"
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)

HOST=$(echo "$PROFILE" | jq -r '.host // empty')
USER=$(echo "$PROFILE" | jq -r '.user // empty')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path // empty')
SOURCE_TYPE=$(echo "$PROFILE" | jq -r '.source_type // "ssh"')
WP_CLI_AVAILABLE=$(echo "$PROFILE" | jq -r '.wp_cli_available // "false"')
WP_CLI_PREFIX=$(echo "$PROFILE" | jq -r '.wp_cli_prefix // empty')
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
```

## Source Type Gate

This skill runs only for SSH source types. Local, Docker, and Git sources do not have accessible server file permissions that reflect production reality.

```bash
SOURCE_TYPE=$(jq -r ".sites[\"$SITE_NAME\"].source_type // \"ssh\"" sites.json)
if [ "$SOURCE_TYPE" != "ssh" ]; then
  # Return skip finding — permissions not checkable for non-SSH sources
  exit 0
fi
```

**For non-SSH sources**, return a single Info finding `INFR-PERM-SKP` and exit:

```json
{
  "id": "INFR-PERM-SKP",
  "severity": "Info",
  "category": "Infrastructure",
  "title": "File permission check skipped — non-SSH source",
  "summary": "File permission checks require SSH access to the production server and cannot run for local, Docker, or Git sources",
  "detail": "This site profile uses source_type '{SOURCE_TYPE}', which does not provide SSH access to the actual server file system. File permission checks work by running `stat -c %a` commands remotely via SSH. For non-SSH sources: (1) Local sources — permissions on developer machines differ from production servers and are not diagnostically meaningful, (2) Docker sources — container file permissions are controlled by Dockerfile/entrypoint configuration, not the OS, (3) Git sources — git checkouts do not preserve server file permissions (rsync also normalizes permissions during sync). To check file permissions, connect this site using SSH source type.",
  "location": "sites.json source_type: {SOURCE_TYPE}",
  "fix": "If you need to check file permissions on a live server, add an SSH connection profile for this site in sites.json with source_type: 'ssh', host, user, and wp_path fields. Then re-run the file permissions diagnostic."
}
```

---

## Permission Checks via SSH

For SSH sources, run permission checks using Linux `stat -c %a` (octal permissions). All commands run over SSH — do NOT use local files.

**Helper function pattern:**
```bash
get_perms() {
  local FILE="$1"
  ssh $SSH_OPTS "${USER}@${HOST}" "stat -c %a '${FILE}' 2>/dev/null || echo 'NOT_FOUND'" 2>/dev/null
}
```

---

### Check 1: wp-config.php Permissions

**Risk:** Critical — If world-readable, any user on shared hosting can read database credentials.

**World-readable detection:** A file is world-readable if the "others" permission set includes read bit. In octal, the others read bit is 4. To detect: `$((8#$PERMS & 4)) -gt 0` means world-readable.

```bash
CONFIG_PERMS=$(get_perms "${WP_PATH}/wp-config.php")

# Also check one directory up (common security pattern)
if [ "$CONFIG_PERMS" == "NOT_FOUND" ]; then
  CONFIG_PERMS=$(get_perms "${WP_PATH}/../wp-config.php")
fi
```

**Threshold logic:**

| Permissions | Action |
|-------------|--------|
| NOT_FOUND | Skip silently — no finding |
| 600, 640 | OK — Info finding only if all pass |
| 644 or world-readable (`others read bit set`) | Critical finding `INFR-PERM-CFG` |

**World-readable detection:**
```bash
WORLD_READ=$((8#$CONFIG_PERMS & 4))
if [ "$WORLD_READ" -gt 0 ]; then
  # Generate Critical finding
fi
```

**Finding:**
```json
{
  "id": "INFR-PERM-CFG",
  "severity": "Critical",
  "category": "Infrastructure",
  "title": "wp-config.php is world-readable — database credentials exposed",
  "summary": "wp-config.php has permissions {CONFIG_PERMS}, making it readable by all users on the server, exposing database credentials and authentication keys",
  "detail": "The file wp-config.php has permissions {CONFIG_PERMS} (octal). This file contains the WordPress database name, username, password, and host, plus the authentication keys and salts used to secure session cookies. On shared hosting environments, world-readable permissions (any permission where the 'others' read bit is set, e.g., 644, 664, 666, 755, 777) mean any other hosting account on the same server can read the file contents and obtain your database credentials. This is a Critical security risk: attackers with any server foothold can immediately pivot to database access.",
  "location": "wp-config.php (permissions: {CONFIG_PERMS})",
  "fix": "Restrict permissions immediately via SSH: `chmod 640 wp-config.php` This allows the file owner to read/write and the group to read, but blocks all other users. If your web server runs as a different user than the file owner, use 640 with the appropriate group, or 600 if the web server user owns the file. Run `ls -la wp-config.php` to verify the new permissions after applying the fix."
}
```

---

### Check 2: .htaccess Permissions

**Risk:** Warning — World-writable .htaccess allows any server process to inject malicious rewrite rules.

```bash
HTACCESS_PERMS=$(get_perms "${WP_PATH}/.htaccess")
```

**Threshold logic:**

| Permissions | Action |
|-------------|--------|
| NOT_FOUND | Skip silently — .htaccess may not exist |
| 644 | OK |
| 666, 777, or any world-writable (others write bit `8#$PERMS & 2`) | Warning finding `INFR-PERM-HTA` |

**World-writable detection:**
```bash
WORLD_WRITE=$((8#$HTACCESS_PERMS & 2))
if [ "$WORLD_WRITE" -gt 0 ]; then
  # Generate Warning finding
fi
```

**Finding:**
```json
{
  "id": "INFR-PERM-HTA",
  "severity": "Warning",
  "category": "Infrastructure",
  "title": ".htaccess is world-writable — redirect injection risk",
  "summary": ".htaccess has permissions {HTACCESS_PERMS}, allowing any server process to modify Apache configuration and inject malicious redirects or disable security rules",
  "detail": ".htaccess has permissions {HTACCESS_PERMS} (octal). The .htaccess file controls Apache's URL rewriting (WordPress permalinks), security headers, and access controls. World-writable permissions (others write bit set, e.g., 666, 777) mean any compromised web application or server process can modify this file to: (1) Redirect visitors to malicious sites, (2) Expose sensitive directories, (3) Disable existing security restrictions, (4) Add PHP execution to upload directories. WordPress only needs to write to .htaccess during settings changes — most of the time it should be read-only.",
  "location": ".htaccess (permissions: {HTACCESS_PERMS})",
  "fix": "Set correct permissions: `chmod 644 .htaccess` This allows the owner to read and write, and all others to read only. WordPress can update .htaccess when needed (e.g., when you change permalink settings), and web server can read it, but other users cannot write to it."
}
```

---

### Check 3: wp-content/uploads/ Permissions

**Risk:** Warning — World-writable uploads directory allows arbitrary file uploads by any server process.

```bash
UPLOADS_PERMS=$(get_perms "${WP_PATH}/wp-content/uploads")
```

**Threshold logic:**

| Permissions | Action |
|-------------|--------|
| NOT_FOUND | Skip silently — uploads dir may not exist on all sites |
| 755 | OK |
| 777 (world-writable: others write bit set) | Warning finding `INFR-PERM-UPL` |

**World-writable detection:**
```bash
WORLD_WRITE_UPL=$((8#$UPLOADS_PERMS & 2))
if [ "$WORLD_WRITE_UPL" -gt 0 ]; then
  # Generate Warning finding
fi
```

**Finding:**
```json
{
  "id": "INFR-PERM-UPL",
  "severity": "Warning",
  "category": "Infrastructure",
  "title": "wp-content/uploads/ is world-writable — arbitrary file upload risk",
  "summary": "The uploads directory has permissions {UPLOADS_PERMS}, allowing any server user or process to write files into it",
  "detail": "wp-content/uploads/ has permissions {UPLOADS_PERMS} (octal). The uploads directory stores user-uploaded media and attachments. World-writable permissions (others write bit set, e.g., 777) mean any user account or compromised process on the shared server can: (1) Plant malicious PHP scripts in the uploads directory, (2) Overwrite or delete legitimate uploaded files, (3) Potentially execute uploaded scripts if PHP execution is not restricted in this directory. WordPress only needs write access for the web server user — other server users should not be able to write here.",
  "location": "wp-content/uploads/ (permissions: {UPLOADS_PERMS})",
  "fix": "Set correct permissions: `chmod 755 wp-content/uploads` This allows the owner to read/write/execute (traverse) and all others to read and execute (traverse) but not write. The web server user (which owns the directory) retains write access for media uploads, but other server users cannot write. Also verify that PHP execution is disabled in uploads/ via .htaccess or server config to prevent execution of any uploaded scripts."
}
```

---

### Check 4: wp-content/debug.log Permissions (Conditional)

**Risk:** Warning — Debug logs exposed to the web or other server users reveal internal architecture.

This check is conditional: debug.log is only flagged if WP_DEBUG is enabled. A debug.log from an old debug session while WP_DEBUG is now off is not an active risk.

**Step 1: Determine WP_DEBUG status**

```bash
WP_DEBUG_STATUS="unknown"

if [ "$WP_CLI_AVAILABLE" == "true" ]; then
  WP_DEBUG_RAW=$($WP_CLI_PREFIX config get WP_DEBUG 2>/dev/null | tr -d '[:space:]')
  if [ "$WP_DEBUG_RAW" == "true" ] || [ "$WP_DEBUG_RAW" == "1" ]; then
    WP_DEBUG_STATUS="enabled"
  elif [ "$WP_DEBUG_RAW" == "false" ] || [ "$WP_DEBUG_RAW" == "0" ] || [ -n "$WP_DEBUG_RAW" ]; then
    WP_DEBUG_STATUS="disabled"
  fi
else
  # Fall back to SSH grep on wp-config.php
  WP_DEBUG_GREP=$(ssh $SSH_OPTS "${USER}@${HOST}" \
    "grep -E \"define\s*\(\s*['\\\"]WP_DEBUG['\\\"].*true\" ${WP_PATH}/wp-config.php 2>/dev/null" 2>/dev/null)
  if [ -n "$WP_DEBUG_GREP" ]; then
    WP_DEBUG_STATUS="enabled"
  else
    WP_DEBUG_STATUS="disabled"
  fi
fi
```

**Step 2: Check debug.log only when WP_DEBUG is enabled**

```bash
if [ "$WP_DEBUG_STATUS" == "enabled" ]; then
  DEBUG_LOG_PERMS=$(get_perms "${WP_PATH}/wp-content/debug.log")

  if [ "$DEBUG_LOG_PERMS" != "NOT_FOUND" ]; then
    WORLD_READ_DBG=$((8#$DEBUG_LOG_PERMS & 4))
    if [ "$WORLD_READ_DBG" -gt 0 ]; then
      # Generate Warning finding INFR-PERM-DBG
    fi
  fi
fi
```

**Threshold logic (only evaluated when WP_DEBUG=enabled):**

| debug.log state | Action |
|-----------------|--------|
| File not found | Skip silently — debug.log not existing is normal |
| Found + 640 or stricter | OK (if all checks pass, emit INFR-PERM-OK) |
| Found + 644 or world-readable | Warning finding `INFR-PERM-DBG` |

**Finding:**
```json
{
  "id": "INFR-PERM-DBG",
  "severity": "Warning",
  "category": "Infrastructure",
  "title": "wp-content/debug.log is world-readable while WP_DEBUG is enabled",
  "summary": "debug.log has permissions {DEBUG_LOG_PERMS} and WP_DEBUG is enabled — PHP error traces with internal paths and queries are readable by other server users",
  "detail": "wp-content/debug.log has permissions {DEBUG_LOG_PERMS} (octal), making it readable by all server users. WP_DEBUG is currently enabled, meaning this file is being actively written to with PHP error information. The debug log can contain: (1) Full file system paths (revealing server configuration), (2) Database query details (revealing table structure), (3) Plugin/theme errors that expose internal architecture, (4) Stack traces showing code execution paths. On shared hosting, other users can read this file. Additionally, if the file is web-accessible (no protection in .htaccess), the contents may be publicly visible at /wp-content/debug.log.",
  "location": "wp-content/debug.log (permissions: {DEBUG_LOG_PERMS}, WP_DEBUG: enabled)",
  "fix": "Two options: (1) Restrict permissions: `chmod 640 wp-content/debug.log` — this prevents other server users from reading it. Also add to .htaccess to block web access: `<Files debug.log>\\n  Require all denied\\n</Files>`. (2) Disable WP_DEBUG in production (recommended): Change `define('WP_DEBUG', true)` to `define('WP_DEBUG', false)` in wp-config.php. In production, errors should be caught by monitoring tools, not logged to a file. If error logging is needed, use: `define('WP_DEBUG', true); define('WP_DEBUG_LOG', true); define('WP_DEBUG_DISPLAY', false);` and protect the log file."
}
```

---

## Overall Status Finding

If **no issues** were found across all checks (wp-config.php is 640 or stricter, .htaccess is 644 or stricter, uploads is 755 or stricter, debug.log is either not present, or WP_DEBUG is disabled, or debug.log is 640 or stricter):

**Finding:**
```json
{
  "id": "INFR-PERM-OK",
  "severity": "Info",
  "category": "Infrastructure",
  "title": "File permissions within recommended ranges",
  "summary": "All checked WordPress files have permissions within recommended security ranges",
  "detail": "File permission checks passed for all accessible files: wp-config.php is not world-readable, .htaccess (if present) is not world-writable, wp-content/uploads/ (if present) is not world-writable, and debug.log (if present and WP_DEBUG enabled) is not world-readable. Note: These checks cover the four most critical WordPress permission issues; a comprehensive permissions audit should also check wp-admin/, wp-includes/, and theme/plugin directories.",
  "location": "WordPress installation at {WP_PATH}",
  "fix": "No action required — file permissions are within recommended ranges."
}
```

---

## Finding IDs Reference

| ID | Severity | Trigger |
|----|----------|---------|
| INFR-PERM-CFG | Critical | wp-config.php world-readable (644 or looser) |
| INFR-PERM-HTA | Warning | .htaccess world-writable (666/777) |
| INFR-PERM-UPL | Warning | wp-content/uploads/ world-writable (777) |
| INFR-PERM-DBG | Warning | debug.log world-readable while WP_DEBUG enabled |
| INFR-PERM-SKP | Info | Non-SSH source type — permissions check skipped |
| INFR-PERM-OK | Info | All checks pass — permissions within recommended ranges |

## Output Format

Return a JSON array of findings. Files that do not exist are silently skipped. If all accessible files have acceptable permissions, return `[INFR-PERM-OK]` finding.

**Example output (wp-config.php world-readable):**
```json
[
  {
    "id": "INFR-PERM-CFG",
    "severity": "Critical",
    "category": "Infrastructure",
    "title": "wp-config.php is world-readable — database credentials exposed",
    "summary": "wp-config.php has permissions 644, making it readable by all users on the server, exposing database credentials and authentication keys",
    "detail": "The file wp-config.php has permissions 644 (octal). This file contains the WordPress database name, username, password...",
    "location": "wp-config.php (permissions: 644)",
    "fix": "Restrict permissions immediately via SSH: `chmod 640 wp-config.php`"
  }
]
```

**Example output (non-SSH source):**
```json
[
  {
    "id": "INFR-PERM-SKP",
    "severity": "Info",
    "category": "Infrastructure",
    "title": "File permission check skipped — non-SSH source",
    "summary": "File permission checks require SSH access to the production server and cannot run for local, Docker, or Git sources",
    "detail": "This site profile uses source_type 'local'...",
    "location": "sites.json source_type: local",
    "fix": "Add an SSH connection profile for this site to check file permissions."
  }
]
```

**Example output (all checks pass):**
```json
[
  {
    "id": "INFR-PERM-OK",
    "severity": "Info",
    "category": "Infrastructure",
    "title": "File permissions within recommended ranges",
    "summary": "All checked WordPress files have permissions within recommended security ranges",
    "detail": "File permission checks passed for all accessible files...",
    "location": "WordPress installation at /var/www/html",
    "fix": "No action required."
  }
]
```

## Notes

- All permission checks run REMOTELY via SSH — never use local synced copies
- Uses Linux `stat -c %a` syntax — SSH targets are Linux servers; do NOT use macOS `stat -f %OLp`
- NOT_FOUND responses are silently skipped — not all files will exist on all sites
- debug.log conditional logic: ONLY flagged when `WP_DEBUG=enabled` AND file exists AND is world-readable
- The world-readable check for wp-config.php uses `$((8#$PERMS & 4))` to test the others-read bit directly, not by matching exact octal values — this correctly flags 644, 664, 666, 755, 775, 777, etc.
- This skill self-gates on source_type — do NOT add it to the `WP_CLI_SKILLS` array
