# Project Research Summary

**Project:** Claude CoWork WordPress Diagnostics Plugin — Milestone 2
**Domain:** WordPress Diagnostic & Audit Tooling (Claude plugin / AI agent)
**Researched:** 2026-02-18
**Confidence:** HIGH

> **Milestone 2 scope note:** The v1 foundation (SSH, rsync, WP-CLI, code quality analysis, security scanning, report generation) is complete and stable. This SUMMARY covers the research for seven new capability clusters being added in Milestone 2. The previous SUMMARY.md (dated 2026-02-16) covers the v1 research baseline which remains valid and unchanged.

## Executive Summary

This is Milestone 2 of an existing Claude plugin for diagnosing WordPress sites. The v1 foundation (SSH, rsync, WP-CLI, code quality analysis, security scanning, report generation) is complete and stable. Milestone 2 adds seven capability clusters that were deliberately deferred: database health analysis, performance bottleneck detection, architecture review, findings trend tracking, and three new site-access modes (local directory, Docker container, git repository). The research confirms all seven capability clusters are technically feasible without introducing new tool dependencies beyond what WP-CLI already provides — the work is primarily implementation skill, not new tooling.

The recommended approach centers on a source abstraction pattern: a `source_type` field added to `sites.json` profiles routes every command to the correct execution model (SSH, local bash, docker exec, or git clone + local). This approach avoids a formal adapter layer rewrite while enabling all four access modes. Critically, Docker and git both collapse into local file access once connection is established, meaning the existing analysis skills work unchanged — only the access phase differs. Build order is strict: the `sites.json` schema extension and `/connect` branching must come first, since every downstream component reads `source_type` from the profile.

The dominant risks are security-related and correctness-related, not complexity-related. Credentials must never appear in Claude's context window (always use WP-CLI for DB access, never grep wp-config.php for passwords). DB queries that hardcode the `wp_` table prefix silently fail on 30%+ of production sites. Finding IDs hashed on line numbers invalidate trend data after any code refactor. These three pitfalls have high recovery cost and are easy to implement incorrectly on a first pass — they require explicit defensive decisions before writing code, not retrospective fixes.

## Key Findings

### Recommended Stack

The v1 stack (SSH, rsync, WP-CLI, jq, PHPStan, PHPCS, WPScan) is entirely unchanged. Milestone 2 adds only two optional WP-CLI packages (`wp-cli/profile-command` for performance stage/hook timing, `runcommand/query-debug` for per-page query counts), standard MySQL INFORMATION_SCHEMA SQL queries (no new tool — already available via `wp db query`), and `docker exec` / `git clone` as connection mechanisms. No new persistent services, databases, or language runtimes are required.

**Core technology additions:**
- `wp db query` + INFORMATION_SCHEMA SQL: database health analysis — zero install cost, WP-CLI already required on all connected sites
- `wp-cli/profile-command`: hook/stage performance timing — installs per-site on demand via `wp package install`; official WP-CLI package
- `runcommand/query-debug`: per-page query count — community package by WP-CLI core contributor; MEDIUM confidence (install may fail on shared hosting due to filesystem permissions)
- `docker exec` + `docker cp`: Docker container access — standard Docker CLI, no SDK or library needed
- `git clone --depth=1`: git repository access — shallow clone reduces transfer size 80%+; git sparse-checkout cone mode available since Git 2.27 (2020)
- `jq` (extended queries): trend computation from case-log.json — existing tool, backward-compatible schema extension

**What is explicitly ruled out:** MySQL client (overkill; WP-CLI handles it), Redis or time-series DB for trends (overengineering — extend case-log.json with jq), Docker SDK (docker CLI always available where Docker is installed), GitHub API (git clone covers all hosts without auth token management), Local by Flywheel API (no public API — filesystem detection works).

### Expected Features

**Must have (Milestone 2 table stakes — deferred from v1, now overdue):**
- Database health analysis — every WordPress diagnostic tool covers this; glaring gap without it; blocks three other features
- Autoload / wp_options bloat detection — #1 silent performance killer in WordPress; flagged by all competing tools; subset of DB analysis
- HTTPS/SSL configuration audit — security baseline; mostly reuses existing wp-config.php parsing infrastructure
- File permissions audit — standard security checklist; files already synced locally via rsync
- Local directory access mode — removes server-access requirement; opens developer and agency local-dev workflows
- Findings trend tracking — essential for agency client reporting ("improved from critical to warning since last month")

