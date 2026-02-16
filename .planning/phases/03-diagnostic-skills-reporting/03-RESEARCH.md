# Phase 3: Diagnostic Skills & Reporting - Research

**Researched:** 2026-02-16
**Domain:** WordPress security diagnostics, WP-CLI automation, malware detection, code quality analysis
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Vulnerability Data Sources

**Decision:** WP-CLI + WordPress.org data only. No external API keys required.

- Use `wp core verify-checksums` over SSH for core file integrity (SECR-01)
- Use `wp plugin list --update=available` and `wp theme list --update=available` for outdated checks (SECR-02)
- Check plugin/theme update status against wordpress.org — no WPScan API, no API keys
- Rationale: Zero setup, no credentials to manage, sufficient for v1 diagnostics

### Malware & Suspicious Code Scanning

**Decision:** Pattern scan as a separate finding category, distinct from core integrity.

- Core integrity: WP-CLI verify-checksums (clean/modified/unknown)
- Suspicious code: Grep synced files for common malicious patterns:
  - `base64_decode` chains, `eval()` with variable input, obfuscated variable names
  - Backdoor signatures (e.g., `FilesMan`, `WSO`, `c99shell` references)
  - Suspicious file placements (PHP in uploads/, unexpected files in wp-includes/)
- Report as separate "Suspicious Code" category, not mixed with core integrity findings
- Each pattern match gets its own finding with file:line reference

### wp-config.php Security Stance

**Decision:** Flag critical issues only. Skip debatable recommendations.

**Flag these (Critical/Warning):**
- `WP_DEBUG` set to `true` in production
- Default/empty authentication salts
- `$table_prefix` = `wp_` (Info only)
- Database credentials visible in version control (if detectable)
- `define('DISALLOW_FILE_EDIT', false)` or absent (should be true in production)

**Skip these (too debatable for v1):**
- Table prefix recommendations on existing sites
- Specific PHP memory limit values
- Obscure wp-config hardening that varies by hosting environment

### User Account Auditing

**Decision:** Standard checks only.

- Check for default `admin` username (Critical)
- Count users with `administrator` role — flag if excessive (Warning threshold: >3 admins)
- Detect inactive privileged users if last login data is available via WP-CLI user meta
- Do NOT include: email domain analysis, capability overrides, subscriber ratios

### AI Code Analysis Scope

**Decision:** Active theme + custom plugins only. WP.org plugins get version check only.

**Target Selection:**
- Scan the active theme (detected via `wp option get template`)
- Scan plugins NOT from wordpress.org
- Simple heuristic: if plugin has a readme.txt with "Stable tag" and matches a wordpress.org slug, treat as WP.org plugin — version check only
- WP.org plugins: only check if up to date, no source code analysis

**Analysis Depth — Tiered Approach:**
1. **Quick pattern scan** (all targeted files): Grep for known anti-patterns
2. **Deep contextual analysis** (flagged files only): AI reads the file in context

**Output:**
- Include fix snippets alongside each finding
- Show problematic code AND suggested replacement
- Reference file:line for every finding

### Report Structure

**Decision:** Executive summary + detailed category sections.
- 3-level severity: Critical / Warning / Info
- Letter grade health score (A-F)
- One sentence non-technical summaries per finding

### Finding Storage

**Decision:** Latest + archive in `memory/{site-name}/`.
- Deterministic finding IDs: `{CATEGORY}-{CHECK}-{NNN}`
- Status command shows inline summary

### Deferred Ideas (OUT OF SCOPE)

None captured during discussion.
</user_constraints>

## Summary

This phase implements comprehensive WordPress security and code quality diagnostics using WP-CLI commands executed over SSH, pattern-based malware scanning, and AI-powered code analysis. The implementation leverages standard tooling (WP-CLI, grep, bash) with no external API dependencies, focusing on actionable findings presented in structured markdown reports with letter-grade health scores.

The technical approach combines deterministic scanning (WP-CLI checksums, version checks) with pattern matching (malware signatures, deprecated functions) and contextual AI analysis (custom code review). Each finding is tracked with a stable ID based on category + check + location hash, enabling historical comparison across scans.

**Primary recommendation:** Build skill modules for each diagnostic category (core-integrity, version-audit, user-audit, config-security, malware-scan, code-quality) that return structured findings. Combine findings in a report-generator skill that computes health scores and formats markdown reports with executive summaries.

## Standard Stack

### Core Tools

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| WP-CLI | 2.x+ | WordPress automation | Official WordPress command-line tool, runs over SSH |
| Bash | 4.0+ | Command execution, SSH orchestration | Universal shell, available on all Unix systems |
| grep/egrep | GNU | Pattern matching in synced files | Standard text processing, fast regex search |
| jq | 1.6+ | JSON parsing from WP-CLI output | De facto standard for JSON in shell scripts |

