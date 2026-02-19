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

- [x] **MSRC-01**: User can connect to a local WordPress directory without SSH
- [x] **MSRC-02**: User can connect to a WordPress site running in a Docker container
- [x] **MSRC-03**: User can clone a remote git repository containing WordPress code for analysis
- [x] **MSRC-04**: User can point at an already-cloned local git repository for analysis
- [x] **MSRC-05**: Plugin detects source type and routes commands through appropriate execution path (ssh/local/docker/git)
- [ ] **MSRC-06**: Plugin restricts available skills based on source capabilities (e.g., no DB analysis for git-only sources without DB access)
- [x] **MSRC-07**: Sites.json stores source type per profile with backward-compatible default to SSH

### Database Health

- [x] **DBHL-01**: User can analyze wp_options autoload bloat (total size, top offenders, plugin attribution)
- [x] **DBHL-02**: User can detect transient buildup and expired transient count
- [x] **DBHL-03**: User can check post revision accumulation and recommend cleanup thresholds
- [x] **DBHL-04**: Plugin reads table prefix dynamically from WP-CLI (never hardcoded)
- [x] **DBHL-05**: Plugin accesses DB exclusively through WP-CLI (never parses wp-config.php for credentials directly)

### Infrastructure Audits

- [x] **INFR-01**: User can audit HTTPS/SSL configuration (force-SSL constants, mixed content indicators, certificate status)
- [x] **INFR-02**: User can check file and directory permissions against WordPress security recommendations

### Performance Detection

- [x] **PERF-01**: User can detect potential N+1 query patterns in theme/plugin code with confidence tiers (high/medium/low)
- [x] **PERF-02**: User can analyze wp-cron scheduled events for issues (overdue, duplicate, excessive frequency)
- [x] **PERF-03**: Plugin integrates WP-CLI Profile command for runtime performance data (with graceful degradation when unavailable)

### Architecture Review

- [x] **ARCH-01**: User can detect CPT misuse patterns (excessive post types, misuse as data store with DB row-count gating)
- [x] **ARCH-02**: User can detect hook abuse patterns (excessive actions/filters, priority conflicts)
- [x] **ARCH-03**: Plugin produces AI-synthesized architecture narrative summarizing structural health

### Findings Trends

- [x] **TRND-01**: Plugin uses content-based finding IDs (not line-number-based) for stable cross-scan tracking
- [x] **TRND-02**: User can view delta report showing new, resolved, and recurring findings between audits
- [x] **TRND-03**: Plugin stores trend data in machine-readable format alongside existing case history

### Batch Operations

- [x] **BTCH-01**: User can run diagnostics across multiple saved site profiles sequentially
- [x] **BTCH-02**: User can view comparison matrix of findings across sites (health grades, finding counts, sorted by health)

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
| MSRC-01 | Phase 5 | Complete |
| MSRC-02 | Phase 5 | Complete |
| MSRC-03 | Phase 5 | Complete |
| MSRC-04 | Phase 5 | Complete |
| MSRC-05 | Phase 5 | Complete |
| MSRC-06 | Phase 5 | Pending |
| MSRC-07 | Phase 5 | Complete |
| DBHL-01 | Phase 6 | Complete |
| DBHL-02 | Phase 6 | Complete |
| DBHL-03 | Phase 6 | Complete |
| DBHL-04 | Phase 6 | Complete |
| DBHL-05 | Phase 6 | Complete |
| INFR-01 | Phase 6 | Complete |
| INFR-02 | Phase 6 | Complete |
| PERF-01 | Phase 7 | Complete |
| PERF-02 | Phase 7 | Complete |
| PERF-03 | Phase 7 | Complete |
| ARCH-01 | Phase 7 | Complete |
| ARCH-02 | Phase 7 | Complete |
| ARCH-03 | Phase 7 | Complete |
| TRND-01 | Phase 8 | Complete |
| TRND-02 | Phase 8 | Complete |
| TRND-03 | Phase 8 | Complete |
| BTCH-01 | Phase 8 | Complete |
| BTCH-02 | Phase 8 | Complete |

**Coverage:**
- v1 requirements: 32 total (all complete)
- v2 requirements: 25 total
- Mapped to phases: 32 (v1) + 25 (v2)
- Unmapped: 0

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-18 after v2.0 roadmap creation (Phases 5-8)*
