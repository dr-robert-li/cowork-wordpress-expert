# Technology Stack

**Project:** Claude CoWork WordPress Diagnostics Plugin — Milestone 2 Additions
**Researched:** 2026-02-18
**Confidence:** HIGH

> This file covers ADDITIONS and CHANGES only. The established v1 stack (SSH, rsync, WP-CLI, jq, PHPStan, PHPCS, WPScan, JSON/Markdown storage) is unchanged and fully documented in the prior research cycle. Do not re-implement or re-research those foundations.

---

## New Capabilities: Stack Requirements

### 1. Database Health Analysis

**Recommended approach:** WP-CLI built-ins + raw SQL via `wp db query` + MySQL INFORMATION_SCHEMA queries. No new tools required — this is pure WP-CLI and SQL skill work.

| Tool/Command | Version | Purpose | Why |
|---|---|---|---|
| `wp db check` | WP-CLI 2.x | Table integrity check (wraps mysqlcheck --check) | Already available on remote server via WP-CLI; zero install cost |
| `wp db optimize` | WP-CLI 2.x | Table defragmentation and optimization | Native WP-CLI command, wraps mysqlcheck --optimize |
| `wp db size` | WP-CLI 2.x | Database and per-table size reporting | Quick size anomaly detection |
| `wp db tables` | WP-CLI 2.x | List all tables including non-WP plugin tables | Discovers rogue tables without credentials |
| `wp db query` (SQL) | WP-CLI 2.x | Execute diagnostic SQL against live database | Enables INFORMATION_SCHEMA queries, autoload analysis, orphan detection |
| `wp doctor check` | WP-CLI Doctor package | Structured health checks including autoload-options-size, cron-count, cron-duplicates | Pre-built checks with pass/warn/error output; install once per site |

**Key SQL queries for the db-health skill:**

```sql
-- Autoloaded options bloat (warn >900KB, error >2MB)
SELECT SUM(LENGTH(option_value)) as autoload_size
FROM wp_options WHERE autoload='yes';

-- Largest autoloaded options
SELECT option_name, LENGTH(option_value) as size
FROM wp_options WHERE autoload='yes'
ORDER BY size DESC LIMIT 20;

-- Orphaned post meta (parent post deleted, meta remains)
SELECT COUNT(*) FROM wp_postmeta pm
LEFT JOIN wp_posts p ON pm.post_id = p.ID
WHERE p.ID IS NULL;

-- Post revision count
SELECT COUNT(*) FROM wp_posts WHERE post_type='revision';

-- Orphaned transients
SELECT COUNT(*) FROM wp_options
WHERE option_name LIKE '_transient_%'
AND option_name NOT LIKE '_transient_timeout_%';

-- Custom tables missing from WP core (detect plugin table accumulation)
SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY DATA_LENGTH DESC;

-- Tables with no primary key (index health indicator)
SELECT t.TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES t
LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
  ON t.TABLE_NAME = tc.TABLE_NAME
  AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
  AND tc.TABLE_SCHEMA = DATABASE()
WHERE t.TABLE_SCHEMA = DATABASE()
AND tc.TABLE_NAME IS NULL;

-- MyISAM tables (should be InnoDB for WordPress)
SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'MyISAM';
```

**Confidence:** HIGH — All queries use standard MySQL/MariaDB INFORMATION_SCHEMA (stable API, version-agnostic), documented against MySQL 5.7/8.0/8.4 and MariaDB.

---

### 2. Performance Bottleneck Detection

**Recommended approach:** WP-CLI Profile package (hook/stage timing) + query-debug package (per-page query counts) + manual log analysis. Both are optional WP-CLI packages that install per-site.

