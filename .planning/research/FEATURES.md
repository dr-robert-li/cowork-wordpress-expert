# Feature Research

**Domain:** WordPress Diagnostic & Audit Tools (Remote CoWork Plugin — Subsequent Milestone)
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH

> **Scope note:** This document covers BOTH the original feature set (already built) and the new milestone features being added. The "Already Built" section documents what exists for dependency mapping. The core research focus is the new capabilities: DB health analysis, performance diagnostics, HTTPS/SSL audit, file permissions checking, architecture review, findings trends tracking, and multi-source access (local directories, Docker containers, git repositories).

---

## Already Built (Existing Features — Reference Only)

The following are implemented and not in scope for this milestone:

- SSH connection + file sync via rsync
- Core integrity checking (WP-CLI verify-checksums)
- Config security audit (wp-config.php analysis)
- User account audit
- Version compatibility audit (PHP, WP, MySQL, plugins, themes)
- Malware scanning (suspicious patterns in PHP/JS files)
- Code quality analysis (anti-patterns, deprecated functions)
- Report generation with severity ratings
- Investigation workflow (intake → scout → plan → execute → review)
- Case history tracking

---

## Feature Landscape — New Milestone

### Table Stakes (Users Expect These)

Features users assume exist in a WordPress diagnostic tool. Missing these = product feels incomplete. These are the capabilities that were deliberately deferred from the first milestone and are now overdue.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Database health analysis** | Every WordPress diagnostic tool reports on DB state — table overhead, orphaned data, autoload bloat. Users who get a diagnostic report expect DB coverage. Without it the report has a glaring gap. | MEDIUM | WP-CLI `db query` to inspect wp_options autoload size, table overhead via `SHOW TABLE STATUS`. Key thresholds: autoload < 1MB good, 3-5MB warning, >10MB critical. Orphaned postmeta, transients, draft revisions, spam comments all reportable without touching data. |
| **Autoload/wp_options bloat detection** | wp_options autoload is the #1 silent performance killer in WordPress. All major diagnostic tools (BoltAudit, Query Monitor, Site Health) flag it. | LOW | SQL: `SELECT SUM(LENGTH(option_value)) FROM wp_options WHERE autoload='yes'` — available via `wp db query`. Identify top offenders by plugin/theme. Flag total > 800KB. |
| **Performance bottleneck analysis** | Users expect to know WHY a site is slow — not just that it is slow. Slow query identification, large table detection, high post-revision counts all expected. | HIGH | Must distinguish: (a) DB-level bottlenecks (table size, overhead, slow queries) vs (b) code-level (N+1 patterns, missing indexes). DB-level via WP-CLI. Code-level via static analysis of synced files. |
| **HTTPS/SSL configuration audit** | Security baseline item. Every WordPress security checklist includes SSL. Expected alongside the existing config security audit — it's an obvious gap if missing. | LOW | Check: (1) WordPress siteurl/home use https, (2) FORCE_SSL_ADMIN in wp-config.php, (3) FORCE_SSL_LOGIN (deprecated but still seen), (4) whether HTTP redirects to HTTPS. All detectable via WP-CLI `option get siteurl` and wp-config.php parsing already done by existing config audit. |
| **File permissions audit** | Standard WordPress security checklist item. Expected alongside file integrity monitoring. 644/755 is the documented WordPress standard. | LOW | Already have files synced locally via rsync. Run `find` or `stat` on synced copy. Flag: world-writable files (777), executable PHP files in uploads, wp-config.php with permissions wider than 640/400. Note: synced permissions may differ from remote — verify via SSH `stat` command. |
| **Findings trends tracking** | Agencies running repeated audits on client sites need to show progress over time. "Your site improved from critical to warning since last month" is essential for client reporting. Without it, each audit is an isolated snapshot with no comparative value. | MEDIUM | Requires structured storage of timestamped findings. Compare severity counts, new vs resolved issues, trend direction. Existing case history and report generation already store data — this feature reads historical reports and produces delta/trend analysis. |

### Differentiators (Competitive Advantage)

