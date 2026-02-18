---
name: connect
description: Connect to a WordPress site via SSH, local directory, Docker container, or git repository
usage: /connect [site-name | path | url | container]
---

# Connect Command

Establish a connection to a WordPress site from any source — SSH server, local directory, Docker container, or git repository — detect WordPress installation, verify WP-CLI availability, acquire files, and save a connection profile.

## Command Flow

### 0. Source Type Detection

This section runs first, before any source-specific logic.

**If /connect is called with no arguments**, show a source type menu:

```
What would you like to connect to?
  1) SSH — remote server via SSH
  2) Local — local WordPress directory
  3) Docker — WordPress in a Docker container
  4) Git — clone or point to a git repository

Type the number or enter your target directly:
```

Wait for user input. If user types a number (1-4), route to the corresponding flow. If user types a target directly, run auto-detection below on that input.

**If an argument is provided**, auto-detect source type using these rules in order:

```bash
detect_source_type() {
  local input="$1"

  # Git URL patterns — must check before SSH user@host
  if echo "$input" | grep -qE "^(https?://|git@|git://)"; then
    echo "git"
    return
  fi

  # Local path patterns — starts with /, ./, ../, or ~
  if echo "$input" | grep -qE "^[./]|^~"; then
    echo "local"
    return
  fi

  # SSH: user@host pattern (contains @ and no path separator after host)
  if echo "$input" | grep -qE "^[a-zA-Z0-9_-]+@[a-zA-Z0-9._-]+$"; then
    echo "ssh"
    return
  fi

  # Ambiguous: bare alphanumeric token (SSH alias or Docker container name)
  echo "ambiguous"
}
```

Detection rules:
- Starts with `https://`, `git@`, or `git://` → source type **git**
- Starts with `/`, `./`, `../`, or `~` → source type **local** (but also check for `.git/` subdirectory — if found, ask: "This looks like a git repository. Connect as Git type (enables branch switching)? Or connect as Local type?")
- Matches `user@host` pattern (contains `@` and no `/` path separator after the host) → source type **ssh**
- Anything else (bare alphanumeric token) → **ambiguous**: show "This could be an SSH config alias or a Docker container name. Which is it? (ssh/docker)" and wait for user answer

After source type is determined, route to the appropriate flow:
- **ssh** → Section 2 (SSH flow, steps 1-9 below, unchanged)
- **local** → Section 1A (Local Directory flow)
- **docker** → Section 1B (Docker Container flow)
- **git** → Section 1C (Git Repository flow)

---

### 1. Check for Saved Profile Shortcut

If user provides a site name argument that matches an existing profile in sites.json:

1. Load `sites.json` and look up the site by name
2. If found:
   - Display saved profile details: source type, host/path/container/URL, WordPress path, site URL, last sync time
   - Ask user: "Found saved profile for {site-name}. Use these settings? (y/n)"
   - If yes:
     - For **git profiles**: Check if local_path still exists. Ask: "Pull latest changes from origin/{branch}? (y/n)" — do NOT auto-pull. If yes: `git -C "$local_path" pull origin "$git_branch"`. If no: "Using existing local files." Update last_sync timestamp. Jump to capability summary display.
     - For **docker profiles**: Re-verify container is running: `docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null`. If not "running", warn: "Container '[name]' is not running. Start it first, then try again." On reconnect with docker cp source: Re-copy files before diagnostics (same behavior as SSH rsync). Show "Syncing from container..." message.
     - For **ssh profiles**: Skip SSH gathering → jump to Section 3 (WordPress validation)
     - For **local profiles**: Skip to capability summary display (files are live on disk)
   - If no: Continue with new connection flow below
3. If not found:
   - Tell user: "No saved profile found for '{site-name}'. Let's create a new connection."
   - Continue with new connection flow (source type detection in Section 0)

---

### 1A. Local Directory Flow

**When source type is `local`:**

1. **Resolve path:**
   ```bash
   wp_path="${input_path/#\~/$HOME}"
   wp_path=$(realpath "$wp_path" 2>/dev/null || echo "$wp_path")
   ```
   Always store the resolved absolute path. Symlinks are resolved — use resolved path consistently throughout.

2. **Check for git repository** (before WordPress validation):
   ```bash
   if [ -d "$wp_path/.git" ]; then
     echo "This looks like a git repository. Connect as:"
     echo "  1) Git type — enables branch switching and pull on reconnect"
     echo "  2) Local type — treat as a regular local directory"
     # Wait for user choice
   fi
   ```
   If user selects Git type, route to Section 1C (existing checkout sub-flow) with this path.

