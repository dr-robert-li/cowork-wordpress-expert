---
name: diagnostic-core-integrity
description: Checks WordPress core files against official checksums to detect modifications, corruption, or potential compromise
---

# Diagnostic Skill: Core File Integrity

You verify WordPress core file integrity by checking all core files against official WordPress.org checksums using WP-CLI.

## How It Works

1. Load site connection details from `sites.json`
2. Execute `wp core verify-checksums` over SSH
3. Parse output to detect modified files
4. Generate structured findings for each issue
5. Return findings as JSON array

## Connection Details

Load the site profile from `sites.json`:

```bash
# Read site profile (site name provided by user)
SITE_NAME="${1:-default-site}"
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)

# Extract connection details
HOST=$(echo "$PROFILE" | jq -r '.host')
USER=$(echo "$PROFILE" | jq -r '.user')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path')
WP_CLI_PATH=$(echo "$PROFILE" | jq -r '.wp_cli_path')
```

## SSH Command Execution

Execute WP-CLI verify-checksums with proper error handling:

```bash
# Run checksum verification over SSH
ssh -o BatchMode=yes \
    -o ConnectTimeout=10 \
    "${USER}@${HOST}" \
    "cd ${WP_PATH} && ${WP_CLI_PATH} core verify-checksums --format=json" 2>&1
```

**Note:** Use `--format=json` for structured output. However, WP-CLI may return plain text on success or errors.

## Outcome Handling

### Outcome A: All files verified (Success)

**Indicators:**
- Exit code: 0
- Output: Empty or "Success: WordPress installation verifies against checksums."

**Action:** Generate Info finding indicating site is secure.

**Finding:**
```json
{
  "id": "SECR-CHECKSUMS-OK",
  "severity": "Info",
  "category": "Security",
  "title": "WordPress core files verified",
  "summary": "All WordPress core files match official checksums from WordPress.org",
  "detail": "WP-CLI checksum verification completed successfully. No modified or suspicious core files detected.",
  "location": "WordPress core installation",
  "fix": "No action required. Core files are intact."
}
```

### Outcome B: Modified files detected

**Indicators:**
- Exit code: Non-zero (typically 1)
- Output contains: "Warning: File doesn't verify against checksum" or JSON array of modified files

**WP-CLI Output Formats:**

**Plain text format:**
```
Warning: File doesn't verify against checksum: wp-includes/version.php
Warning: File doesn't verify against checksum: wp-admin/index.php
Error: WordPress installation doesn't verify against checksums.
```

**JSON format (if parseable):**
```json
[
  {"file": "wp-includes/version.php", "message": "File doesn't verify against checksum"},
  {"file": "wp-admin/index.php", "message": "File doesn't verify against checksum"}
]
```

**Action:** Generate Critical finding for each modified file.

**Finding ID Generation:**
```bash
# Generate deterministic ID based on file path
generate_finding_id() {
  local filepath="$1"
  local hash=$(echo -n "$filepath" | md5sum | cut -c1-3)
  echo "SECR-CHECKSUMS-${hash}"
}
```

**Per-File Finding:**
```json
{
  "id": "SECR-CHECKSUMS-{hash}",
  "severity": "Critical",
  "category": "Security",
  "title": "Modified core file: {filename}",
  "summary": "WordPress core file has been modified and no longer matches the official version",
  "detail": "File {filepath} failed checksum verification. This could indicate: (1) Manual modification, (2) Plugin/theme incorrectly editing core files, (3) Malware injection, (4) Failed WordPress update. Official WordPress core files should never be modified.",
  "location": "{filepath}",
  "fix": "Run `wp core download --force --skip-content` to restore all core files while preserving wp-content/ and wp-config.php. Alternatively, manually download {filename} from WordPress.org and replace the modified version. After restoration, investigate why the file was modified to prevent recurrence."
}
```

### Outcome C: WP-CLI Error or Connection Failure

**Indicators:**
- Exit code: Non-zero
- SSH error messages (connection refused, timeout, authentication failure)
- WP-CLI error messages (command not found, not a WordPress installation)

**Common Errors:**

**1. WP-CLI not found:**
```
bash: /path/to/wp: No such file or directory
```
**OR**
```
bash: wp: command not found
```

**Action:** Generate Warning finding about missing WP-CLI.

**Finding:**
```json
{
  "id": "SECR-CHECKSUMS-NOCLI",
  "severity": "Warning",
  "category": "Configuration",
  "title": "WP-CLI not available for checksum verification",
  "summary": "Cannot verify core file integrity because WP-CLI is not installed or not found at expected path",
  "detail": "Attempted to run WP-CLI at {WP_CLI_PATH} but command was not found. Core file integrity verification requires WP-CLI to be installed on the server.",
  "location": "Server: {HOST}",
  "fix": "Install WP-CLI by running: `curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && sudo mv wp-cli.phar /usr/local/bin/wp`. Then update the site profile in sites.json with the correct wp_cli_path."
}
```

