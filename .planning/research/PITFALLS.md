# Pitfalls Research

**Domain:** WordPress Diagnostic Tool — v2.0 Feature Additions (DB Analysis, Performance Detection, Architecture Review, Findings Trends, Multi-Source Access)
**Researched:** 2026-02-18
**Confidence:** HIGH for DB/Docker/multi-source pitfalls (evidence from community issues and official docs); MEDIUM for static analysis and trends pitfalls (inferred from adjacent domain patterns and existing skill design)

---

## Critical Pitfalls

### Pitfall 1: wp-config.php Credential Parsing Fails on Non-Standard Formats

**What goes wrong:**
Regex or grep-based parsing of `DB_PASSWORD`, `DB_HOST`, `DB_NAME` from `wp-config.php` breaks on sites that use environment variables (`getenv('DB_PASSWORD')`), multi-line define statements, single-quoted vs double-quoted values, or constants defined via custom config includes. The parse succeeds visually but silently returns an empty or wrong value, causing a DB connection error that looks like a credentials problem.

**Why it happens:**
Developers assume all WordPress installs follow the canonical `define('DB_PASSWORD', 'somepassword');` format. In practice, managed hosts (Kinsta, WP Engine), Local by Flywheel, and Docker-based installs substitute environment variables: `define('DB_PASSWORD', getenv_docker('WORDPRESS_DB_PASSWORD', ''))`. A naive grep for the string literal returns nothing.

**How to avoid:**
1. Never use regex to parse wp-config.php. Parse it through PHP itself:
   ```bash
   php -r "define('ABSPATH', '.'); include 'wp-config.php'; echo DB_HOST . ':' . DB_NAME . ':' . DB_USER;"
   ```
2. Or use WP-CLI which reads wp-config.php correctly in all formats:
   ```bash
   wp config get DB_HOST
   wp config get DB_NAME
   wp config get DB_USER
   # DB_PASSWORD: do NOT extract — use WP-CLI's built-in DB connection instead
   ```
3. Handle `getenv()` / `getenv_docker()` patterns — these are environment-injected values. If DB credentials come from the environment, they are not readable from the file; use WP-CLI's DB access instead.
4. Detect non-standard formats and bail gracefully with "DB credentials are environment-injected; using WP-CLI for DB access."

**Warning signs:**
- Grep for `DB_PASSWORD` returns empty on a Docker-based site
- `php -r "include 'wp-config.php';"` throws errors about undefined constants
- DB connection fails despite apparent credential extraction
- `wp-config.php` contains `getenv_docker` or `$_SERVER['DB_']` patterns

**Phase to address:**
Phase: DB Analysis — Implement before any direct DB connection attempt

---

### Pitfall 2: DB Credential Exposure in Claude Context Window

**What goes wrong:**
When reading `wp-config.php` to extract DB credentials for local connection, the full file content (including DB_PASSWORD) appears in Claude's context window and potentially in conversation output, debug logs, or tool call traces. This defeats the entire security model of the plugin.

**Why it happens:**
The natural implementation is `cat wp-config.php` or `Read file: wp-config.php` to find the DB credentials. But this surfaces the password in AI context and potentially in the visible conversation. On local sites where wp-config.php sits in the synced `.sites/` directory, it is trivially readable.

**How to avoid:**
1. **Never read wp-config.php directly** to show credentials. Only read it through WP-CLI config commands that return individual values.
2. **Never display DB_PASSWORD in output.** Extract only what is needed (host, name, user) for diagnostic output. The password is never shown.
3. **Use WP-CLI for all DB operations** (local sites via `--path=`, remote sites via SSH). WP-CLI handles authentication internally without exposing the password.
4. **For direct MySQL connection** (needed when WP-CLI is unavailable): pass credentials via environment variable or MySQL option file, never via command-line argument where they appear in process lists:
   ```bash
   # BAD: password visible in process list
   mysql -u root -pmypassword dbname

   # GOOD: password via env var
   MYSQL_PWD="$(wp config get DB_PASSWORD --path=...)" mysql -u "$user" "$dbname" -e "SELECT ..."
   ```
5. Add `wp-config.php` to the `.sites/` sync exclusions so it is never copied locally. Access via WP-CLI remote over SSH instead.

**Warning signs:**
- Claude responses contain database password strings
- `wp-config.php` present in `.sites/{site}/` local directory
- `cat` or direct file reads used to retrieve DB config
- MySQL commands with `-p` password argument in bash history

**Phase to address:**
Phase: DB Analysis — Security constraint must be established before any credential handling

---

### Pitfall 3: Docker Container Discovery is Unreliable Without a Convention

