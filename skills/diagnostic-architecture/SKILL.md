---
name: diagnostic-architecture
description: Reviews WordPress architecture for CPT misuse patterns (dead CPTs, data-store abuse via row count gating), hook abuse (excessive callbacks, expensive init hooks, priority conflicts), and caching anti-patterns (missing persistent object cache, permanent transients). CPT checks require WP-CLI; hook and cache checks are static analysis on synced files. Each section self-gates independently.
---

# Diagnostic Skill: Architecture Review

You analyze a WordPress site's architecture for slow-burn structural problems that compound over time: custom post types used incorrectly, hooks overloaded with too many callbacks, and caching patterns that bypass available caching infrastructure.

## Why Architecture Issues Matter

Architecture issues are slow-burn problems — individually small, collectively severe:

1. **CPT misuse** — A CPT used as a data store with 50,000 rows breaks pagination, export tools, and WordPress admin. A dead CPT (registered but never used) consumes memory on every request as WordPress bootstraps its registration, labels, and admin columns regardless.
2. **Hook abuse** — Fifty callbacks on 'init' delay every page load. Expensive operations (database queries, HTTP requests) registered on early hooks run before the first line of template code executes.
3. **Missing object cache** — Without a persistent object cache, every repeat lookup hits MySQL. On a site with 100 concurrent users, this means 100 identical SELECT queries instead of 1 cache hit.
4. **Permanent transients** — Using `set_transient()` with 0 expiry treats the transient as permanent storage, polluting the options table with data that should be in a custom DB table or autoloaded option.

This skill surfaces these patterns early, before they become expensive refactors.

## Independent Gating Architecture

This skill has three independently-gated sections:

- **Part A (CPT misuse):** Requires `WP_CLI_AVAILABLE=true`. If unavailable, emits one Info skip finding and continues to Part B.
- **Part B (hook abuse):** Always runs — pure static grep on synced PHP files. No WP-CLI required.
- **Part C (caching anti-patterns):** Mixed — uses WP-CLI for cache type detection if available, falls back to file check. grep for code patterns always runs.

This skill is NOT in the `WP_CLI_SKILLS` array — it manages its own gating internally because Parts B and C run independently of WP-CLI availability.

## Connection Setup

```bash
SITE_NAME="${1:-default-site}"
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)

HOST=$(echo "$PROFILE" | jq -r '.host // empty')
USER=$(echo "$PROFILE" | jq -r '.user // empty')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path // empty')
LOCAL_PATH=$(echo "$PROFILE" | jq -r '.local_path // empty')
SOURCE_TYPE=$(echo "$PROFILE" | jq -r '.source_type // "ssh"')
WP_CLI_AVAILABLE=$(echo "$PROFILE" | jq -r '.wp_cli_available // "false"')
WP_CLI_PREFIX=$(echo "$PROFILE" | jq -r '.wp_cli_prefix // empty')

THEME_DIR="${LOCAL_PATH}/wp-content/themes"
PLUGIN_DIR="${LOCAL_PATH}/wp-content/plugins"
```

## WP.org Plugin Skip List

Apply to PLUGIN_DIR subdirectory names before any grep-based checks. These plugins are from the WordPress.org repository — users cannot fix third-party code and their patterns are known-safe.

```bash
# Well-known WP.org plugin directories to exclude from analysis
WELL_KNOWN_PLUGINS=(
  "woocommerce"
  "yoast-seo"
  "wordpress-seo"
  "contact-form-7"
  "elementor"
  "elementor-pro"
  "wpforms-lite"
  "wpforms"
  "jetpack"
  "wordfence"
  "really-simple-ssl"
  "updraftplus"
  "wp-super-cache"
  "w3-total-cache"
  "litespeed-cache"
  "rankmath"
  "rank-math-seo"
  "akismet"
  "gravityforms"
  "the-events-calendar"
  "advanced-custom-fields"
  "acf"
  "redirection"
  "wp-rocket"
  "autoptimize"
  "woocommerce-subscriptions"
  "woocommerce-memberships"
  "all-in-one-seo-pack"
  "wp-smushit"
  "shortpixel-image-optimiser"
  "wc-vendors"
  "give"
  "give-recurring"
  "ninja-forms"
)

# Build exclusion flags for grep
GREP_EXCLUDES=""
for plugin in "${WELL_KNOWN_PLUGINS[@]}"; do
  GREP_EXCLUDES="$GREP_EXCLUDES --exclude-dir=${plugin}"
done
```

