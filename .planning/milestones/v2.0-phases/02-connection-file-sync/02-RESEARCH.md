# Phase 2: Connection & File Sync - Research

**Researched:** 2026-02-16
**Domain:** SSH connectivity, rsync file synchronization, WP-CLI detection, site profile management
**Confidence:** HIGH

## Summary

Phase 2 establishes the foundational infrastructure for connecting to remote WordPress sites via SSH, intelligently syncing files, and detecting WP-CLI availability. The implementation leverages standard Unix tools (SSH, rsync, jq) with bash scripting to create a conversational connection flow, automatic site profile persistence, and safe incremental file synchronization.

The research confirms that all locked decisions from CONTEXT.md are achievable with standard tooling. SSH connection diagnostics can parse error codes to provide specific failure reasons. SSH config file parsing enables alias resolution with simple grep/awk patterns. rsync provides all needed features for intelligent exclusions, size estimation, and permission normalization. WP-CLI detection follows established patterns, and jq handles atomic JSON updates for site profiles.

**Primary recommendation:** Use vanilla SSH/rsync with BatchMode for connection testing, jq for sites.json management, and incremental rsync with --dry-run for safe file sync. Avoid custom authentication or file sync implementations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Connection flow:**
- Conversational style: Claude asks for SSH details one at a time
- SSH verification: verify connectivity on first connection, skip verification for saved profiles
- Connection failure: Claude diagnoses the SSH error and suggests specific fixes
- SSH config aliases: Parse ~/.ssh/config to resolve aliases, show matched config details to user
- WordPress path: Auto-detect by searching for wp-config.php in common paths, only ask user if not found
- WordPress validation: Always verify the remote path is a WordPress installation
- Auto-sync: Connection + file sync as one seamless flow
- Auto-save: Automatically save every successful connection to sites.json without asking

**Site profiles:**
- Naming: Auto-generate profile name from the domain, but user can rename
- Default site: User explicitly marks one site as default
- Environment label: Optional field (production, staging, development)
- Profile stores: SSH connection details + last sync timestamp + WordPress version + site URL + description/notes

**File sync behavior:**
- Local storage: Default to .sites/{site-name}/ within plugin working directory, but allow per-site path override in profile
- Default exclusions: wp-content/uploads/, cache directories, node_modules/, vendor/
- Log files: NOT excluded by default (useful for diagnostics)
- Size check: Check remote size before syncing, warn if over threshold
- Incremental sync: Default to incremental, offer full re-sync option when user requests it

**WP-CLI detection:**
- Missing WP-CLI: Offer to install it on the remote server if not found
- Detection strategy: Run 'which wp' first, then check common paths
- Version check: Run 'wp --version' and warn if outdated
- Auto-gather: When WP-CLI is available, automatically run wp core version, wp plugin list, wp theme list on connect

### Claude's Discretion

- Exact size threshold for sync warnings (research recommends 500MB-1GB)
- SSH config parsing implementation details (simple grep/awk sufficient)
- WP-CLI installation method (curl download recommended for compatibility)
- Progress output format during sync (rsync --info=progress2 recommended)
- How much detail to show during auto-gather (summary format preferred)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core Tools

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| **ssh** | OpenSSH 7.4+ | Remote connection, command execution | Universal on Unix/macOS, key-based auth standard |
| **rsync** | 3.1.0+ | File synchronization | Incremental sync, excludes, built-in on most systems |
| **jq** | 1.6+ | JSON manipulation for sites.json | Industry standard for shell JSON, atomic updates |
| **bash** | 4.0+ | Scripting, workflow orchestration | Native to Unix/macOS, Claude's Bash tool |
| **WP-CLI** | 2.10+ | WordPress management over SSH | Official WordPress tool for CLI operations |

### Supporting Tools

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| **awk/grep** | Standard | SSH config parsing, text processing | Config file extraction, pattern matching |
| **du** | Standard | Remote directory size estimation | Pre-sync size checks |
| **find** | Standard | WordPress installation detection | Searching for wp-config.php |

### Installation Check

**Most tools are pre-installed on macOS/Linux:**
```bash
# Verify availability
which ssh rsync jq bash awk grep du find

# Install jq if missing (macOS)
brew install jq

# Install jq if missing (Linux)
sudo apt-get install jq    # Debian/Ubuntu
sudo yum install jq        # RHEL/CentOS
```

