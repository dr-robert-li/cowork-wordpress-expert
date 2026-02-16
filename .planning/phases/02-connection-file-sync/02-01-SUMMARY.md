---
phase: 02-connection-file-sync
plan: 01
subsystem: connection
tags: [ssh, connection, sync, wp-cli, rsync]
dependency_graph:
  requires: [01-plugin-foundation]
  provides: [ssh-connection-workflow, site-profile-management, file-sync-capability]
  affects: [commands/connect, sites.json, CLAUDE.md]
tech_stack:
  added: []
  patterns: [conversational-ssh-flow, atomic-json-updates, rsync-exclusions, wp-cli-detection]
key_files:
  created:
    - commands/connect/COMMAND.md
    - .sites/.gitkeep
  modified:
    - sites.json.example
    - CLAUDE.md
decisions:
  - "Conversational SSH gathering: one detail at a time for better UX"
  - "SSH config alias resolution using ssh -G for canonical values"
  - "Auto-save every connection to sites.json by default"
  - "Object-keyed sites.json format for O(1) profile lookup"
  - "macOS openrsync compatibility: detect variant, use -v instead of --info=progress2"
  - "Log files NOT excluded from sync (useful for diagnostics)"
metrics:
  duration: 244
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  commits: 2
  completed_at: "2026-02-16T08:41:07Z"
---

# Phase 02 Plan 01: /connect Command & Profile Schema Summary

**One-liner:** Conversational SSH connection workflow with WordPress auto-detection, WP-CLI installation offer, intelligent file sync, and automatic profile persistence.

## What Was Built

Created the `/connect` command as a comprehensive markdown prompt that guides Claude through the complete connection flow: SSH credential gathering, connection verification, WordPress path detection, WP-CLI discovery, file synchronization with size checks, and automatic profile saving to sites.json. Updated the sites.json schema to an object-keyed format with full profile fields, created the local sync directory structure, and aligned CLAUDE.md safety patterns with actual implementation.

## Tasks Completed

### Task 1: Create /connect command prompt (2974370)

Created `commands/connect/COMMAND.md` as a 430-line instructional prompt covering:

**Saved profile shortcut:** Load existing profiles by name, skip SSH verification for saved sites.

**Conversational SSH gathering:** One-at-a-time prompts for hostname, user, key path, and WordPress path with smart defaults from SSH config alias resolution using `ssh -G`.

**SSH connection verification:** BatchMode test with 10-second timeout, specific error diagnosis (timeout, refused, permission denied, key permissions), and actionable fix suggestions.

**WordPress detection:** Auto-search common paths (/var/www/html, ~/public_html, etc.), validate directory structure (wp-config.php, wp-content/, wp-includes/, wp-load.php), handle multiple installations.

**WP-CLI detection:** Check PATH and common locations, offer installation (with sudo or to ~/bin), version check with outdated warning, auto-gather WordPress metadata (version, site URL, plugin count, active theme).

**File sync with intelligence:** Remote size check with 500MB warning threshold, rsync variant detection (openrsync vs GNU rsync), proper exclusions (wp-content/uploads/, cache/, node_modules/, vendor/), permission normalization, trailing slash handling.

**Auto-save profiles:** Atomic jq-based updates to sites.json with temp file validation, auto-generate site name from domain, set first site as default, support one-off connections.

**Error handling:** Every SSH/rsync command includes exit code checking, error parsing, and specific user guidance.

### Task 2: Update schema, create sync dir, align CLAUDE.md (b5023f1)

**Updated sites.json.example:**
- Changed from array to object-keyed format: `{"sites": {"site-name": {...}}}`
- Added fields: local_path, wp_version, site_url, wp_cli_path, last_sync, created_at, environment, is_default, notes
- ssh_key can be null (uses SSH agent)
- Only one site can have is_default: true
- Provides complete example with production and staging profiles

**Created .sites/.gitkeep:**
- Established local sync directory structure
- .gitkeep committed with -f flag (directory itself is gitignored)
- Ensures directory exists in repo while preventing synced files from being committed

**Updated CLAUDE.md:**
- Safe operation patterns: corrected exclusions list to match /connect implementation (wp-content/uploads/, wp-content/cache/, wp-content/w3tc-cache/, node_modules/, vendor/, .git/, .env)
- Clarified log files NOT excluded (useful for diagnostics)
- Removed wp-config.php from exclusions (changed from Phase 1 safety decision)
- Added openrsync compatibility note: macOS default rsync doesn't support --info=progress2, use -v instead
- Updated hot cache section: connection fields listed in comment (name, host, user, wp_path, local_path, wp_version, site_url, wp_cli_path, last_sync)

## Deviations from Plan

None — plan executed exactly as written. All CONN and SYNC requirements addressed.

## Verification Results

All phase-level verification checks passed:

1. `commands/connect/COMMAND.md` has YAML frontmatter (name, description, usage)
2. File length: 430 lines (exceeds 150+ requirement)
3. `sites.json.example | jq .` parses successfully with new object-keyed schema
4. `.sites/.gitkeep` exists and committed
5. `grep "openrsync" CLAUDE.md` confirms macOS compatibility note present
6. `grep "wp-content/uploads/" CLAUDE.md` confirms corrected exclusions list
7. All required bash commands present: ssh -o BatchMode=yes (1), ssh -G (6), rsync -avz (2), jq --arg (1)

Cross-reference coverage: All requirement IDs from plan addressed:
- CONN-01 through CONN-08: SSH connection, verification, error diagnosis, config parsing, one-off mode, auto-save
- SYNC-01 through SYNC-05: Size check, exclusions, incremental sync, permission normalization, rsync variant detection

## Key Insights

**1. SSH config alias resolution is powerful but requires `ssh -G`**
Simple grep/awk parsing of ~/.ssh/config misses includes, wildcards, and conditional logic. Using `ssh -G hostname` returns canonical parsed values, correctly handling all edge cases.

**2. macOS openrsync vs GNU rsync incompatibility is a real concern**
macOS ships with openrsync (BSD-licensed fork) which doesn't support --info=progress2. Detection via `rsync --version` output allows graceful fallback to -v flag.

**3. Atomic JSON updates prevent corruption**
Writing to temp file, validating with `jq empty`, then atomic `mv` prevents sites.json corruption if interrupted. Direct `>` redirect would truncate file before writing.

**4. Conversational flow reduces cognitive load**
One-at-a-time prompting (vs asking for all SSH details upfront) allows Claude to provide context-specific suggestions (SSH config values, detected WordPress paths) and better error recovery.

**5. WP-CLI installation automation needs sudo detection**
Shared hosting users often lack sudo. Detecting with `sudo -n true` allows offering appropriate installation method (system-wide vs user-local).

## Dependencies & Next Steps

**Provides for downstream:**
- `/status` command (Plan 02-02) can list saved sites from sites.json
- Diagnostic commands can assume connection profile exists and local files synced
- All CONN and SYNC capabilities available for future phases

**Next plan:** 02-02 will build /status command for profile management and connection state visibility.

## Self-Check: PASSED

**Created files verified:**
```
FOUND: commands/connect/COMMAND.md
FOUND: .sites/.gitkeep
```

**Modified files verified:**
```
FOUND: sites.json.example (valid JSON)
FOUND: CLAUDE.md (contains "openrsync" and "wp-content/uploads/")
```

**Commits verified:**
```
FOUND: 2974370 (feat(02-01): create /connect command prompt)
FOUND: b5023f1 (feat(02-01): update schema, create sync dir, align CLAUDE.md)
```

All claimed files exist and all claimed commits are present in git history.