Note how many plugin directories were skipped in findings' `detail` fields for transparency.

---

## Part A: CPT Misuse Detection (requires WP-CLI)

### Self-Gate

If WP-CLI is unavailable, emit one Info finding and skip Part A entirely (Parts B and C still run):

```bash
if [ "$WP_CLI_AVAILABLE" != "true" ]; then
  # Emit CPT skip finding, then continue to Part B
  CPT_SKIP_FINDING='{
    "id": "ARCH-CPT-SKIP",
    "severity": "Info",
    "category": "Architecture",
    "title": "CPT analysis skipped — WP-CLI not available",
    "summary": "CPT row count analysis requires WP-CLI to query the database and cannot run for this source type.",
    "detail": "WP_CLI_AVAILABLE is false for this source type. CPT misuse detection uses wp post-type list and wp post list --format=count commands which require WP-CLI. Git sources and sources without WP-CLI configured cannot run database queries. Static hook abuse and caching anti-pattern checks will still run.",
    "location": "wp post-type list",
    "fix": "Connect via SSH or Docker source type with WP-CLI available to enable CPT row count analysis."
  }'
  # Append CPT_SKIP_FINDING to FINDINGS array and continue to Part B
fi
```

### Step A1: Get All Registered Custom Post Types

Retrieve all non-builtin (custom) post types registered in WordPress:

```bash
CPT_JSON=$($WP_CLI_PREFIX post-type list \
  --fields=name,label,_builtin \
  --format=json 2>/dev/null)

# Filter to non-builtin CPTs only
# Note: _builtin may be boolean false OR string "false" depending on WP-CLI version — handle both
CPT_LIST=$(echo "$CPT_JSON" | jq '[.[] | select(._builtin == false or ._builtin == "false")]')

CPT_COUNT=$(echo "$CPT_LIST" | jq 'length')
```

### Step A2: For Each Custom CPT, Check Row Count and Custom-Code Registration

For each CPT in the list, perform two checks before flagging:

**Check 1 — Is this CPT registered in custom code?**

Only flag CPTs registered in custom theme or plugin code. Third-party CPTs (from WP.org plugins) are out of scope.

```bash
# Extract CPT names from JSON
CPT_NAMES=$(echo "$CPT_LIST" | jq -r '.[].name')

for CPT_NAME in $CPT_NAMES; do
  # Check if this CPT is registered in custom code
  CPT_REGISTRATION=$(grep -rn "register_post_type\s*(\s*['\"]${CPT_NAME}['\"]" \
    "$THEME_DIR" "$PLUGIN_DIR" \
    --include="*.php" \
    $GREP_EXCLUDES \
    2>/dev/null | head -1)

  # If not found in custom code — skip (third-party CPT, not our scope)
  if [ -z "$CPT_REGISTRATION" ]; then
    continue
  fi

  # Extract file and line for finding location
  CPT_FILE=$(echo "$CPT_REGISTRATION" | cut -d: -f1 | sed "s|$LOCAL_PATH/||")
  CPT_LINE=$(echo "$CPT_REGISTRATION" | cut -d: -f2)

  # Get row count via WP-CLI
  POST_COUNT=$($WP_CLI_PREFIX post list \
    --post_type="$CPT_NAME" \
    --post_status=any \
    --format=count 2>/dev/null | tr -d '[:space:]')

  # Default to 0 if count retrieval failed
  if ! echo "$POST_COUNT" | grep -qE '^[0-9]+$'; then
    POST_COUNT=0
  fi

  # Get published count separately for dead CPT check
  PUBLISHED_COUNT=$($WP_CLI_PREFIX post list \
    --post_type="$CPT_NAME" \
    --post_status=publish \
    --format=count 2>/dev/null | tr -d '[:space:]')

  if ! echo "$PUBLISHED_COUNT" | grep -qE '^[0-9]+$'; then
    PUBLISHED_COUNT=0
  fi

  # Generate finding ID: ARCH-CPT- + first 6 chars of MD5 of CPT name
  CPT_HASH=$(echo -n "$CPT_NAME" | md5sum | cut -c1-6 2>/dev/null || echo -n "$CPT_NAME" | md5 | cut -c1-6)
  FINDING_ID="ARCH-CPT-${CPT_HASH}"

  # Evaluate thresholds and emit findings
  # (See thresholds section below)
done
```

