---
name: connect
description: Connect to a WordPress site via SSH, sync files, and save profile
usage: /connect [site-name]
---

# Connect Command

Establish SSH connection to a WordPress site, detect WordPress installation, verify WP-CLI availability, sync files locally, and save connection profile.

## Command Flow

### 1. Check for Saved Profile Shortcut

If user provides a site name argument (e.g., `/connect example-com`):

1. Load `sites.json` and look up the site by name
2. If found:
   - Display saved profile details: host, user, WordPress path, site URL, last sync time
   - Ask user: "Found saved profile for {site-name}. Use these settings? (y/n)"
   - If yes: Skip SSH gathering and verification steps → jump to step 5 (WordPress validation)
   - If no: Continue with new connection flow below
3. If not found:
   - Tell user: "No saved profile found for '{site-name}'. Let's create a new connection."
   - Continue with new connection flow below

### 2. Gather SSH Connection Details (Conversational)

Ask for details one at a time, waiting for user response after each question:

**Step 2a: Hostname/IP**
- Ask: "What's the SSH hostname or IP address? (You can also use an SSH config alias)"
- Wait for user input
- Check if input matches SSH config alias:
  ```bash
  ssh -G {hostname} 2>/dev/null | grep "^hostname "
  ```
- If the resolved hostname differs from input (indicating an alias match):
  - Extract full details from `ssh -G {hostname}`:
    ```bash
    ssh -G {hostname} | grep "^hostname " | awk '{print $2}'
    ssh -G {hostname} | grep "^user " | awk '{print $2}'
    ssh -G {hostname} | grep "^port " | awk '{print $2}'
    ssh -G {hostname} | grep "^identityfile " | awk '{print $2}'
    ```
  - Display to user: "Found SSH config alias '{input}' → {resolved_hostname}, user: {resolved_user}, port: {resolved_port}, key: {resolved_key}"
  - Store resolved values for later use

**Step 2b: SSH User**
- If SSH config alias was matched: suggest the resolved user, or default to current username
  - Ask: "SSH user? (default: {suggested_user})"
- If no alias: default to current username
  - Ask: "SSH user? (default: {current_user})"
- Accept "default" or blank to use suggested/current user

**Step 2c: SSH Key Path**
- If SSH config alias was matched: suggest the resolved identity file
  - Ask: "SSH key path? (default: {resolved_key} or type 'agent' to use SSH agent)"
- If no alias: suggest ~/.ssh/id_rsa
  - Ask: "SSH key path? (default: ~/.ssh/id_rsa or type 'agent' to use SSH agent)"
- Accept "default" or "agent" (stores null in profile to use SSH agent default)

**Step 2d: Remote WordPress Path**
- Ask: "Remote WordPress path? (Leave blank to auto-detect)"
- If blank: will auto-detect in step 5

### 3. SSH Connection Verification

Test SSH connectivity with BatchMode (no password prompts) and timeout:

```bash
ssh -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o StrictHostKeyChecking=accept-new \
    {user}@{host} "echo 'connected'" 2>&1
```

**On success (exit code 0):**
- Display: "SSH connection successful"
- Proceed to step 4

**On failure (exit code non-zero):**
- Parse error output and diagnose:
  - **"Connection timed out"** → "Host unreachable or firewall blocking. Check hostname and network connectivity."
  - **"Connection refused"** → "SSH daemon not running or wrong port. Verify SSH service is active on the server."
  - **"Permission denied"** → "Authentication failed. Check SSH key path and ensure your public key is in authorized_keys on the server."
  - **"UNPROTECTED PRIVATE KEY FILE"** → "SSH key permissions too open. Run: `chmod 600 {key_path}`"
  - **"Host key verification failed"** → "Host key changed. This could indicate a security issue (MITM attack) or the server was reinstalled. Verify with your hosting provider before proceeding."
  - **Other errors** → Display raw error output
- Display specific fix suggestion for the detected error
- Exit: "Connection failed. Please fix the issue and run `/connect` again."

### 4. WordPress Path Detection and Validation

**If user provided a path in step 2d:**
- Skip search, use provided path
- Proceed to validation below

**If path was blank (auto-detect):**
- Search common WordPress installation paths:
  ```bash
  COMMON_PATHS=(
    "/var/www/html"
    "/home/{user}/public_html"
    "/usr/share/nginx/html"
    "/srv/www"
    "~/www"
    "~/public_html"
    "~/htdocs"
  )
  ```
- For each path, check if wp-config.php exists:
  ```bash
  ssh {user}@{host} "test -f {path}/wp-config.php" 2>/dev/null
  ```
- Collect all paths where wp-config.php was found
- **If multiple paths found:**
  - Display list: "Found WordPress in multiple locations:"
    ```
    1. /var/www/html
    2. /home/user/public_html
    ```
  - Ask: "Which one should I use? (1/2/...)"
  - Use selected path
- **If no paths found:**
  - Ask: "WordPress installation not found in common paths. Please provide the full path to your WordPress directory:"
  - Wait for user input

