# Phase 6: Database Health & Infrastructure Audits - Research

**Researched:** 2026-02-19
**Domain:** WordPress database health (autoload, transients, revisions) + infrastructure auditing (HTTPS/SSL, file permissions) via WP-CLI
**Confidence:** HIGH

## Summary

Phase 6 adds five new diagnostic skills: three for DB health (autoload bloat, transient buildup, post revisions) and two for infrastructure (HTTPS/SSL config, file permissions). All DB skills use the established `WP_CLI_PREFIX` pattern from Phase 5, routing WP-CLI invocations through SSH, docker exec, or local invocation based on `source_type`. The HTTPS skill uniquely splits into a WP-CLI-gated part and a code-grep part that runs on any source type — the first time a skill has dual-gating behavior. Permission checks are SSH-only.

The technical work is pure SKILL.md authoring — no changes to core infrastructure files beyond registering new skills in `/diagnose`'s skill list and capability summary. Each skill follows the exact same pattern as existing diagnostic skills: read from `WP_CLI_PREFIX`, run `wp db query` with dynamically obtained table prefix, produce structured JSON findings with deterministic IDs, handle errors gracefully, and emit Critical/Warning/Info severity.

A key implementation fact confirmed by research: `wp transient list` does NOT have an `--expired` filter flag. To count expired transients, use a direct `wp db query` on `wp_options` comparing `_transient_timeout_*` values against `UNIX_TIMESTAMP()`. Also confirmed: `wp db prefix` (not `wp config get table_prefix`) is the more authoritative way to get the table prefix from the active database handler.

**Primary recommendation:** Build three DB skills and two infrastructure skills as new SKILL.md files in the `skills/` directory, register them in `/diagnose`, and apply the existing `WP_CLI_PREFIX` pattern throughout. No new dependencies required.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Thresholds & Severity:**
- Autoload bloat: Warning at 900KB (matches WordPress core threshold), Critical above 2MB
- Post revisions: Recommend specific limits (e.g., 10 revisions per post) and estimate DB savings from cleanup; flag when WP_POST_REVISIONS is unlimited
- Transient severity: Ratio-based — high expired:live transient ratio is the signal, not raw count
- Severity levels: Same 3-level system as existing diagnostics (Critical/Warning/Info) — no new levels; optimization suggestions are Info

**DB Finding Attribution:**
- Autoload attribution: Prefix matching to known plugin slugs (e.g., wpseo_* → Yoast SEO) — no code grepping
- Top offenders display: Show all autoloaded options above a size threshold (e.g., >10KB), not a fixed top-N count
- Autoload list format: Flat list sorted by size (largest first) with plugin attribution as a column — not grouped by plugin
- Transient presentation: Aggregate counts only (total expired, total live, ratio, overall size) — no individual transient listing

**Permission Check Scope:**
- Check key files only: wp-config.php, .htaccess, wp-content/uploads/, wp-content/debug.log
- SSH remote check only — skip permission checks entirely for non-SSH sources with a note explaining why (rsync normalizes permissions)
- wp-config.php thresholds: World-readable (644 or looser) = Critical; 640 or 600 = OK; directories 755 max
- debug.log: Only flag if WP_DEBUG is enabled in production — ties finding to actionable config issue

**HTTPS Audit Depth:**
- Config values only — check siteurl/home scheme, FORCE_SSL_ADMIN via WP-CLI; no external SSL cert probing
- Mixed content: Also grep all synced PHP/JS files for hardcoded http:// URLs — catches mixed content at the source
- Split into two checks: WP-CLI config checks (gated on WP-CLI availability) + code grep for hardcoded http:// (runs on any source type) — partial results better than skipping entirely
- Code grep scope: All synced PHP/JS files, not limited to active theme/plugins

### Claude's Discretion

- Exact size threshold for autoload offender display (suggested >10KB but Claude can adjust)
- Specific revision limit recommendation number
- Transient ratio thresholds for Warning vs Info
- debug.log permission check specifics
- Mixed content grep pattern design (avoiding false positives from comments, strings, etc.)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DBHL-01 | User can analyze wp_options autoload bloat (total size, top offenders, plugin attribution) | `wp db query` on wp_options with dynamic table prefix via `wp db prefix`; prefix-to-slug attribution table; flat list sorted by size above threshold |
| DBHL-02 | User can detect transient buildup and expired transient count | `wp db query` counting `_transient_%` and `_transient_timeout_%` rows with `UNIX_TIMESTAMP()` comparison; ratio-based severity; `wp transient list` NOT used (no --expired flag) |
| DBHL-03 | User can check post revision accumulation and recommend cleanup thresholds | `wp post list --post_type=revision --format=count` for totals; `wp db query` for per-parent breakdown; `wp config get WP_POST_REVISIONS` to detect unlimited setting |
| DBHL-04 | Plugin reads table prefix dynamically from WP-CLI (never hardcoded) | `wp db prefix` returns active prefix from database handler — more authoritative than `wp config get table_prefix` |
| DBHL-05 | Plugin accesses DB exclusively through WP-CLI (never parses wp-config.php for credentials) | `WP_CLI_PREFIX` pattern from Phase 5 routes all WP-CLI calls; skills never touch wp-config.php credentials directly |
| INFR-01 | User can audit HTTPS/SSL configuration (force-SSL constants, mixed content indicators, certificate status) | WP-CLI-gated: `wp option get siteurl`, `wp option get home`, `wp config get FORCE_SSL_ADMIN`; non-gated: grep on synced PHP/JS files for hardcoded http:// URLs |
| INFR-02 | User can check file and directory permissions against WordPress security recommendations | SSH-only: `stat` command on wp-config.php, .htaccess, wp-content/uploads/, wp-content/debug.log; established permission thresholds from WordPress docs |
</phase_requirements>