**Should have (Milestone 2 differentiators — build after P1 features validated):**
- Performance bottleneck analysis — HIGH value but HIGH complexity; depends on DB analysis being solid first
- Docker container access mode — common agency workflow; HIGH complexity in container path detection across image variants
- Git repository analysis — straightforward extension of existing code quality skills; builds on local mode patterns
- Architecture review with AI reasoning — strongest differentiator; depends on DB + performance analysis being complete
- Cross-audit findings comparison — depends on trend tracking having at least 2 runs of data

**Defer to v3+:**
- N+1 query detection via dynamic profiling — requires slow query log infrastructure on target server; not feasible in diagnostic scan mode
- Multi-source unified report (compare live SSH site vs git repo vs Docker container simultaneously) — requires all three access modes working AND significant new orchestration

**Anti-features confirmed (research reinforced original v1 anti-feature list):**
- Auto-optimize database — never execute writes; report findings + recommend commands for user to run manually
- Real-time monitoring — wrong architecture; recommend dedicated tools (WP Umbrella, Kinsta APM)

### Architecture Approach

The central challenge is that the v1 codebase hardcodes SSH throughout every command and skill. Rather than a full adapter-layer rewrite, Milestone 2 adds a `source_type` field to `sites.json` profiles and a `run_remote()` execution wrapper to each skill. This wrapper reads `source_type` and routes to `ssh {user}@{host}`, `bash -c "cd {path} && ..."`, or `docker exec {container} bash -c "..."` accordingly. Git is treated as setup-time work (clone to `.sites/{name}/`) that produces a local directory — the skill layer sees it as identical to local mode. Existing SSH profiles work unchanged (backward-compatible; profiles without `source_type` treated as `"ssh"`).

Four new skills are added (`diagnostic-db-analysis`, `diagnostic-performance`, `diagnostic-architecture`, `trends-tracker`). Two existing skills are updated (`site-scout` adds source-aware execution; `report-generator` adds new finding categories and conditional Trends section). Three commands are modified (`/connect` adds source type selection; `/diagnose` adds resync branching and new modes; `/investigate` adds new skills to planning waves).

**Major components:**
1. `/connect` command — gains a source type selection branch (ssh/local/docker/git) before the existing SSH flow; all paths converge at WP validation and profile save; SSH path unchanged
2. Source resolution layer — `source_type` in `sites.json` drives all execution routing; `run_remote()` function in each skill abstracts away transport
3. `diagnostic-db-analysis` skill — WP-CLI DB queries with dynamic table prefix detection; source-aware DB access (SSH: `wp db query` over SSH / local: `wp db query --path=` / docker: `docker exec wp db query` / git: mysql direct with credentials from WP-CLI config)
4. `diagnostic-performance` skill — static code analysis works for all source types (N+1 patterns, hook analysis, blocking HTTP); WP-CLI profile/cron checks degrade gracefully when unavailable
5. `diagnostic-architecture` skill — pure file analysis (CPT misuse, options abuse, hook patterns); gates CPT misuse severity on DB row count context from Phase 2
6. `trends-tracker` skill — reads `memory/{site}/case-log.json`, computes trajectory, writes `memory/{site}/trends.json`; source-type-agnostic (reads only memory/ files)
7. `report-generator` skill (updated) — new finding categories (Database Health, Performance, Architecture) + conditional Trends section at top of report when trends.json exists

**Recommended build order (from ARCHITECTURE.md direct codebase analysis):**
Step 1: sites.json schema extension + /connect LOCAL flow
Step 2: /connect DOCKER + GIT flows
Step 3: Source-aware execution in /diagnose and site-scout
Step 4: diagnostic-db-analysis skill
Step 5: diagnostic-performance skill
Step 6: diagnostic-architecture skill
Step 7: trends-tracker skill + report-generator trends section
Step 8: /diagnose and /investigate full mode updates

### Critical Pitfalls

1. **DB credentials exposed in Claude context window** — Never `cat wp-config.php` or read the file directly to extract DB_PASSWORD. Always use `wp config get DB_NAME` / `wp config get DB_HOST` via WP-CLI, which handles authentication internally. For direct MySQL connections (git source, no WP-CLI available), pass password via `MYSQL_PWD` env var, never as a `-p` flag argument (visible in process lists). Never store DB_PASSWORD in sites.json. HIGH recovery cost: credential exposure requires immediate password rotation.