### WP-CLI Commands

| Command | Purpose | Output Format |
|---------|---------|---------------|
| `wp core verify-checksums` | Core file integrity check | Plain text (Success/Warning) or JSON |
| `wp plugin list --format=json` | Plugin inventory with versions | JSON array of objects |
| `wp theme list --format=json` | Theme inventory with versions | JSON array of objects |
| `wp user list --role=administrator --format=json` | Admin user audit | JSON array of user objects |
| `wp option get template` | Active theme slug | Plain text |
| `wp option get stylesheet` | Active theme directory | Plain text |
| `wp user meta list <user_id>` | User metadata (last login, etc.) | Table or JSON |

### WordPress.org API

| Endpoint | Purpose | Authentication |
|----------|---------|----------------|
| `https://api.wordpress.org/plugins/info/1.2/` | Plugin version/update info | None required |
| `https://api.wordpress.org/themes/info/1.2/` | Theme version/update info | None required |

**Action:** `plugin_information` or `theme_information`
**Parameters:** `request[slug]=plugin-name`
**Response:** JSON object with version, last_updated, requires, tested, download_link

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| md5sum / shasum | System default | File hashing for deterministic IDs | Generate stable finding IDs from file:line |
| ssh | OpenSSH 7.0+ | Remote command execution | All WP-CLI commands run over SSH |

**Installation:**
```bash
# WP-CLI (if not on remote server)
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar
sudo mv wp-cli.phar /usr/local/bin/wp

# jq (for JSON parsing)
brew install jq  # macOS
apt-get install jq  # Debian/Ubuntu
```

## Architecture Patterns

### Recommended Project Structure

```
skills/
├── diagnostic-core-integrity/     # SKILL.md - WP-CLI verify-checksums
├── diagnostic-version-audit/      # SKILL.md - Plugin/theme/PHP version checks
├── diagnostic-user-audit/         # SKILL.md - User account security
├── diagnostic-config-security/    # SKILL.md - wp-config.php analysis
├── diagnostic-malware-scan/       # SKILL.md - Pattern-based detection
├── diagnostic-code-quality/       # SKILL.md - AI-powered analysis
└── report-generator/              # SKILL.md - Compile findings into report

memory/
  {site-name}/
    latest.md                      # Most recent scan report
    archive/
      scan-2026-02-16.md          # Timestamped historical scans
```

### Pattern 1: Skill-Based Diagnostic Modules

**What:** Each diagnostic category is implemented as a SKILL.md that runs checks and returns structured findings.

**When to use:** Modular design allows skills to be run independently or combined. Individual skills can be tested/debugged in isolation.

**Example:**
```markdown
# SKILL: Diagnostic - Core Integrity

You check WordPress core file integrity using WP-CLI checksums.

## How it works

1. Run `wp core verify-checksums --format=json` over SSH
2. Parse JSON output (if available) or text warnings
3. Return structured findings for each modified file

## Output format

Return JSON array of findings:
```json
[
  {
    "id": "SECR-CHECKSUMS-001",
    "severity": "Critical",
    "category": "Security",
    "title": "Modified core file detected",
    "summary": "WordPress core file has been modified and may be compromised",
    "detail": "File wp-includes/version.php doesn't verify against checksum",
    "location": "wp-includes/version.php",
    "fix": "Restore original file from WordPress.org or reinstall WordPress core"
  }
]
```

## Error handling

If WP-CLI fails, return Warning finding with connection error details.
```

Source: Pattern derived from CoWork plugin architecture and modular diagnostic design

### Pattern 2: Deterministic Finding IDs

**What:** Generate stable, reproducible IDs for findings based on category + check type + location hash.

**When to use:** Enables tracking the same issue across multiple scans, showing whether problems were fixed or persist.

**Example:**
```bash
# Generate deterministic ID for a finding
CATEGORY="SECR"
CHECK="CHECKSUMS"
LOCATION="wp-includes/version.php"

# Hash the location to get consistent number
HASH=$(echo -n "$LOCATION" | md5sum | head -c 3)
FINDING_ID="${CATEGORY}-${CHECK}-${HASH}"
# Result: SECR-CHECKSUMS-abc
```

Source: Derived from hashid patterns and UUID v5 deterministic generation

### Pattern 3: SSH + WP-CLI Execution

**What:** Execute WP-CLI commands on remote server via SSH, capturing JSON output for parsing.