**What goes wrong:**
When adding Docker container support, the tool attempts to discover WordPress containers by listing running containers and guessing which one is WordPress. This fails when: multiple WordPress containers are running (multi-site development), containers are named non-obviously (e.g., `app_1`), the WordPress container is stopped, or docker-compose project naming varies. The result is that the tool either picks the wrong container or fails entirely.

**Why it happens:**
There is no standard naming convention for WordPress Docker containers. Common setups range from `wordpress` (Docker Hub default image name) to `app`, `web`, `php`, or arbitrary names in docker-compose. Detection by image name (`wordpress`) only works for the official image — custom PHP images used with WordPress (a very common pattern) won't match.

**How to avoid:**
1. **Ask, don't guess.** When connecting to a Docker-based site, ask the user: "What is your container name or ID? (run `docker ps` to see running containers)"
2. **Provide a discovery helper** but make the output a selection list, not an auto-pick:
   ```bash
   docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}" | grep -v "mysql\|redis\|memcache"
   ```
3. **Detect wp-config.php to confirm** before accepting a container:
   ```bash
   docker exec {container} test -f /var/www/html/wp-config.php && echo "WordPress found"
   ```
4. **Store the confirmed container name in the site profile** (`connection_type: docker, container: my_wp_container`). Don't re-discover on every run.

**Warning signs:**
- Tool auto-selects container named `wordpress` but actual site is in `app`
- No wp-config.php found in auto-discovered container path
- Multiple containers match Docker Hub `wordpress` image
- User gets "wrong site" results on Docker multi-site setups

**Phase to address:**
Phase: Multi-Source Access — Discovery strategy must be defined before implementation

---

### Pitfall 4: Docker File Permissions Block Read Access to wp-config.php

**What goes wrong:**
`docker exec {container} cat /var/www/html/wp-config.php` returns "Permission denied" because the file is owned by `www-data` (UID 33 in the container) and the host user running the Docker exec command has a different UID. This is a known Docker+WordPress issue — wp-content is often owned by root on initial creation, and wp-config.php is typically 640 or 600.

**Why it happens:**
Docker containers run processes as internal users (www-data, apache) that don't map to the host user's UID. When reading files via `docker exec`, the exec process runs as the invoking user (host UID) by default on some systems, causing permission mismatches. The Official WordPress Docker image uses UID 33 (www-data) for file ownership.

**How to avoid:**
1. **Use `docker exec -u root`** for diagnostic file reads (read-only access to wp-config.php is safe as root within a diagnostic context):
   ```bash
   docker exec -u root {container} cat /var/www/html/wp-config.php
   ```
2. **Or use WP-CLI inside the container** if wp-cli is installed:
   ```bash
   docker exec {container} wp config get DB_HOST --path=/var/www/html
   ```
3. **Or use docker cp** to extract the file to a temp location for reading:
   ```bash
   docker cp {container}:/var/www/html/wp-config.php /tmp/wp-config-{site}.php
   # read, then immediately delete
   ```
4. **Never set wp-config.php to 777** as a workaround — this is a real security risk documented in Docker WordPress community issues.
5. **Document the UID mismatch pattern** in the connection skill: if permission denied, try `-u root` before failing.

**Warning signs:**
- "Permission denied" when using `docker exec` to read wp-config.php
- `docker exec` works for some files but not others
- wp-content directory owned by root after container recreation
- User reports "it works if I run it with sudo"

**Phase to address:**
Phase: Multi-Source Access — Must be handled in Docker connection implementation

---

### Pitfall 5: Git Repository Clone Authentication Fails Silently in Non-Interactive Shell

**What goes wrong:**
When cloning a private git repository to analyze WordPress code, `git clone` hangs indefinitely waiting for a username/password prompt that never comes (because the shell is non-interactive), or fails with "Authentication failed" without actionable guidance. For SSH-based git remotes, the SSH key used for git must be a different key than the SSH key used for the WordPress host — and the git remote host (github.com, gitlab.com) may not be in `known_hosts`, causing a host key verification prompt that also blocks silently.

**Why it happens:**
- HTTPS git clone falls back to interactive auth when no credentials are cached — in non-interactive Bash execution this blocks forever
- SSH git clone requires the git host key to be in `~/.ssh/known_hosts` — if it isn't, SSH prompts interactively which blocks the tool
- Personal Access Tokens (PATs) embedded in HTTPS clone URLs (`https://token@github.com/...`) appear in `git log --all`, Claude context, and process lists
- Many organizations disable PAT-based HTTPS auth in 2025-2026, requiring SSH

