---
name: diagnostic-performance-n1
description: Detects potential N+1 query patterns in custom WordPress theme and plugin PHP code using three confidence tiers (High/Medium/Low). Skips well-known third-party plugins. Provides rewrite suggestions using actual variable names extracted from the code.
---

# Diagnostic: N+1 Query Pattern Detection

You detect potential N+1 query patterns in custom WordPress PHP code using a two-pass approach — grep for pattern candidates, then AI contextual analysis to confirm patterns and extract actual variable names for targeted rewrite suggestions.

## Overview

The N+1 query anti-pattern occurs when a database query is executed inside a loop, causing one query per iteration instead of a single batch query. The problem scales linearly with content volume:

- 10 posts in a loop = 10 separate database queries instead of 1
- 100 posts in a loop = 100 queries instead of 1
- 1,000 posts in a loop = 1,000 queries instead of 1

This is one of the leading causes of WordPress performance degradation. A page that takes 200ms with 10 posts may take 2,000ms with 100 posts — not because the page design changed, but because loop queries multiply with data volume.

**Why custom code only:** Users cannot fix N+1 patterns in WooCommerce, Yoast SEO, Elementor, or other third-party plugins — those are maintained by their vendors. Flagging patterns in code users cannot modify wastes diagnostic time and creates alert fatigue. This skill scans custom themes and custom plugins only.

## Prerequisites

Before scanning, you need:

- `LOCAL_PATH` — path to the locally synced site files (from `sites.json` via `/connect` or `/diagnose`)
- No WP-CLI required — this skill performs purely static analysis on synced PHP files

**Self-gate:** If `LOCAL_PATH` is not set, does not exist, or contains no PHP files, return the skip finding immediately and stop.

```bash
# Check LOCAL_PATH exists and contains PHP files
if [ -z "$LOCAL_PATH" ] || [ ! -d "$LOCAL_PATH" ]; then
  # Return PERF-N1-SKIP finding
  exit 0
fi

PHP_FILE_COUNT=$(find "$LOCAL_PATH/wp-content/themes" "$LOCAL_PATH/wp-content/plugins" \
  -name "*.php" 2>/dev/null | wc -l | tr -d '[:space:]')

if [ "$PHP_FILE_COUNT" -eq 0 ]; then
  # Return PERF-N1-SKIP finding
  exit 0
fi
```

## Section 1: Target Directories

```bash
THEME_DIR="${LOCAL_PATH}/wp-content/themes"
PLUGIN_DIR="${LOCAL_PATH}/wp-content/plugins"
```

## Section 2: WP.org Plugin Skip List

Before scanning plugins, identify which plugin directories to skip. These are well-known third-party plugins that users cannot modify:

**Skip list (match against plugin directory names in `plugins/`):**

```
woocommerce
woocommerce-*
wordpress-seo
yoast-*
elementor
elementor-*
contact-form-7
jetpack
akismet
classic-editor
wp-super-cache
wordfence
gravityforms
gravity-forms-*
ninja-forms
wpforms-*
the-events-calendar
tribe-*
wp-rocket
rankmath
seo-by-rank-math
advanced-custom-fields
acf-*
```

**Skip logic:** For each directory in `$PLUGIN_DIR`, check if the directory name matches any entry in the skip list (using shell glob matching). If it matches, skip the entire directory and increment `SKIP_COUNT`.

```bash
SKIP_COUNT=0
CUSTOM_PLUGIN_DIRS=()

for plugin_dir in "$PLUGIN_DIR"/*/; do
  dirname=$(basename "$plugin_dir")
  skip=false

  # Check against skip list patterns
  skip_patterns=(
    "woocommerce" "woocommerce-*" "wordpress-seo" "yoast-*"
    "elementor" "elementor-*" "contact-form-7" "jetpack" "akismet"
    "classic-editor" "wp-super-cache" "wordfence" "gravityforms"
    "gravity-forms-*" "ninja-forms" "wpforms-*" "the-events-calendar"
    "tribe-*" "wp-rocket" "rankmath" "seo-by-rank-math"
    "advanced-custom-fields" "acf-*"
  )

  for pattern in "${skip_patterns[@]}"; do
    # shellcheck disable=SC2254
    case "$dirname" in
      $pattern) skip=true; break ;;
    esac
  done

  if [ "$skip" = true ]; then
    SKIP_COUNT=$((SKIP_COUNT + 1))
  else
    CUSTOM_PLUGIN_DIRS+=("$plugin_dir")
  fi
done
```