2. **Hardcoded `wp_` table prefix in DB queries** — All SQL referencing `wp_options`, `wp_posts`, `wp_postmeta` silently returns zero results on the 30%+ of production sites with a non-default prefix. Always read prefix first: `wp config get table_prefix --path={wp_path}` and substitute into every query. Store the detected prefix in the site profile. This pitfall is invisible in testing (default prefix works) and only surfaces on client sites.

3. **Finding IDs hashed on line numbers break trend tracking** — If finding IDs include a line number (e.g., `functions.php:142`), any code formatter or refactor shifts every ID, causing the trend system to report "all findings new" on every run. Hash on finding type + file path + first 80 characters of code snippet instead. This decision must be made and implemented in Phase 2 (when the first DB skill writes findings) — retroactive migration discards all historical trend data.

4. **Docker container auto-selection picks the wrong container** — Multi-container setups (multiple WordPress sites, database containers named with "wordpress") cause auto-selection to silently use the wrong container. Always present a selection list and ask the user to confirm. Verify WordPress presence by checking for wp-config.php inside the confirmed container before saving the profile.

5. **wp-config.php credential parsing fails on environment-injected credentials** — Managed hosts (Kinsta, WP Engine), Docker-based installs (Local by Flywheel), and Bedrock setups use `getenv_docker()` or `$_SERVER['DB_']` instead of hardcoded string literals. Regex/grep parsing returns empty or wrong values. Use `php -r "include 'wp-config.php'; ..."` or WP-CLI config commands. Detect env-var patterns and gracefully inform the user rather than failing silently.

## Implications for Roadmap

Based on dependency chains identified across all four research files, the natural phase structure follows the architecture build order. The phasing also maps to logical user-visible milestones so each phase produces independently testable and usable capability.

### Phase 1: Source Abstraction Foundation — Connection Modes

**Rationale:** Everything else depends on `source_type` existing in the profile. The `/connect` command branching is a prerequisite for all source-aware skills. This phase also closes the biggest Milestone 2 access gaps (local and Docker) and enables all subsequent phases to be tested against more than just SSH sites.

**Delivers:**
- Local directory connection mode (zero-friction developer workflow — no SSH, no sync)
- Docker container connection mode (docker exec replaces ssh)
- Git repository connection mode (clone to .sites/, then treat as local)
- Updated `sites.json` schema with `source_type`, `container`, `git_url`, `git_branch` fields (backward-compatible)
- Source-aware file sync in `/diagnose` Section 3 (rsync / docker cp / git pull / no-op for local)
- `run_remote()` execution wrapper pattern in site-scout and /diagnose

**Addresses:** Local directory access mode (P1 table stakes), Docker container access mode (P2), Git repository analysis (P2)

**Avoids:** Docker container auto-selection pitfall (Pitfall 4 — present list, confirm with wp-config.php check), Bedrock non-standard structure detection gap (Pitfall 9 — probe parent directory and use WP-CLI path discovery), Git clone auth failure pitfall (Pitfall 5 — set GIT_TERMINAL_PROMPT=0, use SSH over HTTPS, run ssh-keyscan before clone)

**Research flag:** MEDIUM — Docker WP path detection inside containers varies by image. Official WordPress image uses `/var/www/html`; Lando uses `/app/public`; custom PHP-FPM images vary. Recommend prototyping a probe sequence against 2-3 real Docker setups before committing to the detection approach.

### Phase 2: Database Health + Security Audits

**Rationale:** DB analysis is the most-requested missing capability and is a prerequisite for three other features (performance analysis, architecture review, trend tracking). SSL and file permissions audits are also overdue table stakes but very low effort — bundle here since they share the same access infrastructure. This phase delivers the most user-visible value relative to implementation effort.

**Delivers:**
- `diagnostic-db-analysis` skill: autoload bloat, orphaned postmeta, orphaned transients, revision counts, table health, table prefix detection, MyISAM engine detection, tables without primary keys
- Autoload / wp_options analysis (subset of DB skill, same query execution)
- HTTPS/SSL configuration audit: siteurl/home URL scheme, FORCE_SSL_ADMIN constant, HTTP redirect check (reuses existing wp-config.php parsing + WP-CLI option reads)
- File permissions audit: world-writable files, wp-config.php permissions, PHP in uploads (reuses already-synced local files)
- `"Database Health"` finding category added to report-generator
- Content-based finding ID hashing established as the standard (prerequisite for Phase 5 trend tracking)