**When to use:** All WordPress data retrieval. Avoids direct database access, leverages WordPress internals.

**Example:**
```bash
# Execute WP-CLI command over SSH with JSON output
ssh user@host "cd /path/to/wordpress && wp plugin list --format=json --update=available"

# Parse JSON response with jq
OUTDATED_PLUGINS=$(ssh user@host "cd /path/to/wordpress && wp plugin list --format=json --update=available" | jq -r '.[] | {name, version, update_version}')

# Handle multi-line commands with heredoc
ssh user@host bash << 'EOF'
cd /path/to/wordpress
wp core verify-checksums --format=json
wp plugin list --format=json
wp theme list --format=json
EOF
```

Source: [WP-CLI Running Commands Remotely](https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/)

### Pattern 4: Tiered Code Analysis

**What:** Two-pass analysis - quick pattern scan first, deep AI analysis only on flagged files.

**When to use:** Balances thoroughness with performance. Grep is fast for known patterns; AI provides contextual understanding for complex issues.

**Example:**
```bash
# Pass 1: Quick pattern scan with grep
grep -rn "eval\s*(" wp-content/themes/custom/ --include="*.php"
grep -rn "base64_decode" wp-content/plugins/custom-plugin/ --include="*.php"
grep -rn "\$_GET\|\$_POST\|\$_REQUEST" . --include="*.php" | grep -v "sanitize\|esc_"

# Pass 2: AI analysis of flagged files
# For each file with pattern matches:
# - Read full file content
# - Analyze in context of WordPress coding standards
# - Generate finding with code snippet + fix suggestion
```

Source: WordPress malware detection patterns and security best practices

### Pattern 5: Health Score Calculation

**What:** Weighted scoring algorithm that converts finding counts into letter grade (A-F).

**When to use:** Provides executive-level summary. Makes security posture immediately understandable.

**Example:**
```bash
# Count findings by severity
CRITICAL_COUNT=2
WARNING_COUNT=5
INFO_COUNT=8

# Calculate grade based on decision matrix
if [ $CRITICAL_COUNT -ge 4 ]; then
  GRADE="F"
elif [ $CRITICAL_COUNT -ge 2 ]; then
  GRADE="D"
elif [ $CRITICAL_COUNT -eq 1 ] || [ $WARNING_COUNT -ge 5 ]; then
  GRADE="C"
elif [ $CRITICAL_COUNT -eq 0 ] && [ $WARNING_COUNT -ge 3 ]; then
  GRADE="B"
elif [ $CRITICAL_COUNT -eq 0 ] && [ $WARNING_COUNT -le 2 ]; then
  GRADE="A"
else
  GRADE="C"  # Default
fi
```

Source: User-defined grading matrix from CONTEXT.md, Docker Scout health scores pattern

### Pattern 6: Report Archiving with Timestamp

**What:** Store latest report in `latest.md`, move previous to `archive/scan-{date}.md` before each new scan.

**When to use:** Maintains historical record without manual file management. Enables trend analysis.

**Example:**
```bash
SITE_NAME="example-com"
MEMORY_DIR="memory/${SITE_NAME}"
LATEST_PATH="${MEMORY_DIR}/latest.md"
ARCHIVE_DIR="${MEMORY_DIR}/archive"

# Before generating new report, archive the current latest
if [ -f "$LATEST_PATH" ]; then
  TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
  mkdir -p "$ARCHIVE_DIR"
  mv "$LATEST_PATH" "${ARCHIVE_DIR}/scan-${TIMESTAMP}.md"
fi

# Generate new report to latest.md
cat > "$LATEST_PATH" << 'EOF'
# WordPress Diagnostic Report
...
EOF
```

Source: Standard log rotation pattern, user requirements from CONTEXT.md

### Anti-Patterns to Avoid

- **Don't parse WP-CLI text output when JSON is available:** Use `--format=json` for reliable structured data, not fragile text parsing
- **Don't run AI analysis on all files:** Grep first, AI second. Running AI on every theme/plugin file is slow and wasteful
- **Don't generate random finding IDs:** Use deterministic IDs based on location/type so findings can be tracked across scans
- **Don't mix core integrity with malware findings:** User explicitly wants these as separate categories for clarity
- **Don't flag debatable wp-config settings:** Stick to critical issues only (WP_DEBUG, salts, DISALLOW_FILE_EDIT)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WordPress core integrity verification | Custom MD5 checksum downloader/comparator | `wp core verify-checksums` | WordPress.org maintains official checksums per version/locale, handles edge cases |
| Plugin/theme version checking | Scrape wordpress.org, parse HTML | `https://api.wordpress.org/plugins/info/1.2/` + WP-CLI | Official API, structured data, no auth required |
| SQL injection detection | Write SQL parser to detect unescaped queries | Grep for `\$wpdb->query\|mysql_query` without `prepare()` nearby | Pattern matching catches most cases, deep analysis is AI's job |
| WordPress deprecated function list | Maintain custom list of old functions | WordPress core's `/wp-includes/deprecated.php` + documented list | WordPress maintains this officially, updated per version |
| UUID generation | `Math.random()` or timestamp-based IDs | MD5/SHA hash of category+location | Deterministic IDs enable tracking, crypto hashes are stable |