**2. Connection failure:**
```
ssh: connect to host {HOST} port 22: Connection refused
```
**OR**
```
ssh: connect to host {HOST} port 22: Operation timed out
```

**Action:** Generate Warning finding about connectivity issue.

**Finding:**
```json
{
  "id": "SECR-CHECKSUMS-NOCONN",
  "severity": "Warning",
  "category": "Configuration",
  "title": "Cannot connect to server for checksum verification",
  "summary": "SSH connection to server failed, preventing core file integrity check",
  "detail": "SSH connection to {USER}@{HOST} failed with error: {error_message}. This may indicate network issues, firewall blocking, or SSH service not running.",
  "location": "Server: {HOST}",
  "fix": "Verify SSH connectivity manually: `ssh {USER}@{HOST} 'echo connected'`. Check firewall rules, ensure SSH service is running, and verify the hostname/IP address is correct in sites.json."
}
```

**3. Not a WordPress installation:**
```
Error: This does not seem to be a WordPress installation.
```

**Action:** Generate Warning finding about incorrect path.

**Finding:**
```json
{
  "id": "SECR-CHECKSUMS-NOWP",
  "severity": "Warning",
  "category": "Configuration",
  "title": "WordPress installation not found at configured path",
  "summary": "WP-CLI cannot locate WordPress installation at the configured path",
  "detail": "Attempted to run WP-CLI at {WP_PATH} but no WordPress installation was detected. The wp_path in sites.json may be incorrect or the WordPress installation may have been moved.",
  "location": "Path: {WP_PATH} on {HOST}",
  "fix": "Verify WordPress installation path on the server. Update sites.json with the correct wp_path. You can search for WordPress by running: `ssh {USER}@{HOST} 'find /var/www /home -name wp-config.php 2>/dev/null'`"
}
```

## Common Files to Exclude (Optional)

Some files are commonly modified by hosting providers and can be safely excluded:

```bash
# Exclude commonly modified files
wp core verify-checksums --exclude="readme.html,license.txt"
```

**Files often modified by hosts:**
- `readme.html` - Sometimes removed or customized
- `license.txt` - Sometimes removed
- `wp-config-sample.php` - Sometimes removed

**Note:** For maximum security, do NOT exclude files by default. Only exclude if specific host modifications are known and verified.

## Output Format

Return a JSON array of findings. If no issues found, return array with single Info finding. If errors occur, return Warning findings.

**Example output (all verified):**
```json
[
  {
    "id": "SECR-CHECKSUMS-OK",
    "severity": "Info",
    "category": "Security",
    "title": "WordPress core files verified",
    "summary": "All WordPress core files match official checksums from WordPress.org",
    "detail": "WP-CLI checksum verification completed successfully. No modified or suspicious core files detected.",
    "location": "WordPress core installation",
    "fix": "No action required. Core files are intact."
  }
]
```

**Example output (modified files detected):**
```json
[
  {
    "id": "SECR-CHECKSUMS-a3f",
    "severity": "Critical",
    "category": "Security",
    "title": "Modified core file: wp-includes/version.php",
    "summary": "WordPress core file has been modified and no longer matches the official version",
    "detail": "File wp-includes/version.php failed checksum verification. This could indicate: (1) Manual modification, (2) Plugin/theme incorrectly editing core files, (3) Malware injection, (4) Failed WordPress update. Official WordPress core files should never be modified.",
    "location": "wp-includes/version.php",
    "fix": "Run `wp core download --force --skip-content` to restore all core files while preserving wp-content/ and wp-config.php. Alternatively, manually download version.php from WordPress.org and replace the modified version. After restoration, investigate why the file was modified to prevent recurrence."
  },
  {
    "id": "SECR-CHECKSUMS-b72",
    "severity": "Critical",
    "category": "Security",
    "title": "Modified core file: wp-admin/index.php",
    "summary": "WordPress core file has been modified and no longer matches the official version",
    "detail": "File wp-admin/index.php failed checksum verification. This could indicate: (1) Manual modification, (2) Plugin/theme incorrectly editing core files, (3) Malware injection, (4) Failed WordPress update. Official WordPress core files should never be modified.",
    "location": "wp-admin/index.php",
    "fix": "Run `wp core download --force --skip-content` to restore all core files while preserving wp-content/ and wp-config.php. Alternatively, manually download index.php from WordPress.org and replace the modified version. After restoration, investigate why the file was modified to prevent recurrence."
  }
]
```

## Notes

- Always use SSH BatchMode to prevent interactive prompts
- Use ConnectTimeout to avoid hanging on unreachable hosts
- Parse both JSON and plain text output formats (WP-CLI behavior varies)
- Generate deterministic finding IDs for consistent tracking across scans
- Distinguish between security issues (modified files) and configuration issues (WP-CLI/connection problems)