**Note:** The skip list applies only to subdirectories under `plugins/`. Theme directories are never skipped.

## Section 3: Pass 1 — Grep for Pattern Candidates

Collect candidate files across three confidence tiers. All grep commands exclude `node_modules/`, `vendor/`, and `.git/` directories and suppress permission errors with `2>/dev/null`.

### 3.1: High Confidence Candidates

Query function (`$wpdb->get_results`, `$wpdb->get_row`, `new WP_Query`, `get_posts()`, `get_post_meta()`) appearing within 5 lines after a `foreach` or `while` loop statement.

```bash
# Find foreach/while lines, then check 5 lines after for query calls
# Output format: filename:-- (separator) or filename:linenum:content
grep -rn -E "(foreach|while)\s*\(.+\)" \
  "$THEME_DIR" "${CUSTOM_PLUGIN_DIRS[@]}" \
  --include="*.php" \
  --exclude-dir=node_modules \
  --exclude-dir=vendor \
  --exclude-dir=.git \
  -A 5 2>/dev/null | \
  grep -E "(\\\$wpdb->get_results|\\\$wpdb->get_row|\\\$wpdb->query\s*\(|new WP_Query|get_posts\s*\(|get_post_meta\s*\(|get_term_meta\s*\(|get_field\s*\(|get_sub_field\s*\()"
```

Collect the file paths from matches. For each unique file, mark it as a High confidence candidate.

### 3.2: Medium Confidence Candidates

`get_post()`, `get_post_meta()`, `get_term_meta()`, `get_field()`, or `get_sub_field()` called with a variable argument. AI will confirm whether a loop exists within 10 lines before the call.

```bash
grep -rn -E "(get_post|get_post_meta|get_term_meta|get_field|get_sub_field)\s*\(\s*\\\$" \
  "$THEME_DIR" "${CUSTOM_PLUGIN_DIRS[@]}" \
  --include="*.php" \
  --exclude-dir=node_modules \
  --exclude-dir=vendor \
  --exclude-dir=.git \
  -B 10 -A 2 2>/dev/null
```

Collect file paths where matches are found. Mark as Medium confidence candidates (AI will confirm loop context in Pass 2).

### 3.3: Low Confidence Candidates

Multiple sequential `$wpdb->get_results` or `$wpdb->get_row` calls in the same file within 10 lines of each other, with no loop present.

```bash
grep -rn -E "\\\$wpdb->(get_results|get_row)\s*\(" \
  "$THEME_DIR" "${CUSTOM_PLUGIN_DIRS[@]}" \
  --include="*.php" \
  --exclude-dir=node_modules \
  --exclude-dir=vendor \
  --exclude-dir=.git \
  -n 2>/dev/null | \
  awk -F: '
    prev_file == $1 && ($2+0) - (prev_line+0) < 10 {
      print prev_entry
      print $0
    }
    {
      prev_file = $1
      prev_line = $2 + 0
      prev_entry = $0
    }
  '
```

### 3.4: Pass 1 Summary

After completing all grep passes, output a summary before Pass 2:

```
Pass 1 Results:
- High confidence candidates: {N} files
- Medium confidence candidates: {M} files
- Low confidence candidates: {K} files
- Well-known plugin directories skipped: {SKIP_COUNT}

Flagged files for Pass 2 analysis:
- {file1.php} [High]
- {file2.php} [Medium]
- {file3.php} [Low]
```

## Section 4: Pass 2 — AI Contextual Analysis

For each candidate file identified in Pass 1, read the relevant portion of the file (±20 lines around the match location) and apply AI judgment:

1. **Confirm loop presence:** Is the query function actually inside a loop body, not just near one?
2. **Extract actual variable names:** What variables are used in the loop and query? Use these verbatim in the fix suggestion — do NOT substitute generic names like `$posts` or `$post_ids`.
3. **Assign final confidence tier** using the LOCKED rules below.
4. **Generate targeted rewrite suggestion** using the actual variable names from the code.

### Confidence Tier Rules (LOCKED — from user decisions)

**High:** Query function (`$wpdb->get_results`, `$wpdb->get_row`, `new WP_Query`, `get_posts()`, `get_post_meta()`, `get_term_meta()`) appears directly inside a `foreach` or `while` loop body.

**Medium:** `get_post()`, `get_post_meta()`, `get_term_meta()`, `get_field()`, or `get_sub_field()` called with a variable argument, and a `foreach` or `while` loop exists within 10 lines before the call.

**Low:** Multiple sequential `$wpdb->get_results` or `$wpdb->get_row` calls on the same table within 10 lines in the same function or template scope, with no loop present. (Speculative — user may need to investigate whether these are truly redundant.)

### Dismissing False Positives

Dismiss a candidate (do NOT create a finding) if:

- The query function is called inside the loop but the loop variable is NOT used as an argument to the query — the query is not per-iteration
- The query function call is inside a conditional that exits the loop early (`break`, `return`) and the query only runs once
- The code is commented out
- The call is inside a function definition that is registered as a callback (not called directly in the loop)

### Extracting Variable Names

Read the actual file content. Identify:

- The loop variable (e.g., `$event_id`, `$product_id`, `$term`)
- The array being looped over (e.g., `$event_ids`, `$products`, `$terms`)
- The result variable from the query (e.g., `$event`, `$meta_value`, `$custom_data`)
- The meta key or table name referenced in the query (e.g., `'_venue'`, `'_price'`)

Use ALL of these in the fix suggestion. Never substitute with `$posts`, `$items`, `$post_ids`, or other generic names.

## Section 5: Finding Structure

Each confirmed N+1 pattern produces one finding:

```json
{
  "id": "PERF-N1-{hash}",
  "severity": "Warning",
  "category": "Performance",
  "title": "Potential N+1 query pattern [High confidence]",
  "summary": "A database query inside a loop may cause one query per iteration instead of loading all data in a single batch.",
  "detail": "File: {file}:{line}\nConfidence: {High|Medium|Low}\nPattern: {description of what was found, e.g., 'get_post_meta() called inside foreach loop'}\nCode:\n{relevant code snippet, 5-10 lines showing the loop and query together}",
  "location": "{file}:{line}",
  "fix": "Before:\n{actual code from file with real variable names}\n\nAfter:\n{rewrite suggestion using the same variable names}\n\nPattern: Use get_posts() with post__in, get_terms() with include, or a single $wpdb->get_results() with WHERE IN (...) to batch-load all required data before the loop."
}
```

**Finding ID hash:** MD5 of `{file_path}:{line_number}:{pattern_type}`, truncated to 6 characters.

```bash
HASH=$(echo -n "${FILE_PATH}:${LINE_NUMBER}:${PATTERN_TYPE}" | md5sum | cut -c1-6)
# On macOS: echo -n "..." | md5 | cut -c1-6
FINDING_ID="PERF-N1-${HASH}"
```

**Severity:** Always `Warning` for High and Medium confidence. `Info` for Low confidence (speculative — user may need to investigate).

**Title format:**
- High: `"Potential N+1 query pattern [High confidence]"`
- Medium: `"Potential N+1 query pattern [Medium confidence]"`
- Low: `"Potential N+1 query pattern [Low confidence]"`

## Section 6: Rewrite Suggestion Examples

The following examples illustrate the principle: always use the actual variable names from the scanned code.

### Example 1: get_post_meta inside foreach

**Code found in file:**
```php
foreach ($event_ids as $event_id) {
    $event = get_post($event_id);
    $venue = get_post_meta($event_id, '_venue', true);
    $capacity = get_post_meta($event_id, '_capacity', true);
}
```