**Key insight:** WordPress has mature tooling (WP-CLI) and official APIs. Don't reinvent what wp-cli/WordPress.org already provide reliably.

## Common Pitfalls

### Pitfall 1: Assuming WP-CLI is in PATH

**What goes wrong:** SSH command fails with "wp: command not found" even though WP-CLI is installed on server.

**Why it happens:** SSH non-interactive shells don't source `.bashrc` or profile, so PATH may not include WP-CLI location.

**How to avoid:** Use full path to wp binary or explicitly source profile:
```bash
# Option 1: Full path
ssh user@host "/usr/local/bin/wp --path=/var/www/html plugin list"

# Option 2: Source profile first
ssh user@host "source ~/.bashrc && wp --path=/var/www/html plugin list"
```

**Warning signs:** Commands work in interactive SSH session but fail when run via script.

### Pitfall 2: Not Specifying WordPress Path

**What goes wrong:** WP-CLI errors with "Error: This does not seem to be a WordPress installation."

**Why it happens:** SSH session CWD may not be WordPress root. WP-CLI needs to find `wp-config.php`.

**How to avoid:** Always use `--path` flag or `cd` to WordPress root first:
```bash
# Reliable: cd first
ssh user@host "cd /var/www/html && wp core verify-checksums"

# Alternative: use --path
ssh user@host "wp --path=/var/www/html core verify-checksums"
```

**Warning signs:** Error messages about missing WordPress installation.

### Pitfall 3: JSON Parsing Failures on Non-JSON Output

**What goes wrong:** `jq` fails with parse error when WP-CLI returns error message as text instead of JSON.

**Why it happens:** `--format=json` only applies to successful output. Errors are still plain text.

**How to avoid:** Check exit code before parsing, or handle jq errors gracefully:
```bash
OUTPUT=$(ssh user@host "wp plugin list --format=json" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "$OUTPUT" | jq '.[] | {name, version}'
else
  echo "Error: $OUTPUT"
fi
```

**Warning signs:** jq errors about invalid JSON when command fails.

### Pitfall 4: False Positives in base64_decode Detection

**What goes wrong:** Flagging legitimate uses of `base64_decode()` in themes/plugins as malware.

**Why it happens:** Base64 is used for legitimate purposes (email encoding, data URIs, image embedding).

**How to avoid:** Context matters. Flag patterns that combine suspicious elements:
```bash
# Too broad (many false positives)
grep -r "base64_decode" .

# Better: chain of suspicious patterns
grep -r "eval\s*(\s*base64_decode" .
grep -r "base64_decode.*base64_decode" .  # Double-encoding
grep -r "base64_decode.*\$_" .  # Decoding user input
```

**Warning signs:** Security findings in reputable WP.org plugins, high false positive rate in manual review.

### Pitfall 5: Missing wp-config.php When Checking Security

**What goes wrong:** Cannot analyze wp-config.php because rsync excluded it (sensitive file).

**Why it happens:** Earlier phases may have configured rsync to exclude wp-config.php for security.

**How to avoid:** Either:
- Run specific remote check: `ssh user@host "grep 'WP_DEBUG' /var/www/html/wp-config.php"`
- Sync wp-config.php to temporary location, analyze, delete immediately
- Skip wp-config analysis if file not available (graceful degradation)

**Warning signs:** Config security skill returns zero findings every time.

### Pitfall 6: Treating "Stable tag: trunk" as WordPress.org Plugin

**What goes wrong:** Plugin falsely identified as WP.org plugin because it has readme.txt, but it's actually custom.

**Why it happens:** Developers copy WP.org plugin boilerplate for custom plugins.

**How to avoid:** Verify plugin slug exists on WordPress.org API before treating as WP.org plugin:
```bash
SLUG="custom-plugin"
API_URL="https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${SLUG}"

# Check if plugin exists on WordPress.org
RESPONSE=$(curl -s "$API_URL")
if echo "$RESPONSE" | grep -q '"error"'; then
  # Not a WP.org plugin - run full code analysis
  echo "Custom plugin detected"
else
  # WP.org plugin - version check only
  echo "WP.org plugin detected"
fi
```

