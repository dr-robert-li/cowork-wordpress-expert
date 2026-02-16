# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.
**Current focus:** Phase 2: Connection & File Sync

## Current Position

Phase: 2 of 4 (Connection & File Sync)
Plan: 2 of 2 in current phase
Status: Executing phase 02-connection-file-sync
Last activity: 2026-02-16 — Completed 02-connection-file-sync-01-PLAN.md (/connect command)

Progress: [████░░░░░░] 50%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 212 seconds (3.5 minutes)
- Total execution time: 0.12 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-plugin-foundation | 1 | 181s | 181s |
| 02-connection-file-sync | 1 | 244s | 244s |

**Recent Completions:**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| Phase 02-connection-file-sync P01 | 01 | 244s | 2 | 4 |
| Phase 01-plugin-foundation P01 | 01 | 181s | 2 | 8 |
| Phase 02 P02 | 147 | 2 tasks | 2 files |
| Phase 03 P03 | 221 | 1 tasks | 1 files |

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
- Log files NOT excluded from sync — useful for diagnostics

### Pending Todos

None yet.

### Blockers/Concerns

**From research:**
- SSH credential exposure risk must be addressed in Phase 1 (security-critical)
- rsync --delete flag disasters must be documented in Phase 1 (data-loss risk)
- Cross-platform rsync incompatibility (macOS openrsync vs GNU) must be handled in Phase 1

## Session Continuity

Last session: 2026-02-16 — Plan execution
Stopped at: Completed 02-connection-file-sync-01-PLAN.md
Resume file: None
