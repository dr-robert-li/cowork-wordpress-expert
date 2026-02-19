# Roadmap: WP Diagnostics Expert

## Overview

This roadmap transforms a CoWork plugin vision into a working WordPress diagnostic tool through four focused phases. We begin with secure plugin foundation and safety patterns, establish SSH connections with intelligent site detection, build core diagnostic skills for security and code analysis, and complete with user-facing commands that orchestrate everything into a complete diagnostic workflow.

## Milestones

- **v1.0** — Plugin foundation, SSH connection, file sync, diagnostics, reporting (Phases 1-4, complete)
- **v2.0** — Multi-source access, database health, performance, architecture, trends (Phases 5-8)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v1.0 Phases (Complete)

- [x] **Phase 1: Plugin Foundation** - Secure plugin structure with credential protection and safe operation patterns
- [x] **Phase 2: Connection & File Sync** - SSH connectivity, site detection, and intelligent file synchronization
- [x] **Phase 3: Diagnostic Skills & Reporting** - Security scanning, code quality analysis, and structured reporting
- [x] **Phase 4: Command Workflows** - User-facing diagnostic commands that orchestrate all capabilities

### v2.0 Phases

- [x] **Phase 5: Multi-Source Connection** - Local, Docker, and git access modes alongside existing SSH (completed 2026-02-18)
- [x] **Phase 6: Database Health & Infrastructure Audits** - DB optimization analysis, HTTPS/SSL, and file permissions (completed 2026-02-18)
- [ ] **Phase 7: Performance & Architecture** - N+1 pattern detection, cron analysis, CPT/hook abuse review
- [ ] **Phase 8: Findings Trends & Batch Operations** - Cross-scan trend tracking and multi-site batch diagnostics

## Phase Details

### Phase 1: Plugin Foundation
**Goal**: Establish secure plugin structure with zero risk of credential exposure and safe operation patterns
**Depends on**: Nothing (first phase)
**Requirements**: PLUG-01, PLUG-02, PLUG-03, CONN-06
**Success Criteria** (what must be TRUE):
  1. Plugin directory structure follows CoWork spec with .claude-plugin/plugin.json, commands/, skills/ directories
  2. .gitignore prevents any synced site files, credentials, or local state from being committed
  3. SSH credentials are never stored in version-controlled files or logged to output
  4. Safe rsync patterns are documented with dry-run and exclusion examples
**Plans**: TBD

Plans:
- [ ] TBD

### Phase 2: Connection & File Sync
**Goal**: Users can connect to WordPress sites via SSH, save profiles, and sync files safely with intelligent detection
**Depends on**: Phase 1
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05, CONN-07, CONN-08, SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05
**Success Criteria** (what must be TRUE):
  1. User can connect to a remote WordPress site via SSH and verify connectivity before proceeding
  2. User can save site connection profiles to sites.json and retrieve them for future use
  3. Plugin detects WP-CLI availability and path on the remote server automatically
  4. Files sync from remote to local with exclusions for uploads/cache, size warnings, and permission normalization
  5. User can view status of connected sites including last sync time via /status command
**Plans:** 2 plans

Plans:
- [ ] 02-01-PLAN.md — /connect command: SSH connection, WP detection, WP-CLI discovery, file sync, auto-save profile
- [ ] 02-02-PLAN.md — /status command: site listing, profile management (remove, default, rename), plugin.json update

### Phase 3: Diagnostic Skills & Reporting
**Goal**: Plugin performs comprehensive security scans, code quality analysis, and generates evidence-based markdown reports
**Depends on**: Phase 2
**Requirements**: SECR-01, SECR-02, SECR-03, SECR-04, DIAG-01, DIAG-02, DIAG-03, DIAG-04, REPT-01, REPT-02, REPT-03, REPT-04
**Success Criteria** (what must be TRUE):
  1. Plugin verifies WordPress core file integrity against known-good checksums
  2. Plugin audits user accounts for security issues and checks wp-config.php for misconfigurations
  3. Plugin checks PHP/WordPress/MySQL version compatibility and plugin/theme update status
  4. Plugin performs AI-powered code quality analysis detecting anti-patterns and deprecated functions with file:line references
  5. Findings are generated as structured markdown reports with severity ratings, technical details, and non-technical summaries
  6. Reports are stored in memory/ directory and accessible via /status command
**Plans:** 4 plans

Plans:
- [ ] 03-01-PLAN.md — Security diagnostic skills: core integrity, config security, user audit
- [ ] 03-02-PLAN.md — Version audit and malware scan skills
- [ ] 03-03-PLAN.md — AI-powered code quality analysis skill
- [ ] 03-04-PLAN.md — Report generator skill, /status diagnostic display, plugin manifest update

### Phase 4: Command Workflows
**Goal**: User-facing commands orchestrate diagnostic skills into complete, usable workflows
**Depends on**: Phase 3
**Requirements**: CMDS-01, CMDS-02, CMDS-03, CMDS-04
**Success Criteria** (what must be TRUE):
  1. /diagnose command runs full diagnostic suite across all skills with inline progress feedback and skip-on-error recovery
  2. /diagnose supports security-only and code-only modes via natural language invocation
  3. /audit functionality is covered by /diagnose security-only mode (no separate /audit command)
  4. /status shows connected sites with health summaries, available commands, and suggested next actions
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — /diagnose command: full orchestration workflow with three modes, NL parsing, inline progress, error recovery
- [ ] 04-02-PLAN.md — /status enhancements, plugin manifest v2.0.0, /audit cleanup

---

