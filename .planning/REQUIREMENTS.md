# Requirements: WP Diagnostics Expert

**Defined:** 2026-02-16
**Core Value:** Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings

## v1 Requirements (Complete)

Requirements from initial release. All implemented in Phases 1-4.

### Plugin Structure

- [x] **PLUG-01**: Plugin follows CoWork plugin format (.claude-plugin/plugin.json, commands/, skills/)
- [x] **PLUG-02**: Plugin includes .mcp.json (empty or minimal for v1 — Bash tool handles execution)
- [x] **PLUG-03**: Plugin includes .gitignore that excludes synced site files, credentials, and local state

### Connection

- [x] **CONN-01**: User can connect to a remote WordPress site via SSH (host, user, key path, remote WP path)
- [x] **CONN-02**: User can perform a one-off connection without saving a profile
- [x] **CONN-03**: User can save a site profile to sites.json for future connections
- [x] **CONN-04**: User can list saved site profiles
- [x] **CONN-05**: User can remove a saved site profile
- [x] **CONN-06**: SSH credentials (key paths, hostnames) are never logged, committed, or exposed in output
- [x] **CONN-07**: Plugin detects WP-CLI availability and path on the remote server
- [x] **CONN-08**: Plugin verifies SSH connectivity before proceeding with sync or commands

### File Sync

- [x] **SYNC-01**: User can rsync WordPress files from remote site to local plugin working directory
- [x] **SYNC-02**: Rsync excludes uploads/, cache/, and other large non-code directories by default
- [x] **SYNC-03**: Plugin warns user if remote site exceeds a size threshold before syncing
- [x] **SYNC-04**: Synced files are stored in a site-specific subdirectory (e.g., sites/{site-name}/)
- [x] **SYNC-05**: Plugin handles macOS openrsync vs GNU rsync compatibility

### Security Scanning

- [x] **SECR-01**: Plugin checks WordPress core files against known-good checksums (via WP-CLI verify-checksums)
- [x] **SECR-02**: Plugin checks installed plugins and themes against known vulnerability databases
- [x] **SECR-03**: Plugin audits user accounts for security issues (default admin username, excessive admin accounts, inactive privileged users)
- [x] **SECR-04**: Plugin checks wp-config.php for security misconfigurations (WP_DEBUG in production, exposed keys, table prefix)

### Diagnostics

- [x] **DIAG-01**: Plugin checks PHP, WordPress, and MySQL/MariaDB version compatibility
- [x] **DIAG-02**: Plugin audits plugins and themes for outdated versions
- [x] **DIAG-03**: Plugin performs AI-powered code quality analysis on synced PHP/JS files (detects anti-patterns, deprecated functions, architecture issues)
- [x] **DIAG-04**: Plugin applies WordPress coding standards knowledge to identify code quality issues with file:line references

### Reporting

- [x] **REPT-01**: Plugin generates structured markdown audit reports with severity ratings, evidence, and recommendations
- [x] **REPT-02**: Each finding includes both a non-technical summary and technical detail
- [x] **REPT-03**: Plugin stores findings in memory/ directory for historical reference
- [x] **REPT-04**: User can view status of connected sites, last sync time, and recent findings via /status command

### Commands

- [x] **CMDS-01**: /connect command establishes SSH connection, syncs files, and verifies WP-CLI
- [x] **CMDS-02**: /diagnose command runs full diagnostic suite (security + code quality + version checks)
- [x] **CMDS-03**: /audit command runs focused security scan only
- [x] **CMDS-04**: /status command shows connected sites, sync state, and recent findings summary

## v2 Requirements

Requirements for milestone v2.0. Each maps to roadmap phases.

### Multi-Source Access

- [ ] **MSRC-01**: User can connect to a local WordPress directory without SSH
- [ ] **MSRC-02**: User can connect to a WordPress site running in a Docker container
- [ ] **MSRC-03**: User can clone a remote git repository containing WordPress code for analysis
- [ ] **MSRC-04**: User can point at an already-cloned local git repository for analysis
- [ ] **MSRC-05**: Plugin detects source type and routes commands through appropriate execution path (ssh/local/docker/git)
- [ ] **MSRC-06**: Plugin restricts available skills based on source capabilities (e.g., no DB analysis for git-only sources without DB access)
- [ ] **MSRC-07**: Sites.json stores source type per profile with backward-compatible default to SSH

### Database Health

- [ ] **DBHL-01**: User can analyze wp_options autoload bloat (total size, top offenders, plugin attribution)
- [ ] **DBHL-02**: User can detect transient buildup and expired transient count
- [ ] **DBHL-03**: User can check post revision accumulation and recommend cleanup thresholds
- [ ] **DBHL-04**: Plugin reads table prefix dynamically from WP-CLI (never hardcoded)
- [ ] **DBHL-05**: Plugin accesses DB exclusively through WP-CLI (never parses wp-config.php for credentials directly)

### Infrastructure Audits

- [ ] **INFR-01**: User can audit HTTPS/SSL configuration (force-SSL constants, mixed content indicators, certificate status)
- [ ] **INFR-02**: User can check file and directory permissions against WordPress security recommendations

### Performance Detection