3. **Validate WordPress markers** (check all four, warn on partial):
   ```bash
   markers_found=0
   test -f "$wp_path/wp-config.php"  && markers_found=$((markers_found + 1))
   test -d "$wp_path/wp-includes/"   && markers_found=$((markers_found + 1))
   test -d "$wp_path/wp-admin/"      && markers_found=$((markers_found + 1))
   test -f "$wp_path/wp-load.php"    && markers_found=$((markers_found + 1))
   ```

   - If 0 markers found: "No WordPress installation detected at [path]. Expected wp-config.php, wp-includes/, wp-admin/, wp-load.php." → abort
   - If 1-3 markers found: "Partial WordPress installation detected ([N]/4 markers). Missing: [list]. Some diagnostics may be limited. Continue? (y/n)"
   - If 4 markers found: proceed silently

4. **Set file paths:** For local source, `local_path` = `wp_path` (no file copying needed). Files are read directly from this location.

5. **Generate profile name** from directory basename:
   ```bash
   profile_name=$(basename "$wp_path" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')
   ```
   Display suggested name: "Profile name: [name]. Press Enter to accept or type a new name:"

6. **Probe for local WP-CLI:**
   ```bash
   wp_cli_path=$(which wp 2>/dev/null || echo "null")
   ```

7. **If WP-CLI found** and wp-config.php present, try to read WordPress info:
   ```bash
   wp_version=$(wp core version --path="$wp_path" 2>/dev/null || echo "null")
   site_url=$(wp option get siteurl --path="$wp_path" 2>/dev/null || echo "null")
   ```
   (DB commands will fail gracefully if the database is not accessible — that's OK, continue)

8. **Save profile** with source_type "local" (see Section 9, Profile Save Logic).

9. **Show capability summary** (see Section 10).

---

### 1B. Docker Container Flow

**When source type is `docker`:**

1. **If no container name/ID specified**, list running containers:
   ```bash
   docker ps --format "  {{.Names}} ({{.Image}})" 2>/dev/null
   ```
   Ask: "Enter container name or ID:"

2. **Verify container is running:**
   ```bash
   container_status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
   ```
   If status is not "running": "Container '[name]' is not running (status: [status]). Start it first, then try again." → abort.

3. **Probe for WordPress** in known paths, in order:
   - `/var/www/html`
   - `/app/public`
   - `/var/www`
   - `/var/www/wordpress`
   - `/usr/share/nginx/html`
   - `/srv/www`

   For each path:
   ```bash
   docker exec "$container" test -f "$path/wp-config.php" 2>/dev/null
   ```
   Use the first path that succeeds. If none found: "WordPress not found in standard paths inside container. Enter the WordPress path inside the container:" — wait for user input.

4. **Detect bind mounts** covering the WordPress path:
   ```bash
   bind_source=$(docker inspect --format='{{json .Mounts}}' "$container" 2>/dev/null | \
     jq -r --arg path "$container_wp_path" \
     '.[] | select(.Type == "bind") | select($path | startswith(.Destination)) | .Source' | \
     head -1)
   ```

   **Important (Pitfall 1 — partial bind mounts):** Also check the reverse direction. If only a subdirectory of the WP path is bind-mounted (e.g., `/var/www/html/wp-content` only), the above filter will not match. Check both directions:
   ```bash
   # Direction 1: bind Destination is a prefix of WP path (full WP root is mounted)
   bind_source=$(docker inspect --format='{{json .Mounts}}' "$container" | \
     jq -r --arg path "$container_wp_path" \
     '.[] | select(.Type == "bind") | select($path | startswith(.Destination)) | .Source' | head -1)

   # Direction 2 (if no match): bind Destination is a subdirectory of WP path (partial mount)
   if [ -z "$bind_source" ]; then
     partial_mount=$(docker inspect --format='{{json .Mounts}}' "$container" | \
       jq -r --arg path "$container_wp_path" \
       '.[] | select(.Type == "bind") | select(.Destination | startswith($path)) | .Destination' | head -1)
     if [ -n "$partial_mount" ]; then
       echo "Note: Only a subdirectory is bind-mounted ($partial_mount). Falling back to docker cp for full WP root."
     fi
   fi
   ```

   **If full bind mount found** (Direction 1):
   - `local_path` = bind mount Source path on host
   - `file_access` = "bind_mount"
   - Tell user: "Using host bind mount at [path] — files are accessed directly, no copying needed."

   **If no full bind mount** (Direction 1 failed, whether or not partial mount exists):
   - Generate site slug from container name: `echo "$container" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-'`
   - `local_path` = ".sites/[slug]/"
   - `mkdir -p "$local_path"`
   - Copy files: `docker cp "${container}:${container_wp_path}/." "$local_path"`
   - `file_access` = "docker_cp"
   - Tell user: "Copied WordPress files from container to [local_path]."

5. **Probe WP-CLI inside container:**
   ```bash
   wp_cli_path=$(docker exec "$container" which wp 2>/dev/null || \
     docker exec "$container" wp --version 2>/dev/null && echo "wp" || echo "null")
   ```

6. **If WP-CLI found inside container**, read WordPress info via docker exec:
   ```bash
   wp_version=$(docker exec "$container" wp core version --path="$container_wp_path" 2>/dev/null || echo "null")
   site_url=$(docker exec "$container" wp option get siteurl --path="$container_wp_path" 2>/dev/null || echo "null")
   ```

7. **Generate profile name** from container name (lowercase, hyphenated). Display and ask user to confirm:
   ```bash
   profile_name=$(echo "$container" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')
   ```
   "Profile name: [name]. Press Enter to accept or type a new name:"

8. **Save profile** with source_type "docker", container_name, file_access, and gathered data (see Section 9).

9. **Show capability summary** (see Section 10).

---

### 1C. Git Repository Flow

**When source type is `git`:**

#### Sub-flow A: Fresh clone from URL

When input is a git URL (https://, git@, git://).

1. **Extract site slug from URL:**
   ```bash
   site_slug=$(echo "$git_url" | sed 's|.*[:/]||; s|\.git$||' | \
     tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')
   ```

2. **List remote branches without cloning:**
   ```bash
   default_branch=$(git ls-remote --symref "$git_url" HEAD 2>/dev/null | \
     grep "^ref:" | sed 's|ref: refs/heads/||; s|\s.*||')
   default_branch="${default_branch:-main}"

   branch_list=$(git ls-remote --heads "$git_url" 2>/dev/null | sed 's|.*refs/heads/||' | head -10)
   branch_count=$(echo "$branch_list" | grep -c .)
   ```

   If multiple branches exist:
   ```
   Repository has [N] branches. Using default: [branch].
   Other branches: [first 4, comma-separated]
   Clone a different branch? (enter name, or press Enter for [default]):
   ```
   Wait for user input. Use `branch_choice` if provided, else use `default_branch`.

3. **Shallow clone:**
   ```bash
   git clone --depth 1 --branch "$clone_branch" "$git_url" ".sites/$site_slug/" 2>&1
   ```

   **On clone failure:**
   - For `git@` URLs: "Clone failed. Check that your SSH key is loaded (`ssh-add -l`) and has access to this repository."
   - For `https://` URLs: "Clone failed. Check network connectivity and repository access. For private repos, use a personal access token in the URL."
   - Clean up failed clone directory: `rm -rf ".sites/$site_slug/"`
   - Exit

4. **Set paths:** `local_path` = `.sites/$site_slug/`, `wp_path` = same.

5. **Validate WordPress markers** (same as local flow — 4-marker check with partial warning):
   Note: git repos may be theme-only or plugin-only. On partial match, warn: "This repository appears to contain only part of a WordPress installation (e.g., a theme or plugin). File analysis will work; DB skills are not available for git sources."

6. **Probe local WP-CLI:**
   ```bash
   wp_cli_path=$(which wp 2>/dev/null || echo "null")
   ```
   Note: "Git sources have no live database. WP-CLI DB commands will not work even if WP-CLI is installed."

7. **Save profile** with source_type "git", git_remote = `$git_url`, git_branch = `$clone_branch`, file_access = "direct" (see Section 9).

8. **Show capability summary** (see Section 10).

#### Sub-flow B: Existing local checkout

When input is a local path AND contains a `.git/` subdirectory AND user chose "Git" type (either explicitly from menu, or from the prompt in Section 1A step 2).

1. **Resolve path:**
   ```bash
   abs_path=$(realpath "$input_path" 2>/dev/null || echo "$input_path")
   local_path="$abs_path"
   wp_path="$abs_path"
   ```

2. **Read git metadata:**
   ```bash
   git_remote=$(git -C "$abs_path" remote get-url origin 2>/dev/null || echo "none")
   git_branch=$(git -C "$abs_path" branch --show-current 2>/dev/null || echo "unknown")
   ```

3. **If multiple remote branches exist**, mention them and offer to switch:
   ```bash
   branch_count=$(git -C "$abs_path" branch -r 2>/dev/null | grep -c .)
   if [ "$branch_count" -gt 1 ]; then
     echo "Current branch: $git_branch"
     echo "Other branches available:"
     git -C "$abs_path" branch -r 2>/dev/null | grep -v HEAD | head -5 | sed 's/.*origin\//  /'
     echo "Switch branch? (enter branch name, or press Enter to keep $git_branch)"
     # Wait for user input; if provided, run: git -C "$abs_path" checkout "$branch_choice"
   fi
   ```

4. **Validate WordPress markers** (same 4-marker check with partial warning).

5. **Save profile** with source_type "git", git_remote, git_branch, file_access = "direct" (see Section 9).

6. **Show capability summary** (see Section 10).

**Reconnect behavior for git profiles** (called from Section 1, saved profile shortcut):

When `/connect` is called with a profile name that already exists AND has source_type "git":
- Check if local_path still exists: `test -d "$local_path"`
- If missing: "Local clone not found at [path]. Re-clone from [git_remote]? (y/n)"
- Ask: "Pull latest changes from origin/[branch]? (y/n)" — do NOT auto-pull; default is no
- If yes: `git -C "$local_path" pull origin "$git_branch"` — show result, warn on failure
- If no: "Using existing local files."
- Update last_sync timestamp

---

### 2. Gather SSH Connection Details (Conversational)

**This section runs only when source_type is "ssh".**

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
- If blank: will auto-detect in step 4

### 3. SSH Connection Verification

**This section runs only when source_type is "ssh".**

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

**This section runs only when source_type is "ssh".**

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

**This section runs only when source_type is "ssh".**

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

**This section runs only when source_type is "ssh".**

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

**This section runs only when source_type is "ssh".**

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
- Continue with all other steps (connect, detect, sync/acquire)
- Skip step 9 (profile saving)
- At the end, inform user: "Connection not saved. Files acquired to .sites/{site-name}/ but no profile created. To reconnect, run `/connect` and provide details again."

### 9. Profile Save Logic (All Source Types)

**Generate site/profile name:**
- SSH: Extract domain from SITE_URL (if available) or hostname. Convert to name: example.com → example-com. Replace dots with dashes.
- Local: From directory basename (see Section 1A step 5)
- Docker: From container name (see Section 1B step 7)
- Git (fresh clone): From URL slug (see Section 1C Sub-flow A step 1)
- Git (existing checkout): From directory basename

**Create sites.json if missing:**
```bash
if [ ! -f sites.json ]; then
  echo '{"sites":{}}' > sites.json
fi
```

**Atomic update with jq** — includes all source_type fields for every profile:
```bash
jq --arg name "$SITE_NAME" \
   --arg host "${HOST:-null}" \
   --arg user "${SSH_USER:-null}" \
   --arg key "${KEY_PATH:-null}" \
   --arg wp_path "$WP_PATH" \
   --arg local_path "$LOCAL_PATH" \
   --arg wp_version "${WP_VERSION:-null}" \
   --arg site_url "${SITE_URL:-null}" \
   --arg wp_cli "${WP_CLI_PATH:-null}" \
   --arg source_type "$SOURCE_TYPE" \
   --arg container_name "${CONTAINER_NAME:-null}" \
   --arg git_remote "${GIT_REMOTE:-null}" \
   --arg git_branch "${GIT_BRANCH:-null}" \
   --arg file_access "${FILE_ACCESS:-direct}" \
   --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.sites[$name] = {
       "host": (if $host == "null" then null else $host end),
       "user": (if $user == "null" then null else $user end),
       "ssh_key": (if $key == "null" then null else $key end),
       "wp_path": $wp_path,
       "local_path": $local_path,
       "wp_version": (if $wp_version == "null" then null else $wp_version end),
       "site_url": (if $site_url == "null" then null else $site_url end),
       "wp_cli_path": (if $wp_cli == "null" then null else $wp_cli end),
       "last_sync": $timestamp,
       "created_at": (.sites[$name].created_at // $timestamp),
       "environment": null,
       "is_default": (if (.sites | length) == 0 then true else (.sites[$name].is_default // false) end),
       "notes": null,
       "source_type": $source_type,
       "container_name": (if $container_name == "null" then null else $container_name end),
       "git_remote": (if $git_remote == "null" then null else $git_remote end),
       "git_branch": (if $git_branch == "null" then null else $git_branch end),
       "file_access": $file_access
   }' sites.json > /tmp/sites.json.tmp
```

**Source type field values by connection type:**

| Source Type | source_type | container_name | git_remote | git_branch | file_access |
|-------------|-------------|----------------|------------|------------|-------------|
| SSH | "ssh" | null | null | null | "rsync" |
| Local | "local" | null | null | null | "direct" |
| Docker (bind mount) | "docker" | container name | null | null | "bind_mount" |
| Docker (docker cp) | "docker" | container name | null | null | "docker_cp" |
| Git (fresh clone) | "git" | null | clone URL | branch name | "direct" |
| Git (existing checkout) | "git" | null | origin URL | current branch | "direct" |

**Backward compatibility:** Existing SSH profiles without `source_type` are treated as `source_type: "ssh"` throughout. Always read with null-coalescing:
```bash
SOURCE_TYPE=$(jq -r ".sites[\"$SITE_NAME\"].source_type // \"ssh\"" sites.json)
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

### 10. Capability Summary Display

After saving the profile, display which skill categories are available for this source type and WP-CLI status:

```
Connected: {site-name}  [{SOURCE_TYPE_BADGE}]

Available capabilities:
  [x] Code quality analysis
  [x] Malware scan
  [x] WordPress configuration security
  [x] Database analysis (WP-CLI available)     <- if WP-CLI found
  [x] User account audit                        <- if WP-CLI found
  [x] Version audit                             <- if WP-CLI found

  [ ] Database analysis ({reason})              <- if WP-CLI not available
  [ ] User account audit ({reason})             <- if WP-CLI not available
  [ ] Version audit ({reason})                  <- if WP-CLI not available
```

Source type badge: `[SSH]`, `[LOCAL]`, `[DOCKER]`, or `[GIT]`

Reasons for WP-CLI unavailability by source type:
- "git" → "git source — no live WordPress database"
- "local" → "WP-CLI not found locally — install from https://wp-cli.org to enable"
- "docker" → "WP-CLI not found in container"
- "ssh" → "WP-CLI not installed on server"

For **git sources**, always note regardless of WP-CLI presence:
"Note: Git sources provide file analysis only. No live database connection available."

For **docker (docker_cp) sources**:
"Note: Files were copied from the container. To refresh, reconnect with `/connect {site-name}`."

### 11. Update CLAUDE.md Hot Cache (Mental Update)

After successful connection, mentally populate the "Currently Connected Site" section in CLAUDE.md with:

- **Site name:** {site-name}
- **Source type:** {source_type} ({source_type_badge})
- **Host/Path/Container:** {host or local_path or container_name or git_remote}
- **WordPress path:** {wp_path}
- **Local path:** {local_path}
- **WordPress version:** {wp_version or "Unknown"}
- **Site URL:** {site_url or "Unknown"}
- **WP-CLI status:** {wp_cli_path or "Not available"}
- **Last sync:** {timestamp}

This is a mental model update for maintaining context during the session. Do NOT write to CLAUDE.md file.

### 12. Error Handling Throughout

Every command should:
- Include `2>&1` to capture stderr
- Check exit code: `$?`
- Parse error output for specific failure reasons
- Provide user with specific next action (never leave hanging)

Example pattern:
```bash
OUTPUT=$(command 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "Command failed: $OUTPUT"
  echo "Suggested fix: [specific action based on error]"
  exit 1
fi
```

**Source-type-specific error notes:**
- Docker: If `docker` command not found → "Docker is not installed or not in PATH. Install Docker Desktop from https://docker.com/get-started"
- Git: If `git` command not found → "git is not installed. Install with: brew install git (macOS) or apt install git (Linux)"
- Local: If `realpath` not found on macOS → Fall back to `cd "$input_path" && pwd` to resolve absolute path

## Success Criteria

Connection is successful when:
- Source type determined (auto-detected or menu-selected)
- WordPress installation detected and validated at the source
- Files accessible from local_path (either directly or copied)
- WP-CLI status determined (available or not)
- Profile saved to sites.json with source_type and all new fields
- Capability summary displayed
- User can reconnect using `/connect {site-name}` shortcut

## Notes

- Source type detection uses pattern matching in order: git URL → local path → SSH user@host → ambiguous
- All jq operations use temp files for atomic updates
- Backward-compatible source_type read: always use `.source_type // "ssh"` null-coalescing
- SSH fields (host, user, ssh_key) are null for non-SSH profiles
- Progress feedback provided at each step
- User always has opportunity to cancel or skip optional steps
- Skills that use SSH commands must check source_type before constructing SSH commands
- Resync before /diagnose is source-type gated: SSH uses rsync, local/bind_mount skips, docker_cp re-copies, git asks before pulling
