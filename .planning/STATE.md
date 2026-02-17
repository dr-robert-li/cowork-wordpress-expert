# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.
**Current focus:** Milestone v2.0 — Database, Performance & Multi-Source Access

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-18 — Milestone v2.0 started

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: ~183 seconds (3 minutes)
- Total execution time: ~0.46 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-plugin-foundation | 1 | 181s | 181s |
| 02-connection-file-sync | 2 | 391s | 196s |
| 03-diagnostic-skills-reporting | 4 | 689s | 172s |
| 04-command-workflows | 2 | 319s | 160s |

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

### Pending Todos

None yet.

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-02-18 — Milestone v2.0 started
Stopped at: Defining requirements
Resume file: None
