# Requirements: WP Diagnostics Expert

**Defined:** 2026-02-16
**Core Value:** Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin Structure

- [ ] **PLUG-01**: Plugin follows CoWork plugin format (.claude-plugin/plugin.json, commands/, skills/)
- [ ] **PLUG-02**: Plugin includes .mcp.json (empty or minimal for v1 — Bash tool handles execution)
- [ ] **PLUG-03**: Plugin includes .gitignore that excludes synced site files, credentials, and local state

### Connection

- [ ] **CONN-01**: User can connect to a remote WordPress site via SSH (host, user, key path, remote WP path)
- [ ] **CONN-02**: User can perform a one-off connection without saving a profile
- [ ] **CONN-03**: User can save a site profile to sites.json for future connections
- [ ] **CONN-04**: User can list saved site profiles
- [ ] **CONN-05**: User can remove a saved site profile
- [ ] **CONN-06**: SSH credentials (key paths, hostnames) are never logged, committed, or exposed in output
- [ ] **CONN-07**: Plugin detects WP-CLI availability and path on the remote server
- [ ] **CONN-08**: Plugin verifies SSH connectivity before proceeding with sync or commands

### File Sync

- [ ] **SYNC-01**: User can rsync WordPress files from remote site to local plugin working directory
- [ ] **SYNC-02**: Rsync excludes uploads/, cache/, and other large non-code directories by default
- [ ] **SYNC-03**: Plugin warns user if remote site exceeds a size threshold before syncing
- [ ] **SYNC-04**: Synced files are stored in a site-specific subdirectory (e.g., sites/{site-name}/)
- [ ] **SYNC-05**: Plugin handles macOS openrsync vs GNU rsync compatibility

### Security Scanning

- [ ] **SECR-01**: Plugin checks WordPress core files against known-good checksums (via WP-CLI verify-checksums)
- [ ] **SECR-02**: Plugin checks installed plugins and themes against known vulnerability databases
- [ ] **SECR-03**: Plugin audits user accounts for security issues (default admin username, excessive admin accounts, inactive privileged users)
- [ ] **SECR-04**: Plugin checks wp-config.php for security misconfigurations (WP_DEBUG in production, exposed keys, table prefix)

### Diagnostics

- [ ] **DIAG-01**: Plugin checks PHP, WordPress, and MySQL/MariaDB version compatibility
- [ ] **DIAG-02**: Plugin audits plugins and themes for outdated versions
- [ ] **DIAG-03**: Plugin performs AI-powered code quality analysis on synced PHP/JS files (detects anti-patterns, deprecated functions, architecture issues)
- [ ] **DIAG-04**: Plugin applies WordPress coding standards knowledge to identify code quality issues with file:line references

### Reporting

- [ ] **REPT-01**: Plugin generates structured markdown audit reports with severity ratings, evidence, and recommendations
- [ ] **REPT-02**: Each finding includes both a non-technical summary and technical detail
- [ ] **REPT-03**: Plugin stores findings in memory/ directory for historical reference
- [ ] **REPT-04**: User can view status of connected sites, last sync time, and recent findings via /status command

### Commands

- [ ] **CMDS-01**: /connect command establishes SSH connection, syncs files, and verifies WP-CLI
- [ ] **CMDS-02**: /diagnose command runs full diagnostic suite (security + code quality + version checks)
- [ ] **CMDS-03**: /audit command runs focused security scan only
- [ ] **CMDS-04**: /status command shows connected sites, sync state, and recent findings summary

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Database & Performance

- **DBPR-01**: Plugin runs database optimization queries via WP-CLI (autoload bloat, transient buildup, revision count)
- **DBPR-02**: Plugin detects performance bottlenecks (N+1 query patterns, expensive hooks, blocking HTTP calls)
- **DBPR-03**: Plugin performs HTTPS/SSL configuration audit
- **DBPR-04**: Plugin checks file permissions against WordPress recommendations

### Advanced Analysis

- **ADVN-01**: Plugin generates patch files (.patch) for proposed fixes in unified diff format
- **ADVN-02**: Plugin performs architecture review (CPT misuse, options bloat, improper caching, hook abuse)
- **ADVN-03**: Plugin tracks findings over time and shows trends (improving/degrading security posture)
- **ADVN-04**: Plugin detects plugin/theme conflicts with root cause analysis

### Multi-Site

- **MULT-01**: Plugin can audit multiple sites sequentially and generate comparison matrix
- **MULT-02**: Plugin supports batch operations across saved site profiles

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
| Non-SSH access (FTP, cPanel) | SSH only for v1, simplifies security model |
| Accessibility audit (WCAG) | Niche audience, defer to v2+ |
| Compliance gap analysis (GDPR/PCI) | High complexity, specialized knowledge, liability risk |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLUG-01 | Phase 1 | Pending |
| PLUG-02 | Phase 1 | Pending |
| PLUG-03 | Phase 1 | Pending |
| CONN-01 | Phase 2 | Pending |
| CONN-02 | Phase 2 | Pending |
| CONN-03 | Phase 2 | Pending |
| CONN-04 | Phase 2 | Pending |
| CONN-05 | Phase 2 | Pending |
| CONN-06 | Phase 1 | Pending |
| CONN-07 | Phase 2 | Pending |
| CONN-08 | Phase 2 | Pending |
| SYNC-01 | Phase 2 | Pending |
| SYNC-02 | Phase 2 | Pending |
| SYNC-03 | Phase 2 | Pending |
| SYNC-04 | Phase 2 | Pending |
| SYNC-05 | Phase 2 | Pending |
| SECR-01 | Phase 3 | Pending |
| SECR-02 | Phase 3 | Pending |
| SECR-03 | Phase 3 | Pending |
| SECR-04 | Phase 3 | Pending |
| DIAG-01 | Phase 3 | Pending |
| DIAG-02 | Phase 3 | Pending |
| DIAG-03 | Phase 3 | Pending |
| DIAG-04 | Phase 3 | Pending |
| REPT-01 | Phase 3 | Pending |
| REPT-02 | Phase 3 | Pending |
| REPT-03 | Phase 3 | Pending |
| REPT-04 | Phase 3 | Pending |
| CMDS-01 | Phase 4 | Pending |
| CMDS-02 | Phase 4 | Pending |
| CMDS-03 | Phase 4 | Pending |
| CMDS-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after roadmap creation*
