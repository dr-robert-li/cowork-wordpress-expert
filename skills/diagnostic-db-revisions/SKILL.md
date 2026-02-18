---
name: diagnostic-db-revisions
description: Analyzes WordPress post revision accumulation by counting total revisions, breaking down counts by parent post type via SQL JOIN, checking the WP_POST_REVISIONS constant for all four possible values (unlimited/true/false/number), computing a post count for per-post averages, and estimating database savings from setting a revision limit of 10. Uses dynamic table prefix via wp db prefix and routes all DB access through WP_CLI_PREFIX.
---

# Diagnostic: Post Revision Analysis

You analyze WordPress post revision accumulation — how many revision records exist, which post types are generating the most revisions, whether revision capping is configured, and what database savings are available from setting or reducing a revision limit.

## Overview

WordPress automatically saves a new revision every time a post is saved or autosaved. By default, there is no limit to how many revisions are stored — a post edited 500 times accumulates 500 revision rows in `wp_posts`. On active editorial sites, revision accumulation causes:

- **Database bloat:** Each revision stores a full copy of the post content, including post_title, post_content, post_excerpt, and metadata
- **Slow query times:** Larger `wp_posts` tables slow down post listing queries, especially in the admin panel
- **Backup size growth:** Revision rows are included in database backups, increasing backup size and time
- **Maintenance overhead:** Manual cleanup requires identifying and deleting revision posts safely

**Revisions do NOT affect frontend performance directly** — they are filtered out of public queries by WordPress. The performance impact is indirect: larger `wp_posts` tables, slower admin queries, and inflated backups.

**WP_POST_REVISIONS** is the PHP constant that controls revision behavior. It can be set in `wp-config.php` to any of: an integer limit, `true` (unlimited), or `false` (disabled). If not defined, WordPress defaults to unlimited revisions. This skill checks the actual configured value and handles all four cases.

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
  echo '[{"id":"DBHL-REV-ERR","severity":"Warning","category":"Database Health","title":"Could not determine table prefix","summary":"The revision analysis could not run because the database table prefix could not be retrieved.","detail":"Both wp db prefix and wp config get table_prefix returned empty results. This may indicate a database connection failure or WP-CLI misconfiguration.","location":"wp_posts table","fix":"Verify that WP-CLI can connect to the database by running: wp db check."}]'
  exit 0
fi
```

### Check 1: Total Revision Count

Use WP-CLI's post list command for the total count — this respects WP_CLI_PREFIX routing:

```bash
TOTAL_REVISIONS=$($WP_CLI_PREFIX post list \
  --post_type=revision \
  --format=count \
  2>/dev/null | tr -d '[:space:]')

# Validate result is numeric
if ! echo "$TOTAL_REVISIONS" | grep -qE '^[0-9]+$'; then
  TOTAL_REVISIONS=0
fi
```

### Check 2: Per-Parent Post Type Breakdown

Join the revisions table against the parent post table to count revisions grouped by parent post type. This identifies which content type is driving revision growth:

```bash
REVISION_BREAKDOWN=$($WP_CLI_PREFIX db query \
  "SELECT p.post_type, COUNT(r.ID) as revisions FROM ${TABLE_PREFIX}posts r JOIN ${TABLE_PREFIX}posts p ON r.post_parent = p.ID WHERE r.post_type = 'revision' GROUP BY p.post_type ORDER BY revisions DESC" \
  --skip-column-names 2>/dev/null)
```

**Output format:** Tab-separated rows like:
```
post    3420
page    890
product 245
```

Parse this for display as a table. If output is empty, skip the breakdown section.

### Check 3: WP_POST_REVISIONS Constant

Read the constant via WP-CLI config — this returns the value as defined in wp-config.php without requiring file parsing:

```bash
WP_POST_REVISIONS_RAW=$($WP_CLI_PREFIX config get WP_POST_REVISIONS 2>/dev/null | tr -d '[:space:]')
```

**Handle all four cases explicitly:**

```bash
if [ -z "$WP_POST_REVISIONS_RAW" ]; then
  # Case 1: Not defined — WordPress default is unlimited
  REVISIONS_UNLIMITED=true
  REVISIONS_LIMIT=""
  REVISIONS_STATUS="Not defined (unlimited — WordPress default)"
