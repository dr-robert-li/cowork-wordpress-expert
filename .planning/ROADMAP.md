# Roadmap: WP Diagnostics Expert

## Overview

This roadmap transforms a CoWork plugin vision into a working WordPress diagnostic tool through four focused phases. We begin with secure plugin foundation and safety patterns, establish SSH connections with intelligent site detection, build core diagnostic skills for security and code analysis, and complete with user-facing commands that orchestrate everything into a complete diagnostic workflow.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Plugin Foundation** - Secure plugin structure with credential protection and safe operation patterns
- [x] **Phase 2: Connection & File Sync** - SSH connectivity, site detection, and intelligent file synchronization
- [x] **Phase 3: Diagnostic Skills & Reporting** - Security scanning, code quality analysis, and structured reporting
- [ ] **Phase 4: Command Workflows** - User-facing diagnostic commands that orchestrate all capabilities

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
  1. /connect command establishes SSH connection, syncs files, verifies WP-CLI, and saves profile in one workflow
  2. /diagnose command runs full diagnostic suite combining security, code quality, and version checks into single report
  3. /audit command runs focused security-only scan for rapid assessments
  4. /status command shows all connected sites with sync state and recent findings summary
**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — /diagnose command: full orchestration workflow with three modes, NL parsing, inline progress, error recovery
- [ ] 04-02-PLAN.md — /status enhancements, plugin manifest v2.0.0, /audit cleanup

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Foundation | 1/1 | Complete | 2026-02-16 |
| 2. Connection & File Sync | 2/2 | Complete | 2026-02-16 |
| 3. Diagnostic Skills & Reporting | 4/4 | Complete | 2026-02-17 |
| 4. Command Workflows | 0/2 | Planning complete | - |
