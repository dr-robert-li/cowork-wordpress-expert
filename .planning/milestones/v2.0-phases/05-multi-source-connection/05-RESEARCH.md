# Phase 5: Multi-Source Connection - Research

**Researched:** 2026-02-18
**Domain:** Source type detection, Docker file access, git shallow clone, sites.json schema extension, capability gating
**Confidence:** HIGH

## Summary

Phase 5 extends the existing `/connect` command to support four source types — SSH (existing), local directory, Docker container, and git repository — with transparent routing through all diagnostic skills. The technical challenge is threefold: (1) detect source type from user input without ambiguity, (2) get WordPress files into `local_path` for each non-SSH source using the right acquisition method, and (3) add a `source_type` field to `sites.json` that gates which skill categories are available and makes that capability state visible to users.

The codebase is a CoWork markdown-based plugin with no custom MCP server. All logic is expressed as procedural instructions in COMMAND.md and SKILL.md files, executed by Claude using Bash tool calls. The existing `/connect` command already handles the full SSH flow: conversational gathering, SSH verification, WordPress validation, WP-CLI probing, rsync, and atomic sites.json updates. Phase 5 does not replace that flow — it adds conditional branches before the SSH-specific steps, routes to a parallel acquisition flow per source type, and converges on the same `local_path` population and profile save that SSH already does.

The critical design insight is that all four source types end up with WordPress files in `local_path` on the local filesystem. After that point, all existing diagnostic skills run identically: they read from `local_path`. The only difference between source types post-acquisition is which skills are gated (DB-dependent skills need WP-CLI, which requires a live connection: SSH or Docker exec with WP-CLI installed). Git and local sources without WP-CLI locally get file-analysis-only skills.

