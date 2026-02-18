---
name: diagnostic-db-autoload
description: Analyzes WordPress wp_options autoload bloat by measuring total autoloaded data size, listing all options above 10KB threshold sorted by size, and attributing each to known plugins via prefix matching. Uses dynamic table prefix via wp db prefix and routes all DB access through WP_CLI_PREFIX.
---

# Diagnostic: Autoload Bloat Analysis

You analyze the WordPress options table for autoload bloat — data loaded on every page request — and identify large autoloaded options with plugin attribution to help pinpoint which plugins are contributing to database performance overhead.

## Overview

WordPress stores site settings in the `wp_options` table. Options marked `autoload='yes'` are loaded into memory on every single page request, regardless of whether they are needed. This means:

- A site with 5MB of autoloaded options loads 5MB of data on every page view
- Large autoloaded options slow down every request, including admin pages and REST API calls
- Common culprits: Yoast SEO caches, Elementor CSS data, WooCommerce settings, transient data accidentally marked autoload

The WordPress community benchmark for healthy autoload size is under 900KB. WordPress 6.6 introduced a built-in Site Health warning at 800KB. Sites above 2MB typically experience measurable latency on every request.

## How It Works

### Prerequisites

Before running checks, you need:
- Site connection profile from `sites.json` (loaded by CoWork or /diagnose)
- `WP_CLI_PREFIX` set by the /diagnose command's Source-Type Routing section
- `WP_CLI_AVAILABLE=true` (this skill requires WP-CLI for all checks)

If `WP_CLI_AVAILABLE` is false, return a single Warning finding and stop.

### Step 1: Dynamic Table Prefix Retrieval

**Never hardcode `wp_`.** Always retrieve the prefix dynamically before running any queries:

```bash
# Primary method: wp db prefix (most authoritative — reflects active DB handler)
TABLE_PREFIX=$($WP_CLI_PREFIX db prefix 2>/dev/null | tr -d '[:space:]')

# Fallback: wp config get table_prefix
if [ -z "$TABLE_PREFIX" ]; then
  TABLE_PREFIX=$($WP_CLI_PREFIX config get table_prefix 2>/dev/null | tr -d '[:space:]')
fi

# If both fail, cannot proceed
if [ -z "$TABLE_PREFIX" ]; then
  echo '[{"id":"DBHL-AUTOLD-ERR","severity":"Warning","category":"Database Health","title":"Could not determine table prefix","summary":"The autoload analysis could not run because the database table prefix could not be retrieved.","detail":"Both wp db prefix and wp config get table_prefix returned empty results. This may indicate a database connection failure or WP-CLI misconfiguration.","location":"wp_options table","fix":"Verify that WP-CLI can connect to the database by running: wp db check. Check the site connection profile and ensure WP-CLI has valid database credentials."}]'
  exit 0
fi
```

**On WordPress Multisite:** `wp db prefix` returns the base network prefix. This skill checks the primary site's options table only. Subsite options are stored in `wp_N_options` tables and are outside the scope of this check.

### Check 1: Total Autoload Size

Measure the total bytes of all autoloaded option values in the options table:

```bash
AUTOLOAD_BYTES=$($WP_CLI_PREFIX db query \
  "SELECT COALESCE(SUM(LENGTH(option_value)), 0) FROM ${TABLE_PREFIX}options WHERE autoload='yes'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Validate result is numeric
if ! echo "$AUTOLOAD_BYTES" | grep -qE '^[0-9]+$'; then
  AUTOLOAD_BYTES=0
fi

# Convert to KB for display
AUTOLOAD_KB=$((AUTOLOAD_BYTES / 1024))
AUTOLOAD_MB=$(awk "BEGIN {printf \"%.2f\", $AUTOLOAD_BYTES / 1048576}")
```

**Note:** This query may take 5–30 seconds on sites with large databases (10,000+ options rows or large serialized values). Do not add a timeout that would kill a legitimate query.

**Severity Thresholds:**

| Threshold | Bytes | Severity | Rationale |
|-----------|-------|----------|-----------|
| Above 2MB | > 2,097,152 | Critical | Significant page-load overhead on every request |
| Above 900KB | > 921,600 | Warning | Matches WP-CLI doctor threshold; exceeds WP 6.6 Site Health warning |
| Below 900KB | ≤ 921,600 | Info | Healthy range |