| Tool/Command | Version | Purpose | Why |
|---|---|---|---|
| `wp profile stage` | wp-cli/profile-command (latest) | Times WordPress load stages: bootstrap, main_query, template | Identifies which stage is slow without installing a plugin |
| `wp profile hook` | wp-cli/profile-command (latest) | Times individual action/filter hooks within a stage | Pinpoints the specific hook causing slowness |
| `wp query-debug` | runcommand/query-debug (latest) | Reports query count and time per URL | Detects N+1 patterns — 100+ queries on a page load is the signal |
| `wp cron event list` | WP-CLI 2.x | Lists all scheduled cron events | Identifies cron accumulation (>50 events = performance risk) |
| `wp cron schedule list` | WP-CLI 2.x | Lists cron schedules | Detects duplicate/rogue cron registrations |

**Installation (per remote site, on-demand):**

```bash
# WP-CLI Profile — installs to WP-CLI packages directory on remote server
ssh {user}@{host} "{wp_cli_path} package install wp-cli/profile-command"

# Query Debug — installs to WP-CLI packages directory on remote server
ssh {user}@{host} "{wp_cli_path} package install runcommand/query-debug"
```

**Key invocations:**

```bash
# Profile all load stages (returns time, query count, cache ratio per stage)
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} profile stage --url={site_url} --format=table"

# Profile hooks within the slow stage (e.g., bootstrap)
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} profile hook init --url={site_url} --format=table"

# Query count per page (find pages with >50 queries as N+1 candidates)
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} query-debug --url={site_url} --format=table"
```

**Confidence:** HIGH — Both packages are official or well-maintained WP-CLI packages, documented at developer.wordpress.org. query-debug is community-maintained but widely cited.

**MEDIUM confidence caveat:** WP-CLI package installs require write access to the WP-CLI packages directory on the remote server. On shared hosting, this may fail. Skill must detect and report this failure gracefully.

---

### 3. Architecture Review

**No new tools required.** Architecture review is pure analytical skill work applied to locally synced files + database query results. The existing stack handles everything:

- Synced PHP files analyzed via grep/regex patterns (existing approach)
- Database structure inspected via INFORMATION_SCHEMA queries (new SQL patterns in skill)
- WP-CLI output parsed via jq (existing)

**What's new is the analytical patterns, not the tools:**

| Pattern | Detection Method | Tool |
|---|---|---|
| CPT misuse (storing relational data as posts) | Count post types, check postmeta row ratio | `wp db query` + SQL |
| Options table abuse (storing large objects) | Autoload size + largest entries query | `wp db query` + SQL |
| Hook abuse (filtering on every request) | `wp profile hook` output analysis | WP-CLI Profile |
| Missing custom table indexes | INFORMATION_SCHEMA.TABLE_CONSTRAINTS query | `wp db query` + SQL |
| Improper use of wp_options as key-value store | Large non-autoloaded options count | `wp db query` + SQL |
| N+1 query generation | wp query-debug per-page count | WP-CLI query-debug |

**Confidence:** HIGH — This is pattern knowledge applied to existing tool output, not new tooling.

---

### 4. Findings Trend Tracking

**Recommended approach:** Extend the existing `memory/{site}/case-log.json` schema with time-series data. No new storage mechanism needed. jq handles all JSON manipulation.

**Schema extension to `case-log.json`:**

```json
{
  "cases": [...],
  "trend_summary": {
    "last_updated": "2026-02-18T10:30:00Z",
    "scans_total": 5,
    "health_grades": ["C", "C", "B", "B", "A"],
    "finding_trend": {
      "critical": [3, 2, 1, 1, 0],
      "warning": [8, 6, 5, 4, 3],
      "info": [2, 2, 3, 2, 2]
    },
    "open_items_resolved": 7,
    "trajectory": "improving"
  }
}
```

**jq query to compute trend from case-log:**

```bash
# Extract health grade history
jq '[.cases[] | .health_grade]' memory/{site}/case-log.json

# Count finding deltas between last two scans
jq '
  .cases[-2:] |
  {
    prev: .[0].finding_counts,
    curr: .[1].finding_counts
  } |
  {
    critical_delta: (.curr.critical - .prev.critical),
    warning_delta: (.curr.warning - .prev.warning)
  }
' memory/{site}/case-log.json
```