**WP-CLI installation (on remote servers):**
```bash
# Standard installation method
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar
sudo mv wp-cli.phar /usr/local/bin/wp
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rsync | scp / tar over ssh | No incremental sync, no exclude patterns, slower |
| jq | python/node script | Adds dependency, slower startup, overkill for simple operations |
| SSH key auth | Password auth | Less secure, requires interactive input, not automatable |
| OpenSSH | Paramiko (Python) | Adds runtime dependency, unnecessary for shell operations |

## Architecture Patterns

### Recommended Workflow Structure

```
Connection Flow:
1. Gather SSH details (conversational, one at a time)
2. Parse ~/.ssh/config if alias provided
3. Test SSH connection (BatchMode, ConnectTimeout)
4. Detect WordPress installation path
5. Validate WordPress directory structure
6. Detect WP-CLI availability and version
7. Run size estimation (du over SSH)
8. Execute rsync with exclusions
9. Save profile to sites.json (atomic update with jq)
10. Run WP-CLI auto-gather commands
```

### Pattern 1: SSH Connection Testing

**What:** Non-interactive SSH connection test with timeout and error diagnosis.

**When to use:** Before any file operations, to verify connectivity and diagnose issues early.

**Example:**
```bash
# Test connection with BatchMode (no password prompts) and timeout
# Source: https://www.cyberciti.biz/faq/how-to-check-for-ssh-connectivity-in-a-shell-script/
ssh -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    user@host "echo 'Connection successful'" 2>&1

# Check exit status
EXIT_CODE=$?

# Diagnose failures
# Source: https://docs.digitalocean.com/support/how-to-troubleshoot-ssh-authentication-issues/
case $EXIT_CODE in
    0)   echo "Connection successful" ;;
    255) echo "Connection failed - check hostname, network, or firewall" ;;
    *)   echo "Authentication failed - check SSH key or permissions" ;;
esac
```

**Key options:**
- `BatchMode=yes` - Disables password/passphrase prompts
- `ConnectTimeout=10` - Prevents hanging on unreachable hosts
- `StrictHostKeyChecking=accept-new` - Adds new hosts automatically without prompt

### Pattern 2: SSH Config Parsing

**What:** Extract connection details from ~/.ssh/config when user provides an alias.

**When to use:** When user provides a hostname that might be an SSH config alias.

**Example:**
```bash
# Simple SSH config parser
# Source: https://jm.technology/post/ssh_config_host_quick_feb_2024/

# Extract all host aliases
cat ~/.ssh/config | grep "^Host " | cut -d " " -f 2

# Get details for specific host
ssh -G hostname_or_alias

# Manual parsing for specific fields
HOST_ALIAS="production"
HOST=$(grep -A 10 "^Host $HOST_ALIAS$" ~/.ssh/config | grep "HostName" | awk '{print $2}')
USER=$(grep -A 10 "^Host $HOST_ALIAS$" ~/.ssh/config | grep "User" | awk '{print $2}')
PORT=$(grep -A 10 "^Host $HOST_ALIAS$" ~/.ssh/config | grep "Port" | awk '{print $2}')

# Recommended: Use ssh -G for canonical values
ssh -G production | grep "^hostname " | awk '{print $2}'
```

**Best practice:** Use `ssh -G` to get parsed config values rather than manual parsing, as it handles includes and wildcards correctly.

### Pattern 3: WordPress Installation Detection

**What:** Locate WordPress installation by searching for wp-config.php in common paths.

**When to use:** When user doesn't provide WordPress path, or to verify provided path.

**Example:**
```bash
# Common WordPress paths to check
# Source: https://developer.wordpress.org/cli/commands/core/is-installed/
COMMON_PATHS=(
    "/var/www/html"
    "/home/user/public_html"
    "/usr/share/nginx/html"
    "/srv/www"
    "~/www"
    "~/public_html"
)

# Search for wp-config.php via SSH
for path in "${COMMON_PATHS[@]}"; do
    if ssh user@host "test -f $path/wp-config.php"; then
        echo "Found WordPress at: $path"
        WP_PATH="$path"
        break
    fi
done

# Validate WordPress installation
# Check for required files/directories
ssh user@host "test -f $WP_PATH/wp-config.php && \
               test -d $WP_PATH/wp-content && \
               test -d $WP_PATH/wp-includes && \
               test -f $WP_PATH/wp-load.php"

if [ $? -eq 0 ]; then
    echo "Valid WordPress installation confirmed"
else
    echo "Path exists but doesn't appear to be a complete WordPress installation"
fi
```

### Pattern 4: Size Estimation Before Sync

**What:** Check remote directory size before syncing to warn about large transfers.

**When to use:** Before every sync operation, to prevent unexpected large transfers.

**Example:**
```bash
# Get remote size estimate
# Source: https://kristau.net/blog/20/
# Source: https://linuxhint.com/measure-and-show-progress-of-a-rsync-copy-linux/

# Option 1: du command (faster, less accurate)
REMOTE_SIZE=$(ssh user@host "du -sb /path/to/wordpress | cut -f1")
REMOTE_SIZE_MB=$((REMOTE_SIZE / 1024 / 1024))

echo "Remote site size: ${REMOTE_SIZE_MB}MB"

# Warn if over threshold (Claude's discretion: recommend 500MB)
if [ $REMOTE_SIZE_MB -gt 500 ]; then
    echo "WARNING: Remote site is ${REMOTE_SIZE_MB}MB. Continue? (y/n)"