## Standard Stack

### Core (All Existing — No New Dependencies)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| WP-CLI | 2.x | All DB queries and config reads via `wp db query`, `wp db prefix`, `wp option get`, `wp config get`, `wp post list` | Established Phase 5 pattern; never access DB credentials directly |
| Bash | 3.2+ | Skill execution, command construction, output parsing | Used throughout all existing skills |
| jq | 1.6+ | Profile reads from sites.json, JSON output formatting | Used everywhere in the plugin |
| stat | macOS/Linux built-in | File permission octal reads for INFR-02 | Available on all SSH targets; cross-platform with minor flag difference |
| grep | POSIX | Mixed content pattern detection in PHP/JS files | Already used in malware-scan and code-quality skills |

### No New Dependencies

This phase adds zero new tools. The entire implementation is authoring new SKILL.md files that use tools already present in the codebase.

## Architecture Patterns

### Recommended Project Structure

New skill files created:
```
skills/
├── diagnostic-db-autoload/
│   └── SKILL.md       # DBHL-01: autoload bloat analysis
├── diagnostic-db-transients/
│   └── SKILL.md       # DBHL-02: transient buildup detection
├── diagnostic-db-revisions/
│   └── SKILL.md       # DBHL-03: post revision accumulation
├── diagnostic-https-audit/
│   └── SKILL.md       # INFR-01: HTTPS/SSL config + mixed content grep
└── diagnostic-file-permissions/
│   └── SKILL.md       # INFR-02: file permission checks (SSH-only)
```

Plus updates to:
```
commands/diagnose/COMMAND.md  # Register new skills, extend capability summary
```

### Pattern 1: WP_CLI_PREFIX Routing (DBHL-05, DBHL-04)

**What:** All WP-CLI invocations use `$WP_CLI_PREFIX` already computed in `/diagnose` Section 4. Skills receive this prefix and prepend it to every `wp` command.

**Established in:** `commands/diagnose/COMMAND.md` Section 4 "WP-CLI Dependency Check and Source-Type Routing"

**How it works:**
```bash
# Set in /diagnose (already implemented in Phase 5):
case "$SOURCE_TYPE" in
  "ssh")    WP_CLI_PREFIX="ssh ${USER}@${HOST} ${WP_CLI_PATH} --path=${WP_PATH}" ;;
  "docker") WP_CLI_PREFIX="docker exec ${CONTAINER_NAME} ${WP_CLI_PATH} --path=${WP_PATH}" ;;
  "local")  WP_CLI_PREFIX="${WP_CLI_PATH} --path=${WP_PATH}" ;;
  "git")    WP_CLI_AVAILABLE=false ;;
esac

# Skills use it like this:
TABLE_PREFIX=$($WP_CLI_PREFIX db prefix 2>/dev/null | tr -d '[:space:]')

# Then in queries:
$WP_CLI_PREFIX db query "SELECT SUM(LENGTH(option_value)) FROM ${TABLE_PREFIX}options WHERE autoload='yes'" --skip-column-names 2>/dev/null
```

**Key insight:** All three DB skills are WP-CLI-dependent skills and must be added to the `WP_CLI_SKILLS` array in `/diagnose` alongside the existing three (core-integrity, user-audit, version-audit).

### Pattern 2: Dynamic Table Prefix (DBHL-04)

**What:** Use `wp db prefix` to get the active table prefix before any `wp db query` calls that reference wp_options or wp_posts.

**Why `wp db prefix` over `wp config get table_prefix`:** The `wp db prefix` command returns "the database table prefix as defined by the database handler's interpretation of the current site" — it reflects the actual running system, not just the config file value. This matters for multisite or programmatically-changed prefixes.

```bash
# At top of each DB skill:
TABLE_PREFIX=$($WP_CLI_PREFIX db prefix 2>/dev/null | tr -d '[:space:]')
if [ -z "$TABLE_PREFIX" ]; then
  # Fallback: wp config get table_prefix
  TABLE_PREFIX=$($WP_CLI_PREFIX config get table_prefix 2>/dev/null | tr -d '[:space:]')
fi
if [ -z "$TABLE_PREFIX" ]; then
  # Cannot proceed without prefix
  echo "[DB Skill] Skipped — could not determine table prefix"
  exit 0
fi
```

### Pattern 3: DBHL-01 Autoload Bloat Queries

**What:** Two queries — total autoload size and per-option sizes for offenders above threshold.

```bash
# Query 1: Total autoload size in bytes
AUTOLOAD_TOTAL=$($WP_CLI_PREFIX db query \
  "SELECT SUM(LENGTH(option_value)) FROM ${TABLE_PREFIX}options WHERE autoload='yes'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Query 2: All options above size threshold (recommended: >10240 bytes = 10KB)
# Returns option_name and size, sorted largest first
AUTOLOAD_OFFENDERS=$($WP_CLI_PREFIX db query \
  "SELECT option_name, LENGTH(option_value) as size_bytes FROM ${TABLE_PREFIX}options WHERE autoload='yes' AND LENGTH(option_value) > 10240 ORDER BY size_bytes DESC" \
  --skip-column-names 2>/dev/null)
```

**Severity logic:**
- `AUTOLOAD_TOTAL > 2097152` (2MB) → Critical
- `AUTOLOAD_TOTAL > 921600` (900KB) → Warning
- Otherwise → Info (healthy)

