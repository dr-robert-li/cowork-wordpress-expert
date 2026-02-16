# Feature Landscape

**Domain:** WordPress Diagnostic & Audit Tools (Remote CoWork Plugin Approach)
**Researched:** 2026-02-16
**Confidence:** MEDIUM

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Security vulnerability scanning** | Industry standard — all WordPress security tools scan for known vulnerabilities in core, plugins, themes | LOW | Use WP-CLI `verify-checksums` + vulnerability DB lookup (WPScan/Patchstack). No server-side code needed. |
| **File integrity monitoring** | Expected after any security audit to detect unauthorized changes | MEDIUM | Compare file hashes against known-good WordPress checksums. Store baseline hashes in memory/. SSH + rsync provides files. |
| **Database optimization recommendations** | Standard WordPress maintenance — orphaned data, bloated tables, revisions accumulate without intervention | MEDIUM | WP-CLI queries to detect autoload bloat, transient buildup, revision count. Recommendations only (no auto-cleanup). |
| **Plugin/theme version audit** | Users expect to see outdated/vulnerable plugins flagged. Basic hygiene check. | LOW | WP-CLI `plugin list`, `theme list`, cross-reference versions against known vulnerabilities. |
| **Performance bottleneck detection** | Every diagnostic tool identifies slow database queries, excessive autoloads, N+1 patterns | HIGH | Query Monitor data via WP-CLI db queries. Requires understanding query patterns, detecting N+1, analyzing execution time. |
| **PHP/WordPress/MySQL version compatibility check** | Hosting upgrades break sites regularly. Users expect version compatibility warnings. | LOW | Parse environment info from WP-CLI `cli info`, `core version`, PHP version. Flag deprecated features. |
| **HTTPS/SSL configuration audit** | Security baseline. Users expect SSL warnings if misconfigured or missing. | LOW | Check wp-config.php for `FORCE_SSL_ADMIN`, test site URL scheme, verify certificate via remote connection. |
| **User account security audit** | Weak passwords, default admin usernames, excessive admin accounts are standard audit items | MEDIUM | WP-CLI user queries to detect ID 1 with username "admin", count admin-level users, check for inactive privileged accounts. |
| **Structured audit report generation** | Users need exportable findings — not just terminal output. Expected for client delivery. | MEDIUM | Generate markdown/HTML reports from findings stored in memory/. Include severity ratings, evidence, recommendations. |
| **File permission check** | Standard security checklist item — 644 for files, 755 for dirs, wp-config.php not world-readable | LOW | Check via SSH after rsync. Flag deviations from WordPress recommendations. |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI-powered code quality analysis** | Claude reads actual code — not just checksums. Can detect logic flaws, deprecated patterns, bad architecture that automated scanners miss. | HIGH | Requires reading PHP/JS files after rsync, applying WordPress coding standards knowledge, detecting anti-patterns (CLAUDE.md domains). Main differentiator. |
| **Automated patch file generation** | Most tools report problems. Generating ready-to-apply .patch files for fixes is rare and highly valuable. | HIGH | Read code, propose fixes, output unified diff format. Requires deep WordPress knowledge + code generation accuracy. |
| **Architecture review with recommendations** | Beyond "this is slow" — explain WHY (bad data model, hook abuse, etc.) and recommend refactoring approach | MEDIUM | Apply Domain 5 (CLAUDE.md) — detect CPT misuse, options bloat, improper caching. Human-readable explanations. |
| **Plugin/theme conflict detection with root cause analysis** | Tools detect conflicts. Few explain WHY (hook priority collision, global namespace pollution, CSS specificity war). Claude can reason through conflicts. | HIGH | Requires analyzing multiple plugins simultaneously, understanding WordPress hook system, detecting interaction patterns. |
| **Historical trend analysis** | Track changes over time (security posture improving/degrading, performance trends). Most tools are point-in-time snapshots. | MEDIUM | Store findings in memory/ with timestamps. Compare current audit against previous. Show deltas. |
| **Context-aware recommendations** | Generic advice ("use caching") vs specific ("WooCommerce with 10K products should use Redis object cache, not transients"). Claude can tailor. | MEDIUM | Leverage LLM understanding of site type (e-commerce vs blog vs membership) from diagnostic context. |
| **Accessibility audit (WCAG)** | Few remote diagnostic tools check accessibility. Growing compliance requirement (ADA lawsuits increasing). | MEDIUM | Static analysis of theme templates for ARIA, alt text, heading hierarchy, color contrast (via CSS parsing). |
| **Compliance gap analysis (GDPR/PCI)** | Specialized audits for regulatory compliance — rare in general-purpose tools | HIGH | Detect missing privacy policy integration, cookie consent, data export/erasure hooks, payment handling patterns. |
| **Multi-site audit comparison** | Analyze multiple WordPress sites, compare security postures, identify patterns across portfolio | MEDIUM | Iterate over sites.json, run diagnostics on each, generate comparison matrix. Useful for agencies managing multiple clients. |
| **Natural language finding explanations** | Technical findings translated to client-friendly language automatically (non-technical summary + technical detail) | LOW | Claude's core strength. Apply CLAUDE.md communication style: plain language + technical detail in every finding. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Auto-apply fixes without approval** | Dangerous for remote tool — could break production sites. Liability risk. User expects control. | Generate patch files, let user review and apply manually (or via separate approve-apply command). |
| **Real-time monitoring/alerting** | CoWork plugin = on-demand analysis, not always-on monitoring service. Scope creep. Requires persistence/infrastructure. | Focus on deep, thorough audits on-demand. Recommend external monitoring tools (Watchful, ManageWP) if user needs 24/7. |
| **Automatic plugin/theme updates** | Outside scope of diagnostic tool. WordPress core + ManageWP/WP Umbrella handle this well. | Recommend updates in report, don't execute them. Flag outdated/vulnerable versions. |
| **Built-in file backup/restore** | Adds significant complexity. Users should backup before applying fixes (existing tools handle this). | Recommend backup via existing plugins/hosting tools before applying patches. Include reminder in reports. |
| **WordPress admin dashboard integration** | This is a CoWork plugin (markdown commands in Claude), not a WordPress plugin. Cannot install on target sites. | All interaction via SSH/WP-CLI. No dashboard UI. Output to Claude interface only. |
| **Malware removal/cleanup** | Detection = diagnostic scope. Removal = remediation requiring specialized expertise + risk of breaking site. | Detect and report malware signatures (CLAUDE.md 1.8), recommend professional cleanup service or manual review. |
| **Performance optimization execution** | Report problems, don't auto-optimize (could conflict with existing caching/CDN). | Recommend specific optimization steps (enable object cache, reduce autoload, etc.), let user implement. |
| **Full code refactoring** | Scope creep from diagnostic → development work. Patch for security/critical bugs, don't rewrite architecture. | Flag architectural issues, explain impact, recommend refactoring approach. User decides whether to proceed. |

