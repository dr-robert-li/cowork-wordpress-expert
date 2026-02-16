---
name: diagnostic-config-security
description: Checks wp-config.php for critical security misconfigurations (WP_DEBUG enabled, default salts, missing DISALLOW_FILE_EDIT, database credentials in version control)
---

# Diagnostic Skill: wp-config.php Security

You analyze wp-config.php for critical security misconfigurations that expose the site to risk.

## Scope: Critical Issues Only

Per user decision, this skill checks ONLY critical security issues. It explicitly DOES NOT check debatable settings like specific memory limits, table prefix recommendations on existing sites, or obscure hardening settings that vary by hosting environment.

**What we check:**
1. WP_DEBUG set to true (Critical - leaks sensitive data in production)
2. Default/empty authentication salts (Critical - session hijacking risk)
3. DISALLOW_FILE_EDIT absent or false (Warning - allows theme/plugin editing)
4. Default table prefix 'wp_' (Info only - noted but not critical)
5. Database credentials in version control (Warning - credential exposure risk)

**What we explicitly skip:**
- Specific PHP memory limit values
- Table prefix change recommendations for existing sites
- Obscure wp-config hardening constants
- Database host recommendations
- SSL/HTTPS enforcement (separate check)

## How It Works

1. Load site connection details from `sites.json`
2. Run checks REMOTELY via SSH (do NOT rely on local synced copy - wp-config.php may not be synced)
3. Check for each security issue using SSH grep commands
4. Generate structured findings with deterministic IDs
5. Return findings as JSON array

## Connection Details

```bash
# Read site profile
SITE_NAME="${1:-default-site}"
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)

HOST=$(echo "$PROFILE" | jq -r '.host')
USER=$(echo "$PROFILE" | jq -r '.user')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path')
```

## wp-config.php Location Handling

WordPress supports wp-config.php in two locations:
1. Standard location: `{WP_PATH}/wp-config.php`
2. One directory up: `{WP_PATH}/../wp-config.php` (security by obscurity pattern)

**Check both locations:**

```bash
# Try standard location first
if ssh "${USER}@${HOST}" "test -f ${WP_PATH}/wp-config.php" 2>/dev/null; then
  CONFIG_PATH="${WP_PATH}/wp-config.php"
elif ssh "${USER}@${HOST}" "test -f ${WP_PATH}/../wp-config.php" 2>/dev/null; then
  CONFIG_PATH="${WP_PATH}/../wp-config.php"
else
  # wp-config.php not found
  echo "ERROR: wp-config.php not found"
  exit 1
fi
```

## Security Checks

### Check 1: WP_DEBUG Enabled

**Risk:** Critical - Displays PHP errors, database queries, and sensitive information to visitors.

**Detection:**
```bash
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "grep -E \"define\s*\(\s*['\\\"]WP_DEBUG['\\\"].*true\" ${CONFIG_PATH}" 2>&1
```

**If found:** Generate Critical finding.

**Finding ID:** `SECR-CONFIG-DBG` (deterministic)

**Finding:**
```json
{
  "id": "SECR-CONFIG-DBG",
  "severity": "Critical",
  "category": "Security",
  "title": "WP_DEBUG enabled in production",
  "summary": "WordPress debug mode is enabled, exposing sensitive system information to visitors",
  "detail": "The WP_DEBUG constant is set to true in wp-config.php. This causes PHP errors, database queries, and sensitive system information to be displayed on the website. In production environments, this exposes: (1) File paths and server configuration, (2) Database structure and queries, (3) Plugin/theme internal errors, (4) Potential security vulnerabilities. Debug mode should ONLY be enabled in development environments.",
  "location": "wp-config.php",
  "fix": "Change `define('WP_DEBUG', true);` to `define('WP_DEBUG', false);` in wp-config.php. If you need error logging for troubleshooting, use: `define('WP_DEBUG', true); define('WP_DEBUG_LOG', true); define('WP_DEBUG_DISPLAY', false);` to log errors to wp-content/debug.log without displaying them to visitors."
}
```

### Check 2: Default/Empty Authentication Salts

**Risk:** Critical - Session hijacking, authentication bypass, cookie theft.

**Detection:**
```bash
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "grep 'put your unique phrase here' ${CONFIG_PATH}" 2>&1
```

**If found:** Generate Critical finding.

**Finding ID:** `SECR-CONFIG-SLT` (deterministic)