Features that set this tool apart from standard WordPress diagnostic tools. Not universally expected, but highly valued by the target audience (agencies, senior developers).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Architecture review with AI reasoning** | Tools like Query Monitor tell you "this query is slow." This tool explains WHY — bad data model, CPT misuse, options table abuse, hook execution order problems. Claude can reason across the full codebase, not just measure. | HIGH | Depends on: (a) synced files from existing SSH connection, (b) DB analysis from DB health feature, (c) code quality analysis already built. Synthesizes findings into architectural narrative, not just a list. Outputs specific refactoring recommendations with rationale. |
| **Local directory access mode** | Most WordPress diagnostic tools require a live server connection. Local directory mode lets developers analyze local WP installations (MAMP, LocalWP, Valet) without any server setup. Zero-friction for code review before deploy. | MEDIUM | Path-based access instead of SSH. `find /path/to/wp -name "wp-config.php"` to detect WP root. Run WP-CLI locally if available (`wp --path=/path/to/wp`). Fall back to pure file analysis (existing code quality + malware scanning skills work on local files). No rsync needed — read directly. |
| **Docker container access mode** | Agency development workflows increasingly use Docker (Local by Flywheel, Lando, Docksal, custom compose stacks). Running diagnostics on a Docker container without SSH setup is a real friction point. | HIGH | Pattern: `docker exec <container> wp --path=/var/www/html <command>`. Requires: (a) container name/ID detection, (b) WP path within container (varies by image), (c) WP-CLI availability in container. Fallback: `docker cp` to extract files for local analysis. Key constraint: can't use rsync to Docker directly — must use `docker exec` or `docker cp`. |
| **Git repository analysis** | Code quality analysis on git repos lets agencies review client work before deploying to any server. Check code against WordPress standards, detect security issues in committed code, analyze git history for deployment risks. | MEDIUM | Local git checkout → existing code quality analysis skills apply directly. Unique additions: analyze git log for large binary commits, detect secrets in git history (wp-config.php variants), identify uncommitted changes that differ from production (if SSH site is also connected). `git log`, `git diff`, `git show` for history analysis. |
| **Cross-audit findings comparison** | Show which issues are new, which are resolved, and which are recurring (never fixed). Recurring issues signal process problems, not just technical debt. No existing tool does this — they report current state only. | MEDIUM | Reads structured findings from memory/history. Groups issues by type/file/plugin. Classifies as: new, resolved, recurring, degraded. Produces a change summary suitable for client reporting. Depends on: findings trends tracking (table stakes above) for the data, existing report generation for output format. |
| **Database query pattern analysis (N+1 detection)** | Most tools flag slow individual queries. N+1 patterns (one query per post in a loop) are architecturally different — they appear fast individually but scale catastrophically. Claude can detect N+1 patterns in code that automated tools miss. | HIGH | Static analysis approach: scan synced PHP files for WP_Query inside foreach loops over WP_Query results, get_post_meta calls inside loops, direct $wpdb->get_results inside loops. Dynamic approach (harder): analyze WP-CLI query logs. Static analysis is more reliable for diagnostic purposes. |
| **Multi-source unified report** | Developers often have the same WordPress project in multiple forms simultaneously: local dev copy, Docker staging, git repo, and live SSH site. Unified analysis across sources reveals deployment drift. | HIGH | Coordinates local, Docker, and SSH access modes. Compares file checksums across sources. Flags divergence between git HEAD and deployed code. Reports which source has which issues. Highly complex orchestration — significant new architecture required. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-optimize database** | Users want one-click cleanup of bloated tables, orphaned data, transients | Risk of data loss on production. Transient cleanup sounds safe but can break active caches mid-request. Table optimization locks tables briefly — unacceptable on production. | Report what to clean, recommend maintenance window, generate the exact WP-CLI commands the user can run manually with appropriate safeguards. Never auto-execute writes. |
| **Real-time performance monitoring** | Developers want ongoing visibility into site performance, not just point-in-time audits | This is a diagnostic tool, not monitoring infrastructure. Real-time monitoring requires persistent agent, database, alerting — entirely different architecture and scope. | Integrate findings with or recommend dedicated monitoring tools (New Relic, Kinsta APM, WP Umbrella). Document how to set up slow query logging as a manual first step. |
| **Direct Docker volume mounting for analysis** | Seems faster than docker exec for large sites | Volume access patterns vary by Docker configuration. Paths differ between Docker Desktop (macOS) and Linux Docker. Requires privileged access. Fragile across compose configurations. | Use `docker exec` for WP-CLI commands. Use `docker cp` to extract specific directories for analysis. Document both patterns with fallbacks. |
| **Git-based auto-deploy with fixes** | If tool identifies issues in git repo, why not push fixes directly? | Unauthorized commits to client repos are a trust breach. Force pushes can destroy history. CI/CD pipelines may trigger on commits. | Generate patch files (already planned as differentiator) that the developer can review and commit intentionally. Never touch git remotes. |
| **Historical DB query logs** | Users want trending slow query data over time | Requires server-side slow query log to be enabled (usually off by default), log rotation management, log parsing pipeline. Not feasible without server agent. | Detect whether slow query log is enabled and recommend enabling it. Parse existing log file if found during rsync. Do not attempt to create persistent log infrastructure. |
| **Container-level memory/CPU profiling** | Docker stats during WP request execution would show resource bottlenecks | Requires attaching to container runtime during actual request execution — complex timing, instrumentation, and output parsing. Not feasible in diagnostic scan mode. | Report what can be inferred statically (large plugins, heavy autoloads, missing opcache) plus `docker stats --no-stream` for a snapshot. |

