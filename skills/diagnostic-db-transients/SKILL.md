---
name: diagnostic-db-transients
description: Detects WordPress transient buildup by counting live and expired transients via direct SQL with UNIX_TIMESTAMP() comparison, measuring total transient storage size, and computing the expired-to-live ratio for severity assessment. Uses dynamic table prefix via wp db prefix and routes all DB access through WP_CLI_PREFIX. Never uses wp transient list --expired (that flag does not exist).
---

# Diagnostic: Transient Buildup Detection

You analyze the WordPress options table for transient accumulation — particularly expired transients that have not been cleared — and report aggregate counts with ratio-based severity to identify sites where transient buildup is degrading database performance.

## Overview

WordPress uses transients as a lightweight caching mechanism: plugins store temporary data in the `wp_options` table using `set_transient()`. Each transient consists of two rows:
1. `_transient_{name}` — the cached value
2. `_transient_timeout_{name}` — the expiry timestamp

When a transient expires, WordPress removes it the next time it is accessed (lazy cleanup). On sites with low traffic to specific cached pages, or on sites using plugins that write transients but never clean them up, expired transients accumulate. This causes:

- **Database bloat:** Expired transients consume disk space in the options table
- **Query slowdown:** Larger tables mean slower full-table scans
- **Autoload contamination:** Some plugins incorrectly mark transients as autoload, loading dead data on every request

**Important:** `wp transient list` does NOT have an `--expired` flag. The only reliable way to count expired transients is via direct SQL comparison of the timeout value against `UNIX_TIMESTAMP()`. This skill uses that approach exclusively.

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
  echo '[{"id":"DBHL-TRANS-ERR","severity":"Warning","category":"Database Health","title":"Could not determine table prefix","summary":"The transient analysis could not run because the database table prefix could not be retrieved.","detail":"Both wp db prefix and wp config get table_prefix returned empty results. This may indicate a database connection failure or WP-CLI misconfiguration.","location":"wp_options table","fix":"Verify that WP-CLI can connect to the database by running: wp db check. Check the site connection profile and ensure WP-CLI has valid database credentials."}]'
  exit 0
fi
```

### Check 1: Live Transient Count

Count all non-timeout transient rows. These represent transients that may be live (not yet expired) or expired (timeout row exists but cleanup hasn't run yet):

```bash
LIVE_COUNT=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_%' AND option_name NOT LIKE '_transient_timeout_%'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Validate result is numeric
if ! echo "$LIVE_COUNT" | grep -qE '^[0-9]+$'; then
  LIVE_COUNT=0
fi
```

**Note:** This count includes transients whose timeout has passed but whose value row hasn't been cleaned up yet. "Live count" means the count of value rows (as opposed to timeout rows), not the count of non-expired transients.

### Check 2: Expired Transient Count

**Critical:** Do NOT use `wp transient list --expired`. That flag does not exist on the `wp transient list` command (available flags: `--search`, `--exclude`, `--network`, `--unserialize`, `--human-readable`, `--fields`, `--format`).

Use direct SQL to count timeout rows whose timestamp is in the past:

```bash
EXPIRED_COUNT=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_timeout_%' AND CAST(option_value AS UNSIGNED) < UNIX_TIMESTAMP()" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Validate result is numeric
if ! echo "$EXPIRED_COUNT" | grep -qE '^[0-9]+$'; then
  EXPIRED_COUNT=0
fi
```

**How it works:** Each transient's timeout row stores a UNIX timestamp as its value. `CAST(option_value AS UNSIGNED)` converts the stored string to an integer. `UNIX_TIMESTAMP()` returns the current server time as a UNIX timestamp. If the stored timeout is less than now, the transient has expired.

### Check 3: Total Transient Storage Size

Measure the total bytes consumed by all transient rows (both value rows and timeout rows):

```bash
TRANSIENT_SIZE_BYTES=$($WP_CLI_PREFIX db query \
  "SELECT COALESCE(SUM(LENGTH(option_value)), 0) FROM ${TABLE_PREFIX}options WHERE option_name LIKE '_transient_%'" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Validate result is numeric
if ! echo "$TRANSIENT_SIZE_BYTES" | grep -qE '^[0-9]+$'; then
  TRANSIENT_SIZE_BYTES=0
fi

# Convert for display
TRANSIENT_SIZE_KB=$((TRANSIENT_SIZE_BYTES / 1024))
TRANSIENT_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $TRANSIENT_SIZE_BYTES / 1048576}")
```

### Step 4: Ratio Calculation and Severity Assessment

Use the expired-to-live ratio as the primary severity signal. A site with 10,000 live transients and 500 expired (5%) is healthy. A site with 200 live transients and 500 expired (250%) is severely bloated.

```bash
# Compute ratio — handle division by zero
if [ "$LIVE_COUNT" -gt 0 ]; then
  RATIO=$(awk "BEGIN {printf \"%.4f\", $EXPIRED_COUNT / $LIVE_COUNT}")
  RATIO_PCT=$(awk "BEGIN {printf \"%.1f\", ($EXPIRED_COUNT / $LIVE_COUNT) * 100}")