**Attribution via prefix matching (no code grepping):**
```bash
# Map option_name prefix to known plugin slugs
# Applied after AUTOLOAD_OFFENDERS results are retrieved
declare -A PLUGIN_PREFIXES=(
  ["wpseo_"]="Yoast SEO"
  ["_transient_wpseo"]="Yoast SEO"
  ["rank_math_"]="Rank Math SEO"
  ["elementor_"]="Elementor"
  ["_elementor"]="Elementor"
  ["woocommerce_"]="WooCommerce"
  ["_woocommerce"]="WooCommerce"
  ["wpforms_"]="WPForms"
  ["tribe_"]="The Events Calendar"
  ["acf_"]="Advanced Custom Fields"
  ["vc_"]="WPBakery"
  ["_vc_"]="WPBakery"
  ["gtm4wp_"]="GTM4WP"
  ["litespeed_"]="LiteSpeed Cache"
  ["jetpack_"]="Jetpack"
  ["_jetpack"]="Jetpack"
  ["wordfence_"]="Wordfence"
  ["updraftplus_"]="UpdraftPlus"
  ["gravityforms"]="Gravity Forms"
  ["gform_"]="Gravity Forms"
)
# For each option_name: check prefix match, output "Plugin Name" or "WordPress Core/Unknown"
```

**Output format (flat list, largest first):**
```
Option Name                         | Size    | Attribution
wpseo_indexed_post_types            | 450 KB  | Yoast SEO
elementor_css_print_method          | 230 KB  | Elementor
my_custom_plugin_cache              | 45 KB   | Unknown (my_custom_plugin_*)
```

### Pattern 4: DBHL-02 Transient Buildup Queries

**What:** Count total live transients, total expired transients (where timeout has passed), and their combined size. Report ratio, not individual transients.

**Important:** `wp transient list` does NOT have an `--expired` flag. Must use direct SQL:

```bash
# Count all live transients (non-timeout rows under _transient_)
LIVE_TRANSIENTS=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_%' AND option_name NOT LIKE '_transient_timeout_%'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Count expired transients: timeout row exists AND timeout value < current UNIX timestamp
EXPIRED_TRANSIENTS=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_timeout_%' AND CAST(option_value AS UNSIGNED) < UNIX_TIMESTAMP()" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Total transient storage size (both timeout and value rows)
TRANSIENT_SIZE=$($WP_CLI_PREFIX db query \
  "SELECT SUM(LENGTH(option_value)) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_%'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')
```