fi

# Option 2: rsync dry-run with stats (more accurate, shows only what will transfer)
rsync -avz --dry-run --stats \
    --exclude='wp-content/uploads/' \
    --exclude='wp-content/cache/' \
    user@host:/path/to/wordpress/ ./local/ | grep "Total transferred file size"
```

**Recommendation:** Use `du` for initial check (fast), then rsync `--dry-run` to show actual transfer size with exclusions applied.

### Pattern 5: Intelligent rsync with Exclusions

**What:** Incremental file sync with WordPress-specific exclusions and permission normalization.

**When to use:** For every file sync operation.

**Example:**
```bash
# WordPress-optimized rsync command
# Sources:
# - https://linuxize.com/post/how-to-exclude-files-and-directories-with-rsync/
# - https://man7.org/linux/man-pages/man1/rsync.1.html
# - https://guides.wp-bullet.com/favorite-rsync-commands-for-copying-wordpress-sites/

rsync -avz \
    --info=progress2 \
    --exclude='wp-content/uploads/' \
    --exclude='wp-content/cache/' \
    --exclude='wp-content/w3tc-cache/' \
    --exclude='node_modules/' \
    --exclude='vendor/' \
    --exclude='.git/' \
    --exclude='.env' \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    user@host:/path/to/wordpress/ \
    .sites/site-name/

# Flag explanations:
# -a: archive mode (preserves permissions, timestamps, symlinks)
# -v: verbose output
# -z: compress during transfer
# --info=progress2: show overall progress, not per-file
# --chmod: normalize permissions (dirs: 755, files: 644)
# --exclude: skip large/unnecessary directories
# Trailing slash on source: sync contents, not directory itself
```

**Critical: Trailing slash behavior**
```bash
# WITH trailing slash: syncs CONTENTS into destination
rsync source/ dest/     # Results in: dest/file1, dest/file2

# WITHOUT trailing slash: syncs DIRECTORY into destination
rsync source dest/      # Results in: dest/source/file1, dest/source/file2
```

### Pattern 6: Atomic JSON Updates with jq

**What:** Update sites.json without corrupting existing data, even if interrupted.

**When to use:** When saving or updating site profiles.

**Example:**
```bash
# Atomic JSON update with jq
# Source: https://oneuptime.com/blog/post/2026-01-24-bash-json-parsing-jq/view
# Source: https://gist.github.com/ardiesaeidi/589156cda53189ca46ae6064e505de96

SITES_JSON="data/sites.json"
TEMP_JSON="$(mktemp)"

# Add or update site profile
jq --arg name "example-com" \
   --arg host "example.com" \
   --arg user "wpuser" \
   --arg path "/var/www/html" \
   --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.sites[$name] = {
       "host": $host,
       "user": $user,
       "remote_path": $path,
       "last_sync": $timestamp
   }' "$SITES_JSON" > "$TEMP_JSON"

# Atomic replacement (mv is atomic on same filesystem)
mv "$TEMP_JSON" "$SITES_JSON"

# Merge operator for updating specific fields
jq --arg name "example-com" \
   --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.sites[$name].last_sync = $timestamp' "$SITES_JSON" > "$TEMP_JSON" && \
   mv "$TEMP_JSON" "$SITES_JSON"
```

### Pattern 7: WP-CLI Detection and Version Check

**What:** Find WP-CLI on remote server, check version, offer installation if missing.

**When to use:** During initial connection and profile creation.

**Example:**
```bash
# WP-CLI detection strategy
# Source: https://make.wordpress.org/cli/
# Source: https://github.com/wp-cli/wp-cli/releases

# Strategy 1: Check if 'wp' is in PATH
if ssh user@host "which wp" &>/dev/null; then
    WP_CLI_PATH=$(ssh user@host "which wp")
    echo "WP-CLI found at: $WP_CLI_PATH"
else
    # Strategy 2: Check common paths
    COMMON_PATHS=("/usr/local/bin/wp" "$HOME/bin/wp" "$HOME/.local/bin/wp")

    for path in "${COMMON_PATHS[@]}"; do
        if ssh user@host "test -x $path"; then
            WP_CLI_PATH="$path"
            echo "WP-CLI found at: $WP_CLI_PATH"
            break
        fi
    done
fi

# If found, check version
if [ -n "$WP_CLI_PATH" ]; then
    WP_CLI_VERSION=$(ssh user@host "$WP_CLI_PATH --version" | grep -oP '\d+\.\d+\.\d+')
    echo "WP-CLI version: $WP_CLI_VERSION"

    # Warn if outdated (< 2.10)
    MAJOR=$(echo "$WP_CLI_VERSION" | cut -d. -f1)
    MINOR=$(echo "$WP_CLI_VERSION" | cut -d. -f2)

    if [ "$MAJOR" -lt 2 ] || [ "$MAJOR" -eq 2 -a "$MINOR" -lt 10 ]; then
        echo "WARNING: WP-CLI version $WP_CLI_VERSION is outdated. Recommend 2.10 or higher."
    fi
