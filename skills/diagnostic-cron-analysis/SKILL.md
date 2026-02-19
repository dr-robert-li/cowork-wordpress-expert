---
name: diagnostic-cron-analysis
description: Analyzes WordPress wp-cron scheduled events for health issues including overdue events (>1 hour), duplicate hook registrations, and excessively frequent intervals (<5 minutes). Requires WP-CLI. Self-gates when WP-CLI is unavailable.
---

# Diagnostic Skill: wp-cron Event Analysis

You analyze WordPress scheduled events (wp-cron) for three categories of health issues: overdue events, duplicate hook registrations, and excessively frequent intervals. WordPress cron is pseudo-cron — events only fire when a visitor loads the site, so problems can accumulate silently.

## Overview

WordPress wp-cron is triggered by page loads, not a real system cron daemon. This means:

- **Overdue events** — If traffic is low (overnight, weekends), scheduled events may not run on time. Events overdue by more than an hour indicate a cron health problem that could affect backups, email sending, plugin updates, and other time-sensitive operations.
- **Duplicate hooks** — Plugins sometimes register the same cron hook multiple times, either due to bugs or missed deregistration during deactivation. This causes redundant execution and unnecessary server load.
- **Excessive frequency** — Some plugins register cron events with intervals under 5 minutes (300 seconds). Events running every 30–60 seconds add persistent background load, even for low-traffic sites.

**Source type note:** This skill requires a live WordPress database. It must NOT run on `git` source types (no live DB). It self-gates when `WP_CLI_AVAILABLE` is false.

## Prerequisites

Before running checks, you need:
- Site connection profile from `sites.json` (loaded by CoWork or /diagnose)
- `WP_CLI_PREFIX` set by the /diagnose command's Source-Type Routing section
- `WP_CLI_AVAILABLE=true` (this skill requires WP-CLI for all checks)
- Source type must NOT be `git`

## Self-Gate: WP-CLI Availability Check

**This is the first thing to run.** If `WP_CLI_AVAILABLE` is false, emit the skip finding and stop immediately:

```bash
if [ "$WP_CLI_AVAILABLE" != "true" ]; then
  echo '[{"id":"PERF-CRON-SKIP","severity":"Info","category":"Performance","title":"Cron analysis skipped — WP-CLI not available","summary":"Cron event analysis requires WP-CLI to query the database.","detail":"WP_CLI_AVAILABLE is false. This check requires running wp cron event list which needs WP-CLI and a live WordPress database. Git sources and sources without WP-CLI configured cannot query cron event data.","location":"wp-cron","fix":"Install WP-CLI on the server or connect via SSH or Docker source type with WP-CLI available."}]'
  exit 0
fi
```

## Data Collection

Retrieve all scheduled cron events as JSON:

```bash
CRON_EVENTS=$($WP_CLI_PREFIX cron event list \
  --fields=hook,next_run_gmt,recurrence,interval,schedule \
  --format=json 2>/dev/null)

# Validate JSON response
if [ -z "$CRON_EVENTS" ] || ! echo "$CRON_EVENTS" | jq empty 2>/dev/null; then
  echo '[{"id":"PERF-CRON-ERR","severity":"Warning","category":"Performance","title":"Cron event list failed","summary":"Could not retrieve wp-cron events from the database.","detail":"wp cron event list returned empty or invalid JSON output. This may indicate a database connectivity issue, a corrupted cron option, or WP-CLI version incompatibility.","location":"wp-cron","fix":"Verify WP-CLI database access with: wp db check. Ensure the cron option exists with: wp option get cron. If the cron option is corrupted, consider: wp cron event run --due-now to attempt recovery."}]'
  exit 0
fi

# Get current UTC epoch for overdue comparison
CURRENT_EPOCH=$(date +%s)

# Count total events for reporting
TOTAL_EVENTS=$(echo "$CRON_EVENTS" | jq 'length')
```

## Cross-Platform Date Conversion