## v2.0 Phase Details

### Phase 5: Multi-Source Connection
**Goal**: Users can connect to local directories, Docker containers, and git repositories — not just SSH — with source type routed transparently through all skills
**Depends on**: Phase 4
**Requirements**: MSRC-01, MSRC-02, MSRC-03, MSRC-04, MSRC-05, MSRC-06, MSRC-07
**Success Criteria** (what must be TRUE):
  1. User can run /connect against a local WordPress directory path and get a usable site profile without any SSH or Docker
  2. User can run /connect against a Docker container name and have WordPress validated inside the container before the profile is saved
  3. User can run /connect with a git repository URL and have it cloned to .sites/{name}/ and treated as a local directory for analysis
  4. An existing SSH profile continues to work without any modification (backward-compatible sites.json schema)
  5. Plugin declines DB-dependent skills for source types without DB access and explains why to the user
**Plans:** 2/2 plans complete

Plans:
- [ ] 05-01-PLAN.md — Multi-source /connect: source type detection, local/Docker/git/SSH flows, sites.json schema extension
- [ ] 05-02-PLAN.md — Capability gating: /connect summary, /diagnose resync + skill gating, /status source badges

### Phase 6: Database Health & Infrastructure Audits
**Goal**: Users can analyze WordPress database health (autoload bloat, transients, revisions) and audit HTTPS/SSL configuration and file permissions
**Depends on**: Phase 5
**Requirements**: DBHL-01, DBHL-02, DBHL-03, DBHL-04, DBHL-05, INFR-01, INFR-02
**Success Criteria** (what must be TRUE):
  1. User can request a database health report showing autoload size, top autoload offenders with plugin attribution, and comparison to the 900KB WordPress warning threshold
  2. User can see expired and live transient counts, and whether transient buildup exceeds a recommended cleanup threshold
  3. User can see post revision counts per post type and a recommendation for revision limits
  4. User can audit HTTPS configuration (siteurl/home scheme, FORCE_SSL_ADMIN constant, mixed content indicators)
  5. User can check file and directory permissions against WordPress security recommendations (wp-config.php, uploads/, executable detection)
**Plans:** 3/3 plans complete

Plans:
- [ ] 06-01-PLAN.md — Database health skills: autoload bloat, transient buildup, post revision analysis
- [ ] 06-02-PLAN.md — Infrastructure audit skills: HTTPS/SSL configuration, file permissions
- [ ] 06-03-PLAN.md — Register all Phase 6 skills in /diagnose command

### Phase 7: Performance & Architecture
**Goal**: Users can detect performance bottlenecks in code and scheduled events, and receive an AI-synthesized architectural health assessment
**Depends on**: Phase 6
**Requirements**: PERF-01, PERF-02, PERF-03, ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):
  1. User can detect potential N+1 query patterns in theme and plugin code, each rated high/medium/low confidence so actionable findings are distinguished from speculative ones
  2. User can see wp-cron event analysis showing overdue, duplicate, and excessively-frequent jobs
  3. When WP-CLI Profile is available, user receives actual hook and stage timing data; when unavailable, skipped checks are listed explicitly (not a generic error)
  4. User receives an architecture report identifying CPT misuse (gated on actual DB row counts), hook abuse patterns, and caching anti-patterns
  5. User receives a synthesized narrative summarizing the site's structural health across code, database, and performance findings
**Plans:** 5 plans

Plans:
- [ ] 07-01-PLAN.md — N+1 query pattern detection skill (diagnostic-performance-n1)
- [ ] 07-02-PLAN.md — Cron analysis skill + WP-CLI Profile skill (diagnostic-cron-analysis, diagnostic-wpcli-profile)
- [ ] 07-03-PLAN.md — Architecture review skill: CPT misuse, hook abuse, caching anti-patterns (diagnostic-architecture)
- [ ] 07-04-PLAN.md — Synthesized narrative skill (diagnostic-arch-narrative)
- [ ] 07-05-PLAN.md — Register all Phase 7 skills in /diagnose command, add performance mode

### Phase 8: Findings Trends & Batch Operations
**Goal**: Users can track whether site health is improving or degrading over time, and run diagnostics across multiple saved profiles in a single operation
**Depends on**: Phase 7
**Requirements**: TRND-01, TRND-02, TRND-03, BTCH-01, BTCH-02
**Success Criteria** (what must be TRUE):
  1. After two or more diagnostic runs on a site, the report header shows a Trends section classifying each finding as new, resolved, recurring, or regression
  2. Finding IDs remain stable across scans when code is reformatted or refactored (content-based, not line-number-based)
  3. Trend data is stored in machine-readable trends.json alongside case history so it can be queried programmatically
  4. User can invoke a batch command that runs diagnostics across all saved profiles sequentially with a per-site status line
  5. User can view a comparison matrix of findings across sites, sorted by health grade, showing critical/warning/info counts per site
**Plans**: TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Foundation | 1/1 | Complete | 2026-02-16 |
| 2. Connection & File Sync | 2/2 | Complete | 2026-02-16 |
| 3. Diagnostic Skills & Reporting | 4/4 | Complete | 2026-02-17 |
| 4. Command Workflows | 0/2 | Planning complete | - |
| 5. Multi-Source Connection | 2/2 | Complete   | 2026-02-18 |
| 6. Database Health & Infrastructure Audits | 3/3 | Complete   | 2026-02-18 |
| 7. Performance & Architecture | 0/5 | Planning complete | - |
| 8. Findings Trends & Batch Operations | 0/? | Not started | - |