### CPT Misuse Thresholds

Apply thresholds in order (first match wins per CPT):

**Dead CPT (0 published posts, any status also 0) — Warning:**
```json
{
  "id": "ARCH-CPT-a3f2b1",
  "severity": "Warning",
  "category": "Architecture",
  "title": "Dead CPT: 'event_log' has 0 posts",
  "summary": "A custom post type is registered but has never been used and may be orphaned code.",
  "detail": "Post type 'event_log' is registered at: themes/mytheme/includes/cpts.php:45\nPublished post count: 0 (any status: 0)\nThis CPT appears unused. Dead CPTs consume memory on every request as WordPress loads their registration, admin labels, and admin column definitions regardless of whether any posts exist.",
  "location": "themes/mytheme/includes/cpts.php:45",
  "fix": "If this CPT is no longer needed, remove the register_post_type() call and any associated meta boxes, admin columns, or capability registrations. If it is in active development, add at least one draft post to confirm it is working. If it belongs to a deactivated plugin, the registration code should have been removed when the plugin was deactivated."
}
```

**Very few posts (1–5 published) — Info:**
```json
{
  "id": "ARCH-CPT-c1d2e3",
  "severity": "Info",
  "category": "Architecture",
  "title": "CPT 'staff_member' has very few posts (3 published)",
  "summary": "A custom post type has very few published entries, which may indicate it is orphaned or was recently added.",
  "detail": "Post type 'staff_member' is registered at: plugins/my-theme-plugin/cpts.php:88\nPublished post count: 3\nThis CPT may be intentional (new or infrequently-used content type) or may be orphaned. No action required if content count is expected.",
  "location": "plugins/my-theme-plugin/cpts.php:88",
  "fix": "No action required if this CPT is in active use. If the CPT is no longer needed, remove the registration code."
}
```

**Excessive rows — potential data-store misuse (>10,000 posts) — Warning:**
```json
{
  "id": "ARCH-CPT-b7c4d2",
  "severity": "Warning",
  "category": "Architecture",
  "title": "CPT 'api_log' has 14,523 posts — possible data-store misuse",
  "summary": "A custom post type has an unusually high row count, suggesting it may be used as a data store rather than as content.",
  "detail": "Post type 'api_log' is registered at: plugins/my-plugin/includes/logging.php:23\nPost count (any status): 14,523\nThe WordPress posts table is optimized for content (pages, posts, products) — not high-volume logging or data storage. Using CPTs for logging or transactional data causes wp_posts table bloat, degrades query performance across the entire site, and breaks standard WordPress pagination and export tools. CPTs with >10,000 entries are frequently seen in sites using them as event logs, API response caches, or form submission archives.",
  "location": "plugins/my-plugin/includes/logging.php:23",
  "fix": "If this CPT is storing logs, events, or transactional data rather than content: migrate to a custom database table using $wpdb->query() with CREATE TABLE and dbDelta(). The wp_posts table lacks the indexes needed for efficient high-volume data queries. If the high count is expected (e.g., a large product catalog), verify that appropriate database indexes exist and that pagination is handled via WP_Query with sensible posts_per_page limits."
}
```

**Healthy CPT (6–10,000 posts) — No finding emitted.** Do not generate findings for CPTs with reasonable post counts.

---

## Part B: Hook Abuse Detection (static grep — always runs)

This section always runs regardless of WP-CLI availability. All checks are static analysis on synced PHP files.

### B1: Count Callbacks Per Hook

Count the number of `add_action` and `add_filter` registrations per hook name across all custom code. Flag hooks with excessive callback counts.