---

## Feature Dependencies

```
[Existing] SSH Connection + rsync file sync
    └──enables──> Local file analysis (code quality, malware, file permissions)
    └──enables──> WP-CLI remote commands (DB health, autoload, version info)

[NEW] Local Directory Access Mode
    └──enables──> All existing file analysis skills (no rsync needed, read directly)
    └──enables──> Local WP-CLI execution (if wp-cli installed locally)
    └──conflicts──> SSH-dependent features (WP-CLI remote, rsync sync)

[NEW] Docker Container Access Mode
    └──requires──> Docker CLI (docker exec, docker cp)
    └──enables──> WP-CLI via docker exec
    └──enables──> File extraction via docker cp → existing analysis skills
    └──conflicts──> SSH access (container not SSH-accessible by default)
    └──enhances──> Git Repo Analysis (same codebase, different runtime state)

[NEW] Git Repository Analysis
    └──requires──> git CLI (already available on macOS)
    └──enables──> Existing code quality + malware analysis skills on checked-out files
    └──enhances──> Docker Container Access (compare deployed vs committed code)
    └──enhances──> SSH Site Access (compare production vs committed code)

[NEW] Database Health Analysis
    └──requires──> WP-CLI database access (SSH mode) OR local WP-CLI (local mode)
    └──requires──> [Existing] SSH Connection OR [NEW] Local Directory Access
    └──enables──> Performance Bottleneck Analysis (DB is primary data source)
    └──enables──> Architecture Review (DB patterns inform architectural findings)

[NEW] Autoload/wp_options Bloat Detection
    └──requires──> Database Health Analysis (same data source, subset of DB analysis)
    └──enhances──> Performance Bottleneck Analysis (autoload IS the bottleneck)

[NEW] Performance Bottleneck Analysis
    └──requires──> Database Health Analysis (for DB-side bottlenecks)
    └──requires──> [Existing] Code Quality Analysis (for code-side N+1 patterns)
    └──enables──> Architecture Review (performance findings feed architectural diagnosis)

[NEW] HTTPS/SSL Audit
    └──requires──> [Existing] wp-config.php analysis (FORCE_SSL_ constants already parsed)
    └──requires──> WP-CLI option access (siteurl, home URL scheme)
    └──enhances──> [Existing] Security Audit (SSL is part of security posture)
    NOTE: Largely built on existing config audit infrastructure. Low incremental effort.

[NEW] File Permissions Audit
    └──requires──> SSH access OR local filesystem access (either access mode works)
    └──enhances──> [Existing] File Integrity Monitoring (permissions + checksums together)
    NOTE: SSH `stat` command or local `find -perm` after rsync. Simple implementation.

[NEW] Architecture Review
    └──requires──> [Existing] Code Quality Analysis (code patterns feed architecture diagnosis)
    └──requires──> [NEW] Database Health Analysis (DB patterns part of architecture)
    └──requires──> [NEW] Performance Bottleneck Analysis (performance informs architecture)
    └──enhances──> [Existing] Report Generation (architecture section in final report)

[NEW] Findings Trends Tracking
    └──requires──> [Existing] Case History / Report Generation (historical data source)
    └──requires──> Multiple prior audit runs (no data = no trends, needs 2+ audits)
    └──enables──> Cross-Audit Findings Comparison (diff view on top of trend data)

[NEW] Cross-Audit Findings Comparison
    └──requires──> [NEW] Findings Trends Tracking (data must exist first)
    └──enhances──> [Existing] Report Generation (delta report as output format)
```

### Dependency Notes