**Warning signs:** Custom plugins bypassing code analysis, WP.org plugins getting flagged for proprietary code.

### Pitfall 7: SSH Connection Pooling Issues

**What goes wrong:** Multiple sequential SSH commands are slow (2-3 seconds each for handshake).

**Why it happens:** Each SSH command establishes new connection, performs key exchange, authenticates.

**How to avoid:** Use SSH ControlMaster for connection reuse:
```bash
# Enable connection multiplexing
ssh -o ControlMaster=auto -o ControlPath=/tmp/ssh-%r@%h:%p -o ControlPersist=10m user@host "wp core version"

# Subsequent commands reuse connection (much faster)
ssh -o ControlPath=/tmp/ssh-%r@%h:%p user@host "wp plugin list"
ssh -o ControlPath=/tmp/ssh-%r@%h:%p user@host "wp theme list"
```

**Warning signs:** Diagnostic scans taking 30+ seconds when most commands are fast locally.

## Code Examples

Verified patterns from official sources:

### WP-CLI Core Checksums Verification

```bash
# Basic verification (text output)
wp core verify-checksums
# Success: WordPress installation verifies against checksums.
# OR
# Warning: File doesn't verify against checksum: wp-includes/version.php
# Error: WordPress installation doesn't verify against checksums.

# JSON output (parseable)
wp core verify-checksums --format=json
# Success case: (empty output, exit code 0)
# Modified files: [{"file":"wp-includes/version.php","message":"File doesn't verify against checksum"}]

# Exclude specific files
wp core verify-checksums --exclude="readme.html,license.txt"

# Check specific version
wp core verify-checksums --version=6.4.2
```