```bash
# Extract all hook names from add_action/add_filter calls in custom code
HOOK_COUNTS=$(grep -rh "add_action\|add_filter" \
  "$THEME_DIR" "$PLUGIN_DIR" \
  --include="*.php" \
  $GREP_EXCLUDES \
  2>/dev/null | \
  grep -oP "(?<=add_action\s*\(\s*['\"])[^'\"]+|(?<=add_filter\s*\(\s*['\"])[^'\"]+" | \
  sort | uniq -c | sort -rn)

# Process results: flag hooks with >=20 callbacks as Warning, 10-19 as Info
while IFS= read -r line; do
  COUNT=$(echo "$line" | awk '{print $1}')
  HOOK=$(echo "$line" | awk '{print $2}')

  if [ "$COUNT" -ge 20 ]; then
    SEVERITY="Warning"
  elif [ "$COUNT" -ge 10 ]; then
    SEVERITY="Info"
  else
    continue  # Under threshold — skip
  fi

  # Generate finding ID from hook name hash
  HOOK_HASH=$(echo -n "$HOOK" | md5sum | cut -c1-6 2>/dev/null || echo -n "$HOOK" | md5 | cut -c1-6)
  FINDING_ID="ARCH-HOOK-${HOOK_HASH}"

  # Emit finding (see example below)
done <<< "$HOOK_COUNTS"
```

**Example finding (excessive callbacks):**
```json
{
  "id": "ARCH-HOOK-f3a8c2",
  "severity": "Warning",
  "category": "Architecture",
  "title": "Hook 'init' has 27 callbacks registered from custom code",
  "summary": "A WordPress hook has an unusually high number of registered callbacks, which may indicate architectural fragmentation or callback accumulation across many plugins.",
  "detail": "Hook 'init' has 27 add_action/add_filter registrations across custom themes and plugins. While WordPress itself registers callbacks on common hooks, excessive custom callbacks on early hooks like 'init' and 'wp_loaded' mean more code runs before the first template renders. Each callback adds overhead to every page load. Common causes: feature flags registered individually instead of using a single init handler, multiple plugins duplicating initialization logic, or accumulated technical debt from incremental feature additions.\n\nNote: 10 well-known WP.org plugin directories were excluded from this count.",
  "location": "wp-content/themes/, wp-content/plugins/ (custom code only)",
  "fix": "Audit add_action/add_filter registrations for this hook in custom code. Consider consolidating related initialization logic into fewer, well-organized callback functions. If multiple plugins each register >3 callbacks on 'init', evaluate whether a shared initialization service or plugin coordination layer would reduce redundancy."
}
```

### B2: Expensive Operations on 'init' or 'wp_loaded'

Detect callbacks registered on early hooks that perform expensive operations (database queries, HTTP calls). These operations run on every page load before any template output.

```bash
# Find add_action on 'init' in custom code, read context after each match
INIT_HOOKS=$(grep -rn "add_action\s*(\s*['\"]init['\"]" \
  "$THEME_DIR" "$PLUGIN_DIR" \
  --include="*.php" \
  $GREP_EXCLUDES \
  -A 3 2>/dev/null)

WP_LOADED_HOOKS=$(grep -rn "add_action\s*(\s*['\"]wp_loaded['\"]" \
  "$THEME_DIR" "$PLUGIN_DIR" \
  --include="*.php" \
  $GREP_EXCLUDES \
  -A 3 2>/dev/null)
```

**AI analysis:** For each `add_action('init', ...)` or `add_action('wp_loaded', ...)` match, read the callback function body (up to 15 lines). Flag as Warning if the callback body contains any of:

- `new WP_Query` — direct query on every page load
- `$wpdb->query` or `$wpdb->get_results` or `$wpdb->get_row` — raw DB access on init
- `wp_remote_get` or `wp_remote_post` — outgoing HTTP request on every page load
- `file_get_contents` or `curl_exec` — file/network I/O on early hook
- `get_posts(` — underlying WP_Query call with potential to return many rows