**Validate WordPress installation:**
- Check for required files and directories:
  ```bash
  ssh {user}@{host} "test -f {wp_path}/wp-config.php && \
                     test -d {wp_path}/wp-content && \
                     test -d {wp_path}/wp-includes && \
                     test -f {wp_path}/wp-load.php" 2>/dev/null
  ```
- **If validation fails:**
  - Display: "The path {wp_path} exists but doesn't appear to be a complete WordPress installation. Missing required files/directories."
  - Exit: "Please verify the WordPress path and run `/connect` again."
- **If validation succeeds:**
  - Display: "WordPress installation verified at {wp_path}"
  - Store wp_path for all subsequent operations

### 5. WP-CLI Detection

**Check if WP-CLI is in PATH:**
```bash
ssh {user}@{host} "which wp" 2>/dev/null
```

**If found in PATH:**
- Store wp_cli_path (e.g., /usr/local/bin/wp)
- Proceed to version check below

**If not in PATH, check common locations:**
```bash
for path in /usr/local/bin/wp /usr/bin/wp ~/bin/wp ~/.local/bin/wp; do
  ssh {user}@{host} "test -x $path" 2>/dev/null && echo "$path"
done
```

**If found in common location:**
- Store wp_cli_path
- Proceed to version check below

**If not found:**
- Display: "WP-CLI is not installed on the remote server."
- Ask: "Would you like to install WP-CLI? (y/n)"
- If no: Set wp_cli_path to null, skip to step 7 (file sync)
- If yes:
  - Check sudo availability:
    ```bash
    ssh {user}@{host} "sudo -n true" 2>/dev/null
    ```
  - **If sudo available:**
    - Display: "Installing WP-CLI to /usr/local/bin/wp (requires sudo)..."
    - Run:
      ```bash
      ssh {user}@{host} "curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
                         chmod +x wp-cli.phar && \
                         sudo mv wp-cli.phar /usr/local/bin/wp"
      ```
    - Set wp_cli_path to /usr/local/bin/wp
  - **If no sudo:**
    - Display: "Installing WP-CLI to ~/bin/wp (no sudo required)..."
    - Run:
      ```bash
      ssh {user}@{host} "mkdir -p ~/bin && \
                         curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
                         chmod +x wp-cli.phar && \
                         mv wp-cli.phar ~/bin/wp"
      ```
    - Set wp_cli_path to ~/bin/wp
  - **If installation fails:**
    - Display error: "WP-CLI installation failed: {error_output}"
    - Ask: "Continue without WP-CLI? (y/n)"
    - If no: Exit
    - If yes: Set wp_cli_path to null, continue

**Version check (if WP-CLI found or installed):**
```bash
ssh {user}@{host} "{wp_cli_path} --version" 2>/dev/null
```
- Parse version number from output (e.g., "WP-CLI 2.10.0")
- If version < 2.10: Display warning: "WP-CLI version {version} is outdated. Recommend upgrading to 2.10 or higher for best compatibility."
- Store version for profile

### 6. WP-CLI Auto-Gather (if WP-CLI available)

Run these commands over SSH (all with `cd {wp_path} &&` prefix):

```bash
# WordPress core version
WP_VERSION=$(ssh {user}@{host} "cd {wp_path} && {wp_cli_path} core version")

# Site URL
SITE_URL=$(ssh {user}@{host} "cd {wp_path} && {wp_cli_path} option get siteurl")

# Plugin summary
PLUGIN_LIST=$(ssh {user}@{host} "cd {wp_path} && {wp_cli_path} plugin list --format=csv --fields=name,status,version")
PLUGIN_COUNT=$(echo "$PLUGIN_LIST" | wc -l)
PLUGIN_COUNT=$((PLUGIN_COUNT - 1))  # Subtract header line

# Active theme
ACTIVE_THEME=$(ssh {user}@{host} "cd {wp_path} && {wp_cli_path} theme list --status=active --field=name")
```

Display concise summary to user:
```
WordPress {WP_VERSION} at {SITE_URL}
{PLUGIN_COUNT} plugins installed
Active theme: {ACTIVE_THEME}
```

Store gathered data (WP_VERSION, SITE_URL, ACTIVE_THEME) for profile saving in step 9.

### 7. File Sync with Size Check

**Check remote directory size:**
```bash
REMOTE_SIZE=$(ssh {user}@{host} "du -sb {wp_path} 2>/dev/null | cut -f1")
REMOTE_SIZE_MB=$((REMOTE_SIZE / 1024 / 1024))
```

Display: "Remote site size: {REMOTE_SIZE_MB}MB"

**If size over 500MB:**
- Display warning: "WARNING: Remote site is {REMOTE_SIZE_MB}MB. This may take several minutes to sync."
- Ask: "Continue with file sync? (y/n)"
- If no: Skip to step 9 (save profile without syncing)
- If yes: Continue

**Detect rsync variant for macOS compatibility:**
```bash
RSYNC_VERSION=$(rsync --version 2>&1 | head -1)
```
- If contains "openrsync": Note that --info=progress2 is NOT supported, use -v instead
- If contains "rsync version 3": Use --info=progress2 for progress display

**Create local directory:**
```bash
mkdir -p .sites/{site-name}/
```

