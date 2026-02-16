# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.
**Current focus:** Phase 4: Command Workflows (next)

## Current Position

Phase: 4 of 4 (Command Workflows)
Plan: 1 of 2 in current phase
Status: Executing Phase 4 (command workflows)
Last activity: 2026-02-17 — Completed 04-01 (diagnose command orchestration)

Progress: [████████░░] 89%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: ~183 seconds (3 minutes)
- Total execution time: ~0.41 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-plugin-foundation | 1 | 181s | 181s |
| 02-connection-file-sync | 2 | 391s | 196s |
| 03-diagnostic-skills-reporting | 4 | 689s | 172s |
| 04-command-workflows | 1 | 185s | 185s |

**Recent Completions:**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| Phase 04 P01 | 01 | 185s | 1 | 1 |
| Phase 03 P04 | 04 | 180s | 2 | 3 |
| Phase 03 P03 | 03 | 221s | 1 | 1 |
| Phase 03 P02 | 02 | 147s | 2 | 2 |
| Phase 03 P01 | 01 | 141s | 2 | 3 |
| Phase 02 P02 | 02 | 147s | 2 | 2 |
| Phase 02 P01 | 01 | 244s | 2 | 4 |
| Phase 04 P02 | 134 | 2 tasks | 2 files |
| Phase 04 P01 | 185 | 1 tasks | 1 files |

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
- 3-level severity only (Critical, Warning, Info) for diagnostic findings
- A-F health grading matrix with deterministic first-match-wins evaluation
- Finding IDs use category prefix + check name + location hash for cross-scan tracking

### Pending Todos

None yet.

### Blockers/Concerns

**From research:**
- SSH credential exposure risk must be addressed in Phase 1 (security-critical)
- rsync --delete flag disasters must be documented in Phase 1 (data-loss risk)
- Cross-platform rsync incompatibility (macOS openrsync vs GNU) must be handled in Phase 1

## Session Continuity

Last session: 2026-02-17 — Phase 4 Plan 1 complete
Stopped at: Completed 04-01-PLAN.md (diagnose command orchestration)
Resume file: None