else
  RATIO="0.0000"
  RATIO_PCT="0.0"
fi

# Ratio-based severity thresholds:
# Warning: expired > 50% of live AND absolute expired count > 100
# Info (cleanup recommended): expired > 25% of live AND absolute expired count > 50
# Info (healthy): otherwise
if [ "$(awk "BEGIN {print ($EXPIRED_COUNT > 100) && ($RATIO > 0.5)}")" = "1" ]; then
  SEVERITY="Warning"
  SEVERITY_MSG="Expired transients exceed 50% of live transients and absolute count exceeds 100"
elif [ "$(awk "BEGIN {print ($EXPIRED_COUNT > 50) && ($RATIO > 0.25)}")" = "1" ]; then
  SEVERITY="Info"
  SEVERITY_MSG="Expired transients exceed 25% of live transients — cleanup recommended"
else
  SEVERITY="Info"
  SEVERITY_MSG="Transient ratio is healthy"
fi
```

**Severity threshold rationale:**
- The absolute count gates (100 for Warning, 50 for Info) prevent false alerts on sites with naturally fast transient turnover and very small absolute numbers (e.g., 3 expired out of 2 live)
- The ratio gates (50% and 25%) catch proportional bloat regardless of absolute site size
- A large site with 50% expired transients needs cleanup even if absolute counts are high — the ratio captures this

### Output Format: Aggregate Counts Only

Report aggregate counts only. Do not list individual transients. Individual transient listing would be noisy and unhelpful — cleanup with `wp transient delete --expired` handles all of them at once.

**Output to display:**
```
Transient Summary:
  Live transients:    {LIVE_COUNT}
  Expired transients: {EXPIRED_COUNT}  ({RATIO_PCT}% of live count)
  Total size:         {TRANSIENT_SIZE_KB} KB ({TRANSIENT_SIZE_MB} MB)