**What is NOT needed:** A time-series database, external analytics, or a new file format. The case-log.json with trend_summary appended handles everything. The skill computes trajectory at report time using jq.

**Confidence:** HIGH — jq 1.7+ handles all JSON aggregation. The schema extension is backward-compatible (existing case entries are untouched).

---

### 5. Local WordPress Directory Access

**Recommended approach:** Filesystem probing via `find` with `wp-config.php` as the WordPress installation marker. No new tools needed.

**Detection strategy:**

```bash
# Find all WordPress installations under a base path
find /path/to/search -maxdepth 5 -name "wp-config.php" -not -path "*/node_modules/*" 2>/dev/null

# Validate it's a real WP install (not just a wp-config.php copy)
test -f /path/wp-config.php && \
test -d /path/wp-content && \
test -d /path/wp-includes && \
test -f /path/wp-load.php

# Extract DB credentials from wp-config.php for local analysis
grep -E "define\(\s*'DB_(NAME|USER|HOST)'" /path/wp-config.php

# Run WP-CLI locally against the detected install
wp --path=/path/to/wordpress core version
wp --path=/path/to/wordpress option get siteurl
```

**Common local WordPress locations to probe (macOS/Linux):**

```bash
PROBE_PATHS=(
  "$HOME/Sites"               # macOS default local dev
  "$HOME/Local Sites"         # Local by Flywheel
  "$HOME/public_html"
  "/var/www/html"
  "/var/www"
  "/srv/www"
  "/opt/bitnami/apps/wordpress/htdocs"  # Bitnami
)
```

**Local by Flywheel note:** Sites stored at `~/Local Sites/{site-name}/app/public/`. wp-config.php is at that public/ root. WP-CLI works against these installations identically to remote sites — just run locally.

**What's new in the `/connect` command:** A `--local` or `type: local` mode that accepts a filesystem path instead of SSH credentials, skipping all SSH/rsync steps and pointing WP-CLI at the local path directly.

**Confidence:** HIGH — Standard filesystem detection, WP-CLI supports `--path` flag for local installs (documented).

---

### 6. Docker Container Access

**Recommended approach:** `docker exec` to run commands inside the container. If WP-CLI is not in the container, use volume-mounted files + local WP-CLI pointed at the mounted path.

| Command | Purpose | Notes |
|---|---|---|
| `docker ps` | List running containers, find WordPress container | Filter by image name or port |
| `docker exec -it {container} bash` | Get shell inside container | Use `sh` if bash not available (Alpine images) |
| `docker exec {container} wp {args}` | Run WP-CLI inside container | WordPress official Docker image includes WP-CLI since 2023 |
| `docker inspect {container}` | Get volume mounts and filesystem paths | Reveals where wp-content is bind-mounted to host |
| `docker volume inspect {volume}` | Get host path for named volume | Needed when files are in named volumes, not bind mounts |

**Two access patterns — choose based on container setup:**

**Pattern A: WP-CLI inside container (preferred)**
```bash
# Find the WordPress container
CONTAINER=$(docker ps --filter "ancestor=wordpress" --format "{{.Names}}" | head -1)

# Run WP-CLI diagnostics inside container
docker exec $CONTAINER wp --allow-root core version
docker exec $CONTAINER wp --allow-root db check
docker exec $CONTAINER wp --allow-root option get siteurl
```

**Pattern B: Volume-mounted files + local WP-CLI**
```bash
# Inspect to find bind-mount path on host
docker inspect {container} --format '{{json .Mounts}}' | jq '.[] | select(.Destination == "/var/www/html") | .Source'

# Once host path is known, use local WP-CLI against it
wp --path={host_path} --allow-root core version
```

**`--allow-root` requirement:** Docker containers typically run processes as root. WP-CLI refuses to run as root without `--allow-root`. This flag is REQUIRED for all WP-CLI commands inside Docker containers. Include it in every docker exec WP-CLI invocation.