**Ratio-based severity (Claude's Discretion — recommended thresholds):**
- `EXPIRED_TRANSIENTS / LIVE_TRANSIENTS > 0.5` (50%+ expired) AND `EXPIRED_TRANSIENTS > 100` → Warning
- `EXPIRED_TRANSIENTS / LIVE_TRANSIENTS > 0.25` (25%+ expired) AND `EXPIRED_TRANSIENTS > 50` → Info
- Otherwise → Info (healthy)

**Output:**
```
Transient Summary:
  Live transients:    342
  Expired transients: 189  (55% of live count)
  Total size:         2.4 MB
```

**Fix guidance:** `wp transient delete --expired` clears expired transients without data loss.

### Pattern 5: DBHL-03 Post Revision Analysis

**What:** Count total revisions, get breakdown by post type, check `WP_POST_REVISIONS` config, estimate cleanup savings.

```bash
# Total revision count
TOTAL_REVISIONS=$($WP_CLI_PREFIX post list \
  --post_type=revision --format=count 2>/dev/null | tr -d '[:space:]')

# Per-parent post type breakdown (join wp_posts with parent's post_type)
REVISION_BREAKDOWN=$($WP_CLI_PREFIX db query \
  "SELECT p.post_type, COUNT(r.ID) as revisions FROM ${TABLE_PREFIX}posts r JOIN ${TABLE_PREFIX}posts p ON r.post_parent = p.ID WHERE r.post_type = 'revision' GROUP BY p.post_type ORDER BY revisions DESC" \
  --skip-column-names 2>/dev/null)

# Check WP_POST_REVISIONS config
WP_POST_REVISIONS=$($WP_CLI_PREFIX config get WP_POST_REVISIONS 2>/dev/null | tr -d '[:space:]')
# If command fails (constant not defined), revisions are unlimited by default

# Estimate average revisions per post (for context)
POST_COUNT=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}posts WHERE post_type NOT IN ('revision','attachment','nav_menu_item') AND post_status NOT IN ('auto-draft','trash')" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')
```

**Severity logic:**
- `WP_POST_REVISIONS` undefined/false/unlimited AND `TOTAL_REVISIONS > 1000` → Warning (with savings estimate)
- `TOTAL_REVISIONS > 5000` regardless of config → Warning
- `TOTAL_REVISIONS > 500` or high per-post average → Info

**Recommended limit (Claude's Discretion — recommend 10):** The context suggests "e.g., 10 revisions per post" as a specific recommendation. Best practice consensus (2024) is 2-10, with 10 being generous for editorial workflows. Recommend `define('WP_POST_REVISIONS', 10);` in wp-config.php.

**Savings estimate:** `(TOTAL_REVISIONS - (POST_COUNT * 10))` rows would be removed if limit were set to 10. Estimate row size at ~2KB average for a rough byte savings.

### Pattern 6: INFR-01 HTTPS Audit (Dual-Gated)

**What:** The first skill with two independently-gated sub-checks. Part A requires WP-CLI. Part B requires only `local_path` (runs for all source types including git).

**Part A: WP-CLI Config Checks (WP-CLI-gated)**
```bash
# Requires WP_CLI_AVAILABLE=true

# Check siteurl scheme
SITEURL=$($WP_CLI_PREFIX option get siteurl 2>/dev/null)
HOME_URL=$($WP_CLI_PREFIX option get home 2>/dev/null)

# Check FORCE_SSL_ADMIN (may not be defined — that's OK)
FORCE_SSL_ADMIN=$($WP_CLI_PREFIX config get FORCE_SSL_ADMIN 2>/dev/null)
# Empty/error = not set

# Findings:
# - siteurl starts with http:// → Warning (HTTPS not enforced for site URL)
# - home starts with http:// → Warning (home URL not HTTPS)
# - FORCE_SSL_ADMIN not set or false → Info (admin panel not forced to HTTPS)
```

**Part B: Mixed Content Code Grep (runs on any source type)**
```bash
# Requires LOCAL_PATH to be set (it always is after /connect)
# Grep all PHP and JS files in local_path for hardcoded http:// URLs
# Exclude common false positives: comments, docblock strings, example URLs

# Pattern design to avoid false positives:
# - Only match http:// followed by a hostname (not localhost, 127.0.0.1)
# - Skip lines that start with * or // (doc comments)
# - Skip lines containing 'example.com' or 'placeholder' or 'dummy'
MIXED_CONTENT=$(grep -rn \
  --include="*.php" --include="*.js" \
  --exclude-dir=".git" --exclude-dir="node_modules" --exclude-dir="vendor" \
  "http://[a-zA-Z0-9]" \
  "$LOCAL_PATH/" 2>/dev/null | \
  grep -v "^\s*[/*#]" | \
  grep -v "localhost\|127\.0\.0\|example\.com\|placeholder\|dummy\|test\." | \
  head -50)

MIXED_CONTENT_COUNT=$(echo "$MIXED_CONTENT" | grep -c "http://" 2>/dev/null || echo 0)
```

**Gating display:** If WP-CLI not available, still run Part B and note: "Note: WP-CLI config checks skipped (source type does not support WP-CLI). Mixed content scan ran on local files."

**Finding IDs for INFR-01:**
- `INFR-HTTPS-URL` — siteurl/home not HTTPS
- `INFR-HTTPS-SSL` — FORCE_SSL_ADMIN not set
- `INFR-HTTPS-MXD` — hardcoded http:// URLs found in code
- `INFR-HTTPS-OK` — all HTTPS checks pass (Info)

### Pattern 7: INFR-02 File Permissions (SSH-only)

**What:** Check octal permissions on specific files. SSH-only — skip with explanatory note for non-SSH sources.

```bash
# Source type gate — run ONLY for SSH
SOURCE_TYPE=$(jq -r ".sites[\"$SITE_NAME\"].source_type // \"ssh\"" sites.json)
if [ "$SOURCE_TYPE" != "ssh" ]; then
  echo "[File Permissions] Skipped — permission checks only available for SSH sources."
  echo "Reason: rsync normalizes file permissions during sync, so synced local copies"
  echo "do not reflect actual server permissions."
  exit 0
fi

# Files to check (from user decision):
FILES_TO_CHECK=(
  "${WP_PATH}/wp-config.php"
  "${WP_PATH}/.htaccess"
  "${WP_PATH}/wp-content/uploads/"
  "${WP_PATH}/wp-content/debug.log"
)

# Get octal permissions via SSH
# macOS stat: stat -f %Lp FILE
# Linux stat: stat -c %a FILE
# Use portable approach: try Linux first, fall back to macOS
for FILE in "${FILES_TO_CHECK[@]}"; do
  PERMS=$(ssh $SSH_OPTS "${USER}@${HOST}" \
    "stat -c %a '${FILE}' 2>/dev/null || stat -f %Lp '${FILE}' 2>/dev/null || echo 'NOT_FOUND'" 2>/dev/null)
done
```

**Permission thresholds (from user decisions):**

| File | Safe | Warning | Critical | Notes |
|------|------|---------|----------|-------|
| wp-config.php | 600, 640 | 440, 400 | 644 or looser (world-readable) | 644 is Critical: DB password readable by all |
| .htaccess | 644 | 664 | 666 or 777 | Must be readable by webserver; write access is risky |
| wp-content/uploads/ | 755 | 775 | 777 | Directories need execute; world-write is dangerous |
| wp-content/debug.log | N/A | 640, 644 only if WP_DEBUG enabled | 644 if WP_DEBUG enabled | Only check/flag if WP_DEBUG=true in config |

**debug.log special case:** Read `WP_DEBUG` status from site-scout data or run `wp config get WP_DEBUG`. Only emit a finding for debug.log if `WP_DEBUG` is enabled — the finding explains "debug.log is world-readable AND WP_DEBUG is enabled, exposing error traces."

**Finding IDs for INFR-02:**
- `INFR-PERM-CFG` — wp-config.php world-readable
- `INFR-PERM-HTA` — .htaccess over-permissioned
- `INFR-PERM-UPL` — uploads/ world-writable
- `INFR-PERM-DBG` — debug.log readable + WP_DEBUG enabled
- `INFR-PERM-SKP` — skipped for non-SSH source (Info finding)

### Pattern 8: Registering New Skills in /diagnose

**What:** New DB skills are WP-CLI-dependent; HTTPS skill is partially gated; permission skill is SSH-gated.

**Skills list update in diagnose COMMAND.md:**
```bash
"full" mode skills array additions:
  "diagnostic-db-autoload:Autoload Bloat Analysis"
  "diagnostic-db-transients:Transient Buildup Check"
  "diagnostic-db-revisions:Post Revision Analysis"
  "diagnostic-https-audit:HTTPS Configuration Audit"
  "diagnostic-file-permissions:File Permission Check"

WP_CLI_SKILLS array additions:
  "diagnostic-db-autoload"
  "diagnostic-db-transients"
  "diagnostic-db-revisions"
  # Note: diagnostic-https-audit is NOT in WP_CLI_SKILLS
  # It handles its own dual-gating internally
  # Note: diagnostic-file-permissions is NOT in WP_CLI_SKILLS
  # It handles its own SSH-only gating internally
```

**Capability summary update in /connect:**
Add to the capabilities display:
```
  [x/space] Database health analysis — [reason if unavailable]
  [x] HTTPS configuration audit (partial — code scan always runs)
  [x/space] File permission check — SSH sources only
```

### Anti-Patterns to Avoid

**1. Hardcoding `wp_` in SQL queries**
- Bad: `SELECT ... FROM wp_options WHERE ...`
- Why: Fails for any site with a custom table prefix
- Fix: Always retrieve prefix first via `$WP_CLI_PREFIX db prefix`, then interpolate: `${TABLE_PREFIX}options`

**2. Using `wp transient list --expired` (flag does not exist)**
- Bad: `$WP_CLI_PREFIX transient list --expired`
- Why: The `--expired` flag does not exist on `wp transient list`. The command only accepts `--search`, `--exclude`, `--network`, `--unserialize`, `--human-readable`, `--fields`, `--format`.
- Fix: Use `wp db query` with `_transient_timeout_%` pattern and `UNIX_TIMESTAMP()` comparison

**3. Grepping remote SSH files for mixed content instead of local synced files**
- Bad: Running `ssh user@host grep -r http:// /var/www/html/`
- Why: Expensive, slow, and the whole point of Phase 5 was to have files local for analysis
- Fix: Always grep `$LOCAL_PATH/` which is already synced

**4. Running permission checks on non-SSH sources**
- Bad: Attempting `stat` on `$LOCAL_PATH/wp-config.php` for local/docker/git sources
- Why: rsync normalizes permissions during sync; local copies do not reflect server permissions
- Fix: Skip INFR-02 entirely for non-SSH with an explanatory Info finding

**5. Flagging debug.log permissions unconditionally**
- Bad: Always flagging debug.log permissions as a finding
- Why: debug.log may not exist, and even if it does, it's only a risk if WP_DEBUG is enabled and logging is active
- Fix: First check WP_DEBUG status; only emit finding if WP_DEBUG is true

**6. Counting transients by raw count instead of ratio**
- Bad: "Critical: 500 expired transients found"
- Why: A site with 10,000 live transients and 500 expired (5%) is healthy; a site with 200 live and 500 expired (250%) is problematic
- Fix: Always compute ratio = expired / live, use ratio for severity, report both counts

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table prefix resolution | Parse wp-config.php manually | `$WP_CLI_PREFIX db prefix` | Handles multisite, programmatic prefix changes; no credential access |
| DB credential access | Read wp-config.php | WP-CLI's built-in DB connection | DBHL-05 explicitly forbids credential parsing; WP-CLI handles all DB auth |
| Expired transient detection | Custom PHP script or plugin | `wp db query` with UNIX_TIMESTAMP() | SQL comparison is instant; no plugin installation needed |
| Plugin attribution | Static lookup file or code grep | Inline prefix-match dictionary in the skill | Attribution table is a ~20-entry lookup; no file I/O needed |
| Mixed content detection | External SSL scanning tool | Local grep on synced PHP/JS files | SSL cert probing is out of scope; source-in-code is the actual problem |
| Permission octal parsing | Custom bit-manipulation logic | `stat -c %a` (Linux) / `stat -f %Lp` (macOS) | Built-in stat outputs the 3-digit octal directly |

**Key insight:** All five skills operate entirely through `WP_CLI_PREFIX` + standard shell tools. No additional tooling needed at any layer.

## Common Pitfalls

### Pitfall 1: `wp db query` Output Includes Extra Whitespace / Headers

**What goes wrong:** `wp db query "SELECT COUNT(*) FROM ..."` returns output with column headers ("COUNT(*)") unless `--skip-column-names` flag is used. Result stored in a variable includes extra text.

**Why it happens:** WP-CLI's `db query` command defaults to MySQL CLI output format, which includes column headers.

**How to avoid:** Always use `--skip-column-names` on `wp db query` calls that return a single scalar value. Pipe through `tr -d '[:space:]'` to strip trailing newlines and spaces.

```bash
# Correct:
COUNT=$($WP_CLI_PREFIX db query "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE ..." \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Wrong (will contain "COUNT(*)\n42"):
COUNT=$($WP_CLI_PREFIX db query "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE ...")
```

### Pitfall 2: stat Command Syntax Differs Between macOS and Linux

**What goes wrong:** `stat -c %a FILE` works on Linux but not macOS; `stat -f %Lp FILE` works on macOS but not Linux. INFR-02 runs over SSH on the target server — the server is almost always Linux, but testing locally is on macOS.

**Why it happens:** The `stat` command has divergent syntax across BSD (macOS) and GNU (Linux) implementations. This is the same issue Phase 2 encountered with rsync.

**How to avoid:** For SSH targets (which are Linux servers), always use `stat -c %a`. For local testing, use `stat -f %Lp`. Since INFR-02 is SSH-only and SSH targets are Linux servers, hardcode the Linux syntax:

```bash
# On remote SSH (Linux target):
PERMS=$(ssh $SSH_OPTS "${USER}@${HOST}" "stat -c %a '${FILE}' 2>/dev/null || echo 'NOT_FOUND'")
```

### Pitfall 3: wp_options Autoload Query Is Slow on Large Databases

**What goes wrong:** The autoload query scans all autoloaded options rows. On sites with 10,000+ options rows and large values, the `SUM(LENGTH(option_value))` query can take several seconds.

**Why it happens:** `LENGTH(option_value)` requires reading every option_value column for matching rows. Large option values (serialized arrays, cached HTML) amplify this.

**How to avoid:** The query already has `WHERE autoload='yes'` which limits scope. For the offender list, add the `> 10240` size filter to avoid reading every option value. Document in SKILL.md that this query may take 5-30 seconds on large sites. Do not add a timeout that would kill a legitimate query.

### Pitfall 4: WP_POST_REVISIONS Check Returns Unexpected Values

**What goes wrong:** `wp config get WP_POST_REVISIONS` can return:
- A number string: `"10"`
- `"true"` (unlimited revisions)
- `"false"` (revisions disabled — actually 0 revisions)
- An error/empty string (constant not defined — also means unlimited, WP default)

**Why it happens:** WP_POST_REVISIONS is a PHP constant that can be set to any of these values, and WP-CLI's `config get` reads the raw defined value.

**How to avoid:** Handle all four cases explicitly:
```bash
WP_POST_REVISIONS=$($WP_CLI_PREFIX config get WP_POST_REVISIONS 2>/dev/null | tr -d '[:space:]')
# Empty/error = not defined = unlimited (default WordPress behavior)
# "true" = explicitly unlimited
# "false" = disabled (0 revisions kept)
# A number = limit set

if [ -z "$WP_POST_REVISIONS" ] || [ "$WP_POST_REVISIONS" = "true" ]; then
  REVISIONS_UNLIMITED=true
elif [ "$WP_POST_REVISIONS" = "false" ]; then
  REVISIONS_UNLIMITED=false
  REVISIONS_LIMIT=0
else
  REVISIONS_UNLIMITED=false
  REVISIONS_LIMIT="$WP_POST_REVISIONS"
fi
```

### Pitfall 5: HTTPS Grep Produces False Positives from Comments and Documentation URLs

**What goes wrong:** Grepping for `http://` in PHP files finds many legitimate occurrences: code comments (`// See http://php.net/...`), docblock links (`@link http://example.org`), example URLs in string literals, WordPress.org links, and CDN URLs that are intentionally HTTP.

**Why it happens:** PHP source files contain lots of inline documentation that references HTTP URLs. A naive grep will flag these as mixed content.

**How to avoid:** The grep pattern design is Claude's Discretion (as noted in CONTEXT.md). Recommended pattern:
```bash
grep -rn \
  --include="*.php" --include="*.js" \
  --exclude-dir=".git" --exclude-dir="node_modules" --exclude-dir="vendor" \
  "http://[a-zA-Z0-9][a-zA-Z0-9.-]*\." \
  "$LOCAL_PATH/" 2>/dev/null | \
  grep -v "^\s*[*/#]" | \                    # Skip comment lines
  grep -v "localhost\|127\.0\.0\." | \        # Skip local URLs
  grep -v "example\.com\|example\.org\|example\.net" | \  # Skip example URLs
  grep -v "php\.net\|wordpress\.org\|w3\.org\|ietf\.org" | \  # Skip doc URLs
  grep -v "http://schemas\.\|http://www\.w3\." | \  # Skip XML namespaces
  head -50
```

This reduces false positives while catching actual hardcoded resource URLs (images, scripts, stylesheets, API endpoints).

### Pitfall 6: `wp db prefix` Can Return Multisite Network Prefix

**What goes wrong:** On WordPress Multisite, `wp db prefix` with no extra flags returns the network prefix (e.g., `wp_`), but subsite tables may use `wp_2_`, `wp_3_`, etc. Querying `wp_options` on a multisite install only scans the main site's options.

**Why it happens:** WP-CLI's `wp db prefix` returns the $table_prefix as configured, which is the base prefix for the current site in a multisite network.

**How to avoid:** For Phase 6, this is acceptable scope — diagnosing the main site's options table. Document in the SKILL.md that on Multisite, the check covers the primary site (subsite options are in `wp_N_options`). This is Info-level limitation, not a bug.

## Code Examples

Verified patterns from codebase review and official WP-CLI documentation:

### Autoload Total Size Check

```bash
# Get table prefix dynamically
TABLE_PREFIX=$($WP_CLI_PREFIX db prefix --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Total autoload size in bytes
AUTOLOAD_BYTES=$($WP_CLI_PREFIX db query \
  "SELECT COALESCE(SUM(LENGTH(option_value)), 0) FROM ${TABLE_PREFIX}options WHERE autoload='yes'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Convert to KB for display
AUTOLOAD_KB=$((AUTOLOAD_BYTES / 1024))

# Severity thresholds (from user decisions)
if [ "$AUTOLOAD_BYTES" -gt 2097152 ]; then
  SEVERITY="Critical"
  THRESHOLD_MSG="2MB threshold"
elif [ "$AUTOLOAD_BYTES" -gt 921600 ]; then
  SEVERITY="Warning"
  THRESHOLD_MSG="900KB warning threshold"
else
  SEVERITY="Info"
  THRESHOLD_MSG="healthy"
fi
```

### Transient Expired Count Query

```bash
# Note: wp transient list has NO --expired flag
# Must use direct SQL with UNIX_TIMESTAMP() comparison

EXPIRED_COUNT=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_timeout_%' AND CAST(option_value AS UNSIGNED) < UNIX_TIMESTAMP()" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

LIVE_COUNT=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_%' AND option_name NOT LIKE '_transient_timeout_%'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Ratio-based severity
if [ "$LIVE_COUNT" -gt 0 ]; then
  # Use awk for float division in bash
  RATIO=$(awk "BEGIN {printf \"%.2f\", $EXPIRED_COUNT / $LIVE_COUNT}")
fi
```

### File Permission Check (SSH-only)

```bash
# INFR-02: SSH-only gate
SOURCE_TYPE=$(jq -r ".sites[\"$SITE_NAME\"].source_type // \"ssh\"" sites.json)
if [ "$SOURCE_TYPE" != "ssh" ]; then
  # Return Info finding explaining the skip
  cat << 'EOF'
[{
  "id": "INFR-PERM-SKP",
  "severity": "Info",
  "category": "Infrastructure",
  "title": "File permission check skipped",
  "summary": "File permission checks require SSH access and cannot run for this source type.",
  "detail": "Permission checks are skipped for non-SSH sources because rsync normalizes file permissions during sync. The locally synced files do not reflect actual server permissions. Connect via SSH to check real file permissions.",
  "location": "File system",
  "fix": "Connect to this site via SSH source type to enable file permission checks."
}]
EOF
  exit 0
fi

# On SSH target (Linux): stat -c %a returns 3-digit octal
WP_CONFIG_PERMS=$(ssh $SSH_OPTS "${USER}@${HOST}" \
  "stat -c %a '${WP_PATH}/wp-config.php' 2>/dev/null || echo 'NOT_FOUND'")

# wp-config.php: 644 or looser = Critical (world-readable includes DB credentials)
# Compare as integers: 644, 664, 666, 755, 777 are all world-readable or worse
if [ "$WP_CONFIG_PERMS" != "NOT_FOUND" ]; then
  PERMS_INT=$((8#$WP_CONFIG_PERMS))  # Convert octal to decimal
  WORLD_BIT=$((PERMS_INT & 4))        # Check world read bit (r--)
  if [ "$WORLD_BIT" -gt 0 ]; then
    SEVERITY="Critical"  # World-readable: exposes DB credentials
  fi
fi
```

### HTTPS Config Audit (WP-CLI Part)

```bash
# Part A: WP-CLI checks (only when WP_CLI_AVAILABLE=true)
SITEURL=$($WP_CLI_PREFIX option get siteurl 2>/dev/null | tr -d '[:space:]')
HOME_URL=$($WP_CLI_PREFIX option get home 2>/dev/null | tr -d '[:space:]')
FORCE_SSL_ADMIN=$($WP_CLI_PREFIX config get FORCE_SSL_ADMIN 2>/dev/null | tr -d '[:space:]')

# Check scheme
if echo "$SITEURL" | grep -q "^http://"; then
  # Generate Warning finding: INFR-HTTPS-URL
  SITEURL_HTTPS=false
else
  SITEURL_HTTPS=true
fi

# FORCE_SSL_ADMIN: not defined, empty, or "false" are all equivalent to "not enforced"
if [ -z "$FORCE_SSL_ADMIN" ] || [ "$FORCE_SSL_ADMIN" = "false" ] || [ "$FORCE_SSL_ADMIN" = "0" ]; then
  SSL_ADMIN_FORCED=false
else
  SSL_ADMIN_FORCED=true
fi

# Part B: Code grep (always runs when LOCAL_PATH is set)
MIXED_CONTENT_HITS=$(grep -rn \
  --include="*.php" --include="*.js" \
  --exclude-dir=".git" --exclude-dir="node_modules" --exclude-dir="vendor" \
  "http://[a-zA-Z0-9][a-zA-Z0-9.-]*\." \
  "$LOCAL_PATH/" 2>/dev/null | \
  grep -v "^\s*[*/#]" | \
  grep -v "localhost\|127\.0\.0\." | \
  grep -v "example\.com\|example\.org\|php\.net\|wordpress\.org\|w3\.org" | \
  head -50)
MIXED_COUNT=$(echo "$MIXED_CONTENT_HITS" | grep -c "." 2>/dev/null || echo 0)
```

### Finding ID Convention

Based on existing skills, Phase 6 finding IDs follow the pattern `CATEGORY-SUBCATEGORY-CODE`:

```
# DB Health skills:
DBHL-AUTOLD-SZ   — autoload total size finding
DBHL-AUTOLD-OFF  — autoload offenders list (Info if healthy, Warning/Critical if over threshold)
DBHL-TRANS-EXP   — expired transient ratio
DBHL-TRANS-OK    — transients healthy (Info)
DBHL-REV-UNL     — WP_POST_REVISIONS unlimited
DBHL-REV-CNT     — revision count exceeds threshold
DBHL-REV-OK      — revisions healthy (Info)

# Infrastructure skills:
INFR-HTTPS-URL   — siteurl/home not HTTPS
INFR-HTTPS-SSL   — FORCE_SSL_ADMIN not set
INFR-HTTPS-MXD   — hardcoded http:// in code
INFR-HTTPS-OK    — HTTPS config healthy (Info)
INFR-PERM-CFG    — wp-config.php world-readable
INFR-PERM-HTA    — .htaccess over-permissioned
INFR-PERM-UPL    — uploads/ world-writable
INFR-PERM-DBG    — debug.log readable with WP_DEBUG on
INFR-PERM-SKP    — permissions check skipped (non-SSH)
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Direct MySQL queries with parsed credentials | `wp db query` via WP_CLI_PREFIX | No credential exposure; works across all source types |
| `wp transient list` for expired detection | Direct SQL on `_transient_timeout_%` with UNIX_TIMESTAMP() | Only reliable method; `--expired` flag does not exist |
| Hardcode `wp_` table prefix | `wp db prefix` then interpolate | Handles custom prefixes; required by DBHL-04 |
| SSH-only permission checks | SSH-only with explicit skip + explanatory finding for others | Honest about rsync normalization; doesn't mislead users |
| Single-gated skills | INFR-01 dual-gated (WP-CLI part + grep part) | Partial results better than skipping entirely for non-WP-CLI sources |

**Note on WordPress 6.6 autoload change:** WordPress 6.6 (2024) introduced automatic autoload prevention for options > 150KB (configurable via `wp_max_autoloaded_option_size` filter) and a Site Health check that flags when total autoload exceeds 800KB. The user decision to use the 900KB WP-CLI doctor threshold (not the 800KB core threshold) is aligned with the more established tooling threshold — this is fine and intentional.

## Open Questions

1. **Should `wp db prefix` failure fall back to `wp config get table_prefix` or abort?**
   - What we know: `wp db prefix` is the authoritative source; `wp config get table_prefix` is a fallback
   - What's unclear: Can `wp db prefix` ever fail when WP-CLI itself is working? (e.g., DB connection failure)
   - Recommendation: Try `wp db prefix` first; if empty, try `wp config get table_prefix`; if both fail, generate a Warning finding and skip the DB skill (can't query without prefix)

2. **How should the HTTPS skill appear in the capability summary for non-WP-CLI sources?**
   - What we know: Part B (code grep) always runs; Part A (WP-CLI config) requires WP-CLI
   - What's unclear: Should it show as `[x]` (available), `[~]` (partial), or something else?
   - Recommendation: Show as `[x] HTTPS audit (code scan)` with note "WP-CLI config checks also available when WP-CLI is accessible"

3. **What is the right revision recommendation number?**
   - What we know: User context says "e.g., 10 revisions per post"; best practices say 2-10
   - What's unclear: The exact number to recommend in the fix text
   - Recommendation: Use 10 as the recommended value — it's generous for editorial workflows and explicitly mentioned in the context

4. **What transient ratio thresholds trigger Warning vs Info?**
   - What we know: This is Claude's Discretion per CONTEXT.md
   - Recommendation: Warning when expired > 50% of live AND absolute count > 100; Info when expired > 25% of live AND absolute count > 50; otherwise healthy/Info. This avoids flagging sites with naturally high transient turnover but low absolute numbers.

## Sources

### Primary (HIGH confidence)

- **Existing codebase** (`commands/diagnose/COMMAND.md`) — WP_CLI_PREFIX pattern confirmed and verified in full; existing skill patterns for finding ID format, JSON output structure, error handling
- **Existing codebase** (`skills/diagnostic-config-security/SKILL.md`, `skills/diagnostic-version-audit/SKILL.md`) — confirmed finding ID format (`CATEGORY-SUB-CODE`), JSON output schema, severity levels
- **developer.wordpress.org/cli/commands/transient/list/** — confirmed `wp transient list` has NO `--expired` flag; verified available flags: `--search`, `--exclude`, `--network`, `--unserialize`, `--human-readable`, `--fields`, `--format`
- **developer.wordpress.org/cli/commands/db/prefix/** — confirmed `wp db prefix` returns active prefix "as defined by the database handler's interpretation of the current site"
- **developer.wordpress.org/cli/commands/post/list/** — confirmed `wp post list --post_type=revision --format=count` works
- **developer.wordpress.org/cli/commands/config/get/** — confirmed `wp config get WP_POST_REVISIONS` and `wp config get FORCE_SSL_ADMIN` work; returns empty/error if undefined

### Secondary (MEDIUM confidence)

- **guides.wp-bullet.com/using-wp-cli-doctor-command-to-fix-large-wp_options-autoload-data/** — WP-CLI doctor warns at 900KB autoload threshold (single warning level)
- **Search result summary from multiple sources** — WordPress 6.6 core Site Health check warns at 800KB; individual option auto-disable at 150KB; adjustable via `site_status_autoloaded_options_size_limit` filter
- **WordPress developer docs (Advanced Administration)** — file permission recommendations: wp-config.php 600-640 OK, 644+ Critical; directories 755 max; .htaccess 644
- **WordPress best practices (multiple 2024 sources)** — WP_POST_REVISIONS best practice: 2-10 revisions; revisions do NOT affect frontend performance (no longer a performance optimization reason to disable)

### Tertiary (LOW confidence)

- Plugin prefix-to-slug attribution table — derived from knowledge of common plugin option naming conventions; should be validated against actual plugin codebases if attribution accuracy is critical (it's best-effort for this use case)

## Metadata

**Confidence breakdown:**
- WP-CLI command syntax: HIGH — verified against official developer.wordpress.org docs
- Autoload thresholds: HIGH — two independent sources (WP-CLI doctor 900KB, WP core 800KB); user decision locked at 900KB
- File permission thresholds: HIGH — from WordPress Advanced Administration official docs
- Transient ratio thresholds: MEDIUM (Claude's Discretion) — reasonable values based on intent, not from official spec
- Attribution prefix table: LOW — knowledge-based approximation, not exhaustively verified
- Architecture patterns: HIGH — directly derived from existing codebase review

**Research date:** 2026-02-19
**Valid until:** 90 days (WP-CLI API is stable; WordPress permission recommendations are stable; thresholds are user-locked)