**Fix field should contain:**
```
Before:
foreach ($event_ids as $event_id) {
    $event = get_post($event_id);
    $venue = get_post_meta($event_id, '_venue', true);
    $capacity = get_post_meta($event_id, '_capacity', true);
}

After:
$events = get_posts(['post__in' => $event_ids, 'posts_per_page' => -1]);
$venues = [];
$capacities = [];
foreach ($event_ids as $id) {
    $venues[$id]     = get_post_meta($id, '_venue', true);
    $capacities[$id] = get_post_meta($id, '_capacity', true);
}
foreach ($events as $event) {
    $venue    = $venues[$event->ID]     ?? '';
    $capacity = $capacities[$event->ID] ?? '';
}

Pattern: Pre-load all meta values before the loop using individual calls keyed by post ID,
or use a single $wpdb->get_results() with WHERE meta_key IN ('_venue', '_capacity')
AND post_id IN (...) to batch-load all values at once.
```

### Example 2: WP_Query inside foreach

**Code found in file:**
```php
foreach ($category_ids as $cat_id) {
    $related_posts = new WP_Query([
        'cat' => $cat_id,
        'posts_per_page' => 3,
    ]);
}
```

**Fix field should contain:**
```
Before:
foreach ($category_ids as $cat_id) {
    $related_posts = new WP_Query([
        'cat' => $cat_id,
        'posts_per_page' => 3,
    ]);
}

After:
$all_related = new WP_Query([
    'category__in'   => $category_ids,
    'posts_per_page' => count($category_ids) * 3,
]);
// Then group $all_related->posts by category in PHP:
$posts_by_cat = [];
foreach ($all_related->posts as $post) {
    foreach (wp_get_post_categories($post->ID) as $cat_id) {
        if (in_array($cat_id, $category_ids)) {
            $posts_by_cat[$cat_id][] = $post;
        }
    }
}

Pattern: Combine all category IDs into a single WP_Query using category__in,
then group results by category in PHP rather than running one query per category.
```

### Example 3: $wpdb->get_results inside while loop

**Code found in file:**
```php
while ($member = array_shift($member_list)) {
    $subscriptions = $wpdb->get_results(
        "SELECT * FROM {$wpdb->prefix}subscriptions WHERE user_id = {$member->ID}"
    );
}
```

**Fix field should contain:**
```
Before:
while ($member = array_shift($member_list)) {
    $subscriptions = $wpdb->get_results(
        "SELECT * FROM {$wpdb->prefix}subscriptions WHERE user_id = {$member->ID}"
    );
}

After:
$member_ids = array_column($member_list, 'ID');
$id_placeholders = implode(',', array_fill(0, count($member_ids), '%d'));
$all_subscriptions = $wpdb->get_results(
    $wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}subscriptions WHERE user_id IN ($id_placeholders)",
        ...$member_ids
    )
);
// Group by user_id for lookup:
$subscriptions_by_user = [];
foreach ($all_subscriptions as $sub) {
    $subscriptions_by_user[$sub->user_id][] = $sub;
}
foreach ($member_list as $member) {
    $subscriptions = $subscriptions_by_user[$member->ID] ?? [];
}

Pattern: Collect all IDs first, then use a single WHERE IN (...) query to batch-load
all related rows. Use $wpdb->prepare() with placeholders for safe parameterization.
```

## Section 7: Output Format

Return all findings as a JSON array. The array must be returned even if it contains only the clean-scan or skip finding — never return an empty array or plain text.

### When patterns are found:

```json
[
  {
    "id": "PERF-N1-a3f9c2",
    "severity": "Warning",
    "category": "Performance",
    "title": "Potential N+1 query pattern [High confidence]",
    "summary": "A database query inside a loop may cause one query per iteration instead of loading all data in a single batch.",
    "detail": "File: wp-content/themes/custom-theme/template-parts/events-list.php:47\nConfidence: High\nPattern: get_post_meta() called inside foreach loop over $event_ids\nCode:\n    foreach ($event_ids as $event_id) {\n        $venue = get_post_meta($event_id, '_venue', true); // line 47\n    }",
    "location": "wp-content/themes/custom-theme/template-parts/events-list.php:47",
    "fix": "Before:\nforeach ($event_ids as $event_id) {\n    $venue = get_post_meta($event_id, '_venue', true);\n}\n\nAfter:\n$venues = [];\nforeach ($event_ids as $id) {\n    $venues[$id] = get_post_meta($id, '_venue', true);\n}\n// Then in your rendering loop:\nforeach ($events as $event) {\n    $venue = $venues[$event->ID] ?? '';\n}\n\nPattern: Pre-load all meta values before the loop, or use a single $wpdb->get_results() with WHERE meta_key = '_venue' AND post_id IN (...) to batch-load all values."
  }
]
```