**How to avoid:**
1. **Prefer SSH for git remote access.** Confirm with user: "Is your repo SSH or HTTPS?" and guide accordingly.
2. **Pre-check known_hosts** before cloning:
   ```bash
   ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
   # or for GitLab:
   ssh-keyscan gitlab.com >> ~/.ssh/known_hosts 2>/dev/null
   ```
3. **For HTTPS with token**: use git credential store, not URL-embedded tokens:
   ```bash
   # BAD: token in URL (appears in logs, ps output)
   git clone https://mytoken@github.com/org/repo.git

   # GOOD: use credential helper
   git -c credential.helper='store' clone https://github.com/org/repo.git
   # or: GIT_ASKPASS=/path/to/script git clone ...
   ```
4. **Set GIT_TERMINAL_PROMPT=0** to fail fast instead of hang:
   ```bash
   GIT_TERMINAL_PROMPT=0 git clone {repo_url} 2>&1
   ```
5. **For shallow diagnostic clone** (code analysis only, not history), use `--depth=1` to minimize data transfer:
   ```bash
   git clone --depth=1 {repo_url} /tmp/wp-repo-{site}/
   ```

**Warning signs:**
- `git clone` command never returns (hanging on auth prompt)
- Git token appears in command output or process list (`ps aux | grep git`)
- "Host key verification failed" for github.com/gitlab.com
- Clone succeeds but tool has the wrong branch (not `main`/`master` but a feature branch)

**Phase to address:**
Phase: Multi-Source Access — Git clone flow must handle auth upfront

---

### Pitfall 6: Static Code Analysis Reports N+1 Query False Positives Everywhere

**What goes wrong:**
Grep-based N+1 query detection flags every `get_post_meta()` call inside any loop as an N+1 pattern, including cases where the loop is over a small, bounded set (e.g., iterating 3 sidebar widgets) or where the result is already cached by WordPress's object cache. This creates noise that undermines the diagnostic's credibility — users start ignoring all findings because there are too many false positives.

**Why it happens:**
Static analysis cannot determine loop cardinality or cache state. A grep for "function call inside foreach loop" will match `foreach ($widget_areas as $area) { get_option($area) }` (cached, harmless) and `foreach ($product_ids as $id) { get_post_meta($id, 'price', true) }` (real N+1 problem) identically. The existing `performance/SKILL.md` already identifies this analysis domain but the implementation risk is in naive detection.

**How to avoid:**
1. **Flag as "potential" not "confirmed."** Never say "this IS an N+1 query" from static analysis alone. Always qualify: "potential N+1 pattern — verify with Query Monitor at runtime."
2. **Prioritize by context:** Flag query calls inside `WP_Query` post loops (high cardinality, real risk) differently from loops over static configuration arrays (low risk).
3. **Check for existing cache patterns:** If `wp_cache_get` / `get_transient` appears in the same function, note that the developer is aware of caching — severity drops.
4. **Whitelist known-safe patterns:**
   - `get_option()` calls in loops: WordPress auto-caches options in memory, so this is NOT an N+1 issue
   - `wp_get_attachment_image()` in loops: internally batches in recent WP versions
5. **Use a two-tier output:** List high-confidence N+1 patterns (DB queries inside `have_posts()` loops without caching) separately from low-confidence patterns (any loop with any function call).
6. **Point to Query Monitor** as the verification step — static analysis identifies candidates, runtime profiling confirms.

**Warning signs:**
- N+1 detection flags > 20 instances in a codebase — almost certainly over-reporting
- Same pattern flagged as N+1 and as "uses caching correctly" in the same file
- User feedback: "these results are useless, every line is flagged"
- `get_option()` calls flagged as N+1 (a known WordPress caching false positive)

**Phase to address:**
Phase: Performance Detection skill — Define confidence tiers and whitelist patterns before implementation

---

### Pitfall 7: DB Query Analysis Mistakes the Table Prefix

**What goes wrong:**
SQL queries hardcoded with `wp_options`, `wp_posts`, `wp_postmeta` fail silently or return zero results on sites with a non-standard table prefix (e.g., `mysite_options`). This is particularly common on shared hosting where users changed the prefix for security, and on multisite installs where blog-specific tables use `wp_2_options`, `wp_2_posts`, etc.

**Why it happens:**
The WordPress default prefix is `wp_` but the installer asks users to change it. Many security guides recommend a non-standard prefix. The `performance/SKILL.md` already shows hardcoded `wp_options` in example queries — this pattern will break on non-default prefixes. The autoload analysis query `SELECT option_name, LENGTH(option_value) FROM wp_options WHERE autoload='yes'` returns nothing on a `mysite_` prefix site.