```bash
if [ "$AUTOLOAD_BYTES" -gt 2097152 ]; then
  SEVERITY_SZ="Critical"
  THRESHOLD_MSG="exceeds the 2MB critical threshold"
elif [ "$AUTOLOAD_BYTES" -gt 921600 ]; then
  SEVERITY_SZ="Warning"
  THRESHOLD_MSG="exceeds the 900KB warning threshold"
else
  SEVERITY_SZ="Info"
  THRESHOLD_MSG="is within the healthy range (under 900KB)"
fi
```

**Finding ID:** `DBHL-AUTOLD-SZ`

**Example Finding (Warning):**
```json
{
  "id": "DBHL-AUTOLD-SZ",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Autoload data exceeds 900KB warning threshold",
  "summary": "Your WordPress database is loading more data than recommended on every page request, which can slow down your entire site.",
  "detail": "Total autoloaded options size: 1,340 KB (1.31 MB). This exceeds the 900KB warning threshold. WordPress loads all autoloaded options on every page request, including frontend pages, admin pages, and REST API calls. Sites above 900KB typically see measurable latency.",
  "location": "wp_options table (autoload='yes' rows)",
  "fix": "Review the autoload offenders list below to identify which options are contributing most. For Yoast SEO: regenerate the sitemap index. For Elementor: regenerate CSS files (Elementor > Tools > Regenerate Files). For transient data incorrectly marked as autoload: contact the plugin vendor. Consider the WP-CLI doctor check: wp doctor check autoload-options-size"
}
```

**Example Finding (Info — Healthy):**
```json
{
  "id": "DBHL-AUTOLD-SZ",
  "severity": "Info",
  "category": "Database Health",
  "title": "Autoload data size is healthy",
  "summary": "Your WordPress database autoload size is within the healthy range and should not be causing performance issues.",
  "detail": "Total autoloaded options size: 420 KB. This is below the 900KB warning threshold. No action required.",
  "location": "wp_options table (autoload='yes' rows)",
  "fix": "No action required. Monitor autoload size after installing new plugins."
}
```

### Check 2: Autoload Offenders List

Retrieve all autoloaded options above 10KB (10,240 bytes), sorted by size descending:

```bash
AUTOLOAD_OFFENDERS=$($WP_CLI_PREFIX db query \
  "SELECT option_name, LENGTH(option_value) as size_bytes FROM ${TABLE_PREFIX}options WHERE autoload='yes' AND LENGTH(option_value) > 10240 ORDER BY size_bytes DESC" \
  --skip-column-names 2>/dev/null)
```

**Plugin Attribution via Prefix Matching:**

For each option name returned, match against this prefix dictionary to identify the responsible plugin. Matching is prefix-first (longest specific prefix takes priority where prefixes overlap).