- [ ] **PERF-01**: User can detect potential N+1 query patterns in theme/plugin code with confidence tiers (high/medium/low)
- [ ] **PERF-02**: User can analyze wp-cron scheduled events for issues (overdue, duplicate, excessive frequency)
- [ ] **PERF-03**: Plugin integrates WP-CLI Profile command for runtime performance data (with graceful degradation when unavailable)

### Architecture Review

- [ ] **ARCH-01**: User can detect CPT misuse patterns (excessive post types, misuse as data store with DB row-count gating)
- [ ] **ARCH-02**: User can detect hook abuse patterns (excessive actions/filters, priority conflicts)
- [ ] **ARCH-03**: Plugin produces AI-synthesized architecture narrative summarizing structural health

### Findings Trends

- [ ] **TRND-01**: Plugin uses content-based finding IDs (not line-number-based) for stable cross-scan tracking
- [ ] **TRND-02**: User can view delta report showing new, resolved, and recurring findings between audits
- [ ] **TRND-03**: Plugin stores trend data in machine-readable format alongside existing case history

### Batch Operations

- [ ] **BTCH-01**: User can run diagnostics across multiple saved site profiles sequentially
- [ ] **BTCH-02**: User can view comparison matrix of findings across sites (health grades, finding counts, sorted by health)

## Future Requirements

Deferred beyond v2.0. Tracked but not in current roadmap.

### Advanced Analysis

- **ADVN-01**: Plugin generates patch files (.patch) for proposed fixes in unified diff format
- **ADVN-04**: Plugin detects plugin/theme conflicts with root cause analysis

### Compliance & Accessibility

- **COMP-01**: Accessibility audit (WCAG)
- **COMP-02**: Compliance gap analysis (GDPR/PCI)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-apply fixes to remote sites | Safety — plugin proposes patches, user applies manually |
| Real-time monitoring/alerting | CoWork plugin is on-demand, not always-on |
| WordPress admin dashboard UI | CoWork plugin operates via Claude interface, no WP plugin installation |
| Malware removal/cleanup | Detection is in scope, removal requires specialized expertise |
| Automatic plugin/theme updates | Outside diagnostic scope, existing tools handle this |
| File backup/restore | Users should use existing backup tools |
| Full code refactoring | Diagnostic tool, not development service |
| Non-SSH remote access (FTP, cPanel) | Local/Docker/git added in v2; FTP/cPanel still excluded |
| WordPress multisite network analysis | Complex scope, defer to v3+ |
| Direct MySQL connection via credentials | WP-CLI is the mandatory DB access path for security |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLUG-01 | Phase 1 | Complete |
| PLUG-02 | Phase 1 | Complete |
| PLUG-03 | Phase 1 | Complete |
| CONN-01 | Phase 2 | Complete |
| CONN-02 | Phase 2 | Complete |
| CONN-03 | Phase 2 | Complete |
| CONN-04 | Phase 2 | Complete |
| CONN-05 | Phase 2 | Complete |
| CONN-06 | Phase 1 | Complete |
| CONN-07 | Phase 2 | Complete |
| CONN-08 | Phase 2 | Complete |
| SYNC-01 | Phase 2 | Complete |
| SYNC-02 | Phase 2 | Complete |
| SYNC-03 | Phase 2 | Complete |
| SYNC-04 | Phase 2 | Complete |
| SYNC-05 | Phase 2 | Complete |
| SECR-01 | Phase 3 | Complete |
| SECR-02 | Phase 3 | Complete |
| SECR-03 | Phase 3 | Complete |
| SECR-04 | Phase 3 | Complete |
| DIAG-01 | Phase 3 | Complete |
| DIAG-02 | Phase 3 | Complete |
| DIAG-03 | Phase 3 | Complete |
| DIAG-04 | Phase 3 | Complete |
| REPT-01 | Phase 3 | Complete |
| REPT-02 | Phase 3 | Complete |
| REPT-03 | Phase 3 | Complete |
| REPT-04 | Phase 3 | Complete |
| CMDS-01 | Phase 4 | Complete |
| CMDS-02 | Phase 4 | Complete |
| CMDS-03 | Phase 4 | Complete |
| CMDS-04 | Phase 4 | Complete |
| MSRC-01 | — | Pending |
| MSRC-02 | — | Pending |
| MSRC-03 | — | Pending |
| MSRC-04 | — | Pending |
| MSRC-05 | — | Pending |
| MSRC-06 | — | Pending |
| MSRC-07 | — | Pending |
| DBHL-01 | — | Pending |
| DBHL-02 | — | Pending |
| DBHL-03 | — | Pending |
| DBHL-04 | — | Pending |
| DBHL-05 | — | Pending |
| INFR-01 | — | Pending |
| INFR-02 | — | Pending |
| PERF-01 | — | Pending |
| PERF-02 | — | Pending |
| PERF-03 | — | Pending |
| ARCH-01 | — | Pending |
| ARCH-02 | — | Pending |
| ARCH-03 | — | Pending |
| TRND-01 | — | Pending |
| TRND-02 | — | Pending |
| TRND-03 | — | Pending |
| BTCH-01 | — | Pending |
| BTCH-02 | — | Pending |

**Coverage:**
- v1 requirements: 32 total (all complete)
- v2 requirements: 24 total
- Mapped to phases: 32 (v1) + 0 (v2, pending roadmap)
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-18 after v2.0 milestone requirements definition*