**Addresses:** Database health analysis (P1), Autoload bloat detection (P1), HTTPS/SSL audit (P1), File permissions audit (P1)

**Avoids:** Hardcoded table prefix pitfall (Pitfall 7 — table prefix detection is the mandatory first DB setup step), Credential exposure pitfall (Pitfall 2 — WP-CLI-only DB access pattern, never read DB_PASSWORD), wp-config.php parsing failure pitfall (Pitfall 1 — use `wp config get` not grep)

**Research flag:** LOW — All DB patterns use well-documented WP-CLI and INFORMATION_SCHEMA APIs verified against MySQL 5.7/8.x/MariaDB docs. Standard implementation work; no novel patterns.

### Phase 3: Performance Detection

**Rationale:** Depends on Phase 2 DB analysis being solid — autoload data feeds performance analysis and DB-side bottlenecks need accurate table data. Performance skill is HIGH complexity; N+1 false positive risk is a known trap that requires confidence-tier implementation (not retrofittable after release). Build after DB analysis validates the source-aware execution patterns.

**Delivers:**
- `diagnostic-performance` skill: N+1 pattern detection (confidence-tiered), expensive hooks, blocking HTTP calls without timeout, missing object cache patterns, cron accumulation analysis
- WP-CLI Profile package integration: hook/stage timing via `wp profile stage` and `wp profile hook` (optional install, graceful degradation if unavailable)
- `runcommand/query-debug` integration for per-page query counts (optional install, graceful degradation)
- `"Performance"` finding category added to report-generator
- `performance` mode in `/diagnose`

**Addresses:** Performance bottleneck analysis (P2)

**Avoids:** N+1 static analysis false positive pitfall (Pitfall 6 — implement confidence tiers: whitelist `get_option()` calls in loops as NOT N+1 since WordPress auto-caches options; flag `$wpdb->get_results()` inside `have_posts()` loops as high-confidence; all others as "potential — verify at runtime")

**Research flag:** MEDIUM — `wp package install` for profile-command and query-debug requires write access to the WP-CLI packages directory on the remote server. Shared hosting frequently blocks this. The skill must detect installation failure and report which checks were skipped without failing entirely.

### Phase 4: Architecture Review

**Rationale:** Depends on Phases 2 and 3 being complete — architectural findings require DB context for CPT misuse severity, and performance patterns inform architectural diagnosis. This is the strongest differentiator but has the most dependencies. Build last among diagnostic skills.

**Delivers:**
- `diagnostic-architecture` skill: CPT misuse with DB row-count gating, options table abuse detection, hook abuse patterns, caching anti-patterns, theme/plugin structural analysis (functions.php size, direct DB calls in templates)
- `"Architecture"` finding category added to report-generator
- `architecture` mode in `/diagnose`
- AI synthesis narrative across code + DB + performance findings

**Addresses:** Architecture review with AI reasoning (P2)

**Avoids:** CPT over-flagging pitfall (Pitfall 10 — gate CPT misuse severity on actual row counts from Phase 2 DB analysis; exclude WordPress core CPTs from analysis; always include data volume qualifier in findings; WooCommerce CPTs are NOT misuse)

**Research flag:** MEDIUM — The boundary between "legitimate CPT use" and "should be a custom table" is context-dependent. Recommend validating CPT thresholds against 2-3 real WooCommerce sites before writing the skill.

### Phase 5: Findings Trend Tracking + Integration

**Rationale:** Trend tracking requires historical case-log.json data from prior diagnostic runs. The content-based finding ID hashing (established in Phase 2) is a prerequisite for valid trend comparison. This phase is last among diagnostic skills even though the skill itself is relatively simple — it depends on the right ID scheme being in place and on multiple prior scans existing to compare.

**Delivers:**
- `trends-tracker` skill: trajectory computation (improving/stable/degrading), persistent/resolved/regression finding classification, grade history across scans
- `memory/{site}/trends.json` written automatically after each diagnostic run
- Conditional Trends section at top of report (only when 2+ scans exist — never fabricates trends from single scan)
- `/investigate` integration: scan-reviewer references trend data in confidence assessment
- `full` mode in `/diagnose` updated to include all new skills (db, performance, architecture, trends)
- Plugin.json manifest updated to list all new skills

**Addresses:** Findings trend tracking (P1), Cross-audit findings comparison (P2)