**Finding:**
```json
{
  "id": "SECR-CONFIG-SLT",
  "severity": "Critical",
  "category": "Security",
  "title": "Default authentication salts in use",
  "summary": "WordPress authentication salts have not been changed from default values, allowing session hijacking",
  "detail": "The authentication keys and salts in wp-config.php still contain the default placeholder text 'put your unique phrase here'. These salts are used to encrypt authentication cookies and secure passwords. Using default values means: (1) Session cookies can be forged by attackers, (2) Password hashes are weaker and easier to crack, (3) Multiple sites with default salts share the same encryption keys. This is equivalent to using no encryption at all.",
  "location": "wp-config.php (AUTH_KEY, SECURE_AUTH_KEY, LOGGED_IN_KEY, NONCE_KEY, AUTH_SALT, SECURE_AUTH_SALT, LOGGED_IN_SALT, NONCE_SALT)",
  "fix": "Generate new random salts using WordPress.org secret-key service: Visit https://api.wordpress.org/secret-key/1.1/salt/ and replace the existing define() statements for all 8 keys/salts in wp-config.php. After updating salts, all users will be logged out and need to log in again (this is expected and safe)."
}
```

### Check 3: DISALLOW_FILE_EDIT Not Set

**Risk:** Warning - Allows theme/plugin file editing through WordPress admin, which can be exploited if admin account is compromised.

**Detection:**
```bash
# Check if DISALLOW_FILE_EDIT is set to true
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "grep -E \"define\s*\(\s*['\\\"]DISALLOW_FILE_EDIT['\\\"].*true\" ${CONFIG_PATH}" 2>&1
```

**If NOT found:** Generate Warning finding.

**Finding ID:** `SECR-CONFIG-EDT` (deterministic)

**Finding:**
```json
{
  "id": "SECR-CONFIG-EDT",
  "severity": "Warning",
  "category": "Security",
  "title": "Theme/plugin file editor enabled",
  "summary": "WordPress admin panel allows editing theme and plugin files, which can be exploited if admin access is compromised",
  "detail": "The DISALLOW_FILE_EDIT constant is not set to true in wp-config.php. This means administrators can edit theme and plugin files directly through the WordPress admin panel. While convenient for development, this feature becomes a security risk in production: (1) If an admin account is compromised, attackers can inject malicious code into site files, (2) Accidental edits can break the site, (3) No version control or backup of changes. Best practice is to disable file editing in production and require file changes via SFTP/SSH with proper version control.",
  "location": "wp-config.php",
  "fix": "Add `define('DISALLOW_FILE_EDIT', true);` to wp-config.php before the line that says '/* That's all, stop editing! Happy publishing. */'. This disables the theme/plugin editors in WordPress admin. After this change, file modifications must be done via SFTP/SSH, which provides better security and audit trails."
}
```

### Check 4: Default Table Prefix

**Risk:** Info only - Default prefix 'wp_' makes SQL injection attacks slightly easier but changing on existing sites is risky.

**Detection:**
```bash
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "grep '^\$table_prefix.*wp_' ${CONFIG_PATH}" 2>&1
```

**If found:** Generate Info finding (not Critical per user decision).

**Finding ID:** `SECR-CONFIG-PFX` (deterministic)

**Finding:**
```json
{
  "id": "SECR-CONFIG-PFX",
  "severity": "Info",
  "category": "Security",
  "title": "Default database table prefix in use",
  "summary": "WordPress is using the default 'wp_' table prefix, which is widely known and targeted by SQL injection attacks",
  "detail": "The $table_prefix variable is set to 'wp_' in wp-config.php. This is the default value used by WordPress installations. While not a critical vulnerability on its own, using the default prefix makes SQL injection attacks slightly easier because attackers know the table names (wp_users, wp_posts, etc.) without guessing. However, changing the table prefix on an existing site is risky and complex, requiring database-wide updates and potential plugin/theme compatibility issues.",
  "location": "wp-config.php",
  "fix": "For existing sites: Do NOT change the table prefix unless absolutely necessary. Instead, focus on preventing SQL injection through proper use of $wpdb->prepare() in all custom queries. For new installations: Set a unique table prefix during installation (e.g., 'wp_a3f9b2_' with random characters)."
}
```

### Check 5: Database Credentials in Version Control

**Risk:** Warning - If wp-config.php is tracked in Git, database credentials are exposed in repository history.

**Detection:**
```bash
# Check if .git directory exists alongside wp-config.php
CONFIG_DIR=$(dirname "${CONFIG_PATH}")
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "test -d ${CONFIG_DIR}/.git" 2>&1

# If .git exists, check if wp-config.php is tracked
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "cd ${CONFIG_DIR} && git ls-files wp-config.php 2>/dev/null" 2>&1
```

**If wp-config.php is tracked in git:** Generate Warning finding.

**Finding ID:** `SECR-CONFIG-VCS` (deterministic)