```bash
# Known plugin prefix → attribution mapping
# Applied inline after retrieving AUTOLOAD_OFFENDERS results
# Format: "prefix" → "Plugin Name"
declare -A PLUGIN_PREFIXES
PLUGIN_PREFIXES["wpseo_"]="Yoast SEO"
PLUGIN_PREFIXES["_transient_wpseo"]="Yoast SEO"
PLUGIN_PREFIXES["rank_math_"]="Rank Math SEO"
PLUGIN_PREFIXES["_rank_math"]="Rank Math SEO"
PLUGIN_PREFIXES["elementor_"]="Elementor"
PLUGIN_PREFIXES["_elementor"]="Elementor"
PLUGIN_PREFIXES["woocommerce_"]="WooCommerce"
PLUGIN_PREFIXES["_woocommerce"]="WooCommerce"
PLUGIN_PREFIXES["wpforms_"]="WPForms"
PLUGIN_PREFIXES["tribe_"]="The Events Calendar"
PLUGIN_PREFIXES["_tribe"]="The Events Calendar"
PLUGIN_PREFIXES["acf_"]="Advanced Custom Fields"
PLUGIN_PREFIXES["_acf"]="Advanced Custom Fields"
PLUGIN_PREFIXES["vc_"]="WPBakery"
PLUGIN_PREFIXES["_vc_"]="WPBakery"
PLUGIN_PREFIXES["gtm4wp_"]="GTM4WP"
PLUGIN_PREFIXES["litespeed_"]="LiteSpeed Cache"
PLUGIN_PREFIXES["_lscache"]="LiteSpeed Cache"
PLUGIN_PREFIXES["jetpack_"]="Jetpack"
PLUGIN_PREFIXES["_jetpack"]="Jetpack"
PLUGIN_PREFIXES["wordfence_"]="Wordfence"
PLUGIN_PREFIXES["wf"]="Wordfence"
PLUGIN_PREFIXES["updraftplus_"]="UpdraftPlus"
PLUGIN_PREFIXES["gravityforms"]="Gravity Forms"
PLUGIN_PREFIXES["gform_"]="Gravity Forms"
PLUGIN_PREFIXES["_gform"]="Gravity Forms"
PLUGIN_PREFIXES["wp_"]="WordPress Core"
PLUGIN_PREFIXES["active_plugins"]="WordPress Core"
PLUGIN_PREFIXES["siteurl"]="WordPress Core"
PLUGIN_PREFIXES["blogname"]="WordPress Core"
PLUGIN_PREFIXES["blogdescription"]="WordPress Core"
PLUGIN_PREFIXES["admin_email"]="WordPress Core"
PLUGIN_PREFIXES["cron"]="WordPress Core"
PLUGIN_PREFIXES["widget_"]="WordPress Core"
PLUGIN_PREFIXES["sidebars_widgets"]="WordPress Core"
PLUGIN_PREFIXES["theme_mods_"]="Active Theme"
PLUGIN_PREFIXES["stylesheet"]="WordPress Core"
PLUGIN_PREFIXES["template"]="WordPress Core"

# Attribution function: check each prefix in order, return first match
# If no match found: extract the prefix (first word segment) and label "Unknown (prefix_*)"
get_attribution() {
  local option_name="$1"
  local attribution=""

  for prefix in "${!PLUGIN_PREFIXES[@]}"; do
    if [[ "$option_name" == ${prefix}* ]]; then
      attribution="${PLUGIN_PREFIXES[$prefix]}"
      break
    fi
  done

  if [ -z "$attribution" ]; then
    # Extract first underscore-delimited segment as the unknown prefix
    local prefix_segment=$(echo "$option_name" | cut -d'_' -f1)
    attribution="Unknown (${prefix_segment}_*)"
  fi

  echo "$attribution"
}
```

**Output Format:**

Display as a flat list, sorted by size (largest first), with columns:
- Option Name
- Size (in KB)
- Attribution (plugin name or Unknown with prefix hint)

```
Option Name                              | Size     | Attribution
---------------------------------------- | -------- | -------------------
wpseo_indexed_post_types                 | 450 KB   | Yoast SEO
elementor_css_print_method               | 230 KB   | Elementor
woocommerce_product_data_store_cache     | 95 KB    | WooCommerce
my_custom_plugin_cache                   | 45 KB    | Unknown (my_*)
cron                                     | 22 KB    | WordPress Core
```

**Finding ID:** `DBHL-AUTOLD-OFF`

If no options exceed 10KB:
```json
{
  "id": "DBHL-AUTOLD-OFF",
  "severity": "Info",
  "category": "Database Health",
  "title": "No large autoloaded options found",
  "summary": "No individual autoloaded option exceeds the 10KB threshold — the autoload table is clean.",
  "detail": "All autoloaded options are under 10KB in size. No specific options are contributing disproportionately to autoload overhead.",
  "location": "wp_options table (autoload='yes' rows)",
  "fix": "No action required."
}
```

If offenders found (use this in addition to the size finding):
```json
{
  "id": "DBHL-AUTOLD-OFF",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Large autoloaded options found",
  "summary": "Several large options are being loaded on every page request. Reducing or removing these can improve site performance.",
  "detail": "Found {COUNT} autoloaded options above 10KB:\n\n{OFFENDERS_TABLE}\n\nThese options are loaded into memory on every page request. Large values — especially plugin caches, serialized data, and transient remnants — increase database query time and memory usage.",
  "location": "wp_options table (autoload='yes' rows > 10KB)",
  "fix": "Review each large option:\n- Yoast SEO: Go to SEO > Tools > Reset to remove stale caches.\n- Elementor: Go to Elementor > Tools > Regenerate Files and Data.\n- WooCommerce: Check for stale product cache data and clear using WooCommerce > Status > Tools > Clear transients.\n- Unknown options: Check if the generating plugin is still active. Inactive plugin data may be safe to delete manually via phpMyAdmin or wp option delete {option_name}.\n- For options incorrectly set to autoload: wp option update {option_name} --autoload=no"
}
```

## Output Format