## Feature Dependencies

```
Site Connection (SSH + WP-CLI)
    └──requires──> File Sync (rsync)
                       └──enables──> Code Quality Analysis (read PHP/JS)
                       └──enables──> File Integrity Monitoring (hash comparison)
                       └──enables──> File Permission Check (stat files)

    └──requires──> WP-CLI Database Access
                       └──enables──> Performance Analysis (query patterns)
                       └──enables──> Security Audit (user accounts, options)
                       └──enables──> Version Compatibility Check
                       └──enables──> Plugin/Theme Audit

Code Quality Analysis
    └──enhances──> Automated Patch Generation (need to read code before proposing fixes)

File Integrity Monitoring
    └──requires──> Baseline Storage (memory/ directory)

Historical Trend Analysis
    └──requires──> Findings Storage (memory/ directory with timestamps)
    └──requires──> Previous Audit Results

Multi-Site Audit
    └──requires──> Site Connection (applied to multiple sites)
    └──requires──> Site Registry (sites.json)

Audit Report Generation
    └──requires──> All diagnostic domains complete
    └──enhances──> Natural Language Explanations (reports include both technical + plain language)

Automated Patch Generation
    └──conflicts──> Auto-Apply Fixes (patch generation implies manual review, not auto-apply)
```

## MVP Recommendation