- **HTTPS/SSL audit** is the lowest-effort new feature — existing wp-config.php parsing and WP-CLI already provide all needed data. Mostly a matter of adding SSL-specific checks to the existing config audit skill.
- **File permissions audit** is similarly low-effort — files are already synced locally via rsync, just need `find -perm` analysis. The main complexity is distinguishing local synced permissions from actual remote permissions (must use SSH `stat` for authoritative data).
- **Database health analysis** is the prerequisite for three other features (performance bottleneck, architecture review, autoload detection). Build this first in the milestone.
- **Local directory, Docker, and git access modes** are independent of each other but all share the same underlying analysis skills. The access mode affects HOW files are obtained, not HOW they are analyzed.
- **Findings trends tracking requires existing data** — it cannot produce trends on the first audit. This is a soft dependency: the feature code can exist from day one, but it won't show trends until 2+ audits have run.
- **Multi-source unified report** (differentiator) depends on ALL three new access modes being complete — do not attempt until local, Docker, and git modes each work independently.

---

## MVP Definition for This Milestone

### Launch With (Milestone v2.0)

Minimum set to deliver the milestone. Focused on completing table stakes deferred from v1.

- [ ] **Database health analysis** — Was P2 in v1, now overdue. Foundation for 3 other features.
- [ ] **Autoload/wp_options bloat detection** — Subset of DB analysis, high user value, low incremental cost.
- [ ] **HTTPS/SSL configuration audit** — Was P2 in v1. Low effort since wp-config.php already parsed.
- [ ] **File permissions audit** — Was P2 in v1. Low effort with files already synced.
- [ ] **Local directory access mode** — Removes server-access requirement, opens developer-only use cases.
- [ ] **Findings trends tracking** — Needed for agency reporting value. Reads existing stored data.

### Add After Validation (v2.x)

- [ ] **Performance bottleneck analysis** — High complexity, depends on DB analysis being solid first.
- [ ] **Docker container access mode** — Complexity in path detection and WP-CLI within container. Validate local mode first.
- [ ] **Git repository analysis** — Builds on existing code quality skills. Straightforward once local mode works.
- [ ] **Architecture review** — Depends on DB + performance analysis being complete. High-value synthesis feature.
- [ ] **Cross-audit findings comparison** — Depends on trends tracking having data. Add after trends tracking has been running.

### Future Consideration (v3+)

- [ ] **N+1 query detection via static analysis** — High complexity, specialized pattern matching, uncertain accuracy.
- [ ] **Multi-source unified report** — Requires all three access modes working AND significant orchestration work.
- [ ] **Database query pattern analysis (dynamic)** — Requires slow query log infrastructure on target server.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Database health analysis | HIGH | MEDIUM | P1 — overdue table stakes, blocks 3 other features |
| Autoload/wp_options bloat | HIGH | LOW | P1 — high impact, trivially added to DB analysis |
| HTTPS/SSL audit | MEDIUM | LOW | P1 — overdue table stakes, reuses existing infrastructure |
| File permissions audit | MEDIUM | LOW | P1 — overdue table stakes, files already available |
| Local directory access mode | HIGH | MEDIUM | P1 — zero-friction path for developer use cases |
| Findings trends tracking | HIGH | MEDIUM | P1 — essential for agency reporting value proposition |
| Performance bottleneck analysis | HIGH | HIGH | P2 — high value, high effort, depends on DB analysis |
| Docker container access mode | MEDIUM | HIGH | P2 — common agency workflow, complex implementation |
| Git repository analysis | MEDIUM | LOW | P2 — straightforward extension of existing code analysis |
| Architecture review | HIGH | HIGH | P2 — strong differentiator, depends on DB + performance |
| Cross-audit findings comparison | HIGH | MEDIUM | P2 — depends on trends tracking having data |
| N+1 query static analysis | MEDIUM | HIGH | P3 — uncertain accuracy, complex to implement reliably |
| Multi-source unified report | MEDIUM | HIGH | P3 — requires all three access modes first |

**Priority key:**
- P1: Build in this milestone
- P2: Build in this milestone if P1 complete, or next milestone
- P3: Future consideration

---

## What "Expected Behavior" Looks Like

This section documents concrete expected behavior for each new feature — what a developer or agency user would expect to see when using these features.

### Database Health Analysis