**Example finding (expensive init hook):**
```json
{
  "id": "ARCH-HOOK-INIT-d9f1a3",
  "severity": "Warning",
  "category": "Architecture",
  "title": "Expensive DB query registered on 'init' hook",
  "summary": "A database query runs on every single page load because it is hooked to 'init', which fires before any template or caching layer can prevent it.",
  "detail": "File: plugins/my-plugin/includes/setup.php:67\nFunction: my_plugin_load_settings() is registered on 'init' and contains:\n\n    $results = $wpdb->get_results(\"SELECT * FROM {$wpdb->prefix}my_settings\");\n\nThis query runs on every page request (frontend, admin, AJAX, REST API, cron) because 'init' fires unconditionally. Even cached pages trigger 'init'. The fix is to cache this result using a transient or wp_cache_get/wp_cache_set pattern.",
  "location": "plugins/my-plugin/includes/setup.php:67",
  "fix": "Wrap the expensive call in a transient cache:\n\n    function my_plugin_load_settings() {\n        $settings = get_transient('my_plugin_settings');\n        if (false === $settings) {\n            $settings = $wpdb->get_results(\"SELECT * FROM {$wpdb->prefix}my_settings\");\n            set_transient('my_plugin_settings', $settings, HOUR_IN_SECONDS);\n        }\n        return $settings;\n    }\n\nAlternatively, consider whether this data is better stored as a single autoloaded option (wp_options) rather than a custom table."
}
```

### B3: Same Hook+Priority from Multiple Plugin Files

Detect cases where the same hook name and priority value are registered from multiple different plugin or theme files. This creates execution-order fragility — hook execution order within the same priority is undefined in WordPress.

```bash
# Extract hook name and priority pairs with source file
HOOK_PRIORITY_MAP=$(grep -rn "add_action\|add_filter" \
  "$THEME_DIR" "$PLUGIN_DIR" \
  --include="*.php" \
  $GREP_EXCLUDES \
  2>/dev/null | \
  grep -oP ".+\.php:\d+:.*(?:add_action|add_filter)\s*\(\s*['\"][^'\"]+['\"],\s*[^,]+,\s*\d+")

# Group by hook+priority combination, flag those appearing from >1 distinct plugin directory
# AI reads the grep output and identifies:
# - The hook name (first string argument)
# - The priority (third numeric argument)
# - The source file (path before the colon)
# - Whether the source files are from different plugin/theme directories
```

AI identifies same hook+priority pairs that appear in more than one distinct plugin or theme directory. One occurrence per plugin-per-hook is normal; the same hook+priority from two different plugins in different directories is a potential conflict.

**Example finding (priority conflict):**
```json
{
  "id": "ARCH-HOOK-PRI-e4b7c1",
  "severity": "Warning",
  "category": "Architecture",
  "title": "Hook 'save_post' priority 10 registered from two different plugins",
  "summary": "Two separate plugins register callbacks on the same hook at the same priority, making their relative execution order undefined and potentially causing save conflicts.",
  "detail": "Hook 'save_post' at priority 10 is registered from:\n  1. plugins/plugin-a/includes/post-handler.php:34 — callback: plugin_a_save_handler()\n  2. plugins/plugin-b/includes/meta-handler.php:78 — callback: plugin_b_save_meta()\n\nWithin the same hook+priority, WordPress executes callbacks in registration order, which depends on plugin load order (alphabetical by default, but overridable). If plugin-a's save handler depends on data that plugin-b's meta handler writes, execution order matters and is fragile. Common symptoms: intermittent save conflicts, meta data missing after save, or features that break when plugin activation order changes.",
  "location": "plugins/plugin-a/includes/post-handler.php:34, plugins/plugin-b/includes/meta-handler.php:78",
  "fix": "Assign distinct priorities to the two callbacks to make execution order explicit. If plugin-a must run after plugin-b's meta is saved, change plugin-a's registration to priority 20:\n\n    add_action('save_post', 'plugin_a_save_handler', 20);\n\nDocument the dependency in a code comment."
}
```

### B Clean Finding

If no hook abuse detected across all three checks (B1, B2, B3):