Return findings as a JSON array. Every check produces exactly one finding — there are no silent failures. Each finding must include:

- `id` (string) — Deterministic ID: `DBHL-AUTOLD-SZ` for size, `DBHL-AUTOLD-OFF` for offenders
- `severity` (string) — `"Critical"`, `"Warning"`, or `"Info"` (no other values)
- `category` (string) — `"Database Health"`
- `title` (string) — Short descriptive title
- `summary` (string) — One non-technical sentence explaining the finding
- `detail` (string) — Technical detail with exact values, thresholds, and context
- `location` (string) — `"wp_options table (autoload='yes' rows)"`
- `fix` (string) — Specific remediation steps with WP-CLI commands where applicable

**Example Complete Output:**
```json
[
  {
    "id": "DBHL-AUTOLD-SZ",
    "severity": "Warning",
    "category": "Database Health",
    "title": "Autoload data exceeds 900KB warning threshold",
    "summary": "Your WordPress database is loading more data than recommended on every page request, which can slow down your entire site.",
    "detail": "Total autoloaded options size: 1,340 KB (1.31 MB). This exceeds the 900KB warning threshold (921,600 bytes). WordPress loads all autoloaded options on every page request.",
    "location": "wp_options table (autoload='yes' rows)",
    "fix": "Review autoload offenders list. Regenerate plugin caches for Yoast SEO, Elementor, and WooCommerce. Disable autoload for large stale options via: wp option update {option_name} --autoload=no"
  },
  {
    "id": "DBHL-AUTOLD-OFF",
    "severity": "Warning",
    "category": "Database Health",
    "title": "Large autoloaded options found",
    "summary": "Several large options are being loaded on every page request.",
    "detail": "Found 3 autoloaded options above 10KB:\n\nwpseo_indexed_post_types | 450 KB | Yoast SEO\nelementor_css | 230 KB | Elementor\ncustom_cache | 45 KB | Unknown (custom_*)",
    "location": "wp_options table (autoload='yes' rows > 10KB)",
    "fix": "For Yoast SEO: regenerate sitemap at SEO > Tools. For Elementor: regenerate CSS at Elementor > Tools > Regenerate Files."
  }
]
```

## Error Handling

### WP-CLI Not Available
```json
{
  "id": "DBHL-AUTOLD-SKIP",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Autoload analysis skipped — WP-CLI not available",
  "summary": "Autoload analysis requires WP-CLI to query the database and cannot run without it.",
  "detail": "WP_CLI_AVAILABLE is false for this source type. Autoload analysis uses wp db query commands which require WP-CLI. Git sources and sources without WP-CLI configured cannot run database queries.",
  "location": "wp_options table",
  "fix": "Install WP-CLI on the server (https://wp-cli.org) or connect via SSH or Docker source type with WP-CLI available to enable this check."
}
```

### Query Failure
If a `wp db query` command returns non-zero exit or empty output unexpectedly, report it:
```json
{
  "id": "DBHL-AUTOLD-ERR",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Autoload query failed",
  "summary": "The database query for autoload analysis returned an error.",
  "detail": "The SELECT query on {TABLE_PREFIX}options returned an error or empty result. This may indicate a database connection issue, missing table, or insufficient permissions. Error output: {ERROR_TEXT}",
  "location": "wp_options table",
  "fix": "Verify database connectivity with: wp db check. Verify the options table exists with: wp db tables. Check that the WP-CLI database user has SELECT permission on the options table."
}
```

## Performance Considerations

- **Query duration:** The `SUM(LENGTH(option_value))` aggregate scan may take 5–30 seconds on large databases. This is expected behavior — do not cancel or retry.
- **Offenders query:** The `LENGTH(option_value) > 10240` filter in the offenders query limits the result set significantly compared to scanning all options.
- **Multisite note:** On WordPress Multisite, this check covers the primary site's options table only. Subsite options (in `wp_N_options` tables) are not included. This is a known scope limitation, not a bug.

## Success Criteria

Autoload bloat analysis is complete when:
- Table prefix retrieved dynamically via `$WP_CLI_PREFIX db prefix`
- Total autoloaded size measured and severity assigned (Critical/Warning/Info)
- All options above 10KB retrieved and attributed to known plugins
- Two findings produced: `DBHL-AUTOLD-SZ` and `DBHL-AUTOLD-OFF`
- All findings returned in structured JSON format
- No hardcoded `wp_` table prefix used anywhere in execution