elif [ "$WP_POST_REVISIONS_RAW" = "true" ]; then
  # Case 2: Explicitly set to true — unlimited
  REVISIONS_UNLIMITED=true
  REVISIONS_LIMIT=""
  REVISIONS_STATUS="true (explicitly unlimited)"
elif [ "$WP_POST_REVISIONS_RAW" = "false" ]; then
  # Case 3: Explicitly set to false — revisions disabled (0 kept)
  REVISIONS_UNLIMITED=false
  REVISIONS_LIMIT=0
  REVISIONS_STATUS="false (revisions disabled)"
else
  # Case 4: Numeric limit set
  REVISIONS_UNLIMITED=false
  REVISIONS_LIMIT="$WP_POST_REVISIONS_RAW"
  REVISIONS_STATUS="${WP_POST_REVISIONS_RAW} revisions per post"
fi
```

**Note on `false`:** When `WP_POST_REVISIONS` is set to `false`, WordPress still keeps one autosave per post but keeps zero manual revisions. The `wp post list --post_type=revision --format=count` total may still be non-zero if revisions existed before `false` was set — existing revisions are not deleted when the constant is changed.

### Check 4: Post Count for Context

Count active published posts (excluding revisions, attachments, nav items, drafts, and trash) to calculate average revisions per post:

```bash
POST_COUNT=$($WP_CLI_PREFIX db query \
  "SELECT COUNT(*) FROM ${TABLE_PREFIX}posts WHERE post_type NOT IN ('revision','attachment','nav_menu_item') AND post_status NOT IN ('auto-draft','trash')" \
  --skip-column-names 2>/dev/null | tr -d '[:space:]')

# Validate result is numeric
if ! echo "$POST_COUNT" | grep -qE '^[0-9]+$'; then
  POST_COUNT=0
fi

# Calculate average revisions per post
if [ "$POST_COUNT" -gt 0 ]; then
  AVG_REVISIONS=$(awk "BEGIN {printf \"%.1f\", $TOTAL_REVISIONS / $POST_COUNT}")
else
  AVG_REVISIONS="N/A"
fi
```

### Step 5: Savings Estimate

If revisions are unlimited, estimate how many rows would be removed by setting a limit of 10 revisions per post:

```bash
if [ "$REVISIONS_UNLIMITED" = "true" ] && [ "$POST_COUNT" -gt 0 ]; then
  EXCESS_REVISIONS=$((TOTAL_REVISIONS - (POST_COUNT * 10)))
  if [ "$EXCESS_REVISIONS" -lt 0 ]; then
    EXCESS_REVISIONS=0
  fi
  # Estimate 2KB average per revision row (post content copy)
  SAVINGS_KB=$((EXCESS_REVISIONS * 2))
  SAVINGS_MB=$(awk "BEGIN {printf \"%.2f\", $SAVINGS_KB / 1024}")
  SAVINGS_MSG="Setting WP_POST_REVISIONS to 10 could remove approximately ${EXCESS_REVISIONS} rows, saving ~${SAVINGS_MB} MB."
else
  SAVINGS_MSG=""
fi
```

### Step 6: Severity Assessment

```bash
# Severity logic:
# Warning: unlimited AND total > 1000 (revisions out of control)
# Warning: total > 5000 regardless of config (absolute bloat threshold)
# Info: total > 500 or high per-post average (moderate accumulation, monitor)
# Info (healthy): below thresholds

if [ "$REVISIONS_UNLIMITED" = "true" ] && [ "$TOTAL_REVISIONS" -gt 1000 ]; then
  SEVERITY="Warning"
  SEVERITY_MSG="WP_POST_REVISIONS is unlimited and total revision count exceeds 1,000"
elif [ "$TOTAL_REVISIONS" -gt 5000 ]; then
  SEVERITY="Warning"
  SEVERITY_MSG="Total revision count exceeds 5,000 rows regardless of configured limit"
elif [ "$TOTAL_REVISIONS" -gt 500 ] || \
     ([ "$POST_COUNT" -gt 0 ] && [ "$(awk "BEGIN {print ($TOTAL_REVISIONS / $POST_COUNT) > 20}")" = "1" ]); then
  SEVERITY="Info"
  SEVERITY_MSG="Moderate revision accumulation — cleanup recommended"