```

### Finding: Expired Transient Ratio

**Finding ID:** `DBHL-TRANS-EXP` (when Warning or Info with cleanup recommended)
**Finding ID:** `DBHL-TRANS-OK` (when healthy)

**Example Finding (Warning — high expired ratio):**
```json
{
  "id": "DBHL-TRANS-EXP",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Expired transient buildup detected",
  "summary": "A high proportion of your WordPress transients have expired but not been cleaned up, bloating the database and slowing queries.",
  "detail": "Transient summary:\n  Live transients: 342\n  Expired transients: 189 (55.3% of live count)\n  Total transient storage: 2,430 KB (2.37 MB)\n\nExpired transients exceed the 50% ratio threshold (Warning) with an absolute count above 100. These expired rows are not serving any caching purpose and are consuming database space unnecessarily.",
  "location": "wp_options table (_transient_* rows)",
  "fix": "Delete all expired transients safely with:\n  wp transient delete --expired\n\nThis command removes only transients past their expiry time and does not affect active cached data. It is safe to run on a live site. For persistent cleanup, ensure your hosting environment has WordPress cron running (wp cron event run --due-now) to process lazy cleanup. Consider a persistent object cache (Redis, Memcached) which handles transient cleanup automatically."
}
```

**Example Finding (Info — cleanup recommended):**
```json
{
  "id": "DBHL-TRANS-EXP",
  "severity": "Info",
  "category": "Database Health",
  "title": "Moderate expired transient accumulation",
  "summary": "Some expired transients are accumulating in the database — cleanup is recommended but not urgent.",
  "detail": "Transient summary:\n  Live transients: 580\n  Expired transients: 160 (27.6% of live count)\n  Total transient storage: 890 KB\n\nExpired transients are at 27.6% of live count with 160 absolute expired rows. This is above the 25% recommendation threshold but below Warning level. A cleanup run is advisable.",
  "location": "wp_options table (_transient_* rows)",
  "fix": "Run: wp transient delete --expired\n\nThis is a safe, zero-downtime operation. Schedule it as a regular maintenance task, or use a plugin like WP-Optimize or Advanced Database Cleaner to automate transient cleanup."
}
```

**Example Finding (Info — healthy):**
```json
{
  "id": "DBHL-TRANS-OK",
  "severity": "Info",
  "category": "Database Health",
  "title": "Transient buildup is within healthy range",
  "summary": "Your WordPress transient data is clean — expired transients are a small proportion of total transients.",
  "detail": "Transient summary:\n  Live transients: 245\n  Expired transients: 12 (4.9% of live count)\n  Total transient storage: 340 KB\n\nThe expired-to-live ratio (4.9%) is well below the 25% recommendation threshold. Transient cleanup is running as expected.",
  "location": "wp_options table (_transient_* rows)",
  "fix": "No action required. Transient cleanup is functioning normally."
}
```

## Output Format

Return findings as a JSON array. Each finding must include:

- `id` (string) — `DBHL-TRANS-EXP` for buildup findings, `DBHL-TRANS-OK` for healthy state
- `severity` (string) — `"Critical"`, `"Warning"`, or `"Info"` (no other values)
- `category` (string) — `"Database Health"`
- `title` (string) — Short descriptive title
- `summary` (string) — One non-technical sentence explaining the finding
- `detail` (string) — Technical detail including live count, expired count, ratio percentage, and total size
- `location` (string) — `"wp_options table (_transient_* rows)"`
- `fix` (string) — Specific remediation with `wp transient delete --expired` command

**Complete Output Example:**
```json
[
  {
    "id": "DBHL-TRANS-EXP",
    "severity": "Warning",
    "category": "Database Health",
    "title": "Expired transient buildup detected",
    "summary": "A high proportion of WordPress transients have expired but not been cleaned up, bloating the database.",
    "detail": "Transient summary:\n  Live transients: 342\n  Expired transients: 189 (55.3% of live)\n  Total transient storage: 2,430 KB (2.37 MB)\n\nExpired transients exceed the 50% Warning threshold with absolute count above 100.",
    "location": "wp_options table (_transient_* rows)",
    "fix": "Run: wp transient delete --expired\n\nThis safely removes only expired transients without affecting active cached data. Schedule regular maintenance via WP cron or use WP-Optimize plugin for automated cleanup."
  }
]
```

## Error Handling

### WP-CLI Not Available
```json
{
  "id": "DBHL-TRANS-SKIP",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Transient analysis skipped — WP-CLI not available",
  "summary": "Transient analysis requires WP-CLI to query the database and cannot run without it.",
  "detail": "WP_CLI_AVAILABLE is false for this source type. Transient analysis uses wp db query commands which require WP-CLI. Git sources and sources without WP-CLI configured cannot run database queries.",
  "location": "wp_options table",
  "fix": "Install WP-CLI on the server (https://wp-cli.org) or connect via SSH or Docker source type with WP-CLI available to enable this check."
}
```

### Query Failure
If a `wp db query` command returns non-zero exit or empty output unexpectedly:
```json
{
  "id": "DBHL-TRANS-ERR",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Transient query failed",
  "summary": "The database query for transient analysis returned an error.",
  "detail": "The SELECT query on ${TABLE_PREFIX}options for transient rows returned an error or empty result. This may indicate a database connection issue, missing table, or insufficient permissions. Error output: {ERROR_TEXT}",
  "location": "wp_options table",
  "fix": "Verify database connectivity with: wp db check. Verify the options table exists with: wp db tables. Check that the WP-CLI database user has SELECT permission on the options table."
}
```

### Zero Live Transients
If `LIVE_COUNT` is 0 (no transients found at all), this is unusual but not an error. Some sites with external object caches (Redis, Memcached) store transients outside the options table entirely. Report as Info:
```json
{
  "id": "DBHL-TRANS-OK",
  "severity": "Info",
  "category": "Database Health",
  "title": "No transients in options table",
  "summary": "No WordPress transients were found in the database — your site may be using an external object cache.",
  "detail": "Zero transient rows found in the options table. This is expected behavior if a persistent object cache (Redis, Memcached) is configured via object-cache.php, as transients are stored externally rather than in the database.",
  "location": "wp_options table (_transient_* rows)",
  "fix": "No action required if an object cache plugin is active. If not, verify that transients are being created normally: wp transient set test_transient test_value 300 && wp transient get test_transient"
}
```

## Anti-Patterns to Avoid

**Never use `wp transient list --expired`:** This flag does not exist. The `wp transient list` command accepts only: `--search`, `--exclude`, `--network`, `--unserialize`, `--human-readable`, `--fields`, `--format`. Using `--expired` will cause the command to fail with an unrecognized parameter error.

**Never use raw count for severity:** A site with 10,000 live transients and 800 expired (8%) is fine. A site with 100 live transients and 150 expired (150%) has a serious problem. Always use the ratio.

**Never hardcode `wp_` in SQL:** Always use `${TABLE_PREFIX}options` where TABLE_PREFIX was retrieved via `$WP_CLI_PREFIX db prefix`.

## Performance Considerations

- These COUNT queries run efficiently with MySQL's index on `option_name` (which uses a LIKE pattern starting with `_transient_`). On typical sites, they complete in under 1 second.
- The `CAST(option_value AS UNSIGNED) < UNIX_TIMESTAMP()` comparison in the expired query requires reading timeout values but is bounded to rows matching the `_transient_timeout_%` LIKE pattern.

## Success Criteria

Transient buildup detection is complete when:
- Table prefix retrieved dynamically via `$WP_CLI_PREFIX db prefix`
- Live transient count retrieved via SQL on value rows (`_transient_%` excluding timeout rows)
- Expired transient count retrieved via SQL on timeout rows with `UNIX_TIMESTAMP()` comparison
- Total transient storage size measured
- Expired-to-live ratio computed with float division via awk
- Finding emitted: `DBHL-TRANS-EXP` or `DBHL-TRANS-OK`
- Fix guidance includes `wp transient delete --expired`
- No hardcoded `wp_` table prefix used anywhere in execution
- `wp transient list --expired` not referenced anywhere in execution