**What's new in the `/connect` command:** A `type: docker` connection mode that prompts for container name/ID instead of SSH host. Connection flow replaces SSH steps with `docker exec` equivalents.

**Confidence:** MEDIUM-HIGH — Core docker exec patterns are HIGH confidence (official Docker docs). WP-CLI inside official WordPress containers is HIGH confidence (Docker Hub documentation). Named volume path resolution via docker inspect is MEDIUM confidence — tested in common scenarios but path structure varies by compose setup.

---

### 7. Git Repository Cloning and Analysis

**Recommended approach:** `git clone` (or `git clone --depth=1` for speed) into a local temp directory, then analyze synced files identically to an rsync'd site. No new analysis tools needed.

| Command | Purpose | Notes |
|---|---|---|
| `git clone --depth=1 {url} {local_path}` | Shallow clone (no history) for analysis | 80%+ faster than full clone for large repos; adequate for code analysis |
| `git clone --filter=blob:none --sparse {url} {local_path}` | Partial clone (no file content until needed) | For repos > 1GB where only some files are needed |
| `git sparse-checkout set wp-content/themes wp-content/plugins` | After sparse init, fetch only specific directories | Useful for repos containing full WP install |
| `git log --oneline -20` | Recent commit history | For architecture review context |
| `git diff HEAD~10..HEAD --stat` | Recent change scope | Identifies areas of active development |

**Cloning strategies by repo type:**

```bash
# Standard: theme or plugin repo (not full WP site)
git clone --depth=1 https://github.com/user/wp-theme.git .sites/{site-name}/

# Large full-site repo: sparse checkout of just wp-content
git clone --filter=blob:none --no-checkout https://github.com/user/site.git .sites/{site-name}/
cd .sites/{site-name}/
git sparse-checkout init --cone
git sparse-checkout set wp-content/themes/mytheme wp-content/plugins/myplugin
git checkout

# Private repo via SSH
git clone --depth=1 git@github.com:org/private-wp-site.git .sites/{site-name}/
```

**What's new in the `/connect` command:** A `type: git` mode that accepts a repository URL and optional sparse path. The connect flow runs `git clone` instead of rsync, then proceeds identically to file analysis (WP-CLI is not available for git-sourced repos without a database — skip db-health and performance skills, run code-quality and security-analysis only).

**Limitation — NO DATABASE ACCESS:** Git repos contain code only, not a running WordPress database. The db-health and performance skills (which rely on `wp db query`) cannot run against git-sourced sites. The /connect command must detect this and restrict available skills accordingly.

**Confidence:** HIGH — git sparse-checkout cone mode is available since Git 2.27.0 (2020). Shallow clone is universally available. All patterns are official git documentation.

---

## Unchanged Stack (Do Not Re-Research)