### When no patterns are found (clean scan):

```json
[{
  "id": "PERF-N1-CLEAN",
  "severity": "Info",
  "category": "Performance",
  "title": "No N+1 query patterns detected",
  "summary": "No potential N+1 query patterns were found in custom theme and plugin code.",
  "detail": "Scanned {FILE_COUNT} PHP files in {THEME_DIR} and {PLUGIN_DIR}. Skipped {SKIP_COUNT} well-known third-party plugin directories. No query-inside-loop patterns detected at High or Medium confidence. {LOW_COUNT} Low confidence patterns were investigated and dismissed as false positives.",
  "location": "wp-content/themes/, wp-content/plugins/ (custom code only)",
  "fix": "No action required."
}]
```

### When LOCAL_PATH is missing or empty:

```json
[{
  "id": "PERF-N1-SKIP",
  "severity": "Info",
  "category": "Performance",
  "title": "N+1 analysis skipped — no local files",
  "summary": "N+1 detection requires locally synced PHP files to analyze.",
  "detail": "LOCAL_PATH does not exist or contains no PHP files. N+1 analysis requires the WordPress site files to be synced locally before scanning. Run /connect or /diagnose which will sync files first before running this analysis.",
  "location": "LOCAL_PATH",
  "fix": "Run /diagnose which will sync files before running this analysis. If files are already synced, verify LOCAL_PATH is set correctly in sites.json."
}]
```

## Section 8: Execution Summary

After completing analysis, output a summary to the user:

```
=== N+1 Query Pattern Analysis Complete ===

Scan scope:
- Themes directory: {THEME_DIR}
- Plugins directory: {PLUGIN_DIR}
- PHP files scanned: {FILE_COUNT}
- Well-known plugin directories skipped: {SKIP_COUNT}

Pass 1 (Pattern Grep):
- High confidence candidates: {N} files
- Medium confidence candidates: {M} files
- Low confidence candidates: {K} files

Pass 2 (AI Contextual Analysis):
- Confirmed High confidence findings: {count}
- Confirmed Medium confidence findings: {count}
- Confirmed Low confidence findings: {count}
- False positives dismissed: {count}

Total Findings: {total}
- Warning (High/Medium): {count}
- Info (Low confidence): {count}

Output: JSON findings array ready for report generation
```

## Implementation Notes

- DO NOT grep inside `node_modules/`, `vendor/`, or `.git/` — add `--exclude-dir` flags to all grep commands
- All grep commands use `2>/dev/null` to suppress permission errors on directories with restricted access
- File count for the "clean" finding: `find "$THEME_DIR" "$PLUGIN_DIR" -name "*.php" 2>/dev/null | wc -l`
- The well-known plugin skip list applies to `plugins/` subdirectory names only, not theme directories
- MD5 on macOS: use `md5` command. On Linux: use `md5sum`. Try `md5sum` first, fall back to `md5`:
  ```bash
  HASH=$(echo -n "${FILE_PATH}:${LINE}:${TYPE}" | md5sum 2>/dev/null | cut -c1-6 || \
         echo -n "${FILE_PATH}:${LINE}:${TYPE}" | md5 | cut -c1-6)
  ```
- This skill does NOT require WP-CLI — it operates entirely on locally synced PHP files
- Low confidence findings use `"severity": "Info"` — they are speculative and require user investigation
- When a file has both High and Medium confidence matches, only report the highest confidence tier for that location to avoid duplicate findings at the same line
