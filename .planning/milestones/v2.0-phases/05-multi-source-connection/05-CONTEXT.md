# Phase 5: Multi-Source Connection - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend /connect to support local directories, Docker containers, and git repositories alongside existing SSH. Source type is routed transparently through all diagnostic skills. No new diagnostic capabilities are added — this phase is purely about connection and file access for additional source types.

</domain>

<decisions>
## Implementation Decisions

### Connection detection
- Auto-detect source type from user input: paths starting with / or . are local, docker container names/IDs are Docker, git URLs (https://, git@) are git, user@host is SSH
- If auto-detection is ambiguous, ask the user to clarify (don't silently guess)
- /connect with no arguments shows a source type menu first: SSH / Local / Docker / Git
- For local directories, validate WordPress by checking multiple markers (wp-config.php, wp-includes/, wp-admin/) — warn on partial match

### Docker workflow
- Accept direct container name/ID, but also offer to list running containers if none specified
- Probe known WP paths in order (/var/www/html, /app/public, /var/www, etc.); if none found, ask the user for the path
- File access: detect bind mounts first and read from host filesystem directly; fall back to docker cp if no bind mounts
- WP-CLI via docker exec is optional — probe for it, enable DB skills if available, skip DB skills gracefully if not

### Git clone behavior
- Allow user to point to an existing local checkout rather than requiring a fresh clone
- Fresh clones use --depth 1 (shallow) by default for speed
- Use default branch, but mention other branches and offer to switch if multiple exist
- On reconnect to existing git profile, ask whether to pull latest changes (don't auto-pull)

### Capability gaps UX
- Show capability summary at connection time: which skill categories are available for this source type
- Also show inline skip messages during diagnostics when a skill is skipped due to source type
- For local directories, probe for WP-CLI availability locally — enable DB skills if WP-CLI and wp-config.php DB access are present
- Profiles are single source type — no "upgrade" path from git to SSH. User creates a separate profile if they need DB access.

### Claude's Discretion
- Source type badge/label format in /status output
- Exact probe sequence ordering for Docker WP path detection
- Container listing format and filtering heuristics
- Capability summary visual format

</decisions>

<specifics>
## Specific Ideas

- Source type menu on bare /connect mirrors the existing conversational SSH flow but adds choice upfront
- Docker bind mount detection should feel seamless — if files are already on the host, don't copy them again
- Git branch selection should be a light touch, not a mandatory step — mention it, don't force it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-multi-source-connection*
*Context gathered: 2026-02-18*