**Expected output:**
- Total DB size (MB), number of tables, number of empty tables
- Table-by-table breakdown: data size, index size, overhead (fragmentation)
- Autoload total size with severity rating (green <1MB, yellow 3-5MB, red >10MB)
- Top 10 autoloading options by size with plugin attribution where possible
- Orphaned data counts: postmeta with no parent post, orphaned term relationships, expired transients
- Post revision count (flag if >5 per post on average — indication of no revision limit set)
- Recommendation for each finding (e.g., "Add `define('WP_POST_REVISIONS', 5)` to wp-config.php")

**What users do NOT expect:**
- Automatic cleanup (read-only analysis only)
- Raw SQL output — translated to human-readable findings
- False precision — round numbers and severity tiers, not exact bytes

### HTTPS/SSL Audit

**Expected output:**
- WordPress home URL scheme (http vs https) — from `wp option get home`
- WordPress siteurl scheme — from `wp option get siteurl`
- FORCE_SSL_ADMIN constant (present/absent, true/false) — from wp-config.php
- HTTP → HTTPS redirect test (attempt HEAD request to http:// version, check for 301)
- Certificate expiry check (via openssl s_client if accessible, or flag as "unable to check remotely")
- Mixed content warnings (scan HTML output for http:// asset references)

**What users do NOT expect:**
- Certificate chain validation depth (too technical for diagnostic output)
- HSTS header configuration (good to add, but out of scope for file-based diagnostic)
- Auto-fix (never — changes WordPress URLs can break sites)

### File Permissions Audit

**Expected output:**
- Summary: X files at incorrect permissions
- Flag: world-writable files (777, 666, 775, 664 with group write)
- Flag: wp-config.php wider than 640 (should be 400 or 440 on most hosts)
- Flag: PHP files in uploads directory (executable uploads = security risk)
- Flag: .htaccess world-writable
- Expected norms: Files 644, Directories 755
- Note: "Permissions shown are from synced local copy — verify with SSH for authoritative values"

**What users do NOT expect:**
- Auto-chmod (never — permissions changes can break site functionality)
- Explanations for every correct permission (only flag violations)

### Local Directory Access Mode

**Expected behavior:**
- User provides filesystem path: `/diagnose --path /Users/me/Sites/client-site`
- Tool detects WP root (finds wp-config.php, wp-includes/, wp-content/)
- Runs all existing analysis skills on local files directly
- Attempts local WP-CLI if available (`which wp` → `wp --path=<path> <command>`)
- If WP-CLI not available locally, falls back to pure file analysis (no DB analysis possible)
- Reports which analyses could/couldn't run based on WP-CLI availability
- No rsync, no SSH — direct filesystem reads only

**Key difference from SSH mode:** No database analysis unless local WP-CLI is available and database is accessible locally (MySQL running, credentials in wp-config.php matching local DB).

### Docker Container Access Mode

**Expected behavior:**
- User provides container name/ID: `/diagnose --docker wordpress-container`
- Tool probes: `docker exec <container> wp --info` to confirm WP-CLI availability and WP path
- If WP-CLI available: runs WP-CLI commands via `docker exec` (same as SSH mode, different transport)
- If WP-CLI not available: extracts files via `docker cp <container>:/var/www/html /tmp/wp-extract/` for file analysis
- Reports container WP-CLI version, WP path, whether DB analysis was possible
- Does NOT attempt to install WP-CLI in container (diagnostic-only, no modifications)

**Common container paths to probe:** `/var/www/html` (official WordPress image), `/app/public` (Lando), `/var/www` (generic), `/srv/www` (Bedrock/Trellis).

### Git Repository Analysis

**Expected behavior:**
- User provides repo path or URL: `/diagnose --git /path/to/repo` or `--git git@github.com:client/site`
- For local path: checks out HEAD (or specified branch) → applies existing code quality + malware analysis
- Unique git-specific analysis:
  - `git log --all --full-history -- "*wp-config*"` — detect if wp-config.php was ever committed (credentials leak)
  - `git log --stat` — identify large binary file commits (performance red flag in repo)
  - `git diff HEAD` — uncommitted changes (drift from what's deployed if SSH site also known)
  - Check `.gitignore` for WordPress-appropriate exclusions (uploads/, wp-config.php)
- Reports: code quality issues (existing skills), git hygiene issues (new), secret detection in history

**What users do NOT expect:**
- Push access or remote changes
- Branch switching without explicit instruction
- Database analysis (git repos don't include DB)

### Findings Trends Tracking

**Expected behavior:**
- Automatically compares current audit findings against most recent stored audit for same site
- Reports: new issues (appeared this audit), resolved issues (were present, now gone), recurring issues (present in 3+ audits)
- Shows severity trajectory: "Security posture improved — critical issues down from 3 to 1 since 2026-01-15"
- Requires no user action — activates automatically when prior audit data exists
- Delta report section appears at top of audit report when trend data available
- Stores findings in structured format to enable future comparisons

**What users do NOT expect:**
- Trends on first audit (no prior data — gracefully omit trends section)
- Graphs or visualizations (text/markdown report format only)
- Issue age tracking beyond "first seen / last seen" dates

---

## Competitor Feature Analysis

| Feature | Query Monitor | BoltAudit | WP-CLI Doctor | Health Check Plugin | CoWork Plugin (This Milestone) |
|---------|--------------|-----------|---------------|--------------------|---------------------------------|
| **DB health analysis** | Live query analysis (requires plugin on site) | Autoload + table counts | Configurable DB checks | Basic DB checks | WP-CLI based, no plugin required |
| **Autoload detection** | Shows autoloaded options during page load | Yes, with culprit identification | Configurable check | Site Health flagging (WP 5.9+) | Identifies top offenders + attribution |
| **HTTPS/SSL audit** | No | No | No | Yes (basic) | wp-config.php + WP option checks |
| **File permissions** | No | No | Yes (configurable) | No | Synced file analysis + SSH stat |
| **Trends tracking** | No | No | No | No | Cross-audit delta analysis |
| **Local directory mode** | Runs on live site only | Runs on live site only | Yes (local WP-CLI) | Runs on live site only | Yes — no SSH required |
| **Docker mode** | No | No | No | No | docker exec / docker cp |
| **Git analysis** | No | No | No | No | Git history + code quality |
| **Architecture review** | Performance data only | Basic warnings | No | No | AI reasoning across all findings |
| **AI explanations** | No | No | No | No | Every finding translated to plain language |

### Our Competitive Positioning for This Milestone

**After this milestone, the CoWork plugin becomes the only tool that:**
1. Provides DB health analysis without installing a plugin on the target site
2. Tracks findings trends across audits with automatic delta reporting (no other tool does this)
3. Analyzes WordPress sites across three access modes (SSH, local directory, Docker) with a unified skill set
4. Combines git repository code review with WordPress-specific pattern detection
5. Produces architecture-level diagnosis (not just metrics) using AI reasoning across code + DB + performance findings

**Key limitation to communicate honestly:** Docker access mode requires WP-CLI in the container or willingness to `docker cp` extract. Containerized sites without WP-CLI lose DB analysis capability. This is a real constraint, not a minor edge case — Lando, Docksal, and custom Compose setups vary widely in WP-CLI availability.

---

## Sources

### WordPress Database Analysis
- [WP-CLI db optimize command](https://developer.wordpress.org/cli/commands/db/optimize/) — Official WP-CLI db subcommands
- [Kinsta: wp_options autoload cleanup guide](https://kinsta.com/blog/wp-options-autoloaded-data/) — Autoload thresholds, SQL queries, top-offender identification
- [MainWP: Analyzing autoload size](https://mainwp.com/is-your-wordpress-database-bloated-how-to-analyze-autoload-size/) — Agency perspective on DB bloat
- [WordPress Site Health: autoloaded options flagging](https://wordpress.org/support/topic/site-health-status-autoloaded-options-could-affect-performance/) — WP core threshold = 900KB warning
- [BoltAudit plugin](https://wordpress.org/plugins/boltaudit/) — DB diagnostic UI patterns, autoload identification approach
- [DCHost: DB optimization guide](https://www.dchost.com/blog/en/wordpress-database-optimization-guide-wp_options-autoload-and-table-bloat/) — Table overhead, fragmentation analysis

### WordPress SSL/HTTPS Checks
- [WordPress SSL issues guide — WPBeginner](https://www.wpbeginner.com/wp-tutorials/how-to-fix-common-ssl-issues-in-wordpress-beginners-guide/) — Common SSL misconfiguration patterns
- [wp-umbrella SSL troubleshooting](https://wp-umbrella.com/troubleshooting/https-and-ssl-issues-wordpress/) — Expected diagnostic checks
- [WordPress is_ssl() function](https://developer.wordpress.org/reference/functions/is_ssl/) — How WordPress detects SSL state
- [SentinelOne WordPress Security Audit checklist](https://www.sentinelone.com/cybersecurity-101/cybersecurity/wordpress-security-audit/) — SSL as standard audit item

### WordPress File Permissions
- [LoginPress 2025 audit checklist](https://loginpress.pro/wordpress-security-audit-checklist/) — 644/755 standard, wp-config.php 400/440
- [BlogVault security audit](https://blogvault.net/wordpress-security-audit) — File permission audit as standard checklist item
- [MalCare security audit guide](https://www.malcare.com/blog/wordpress-security-audit/) — Specific permission values and context

### Performance Bottleneck Detection
- [Code Profiler plugin](https://wordpress.org/plugins/code-profiler/) — PHP profiling patterns, WP-CLI integration
- [Kinsta: debugging WordPress performance](https://kinsta.com/blog/debugging-wordpress-performance/) — Bottleneck identification workflow
- [BoltAudit DB + autoload analysis](https://wordpress.org/plugins/boltaudit/) — Runtime impact analysis approach
- [Remkus de Vries: diagnosing WP performance](https://remkusdevries.com/how-i-diagnose-wordpress-performance-bottlenecks/) — Practitioner workflow for bottleneck identification
- [deliciousbrains: SQL query optimization](https://deliciousbrains.com/sql-query-optimization/) — EXPLAIN, indexing, slow query analysis

### Local/Docker/Git Access Patterns
- [WP-CLI with Docker guide](https://medium.com/@tatemz/using-wp-cli-with-docker-21b0ab9fab79) — docker exec WP-CLI patterns
- [Docker WordPress official image](https://hub.docker.com/_/wordpress) — Standard container paths (/var/www/html)
- [Docker WP-CLI forum discussion](https://forums.docker.com/t/can-i-use-wp-cli-in-my-host-for-wordpress/146824) — docker exec vs volume patterns, real-world constraints
- [WPScan CLI scanner](https://wpscan.com/wordpress-cli-scanner/) — Local WP-CLI diagnostic reference
- [Gitium plugin](https://wordpress.org/plugins/gitium/) — Git + WordPress integration patterns
- [VersionPress](https://versionpress.com/) — Git-based WordPress version control approach
- [WP Pusher](https://wppusher.com/) — Git repo → WordPress deployment workflow reference

### Findings Trends & Agency Reporting
- [WP Client Reports plugin](https://wordpress.org/plugins/wp-client-reports/) — Agency reporting format, historical tracking UI patterns
- [WP Umbrella maintenance reports guide](https://wp-umbrella.com/blog/ultimate-wordpress-maintenance-report-guide/) — What agency clients expect in recurring reports
- [GTmetrix historical tracking](https://gtmetrix.com/) — Trend visualization reference for performance over time

### WordPress Architecture Review
- [WordPress Site Architecture docs](https://developer.wordpress.org/advanced-administration/wordpress/site-architecture/) — Official architectural reference
- [Tapflare: WordPress CMS technical evaluation 2025](https://tapflare.com/articles/wordpress-cms-analysis-2025) — Architectural strengths/weaknesses analysis
- [Medium: theme architectural deconstruction 2026](https://medium.com/@forrestadbashar/architects-verdict-a-technical-deconstruction-of-15-wordpress-themes-for-performance-f803e9dd93f3) — Theme architecture evaluation criteria

---

**Confidence Assessment:**

- **Table Stakes Features (DB health, SSL, file perms):** HIGH — all are documented standards across multiple security audit checklists, existing tools, and WP-CLI official commands. Expected behavior well-established.
- **Trends Tracking:** MEDIUM — no existing tool does this at the diagnostic level (only monitoring tools do). Expected behavior derived from agency reporting patterns, not existing diagnostic tool precedent.
- **New Access Modes (local, Docker, git):** MEDIUM — local and git are straightforward. Docker has HIGH confidence for docker exec pattern but MEDIUM for container WP-CLI availability (varies significantly by stack).
- **Architecture Review:** MEDIUM — the value is clear; the implementation details (what to synthesize, how to present architectural diagnosis) require judgment during build, not research.
- **Performance Bottleneck Analysis:** MEDIUM — DB-side analysis is well-documented. Code-side N+1 detection via static analysis is novel; effectiveness unproven until built.

---

*Feature research for: Claude CoWork WordPress Diagnostics Plugin — Subsequent Milestone*
*Researched: 2026-02-18*
