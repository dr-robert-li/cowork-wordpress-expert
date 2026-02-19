# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.
**Current focus:** Milestone v2.0 — Database, Performance & Multi-Source Access

## Current Position

Phase: 8 (Findings, Trends & Batch Operations) — in progress (1 of 2 plans complete)
Plan: 08-01 complete — trend-tracker skill created and integrated into /diagnose
Status: Phase 8 in progress — plan 01 done (trend-tracker), plan 02 pending (comparison matrix)
Last activity: 2026-02-19 — 08-01 complete (trend-tracker skill, /diagnose Section 5.5 added)

```
[v1 complete] [5:done] [6:done] [7:done] [8:1/2--]
```

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: ~174 seconds (3 minutes)
- Total execution time: ~0.58 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-plugin-foundation | 1 | 181s | 181s |
| 02-connection-file-sync | 2 | 391s | 196s |
| 03-diagnostic-skills-reporting | 4 | 689s | 172s |
| 04-command-workflows | 2 | 319s | 160s |
| 05-multi-source-connection | 2/2 | 442s | 221s |
| 06-database-health-infrastructure-audits | 3/3 | 740s (06-01: 370s, 06-02: 249s, 06-03: ~120s) | ~247s |
| 07-performance-architecture | 5/5 | ~887s (07-01: ~137s, 07-02: ~137s, 07-03: 223s, 07-04: 137s, 07-05: 116s) | ~177s |
| 08-findings-trends-batch-operations | 1/2 | 222s (08-01: 222s) | ~222s |

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
- v2.0: Narrative output is bullet-point by domain (LOCKED) — not prose paragraphs; scales to any finding count
- v2.0: diagnostic-arch-narrative produces exactly ONE finding (ARCH-NARR) — aggregator not a probe, reads COMBINED_FINDINGS only
- v2.0: Top 3 ranking domain priority: Security > Database Health > Performance > Code Quality > Architecture > Infrastructure
- v2.0: diagnostic-arch-narrative must run LAST in /diagnose full-mode skill list — COMBINED_FINDINGS must be complete
- v2.0: diagnostic-architecture is NOT in WP_CLI_SKILLS array — self-gating with partial results (Part A skip finding + Parts B+C continue)
- v2.0: CPT misuse thresholds — 0 posts = Warning (dead CPT), 1-5 = Info (possibly orphaned), >10000 = Warning (data-store misuse)
- v2.0: Hook abuse callback threshold — >=20 registrations = Warning, 10-19 = Info, per hook name across all custom code
- v2.0: Heuristic findings (ARCH-CACHE-DB) use Info severity — uncached DB queries may be intentional, require AI context review
- v2.0: Object cache fallback — when WP-CLI unavailable, check for wp-content/object-cache.php drop-in file
- v2.0: Trend tracker runs as post-report aggregator — never before report-generator writes latest.md (sequencing enforced in /diagnose Section 5.5)
- v2.0: 2-scan retention policy for trends.json (current + prior) — sufficient for NEW/RECURRING classification at low storage cost
- v2.0: REGRESSION classification not implemented — 2-scan retention cannot detect reappeared findings (known limitation, shown as NEW)
- v2.0: Fuzzy match (finding_type + file_path) used as fallback for cross-scan ID matching — catches reformatted code
- v2.0: Trend tracking is mode-agnostic — runs for all /diagnose modes (full, security-only, code-only, performance)

### Pending Todos

None.

### Blockers/Concerns

- Phase 7 (Performance): wp package install for wp-cli/profile-command fails on shared hosting. RESOLVED in context: offer to install, itemized skip list when unavailable.

Note: Phase 5 Docker WP path blocker resolved — probe sequence implemented in 05-01 using 6 known paths + user fallback prompt.

## Session Continuity

Last session: 2026-02-19 — Phase 8 plan 01 completed (trend-tracker skill + /diagnose Section 5.5)
Stopped at: Completed 08-01-PLAN.md — trend-tracker created, /diagnose updated with Section 5.5 trend tracking
Resume with: Phase 8 plan 02 — comparison matrix (grade/count trends using trends.json)