`next_run_gmt` is returned as a UTC string (e.g., `"2024-01-15 03:00:00"`). Convert to Unix epoch for comparison. Handle the difference between Linux `date -d` and macOS `date -j -f`:

```bash
# Cross-platform epoch conversion function
gmt_to_epoch() {
  local gmt_str="$1"
  # Try Linux date -d first
  local epoch
  epoch=$(date -d "$gmt_str" +%s 2>/dev/null)
  if [ -n "$epoch" ] && [ "$epoch" != "0" ]; then
    echo "$epoch"
    return
  fi
  # Fall back to macOS date -j -f
  epoch=$(date -j -f "%Y-%m-%d %H:%M:%S" "$gmt_str" +%s 2>/dev/null)
  if [ -n "$epoch" ]; then
    echo "$epoch"
    return
  fi
  # Both failed — return 0 (will not trigger overdue threshold)
  echo "0"
}
```

---

## Check 1: Overdue Events (>1 hour = 3600 seconds past next_run_gmt)

An event is overdue when its `next_run_gmt` is in the past by more than 3600 seconds (1 hour). Severity escalates to Critical if overdue by more than 24 hours (86400 seconds).

```bash
FINDINGS_OVERDUE=()

# Get events where next_run_gmt appears to be past events (use jq to extract candidates)
# Process each event individually for cross-platform date conversion
while IFS= read -r event_json; do
  HOOK=$(echo "$event_json" | jq -r '.hook')
  NEXT_RUN=$(echo "$event_json" | jq -r '.next_run_gmt')
  SCHEDULE=$(echo "$event_json" | jq -r '.schedule // "Non-repeating"')

  EVENT_EPOCH=$(gmt_to_epoch "$NEXT_RUN")

  # Skip if epoch conversion failed (returns 0)
  if [ "$EVENT_EPOCH" -eq 0 ]; then
    continue
  fi

  OVERDUE_SECONDS=$((CURRENT_EPOCH - EVENT_EPOCH))

  if [ "$OVERDUE_SECONDS" -gt 3600 ]; then
    OVERDUE_HOURS=$(awk "BEGIN {printf \"%.1f\", $OVERDUE_SECONDS / 3600}")

    if [ "$OVERDUE_SECONDS" -gt 86400 ]; then
      SEVERITY="Critical"
      OVERDUE_DAYS=$(awk "BEGIN {printf \"%.1f\", $OVERDUE_SECONDS / 86400}")
      OVERDUE_DESC="${OVERDUE_DAYS} days"
    else
      SEVERITY="Warning"
      OVERDUE_DESC="${OVERDUE_HOURS} hours"
    fi

    FINDINGS_OVERDUE+=("{\"id\":\"PERF-CRON-OVRD\",\"severity\":\"${SEVERITY}\",\"category\":\"Performance\",\"title\":\"Overdue wp-cron event: ${HOOK} (${OVERDUE_DESC} overdue)\",\"summary\":\"A scheduled WordPress cron event has not run and is significantly overdue, which may indicate a broken cron system.\",\"detail\":\"Hook '${HOOK}' (schedule: ${SCHEDULE}) was due at ${NEXT_RUN} UTC and is ${OVERDUE_DESC} overdue. wp-cron events only run when the site receives visitor traffic — on low-traffic sites, events can fall significantly behind. If multiple events are overdue, consider setting up a real system cron: \\\"wp cron event run\\\" triggered every 5 minutes via crontab.\",\"location\":\"wp-cron\",\"fix\":\"For immediate catch-up: wp cron event run ${HOOK}. To prevent future overdue events on low-traffic sites, add a real system cron via crontab: \\\"*/5 * * * * curl -s https://yoursite.com/wp-cron.php?doing_wp_cron >/dev/null\\\" or use WP-CLI: \\\"*/5 * * * * wp cron event run --due-now\\\"\"}")
  fi
done < <(echo "$CRON_EVENTS" | jq -c '.[]')
```

**Finding ID:** `PERF-CRON-OVRD` — one finding per overdue event, hook name in title and detail.