```json
{
  "id": "ARCH-HOOK-OK",
  "severity": "Info",
  "category": "Architecture",
  "title": "Hook registration patterns are healthy",
  "summary": "No excessive callbacks, expensive init hooks, or priority conflicts detected in custom code.",
  "detail": "Analyzed add_action/add_filter calls in custom themes and plugins. All hooks have reasonable callback counts, no expensive operations detected on early hooks ('init', 'wp_loaded'), and no same-hook+priority conflicts found across plugin directories. Well-known WP.org plugin directories were excluded from analysis.",
  "location": "wp-content/themes/, wp-content/plugins/ (custom code only)",
  "fix": "No action required."
}
```

---

## Part C: Caching Anti-Patterns (mixed: WP-CLI for cache type, grep for code patterns)

### C1: Persistent Object Cache Check

Detect whether a persistent object cache backend is configured. Without one, WordPress object cache is in-memory only (per-request) and provides no cross-request caching benefit.

```bash
if [ "$WP_CLI_AVAILABLE" == "true" ]; then
  # Primary method: WP-CLI cache type command
  CACHE_TYPE=$($WP_CLI_PREFIX cache type 2>/dev/null | tr -d '[:space:]')
  # Returns "Default" if no persistent cache, or "Redis", "Memcached", "APCu", etc.
else
  # Fallback: check for object-cache.php drop-in file
  if [ -f "${LOCAL_PATH}/wp-content/object-cache.php" ]; then
    CACHE_TYPE="drop-in"
  else
    CACHE_TYPE="Default"
  fi
fi
```

**If CACHE_TYPE is "Default" (or drop-in not present):** Emit Info finding `ARCH-CACHE-OBJ`.

```json
{
  "id": "ARCH-CACHE-OBJ",
  "severity": "Info",
  "category": "Architecture",
  "title": "No persistent object cache configured",
  "summary": "WordPress is using its default in-memory object cache, which does not persist between page requests and provides no cross-request caching benefit.",
  "detail": "Cache type: Default (in-memory only)\nThe WordPress object cache (wp_cache_get/wp_cache_set) is backed by a PHP array by default. This means every cache set during one request is invisible to all other concurrent requests, and is discarded when the request ends. Sites that use get_transient() or wp_cache_get() expecting cross-request caching benefits will not get them without a persistent backend.\n\nA persistent object cache (Redis or Memcached) ensures that expensive operations (complex WP_Query results, external API responses, aggregated data) are cached across requests and processes. Without it, the same expensive query may run thousands of times per hour on a busy site.\n\nNote: This is an Info-level finding because many sites operate acceptably without a persistent cache — it depends on traffic volume and query complexity.",
  "location": "wp-content/object-cache.php (not present)",
  "fix": "Install a persistent object cache drop-in. The most common options:\n\n1. Redis: Install the Redis Object Cache plugin (redis-cache on WP.org) and configure a Redis server. The plugin adds wp-content/object-cache.php automatically.\n2. Memcached: Install W3 Total Cache or WP Super Cache with Memcached backend.\n3. Verify after installation: wp cache type should return 'Redis' or 'Memcached' instead of 'Default'.\n\nFor shared hosting without Redis/Memcached: consider APCu if the host supports it."
}
```

**If CACHE_TYPE is not "Default":** No ARCH-CACHE-OBJ finding emitted. Note the active cache backend in the analysis log.

### C2: Permanent Transient Misuse

`set_transient()` with expiry `0` creates a permanent transient — data that never expires and accumulates indefinitely in the options table. This is a misuse of the Transients API. Permanent data should use `add_option()` with `autoload=no` or a custom table.

```bash
# Find set_transient calls where the expiry argument is 0 (permanent storage)
PERM_TRANSIENTS=$(grep -rn "set_transient\s*(" \
  "$THEME_DIR" "$PLUGIN_DIR" \
  --include="*.php" \
  $GREP_EXCLUDES \
  -A 2 2>/dev/null | \
  grep -E "set_transient\s*\([^,]+,[^,]+,\s*0\s*\)")
```

**For each match:** Emit Warning finding `ARCH-CACHE-PERM-{hash}`.