**Primary recommendation:** Structure Phase 5 as four sequential tasks: (1) source type detection + `/connect` menu, (2) sites.json schema extension with `source_type` field, (3) source-specific acquisition flows (local/Docker/git), and (4) capability summary display and skill gating in `/diagnose`. Use the existing jq atomic-update pattern from `/connect` throughout; no new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Connection detection:**
- Auto-detect source type from user input: paths starting with / or . are local, docker container names/IDs are Docker, git URLs (https://, git@) are git, user@host is SSH
- If auto-detection is ambiguous, ask the user to clarify (don't silently guess)
- /connect with no arguments shows a source type menu first: SSH / Local / Docker / Git
- For local directories, validate WordPress by checking multiple markers (wp-config.php, wp-includes/, wp-admin/) — warn on partial match

**Docker workflow:**
- Accept direct container name/ID, but also offer to list running containers if none specified
- Probe known WP paths in order (/var/www/html, /app/public, /var/www, etc.); if none found, ask the user for the path
- File access: detect bind mounts first and read from host filesystem directly; fall back to docker cp if no bind mounts
- WP-CLI via docker exec is optional — probe for it, enable DB skills if available, skip DB skills gracefully if not

**Git clone behavior:**
- Allow user to point to an existing local checkout rather than requiring a fresh clone
- Fresh clones use --depth 1 (shallow) by default for speed
- Use default branch, but mention other branches and offer to switch if multiple exist
- On reconnect to existing git profile, ask whether to pull latest changes (don't auto-pull)

**Capability gaps UX:**
- Show capability summary at connection time: which skill categories are available for this source type
- Also show inline skip messages during diagnostics when a skill is skipped due to source type
- For local directories, probe for WP-CLI availability locally — enable DB skills if WP-CLI and wp-config.php DB access are present
- Profiles are single source type — no "upgrade" path from git to SSH. User creates a separate profile if they need DB access.

### Claude's Discretion

- Source type badge/label format in /status output
- Exact probe sequence ordering for Docker WP path detection
- Container listing format and filtering heuristics
- Capability summary visual format

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MSRC-01 | User can connect to a local WordPress directory without SSH | Local path detection + validation markers + local WP-CLI probe |
| MSRC-02 | User can connect to a WordPress site running in a Docker container | docker inspect bind mount detection + docker cp fallback + docker exec WP-CLI probe |
| MSRC-03 | User can clone a remote git repository containing WordPress code for analysis | git clone --depth 1 + .sites/{name}/ target + branch listing via git ls-remote |
| MSRC-04 | User can point at an already-cloned local git repository for analysis | Existing local checkout treated as local source type after git-specific metadata stored |
| MSRC-05 | Plugin detects source type and routes commands through appropriate execution path | Auto-detection regex patterns for input classification + menu fallback for ambiguous input |
| MSRC-06 | Plugin restricts available skills based on source capabilities | source_type + wpcli_available flags in profile; diagnose reads these to gate WP-CLI-dependent skills |
| MSRC-07 | Sites.json stores source type per profile with backward-compatible default to SSH | New `source_type` field with default "ssh"; existing profiles without field treated as ssh |
</phase_requirements>

## Standard Stack

### Core (All Existing — No New Dependencies)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Bash | 3.2+ | Source detection, acquisition flows, all command logic | Already used for entire plugin; native on macOS/Linux |
| jq | 1.6+ | sites.json reads/writes (atomic temp-file pattern) | Already used everywhere in plugin; handles all JSON safely |
| docker CLI | 27.5.1 (verified locally) | Container listing, inspect, exec, cp commands | Standard Docker CLI; required for Docker source type |
| git | 2.45.0 (verified locally) | Shallow clone, branch listing, pull | Standard git; required for git source type |

### No New Dependencies

This phase adds zero new tools. All needed capabilities exist:
- Source type detection: bash `case` + regex matching
- Local validation: `test -f`, `test -d` — already used in existing `/connect`
- Docker bind mounts: `docker inspect --format='{{json .Mounts}}'` — verified working on this machine
- Docker file copy: `docker cp CONTAINER:/path /local/path`
- Docker exec: `docker exec CONTAINER command`
- Git clone: `git clone --depth 1 URL .sites/name/`
- Git branch list: `git -C path branch -r` or `git ls-remote --heads URL`
- Git pull: `git -C path pull`

**Installation:** None required.

## Architecture Patterns

### Pattern 1: Source Type Detection with Fallback Menu

**What:** Classify user input into one of four source types using pattern matching. If ambiguous, ask. If no argument, show menu.

**When to use:** At the very start of the `/connect` command, before any source-specific logic.

**Implementation:**

```bash
detect_source_type() {
  local input="$1"

  # No input: show menu
  if [ -z "$input" ]; then
    echo "What would you like to connect to?"
    echo "  1) SSH — remote server via SSH"
    echo "  2) Local — local WordPress directory"
    echo "  3) Docker — WordPress in a Docker container"
    echo "  4) Git — clone a git repository"
    echo ""
    echo "Type the number or enter your target directly:"
    return
  fi

  # Git URL patterns (must check before SSH user@host)
  if echo "$input" | grep -qE "^(https?://|git@|git://)"; then
    echo "git"
    return
  fi

  # Local path patterns
  if echo "$input" | grep -qE "^[./]|^~"; then
    echo "local"
    return
  fi

  # SSH: user@host pattern
  if echo "$input" | grep -qE "^[a-zA-Z0-9_-]+@[a-zA-Z0-9._-]+$"; then
    echo "ssh"
    return
  fi

  # Docker: alphanumeric container name or short hash (ambiguous with SSH alias)
  # Ambiguous: could be SSH config alias or Docker container name
  # Ask the user
  echo "ambiguous"
}
```

**Ambiguity handling:** A bare alphanumeric token like `mysite` could be an SSH config alias or a Docker container name. Detection returns `ambiguous` and prompts the user to clarify rather than silently guessing.

### Pattern 2: Local Source Acquisition

**What:** Validate an existing local WordPress directory path and use it as `local_path` without any file copying.

**When to use:** Source type is `local`.

**Implementation:**

```bash
connect_local() {
  local input_path="$1"

  # Expand ~ and resolve to absolute path
  local wp_path="${input_path/#\~/$HOME}"
  wp_path=$(realpath "$wp_path" 2>/dev/null || echo "$wp_path")

  # Validate WordPress markers (multi-marker check, warn on partial)
  local markers_found=0
  local markers_total=4
  test -f "$wp_path/wp-config.php"  && markers_found=$((markers_found + 1))
  test -d "$wp_path/wp-includes/"   && markers_found=$((markers_found + 1))
  test -d "$wp_path/wp-admin/"      && markers_found=$((markers_found + 1))
  test -f "$wp_path/wp-load.php"    && markers_found=$((markers_found + 1))

  if [ "$markers_found" -eq 0 ]; then
    echo "ERROR: No WordPress markers found at $wp_path"
    echo "Expected: wp-config.php, wp-includes/, wp-admin/, wp-load.php"
    exit 1
  fi

  if [ "$markers_found" -lt "$markers_total" ]; then
    echo "WARNING: Partial WordPress installation at $wp_path"
    echo "Found $markers_found of $markers_total expected markers."
    echo "Proceed with caution — some diagnostics may fail."
    # Ask user: "Continue anyway? (y/n)"
  fi

  # For local source, local_path IS wp_path (no copying needed)
  LOCAL_PATH="$wp_path"
  WP_PATH="$wp_path"
  SOURCE_TYPE="local"

  # Probe for local WP-CLI
  WP_CLI_PATH=$(which wp 2>/dev/null || echo "null")
}
```

**Key insight:** For local source, `local_path` and `wp_path` are the same value. The diagnostic skills already read from `local_path`, so no file copying is ever needed for local sources.

### Pattern 3: Docker Source Acquisition

**What:** Locate WordPress inside a named Docker container, then either use the host-side bind mount path directly or fall back to `docker cp`.

**When to use:** Source type is `docker`.

**Implementation:**

```bash
connect_docker() {
  local container="$1"

  # If no container specified, list running containers
  if [ -z "$container" ]; then
    echo "Running containers:"
    docker ps --format "  {{.Names}} ({{.Image}})" 2>/dev/null
    echo ""
    echo "Enter container name or ID:"
    # read container
    return
  fi

  # Verify container exists and is running
  local container_status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
  if [ "$container_status" != "running" ]; then
    echo "ERROR: Container '$container' is not running (status: ${container_status:-not found})"
    exit 1
  fi

  # Probe for WordPress in known paths
  local WP_PATHS_TO_CHECK=(
    "/var/www/html"
    "/app/public"
    "/var/www"
    "/var/www/wordpress"
    "/usr/share/nginx/html"
    "/srv/www"
  )

  local container_wp_path=""
  for path in "${WP_PATHS_TO_CHECK[@]}"; do
    if docker exec "$container" test -f "$path/wp-config.php" 2>/dev/null; then
      container_wp_path="$path"
      break
    fi
  done

  if [ -z "$container_wp_path" ]; then
    echo "WordPress not found in standard paths. Enter the path inside the container:"
    # read container_wp_path
  fi

  # Check for bind mount covering wp_path — prefer host filesystem
  local bind_source=""
  bind_source=$(docker inspect --format='{{json .Mounts}}' "$container" 2>/dev/null | \
    jq -r --arg path "$container_wp_path" \
    '.[] | select(.Type == "bind") | select($path | startswith(.Destination)) | .Source' | \
    head -1)

  if [ -n "$bind_source" ]; then
    # Use host-side bind mount path — no docker cp needed
    echo "Using host bind mount: $bind_source"
    LOCAL_PATH="$bind_source"
    FILE_ACCESS="bind_mount"
  else
    # Fall back to docker cp
    local site_slug=$(echo "$container" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')
    LOCAL_PATH=".sites/${site_slug}/"
    mkdir -p "$LOCAL_PATH"
    echo "Copying files from container (no bind mount found)..."
    docker cp "${container}:${container_wp_path}/." "$LOCAL_PATH" 2>&1
    FILE_ACCESS="docker_cp"
  fi

  SOURCE_TYPE="docker"
  CONTAINER_NAME="$container"
  WP_PATH="$container_wp_path"

  # Probe WP-CLI inside container
  WP_CLI_PATH=$(docker exec "$container" which wp 2>/dev/null || echo "null")
}
```

**Verified:** `docker inspect --format='{{json .Mounts}}'` returns an array with `Type`, `Source`, `Destination`, `Mode`, `RW`, `Propagation` fields. Filter by `Type == "bind"` and check if `Destination` is a prefix of the discovered WP path. Source code verified against running local container.

### Pattern 4: Git Source Acquisition

**What:** Clone a git repository (shallow) into `.sites/{name}/` or accept a path to an existing local checkout.

**When to use:** Source type is `git`.

**Implementation:**

```bash
connect_git() {
  local git_url="$1"

  # Check if it's an existing local path that looks like a git repo
  if echo "$git_url" | grep -qE "^[./~]" && [ -d "${git_url}/.git" ]; then
    # Existing local checkout
    local abs_path=$(realpath "$git_url" 2>/dev/null || echo "$git_url")
    LOCAL_PATH="$abs_path"
    WP_PATH="$abs_path"
    SOURCE_TYPE="git"
    GIT_REMOTE=$(git -C "$abs_path" remote get-url origin 2>/dev/null || echo "none")
    GIT_BRANCH=$(git -C "$abs_path" branch --show-current 2>/dev/null || echo "unknown")

    # Detect multiple branches and mention them
    local branch_count=$(git -C "$abs_path" branch -r 2>/dev/null | wc -l | tr -d ' ')
    if [ "$branch_count" -gt 1 ]; then
      echo "Current branch: $GIT_BRANCH"
      echo "Other branches available:"
      git -C "$abs_path" branch -r 2>/dev/null | grep -v HEAD | head -5 | sed 's/.*origin\//  /'
      echo "Switch branch? (enter branch name, or press Enter to keep $GIT_BRANCH)"
      # read branch_choice
    fi
    return
  fi

  # Fresh clone — generate site slug from URL
  local site_slug=$(echo "$git_url" | sed 's|.*[:/]||; s|\.git$||' | \
    tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')
  LOCAL_PATH=".sites/${site_slug}/"
  mkdir -p "$(dirname "$LOCAL_PATH")"

  # List branches first (lightweight, no full clone)
  local branch_list=$(git ls-remote --heads "$git_url" 2>/dev/null | \
    sed 's|.*refs/heads/||' | head -10)
  local branch_count=$(echo "$branch_list" | wc -l | tr -d ' ')
  local default_branch=$(git ls-remote --symref "$git_url" HEAD 2>/dev/null | \
    grep "^ref:" | sed 's|ref: refs/heads/||; s|\s.*||')
  default_branch="${default_branch:-main}"

  if [ "$branch_count" -gt 1 ]; then
    echo "Repository has $branch_count branches. Using default: $default_branch"
    echo "Other branches: $(echo "$branch_list" | grep -v "^$default_branch$" | head -4 | tr '\n' ', ')"
    echo "Clone a different branch? (enter branch name, or press Enter to use $default_branch)"
    # read branch_choice
  fi

  CLONE_BRANCH="${branch_choice:-$default_branch}"

  # Shallow clone
  echo "Cloning $git_url (branch: $CLONE_BRANCH, shallow)..."
  git clone --depth 1 --branch "$CLONE_BRANCH" "$git_url" "$LOCAL_PATH" 2>&1
  CLONE_EXIT=$?

  if [ $CLONE_EXIT -ne 0 ]; then
    echo "ERROR: Clone failed. Check URL and network connectivity."
    rm -rf "$LOCAL_PATH"
    exit 1
  fi

  SOURCE_TYPE="git"
  WP_PATH="$LOCAL_PATH"
  GIT_REMOTE="$git_url"
  GIT_BRANCH="$CLONE_BRANCH"

  # Git sources have no DB access. Check for local WP-CLI anyway (unlikely to help without DB)
  WP_CLI_PATH=$(which wp 2>/dev/null || echo "null")
}
```

**Reconnect behavior:** When `/connect` is called with a git profile name that already exists, ask whether to pull latest changes: `git -C "$LOCAL_PATH" pull` if yes. Do not auto-pull.

### Pattern 5: sites.json Schema Extension (MSRC-07)

**What:** Add `source_type` field to sites.json profiles. Missing field defaults to `ssh` for backward compatibility with existing profiles.

**New profile fields added:**

```json
{
  "source_type": "local",
  "container_name": null,
  "git_remote": null,
  "git_branch": null,
  "file_access": "direct"
}
```

**Complete updated profile structure:**

```json
{
  "sites": {
    "existing-ssh-site": {
      "host": "example.com",
      "user": "wpuser",
      "ssh_key": "~/.ssh/prod-key",
      "wp_path": "/var/www/html",
      "local_path": ".sites/existing-ssh-site",
      "wp_version": "6.4.3",
      "site_url": "https://example.com",
      "wp_cli_path": "/usr/local/bin/wp",
      "last_sync": "2026-02-18T12:00:00Z",
      "created_at": "2026-01-01T00:00:00Z",
      "environment": "production",
      "is_default": true,
      "notes": null
    },
    "local-dev": {
      "host": null,
      "user": null,
      "ssh_key": null,
      "wp_path": "/Users/robertli/sites/mysite",
      "local_path": "/Users/robertli/sites/mysite",
      "wp_version": "6.7.0",
      "site_url": "http://localhost",
      "wp_cli_path": "/usr/local/bin/wp",
      "last_sync": "2026-02-18T12:00:00Z",
      "created_at": "2026-02-18T12:00:00Z",
      "environment": "local",
      "is_default": false,
      "notes": null,
      "source_type": "local",
      "container_name": null,
      "git_remote": null,
      "git_branch": null,
      "file_access": "direct"
    },
    "docker-wp": {
      "host": null,
      "user": null,
      "ssh_key": null,
      "wp_path": "/var/www/html",
      "local_path": "/Users/robertli/projects/wordpress/html",
      "wp_version": "6.7.0",
      "site_url": "http://localhost:8080",
      "wp_cli_path": "/usr/local/bin/wp",
      "last_sync": "2026-02-18T12:00:00Z",
      "created_at": "2026-02-18T12:00:00Z",
      "environment": "docker",
      "is_default": false,
      "notes": null,
      "source_type": "docker",
      "container_name": "wordpress",
      "git_remote": null,
      "git_branch": null,
      "file_access": "bind_mount"
    },
    "git-theme-review": {
      "host": null,
      "user": null,
      "ssh_key": null,
      "wp_path": ".sites/git-theme-review",
      "local_path": ".sites/git-theme-review",
      "wp_version": "6.7.0",
      "site_url": null,
      "wp_cli_path": null,
      "last_sync": "2026-02-18T12:00:00Z",
      "created_at": "2026-02-18T12:00:00Z",
      "environment": "git",
      "is_default": false,
      "notes": null,
      "source_type": "git",
      "container_name": null,
      "git_remote": "https://github.com/example/wp-theme.git",
      "git_branch": "main",
      "file_access": "direct"
    }
  }
}
```

**Backward compatibility:** Existing SSH profiles without `source_type` are treated as `source_type: "ssh"` throughout. Read with: `jq -r '.source_type // "ssh"'`.

**jq atomic update pattern for new fields:**

```bash
jq --arg name "$SITE_NAME" \
   --arg source_type "$SOURCE_TYPE" \
   --arg container_name "${CONTAINER_NAME:-null}" \
   --arg git_remote "${GIT_REMOTE:-null}" \
   --arg git_branch "${GIT_BRANCH:-null}" \
   --arg file_access "${FILE_ACCESS:-direct}" \
   '.sites[$name].source_type = $source_type |
    .sites[$name].container_name = (if $container_name == "null" then null else $container_name end) |
    .sites[$name].git_remote = (if $git_remote == "null" then null else $git_remote end) |
    .sites[$name].git_branch = (if $git_branch == "null" then null else $git_branch end) |
    .sites[$name].file_access = $file_access' sites.json > /tmp/sites.json.tmp
```

### Pattern 6: Capability Summary Display (MSRC-06)

**What:** At connection time, show the user which skill categories are available. In `/diagnose`, gate WP-CLI-dependent skills based on profile flags.

**Capability matrix by source type:**

| Capability | SSH | Local | Docker | Git |
|-----------|-----|-------|--------|-----|
| File analysis (code quality, malware) | YES | YES | YES | YES |
| WordPress config check | YES | YES | YES | YES |
| DB / WP-CLI skills (core-integrity, user-audit, version-audit) | If WP-CLI installed | If local wp + DB access | If docker exec wp works | NO |
| File resync on next diagnose | YES (rsync) | NO (already local) | NO (bind mount) / YES (docker cp) | NO (git pull optional) |

**Capability summary at connection time:**

```
Connected: local-dev [LOCAL]

Available capabilities:
  [x] Code quality analysis
  [x] Malware scan
  [x] WordPress configuration security
  [ ] Database analysis (WP-CLI not found locally — install wp-cli to enable)
  [ ] User account audit (requires WP-CLI)
  [ ] Version audit (requires WP-CLI)

To enable DB skills: install WP-CLI locally (https://wp-cli.org)
```

**Skill gating in /diagnose:**

```bash
SOURCE_TYPE=$(jq -r ".sites[\"$SITE_NAME\"].source_type // \"ssh\"" sites.json)
WP_CLI_PATH=$(jq -r ".sites[\"$SITE_NAME\"].wp_cli_path" sites.json)

# Gate WP-CLI dependent skills based on source type + WP-CLI availability
WP_CLI_SKILLS=("diagnostic-core-integrity" "diagnostic-user-audit" "diagnostic-version-audit")

for skill in "${WP_CLI_SKILLS[@]}"; do
  if [ "$WP_CLI_PATH" == "null" ] || [ -z "$WP_CLI_PATH" ]; then
    echo "[$skill] Skipped — WP-CLI not available for $SOURCE_TYPE source"
    SKILLS_SKIPPED+=("$skill (source: $SOURCE_TYPE, no WP-CLI)")
    continue
  fi
  # run skill
done
```

**Inline skip message format:** `[Core Integrity Check] Skipped — WP-CLI not available (git source). Connect via SSH or Docker with WP-CLI for DB analysis.`

### Pattern 7: /connect Command Flow Extension

**What:** The existing /connect flow needs a branch point at the very start. After source type is determined, each type runs its own acquisition path, then all paths converge on the existing profile save logic.

**Revised /connect top-level flow:**

```
1. Parse input argument
2. Check for saved profile shortcut (existing logic, unchanged)
3. Detect source type from input
   → If ambiguous or no input: show menu / ask
4. Branch to source-specific flow:
   SSH  → existing steps 2-9 in COMMAND.md (unchanged)
   Local → connect_local() then skip to step 9
   Docker → connect_docker() then WP-CLI probe + skip to step 9
   Git   → connect_git() then skip to step 9
5. Auto-gather WordPress info (if WP-CLI available for the source type)
6. Save profile to sites.json (existing jq pattern + new source_type fields)
7. Show capability summary
8. Update hot cache (mental model update)
```

### Pattern 8: /status Source Type Badge

**What:** Display source type as a badge in `/status` output to help users quickly identify what kind of source each profile is.

**Format recommendation (Claude's Discretion):**

```
### local-dev  [LOCAL]  [DEFAULT]
- Source: local directory
- WordPress: 6.7.0 at http://localhost
- Local files: /Users/robertli/sites/mysite
...

### docker-wp  [DOCKER]
- Source: wordpress container (bind mount)
- WordPress: 6.7.0 at http://localhost:8080
...

### git-theme-review  [GIT]
- Source: git@github.com:example/wp-theme.git (main)
- WordPress: 6.7.0 — static analysis only
...
```

**Reading source type for badge:**

```bash
SOURCE_TYPE=$(echo "$SITE_DATA" | jq -r '.source_type // "ssh"')
case "$SOURCE_TYPE" in
  "ssh")    BADGE="[SSH]" ;;
  "local")  BADGE="[LOCAL]" ;;
  "docker") BADGE="[DOCKER]" ;;
  "git")    BADGE="[GIT]" ;;
  *)        BADGE="[UNKNOWN]" ;;
esac
```

### Anti-Patterns to Avoid

**1. Silent source type guessing when ambiguous**
- Why it's bad: A bare token like `mywordpress` could be an SSH config alias, a Docker container name, or even a partial path. Silently choosing wrong means broken connection with confusing errors.
- What to do instead: Return `ambiguous`, display both possibilities, ask user to clarify.

**2. Always running docker cp when a bind mount is available**
- Why it's bad: docker cp copies files unnecessarily, takes time, and creates a stale snapshot. Bind mount gives direct, always-current host filesystem access.
- What to do instead: Inspect mounts first with `docker inspect --format='{{json .Mounts}}'`, use `Source` path if `Type == "bind"` and `Destination` matches the WP path.

**3. Auto-pulling git repos on reconnect**
- Why it's bad: User may have local changes or be on a deliberate commit; auto-pull can break their working state unexpectedly.
- What to do instead: Ask: "Pull latest changes from origin? (y/n)". Default: no.

**4. Deep cloning git repos**
- Why it's bad: WordPress repos (especially with theme/plugin history) can be hundreds of MB. Full clone for code analysis is wasteful.
- What to do instead: `git clone --depth 1` always for fresh clones. User can manually deepen later if needed.

**5. Treating partial WordPress validation failure as a fatal error for local/git sources**
- Why it's bad: A repo containing only wp-content/ (common for theme-only repos) would fail full WordPress validation but is still valid for code quality analysis.
- What to do instead: Warn on partial match, note which markers were missing, ask user to confirm, and adjust capability summary accordingly (fewer skills available).

**6. Using host SSH fields (host, user, ssh_key) in non-SSH profiles**
- Why it's bad: Skills that blindly read `host` and `user` from profiles will attempt SSH commands on local/docker/git sources and fail confusingly.
- What to do instead: Skills must check `source_type` before constructing SSH commands. Store `null` for SSH fields in non-SSH profiles.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Docker bind mount detection | Custom path-matching script | `docker inspect --format='{{json .Mounts}}'` + jq `.Type == "bind"` filter | Docker already exposes this reliably; custom path matching misses edge cases |
| Container name disambiguation | Fuzzy string matching | `docker ps --format '{{.Names}}'` + exact match | Docker CLI handles container ID prefix matching natively |
| Git branch listing before clone | Full clone then branch list | `git ls-remote --heads URL` | Lists branches without downloading the repo (fast, no disk usage) |
| Default branch detection | Assume "main" or "master" | `git ls-remote --symref URL HEAD` | Repositories vary; symref query is authoritative |
| WordPress path probing in container | Custom filesystem walk | Sequential `docker exec CONTAINER test -f PATH/wp-config.php` for known paths | Simple ordered probe is fast enough; custom walk risks permissions issues |
| JSON null handling in bash | `[ "$val" == "" ]` checks | `jq -r '.field // "ssh"'` with null-coalescing | jq handles JSON null correctly; bash string comparison fails on null |

**Key insight:** Every non-SSH acquisition operation (Docker inspect, docker cp, git clone, git ls-remote) uses standard CLI tools that are already on the developer's machine. No custom libraries needed.

## Common Pitfalls

### Pitfall 1: Docker WP Path Where Bind Mount Is Only Partial

**What goes wrong:** Container has a bind mount at `/var/www/html/wp-content` (common pattern: mount only uploads or plugins), but the probe finds WordPress at `/var/www/html`. The bind `Destination` is `/var/www/html/wp-content`, which is a subdirectory of the WP path but not the WP path itself. jq filter `startswith(.Destination)` fails to match.

**Why it happens:** The bind mount detection logic filters bind mounts where `Destination` is a prefix of `container_wp_path`. But when the mount covers only a subdirectory (e.g., `wp-content`), the logic is inverted — the mount destination is a suffix of the WP path, not a prefix.

**How to avoid:** Check both directions: `startswith(.Destination)` OR `.Destination | startswith($path)`. If only a subdirectory is bind-mounted, fall back to `docker cp` for the WP root (since only part of the tree is on the host). Document this in the implementation.

**Warning signs:** `local_path` exists but is missing PHP files outside wp-content; code quality skill finds no PHP files.

### Pitfall 2: git clone --depth 1 Fails for Private Repos Needing SSH Key

**What goes wrong:** User provides `git@github.com:org/private-repo.git`. Clone requires SSH key authentication. If the user's SSH agent is not forwarded or the key is not in `~/.ssh/`, the clone fails silently or hangs waiting for passphrase.

**Why it happens:** git uses SSH transport for `git@` URLs. Unlike the plugin's SSH connection flow (which explicitly specifies `-i key_path`), `git clone` uses whatever SSH configuration is active in the shell.

**How to avoid:** If clone fails with auth error, suggest: "Check that your SSH key is loaded (`ssh-add -l`), or use the HTTPS URL with a personal access token." Do not try to handle this automatically — SSH key management for git is user-controlled.

**Warning signs:** Clone hangs, or exits with "Permission denied (publickey)".

### Pitfall 3: Local Path Containing Symlinks

**What goes wrong:** User provides `/var/www/html` which is a symlink to `/home/user/wordpress`. `realpath` resolves it, but `test -f "$wp_path/wp-config.php"` works on the resolved path. However, skills may construct paths by joining the original symlink path with filenames, causing inconsistent behavior.

**Why it happens:** `realpath` is not always consistent across macOS and Linux, and some filesystem operations follow symlinks while others don't.

**How to avoid:** Always call `realpath "$input_path" 2>/dev/null || echo "$input_path"` and store the resolved path in `local_path`. Use the resolved path consistently. Document that symlinks are resolved.

**Warning signs:** File paths in diagnostic output look different from what the user entered.

### Pitfall 4: Docker Container Running but WP Path Not Found

**What goes wrong:** All known WP paths fail the `docker exec test -f` probe. Plugin asks user for path. User provides `/app/wordpress`. Plugin saves this, but later skills read `wp_path` from sites.json and try `docker exec` again — which works during connection but fails if the container was rebuilt with a different image.

**Why it happens:** Docker containers are ephemeral. A path valid at connection time may not exist after container rebuild. This is inherent to Docker workflow, not a code bug.

**How to avoid:** On reconnect, re-probe the stored WP path: `docker exec "$CONTAINER_NAME" test -f "$WP_PATH/wp-config.php"`. If it fails, warn the user and re-run the path detection probe.

**Warning signs:** `/diagnose` on a Docker profile works first time, fails after `docker compose up --build`.

### Pitfall 5: Skills Assume SSH Resync Before Running

**What goes wrong:** The `/diagnose` command's Section 3 runs a silent rsync resync before skills execute. For local, docker (bind mount), and git sources, rsync to a remote host makes no sense. If the code blindly runs rsync with `null` values for host/user, it generates confusing errors.

**Why it happens:** The existing `/diagnose` COMMAND.md assumes SSH. Section 3 needs source-type gating.

**How to avoid:** Gate resync logic based on source type:
- SSH: rsync as before
- Local: skip resync (files are already live on disk)
- Docker (bind mount): skip resync (host path is always current)
- Docker (docker cp): optionally re-run docker cp if user wants fresh data
- Git: skip auto-resync; offer `git pull` on demand (per user decision: don't auto-pull)

**Warning signs:** `/diagnose` on a local source shows "rsync: [receiver] error opening connection" errors.

### Pitfall 6: Ambiguous Detection of Git URL vs Local Path for Existing Checkouts

**What goes wrong:** User types `/connect /Users/me/projects/my-wp-site` — this is a local path but it's also a git checkout. Detection routes to `local`, skipping git metadata capture (no `git_remote`, `git_branch` stored in profile). On reconnect, the profile has no branch info and can't offer to pull.

**Why it happens:** The detection regex for local paths fires before any git check.

**How to avoid:** After classifying as `local`, additionally check: `test -d "$wp_path/.git"`. If it's a git repo, upgrade to `source_type: "git"` and capture git metadata (remote URL, current branch). Or inform user: "This looks like a git repository — would you like to connect it as Git type? (enables branch switching and pull on reconnect)".

**Warning signs:** User connects a local git checkout as "local", later can't switch branches through the plugin.

## Code Examples

Verified patterns from direct testing on this machine:

### Docker Bind Mount Detection

```bash
# Verified output format from Docker 27.5.1 on macOS:
# docker inspect --format='{{json .Mounts}}' CONTAINER
# Returns JSON array with fields: Type, Source, Destination, Mode, RW, Propagation

CONTAINER="wordpress"
WP_PATH="/var/www/html"

# Find bind mount that covers the WP path
bind_source=$(docker inspect --format='{{json .Mounts}}' "$CONTAINER" 2>/dev/null | \
  jq -r --arg path "$WP_PATH" \
  '.[] | select(.Type == "bind") | select($path | startswith(.Destination)) | .Source' | \
  head -1)

if [ -n "$bind_source" ]; then
  echo "Using bind mount: $bind_source"
  LOCAL_PATH="$bind_source"
else
  echo "No bind mount found, falling back to docker cp"
  LOCAL_PATH=".sites/${CONTAINER}/"
  mkdir -p "$LOCAL_PATH"
  docker cp "${CONTAINER}:${WP_PATH}/." "$LOCAL_PATH"
fi
```

### Git Shallow Clone with Branch Detection

```bash
# Verified: git 2.45.0, git ls-remote works
GIT_URL="https://github.com/example/wordpress-site.git"
SITE_SLUG="wordpress-site"

# List remote branches without cloning (fast)
default_branch=$(git ls-remote --symref "$GIT_URL" HEAD 2>/dev/null | \
  grep "^ref:" | sed 's|ref: refs/heads/||; s|\s.*||')
default_branch="${default_branch:-main}"

branch_count=$(git ls-remote --heads "$GIT_URL" 2>/dev/null | wc -l | tr -d ' ')

if [ "$branch_count" -gt 1 ]; then
  echo "Default branch: $default_branch ($branch_count branches total)"
  echo "Other branches:"
  git ls-remote --heads "$GIT_URL" 2>/dev/null | sed 's|.*refs/heads/||' | grep -v "^$default_branch$" | head -5
fi

# Shallow clone
git clone --depth 1 --branch "$default_branch" "$GIT_URL" ".sites/$SITE_SLUG/" 2>&1
```

### Git Pull for Reconnect

```bash
# On reconnect to existing git profile
LOCAL_PATH=".sites/my-wp-site"
GIT_BRANCH="main"

echo "Last connected to $GIT_BRANCH branch."
echo "Pull latest changes from origin? (y/n)"
read PULL_CHOICE

if [ "$PULL_CHOICE" = "y" ]; then
  git -C "$LOCAL_PATH" pull origin "$GIT_BRANCH" 2>&1
  if [ $? -eq 0 ]; then
    echo "Pulled latest changes."
  else
    echo "Pull failed. Check network and repository access."
  fi
else
  echo "Using existing local files."
fi
```

### Backward-Compatible source_type Read

```bash
# Read source_type, default to "ssh" for profiles without the field
SOURCE_TYPE=$(jq -r ".sites[\"$SITE_NAME\"].source_type // \"ssh\"" sites.json)

# Reading null-able fields from profile
CONTAINER_NAME=$(jq -r ".sites[\"$SITE_NAME\"].container_name // empty" sites.json)
GIT_REMOTE=$(jq -r ".sites[\"$SITE_NAME\"].git_remote // empty" sites.json)
```

### Capability Summary at Connection Time

```bash
show_capability_summary() {
  local source_type="$1"
  local wp_cli_path="$2"

  local wpcli_available=false
  if [ -n "$wp_cli_path" ] && [ "$wp_cli_path" != "null" ]; then
    wpcli_available=true
  fi

  echo ""
  echo "Capabilities for this connection:"
  echo "  [x] Code quality analysis"
  echo "  [x] Malware scan"
  echo "  [x] WordPress configuration security"

  if [ "$wpcli_available" = "true" ]; then
    echo "  [x] Database analysis (WP-CLI available)"
    echo "  [x] User account audit"
    echo "  [x] Version audit"
  else
    local reason=""
    case "$source_type" in
      "git")    reason="git source — no live WordPress DB" ;;
      "local")  reason="WP-CLI not found locally" ;;
      "docker") reason="WP-CLI not found in container" ;;
      *)        reason="WP-CLI not installed" ;;
    esac
    echo "  [ ] Database analysis ($reason)"
    echo "  [ ] User account audit ($reason)"
    echo "  [ ] Version audit ($reason)"
  fi
  echo ""
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Plugin assumes SSH for all connections | source_type field routes to local/docker/git paths | Enables local dev workflow without SSH overhead |
| docker cp always | Bind mount detection first, docker cp fallback | Faster reconnect; live file access for bind-mounted containers |
| Full git clone | `git clone --depth 1` | WordPress repos: 200MB full vs ~20MB shallow |
| Hard-coded SSH skill prerequisites | source_type-aware capability gating | Skills skip gracefully instead of failing with SSH errors |

**No deprecated approaches in this phase** — all patterns are additive to the existing SSH-first design.

## Open Questions

1. **What happens if a Docker container is stopped when /diagnose runs?**
   - What we know: `docker exec` on a stopped container fails immediately with "container is not running"
   - What's unclear: Should we try to `docker start CONTAINER` automatically, or fail and guide user?
   - Recommendation: Fail with clear message: "Container '$CONTAINER_NAME' is not running. Start it with `docker start $CONTAINER_NAME` then run `/diagnose` again." Do not auto-start — user may have stopped it intentionally.

2. **For Docker with docker cp (no bind mount): should /diagnose re-copy files or use cached copy?**
   - What we know: `last_sync` timestamp in profile tracks when docker cp last ran. The user decision says no auto-pull for git; similar spirit applies here.
   - What's unclear: Should diagnose silently re-copy, or treat cached copy as fresh?
   - Recommendation: Re-copy files before diagnostics (same as SSH rsync behavior). docker cp is fast for typical WP installs. Suppress verbose output, show "Syncing from container..." message.

3. **How should /status show the last_sync for local and git sources?**
   - What we know: For SSH, last_sync is the rsync timestamp. For local sources, files are always current — last_sync is misleading.
   - What's unclear: Show "N/A" or the connection timestamp?
   - Recommendation: For local and git (bind mount) sources, show "Live (direct access)" instead of a timestamp. For docker cp and git pull, show the last copy/pull timestamp.

## Sources

### Primary (HIGH confidence)

- **Existing codebase** — `commands/connect/COMMAND.md`, `commands/diagnose/COMMAND.md`, `commands/status/COMMAND.md`, `sites.json.example` — verified all existing patterns, JSON schema, skill execution flow
- **Docker 27.5.1 live verification** — `docker inspect --format='{{json .Mounts}}' n8n` confirmed bind mount JSON format with `Type`, `Source`, `Destination` fields; confirmed `docker exec` and `docker ps` CLI behavior
- **git 2.45.0 live verification** — `git ls-remote --heads`, `git ls-remote --symref` confirmed working; `git clone --depth 1` syntax verified via `git --help`

### Secondary (MEDIUM confidence)

- **Docker documentation** (docs.docker.com) — `docker inspect` Mounts format, `docker cp` syntax, `docker exec` with WP-CLI; patterns consistent with Docker 27 behavior
- **git documentation** (git-scm.com) — `--depth` shallow clone, `ls-remote --symref` for default branch detection; stable since git 2.x

### Tertiary (LOW confidence)

None — all critical claims verified via live execution or direct codebase review.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified on local machine (docker 27.5.1, git 2.45.0, jq, bash)
- Architecture patterns: HIGH — based directly on existing codebase patterns plus verified CLI commands
- Pitfalls: HIGH — derived from actual edge cases in Docker/git tooling behavior, verified against real tool output
- sites.json schema: HIGH — directly extends existing schema verified from sites.json.example

**Research date:** 2026-02-18
**Valid until:** 90 days (stable domain — Docker CLI and git CLI change slowly; existing codebase patterns are stable)
