# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.
**Current focus:** Milestone v2.0 — Database, Performance & Multi-Source Access

## Current Position

Phase: 7 (Performance & Architecture) — planned, ready for execution
Plan: 5 plans in 2 waves (07-01 through 07-05)
Status: Phase 7 planned and verified — ready for execution
Last activity: 2026-02-19 — Phase 7 planned (5 skills: N+1, cron, profile, architecture, narrative)

```
[v1 complete] [5:done] [6:done] [7:----] [8:----]
```

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: ~179 seconds (3 minutes)
- Total execution time: ~0.50 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-plugin-foundation | 1 | 181s | 181s |
| 02-connection-file-sync | 2 | 391s | 196s |
| 03-diagnostic-skills-reporting | 4 | 689s | 172s |
| 04-command-workflows | 2 | 319s | 160s |
| 05-multi-source-connection | 2/2 | 442s | 221s |
| 06-database-health-infrastructure-audits | 3/3 | 740s (06-01: 370s, 06-02: 249s, 06-03: ~120s) | ~247s |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- CoWork plugin format (not WP plugin) — runs agent-side, nothing installed on target site
- SSH + rsync for file access — standard, secure, available on most hosts
- Shell commands via Bash tool — CoWork plugins are markdown-only, no custom MCP server needed
- Read + propose (not push) — safety, user reviews patches before applying
- sites.json + memory/ split — connection config separate from diagnostic findings/history
- WP-CLI over SSH for DB — leverages existing WP tooling, no direct DB credentials needed
- Conversational SSH gathering — one detail at a time for better UX
- SSH config alias resolution using ssh -G — canonical values handling includes/wildcards
- Auto-save every connection to sites.json — no user prompt needed
- Object-keyed sites.json format — O(1) profile lookup performance
- macOS openrsync compatibility — detect variant, use -v instead of --info=progress2
- 3-level severity only (Critical, Warning, Info) for diagnostic findings
- A-F health grading matrix with deterministic first-match-wins evaluation
- Finding IDs use category prefix + check name + location hash for cross-scan tracking
- Investigation workflow: intake → scout → plan → execute → review
- Dual distribution: CoWork plugin ZIP + Claude Code CLI via npx wpxpert
- v2.0: source_type field in sites.json routes all execution — ssh/local/docker/git (backward-compatible)
- v2.0: WP-CLI is the mandatory DB access path — never parse wp-config.php for credentials
- v2.0: Table prefix read dynamically via wp config get, never hardcoded
- v2.0: Content-based finding IDs (hash on type + path + code snippet) — not line-number-based
- v2.0: Docker container identity confirmed by user before profile save; probe for wp-config.php to verify WP presence
- v2.0: /connect source type detection order: git URL → local path → SSH user@host → ambiguous (ask user)
- v2.0: Partial Docker bind mount (only subdirectory mounted) falls back to docker cp for WP root
- v2.0: file_access field values: rsync (ssh), direct (local/git), bind_mount (docker with bind), docker_cp (docker without bind)
- v2.0: Git reconnect asks before pull — never auto-pull on reconnect
- v2.0: WP_CLI_PREFIX pattern routes WP-CLI invocation by source type (ssh=SSH, docker=docker exec, local=direct)
- v2.0: Git sources always skip WP-CLI skills even when local wp binary exists — no live DB in git checkouts
- v2.0: Capability gating consistent across /connect Section 10, /diagnose Section 4, and /status capabilities line
- v2.0: HTTPS skill is NOT in WP_CLI_SKILLS array — dual-gated internally; Part B (grep) runs without WP-CLI for any source with LOCAL_PATH
- v2.0: File permissions skill is SSH-only; non-SSH sources get INFR-PERM-SKP explaining rsync normalizes permissions
- v2.0: debug.log only flagged when WP_DEBUG=enabled AND file exists AND world-readable
- v2.0: wp-config.php world-readable detection uses octal bit ops ($((8#$PERMS & 4))), not exact value match — catches 644, 755, 777 etc.
- v2.0: Self-gating skill pattern — skills check own preconditions (source_type, WP_CLI_AVAILABLE, LOCAL_PATH) rather than relying on skill array

### Pending Todos

None.

### Blockers/Concerns

- Phase 7 (Performance): wp package install for wp-cli/profile-command fails on shared hosting. RESOLVED in context: offer to install, itemized skip list when unavailable.

Note: Phase 5 Docker WP path blocker resolved — probe sequence implemented in 05-01 using 6 known paths + user fallback prompt.

## Session Continuity

Last session: 2026-02-19 — Phase 7 planned
Stopped at: Phase 7 planning complete (5 plans, verification passed)
Resume with: `/gsd:execute-phase 7`