else
    echo "WP-CLI not found. Offer installation:"
    echo "curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar"
    echo "chmod +x wp-cli.phar"
    echo "sudo mv wp-cli.phar /usr/local/bin/wp"
fi
```

### Pattern 8: WP-CLI Auto-Gather

**What:** Automatically collect WordPress metadata when WP-CLI is available.

**When to use:** After successful connection and sync, before saving profile.

**Example:**
```bash
# Auto-gather WordPress information
# Source: https://developer.wordpress.org/cli/commands/

# Get WordPress version
WP_VERSION=$(ssh user@host "cd /path/to/wordpress && wp core version --allow-root")

# Get site URL
SITE_URL=$(ssh user@host "cd /path/to/wordpress && wp option get siteurl --allow-root")

# Get plugin list (summary format)
PLUGIN_COUNT=$(ssh user@host "cd /path/to/wordpress && wp plugin list --format=count --allow-root")

# Get theme list (summary format)
ACTIVE_THEME=$(ssh user@host "cd /path/to/wordpress && wp theme list --status=active --field=name --allow-root")

# Store in profile
echo "WordPress $WP_VERSION at $SITE_URL"
echo "Plugins: $PLUGIN_COUNT"
echo "Active theme: $ACTIVE_THEME"

# Add to sites.json
jq --arg name "example-com" \
   --arg wp_version "$WP_VERSION" \
   --arg site_url "$SITE_URL" \
   --arg plugin_count "$PLUGIN_COUNT" \
   --arg active_theme "$ACTIVE_THEME" \
   '.sites[$name] += {
       "wordpress_version": $wp_version,
       "site_url": $site_url,
       "plugin_count": $plugin_count,
       "active_theme": $active_theme
   }' data/sites.json > /tmp/sites.json.tmp && mv /tmp/sites.json.tmp data/sites.json
```

### Anti-Patterns to Avoid

**1. Never use rsync --delete for diagnostic pulls**
- Risk: Deletes local files if remote connection fails or path is wrong
- Use: Incremental sync without --delete flag
- Source: [Favorite rsync Commands for Copying WordPress Sites](https://guides.wp-bullet.com/favorite-rsync-commands-for-copying-wordpress-sites/)

**2. Never store SSH credentials in sites.json**
- Risk: Credentials committed to git, exposed in logs, visible to Claude
- Use: Store SSH config aliases only, real credentials in ~/.ssh/config
- Source: [SSH Config: The Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/ssh-config-complete-guide)

**3. Never skip connection test before sync**
- Risk: Long-running rsync fails midway, wasting time and bandwidth
- Use: Quick SSH connection test with timeout before file operations
- Source: [5 simple methods to test ssh connection in Linux & Unix](https://www.golinuxcloud.com/test-ssh-connection/)

**4. Don't manually parse SSH config with simple grep**
- Risk: Misses includes, wildcards, conditional logic
- Use: `ssh -G hostname` to get canonical parsed values
- Source: [SSH Config Bash Script :: JM Tech Blog](https://www.jm.technology/post/bash_script_june_2019/)

**5. Never sync without exclusions**
- Risk: Transfers gigabytes of uploads, node_modules, vendor directories unnecessarily
- Use: Always exclude wp-content/uploads, cache, node_modules, vendor
- Source: [How to Exclude Files and Directories with Rsync](https://linuxize.com/post/how-to-exclude-files-and-directories-with-rsync/)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing/updating | Custom line-by-line file editing | `jq` | Atomic updates, handles escaping, prevents corruption |
| SSH connection pooling | Custom connection manager | SSH ControlMaster in ~/.ssh/config | Built-in, reliable, reuses connections automatically |
| File transfer protocol | Custom socket-based transfer | rsync over SSH | Incremental, compress, resume, battle-tested |
| Credential storage | Base64 encoding in JSON | SSH agent + config file | Proper key management, no credential exposure |
| Remote command execution | Custom shell wrapper | Direct `ssh user@host "command"` | Standard, debuggable, logs properly |

**Key insight:** SSH, rsync, and jq have decades of edge-case handling. WordPress sites exist in diverse hosting environments (shared hosting, VPS, managed WordPress) with varying permissions, shell configurations, and file systems. Standard tools handle these variations; custom implementations don't.

## Common Pitfalls

### Pitfall 1: SSH Key Permission Errors

**What goes wrong:**
SSH refuses to use private keys if permissions are too permissive. Connection fails with "UNPROTECTED PRIVATE KEY FILE" error.

**Why it happens:**
- Private key file permissions must be 600 (read/write for owner only)
- Parent directory (~/.ssh) must be 700
- Users copy keys without fixing permissions
- Windows file systems don't track Unix permissions properly

**How to avoid:**
```bash
# Verify SSH key permissions
ls -la ~/.ssh/id_rsa  # Should show: -rw------- (600)
ls -la ~/.ssh/        # Should show: drwx------ (700)