| Component | Status | Notes |
|---|---|---|
| SSH + rsync | Unchanged | Remote site file sync remains the primary access pattern |
| WP-CLI 2.x | Unchanged | Still required on remote; now also used locally for local/docker modes |
| jq 1.7.1+ | Unchanged | Extended for trend computation but no version change needed |
| PHPStan 2.x + WPStan | Unchanged | Code analysis for synced files |
| PHPCS + WPCS 3.0 | Unchanged | Coding standards for synced files |
| WPScan | Unchanged | Security vulnerability scanning |
| JSON + Markdown storage | Unchanged | case-log.json extended with trend_summary field |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|---|---|---|
| MySQL client (local) | Overkill — all DB analysis runs via WP-CLI which manages credentials | `wp db query` on remote/container, INFORMATION_SCHEMA SQL queries |
| Redis/time-series database for trends | Massive overengineering for diagnostic data | Extend case-log.json with trend_summary, compute with jq |
| Docker SDK/Python client | Unnecessary — docker CLI is always available where Docker is installed | `docker exec`, `docker inspect` via Bash tool |
| GitHub API integration | Not needed for code analysis | `git clone` + local file analysis |
| Kubernetes/docker-compose awareness | Scope creep — address single containers | Document docker-compose exec as alternative to docker exec when compose is in use |
| Local by Flywheel API | No public API; unnecessary | Filesystem detection of `~/Local Sites/{name}/app/public/` path pattern |
| phpMyAdmin / Adminer | Server-side UI tools | Direct SQL via `wp db query` |
| wp db import/export | Risk surface for data modification | Read-only analysis commands only |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|---|---|---|---|
| DB health | WP-CLI Doctor + raw SQL | External MySQL monitoring tools (Percona, PMM) | WP-CLI Doctor is zero-install on sites that already have WP-CLI; Percona tools require server-side installation and are overkill for diagnostic use |
| Performance profiling | WP-CLI Profile package | Query Monitor plugin | Query Monitor requires plugin installation on target site (invasive); wp profile runs from CLI without touching the site's plugin list |
| Trend storage | Extended case-log.json | SQLite, separate JSON file | case-log.json already exists; extending it maintains single source of truth; SQLite adds tooling dependency |
| Docker WP-CLI | docker exec with --allow-root | Custom WP-CLI Docker image | Official wordpress Docker image includes WP-CLI since 2023; custom images add complexity |
| Git analysis | git clone --depth=1 | GitHub API, GitLab API | API-based cloning requires auth tokens and rate limit management; git clone works for any git host |

---

## Stack Patterns by Source Type

**If source is SSH remote site:**
- Use established SSH + rsync + WP-CLI pattern (unchanged)
- All skills available: db-health, performance, code-quality, security-analysis, architecture-review

**If source is local directory:**
- Skip SSH and rsync steps entirely
- WP-CLI runs locally: `wp --path=/local/path {command}`
- All skills available (database is local, accessible to local WP-CLI)

**If source is Docker container:**
- Replace SSH steps with `docker exec {container} {command}`
- WP-CLI commands: `docker exec {container} wp --allow-root {command}`
- All skills available if container is running; volume-mount path needed for file analysis
- Append `--allow-root` to every WP-CLI command

**If source is Git repository:**
- Run `git clone --depth=1` to `.sites/{site-name}/`
- No database access — skip db-health and performance skills
- Available skills: code-quality, security-analysis (file-based), architecture-review (code patterns only)
- Update sites.json with `"type": "git"` and `"repo_url"` field

---

## sites.json Schema Additions

The existing `sites.json` schema needs two new fields to support multi-source access:

```json
{
  "sites": {
    "my-local-site": {
      "type": "local",
      "local_path": "/Users/dev/Local Sites/my-local-site/app/public",
      "wp_version": "6.7.1",
      "site_url": "http://my-local-site.local"
    },
    "my-docker-site": {
      "type": "docker",
      "container": "my_project_wordpress_1",
      "local_path": ".sites/my-docker-site",
      "wp_version": "6.7.1",
      "site_url": "http://localhost:8080"
    },
    "my-git-theme": {
      "type": "git",
      "repo_url": "https://github.com/org/wp-theme.git",
      "local_path": ".sites/my-git-theme",
      "skills_available": ["code-quality", "security-analysis", "architecture-review"]
    },
    "production-site": {
      "type": "ssh",
      "host": "example.com",
      "user": "deploy"
    }
  }
}
```

**New required field:** `type` — one of `ssh` (default, existing behavior), `local`, `docker`, or `git`. Existing sites without this field are treated as `ssh` for backward compatibility.

---

## Version Compatibility