### Launch With (v1.0)

Prioritize table stakes + one strong differentiator to validate CoWork plugin approach:

1. **Site connection (SSH + WP-CLI)** — Foundation for everything
2. **File sync (rsync to local)** — Enables code analysis
3. **Security vulnerability scanning** — Table stakes, high user value, low complexity
4. **Plugin/theme version audit** — Table stakes, easy to implement
5. **File integrity monitoring** — Table stakes, proves remote diagnostic capability
6. **PHP/WordPress/MySQL version check** — Table stakes, simple implementation
7. **User account security audit** — Table stakes, medium complexity but high impact
8. **AI-powered code quality analysis** — Differentiator, proves Claude value-add over automated tools
9. **Structured audit report generation** — Table stakes, required for usability
10. **Natural language finding explanations** — Differentiator, low complexity, high value (Claude strength)

### Defer: Post-MVP (v1.x)

Add after validating core audit workflow:

11. **Database optimization recommendations** — Table stakes but requires more WP-CLI query sophistication
12. **Performance bottleneck detection** — Table stakes but high complexity (N+1 detection, query analysis)
13. **Architecture review** — Differentiator but requires deep analysis across multiple domains
14. **Automated patch file generation** — Differentiator, high complexity, adds significant value after audit proven
15. **Historical trend analysis** — Differentiator, requires baseline data from multiple audit runs
16. **HTTPS/SSL configuration audit** — Table stakes, low complexity
17. **File permission check** — Table stakes, low complexity

### Future Consideration (v2+)

Features requiring deeper research or uncertain ROI:

- **Plugin/theme conflict detection with root cause** — High complexity, uncertain how often needed
- **Accessibility audit (WCAG)** — Medium complexity, niche audience (unless compliance focus)
- **Compliance gap analysis (GDPR/PCI)** — High complexity, specialized knowledge, liability risk
- **Multi-site audit comparison** — Medium complexity, agency-focused feature (narrow audience)
- **Context-aware recommendations** — Medium complexity, requires site type detection + recommendation tuning

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Site connection (SSH + WP-CLI) | HIGH | MEDIUM | P1 (foundation) |
| File sync (rsync) | HIGH | MEDIUM | P1 (foundation) |
| Security vulnerability scanning | HIGH | LOW | P1 (table stakes) |
| AI-powered code quality analysis | HIGH | HIGH | P1 (differentiator) |
| Audit report generation | HIGH | MEDIUM | P1 (usability) |
| Natural language explanations | HIGH | LOW | P1 (differentiator) |
| File integrity monitoring | HIGH | MEDIUM | P1 (table stakes) |
| User account security audit | HIGH | MEDIUM | P1 (table stakes) |
| Plugin/theme version audit | HIGH | LOW | P1 (table stakes) |
| PHP/WordPress/MySQL version check | MEDIUM | LOW | P1 (table stakes) |
| Database optimization recommendations | HIGH | MEDIUM | P2 (table stakes, defer) |
| Performance bottleneck detection | HIGH | HIGH | P2 (table stakes, complex) |
| Automated patch generation | HIGH | HIGH | P2 (differentiator, complex) |
| Architecture review | MEDIUM | MEDIUM | P2 (differentiator) |
| Historical trend analysis | MEDIUM | MEDIUM | P2 (differentiator) |
| HTTPS/SSL audit | MEDIUM | LOW | P2 (table stakes, low urgency) |
| File permission check | MEDIUM | LOW | P2 (table stakes, low urgency) |
| Plugin/theme conflict detection | MEDIUM | HIGH | P3 (situational need) |
| Accessibility audit | LOW | MEDIUM | P3 (niche) |
| Multi-site comparison | LOW | MEDIUM | P3 (agency-focused) |
| Compliance gap analysis | LOW | HIGH | P3 (specialized) |
| Context-aware recommendations | MEDIUM | MEDIUM | P3 (enhancement) |