**How to avoid:**
1. **Always read the prefix from wp-config.php before running any DB query:**
   ```bash
   # Via WP-CLI (preferred):
   TABLE_PREFIX=$(wp config get table_prefix --path={wp_path})

   # Then use in queries:
   wp db query "SELECT option_name, LENGTH(option_value) as size FROM ${TABLE_PREFIX}options WHERE autoload='yes' ORDER BY size DESC LIMIT 20;"
   ```
2. **Or use WP-CLI's built-in commands** which automatically use the correct prefix:
   ```bash
   wp db query "$(wp eval 'global $wpdb; echo "SELECT * FROM {$wpdb->options} WHERE autoload='\''yes'\'' LIMIT 20;";')"
   ```
3. **For multisite:** each blog has its own prefixed tables. Detect multisite from `MULTISITE` constant and handle accordingly.
4. **Store detected table prefix in site profile** so it doesn't need to be re-read on every diagnostic run.

**Warning signs:**
- DB queries return 0 rows on a site where the DB clearly has data
- `wp config get table_prefix` returns something other than `wp_`
- Autoload analysis shows 0KB when site health check shows 5MB+
- Queries work on one site but not another (prefix varies)

**Phase to address:**
Phase: DB Analysis — Table prefix detection must be the first DB setup step

---

### Pitfall 8: Findings Trends Break When Finding IDs Change Between Runs

**What goes wrong:**
The findings trend system compares findings across diagnostic runs to show "improving" or "degrading" posture. But finding IDs are generated from file paths and line numbers (e.g., `CODE-SQLI-a3f` based on `functions.php:142`). When the codebase changes between runs (developer refactors, plugin updates, line numbers shift), every finding gets a new ID. The trend system reports "10 new critical findings" when in reality the same underlying issues moved 5 lines down in the file.

**Why it happens:**
The existing `diagnostic-code-quality/SKILL.md` uses `{file-path}:{line-number}` as the hash input for finding IDs. Line numbers are unstable across code changes. A refactor that adds a blank line at the top of functions.php would invalidate every single finding ID in that file.

**How to avoid:**
1. **Hash on content, not line number.** Generate finding IDs from the finding type + the actual code snippet (first 80 chars), not the line number:
   ```
   ID = MD5(finding_type + file_path + code_snippet_trimmed)[0:6]
   ```
   This makes IDs stable across line number changes but breaks when code actually changes — which is the correct behavior.
2. **Store findings with both stable (content-based) and positional (line-based) IDs.** Use stable ID for trend comparison; include line number for navigation only.
3. **Trend comparison strategy:** Do NOT require exact ID match for trend tracking. Use fuzzy matching:
   - Same file + same finding type + same code snippet → same issue (trend continues)
   - Same file + same finding type + different code → possible fix (mark as "resolved candidate")
   - Net new file+type combination → new finding
4. **Track "resolved" separately from "not found."** A finding disappearing from results could mean it was fixed OR that the scan didn't run that file. Only mark as resolved if the same file was scanned in both runs.
5. **Version the findings JSON schema** from day one. Include a `schema_version` field in every findings file so future schema changes can be detected and migration handled.

**Warning signs:**
- Trend report shows "all findings new" every run despite no code changes
- "Resolved" count spikes after developer runs code formatter (line numbers shift)
- Trend comparison breaks after WordPress core update (plugin files move)
- Findings JSON from run N cannot be parsed by trend code written for run N+1

**Phase to address:**
Phase: Findings Trends — ID stability strategy must be decided before any trend data is written

---

### Pitfall 9: Local Directory Detection Fails for Non-Standard WP Installs (Bedrock, Roots)

**What goes wrong:**
When connecting to a local WordPress directory, the tool looks for `wp-config.php` at the directory root to confirm it's a WordPress install. Bedrock (Roots.io) installs place `wp-config.php` one level up from the webroot, WordPress itself in `web/wp/`, and `wp-content` at `web/app/`. The detection heuristic finds nothing and reports "not a WordPress install."

**Why it happens:**
Bedrock is the most common alternative WordPress project structure in 2025-2026, used heavily by agencies. Standard WordPress detection checks for `wp-config.php` + `wp-content/` + `wp-includes/` at the same level. Bedrock separates these deliberately. Many Local by Flywheel sites also use Bedrock as the underlying structure.

**How to avoid:**
1. **Multi-level wp-config.php search:** Check the given path AND one level up:
   ```bash
   # Standard: {path}/wp-config.php
   # Bedrock: {path}/../wp-config.php (or {path}/wp-config.php exists but WP is at {path}/web/wp/)
   ```