| Component | Compatible With | Notes |
|---|---|---|
| WP-CLI profile-command | WP-CLI 2.0+ | Install: `wp package install wp-cli/profile-command` |
| runcommand/query-debug | WP-CLI 2.0+ | Install: `wp package install runcommand/query-debug` |
| WP-CLI Doctor | WP-CLI 2.0+ | Install: `wp package install wp-cli/doctor-command` |
| INFORMATION_SCHEMA queries | MySQL 5.7+, MariaDB 10.3+ | All standard queries used; TABLE_CONSTRAINTS, TABLES, INNODB_INDEXES supported across versions |
| git sparse-checkout cone mode | Git 2.27.0+ (2020) | macOS ships Git 2.39+ in Xcode CLT; Linux varies — detect with `git --version` |
| docker exec | Docker Engine 18.09+ | All modern Docker versions; docker-compose exec is equivalent for compose setups |
| wp --allow-root | WP-CLI 0.23+ | Required for Docker; never use on non-root SSH connections |

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| DB health (SQL queries) | HIGH | INFORMATION_SCHEMA is stable MySQL/MariaDB API; queries verified against MySQL 5.7/8.x/MariaDB docs |
| WP-CLI Profile package | HIGH | Official WP-CLI package, documented at developer.wordpress.org |
| WP-CLI query-debug | MEDIUM | Community package by wp-cli core contributor (Daniel Bachhuber); active but not official |
| Trend tracking (jq) | HIGH | jq 1.7+ JSON aggregation is standard; schema extension is backward-compatible |
| Local directory detection | HIGH | Standard find + WP-CLI --path; documented in WP-CLI handbook |
| Docker access patterns | MEDIUM-HIGH | docker exec is HIGH confidence; volume path resolution is MEDIUM (varies by compose config) |
| Git clone strategies | HIGH | Official git documentation; sparse-checkout cone mode stable since Git 2.27 |
| sites.json schema additions | HIGH | Backward-compatible extension; existing SSH entries unaffected |

---

## Sources

- [WP-CLI db commands documentation](https://developer.wordpress.org/cli/commands/db/) — HIGH confidence (official WordPress docs)
- [WP-CLI profile-command GitHub](https://github.com/wp-cli/profile-command) — HIGH confidence (official WP-CLI package)
- [WP-CLI doctor-command GitHub](https://github.com/wp-cli/doctor-command) — HIGH confidence (official WP-CLI package)
- [WP-CLI profile commands documentation](https://developer.wordpress.org/cli/commands/profile/) — HIGH confidence (official WordPress docs)
- [runcommand/query-debug WP-CLI package](https://guides.wp-bullet.com/find-slow-wordpress-or-woocommerce-database-queries-with-wp-cli/) — MEDIUM confidence (community guide, verified package exists)
- [MySQL INFORMATION_SCHEMA STATISTICS](https://dev.mysql.com/doc/refman/8.0/en/information-schema-statistics-table.html) — HIGH confidence (official MySQL docs)
- [MySQL INNODB_INDEXES Table](https://dev.mysql.com/doc/refman/8.4/en/information-schema-innodb-indexes-table.html) — HIGH confidence (official MySQL docs)
- [SpinupWP WordPress Database Indexing](https://spinupwp.com/wordpress-database-optimization-indexing/) — MEDIUM confidence (authoritative hosting provider)
- [docker container exec documentation](https://docs.docker.com/reference/cli/docker/container/exec/) — HIGH confidence (official Docker docs)
- [Docker WordPress image on Docker Hub](https://hub.docker.com/_/wordpress) — HIGH confidence (official Docker image)
- [git-sparse-checkout documentation](https://git-scm.com/docs/git-sparse-checkout) — HIGH confidence (official git documentation)
- [WordPress autoload and options optimization](https://www.dchost.com/blog/en/wordpress-database-optimization-guide-wp_options-autoload-and-table-bloat/) — MEDIUM confidence (hosting provider guide)
- [Local by Flywheel site structure](https://community.localwp.com/t/local-site-folder-and-wp-config/6160) — MEDIUM confidence (official community forum)

---
*Stack research for: WP Diagnostics Expert Plugin — Milestone 2 (DB health, performance, architecture review, trend tracking, multi-source access)*
*Researched: 2026-02-18*