```json
{
  "id": "ARCH-CACHE-PERM-f2a9d1",
  "severity": "Warning",
  "category": "Architecture",
  "title": "Permanent transient (0 expiry) in plugins/my-plugin/cache.php:112",
  "summary": "A transient is being stored with no expiration date, turning a temporary cache into permanent storage and polluting the options table.",
  "detail": "File: plugins/my-plugin/cache.php:112\nCode: set_transient('my_api_result', $data, 0)\n\nPassing 0 as the expiry to set_transient() creates a transient that never expires. WordPress stores transients in the wp_options table. Permanent transients accumulate over time: each unique key generates a row that is never cleaned up by WordPress's transient garbage collector. On sites where transient keys include dynamic values (user IDs, post IDs, query parameters), this can create thousands of rows.\n\nUnintended consequences: (1) wp_options table bloat reduces autoload performance, (2) wp-cli transient delete --all does not remove non-expired transients, (3) object cache backends may not store permanent transients, creating inconsistent behavior between environments.",
  "location": "plugins/my-plugin/cache.php:112",
  "fix": "If the data should persist indefinitely (configuration, API credentials, computed values that change rarely):\n    add_option('my_plugin_api_result', $data, '', 'no');  // autoload=no\n    // OR\n    update_option('my_plugin_api_result', $data, false);  // false = don't autoload\n\nIf the data is a cache that should expire, set an appropriate expiry:\n    set_transient('my_api_result', $data, DAY_IN_SECONDS);\n\nThe rule of thumb: if it needs to survive until explicitly changed, use options. If it can be regenerated when missing, use transients with an expiry."
}
```

### C3: Uncached Direct DB Queries (Heuristic)

Detect `$wpdb->get_results` and `$wpdb->get_row` calls in theme and plugin files that are not wrapped in a transient or object cache check. These may benefit from caching on high-traffic pages.

```bash
# Find direct wpdb calls in custom code
WPDB_CALLS=$(grep -rn "\$wpdb->get_results\|\$wpdb->get_row" \
  "$THEME_DIR" "$PLUGIN_DIR" \
  --include="*.php" \
  $GREP_EXCLUDES \
  -B 5 -A 5 2>/dev/null)
```

**AI analysis:** For each `$wpdb->get_results` or `$wpdb->get_row` match, read 5 lines before and after. Flag as Info only if:
- The surrounding context does NOT contain `get_transient`, `set_transient`, `wp_cache_get`, or `wp_cache_set`
- The file is a frontend context (functions.php, a template file, or a function likely called on every request — not an admin-only handler or REST endpoint)

This is a heuristic — some uncached DB queries are intentional (admin-only, low-traffic, or already cached at a higher level). Severity is Info, not Warning.

**Example finding (uncached DB query):**
```json
{
  "id": "ARCH-CACHE-DB-c3e8f2",
  "severity": "Info",
  "category": "Architecture",
  "title": "Uncached DB query in themes/mytheme/functions.php:245",
  "summary": "A database query in theme code appears to run on every page load without caching, which may be a performance opportunity on high-traffic pages.",
  "detail": "File: themes/mytheme/functions.php:245\nCode: $results = $wpdb->get_results(\"SELECT * FROM {$wpdb->prefix}event_sessions WHERE active=1\");\n\nNo get_transient() or wp_cache_get() call found within 5 lines. If this query runs on every frontend page load and the underlying data changes infrequently, wrapping it in a transient would reduce DB load.\n\nNote: This is a heuristic finding. If this query runs only in admin contexts, or if the data changes too frequently for caching to be useful, no action is needed.",
  "location": "themes/mytheme/functions.php:245",
  "fix": "Wrap the query in a transient:\n\n    $cache_key = 'mytheme_active_sessions';\n    $results = get_transient($cache_key);\n    if (false === $results) {\n        $results = $wpdb->get_results(\"SELECT * FROM {$wpdb->prefix}event_sessions WHERE active=1\");\n        set_transient($cache_key, $results, 5 * MINUTE_IN_SECONDS);\n    }\n\nAdjust the expiry to match how frequently the underlying data changes."
}
```

---

## Finding IDs Reference