# Fix if needed
chmod 600 ~/.ssh/id_rsa
chmod 700 ~/.ssh
```

**Warning signs:**
- "WARNING: UNPROTECTED PRIVATE KEY FILE!" in SSH output
- "Permissions 0644 for key are too open" errors
- Authentication falls back to password despite key existing

**Source:** [Fix SSH Authentication Refused: Bad Ownership or Modes for Authorized Keys File](https://www.techedubyte.com/fix-ssh-auth-refused-bad-ownership-modes-authorized-keys/)

---

### Pitfall 2: rsync Trailing Slash Confusion

**What goes wrong:**
Files end up in wrong directory structure. User expects `dest/file.php` but gets `dest/wordpress/file.php` or vice versa.

**Why it happens:**
- Trailing slash changes rsync behavior: with slash = copy contents, without = copy directory
- Documentation isn't clear about the difference
- Users copy rsync commands without understanding syntax

**How to avoid:**
```bash
# WRONG: Creates dest/wordpress/wp-config.php (nested)
rsync -av user@host:/var/www/wordpress dest/

# RIGHT: Creates dest/wp-config.php (flat)
rsync -av user@host:/var/www/wordpress/ dest/

# Remember: source/ = copy contents, source = copy directory itself
```

**Warning signs:**
- Files appear in unexpected nested directories
- Subsequent syncs create duplicates
- Local directory structure doesn't match remote

**Source:** [Favorite rsync Commands for Copying WordPress Sites](https://guides.wp-bullet.com/favorite-rsync-commands-for-copying-wordpress-sites/)

---

### Pitfall 3: Forgetting to Exclude Uploads

**What goes wrong:**
rsync transfers gigabytes of uploads, media, cache files unnecessarily. First sync takes hours and fills disk.

**Why it happens:**
- WordPress uploads directory can be 10-100GB on media-heavy sites
- Cache directories accumulate gigabytes of temporary files
- node_modules and vendor directories from development are massive
- Users forget to add exclusions

**How to avoid:**
```bash
# Always exclude these directories for WordPress diagnostics:
rsync -av \
    --exclude='wp-content/uploads/' \
    --exclude='wp-content/cache/' \
    --exclude='wp-content/w3tc-cache/' \
    --exclude='node_modules/' \
    --exclude='vendor/' \
    --exclude='.git/' \
    user@host:/path/ dest/

# Use --dry-run to preview what will transfer
rsync -avz --dry-run --stats ... | grep "Total transferred file size"
```

**Warning signs:**
- rsync runs for hours on first connection
- Disk space fills rapidly during sync
- Progress bar shows thousands of files being transferred
- Local .sites/ directory grows to multi-GB size

**Source:** [How to use Rsync to exclude Files and Directories in Data Transfer](https://phoenixnap.com/kb/rsync-exclude-files-and-directories)

---

### Pitfall 4: Non-Atomic JSON Updates

**What goes wrong:**
sites.json becomes corrupted or truncated if script is interrupted during write. All saved profiles are lost.

**Why it happens:**
- Directly overwriting file with `>` operator truncates before writing
- If interrupted mid-write, file is left incomplete
- JSON becomes unparseable
- No backup or recovery mechanism

**How to avoid:**
```bash
# WRONG: Direct overwrite (dangerous)
echo '{"sites": {...}}' > data/sites.json

# RIGHT: Write to temp file, then atomic move
jq '.sites["new-site"] = {...}' data/sites.json > /tmp/sites.json.tmp
mv /tmp/sites.json.tmp data/sites.json  # mv is atomic

# Always validate JSON before replacing
if jq empty /tmp/sites.json.tmp 2>/dev/null; then
    mv /tmp/sites.json.tmp data/sites.json
else
    echo "ERROR: Generated invalid JSON, not updating"
fi
```

**Warning signs:**
- sites.json contains partial JSON after failed operation
- jq errors when trying to read sites.json
- Connection profiles disappear after script errors
- File size changes unexpectedly (truncation)

**Source:** [Update JSON file using Terminal or bash script](https://thenote.app/post/en/update-json-file-using-terminal-or-bash-script-tfgotumwzn)

---

### Pitfall 5: Ignoring SSH Connection Timeouts

**What goes wrong:**
Scripts hang indefinitely when remote host is unreachable. User doesn't know if connection failed or is still trying.

**Why it happens:**
- Default TCP timeout is 75-120 seconds
- SSH doesn't fail fast on network issues
- Scripts don't set ConnectTimeout option
- No user feedback during long waits

**How to avoid:**
```bash
# Always set ConnectTimeout for automated connections
ssh -o ConnectTimeout=10 user@host "command"