Source: [WP-CLI core verify-checksums](https://developer.wordpress.org/cli/commands/core/verify-checksums/)

### WP-CLI Plugin List with Updates

```bash
# List all plugins with update status (JSON)
wp plugin list --format=json

# Filter to only plugins with updates available
wp plugin list --update=available --format=json
# Returns: [{"name":"akismet","status":"inactive","update":"available","version":"4.2.1","update_version":"5.0"}]

# Get specific fields
wp plugin list --field=name --update=available
# Returns: akismet\nwordpress-seo\n

# Combine filters
wp plugin list --status=active --update=available --format=json
```

Source: [WP-CLI plugin list](https://developer.wordpress.org/cli/commands/plugin/list/)

### WordPress.org Plugin API Query

```bash
# Query plugin information from WordPress.org
SLUG="akismet"
curl -s "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${SLUG}" | jq '.'

# Response includes:
# {
#   "name": "Akismet Anti-Spam",
#   "slug": "akismet",
#   "version": "5.0",
#   "last_updated": "2023-12-15 3:30pm GMT",
#   "requires": "5.8",
#   "tested": "6.4.2",
#   "requires_php": "5.6.20",
#   "download_link": "https://downloads.wordpress.org/plugin/akismet.5.0.zip"
# }

# Check if plugin exists (error response if not found)
curl -s "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=nonexistent-plugin" | jq '.error'
# Returns: "Plugin not found."
```

Source: [WordPress.org API](https://codex.wordpress.org/WordPress.org_API) and [plugins_api()](https://developer.wordpress.org/reference/functions/plugins_api/)

### WP-CLI User Audit

```bash
# List all administrator users
wp user list --role=administrator --format=json
# Returns: [{"ID":1,"user_login":"admin","user_email":"admin@example.com","user_registered":"2020-01-01 00:00:00","roles":"administrator"}]

# Count administrators
wp user list --role=administrator --format=count
# Returns: 3

# Check for default 'admin' username
wp user list --field=user_login | grep -x "admin"
# Returns: admin (if exists, empty if not)

# Get user metadata (including last login if plugin tracks it)
wp user meta list 1 --format=json
# Returns: [{"meta_key":"last_login","meta_value":"1707984000"}]
```

Source: [WP-CLI user list](https://developer.wordpress.org/cli/commands/user/list/)

### Active Theme Detection

```bash
# Get active theme slug (parent theme)
wp option get template
# Returns: twentytwentyfour

# Get active theme directory (child theme if used, otherwise same as template)
wp option get stylesheet
# Returns: twentytwentyfour-child

# Get theme details
wp theme list --status=active --format=json
# Returns: [{"name":"Twenty Twenty-Four","status":"active","update":"none","version":"1.0"}]
```

Source: [WP-CLI option get](https://developer.wordpress.org/cli/commands/option/get/) and [Sal Ferrarello - WP CLI Get Current Theme](https://salferrarello.com/wp-cli-get-current-theme/)

### Malware Pattern Detection

```bash
# Detect eval with base64_decode (common obfuscation)
grep -rn "eval\s*(\s*base64_decode" wp-content/ --include="*.php"

# Detect common backdoor signatures
grep -rn -E "(FilesMan|WSOsetcookie|c99shell|r57shell|b374k)" wp-content/ --include="*.php"

# Detect suspicious function chains
grep -rn -E "(base64_decode.*base64_decode|gzinflate.*base64_decode)" wp-content/ --include="*.php"

# Detect PHP in uploads directory (shouldn't be there)
find wp-content/uploads -name "*.php" -type f

# Detect direct SQL queries without prepare
grep -rn '\$wpdb->query' wp-content/plugins/custom-plugin/ --include="*.php" | grep -v 'prepare'

# Comprehensive malware scan
find wp-content/ -type f -name "*.php" | xargs egrep -i "(mail|fsockopen|pfsockopen|stream_socket_client|exec|system|passthru|eval|base64_decode)\s*\(" | grep -v "wp-includes"
```

Source: [WordPress Malware Cleanup Guide 2026](https://www.fysalyaqoob.com/guides/wordpress-malware-cleanup-guide-2026) and [Multi-Vector WordPress Malware Protection 2026](https://vapvarun.com/multi-vector-wordpress-malware-protection/)

### WordPress Coding Standards - Security Patterns

```bash
# Detect unsanitized user input
grep -rn '\$_GET\|\$_POST\|\$_REQUEST' wp-content/themes/custom/ --include="*.php" | grep -v -E "(sanitize_|esc_|wp_verify_nonce)"

# Detect missing nonce verification on form handlers
grep -rn -A 5 '\$_POST\[' wp-content/plugins/custom-plugin/ --include="*.php" | grep -B 5 -v "wp_verify_nonce"

# Detect deprecated WordPress functions
grep -rn -E "(mysql_query|get_bloginfo\('url'\)|wp_specialchars)" wp-content/ --include="*.php"

# Detect direct file includes with user input
grep -rn -E "(include|require).*\$_(GET|POST|REQUEST)" wp-content/ --include="*.php"

# Detect extract() usage (discouraged due to variable collision)
grep -rn "extract\s*(" wp-content/ --include="*.php"
```

Source: [WordPress Security: Sanitize, Validate & Escape](https://worldwincoder.com/blog/wordpress-security-sanitize-validate-escape-data-guide/) and [Securely Developing Plugins](https://learn.wordpress.org/lesson/securely-developing-plugins/)

### $wpdb->prepare() SQL Injection Prevention

```php
// CORRECT: Using $wpdb->prepare() with placeholders
$user_id = 123;
$results = $wpdb->get_results(
    $wpdb->prepare(
        "SELECT * FROM {$wpdb->users} WHERE ID = %d",
        $user_id
    )
);

// CORRECT: Multiple placeholders
$post_title = "Hello World";
$post_status = "publish";
$results = $wpdb->get_results(
    $wpdb->prepare(
        "SELECT * FROM {$wpdb->posts} WHERE post_title = %s AND post_status = %s",
        $post_title,
        $post_status
    )
);

// WRONG: Direct variable interpolation (SQL injection risk)
$results = $wpdb->get_results("SELECT * FROM {$wpdb->users} WHERE ID = {$_GET['user_id']}");

// WRONG: Using prepare on query structure (double-preparing)
$where = $wpdb->prepare(" WHERE foo = %s", $_GET['data']);
$query = $wpdb->prepare("SELECT * FROM something {$where} LIMIT %d", 10);
```

Source: [Patchstack SQL Injection in WordPress](https://patchstack.com/articles/sql-injection/) and [wpdb Class Reference](https://developer.wordpress.org/reference/classes/wpdb/)

### wp-config.php Security Checks

```bash
# Check if WP_DEBUG is enabled (production issue)
ssh user@host "grep -E \"define\s*\(\s*'WP_DEBUG'\s*,\s*true\" /var/www/html/wp-config.php"
# If match found: CRITICAL finding

# Check for default salts
ssh user@host "grep 'put your unique phrase here' /var/www/html/wp-config.php"
# If match found: CRITICAL finding (using default salts)

# Check if DISALLOW_FILE_EDIT is set
ssh user@host "grep -E \"define\s*\(\s*'DISALLOW_FILE_EDIT'\s*,\s*true\" /var/www/html/wp-config.php"
# If NOT found: WARNING finding (file editor enabled)

# Check table prefix
ssh user@host "grep '\$table_prefix' /var/www/html/wp-config.php"
# If = 'wp_': INFO finding (default prefix, not critical but noted)
```

Source: [How to Harden WordPress With WP-Config](https://blog.sucuri.net/2023/07/tips-for-wp-config-how-to-avoid-sensitive-data-exposure.html) and [Secure Site with WP-Config](https://www.malcare.com/blog/secure-site-with-wp-config/)

### Deterministic Finding ID Generation

```bash
# Generate stable ID for a finding
generate_finding_id() {
  local category="$1"  # e.g., SECR, CODE, DIAG
  local check="$2"     # e.g., CHECKSUMS, SQLI, VERSION
  local location="$3"  # e.g., wp-includes/version.php:42

  # Hash location to get consistent short identifier
  local hash=$(echo -n "$location" | md5sum | cut -c1-3)

  # Combine into deterministic ID
  echo "${category}-${check}-${hash}"
}

# Usage
FINDING_ID=$(generate_finding_id "SECR" "CHECKSUMS" "wp-includes/version.php")
echo "$FINDING_ID"
# Output: SECR-CHECKSUMS-d0e

# Same location always produces same ID
FINDING_ID2=$(generate_finding_id "SECR" "CHECKSUMS" "wp-includes/version.php")
echo "$FINDING_ID2"
# Output: SECR-CHECKSUMS-d0e (identical)
```

Source: [hashid - Deterministic globally unique identifiers](https://github.com/goliatone/hashid/) and [Understanding How UUIDs Are Generated](https://digitalbunker.dev/understanding-how-uuids-are-generated/)

### Report Archive Management

```bash
# Archive latest report before generating new one
archive_latest_report() {
  local site_name="$1"
  local memory_dir="memory/${site_name}"
  local latest_path="${memory_dir}/latest.md"
  local archive_dir="${memory_dir}/archive"

  # Create memory directory if doesn't exist
  mkdir -p "$memory_dir"
  mkdir -p "$archive_dir"

  # If latest report exists, archive it
  if [ -f "$latest_path" ]; then
    local timestamp=$(date +%Y-%m-%d)
    local archive_path="${archive_dir}/scan-${timestamp}.md"

    # If same-day archive exists, add time
    if [ -f "$archive_path" ]; then
      timestamp=$(date +%Y-%m-%d-%H%M%S)
      archive_path="${archive_dir}/scan-${timestamp}.md"
    fi

    mv "$latest_path" "$archive_path"
    echo "Archived previous report to: $archive_path"
  fi
}

# Usage
archive_latest_report "example-com"
```

Source: Standard log rotation pattern

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WPScan API with API key | WP-CLI + WordPress.org API | Ongoing | Zero config, no rate limits, sufficient for v1 |
| Scan all plugins for code issues | Scan only custom plugins, version-check WP.org plugins | 2020s | Reduces false positives, focuses on real risk |
| Text parsing of WP-CLI output | JSON output format (`--format=json`) | WP-CLI 2.0+ | Reliable structured data, no regex fragility |
| PHP mysql_* functions | mysqli_* or PDO with prepared statements | PHP 7.0 (2015) | mysql_* removed from PHP, security improvement |
| Single monolithic scan script | Modular skills per diagnostic category | Modern CI/CD | Testable, maintainable, parallelizable |

**Deprecated/outdated:**
- **WPScan API:** Still exists but requires API key, rate limited. WP-CLI + WordPress.org API is sufficient for version checks without credentials.
- **"Stable tag: trunk" in readme.txt:** WordPress.org actively discourages this, prohibits for new plugins. Check actual version tags.
- **mysql_query() function:** Removed from PHP 7+. Presence in code is red flag for outdated/vulnerable code.
- **Direct $wpdb->query() without prepare():** Always use `$wpdb->prepare()` for user input. Direct queries are SQL injection risk.
- **Scanning wp-includes/ for malware:** Core files are verified via checksums. Focus malware scans on wp-content/ (themes, plugins, uploads).

## Open Questions

1. **Last login tracking availability**
   - What we know: WP-CLI can read user meta. Many security plugins track last login in user meta.
   - What's unclear: Is last login available in vanilla WordPress, or does it require a plugin?
   - Recommendation: Check for common meta keys (`last_login`, `wp_last_login`). If not found, skip inactive user detection gracefully. Document this limitation in findings.

2. **wp-config.php accessibility after rsync**
   - What we know: wp-config.php contains sensitive data (DB credentials). May be excluded from rsync for security.
   - What's unclear: Should we sync it temporarily, or run checks remotely over SSH only?
   - Recommendation: Start with remote checks via SSH (`grep` over SSH). If performance is poor, consider temporary sync with immediate deletion. Document decision in config-security skill.

3. **Performance of AI code analysis on large themes**
   - What we know: Grep is fast, AI analysis takes time (1-3 seconds per file read + analysis).
   - What's unclear: What's acceptable performance for v1? Should we limit AI analysis to X files max?
   - Recommendation: Start with "flagged files only" approach (grep first, AI second). If still slow, add limit of top 10 most suspicious files. Can expand in v2.

4. **Health grade calibration**
   - What we know: User defined grading matrix (A=no critical/≤2 warnings, F=4+ critical).
   - What's unclear: Does this produce useful grades in practice? Will most sites get C/D/F?
   - Recommendation: Start with defined matrix. After 5-10 real scans, review distribution. Adjust thresholds if needed (e.g., if 90% of sites are F, scale is too harsh).

5. **Finding ID collision risk**
   - What we know: MD5 hash of location, truncated to 3 chars, gives 4096 possibilities.
   - What's unclear: Is collision likely within single report (50-100 findings)?
   - Recommendation: Start with 3-char hash. If collision occurs, extend to 4 chars. Birthday paradox suggests low collision risk at this scale.

## Sources

### Primary (HIGH confidence)

- [WP-CLI core verify-checksums](https://developer.wordpress.org/cli/commands/core/verify-checksums/) - Command options, output format
- [WP-CLI plugin list](https://developer.wordpress.org/cli/commands/plugin/list/) - Available fields, JSON format
- [WP-CLI user list](https://developer.wordpress.org/cli/commands/user/list/) - Administrator role filtering
- [WP-CLI Running Commands Remotely](https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/) - SSH execution patterns
- [WordPress.org API Documentation](https://codex.wordpress.org/WordPress.org_API) - Plugin/theme info endpoints
- [plugins_api() Function Reference](https://developer.wordpress.org/reference/functions/plugins_api/) - Endpoint structure, parameters
- [wpdb Class Reference](https://developer.wordpress.org/reference/classes/wpdb/) - $wpdb->prepare() usage
- [WordPress Plugin Readmes](https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/) - Stable tag format

### Secondary (MEDIUM confidence)

- [WordPress Malware Cleanup Guide 2026](https://www.fysalyaqoob.com/guides/wordpress-malware-cleanup-guide-2026) - Current malware patterns, grep detection
- [Multi-Vector WordPress Malware Protection 2026](https://vapvarun.com/multi-vector-wordpress-malware-protection/) - 2026 threat landscape
- [Patchstack SQL Injection in WordPress](https://patchstack.com/articles/sql-injection/) - $wpdb->prepare() patterns
- [WordPress Security: Sanitize, Validate & Escape](https://worldwincoder.com/blog/wordpress-security-sanitize-validate-escape-data-guide/) - Security coding standards
- [How to Harden WordPress With WP-Config](https://blog.sucuri.net/2023/07/tips-for-wp-config-how-to-avoid-sensitive-data-exposure.html) - wp-config security checks
- [Secure Site with WP-Config](https://www.malcare.com/blog/secure-site-with-wp-config/) - DISALLOW_FILE_EDIT, salts
- [Securely Developing Plugins](https://learn.wordpress.org/lesson/securely-developing-plugins/) - Nonce verification, sanitization
- [Docker Scout Health Scores](https://docs.docker.com/scout/policy/scores/) - Weighted severity grading pattern
- [hashid - Deterministic globally unique identifiers](https://github.com/goliatone/hashid/) - UUID generation patterns

### Tertiary (LOW confidence - needs validation)

- WSO/FilesMan/c99shell detection patterns - sourced from web search, should be tested against real malware samples
- Last login meta key names - varies by plugin, needs empirical testing
- MD5 hash collision probability at 3 chars - mathematical calculation, not empirically verified for this use case

## Metadata

**Confidence breakdown:**
- **WP-CLI commands:** HIGH - Official WordPress documentation, tested commands
- **WordPress.org API:** HIGH - Official API, documented endpoints, no auth required
- **Malware patterns:** MEDIUM - Community knowledge from 2026 sources, should test on known samples
- **Health grading algorithm:** MEDIUM - User-defined matrix, needs real-world calibration
- **Performance estimates:** LOW - Based on assumptions, needs benchmarking with real sites

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (30 days - stable domain, WP-CLI/WordPress.org APIs are mature)

**Notes:**
- WP-CLI 2.x is stable and mature, unlikely to have breaking changes
- WordPress.org API structure is well-established, changes are rare
- Malware patterns evolve quickly - validate detection rules against current samples
- Performance characteristics need empirical testing with real WordPress installations