2. **Detect Bedrock explicitly:** Check for `composer.json` with `roots/wordpress` in the given directory:
   ```bash
   grep -q "roots/wordpress" composer.json && echo "Bedrock install detected"
   ```
3. **Fall back to WP-CLI path discovery:** Let WP-CLI search for the WordPress install rather than relying on file structure detection:
   ```bash
   wp --path={given_path} core version 2>/dev/null || wp --path={given_path}/web/wp core version 2>/dev/null
   ```
4. **Ask the user if detection fails:** "Could not find WordPress in {path}. Is this a Bedrock/custom structure? Please provide the path to wp-config.php."

**Warning signs:**
- Local connection fails with "not a WordPress install" on Bedrock/Roots projects
- `wp-config.php` exists but `wp-includes/` is not at the same level
- `composer.json` present with WordPress-related packages
- The given path contains `web/` or `public/` subdirectory structure

**Phase to address:**
Phase: Multi-Source Access — Local directory connection must handle Bedrock before release

---

### Pitfall 10: Architecture Review Over-Flags CPT Misuse Without Understanding Intent

**What goes wrong:**
The architecture review skill flags "Custom Post Type misuse: storing structured data as CPTs" whenever it detects a CPT with many custom fields, treating it as anti-pattern. But the line between legitimate CPT use and "should be a custom table" is context-dependent — a CPT with 10 custom fields for a portfolio is reasonable; the same structure for 100,000 transaction records is not. Without scale context, the tool creates false alarms for well-architected small sites.

**Why it happens:**
Architecture review via static analysis cannot know row counts, expected data volume, or access patterns. The skill reads code structure but cannot run `SHOW TABLE STATUS` or count post_meta rows. Treating CPT + many custom fields as universally "wrong" is incorrect — the WordPress ecosystem broadly uses this pattern for moderate-scale data.

**How to avoid:**
1. **Combine static analysis with DB metrics.** Architecture concerns about CPT misuse only become actionable when combined with actual row counts:
   - CPT with > 10 custom fields AND > 10,000 posts → flag as potential custom table candidate
   - CPT with > 10 custom fields AND < 1,000 posts → Info-level note only
2. **Gate DB queries behind "DB analysis available" flag.** Only run row count checks when DB access is confirmed. Fall back to static-only analysis with explicit confidence warning when DB is unavailable.
3. **Qualify all architecture findings:** "This pattern becomes a performance concern at scale (>10K posts). Current data volume assessment requires DB access."
4. **Distinguish CPT types:** WordPress core uses CPTs for menus (`nav_menu_item`), attachments, revisions — these are not misuse. Focus on *developer-defined* CPTs only.

**Warning signs:**
- Architecture review flags all sites with WooCommerce (which uses CPTs heavily and correctly)
- Finding says "CPT misuse" but site has < 500 total posts
- Attachment CPT or revision CPT flagged as misuse
- All custom fields (ACF/Meta Box) treated as potential DB bloat