**Finding:**
```json
{
  "id": "SECR-CONFIG-VCS",
  "severity": "Warning",
  "category": "Security",
  "title": "Database credentials committed to version control",
  "summary": "wp-config.php is tracked in Git, exposing database credentials in repository history",
  "detail": "The wp-config.php file is being tracked by Git version control. This file contains sensitive database credentials (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST) and authentication salts. Once committed to Git: (1) Credentials remain in repository history even if file is later removed, (2) If repository is pushed to GitHub/GitLab/Bitbucket, credentials may be exposed, (3) Anyone with access to the repository can extract database credentials. This is a common security mistake that can lead to database compromise.",
  "location": "wp-config.php (tracked in Git repository)",
  "fix": "Immediately remove wp-config.php from Git tracking: Run `git rm --cached wp-config.php` (this removes from Git but keeps the file on disk). Add wp-config.php to .gitignore: `echo 'wp-config.php' >> .gitignore`. Commit these changes. IMPORTANT: Changing database passwords is recommended because credentials are already in Git history. Consider using a wp-config-sample.php template with placeholder values for version control instead."
}
```

## Error Handling

### wp-config.php Not Found

**Action:** Generate Warning finding.

**Finding ID:** `SECR-CONFIG-404`

**Finding:**
```json
{
  "id": "SECR-CONFIG-404",
  "severity": "Warning",
  "category": "Configuration",
  "title": "wp-config.php not accessible",
  "summary": "Cannot analyze wp-config.php security because file is not accessible via SSH",
  "detail": "Attempted to access wp-config.php at {WP_PATH}/wp-config.php and {WP_PATH}/../wp-config.php but file was not found or not readable. This could indicate: (1) Incorrect wp_path in sites.json, (2) File permissions preventing SSH user from reading wp-config.php, (3) wp-config.php located in non-standard location. Without access to wp-config.php, security configuration cannot be verified.",
  "location": "Expected: {WP_PATH}/wp-config.php",
  "fix": "Verify WordPress installation path in sites.json is correct. Check file permissions on wp-config.php (should be readable by SSH user). If wp-config.php is in a non-standard location, update the wp_path in sites.json or temporarily grant read access to the SSH user."
}
```

### SSH Connection Failure

**Action:** Generate Warning finding.

**Finding ID:** `SECR-CONFIG-SSH`

**Finding:**
```json
{
  "id": "SECR-CONFIG-SSH",
  "severity": "Warning",
  "category": "Configuration",
  "title": "Cannot connect to server for wp-config.php analysis",
  "summary": "SSH connection to server failed, preventing wp-config.php security check",
  "detail": "SSH connection to {USER}@{HOST} failed with error: {error_message}. This may indicate network issues, firewall blocking, or SSH service not running. Without SSH access, wp-config.php security configuration cannot be verified.",
  "location": "Server: {HOST}",
  "fix": "Verify SSH connectivity manually: `ssh {USER}@{HOST} 'echo connected'`. Check firewall rules, ensure SSH service is running, and verify the hostname/IP address is correct in sites.json."
}
```

## Output Format

Return a JSON array of findings. Each check that finds an issue generates one finding. If no issues found, return empty array `[]`.

**Example output (WP_DEBUG enabled, default salts):**
```json
[
  {
    "id": "SECR-CONFIG-DBG",
    "severity": "Critical",
    "category": "Security",
    "title": "WP_DEBUG enabled in production",
    "summary": "WordPress debug mode is enabled, exposing sensitive system information to visitors",
    "detail": "The WP_DEBUG constant is set to true in wp-config.php. This causes PHP errors, database queries, and sensitive system information to be displayed on the website...",
    "location": "wp-config.php",
    "fix": "Change `define('WP_DEBUG', true);` to `define('WP_DEBUG', false);` in wp-config.php..."
  },
  {
    "id": "SECR-CONFIG-SLT",
    "severity": "Critical",
    "category": "Security",
    "title": "Default authentication salts in use",
    "summary": "WordPress authentication salts have not been changed from default values, allowing session hijacking",
    "detail": "The authentication keys and salts in wp-config.php still contain the default placeholder text...",
    "location": "wp-config.php (AUTH_KEY, SECURE_AUTH_KEY, LOGGED_IN_KEY, NONCE_KEY, AUTH_SALT, SECURE_AUTH_SALT, LOGGED_IN_SALT, NONCE_SALT)",
    "fix": "Generate new random salts using WordPress.org secret-key service: Visit https://api.wordpress.org/secret-key/1.1/salt/..."
  }
]
```

**Example output (no issues found):**
```json
[]
```

## Notes

- All checks run REMOTELY via SSH - do NOT use local synced files
- Check both standard and one-directory-up locations for wp-config.php
- Use deterministic finding IDs for consistent tracking across scans
- Distinguish between Critical (immediate security risk), Warning (should fix), and Info (awareness only)
- Provide specific, actionable fix instructions with exact commands/code snippets
- Explicitly document what is NOT checked to avoid user confusion