# For connection tests, use BatchMode to prevent password prompts
ssh -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    user@host "echo ok"

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "Connection failed (timeout or refused)"
fi
```

**Warning signs:**
- Scripts hang for minutes with no output
- No error message, just silence
- User must manually Ctrl+C to cancel
- Subsequent connections also hang

**Source:** [How to check for ssh connectivity in a shell script](https://www.cyberciti.biz/faq/how-to-check-for-ssh-connectivity-in-a-shell-script/)

---

### Pitfall 6: WP-CLI Remote Execution Without Path Context

**What goes wrong:**
`wp` commands fail with "Error: This does not seem to be a WordPress installation" even though WordPress exists on server.

**Why it happens:**
- WP-CLI needs to run from WordPress root directory
- SSH command starts in user home directory by default
- Script doesn't `cd` to WordPress path before running commands
- WP-CLI searches for wp-config.php in current directory and parents

**How to avoid:**
```bash
# WRONG: Runs from home directory
ssh user@host "wp core version"
# Error: This does not seem to be a WordPress installation

# RIGHT: Change directory first
ssh user@host "cd /var/www/html && wp core version"

# BETTER: Use --path flag
ssh user@host "wp core version --path=/var/www/html"

# BEST: Store path in profile and reuse
WP_PATH="/var/www/html"
ssh user@host "cd $WP_PATH && wp core version"
```

**Warning signs:**
- WP-CLI commands fail with "not a WordPress installation"
- Same commands work when run directly on server
- Manual SSH + cd + command works, but script doesn't
- WP-CLI found but can't detect WordPress

**Source:** [WP-CLI: How to Connect to WordPress via SSH](https://blog.sucuri.net/2023/04/wp-cli-how-to-connect-to-wordpress-via-ssh.html)

## Code Examples

Verified patterns from official sources and research:

### SSH Connection Test with Error Diagnosis

```bash
# Source: https://www.golinuxcloud.com/test-ssh-connection/
# Source: https://docs.digitalocean.com/support/how-to-troubleshoot-ssh-authentication-issues/

test_ssh_connection() {
    local host="$1"
    local user="$2"
    local timeout="${3:-10}"

    # Test with BatchMode (no prompts) and timeout
    output=$(ssh -o BatchMode=yes \
                 -o ConnectTimeout="$timeout" \
                 -o StrictHostKeyChecking=accept-new \
                 "${user}@${host}" "echo 'Connection successful'" 2>&1)

    exit_code=$?

    # Diagnose based on exit code and output
    case $exit_code in
        0)
            echo "SUCCESS: Connection established"
            return 0
            ;;
        255)
            if echo "$output" | grep -q "Connection timed out"; then
                echo "FAIL: Connection timeout - host unreachable or firewall blocking"
            elif echo "$output" | grep -q "Connection refused"; then
                echo "FAIL: Connection refused - SSH daemon not running or wrong port"
            elif echo "$output" | grep -q "Host key verification failed"; then
                echo "FAIL: Host key changed - possible MITM attack or server reinstalled"
            else
                echo "FAIL: Connection failed - check network and hostname"
            fi
            return 1
            ;;
        *)
            if echo "$output" | grep -q "Permission denied"; then
                echo "FAIL: Authentication failed - check SSH key and permissions"
            elif echo "$output" | grep -q "UNPROTECTED PRIVATE KEY FILE"; then
                echo "FAIL: Private key permissions too open - run: chmod 600 ~/.ssh/id_rsa"
            else
                echo "FAIL: Unknown error - $output"
            fi
            return 1
            ;;
    esac
}

# Usage
test_ssh_connection "example.com" "wpuser" 10
```

### WordPress Installation Detection and Validation

```bash
# Source: https://developer.wordpress.org/cli/commands/core/is-installed/
# Source: https://www.wpbeginner.com/beginners-guide/beginners-guide-to-wordpress-file-and-directory-structure/

detect_wordpress() {
    local host="$1"
    local user="$2"
    local search_paths="${3:-/var/www/html /home/$user/public_html /usr/share/nginx/html}"

    echo "Searching for WordPress installation..."

    # Check if user provided path works
    if [ -n "$4" ]; then
        if validate_wordpress "$host" "$user" "$4"; then
            echo "$4"
            return 0
        fi
    fi

    # Search common paths
    for path in $search_paths; do
        if ssh "${user}@${host}" "test -f $path/wp-config.php" 2>/dev/null; then
            if validate_wordpress "$host" "$user" "$path"; then
                echo "$path"
                return 0
            fi
        fi
    done

    echo "ERROR: WordPress installation not found"
    return 1
}

validate_wordpress() {
    local host="$1"
    local user="$2"
    local path="$3"

    # Check for required WordPress files and directories
    ssh "${user}@${host}" "test -f $path/wp-config.php && \
                           test -d $path/wp-content && \
                           test -d $path/wp-includes && \
                           test -f $path/wp-load.php" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo "Valid WordPress installation at $path"
        return 0
    else
        echo "Path exists but missing required WordPress files"
        return 1
    fi
}