**Phase to address:**
Phase: Architecture Review — Define CPT misuse thresholds with DB-context gating before writing the skill

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding `wp_` table prefix in SQL queries | Works on default installs | Fails silently on 30%+ of production sites with custom prefix | Never — always read prefix |
| Reading full wp-config.php to extract credentials | Simple one-step implementation | Exposes DB password in Claude context | Never — use WP-CLI config commands |
| Auto-selecting Docker container by image name | No user input needed | Picks wrong container on multi-container setups | Never — always confirm with user |
| Using line numbers as finding ID hash input | Simple to implement | IDs change on every code change, breaking trends | Never — hash code content instead |
| Generating finding IDs from file path + line only | Deterministic, unique | Completely breaks trend comparison after any refactor | Never for trends; acceptable for single-run reports |
| Skipping Bedrock/alternate WP structure detection | Works for 80% of installs | Fails silently for agency/developer local sites | Never in production tool |
| Confirming N+1 from static analysis alone | Faster results | High false positive rate, erodes user trust | Never — always qualify as "potential" |
| Storing Docker container name without confirming WP | Saves a detection step | Wrong container silently used for all diagnostics | Never — verify wp-config.php exists in container |
| Embedding git token in clone URL | Works immediately | Token visible in process list, git log, Claude context | Never — use credential helpers |
| Comparing finding counts for trends (not finding IDs) | Simple math | Cannot tell new issues from renamed/moved issues | Acceptable as supplementary metric only |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| wp-config.php parsing | Grep for `define('DB_PASSWORD'` | Use `wp config get DB_PASSWORD` via WP-CLI |
| Docker exec | Running without `-u` flag, hitting permission denied | Use `docker exec -u root` for read-only diagnostic access |
| Docker container discovery | Filtering by image name `wordpress` | Ask user or present list; confirm with wp-config.php check |
| git clone (HTTPS private repo) | Embedding token in URL | Use GIT_ASKPASS or git credential helper |
| git clone (SSH) | Assuming github.com in known_hosts | Run `ssh-keyscan` before clone attempt |
| Local by Flywheel DB | Assuming `localhost:3306` | Flywheel uses a socket file or non-standard port per-site |
| MAMP DB | Assuming standard MySQL port 3306 | MAMP defaults to 8889 for MySQL port |
| WP-CLI on local path | Assuming `wp` is in PATH | On local sites, user may need `./vendor/bin/wp` (Bedrock) |
| Table prefix in queries | Hardcoded `wp_options` | Read `table_prefix` from wp-config.php first |
| Multisite DB | Querying blog 1 tables only | Detect `MULTISITE` constant and document scope limitation |
| Direct MySQL connection | `-p` flag with password (visible in `ps`) | Use `MYSQL_PWD` env var or MySQL option file |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Reading entire wp-config.php into Claude context | Works on small files | Exposes DB password in context | Every run — never do this |
| git clone with full history for code analysis | Works on small repos | 500MB+ clone for mature repos | Any repo with > 2 years of history |
| Running DB query analysis without row count context | Returns results | Misleading "recommendations" for micro-sites | When autoloaded data is 100KB (fine) but flagged as "high" |
| Autoload size check with hardcoded threshold | Consistent threshold | False positives on tiny sites, false negatives on large ones | Sites with < 200 plugins where 3MB is actually fine |
| Scanning all files in git repo including vendor/ | Thorough | 20,000 false positives in vendor dependencies | Any repo using Composer with vendor committed |
| Finding trends comparison without schema versioning | Works in v1 | Old findings JSON unreadable after schema update | On first schema change (guaranteed to happen) |
| Docker exec per-command overhead | Simple implementation | Slow diagnostics when each check requires exec round-trip | More than 20 diagnostic checks in sequence |
| Cloning entire git repo to analyze WP code | Gets all files | Most git repos for WP projects include non-WP directories | Monorepos or repos with multiple projects |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reading wp-config.php to display DB credentials | DB password in Claude conversation history | Never read or display DB_PASSWORD; use WP-CLI for DB ops |
| Storing DB credentials in site profile JSON | Credentials in potentially-committed sites.json | Store connection type and WP path only; credentials accessed on-demand via WP-CLI |
| Running `docker exec -u root` permanently (not just for reads) | Unnecessary root access escalation | Limit `-u root` to read operations; scope docker permissions |
| Git HTTPS clone URL with embedded token | Token in Claude context, process list, git log | Use credential helper or SSH; never URL-embed tokens |
| Caching wp-config.php content in memory/ directory | DB password persisted to disk in git-tracked location | Never cache wp-config.php; cache only parsed safe values (prefix, debug status) |
| Direct MySQL connection without SSL on remote tunnel | Credentials and data in plaintext on network | For remote DB access, always use SSH tunnel; for local, socket is fine |
| Including wp-config.php in diagnostic report output | Password in shared/stored report | Strip credential constants from any config section of reports |
| Docker container with host network mode | Container escapes isolation | Document: never require host networking; use container exec only |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Failing without explanation when wp-config.php uses env vars | User sees "could not connect to DB" with no guidance | Detect env var pattern, explain: "DB credentials are environment-injected. WP-CLI will be used for DB access." |
| Asking for Docker container name without showing `docker ps` output | User doesn't know available container names | Run `docker ps --format "{{.Names}}\t{{.Image}}"` first, then ask |
| Git clone progress not shown during large repo clone | User thinks tool is frozen | Use `git clone --progress` and stream output |
| N+1 finding list with 30+ items and no severity ranking | User overwhelmed, ignores all findings | Cap static-analysis findings at 10, rank by estimated impact |
| DB autoload report with no context for what "5MB" means | User doesn't know if 5MB is bad | Include benchmark: "WordPress recommends < 1MB. Critical at > 10MB." |
| Architecture findings without "at this data scale" qualifier | User over-reacts to low-risk patterns | Always include data volume context in architecture findings |
| Trends showing "degraded" without showing what changed | User can't act on trend information | Show diff: "3 new Critical findings since {date}: {list}" |
| Local directory connection flow identical to SSH flow | Confuses users who just want to point at a folder | Local mode should ask only: "Path to WordPress directory?" — nothing else |
| Silent success when DB analysis finds nothing unusual | User unsure if analysis ran | Always show "DB analysis complete — no issues found" confirmation |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **wp-config.php credential extraction works:** Often missing — testing against Docker/Flywheel sites with `getenv()` patterns. Verify: test against a Docker-compose WordPress install.
- [ ] **DB table prefix is read dynamically:** Often missing — queries hardcode `wp_options`. Verify: test against a site with `table_prefix = 'custom_'`.
- [ ] **Docker container selection confirmed:** Often missing — tool auto-picks container, doesn't verify wp-config.php inside. Verify: test with two containers running simultaneously.
- [ ] **Git clone handles private repos:** Often missing — works on public repos, fails silently on private. Verify: test with a private GitHub repo that requires auth.
- [ ] **Finding IDs stable across refactors:** Often missing — IDs change when developer formats code. Verify: run two diagnostic scans with only whitespace changes between them; compare finding IDs.
- [ ] **N+1 detection has confidence tiers:** Often missing — all loop+query patterns flagged equally. Verify: check if `get_option()` inside a loop is marked differently from `$wpdb->get_results()` inside a loop.
- [ ] **Autoload analysis uses correct table prefix:** Often missing — returns 0 results on custom prefix sites. Verify: test against site with non-default prefix; confirm results match Site Health check.
- [ ] **Trends comparison handles missing previous run:** Often missing — crashes when no baseline exists. Verify: run trends comparison on a site with no historical findings.
- [ ] **Architecture review excludes WP core CPTs:** Often missing — flags `attachment`, `revision`, `nav_menu_item` as misuse. Verify: check that built-in WP CPTs don't appear in architecture findings.
- [ ] **Bedrock/non-standard WP structure detected:** Often missing — fails with generic "not a WordPress install." Verify: test against a Bedrock project directory.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| DB password appeared in Claude conversation | HIGH | 1. Rotate DB password on the affected site immediately. 2. Audit Claude conversation history for any stored/shared sessions. 3. Implement WP-CLI-only DB access going forward. |
| Wrong Docker container used for analysis | LOW | 1. Identify correct container via `docker ps`. 2. Re-run connection with explicit container name. 3. Update site profile with correct container. |
| Git token exposed in clone URL | HIGH | 1. Revoke the PAT immediately. 2. Generate new PAT with minimal scope. 3. Implement credential helper flow. 4. Check git log for URL in commit history. |
| Table prefix hardcoded → queries returned empty | LOW | 1. Read actual prefix via `wp config get table_prefix`. 2. Re-run affected DB queries with correct prefix. 3. Update all query templates. |
| Finding IDs unstable → trends data invalid | MEDIUM | 1. Archive existing trends data as "pre-v2" baseline. 2. Implement content-based ID hashing. 3. Regenerate baseline findings for all sites. 4. Discard old trends data (incompatible). |
| N+1 over-reporting → user dismissed all findings | MEDIUM | 1. Add confidence tiers to detection. 2. Re-run analysis with tiered output. 3. Include note in report: "Previous analysis may have over-reported performance findings." |
| Bedrock site fails local connect → user stuck | LOW | 1. Ask user for path to `wp-config.php` directly. 2. Add Bedrock detection to local connection flow. 3. Document Bedrock support in release notes. |
| Autoload analysis returned 0 (wrong prefix) | LOW | 1. Read prefix, re-run queries. 2. Verify results match Site Health check. 3. Add prefix detection as mandatory first step. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| wp-config.php credential parsing failures | DB Analysis Phase | Test against Docker and Flywheel sites with `getenv()` patterns |
| DB credential exposure in Claude context | DB Analysis Phase | Audit that no DB_PASSWORD value ever appears in diagnostic output |
| Docker container discovery unreliable | Multi-Source Access Phase | Test with 2+ running containers; confirm correct one selected |
| Docker permission denied reading wp-config | Multi-Source Access Phase | Test `docker exec -u root` flow on default WordPress Docker image |
| Git clone auth fails silently | Multi-Source Access Phase | Test with private repo; verify no blocking prompt or token exposure |
| N+1 false positives erode trust | Performance Detection Phase | Validate `get_option()` in loops is NOT flagged as N+1 |
| Table prefix hardcoded in SQL | DB Analysis Phase | Test autoload query against site with `mysite_` prefix; confirm non-zero results |
| Finding ID instability breaks trends | Findings Trends Phase | Add blank line to scanned file; confirm finding IDs unchanged |
| Bedrock install not detected | Multi-Source Access Phase | Test local connect against a Bedrock project; confirm detection message |
| Architecture review over-flags CPTs | Architecture Review Phase | Test against WooCommerce site; confirm no false CPT misuse findings |