**Priority key:**
- **P1:** Must have for MVP launch (validates core value proposition)
- **P2:** Should have, add post-MVP (improves completeness, addresses table stakes gaps)
- **P3:** Nice to have, future consideration (niche audience or uncertain ROI)

## Competitor Feature Analysis

| Feature Category | Security Plugins (Wordfence, Sucuri) | Multi-Site Managers (ManageWP, WP Umbrella) | WP-CLI Doctor | CoWork Plugin Approach |
|------------------|--------------------------------------|---------------------------------------------|---------------|------------------------|
| **Malware scanning** | Remote + on-server scanning, signature-based | Basic checks, external service integration | Checksum verification only | File integrity via checksums (detect, don't remove) |
| **Vulnerability detection** | Real-time DB updates, known exploits | Vulnerability alerts, update recommendations | Core/plugin checksum verify | Same as competitors (use WPScan/Patchstack DB) |
| **Code quality analysis** | None (not code auditors) | None | PHP linting only | **AI-powered deep analysis (differentiator)** |
| **Performance diagnostics** | Basic (slow queries, large files) | Uptime monitoring, performance metrics | Configurable checks | **N+1 detection, architecture review (deeper)** |
| **Conflict detection** | Limited (blocks malicious requests) | None | None | **Root cause analysis (differentiator)** |
| **Patch generation** | None | None | None | **Automated diff files (unique capability)** |
| **Report format** | Dashboard UI, email alerts | Dashboard UI, PDF reports | Terminal output, JSON | **Markdown reports in Claude interface** |
| **Installation required** | Yes (WordPress plugin on target) | Yes (agent plugin on target) | No (WP-CLI package) | **No (remote SSH + rsync only)** |
| **Access method** | Runs on server (inside WordPress) | Runs on server (inside WordPress) | WP-CLI on server | **Fully remote (CoWork plugin in Claude)** |
| **Audit depth** | Automated rules only | Surface-level checks | Configurable rules | **AI reasoning (understands context, not just rules)** |

### Our Competitive Positioning

**CoWork plugin is the only tool that:**
1. Provides AI-powered code analysis without installing anything on the WordPress site
2. Generates ready-to-apply patch files for security/quality issues
3. Explains findings in natural language (technical + non-technical audiences)
4. Operates entirely remotely via SSH (no plugin footprint, no performance impact)
5. Combines deep diagnostics (like WP-CLI Doctor) with AI reasoning (unique to Claude)

**We complement (not replace):**
- Real-time monitoring tools (Wordfence, WP Umbrella) — they watch 24/7, we audit on-demand
- Automated update managers (ManageWP) — they keep sites current, we analyze quality/security
- Malware cleanup services — we detect, professionals remove

## Sources

### WordPress Security & Audit Tools
- [Sucuri Security Plugin](https://wordpress.org/plugins/sucuri-scanner/) — File integrity monitoring, malware scanning, security hardening
- [WP Activity Log](https://wordpress.org/plugins/wp-security-audit-log/) — Activity logging, audit trail for changes
- [Wordfence Security](https://www.wordfence.com/) — Application-level firewall, malware scanner, vulnerability detection
- [WordPress Security Plugins 2026 Comparison](https://www.wpbeginner.com/plugins/best-wordpress-security-plugins-compared/)

### WordPress Site Health & Diagnostics
- [WordPress Site Health Tool](https://learn.wordpress.org/tutorial/tools-site-health/) — Built-in diagnostic tool (Status + Info tabs)
- [Health Check & Troubleshooting Plugin](https://wordpress.org/plugins/health-check/) — Troubleshooting mode, plugin conflict detection
- [Site Health Screen Documentation](https://wordpress.org/documentation/article/site-health-screen/)

### WP-CLI Diagnostic Commands
- [WP-CLI Doctor Command](https://github.com/wp-cli/doctor-command) — Diagnose WordPress via configurable checks
- [WP-CLI Core Verify Checksums](https://developer.wordpress.org/cli/commands/core/verify-checksums/) — File integrity verification
- [Running WP-CLI Commands Remotely](https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/)
- [WordPress Security Audit with WP-CLI Checksums](https://joshuarosato.com/posts/wordpress-security-audit-wp-cli/)

### WordPress Performance Analysis
- [Code Profiler Plugin](https://wordpress.org/plugins/code-profiler/) — PHP-level performance profiling
- [Performance Lab Plugin](https://wordpress.org/plugins/performance-lab/) — WordPress core performance features testing
- [Query Monitor](https://wordpress.org/plugins/query-monitor/) — Database query analysis, performance debugging
- [WordPress Performance Testing Tools](https://www.wpexplorer.com/testing-wordpress-performance-speed/)

### Plugin Conflict Detection
- [Health Check Troubleshooting Mode](https://givewp.com/documentation/resources/troubleshoot-wordpress-websites-health-check/) — Disable plugins per-user-session
- [Plugin Detective](https://wordpress.org/plugins/plugin-detective/) — Systematic plugin conflict detection
- [Conflict Finder Plugin](https://wordpress.org/plugins/conflict-finder-wp-fix-it/) — Automated conflict detection
- [WordPress Plugin Conflict Guide](https://www.wpbeginner.com/wp-tutorials/how-to-check-for-wordpress-plugin-conflicts/)

### WordPress Code Quality & Standards
- [WordPress Coding Standards (WPCS)](https://github.com/WordPress/WordPress-Coding-Standards) — PHP_CodeSniffer rules for WordPress
- [PHPCS Documentation](https://make.wordpress.org/core/handbook/testing/automated-testing/phpcs/) — WordPress core PHPCS usage
- [WordPressCS 3.0.0 Announcement](https://make.wordpress.org/core/2023/08/21/wordpresscs-3-0-0-is-now-available/)
- [WPCS Ultimate Guide](https://mehulgohil.com/blog/wpcs-wordpress-coding-standards/)

### WordPress Malware Scanning
- [Sucuri SiteCheck (Remote Scanner)](https://sitecheck.sucuri.net/) — Remote malware detection, blacklist checking
- [WordPress Malware Scanner Comparison](https://www.malcare.com/blog/wordpress-malware-scanner/)
- [SecureWP Remote Security Audit](https://securewp.net/security-checker/)

### WordPress Accessibility Tools
- [Equalize Digital Accessibility Checker](https://wordpress.org/plugins/accessibility-checker/) — 40+ WCAG 2.2 checks
- [WP ADA Compliance Check](https://www.wpadacompliance.com/) — 83 error checks, WCAG 2.1/2.2 compliance
- [Accessibility Guard](https://wordpress.org/plugins/accessibility-guard/) — WCAG 2.2 Level A/AA scanning

### WordPress Database Optimization
- [Advanced Database Cleaner](https://wordpress.org/plugins/advanced-database-cleaner/) — Database optimization, orphaned data cleanup
- [WordPress Database Optimization Guide](https://wp-rocket.me/blog/repair-optimize-wordpress-database/)
- [Complete Database Cleanup Guide 2026](https://nitropack.io/blog/wordpress-database-cleanup-guide/)

### WordPress Security Patching
- [Patchstack](https://patchstack.com/) — Virtual patching, vulnerability mitigation, automated protection
- [WPScan Vulnerability Database](https://wpscan.com/) — WordPress vulnerability scanner
- [Security Patching Guide](https://fatlabwebsupport.com/blog/security-patching-and-vulnerability-fixes-how-ongoing-maintenance-protects-your-wordpress-site/)

### WordPress Multi-Site Management
- [Watchful Remote Management](https://wordpress.org/plugins/watchful/) — Multi-site monitoring, uptime tracking, audit features
- [ManageWP](https://managewp.com/) — Multi-site dashboard, backups, updates, security monitoring
- [WP Umbrella](https://wp-umbrella.com/) — Real-time vulnerability monitoring, automated backups, bulk updates
- [WP Activity Log Multisite Integration](https://wordpress.org/plugins/wp-security-audit-log/)

### WordPress Theme Quality
- [WordPress Theme Testing Guide](https://kinsta.com/blog/wordpress-theme-testing/) — Comprehensive theme validation
- [Theme Check Plugin](https://wordpress.org/plugins/theme-check/) — 14,000+ automated checks for WordPress.org standards
- [Theme Unit Test](https://codex.wordpress.org/Theme_Unit_Test) — Standard test content for themes

### WordPress File Integrity Monitoring
- [File Integrity Monitoring Guide](https://melapress.com/wordpress-file-integrity-scanning-site/) — FIM concepts, implementation
- [Melapress File Monitor](https://wordpress.org/plugins/website-file-changes-monitor/) — WordPress file change tracking
- [WordPress FIM Comprehensive Guide](https://zenocloud.io/blog/file-integrity-monitoring-wordpress/)

### WordPress Dependency & Compatibility
- [Plugin Compatibility Checker](https://wordpress.org/plugins/plugin-compatibility-checker/) — PHP/WordPress version compatibility
- [PHP Compatibility Checker](https://wordpress.org/plugins/php-compatibility-checker/) — PHP 8.x compatibility scanning
- [WP Since](https://www.thewpguy.com.au/automatically-check-your-plugins-wordpress-compatibility-with-wp-since/) — WordPress core function version compatibility

### WordPress Site Audit Documentation
- [WPAudit Checklist](https://wpaudit.site/) — Website audit checklist (formatting, optimization, accessibility, performance, security)
- [InspectWP](https://inspectwp.com/en) — Automated WordPress audit report generation
- [WordPress Audit Guide](https://wpkraken.io/blog/wordpress-audit-guide/) — Step-by-step audit process

---

**Confidence Assessment:**

- **Table Stakes Features:** MEDIUM confidence (based on multiple source verification, standard feature sets across competitors)
- **Differentiators:** MEDIUM-HIGH confidence (AI code analysis = Claude strength, patch generation = technically feasible but unverified in practice)
- **Anti-Features:** HIGH confidence (based on security best practices, scope definition, liability considerations)
- **Competitive Positioning:** MEDIUM confidence (competitor feature sets verified via official sources, unique positioning based on CoWork plugin constraints)

**Research Methodology:**

All features derived from comprehensive web search (2026-02-16) across:
- Official WordPress plugin repositories (wordpress.org)
- Security tool vendors (Sucuri, Wordfence, Patchstack)
- Multi-site management platforms (ManageWP, WP Umbrella, Watchful)
- WP-CLI official documentation (developer.wordpress.org/cli)
- WordPress core documentation (learn.wordpress.org, make.wordpress.org)
- Industry best practices (WPBeginner, Kinsta, WP Rocket)

No primary user research conducted (greenfield project). Competitive feature analysis based on publicly documented capabilities. Real-world usage patterns inferred from community discussions and tool documentation.

**Recommended Validation:**

- Test WP-CLI remote execution reliability (SSH alias setup, command timeouts, error handling)
- Verify patch file generation accuracy (can Claude produce valid unified diffs from code analysis?)
- Validate vulnerability database access (WPScan API terms, Patchstack integration requirements)
- Confirm rsync performance with large WordPress installations (100K+ files)

---

*Feature research completed for: Claude CoWork WordPress Diagnostics Plugin*
*Research date: 2026-02-16*