# Usage
WP_PATH=$(detect_wordpress "example.com" "wpuser")
```

### Complete rsync with Size Check and Exclusions

```bash
# Sources:
# - https://man7.org/linux/man-pages/man1/rsync.1.html
# - https://linuxize.com/post/how-to-exclude-files-and-directories-with-rsync/
# - https://kristau.net/blog/20/

sync_wordpress_files() {
    local host="$1"
    local user="$2"
    local remote_path="$3"
    local local_path="$4"
    local size_threshold_mb="${5:-500}"

    # Step 1: Check remote size
    echo "Checking remote site size..."
    remote_size_bytes=$(ssh "${user}@${host}" "du -sb $remote_path | cut -f1" 2>/dev/null)
    remote_size_mb=$((remote_size_bytes / 1024 / 1024))

    echo "Remote size: ${remote_size_mb}MB"

    if [ $remote_size_mb -gt $size_threshold_mb ]; then
        echo "WARNING: Remote site is ${remote_size_mb}MB (threshold: ${size_threshold_mb}MB)"
        echo "This may take several minutes. Continue? (y/n)"
        read -r response
        if [ "$response" != "y" ]; then
            echo "Sync cancelled"
            return 1
        fi
    fi

    # Step 2: Dry run to show what will transfer
    echo "Performing dry run to estimate transfer size..."
    rsync -avz --dry-run --stats \
        --exclude='wp-content/uploads/' \
        --exclude='wp-content/cache/' \
        --exclude='wp-content/w3tc-cache/' \
        --exclude='node_modules/' \
        --exclude='vendor/' \
        --exclude='.git/' \
        --exclude='.env' \
        "${user}@${host}:${remote_path}/" "${local_path}/" \
        2>&1 | grep "Total transferred file size"

    # Step 3: Actual sync
    echo "Starting file synchronization..."
    rsync -avz \
        --info=progress2 \
        --exclude='wp-content/uploads/' \
        --exclude='wp-content/cache/' \
        --exclude='wp-content/w3tc-cache/' \
        --exclude='node_modules/' \
        --exclude='vendor/' \
        --exclude='.git/' \
        --exclude='.env' \
        --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
        "${user}@${host}:${remote_path}/" "${local_path}/"

    if [ $? -eq 0 ]; then
        echo "Sync completed successfully"
        return 0
    else
        echo "Sync failed"
        return 1
    fi
}

# Usage
sync_wordpress_files "example.com" "wpuser" "/var/www/html" ".sites/example-com" 500
```

### Atomic JSON Profile Management

```bash
# Source: https://oneuptime.com/blog/post/2026-01-24-bash-json-parsing-jq/view
# Source: https://gist.github.com/ardiesaeidi/589156cda53189ca46ae6064e505de96

save_site_profile() {
    local sites_json="${1:-data/sites.json}"
    local site_name="$2"
    local host="$3"
    local user="$4"
    local remote_path="$5"
    local wp_version="$6"
    local site_url="$7"

    # Ensure sites.json exists
    if [ ! -f "$sites_json" ]; then
        echo '{"sites":{}}' > "$sites_json"
    fi

    # Create temp file for atomic update
    temp_json=$(mktemp)

    # Build profile with jq
    jq --arg name "$site_name" \
       --arg host "$host" \
       --arg user "$user" \
       --arg path "$remote_path" \
       --arg wp_ver "$wp_version" \
       --arg url "$site_url" \
       --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '.sites[$name] = {
           "host": $host,
           "user": $user,
           "remote_path": $path,
           "wordpress_version": $wp_ver,
           "site_url": $url,
           "last_sync": $timestamp,
           "created_at": (.sites[$name].created_at // $timestamp)
       }' "$sites_json" > "$temp_json"

    # Validate JSON before replacing
    if jq empty "$temp_json" 2>/dev/null; then
        mv "$temp_json" "$sites_json"
        echo "Profile saved: $site_name"
        return 0
    else
        rm -f "$temp_json"
        echo "ERROR: Failed to generate valid JSON"
        return 1
    fi
}

update_sync_timestamp() {
    local sites_json="${1:-data/sites.json}"
    local site_name="$2"

    temp_json=$(mktemp)

    jq --arg name "$site_name" \
       --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
       '.sites[$name].last_sync = $timestamp' "$sites_json" > "$temp_json" && \
       mv "$temp_json" "$sites_json"
}

# Usage
save_site_profile "data/sites.json" "example-com" "example.com" "wpuser" "/var/www/html" "6.4.3" "https://example.com"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Password-based SSH | Key-based + SSH agent | ~2010 | More secure, automatable |
| SCP for file transfer | rsync over SSH | ~2000 | Incremental, resumable, faster |
| Manual JSON editing | jq for atomic updates | ~2015 | Prevents corruption, safer |
| Custom SSH config parsing | `ssh -G` for canonical values | 2017 (OpenSSH 7.5) | Handles includes, wildcards |
| WP-CLI 1.x | WP-CLI 2.x | 2020 | Better error handling, PHP 7.2+ |