---

## Sources

### WordPress DB Credential Handling
- [wp-config.php – Common APIs Handbook | WordPress Developer](https://developer.wordpress.org/apis/wp-config-php/)
- [Editing wp-config.php – Advanced Administration Handbook | WordPress Developer](https://developer.wordpress.org/advanced-administration/wordpress/wp-config/)
- [How to Harden WordPress With WP-Config & Avoid Data Exposure | Sucuri](https://blog.sucuri.net/2023/07/tips-for-wp-config-how-to-avoid-sensitive-data-exposure.html)
- [WordPress wp-config.php: Useful Explanation in 2026 | ThimPress](https://thimpress.com/wp-config-php-connecting-wordpress-and-database/)

### Docker WordPress Pitfalls
- [wordpress – Official Image | Docker Hub](https://hub.docker.com/_/wordpress)
- [wp-content is owned by root on creation · Issue #436 · docker-library/wordpress](https://github.com/docker-library/wordpress/issues/436)
- [How to Finally Fix the "Permission Denied" Error in Docker | Elementor](https://elementor.com/blog/permission-denied-error-in-docker/)
- [docker wp-config.php & database connection · Issue #5513 · wp-cli/wp-cli](https://github.com/wp-cli/wp-cli/issues/5513)
- [Local WordPress Development with Docker | Nelio Software](https://neliosoftware.com/blog/local-wordpress-development-with-docker/)

### Git Authentication
- [Using SSH over the HTTPS port – GitHub Docs](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)
- [Git clone SSH vs HTTPS | Graphite](https://graphite.com/guides/git-clone-ssh-vs-https)
- [How to Use HTTPS or SSH for Git in 2026 | TheLinuxCode](https://thelinuxcode.com/how-to-use-https-or-ssh-for-git-in-2026-practical-fast-and-low-friction/)

### WordPress DB Optimization and Analysis
- [Fixing Autoload Issues | WPMU DEV](https://wpmudev.com/docs/using-wordpress/fixing-autoload-issues/)
- [WordPress Database Optimization Guide: Wp_options, Autoload And Table Bloat | DCHost](https://www.dchost.com/blog/en/wordpress-database-optimization-guide-wp_options-autoload-and-table-bloat/)
- [Using WP-CLI doctor Command to Fix Large wp_options autoload Data | WP Bullet](https://guides.wp-bullet.com/using-wp-cli-doctor-command-to-fix-large-wp_options-autoload-data/)
- [#61764 (Site Health: Autoloaded options could affect performance) – WordPress Trac](https://core.trac.wordpress.org/ticket/61764)
- [The Art of the WordPress Transient: Performance, Persistence, and Database Bloat | Delicious Brains](https://deliciousbrains.com/the-art-of-the-wordpress-transient/)

### Static Analysis False Positives
- [Improving WordPress with Static Analysis | Matt Brown via Medium](https://muglug.medium.com/improving-wordpress-with-static-analysis-505cc5ba495d)
- [Don't Underestimate Grep Based Code Scanning | Little Man In My Head](https://littlemaninmyhead.wordpress.com/2019/08/04/dont-underestimate-grep-based-code-scanning/)
- [Analyze requests and application code for performance – WordPress VIP Documentation](https://docs.wpvip.com/performance/analyze-requests-and-application-code/)

### Custom Post Type Architecture
- [Custom Post Types for Scalable WordPress Site Architecture | iFlair](https://www.iflair.com/advanced-custom-post-type-usage-for-large-wordpress-sites/)
- [The Ultimate Guide to WordPress Custom Post Types 2026 | Future Proof Digital](https://futureproofdigital.ie/blog/wordpress-custom-post-types/)

### Local WordPress Development Structures
- [Local WordPress Development: From MAMP to Local by Flywheel | Duane Storey](https://duanestorey.com/posts/local-wordpress-development-from-mamp-to-local-by-flywheel)
- [Using MAMP with WordPress for Local Development | Nexcess](https://www.nexcess.net/help/using-mamp-with-wordpress/)

### JSON Schema Evolution (for Findings Trends)
- [Schema Drift in Variant Data: A Practical Guide | Bix Tech](https://bix-tech.com/schema-drift-in-variant-data-a-practical-guide-to-building-change-proof-pipelines/)
- [Handling Schema Evolution in Kafka Connect: Patterns, Pitfalls, and Practices | CloudNativePub](https://medium.com/cloudnativepub/handling-schema-evolution-in-kafka-connect-patterns-pitfalls-and-practices-391795d7d8b0)

---

*Pitfalls research for: WP Diagnostics Expert v2.0 — DB Analysis, Performance Detection, Architecture Review, Findings Trends, Multi-Source Access*
*Researched: 2026-02-18*
