---
name: diagnostic-version-audit
description: Checks WordPress core, PHP, MySQL/MariaDB, plugin, and theme versions for compatibility issues and available updates via WP-CLI and WordPress.org API. Identifies outdated software that may have known vulnerabilities or compatibility problems.
---

# Diagnostic: Version & Compatibility Audit

You perform comprehensive version auditing for WordPress installations to identify outdated software, compatibility issues, and available updates. This diagnostic uses WP-CLI commands executed over SSH and WordPress.org API queries — no external API keys required.

## Overview

This skill checks four critical version areas:
1. **WordPress Core Version** — Current version vs. available updates
2. **PHP Version** — Runtime version vs. security support status
3. **MySQL/MariaDB Version** — Database version vs. compatibility recommendations
4. **Plugin & Theme Updates** — Outdated extensions vs. available updates with compatibility checks

## How It Works

### Prerequisites

Before running checks, you need:
- Site connection profile from `sites.json` (loaded by CoWork)
- SSH access credentials (user, host, SSH key)
- WordPress path on remote server
- WP-CLI path on remote server (or indication that it's unavailable)

If WP-CLI is not available, return a single Warning finding and skip WP-CLI-dependent checks.

### Check 1: WordPress Core Version

**Command:**
```bash
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} core version"
```

**Parse output:** Extract version number (e.g., "6.4.3")

**Check for updates:**
```bash
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} core check-update --format=json"
```

**Response format:**
```json
[
  {
    "version": "6.5.0",
    "update_type": "major",
    "package_url": "https://downloads.wordpress.org/release/wordpress-6.5.0.zip"
  }
]
```

**Empty array = no updates available.**

**Severity Logic:**
- Update available with `"update_type": "major"` → **Critical** (major version updates often include security fixes)
- Update available with `"update_type": "minor"` → **Warning** (minor updates, bug fixes)
- No update available → **Info** (document current version for reference)

**Finding ID Format:** `DIAG-VERSION-{3-char-md5-of-"wordpress-core"}`

**Example Finding (Update Available):**
```json
{
  "id": "DIAG-VERSION-a1b",
  "severity": "Critical",
  "category": "Version & Compatibility",
  "title": "WordPress core update available",
  "summary": "Your WordPress version is outdated. A newer version with security and bug fixes is available.",
  "detail": "Current version: 6.4.3. Available version: 6.5.0 (major update). Major updates often include critical security patches.",
  "location": "WordPress Core",
  "fix": "Update via WP-CLI: `wp core update` or use WordPress admin dashboard (Dashboard > Updates)."
}
```

**Example Finding (Up to Date):**
```json
{
  "id": "DIAG-VERSION-a1b",
  "severity": "Info",
  "category": "Version & Compatibility",
  "title": "WordPress core is up to date",
  "summary": "Your WordPress installation is running the latest version.",
  "detail": "Current version: 6.5.0. No updates available.",
  "location": "WordPress Core",
  "fix": "No action required."
}
```

### Check 2: PHP Version

**Command:**
```bash
ssh {user}@{host} "php -v"
```

**Parse output:** Extract version number from first line (e.g., "PHP 8.2.10...")

**Version Support Status (as of 2026):**
- **PHP < 7.4:** Critical — End of security support
- **PHP 7.4:** Critical — End of security support (November 2022)
- **PHP 8.0:** Warning — End of security support (November 2023)
- **PHP 8.1:** Info — Active support until November 2024, security support until November 2025
- **PHP 8.2+:** Info — Actively supported

**Finding ID Format:** `DIAG-PHP-{3-char-md5-of-php-version}`

**Example Finding (Outdated):**
```json
{
  "id": "DIAG-PHP-c3d",
  "severity": "Critical",
  "category": "Version & Compatibility",
  "title": "PHP version is end-of-life",
  "summary": "Your PHP version no longer receives security updates, putting your site at risk.",
  "detail": "Current PHP version: 7.4.33. This version reached end of life in November 2022. Security vulnerabilities discovered after this date will not be patched.",
  "location": "Server PHP Runtime",
  "fix": "Contact your hosting provider to upgrade PHP to version 8.1 or higher. Test your site on a staging environment first, as some plugins may require updates for compatibility."
}
```

**Example Finding (Current):**
```json
{
  "id": "DIAG-PHP-c3d",
  "severity": "Info",
  "category": "Version & Compatibility",
  "title": "PHP version is current",
  "summary": "Your PHP version is actively supported with security updates.",
  "detail": "Current PHP version: 8.2.10. This version receives active support and security updates.",
  "location": "Server PHP Runtime",
  "fix": "No action required."
}
```

### Check 3: MySQL/MariaDB Version

**Command:**
```bash
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} db version"
```

**Parse output:** Extract database type and version (e.g., "mysql Ver 8.0.35" or "MariaDB 10.6.16")

**Version Compatibility:**
- **MySQL < 5.7 or MariaDB < 10.3:** Warning — WordPress minimum recommended versions
- **MySQL 5.7+ or MariaDB 10.3+:** Info — Compatible

**Finding ID Format:** `DIAG-DB-{3-char-md5-of-db-version}`

**Example Finding (Old Version):**
```json
{
  "id": "DIAG-DB-e5f",
  "severity": "Warning",
  "category": "Version & Compatibility",
  "title": "Database version below recommended",
  "summary": "Your database version is older than WordPress recommends for optimal performance and security.",
  "detail": "Current database: MySQL 5.6.51. WordPress recommends MySQL 5.7 or higher (or MariaDB 10.3+) for full feature support and security updates.",
  "location": "Database Server",
  "fix": "Contact your hosting provider to upgrade your database server. MySQL 5.7+ or MariaDB 10.5+ recommended."
}
```

### Check 4: Plugin and Theme Updates

**Get Full Plugin Inventory:**
```bash
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} plugin list --format=json"
```

**Response format:**
```json
[
  {
    "name": "akismet",
    "status": "active",
    "update": "available",
    "version": "4.2.1",
    "update_version": "5.0.1"
  },
  {
    "name": "custom-plugin",
    "status": "active",
    "update": "none",
    "version": "1.0.0"
  }
]
```

**Filter to Outdated Plugins:**
```bash
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} plugin list --update=available --format=json"
```

**Get Theme Status:**
```bash
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} theme list --format=json"
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} theme list --update=available --format=json"
```

**For Each Outdated Plugin/Theme:**

1. Generate deterministic finding ID: `DIAG-PLUGIN-{3-char-md5-of-slug}` or `DIAG-THEME-{3-char-md5-of-slug}`

2. Check WordPress.org compatibility (optional but recommended):
   ```bash
   curl -s "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]={slug}"
   ```

   **Parse `tested` field:** If the plugin's `tested` version is lower than the current WordPress version, add a compatibility note.

   **Example:** Plugin tested up to WP 6.3, but site is running WP 6.5 → add note: "This plugin has not been tested with your WordPress version. Update may require testing."

3. Create finding:

**Example Finding (Plugin Update):**
```json
{
  "id": "DIAG-PLUGIN-7a3",
  "severity": "Warning",
  "category": "Version & Compatibility",
  "title": "Plugin update available: Akismet Anti-Spam",
  "summary": "An outdated plugin may have security vulnerabilities or compatibility issues.",
  "detail": "Plugin 'Akismet Anti-Spam' (akismet) is outdated. Current version: 4.2.1. Available version: 5.0.1. This plugin has been tested with WordPress 6.5.",
  "location": "wp-content/plugins/akismet/",
  "fix": "Update via WP-CLI: `wp plugin update akismet` or via WordPress admin (Plugins > Updates). Review changelog before updating: https://wordpress.org/plugins/akismet/#developers"
}
```

**Example Finding (Plugin Not Tested):**
```json
{
  "id": "DIAG-PLUGIN-9c2",
  "severity": "Warning",
  "category": "Version & Compatibility",
  "title": "Plugin update available: Contact Form 7",
  "summary": "An outdated plugin may have security vulnerabilities or compatibility issues.",
  "detail": "Plugin 'Contact Form 7' (contact-form-7) is outdated. Current version: 5.7.5. Available version: 5.8.3. Note: This plugin was last tested with WordPress 6.3. Your site is running WordPress 6.5. Compatibility testing recommended.",
  "location": "wp-content/plugins/contact-form-7/",
  "fix": "Update via WP-CLI: `wp plugin update contact-form-7` or via WordPress admin. Test on a staging site first due to potential compatibility issues."
}
```

**Example Finding (Theme Update):**
```json
{
  "id": "DIAG-THEME-4d1",
  "severity": "Warning",
  "category": "Version & Compatibility",
  "title": "Theme update available: Twenty Twenty-Four",
  "summary": "An outdated theme may have security vulnerabilities or compatibility issues.",
  "detail": "Theme 'Twenty Twenty-Four' (twentytwentyfour) is outdated. Current version: 1.0. Available version: 1.1. Theme updates often include security fixes and new features.",
  "location": "wp-content/themes/twentytwentyfour/",
  "fix": "Update via WP-CLI: `wp theme update twentytwentyfour` or via WordPress admin (Appearance > Themes). Backup your site before updating."
}
```

## Output Format

Return findings as a JSON array. Each finding must include:
- `id` (string) — Deterministic ID based on check type
- `severity` (string) — "Critical", "Warning", or "Info"
- `category` (string) — "Version & Compatibility"
- `title` (string) — Short descriptive title
- `summary` (string) — One non-technical sentence explaining the issue
- `detail` (string) — Technical detail with version numbers and context
- `location` (string) — Where the issue exists (e.g., "WordPress Core", "Server PHP Runtime", plugin path)
- `fix` (string) — Specific remediation steps with commands

**Example Complete Output:**
```json
[
  {
    "id": "DIAG-VERSION-a1b",
    "severity": "Critical",
    "category": "Version & Compatibility",
    "title": "WordPress core update available",
    "summary": "Your WordPress version is outdated. A newer version with security and bug fixes is available.",
    "detail": "Current version: 6.4.3. Available version: 6.5.0 (major update).",
    "location": "WordPress Core",
    "fix": "Update via WP-CLI: `wp core update` or use WordPress admin dashboard."
  },
  {
    "id": "DIAG-PHP-c3d",
    "severity": "Info",
    "category": "Version & Compatibility",
    "title": "PHP version is current",
    "summary": "Your PHP version is actively supported with security updates.",
    "detail": "Current PHP version: 8.2.10.",
    "location": "Server PHP Runtime",
    "fix": "No action required."
  },
  {
    "id": "DIAG-PLUGIN-7a3",
    "severity": "Warning",
    "category": "Version & Compatibility",
    "title": "Plugin update available: Akismet Anti-Spam",
    "summary": "An outdated plugin may have security vulnerabilities or compatibility issues.",
    "detail": "Plugin 'Akismet Anti-Spam' is outdated. Current: 4.2.1, Available: 5.0.1.",
    "location": "wp-content/plugins/akismet/",
    "fix": "Update via WP-CLI: `wp plugin update akismet` or via admin dashboard."
  }
]
```

## Error Handling

### WP-CLI Not Available
If WP-CLI is not installed or not found, return this finding and skip all WP-CLI-dependent checks:

```json
{
  "id": "DIAG-WPCLI-000",
  "severity": "Warning",
  "category": "Version & Compatibility",
  "title": "WP-CLI not available",
  "summary": "Version auditing requires WP-CLI to be installed on the server.",
  "detail": "WP-CLI was not found on the server. Without it, automated version checks for WordPress, plugins, themes, and database cannot be performed.",
  "location": "Server Configuration",
  "fix": "Install WP-CLI on the server: https://wp-cli.org/#installing. CoWork can assist with installation during the connection flow."
}
```

### SSH Connection Timeout
If SSH commands timeout:

```json
{
  "id": "DIAG-SSH-001",
  "severity": "Warning",
  "category": "Version & Compatibility",
  "title": "SSH connection timeout during version check",
  "summary": "Unable to complete version checks due to connection issues.",
  "detail": "SSH connection timed out while attempting to run version check commands. This may indicate network issues or server overload.",
  "location": "SSH Connection",
  "fix": "Verify network connectivity and server status. Retry the diagnostic after confirming the server is responsive."
}
```

### Command Execution Errors
If a specific WP-CLI command fails (non-zero exit code), include error output in detail:

```json
{
  "id": "DIAG-CMD-002",
  "severity": "Warning",
  "category": "Version & Compatibility",
  "title": "Failed to check plugin updates",
  "summary": "An error occurred while checking for plugin updates.",
  "detail": "WP-CLI command `wp plugin list --update=available` failed with error: 'Error: This does not seem to be a WordPress installation.' This may indicate an incorrect WordPress path or corrupted installation.",
  "location": "WP-CLI Execution",
  "fix": "Verify WordPress installation integrity. Check that the WordPress path in the connection profile is correct."
}
```

### WordPress.org API Failures
If WordPress.org API is unreachable (network issue), gracefully skip compatibility checks:

- Still report plugin/theme updates based on WP-CLI output
- Omit the "tested with WordPress X.X" note
- Add to finding detail: "Compatibility check skipped (WordPress.org API unavailable)."

## Performance Considerations

- **SSH Connection Reuse:** If the CoWork framework supports SSH connection multiplexing (ControlMaster), use it to speed up multiple sequential commands.
- **Parallel Execution:** Plugin and theme checks can run in parallel if the framework supports it.
- **Timeout Settings:** Set reasonable timeouts (10-15 seconds per command) to avoid hanging on unresponsive servers.

## Success Criteria

Version audit is complete when:
- WordPress core version checked and update status determined
- PHP version checked and support status determined
- Database version checked and compatibility assessed
- All plugins checked for available updates
- All themes checked for available updates
- WordPress.org compatibility checks attempted for outdated plugins/themes (graceful fallback if API unavailable)
- All findings returned in structured JSON format
- Deterministic finding IDs generated for consistent tracking across scans