else
  SEVERITY="Info"
  SEVERITY_MSG="Revision count is within healthy range"
fi
```

## Output Format

### Finding: WP_POST_REVISIONS Unlimited or High Count

**Finding ID:** `DBHL-REV-UNL` — when revisions are unlimited (no constant defined or set to `true`)
**Finding ID:** `DBHL-REV-CNT` — when revision count is high regardless of limit setting
**Finding ID:** `DBHL-REV-OK` — when revision count is healthy

Each finding must include:
- `id` (string) — deterministic ID from the list above
- `severity` (string) — `"Critical"`, `"Warning"`, or `"Info"`
- `category` (string) — `"Database Health"`
- `title` (string) — Short descriptive title
- `summary` (string) — One non-technical sentence
- `detail` (string) — Technical detail with counts, breakdown, config status, and savings estimate
- `location` (string) — `"wp_posts table (post_type='revision' rows)"`
- `fix` (string) — Specific steps including the `define('WP_POST_REVISIONS', 10)` recommendation

**Example Finding (Warning — unlimited + high count):**
```json
{
  "id": "DBHL-REV-UNL",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Post revisions are unlimited and accumulating",
  "summary": "WordPress is storing an unlimited number of post revisions, causing significant database bloat that slows admin queries and inflates backups.",
  "detail": "Revision summary:\n  Total revisions: 4,230\n  WP_POST_REVISIONS: Not defined (unlimited — WordPress default)\n  Active post count: 285\n  Average revisions per post: 14.8\n\nRevision breakdown by post type:\n  post     | 3,420 revisions\n  page     |   890 revisions\n  product  |    45 revisions\n\nSavings estimate: Setting WP_POST_REVISIONS to 10 could remove approximately 1,380 rows, saving ~2.70 MB.",
  "location": "wp_posts table (post_type='revision' rows)",
  "fix": "Step 1 — Add to wp-config.php (before 'That's all, stop editing'):\n  define('WP_POST_REVISIONS', 10);\n\nThis immediately limits future revisions to 10 per post but does NOT remove existing revisions.\n\nStep 2 — Delete existing excess revisions:\n  wp post delete $(wp post list --post_type=revision --format=ids) --force\n\nAlternatively use WP-CLI's bulk delete with confirmation:\n  wp post list --post_type=revision --format=ids | xargs -r wp post delete --force\n\nOr use a dedicated plugin (WP-Sweep, WP-Optimize) for safer batch cleanup.\n\nNote: Revision cleanup is safe — revisions are never displayed publicly. Backup your database before bulk deletion as a precaution."
}
```

**Example Finding (Info — moderate accumulation):**
```json
{
  "id": "DBHL-REV-CNT",
  "severity": "Info",
  "category": "Database Health",
  "title": "Moderate post revision accumulation",
  "summary": "Your WordPress site has accumulated a notable number of post revisions — setting a revision limit is recommended.",
  "detail": "Revision summary:\n  Total revisions: 780\n  WP_POST_REVISIONS: 25 revisions per post\n  Active post count: 120\n  Average revisions per post: 6.5\n\nRevision breakdown by post type:\n  post | 650 revisions\n  page | 130 revisions",
  "location": "wp_posts table (post_type='revision' rows)",
  "fix": "Consider reducing WP_POST_REVISIONS from 25 to 10 in wp-config.php:\n  define('WP_POST_REVISIONS', 10);\n\nA limit of 10 is generous for editorial workflows and balances undo history with database size. Run cleanup after changing the limit:\n  wp post list --post_type=revision --format=ids | xargs -r wp post delete --force"
}
```

**Example Finding (Info — healthy):**
```json
{
  "id": "DBHL-REV-OK",
  "severity": "Info",
  "category": "Database Health",
  "title": "Post revision count is healthy",
  "summary": "Your WordPress site has a manageable number of post revisions — no action required.",
  "detail": "Revision summary:\n  Total revisions: 215\n  WP_POST_REVISIONS: 10 revisions per post\n  Active post count: 80\n  Average revisions per post: 2.7\n\nRevision count is within the healthy range with a limit already configured.",
  "location": "wp_posts table (post_type='revision' rows)",
  "fix": "No action required. WP_POST_REVISIONS is configured at 10 per post, which is the recommended limit."
}
```

**Example Finding (Info — revisions disabled):**
```json
{
  "id": "DBHL-REV-OK",
  "severity": "Info",
  "category": "Database Health",
  "title": "Post revisions are disabled",
  "summary": "WP_POST_REVISIONS is set to false — revision storage is disabled and no revision accumulation can occur.",
  "detail": "Revision summary:\n  Total revisions: 0\n  WP_POST_REVISIONS: false (revisions disabled)\n\nNote: Setting WP_POST_REVISIONS to false prevents new revisions but does not delete revisions that existed before the setting was applied. Existing revision rows (if any) remain in the database until manually cleaned up.",
  "location": "wp_posts table (post_type='revision' rows)",
  "fix": "No action required for revision accumulation. If you want to restore some revision history, change to: define('WP_POST_REVISIONS', 10); in wp-config.php."
}
```

## Error Handling

### WP-CLI Not Available
```json
{
  "id": "DBHL-REV-SKIP",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Revision analysis skipped — WP-CLI not available",
  "summary": "Revision analysis requires WP-CLI to query the database and cannot run without it.",
  "detail": "WP_CLI_AVAILABLE is false for this source type. Post revision analysis uses wp post list and wp db query commands which require WP-CLI. Git sources and sources without WP-CLI configured cannot run database queries.",
  "location": "wp_posts table",
  "fix": "Install WP-CLI on the server (https://wp-cli.org) or connect via SSH or Docker source type with WP-CLI available to enable this check."
}
```

### Query Failure
If `wp post list --post_type=revision --format=count` fails:
```json
{
  "id": "DBHL-REV-ERR",
  "severity": "Warning",
  "category": "Database Health",
  "title": "Revision count query failed",
  "summary": "The revision count query returned an error and revision analysis could not complete.",
  "detail": "wp post list --post_type=revision --format=count returned an error or non-numeric result. This may indicate a database connection issue or permissions problem. Error output: {ERROR_TEXT}",
  "location": "wp_posts table",
  "fix": "Verify database connectivity with: wp db check. Verify WP-CLI can list posts with: wp post list --post_type=post --format=count"
}
```

### wp config get WP_POST_REVISIONS Failure
If the `wp config get WP_POST_REVISIONS` command returns an error (non-zero exit code), treat it as "constant not defined" (which means unlimited):

```bash
WP_POST_REVISIONS_RAW=$($WP_CLI_PREFIX config get WP_POST_REVISIONS 2>/dev/null | tr -d '[:space:]')
# If command fails, WP_POST_REVISIONS_RAW will be empty — handled by Case 1 (unlimited)
```

This is expected behavior when the constant is not defined in wp-config.php.

## Performance Considerations

- `wp post list --post_type=revision --format=count` is efficient — WP-CLI uses a COUNT query against the posts table with indexed `post_type='revision'` filter
- The per-type JOIN query scans revision rows and joins against parent posts, which may be slower on sites with very large `wp_posts` tables (100,000+ rows). Expected duration: 1–10 seconds
- The post count query uses indexed `post_type` and `post_status` columns for fast execution

## Success Criteria

Post revision analysis is complete when:
- Table prefix retrieved dynamically via `$WP_CLI_PREFIX db prefix`
- Total revision count retrieved via `$WP_CLI_PREFIX post list --post_type=revision --format=count`
- Per-parent post type breakdown retrieved via SQL JOIN on `${TABLE_PREFIX}posts`
- `WP_POST_REVISIONS` constant checked via `$WP_CLI_PREFIX config get WP_POST_REVISIONS` with all 4 value cases handled
- Active post count retrieved for average calculation
- Savings estimate calculated when revisions are unlimited
- Finding emitted: `DBHL-REV-UNL`, `DBHL-REV-CNT`, or `DBHL-REV-OK`
- Fix guidance includes `define('WP_POST_REVISIONS', 10)` recommendation
- No hardcoded `wp_` table prefix used anywhere in SQL queries