**Execute rsync with exclusions:**
```bash
# If GNU rsync (version 3.x)
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
  {user}@{host}:{wp_path}/ .sites/{site-name}/

# If openrsync (macOS default)
rsync -avz \
  -v \
  --exclude='wp-content/uploads/' \
  --exclude='wp-content/cache/' \
  --exclude='wp-content/w3tc-cache/' \
  --exclude='node_modules/' \
  --exclude='vendor/' \
  --exclude='.git/' \
  --exclude='.env' \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  {user}@{host}:{wp_path}/ .sites/{site-name}/
```

**Critical notes:**
- ALWAYS use trailing slash on source path ({wp_path}/) to sync contents, not directory
- NEVER use --delete flag (data-loss risk)
- Log files are NOT excluded (useful for diagnostics)

**On sync success:**
- Count local files: `find .sites/{site-name}/ -type f | wc -l`
- Display: "Sync complete. {file_count} files synced to .sites/{site-name}/"

**On sync failure:**
- Display: "rsync failed: {error_output}"
- Suggest: "Check network connectivity, SSH permissions, or disk space. You can retry by running `/connect {site-name}` again."
- Exit

### 8. One-Off Connection Mode

If at any point during the flow user explicitly says "don't save" or "one-off connection":
- Set a flag: SKIP_SAVE=true
- Continue with all other steps (connect, detect, sync)
- Skip step 9 (profile saving)
- At the end, inform user: "Connection not saved. Files synced to .sites/{site-name}/ but no profile created. To reconnect, run `/connect` and provide details again."

### 9. Auto-Save Profile to sites.json

**Generate site name from domain:**
- Extract domain from SITE_URL (if available) or hostname
- Convert domain to site name: example.com → example-com
- Replace dots with dashes
- If SITE_URL not available (no WP-CLI), use hostname

**Create sites.json if missing:**
```bash
if [ ! -f sites.json ]; then
  echo '{"sites":{}}' > sites.json
fi
```

**Atomic update with jq:**
```bash
jq --arg name "{site-name}" \
   --arg host "{host}" \
   --arg user "{user}" \
   --arg key "{key_path_or_null}" \
   --arg wp_path "{wp_path}" \
   --arg wp_version "{version_or_null}" \
   --arg site_url "{url_or_null}" \
   --arg wp_cli "{wp_cli_path_or_null}" \
   --arg local_path ".sites/{site-name}" \
   --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.sites[$name] = {
       "host": $host,
       "user": $user,
       "ssh_key": $key,
       "wp_path": $wp_path,
       "local_path": $local_path,
       "wp_version": $wp_version,
       "site_url": $site_url,
       "wp_cli_path": $wp_cli,
       "last_sync": $timestamp,
       "created_at": (.sites[$name].created_at // $timestamp),
       "environment": null,
       "is_default": (if (.sites | length) == 0 then true else (.sites[$name].is_default // false) end),
       "notes": null
   }' sites.json > /tmp/sites.json.tmp
```

**Validate JSON before replacing:**
```bash
if jq empty /tmp/sites.json.tmp 2>/dev/null; then
  mv /tmp/sites.json.tmp sites.json
else
  echo "ERROR: Failed to save profile (invalid JSON generated)"
  rm -f /tmp/sites.json.tmp
  exit 1
fi
```

**If this is the first site saved:**
- Automatically set is_default to true
- Display: "Profile saved as '{site-name}' (set as default site)."

**If not the first site:**
- Display: "Profile saved as '{site-name}'. Use `/connect {site-name}` to reconnect."

### 10. Update CLAUDE.md Hot Cache (Mental Update)

After successful connection, mentally populate the "Currently Connected Site" section in CLAUDE.md with:

- **Site name:** {site-name}
- **Host:** {host}
- **User:** {user}
- **WordPress path:** {wp_path}
- **Local path:** .sites/{site-name}
- **WordPress version:** {wp_version or "Unknown"}
- **Site URL:** {site_url or "Unknown"}
- **WP-CLI status:** {wp_cli_path or "Not installed"}
- **Last sync:** {timestamp}

This is a mental model update for maintaining context during the session. Do NOT write to CLAUDE.md file.

### 11. Error Handling Throughout

Every SSH command should:
- Include `2>&1` to capture stderr
- Check exit code: `$?`
- Parse error output for specific failure reasons
- Provide user with specific next action (never leave hanging)

Example pattern:
```bash
OUTPUT=$(ssh {user}@{host} "command" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "Command failed: $OUTPUT"
  echo "Suggested fix: [specific action based on error]"
  exit 1
fi
```

## Success Criteria

Connection is successful when:
- SSH connectivity verified
- WordPress installation detected and validated
- WP-CLI status determined (installed or not)
- Files synced to local directory (or user skipped)
- Profile saved to sites.json (or user requested one-off mode)
- User can reconnect using `/connect {site-name}` shortcut

## Notes

- All SSH operations use BatchMode to prevent password prompts
- All file paths use absolute paths or stored profile paths
- All jq operations use temp files for atomic updates
- Progress feedback provided at each step
- User always has opportunity to cancel or skip optional steps