**Deprecated/outdated:**
- **StrictHostKeyChecking=no**: Now use `StrictHostKeyChecking=accept-new` (only accepts new hosts, not changed hosts)
- **rsync `--rsh=ssh` flag**: Now default behavior, no longer needed
- **WP-CLI < 2.10**: Missing important features, PHP 7.2+ support
- **Manual wp-config.php parsing**: Use WP-CLI commands instead

## Open Questions

### 1. Optimal Size Threshold for Sync Warnings

**What we know:**
- rsync can handle multi-GB transfers
- Typical WordPress site: 50-500MB without uploads
- With uploads: 1-50GB+
- Network speed varies: 10-100 Mbps typical

**What's unclear:**
- User tolerance for wait times
- Whether to base threshold on total size or transfer size (after exclusions)

**Recommendation:**
- Use 500MB as default warning threshold
- Calculate based on estimated transfer size (after exclusions)
- Show time estimate based on network speed test
- Make threshold configurable per-site

### 2. WP-CLI Installation Permissions

**What we know:**
- Standard installation requires sudo for /usr/local/bin/
- Shared hosting users may not have sudo
- Alternative: install to ~/bin/ or ~/.local/bin/

**What's unclear:**
- How to detect if user has sudo access
- Whether to automatically attempt installation or just provide instructions

**Recommendation:**
- Detect sudo availability with `sudo -n true` test
- If sudo available, offer automated installation
- If not, provide manual instructions for user-local installation
- Always give user choice before installing

### 3. Connection Retry Strategy

**What we know:**
- Network issues can be transient
- SSH connections may succeed after brief delay
- Too many retries = poor UX

**What's unclear:**
- Optimal retry count and delay
- Whether to distinguish retry-able failures from permanent ones

**Recommendation:**
- Single retry with 5-second delay for timeout/refused errors
- No retry for authentication failures (wrong key)
- No retry for host key verification failures (security issue)
- Display reason for each failure attempt

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [rsync man page](https://man7.org/linux/man-pages/man1/rsync.1.html) - rsync behavior, flags, patterns
- [WP-CLI Official Site](https://wp-cli.org/) - WP-CLI installation, commands
- [wp core is-installed – WP-CLI Command](https://developer.wordpress.org/cli/commands/core/is-installed/) - WordPress detection

**Current Guides (2026):**
- [SSH Config: The Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/ssh-config-complete-guide) - SSH config patterns
- [Rsync Command in Linux: Complete User Guide 2026](https://www.youstable.com/blog/rsync-command-in-linux/) - rsync best practices
- [How to Handle JSON Parsing in Bash with jq](https://oneuptime.com/blog/post/2026-01-24-bash-json-parsing-jq/view) - jq usage patterns

### Secondary (MEDIUM confidence)

**Verified with official docs:**
- [How to Exclude Files and Directories with Rsync | Linuxize](https://linuxize.com/post/how-to-exclude-files-and-directories-with-rsync/)
- [How to check for ssh connectivity in a shell script - nixCraft](https://www.cyberciti.biz/faq/how-to-check-for-ssh-connectivity-in-a-shell-script/)
- [5 simple methods to test ssh connection in Linux & Unix | GoLinuxCloud](https://www.golinuxcloud.com/test-ssh-connection/)
- [How to Troubleshoot SSH Authentication Issues | DigitalOcean Documentation](https://docs.digitalocean.com/support/how-to-troubleshoot-ssh-authentication-issues/)
- [Using the SSH Config File | Linuxize](https://linuxize.com/post/using-the-ssh-config-file/)

**WordPress-specific:**
- [Favorite rsync Commands for Copying WordPress Sites](https://guides.wp-bullet.com/favorite-rsync-commands-for-copying-wordpress-sites/)
- [WP-CLI: How to Connect to WordPress via SSH](https://blog.sucuri.net/2023/04/wp-cli-how-to-connect-to-wordpress-via-ssh.html)
- [Streamline WordPress Deployment Using WP-CLI and SSH – 2026](https://www.wewp.io/wp-cli-ssh-wordpress-deployments-2026/)

### Tertiary (LOW confidence - marked for validation)

- Various GitHub Gists for bash scripting patterns (examples, not authoritative)
- Community forum discussions on rsync/SSH troubleshooting (anecdotal)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools are standard Unix utilities with stable APIs
- Architecture patterns: HIGH - Based on verified rsync/SSH/jq documentation and examples
- Pitfalls: HIGH - Documented issues from official sources and WordPress community

**Research limitations:**
- WP-CLI remote execution patterns less documented than core commands
- Shared hosting SSH restrictions vary widely, hard to test comprehensively
- macOS vs Linux rsync differences (openrsync vs GNU) not fully explored

**Research date:** 2026-02-16
**Valid until:** 2026-08-16 (6 months - stable tooling, unlikely to change)
