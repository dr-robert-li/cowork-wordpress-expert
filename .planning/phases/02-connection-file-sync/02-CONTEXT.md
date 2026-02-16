# Phase 2: Connection & File Sync - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

SSH connectivity to remote WordPress sites, site profile management, and intelligent file synchronization via rsync. Users can connect, save profiles, sync files, and detect WP-CLI availability. Diagnostic commands and reporting are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Connection flow
- Conversational style: Claude asks for SSH details one at a time ("What's the hostname?" "What user?" etc.)
- SSH verification: verify connectivity on first connection, skip verification for saved profiles
- Connection failure: Claude diagnoses the SSH error (wrong key, host unreachable, permission denied) and suggests specific fixes
- SSH config aliases: Parse ~/.ssh/config to resolve aliases, show matched config details to user
- WordPress path: Auto-detect by searching for wp-config.php in common paths, only ask user if not found
- WordPress validation: Always verify the remote path is a WordPress installation (check for wp-config.php, wp-includes/, etc.)
- Auto-sync: Connection + file sync as one seamless flow — after connecting, files start syncing automatically
- Auto-save: Automatically save every successful connection to sites.json without asking

### Site profiles
- Naming: Auto-generate profile name from the domain (example.com -> "example-com"), but user can rename
- Default site: User explicitly marks one site as default — commands use the default without specifying
- Environment label: Optional field (production, staging, development) — not required
- Profile stores: SSH connection details + last sync timestamp + WordPress version + site URL + description/notes

### File sync behavior
- Local storage: Default to .sites/{site-name}/ within plugin working directory, but allow per-site path override in profile
- Default exclusions: wp-content/uploads/, cache directories (wp-content/cache/, w3tc-cache/), node_modules/, vendor/
- Log files: NOT excluded by default (useful for diagnostics)
- Size check: Check remote size before syncing, warn if over threshold (e.g., 500MB)
- Incremental sync: Default to incremental (rsync handles naturally), offer full re-sync option when user requests it

### WP-CLI detection
- Missing WP-CLI: Offer to install it on the remote server if not found
- Detection strategy: Run 'which wp' first, then check common paths (/usr/local/bin/wp, ~/bin/wp, etc.)
- Version check: Run 'wp --version' and warn if outdated
- Auto-gather: When WP-CLI is available, automatically run wp core version, wp plugin list, wp theme list on connect

### Claude's Discretion
- Exact size threshold for sync warnings
- SSH config parsing implementation details
- WP-CLI installation method (curl download vs package manager)
- Progress output format during sync
- How much detail to show during auto-gather

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-connection-file-sync*
*Context gathered: 2026-02-16*