| ID | Severity | Trigger |
|----|----------|---------|
| ARCH-CPT-SKIP | Info | CPT analysis skipped — WP-CLI not available |
| ARCH-CPT-{hash} | Warning | Dead CPT (0 posts) registered in custom code |
| ARCH-CPT-{hash} | Info | CPT with very few posts (1–5) |
| ARCH-CPT-{hash} | Warning | CPT with >10,000 posts — possible data-store misuse |
| ARCH-HOOK-{hash} | Warning | Hook with ≥20 callbacks from custom code |
| ARCH-HOOK-{hash} | Info | Hook with 10–19 callbacks from custom code |
| ARCH-HOOK-INIT-{hash} | Warning | Expensive operation (DB/HTTP) on 'init' or 'wp_loaded' |
| ARCH-HOOK-PRI-{hash} | Warning | Same hook+priority from multiple plugin directories |
| ARCH-HOOK-OK | Info | All hook checks pass — no abuse detected |
| ARCH-CACHE-OBJ | Info | No persistent object cache configured |
| ARCH-CACHE-PERM-{hash} | Warning | set_transient() with 0 expiry (permanent storage misuse) |
| ARCH-CACHE-DB-{hash} | Info | Uncached $wpdb->get_results in frontend context (heuristic) |

**Hash generation:** MD5 of the primary identifier (CPT name, hook name, or `{file}:{line}`), truncated to 6 characters.

## Output Format

Return all findings as a JSON array. Parts B and C always run. Part A runs only when WP-CLI is available.

**Example output (WP-CLI available, one dead CPT, hook abuse, no cache):**
```json
[
  {
    "id": "ARCH-CPT-a3f2b1",
    "severity": "Warning",
    "category": "Architecture",
    "title": "Dead CPT: 'event_log' has 0 posts",
    "summary": "A custom post type is registered but has never been used and may be orphaned code.",
    "detail": "Post type 'event_log' is registered at: themes/mytheme/includes/cpts.php:45\nPublished post count: 0 (any status: 0)\nThis CPT appears unused.",
    "location": "themes/mytheme/includes/cpts.php:45",
    "fix": "Remove the register_post_type() call if this CPT is no longer needed."
  },
  {
    "id": "ARCH-HOOK-OK",
    "severity": "Info",
    "category": "Architecture",
    "title": "Hook registration patterns are healthy",
    "summary": "No excessive callbacks, expensive init hooks, or priority conflicts detected in custom code.",
    "detail": "Analyzed add_action/add_filter calls in custom themes and plugins. All checks passed.",
    "location": "wp-content/themes/, wp-content/plugins/ (custom code only)",
    "fix": "No action required."
  },
  {
    "id": "ARCH-CACHE-OBJ",
    "severity": "Info",
    "category": "Architecture",
    "title": "No persistent object cache configured",
    "summary": "WordPress is using its default in-memory object cache, which does not persist between page requests.",
    "detail": "Cache type: Default. Consider installing Redis or Memcached for cross-request caching.",
    "location": "wp-content/object-cache.php (not present)",
    "fix": "Install a Redis or Memcached object cache drop-in."
  }
]
```

**Example output (WP-CLI not available):**
```json
[
  {
    "id": "ARCH-CPT-SKIP",
    "severity": "Info",
    "category": "Architecture",
    "title": "CPT analysis skipped — WP-CLI not available",
    "summary": "CPT row count analysis requires WP-CLI and cannot run for this source type.",
    "detail": "Static hook abuse and caching anti-pattern checks will still run.",
    "location": "wp post-type list",
    "fix": "Connect via SSH or Docker source type with WP-CLI available to enable CPT row count analysis."
  }
  // ... hook and cache findings follow ...
]
```

## Notes

- This skill self-gates — do NOT add it to the `WP_CLI_SKILLS` array in /diagnose or /investigate. It manages its own partial-results behavior internally.
- CPT analysis only flags CPTs registered in custom code — third-party plugin CPTs (from WP.org plugin directories) are excluded.
- Hook abuse analysis uses the same WP.org plugin skip list to exclude well-known plugins. Note the count of skipped directories in finding detail fields.
- The C3 uncached DB query check is a heuristic — Info severity only. Do not flag admin-only handlers or REST endpoints as caching opportunities without reading context.
- When WP-CLI is unavailable, the object cache check falls back to checking for `wp-content/object-cache.php` existence — this is less authoritative than `wp cache type` but provides a reasonable signal.
- Category field for all findings: `"Architecture"`