**Avoids:** Finding ID instability pitfall (Pitfall 8 — content-based ID hashing implemented in Phase 2 before any trend data is written; retroactive migration is not needed), trends running on single scan anti-pattern (Pitfall ARCH-3 — require 2+ case-log entries before emitting any trend data)

**Research flag:** LOW — Trend computation is pure jq on existing JSON files. Well-understood pattern. Include `schema_version` field in trends.json from day one (enables future schema migration detection).

### Phase Ordering Rationale

- **Phase 1 before everything:** `source_type` in the profile is a prerequisite for all source-aware skills. Changing the connection model after skills are written requires touching every skill simultaneously.
- **Phase 2 before Phase 3:** Performance analysis uses DB health data (autoload size feeds bottleneck analysis). Running performance analysis without accurate DB analysis produces incomplete findings.
- **Phase 2 before Phase 4:** Architecture review gates CPT misuse severity on actual row counts — this requires DB access patterns from Phase 2 to already work.
- **Phase 5 after Phase 2:** Trend data validity depends on content-based finding IDs, which must be standardized when the first DB skills write their findings. Building trends before this standard is set creates incompatible historical data.
- **SSL and file permissions in Phase 2:** These are low-effort table stakes that reuse Phase 2 infrastructure (wp-config.php access, local file access). Delivering them in Phase 2 closes four overdue table stakes items at once with minimal additional effort.

### Research Flags

Phases needing deeper research or careful prototyping during planning:

- **Phase 1 (Docker container path detection):** Container WP path varies significantly by image — official WordPress image: `/var/www/html`; Lando: `/app/public`; Docksal: varies; custom PHP-FPM: any path. Recommend prototyping a probe sequence against 2-3 real Docker setups (at minimum: official image, one docker-compose custom stack) before committing to the detection approach in the COMMAND.md.
- **Phase 3 (WP-CLI package installation on shared hosting):** `wp package install` often fails on shared hosting due to filesystem permissions on the WP-CLI packages directory. The graceful degradation path (which checks to skip, what to surface to the user) must be specified before Phase 3 implementation begins.

Phases with standard patterns (research-phase unnecessary):

- **Phase 2 (DB queries + SSL + file permissions):** INFORMATION_SCHEMA queries are stable, version-agnostic, and verified against MySQL 5.7/8.x/MariaDB docs. WP-CLI DB access patterns are official documentation. SSL checks reuse existing wp-config.php infrastructure. File permission checks use `find -perm` on already-synced files. All straightforward implementation work.
- **Phase 5 (trend tracking):** Pure jq computation on existing JSON structure. No novel patterns; jq 1.7+ handles all aggregation needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new capabilities use existing tools (WP-CLI, jq, docker CLI, git). No new runtime dependencies introduced. WP-CLI profile-command is an official WP-CLI package (developer.wordpress.org). query-debug is MEDIUM — community package by core contributor Daniel Bachhuber; active but install may fail on restricted hosts. |
| Features | MEDIUM-HIGH | Table stakes (DB health, SSL, file perms) are HIGH — documented standards across all WP diagnostic tools and WP-CLI official commands. New access modes: local and git are HIGH confidence; Docker varies by stack (MEDIUM for non-standard containers). Trends tracking is MEDIUM — no existing WP diagnostic tool does this at the diagnostic level; expected behavior derived from agency reporting patterns. |
| Architecture | HIGH | Based on direct codebase analysis of the existing plugin (not inference from generic patterns). Source abstraction pattern is well-understood and explicitly backward-compatible. Build order is dependency-traceable. All component changes documented as additive. |
| Pitfalls | HIGH | Credential exposure, table prefix, and ID instability pitfalls documented from real GitHub issues (docker-library/wordpress, wp-cli/wp-cli). Docker permission pitfalls confirmed from docker-library/wordpress issue tracker #436. Static analysis false positive risk confirmed from WordPress VIP performance documentation. |

**Overall confidence:** HIGH

### Gaps to Address

- **Docker WP path detection:** The probe sequence for finding WordPress inside non-standard containers (Lando, Docksal, custom PHP-FPM images) needs prototyping against real setups before Phase 1 implementation is written into COMMAND.md. The research identifies the problem and the general approach (probe `/var/www/html`, `/app/public`, fall back to asking the user) but the exact probe sequence needs empirical validation.