**Severity thresholds:**
- `Warning`: overdue by 1–24 hours
- `Critical`: overdue by more than 24 hours

---

## Check 2: Duplicate Hooks (same hook name registered more than once)

Find cron hooks appearing more than once in the event list. This indicates a plugin registered itself multiple times without deregistering first, or failed to clean up on deactivation.

```bash
DUPLICATES=$(echo "$CRON_EVENTS" | jq \
  '[group_by(.hook)[] | select(length > 1) | {hook: .[0].hook, count: length, events: .}]')

FINDINGS_DUPLICATES=()

# Process each duplicate group
while IFS= read -r dup_json; do
  HOOK=$(echo "$dup_json" | jq -r '.hook')
  COUNT=$(echo "$dup_json" | jq -r '.count')
  SCHEDULES=$(echo "$dup_json" | jq -r '.events[].schedule // "Non-repeating"' | sort | uniq | tr '\n' ', ' | sed 's/,$//')

  FINDINGS_DUPLICATES+=("{\"id\":\"PERF-CRON-DUP\",\"severity\":\"Warning\",\"category\":\"Performance\",\"title\":\"Duplicate wp-cron hook: ${HOOK} (${COUNT} instances)\",\"summary\":\"The same cron hook is registered multiple times, causing redundant executions and unnecessary server load.\",\"detail\":\"Hook '${HOOK}' is registered ${COUNT} times in the cron table (schedules: ${SCHEDULES}). This typically indicates a plugin that adds itself multiple times without deregistering first, or missed deregistration during plugin deactivation. Each registered instance will fire independently, multiplying the work done by that cron handler.\",\"location\":\"wp-cron\",\"fix\":\"Identify which plugin registers this hook (search codebase for wp_schedule_event with hook name '${HOOK}'). Ensure the plugin calls wp_clear_scheduled_hook before registering a new event, and removes events on deactivation. To manually clear all instances: wp cron event delete ${HOOK}\"}")
done < <(echo "$DUPLICATES" | jq -c '.[]' 2>/dev/null)
```

**Finding ID:** `PERF-CRON-DUP` — one finding per duplicate hook name, not per duplicate instance.

**Example finding:**
```json
{
  "id": "PERF-CRON-DUP",
  "severity": "Warning",
  "category": "Performance",
  "title": "Duplicate wp-cron hook: publish_future_post (3 instances)",
  "summary": "The same cron hook is registered multiple times, causing redundant executions and unnecessary server load.",
  "detail": "Hook 'publish_future_post' is registered 3 times in the cron table (schedules: hourly). This typically indicates a plugin that adds itself multiple times without deregistering first, or missed deregistration during plugin deactivation. Each registered instance will fire independently, multiplying the work done by that cron handler.",
  "location": "wp-cron",
  "fix": "Identify which plugin registers this hook (search codebase for wp_schedule_event with hook name 'publish_future_post'). Ensure the plugin calls wp_clear_scheduled_hook before registering a new event, and removes events on deactivation. To manually clear all instances: wp cron event delete publish_future_post"
}
```

---

## Check 3: Excessive Frequency (interval < 300 seconds = 5 minutes)

Find recurring events with intervals under 5 minutes. **Critical:** Only check recurring events — events with `interval: 0` or `recurrence: "Non-repeating"` run once and must be excluded from this check.

The `interval > 0` condition in the jq filter enforces this:

```bash
FREQUENT=$(echo "$CRON_EVENTS" | jq \
  '[.[] | select(.interval > 0 and .interval < 300)]')

FINDINGS_FREQUENT=()

while IFS= read -r freq_json; do
  HOOK=$(echo "$freq_json" | jq -r '.hook')
  INTERVAL=$(echo "$freq_json" | jq -r '.interval')
  SCHEDULE=$(echo "$freq_json" | jq -r '.schedule // "custom"')
  INTERVAL_DISPLAY="${INTERVAL}s"

  # Format interval for human readability
  if [ "$INTERVAL" -ge 60 ]; then
    INTERVAL_MIN=$(awk "BEGIN {printf \"%.0f\", $INTERVAL / 60}")
    INTERVAL_DISPLAY="${INTERVAL_MIN} minutes (${INTERVAL}s)"
  fi

  FINDINGS_FREQUENT+=("{\"id\":\"PERF-CRON-FREQ\",\"severity\":\"Warning\",\"category\":\"Performance\",\"title\":\"Excessive cron frequency: ${HOOK} (every ${INTERVAL_DISPLAY})\",\"summary\":\"A cron event is scheduled to run more frequently than every 5 minutes, adding persistent background load to the server.\",\"detail\":\"Hook '${HOOK}' (schedule: ${SCHEDULE}) fires every ${INTERVAL_DISPLAY}. Events running more frequently than every 5 minutes (300 seconds) create persistent background load — on shared hosting, this can trigger rate limiting or host complaints. On any server, sub-5-minute intervals are rarely justified by actual business requirements.\",\"location\":\"wp-cron\",\"fix\":\"Review the plugin that registers '${HOOK}' and determine if this frequency is genuinely required. Most tasks (cache refreshes, feed updates, health checks) can safely run every 15–60 minutes. To change the interval, the plugin's source code or its settings must be updated — intervals are not configurable via wp-cron directly. If the plugin is abandoned or misconfigured, consider: wp cron event delete ${HOOK}\"}")
done < <(echo "$FREQUENT" | jq -c '.[]' 2>/dev/null)
```

**Finding ID:** `PERF-CRON-FREQ` — one finding per excessively frequent event.

**Threshold:** `interval > 0 AND interval < 300` — the `interval > 0` guard excludes non-repeating events.

---

## Clean Finding (no issues detected)

When no overdue events, no duplicates, and no excessive frequency events are found, emit a single Info finding:

```json
{
  "id": "PERF-CRON-OK",
  "severity": "Info",
  "category": "Performance",
  "title": "wp-cron schedule is healthy",
  "summary": "No overdue, duplicate, or excessively frequent cron events detected.",
  "detail": "Analyzed {COUNT} scheduled cron events. All events are on-schedule, unique, and use reasonable intervals (5 minutes or longer). No action required.",
  "location": "wp-cron",
  "fix": "No action required. Monitor cron health if traffic drops significantly (overdue events may accumulate on low-traffic sites)."
}
```

---

## Output Assembly

Collect all findings and emit as a JSON array:

```bash
ALL_FINDINGS=()

# Add overdue findings
ALL_FINDINGS+=("${FINDINGS_OVERDUE[@]}")

# Add duplicate findings
ALL_FINDINGS+=("${FINDINGS_DUPLICATES[@]}")

# Add excessive frequency findings
ALL_FINDINGS+=("${FINDINGS_FREQUENT[@]}")

# If no issues found, emit clean finding
if [ ${#ALL_FINDINGS[@]} -eq 0 ]; then
  CLEAN="{\"id\":\"PERF-CRON-OK\",\"severity\":\"Info\",\"category\":\"Performance\",\"title\":\"wp-cron schedule is healthy\",\"summary\":\"No overdue, duplicate, or excessively frequent cron events detected.\",\"detail\":\"Analyzed ${TOTAL_EVENTS} scheduled cron events. All events are on-schedule, unique, and use reasonable intervals (5 minutes or longer).\",\"location\":\"wp-cron\",\"fix\":\"No action required.\"}"
  ALL_FINDINGS+=("$CLEAN")
fi

# Build JSON array
printf '['
for i in "${!ALL_FINDINGS[@]}"; do
  printf '%s' "${ALL_FINDINGS[$i]}"
  if [ $i -lt $((${#ALL_FINDINGS[@]} - 1)) ]; then
    printf ','
  fi
done
printf ']'
```

---

## Output Format

Return findings as a JSON array. Each triggered check generates one finding per affected event (overdue/duplicate/frequent). All findings must include these 8 fields:

- `id` (string) — `PERF-CRON-OVRD`, `PERF-CRON-DUP`, `PERF-CRON-FREQ`, `PERF-CRON-OK`, `PERF-CRON-SKIP`, or `PERF-CRON-ERR`
- `severity` (string) — `"Critical"`, `"Warning"`, or `"Info"`
- `category` (string) — `"Performance"`
- `title` (string) — Short descriptive title including hook name
- `summary` (string) — One non-technical sentence explaining the finding
- `detail` (string) — Technical detail with exact values, intervals, and context
- `location` (string) — `"wp-cron"`
- `fix` (string) — Specific remediation steps with WP-CLI commands

**Example complete output (mixed issues):**
```json
[
  {
    "id": "PERF-CRON-OVRD",
    "severity": "Critical",
    "category": "Performance",
    "title": "Overdue wp-cron event: wp_scheduled_delete (26.3 days overdue)",
    "summary": "A scheduled WordPress cron event has not run and is significantly overdue, which may indicate a broken cron system.",
    "detail": "Hook 'wp_scheduled_delete' (schedule: daily) was due at 2024-01-15 03:00:00 UTC and is 26.3 days overdue.",
    "location": "wp-cron",
    "fix": "For immediate catch-up: wp cron event run wp_scheduled_delete. To prevent future overdue events, add a real system cron."
  },
  {
    "id": "PERF-CRON-DUP",
    "severity": "Warning",
    "category": "Performance",
    "title": "Duplicate wp-cron hook: my_plugin_cleanup (3 instances)",
    "summary": "The same cron hook is registered multiple times, causing redundant executions and unnecessary server load.",
    "detail": "Hook 'my_plugin_cleanup' is registered 3 times in the cron table (schedules: hourly).",
    "location": "wp-cron",
    "fix": "Identify which plugin registers this hook and ensure it calls wp_clear_scheduled_hook before registering."
  },
  {
    "id": "PERF-CRON-FREQ",
    "severity": "Warning",
    "category": "Performance",
    "title": "Excessive cron frequency: woocommerce_cleanup_sessions (every 2 minutes (120s))",
    "summary": "A cron event is scheduled to run more frequently than every 5 minutes, adding persistent background load to the server.",
    "detail": "Hook 'woocommerce_cleanup_sessions' (schedule: custom) fires every 2 minutes (120s).",
    "location": "wp-cron",
    "fix": "Review the plugin that registers this hook and determine if this frequency is genuinely required."
  }
]
```

## Finding IDs Reference

| ID | Severity | Trigger |
|----|----------|---------|
| PERF-CRON-OVRD | Warning/Critical | Event overdue by >1 hour (Critical if >24 hours) |
| PERF-CRON-DUP | Warning | Same hook name registered more than once |
| PERF-CRON-FREQ | Warning | Recurring event with interval < 300 seconds |
| PERF-CRON-OK | Info | All checks pass — cron schedule is healthy |
| PERF-CRON-SKIP | Info | WP-CLI not available — skill self-gated |
| PERF-CRON-ERR | Warning | wp cron event list returned invalid output |

## Error Handling

Each failed check produces an error finding rather than aborting the entire skill:

- **WP-CLI unavailable:** `PERF-CRON-SKIP` — Info, self-gate, return immediately
- **Event list failure:** `PERF-CRON-ERR` — Warning, explains likely cause, suggests `wp db check`
- **Date conversion failure:** Skip that individual event (epoch returns 0), do not abort

## Notes

- Use `$WP_CLI_PREFIX` for all WP-CLI invocations — never call `wp` directly
- Events with `interval: 0` or `recurrence: "Non-repeating"` are single-shot events; they must NOT be checked for excessive frequency
- The `gmt_to_epoch()` function handles both Linux (`date -d`) and macOS (`date -j -f`) — the fallback matters for local development environments
- One finding per affected event (not one aggregate finding) — the report consumer needs individual hook names to take action
- All `next_run_gmt` values from WP-CLI are in UTC; `date +%s` on the host must also produce UTC epoch (standard behavior on all platforms)