- **Local by Flywheel DB connection:** Flywheel uses socket files or non-standard MySQL ports (not localhost:3306). WP-CLI reads wp-config.php's `DB_HOST` value (which should include the port), so this is automatically handled if wp-config.php is correct. Needs verification during Phase 2 testing against an actual Flywheel site.

- **MAMP MySQL port:** MAMP defaults to port 8889. Direct MySQL connections using a default port assumption will fail. WP-CLI handles this automatically via wp-config.php. Only a risk if the git source fallback (direct MySQL connection) is used. Flag for validation during Phase 2.

- **Multisite DB scope:** All DB queries are scoped to the primary site tables. Multisite installs have per-blog tables (`wp_2_options`, `wp_3_posts`). Detect the `MULTISITE` constant and emit an Info finding explaining scope limitation. Full multisite analysis is out of scope for this milestone.

- **WP-CLI package install graceful degradation:** The exact user-facing behavior when `wp package install wp-cli/profile-command` fails needs to be specified before Phase 3 implementation. Should list which performance checks were skipped and explain why, not emit a generic error.

## Sources

### Primary (HIGH confidence)
- [WP-CLI db commands documentation](https://developer.wordpress.org/cli/commands/db/) — DB query patterns, wp db check, wp db size
- [WP-CLI profile-command GitHub](https://github.com/wp-cli/profile-command) — Stage and hook timing approach; official WP-CLI package
- [WP-CLI doctor-command GitHub](https://github.com/wp-cli/doctor-command) — autoload-options-size check, cron-count, cron-duplicates; official WP-CLI package
- [MySQL INFORMATION_SCHEMA documentation](https://dev.mysql.com/doc/refman/8.0/en/information-schema-statistics-table.html) — All INFORMATION_SCHEMA SQL queries used in DB analysis skill
- [MySQL INNODB_INDEXES Table](https://dev.mysql.com/doc/refman/8.4/en/information-schema-innodb-indexes-table.html) — Index health queries
- [docker container exec documentation](https://docs.docker.com/reference/cli/docker/container/exec/) — docker exec patterns, -u root flag
- [Docker WordPress image on Docker Hub](https://hub.docker.com/_/wordpress) — Container structure, WP-CLI inclusion since 2023, standard paths
- [docker-library/wordpress issue #436](https://github.com/docker-library/wordpress/issues/436) — wp-content owned by root (confirmed pitfall from issue tracker)
- [git-sparse-checkout documentation](https://git-scm.com/docs/git-sparse-checkout) — Shallow clone, sparse checkout cone mode (Git 2.27+)
- [wp-config.php Advanced Administration Handbook](https://developer.wordpress.org/advanced-administration/wordpress/wp-config/) — Credential handling, table prefix, define formats
- [WordPress Site Health ticket #61764](https://core.trac.wordpress.org/ticket/61764) — Autoload threshold: 900KB warning is official WP core threshold
- Direct codebase analysis of existing plugin (ARCHITECTURE.md source) — commands, skills, sites.json schema; all component change impact assessed against real files

### Secondary (MEDIUM confidence)
- [runcommand/query-debug WP-CLI package](https://guides.wp-bullet.com/find-slow-wordpress-or-woocommerce-database-queries-with-wp-cli/) — query-debug install and usage; community guide
- [Kinsta: wp_options autoload cleanup guide](https://kinsta.com/blog/wp-options-autoloaded-data/) — Autoload thresholds, top-offender identification; authoritative hosting provider
- [WordPress VIP: analyze requests and application code](https://docs.wpvip.com/performance/analyze-requests-and-application-code/) — N+1 false positive risk; authoritative WordPress hosting provider
- [WP Client Reports plugin](https://wordpress.org/plugins/wp-client-reports/) — Agency reporting format reference for trend tracking feature
- [Local by Flywheel community forum](https://community.localwp.com/t/local-site-folder-and-wp-config/6160) — Site structure path pattern; official community forum
- [SpinupWP WordPress Database Indexing](https://spinupwp.com/wordpress-database-optimization-indexing/) — Table overhead and index health patterns

### Tertiary (needs validation during implementation)
- Docker volume path resolution via `docker inspect` — path structure varies by compose configuration; test empirically before Phase 1 implementation
- Bedrock WP structure detection — derived from Roots.io documentation; validate against actual Bedrock 2025/2026 project structure before Phase 1 local connection is finalized

---
*Research completed: 2026-02-18*
*Supersedes SUMMARY.md dated 2026-02-16 (v1 baseline — preserved in git history)*
*Ready for roadmap: yes*
