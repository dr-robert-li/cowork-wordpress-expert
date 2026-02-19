---
name: diagnostic-wpcli-profile
description: Integrates WP-CLI Profile command (wp-cli/profile-command package) for runtime performance timing. Shows stage breakdown (bootstrap/main_query/template) and top 5 slowest hooks. When the profile package is not installed, produces itemized Info findings for each skipped check and offers to install.
---

# Diagnostic Skill: WP-CLI Profile Integration

You use the `wp-cli/profile-command` package to measure actual PHP execution time for each WordPress load stage and identify the slowest hooks in the bootstrap stage. This is the most direct way to find which plugins are responsible for slow page loads.

## Overview

`wp-cli/profile-command` is a separately-installable WP-CLI package (not part of WP-CLI core). It instruments the WordPress request lifecycle and measures real execution time, not estimates. It reveals:

- **Stage timing** — How long each of the three WordPress load stages takes: `bootstrap`, `main_query`, and `template`. These are pipeline stages, not hook names.
  - `bootstrap` — Covers WordPress initialization: loading plugins, running `plugins_loaded`, `init`, `wp_loaded`, and all plugin init callbacks. This is where most performance problems live.
  - `main_query` — The primary WP_Query that determines what content to show.
  - `template` — Theme template loading and rendering.
- **Hook timing** — Within the bootstrap stage, which specific hooks and callbacks are slowest.

**Two stages of gating:** WP-CLI must be available first, then `wp-cli/profile-command` must be installed. Each gate has its own behavior.

**Offer before install:** This skill NEVER auto-installs `wp-cli/profile-command`. It asks the user first and respects the answer. This is a locked decision — unexpected package installs on production servers are unacceptable.

## Prerequisites

Before running checks, you need:
- Site connection profile from `sites.json` (loaded by CoWork or /diagnose)
- `WP_CLI_PREFIX` set by the /diagnose command's Source-Type Routing section
- `WP_CLI_AVAILABLE=true` (Stage 1 gate)
- `wp-cli/profile-command` installed on the server (Stage 2 gate — checked at runtime)

---

## Stage 1 Gate: WP-CLI Availability

**Check WP_CLI_AVAILABLE first.** If false, emit two separate skip findings (one per check that would have run) and stop:

```bash
if [ "$WP_CLI_AVAILABLE" != "true" ]; then
  echo '[
    {
      "id": "PERF-PROF-STAGE-SKIP",
      "severity": "Info",
      "category": "Performance",
      "title": "Stage profiling skipped — WP-CLI not available",
      "summary": "Stage profiling requires WP-CLI and wp-cli/profile-command to run.",
      "detail": "WP_CLI_AVAILABLE is false for this source type. Cannot check for wp-cli/profile-command without WP-CLI. Stage profiling measures bootstrap, main_query, and template timing — the three pipeline stages of a WordPress page load.",
      "location": "wp profile stage",
      "fix": "Install WP-CLI on the server to enable performance profiling."
    },
    {
      "id": "PERF-PROF-HOOK-SKIP",
      "severity": "Info",
      "category": "Performance",
      "title": "Hook timing skipped — WP-CLI not available",
      "summary": "Hook timing requires WP-CLI and wp-cli/profile-command to run.",
      "detail": "WP_CLI_AVAILABLE is false. Cannot run wp profile stage bootstrap for hook timing. Hook timing identifies the top 5 slowest callbacks in the bootstrap stage, showing which plugins are consuming the most time during WordPress initialization.",
      "location": "wp profile hook",
      "fix": "Install WP-CLI on the server to enable hook timing analysis."
    }
  ]'
  exit 0
fi
```

**Critical:** Emit exactly two findings (PERF-PROF-STAGE-SKIP and PERF-PROF-HOOK-SKIP) — one per skipped check. Do NOT emit a single generic skip finding.

---

## Stage 2 Gate: Profile Command Availability

Check if `wp-cli/profile-command` is installed by running `wp profile --help` and examining the exit code:

```bash
# Check if wp-cli/profile-command is installed
$WP_CLI_PREFIX profile --help > /dev/null 2>&1
PROFILE_AVAILABLE=$?
```

**If `PROFILE_AVAILABLE` is non-zero (package not installed):**

```bash
if [ $PROFILE_AVAILABLE -ne 0 ]; then
  # LOCKED: Never auto-install. Always ask the user first.
  echo "wp-cli/profile-command is not installed on the connected site."
  echo ""
  echo "This package enables:"
  echo "  - Stage profiling: bootstrap, main_query, and template timing"
  echo "  - Hook timing: top 5 slowest callbacks in the bootstrap stage"
  echo ""
  echo "Install it now? (yes/no)"
  read -r USER_RESPONSE

  if [ "$USER_RESPONSE" = "yes" ]; then
    echo "Installing wp-cli/profile-command..."
    $WP_CLI_PREFIX package install wp-cli/profile-command:@stable
    INSTALL_EXIT=$?

    # Re-check availability after install
    $WP_CLI_PREFIX profile --help > /dev/null 2>&1
    PROFILE_AVAILABLE=$?

    if [ $PROFILE_AVAILABLE -ne 0 ]; then
      # Install attempted but failed — emit skip findings with install error detail
      echo '[
        {
          "id": "PERF-PROF-STAGE-SKIP",
          "severity": "Info",
          "category": "Performance",
          "title": "Stage profiling skipped — wp-cli/profile-command install failed",
          "summary": "Stage profiling could not run because the wp-cli/profile-command package install did not succeed.",
          "detail": "Install was attempted (wp package install wp-cli/profile-command:@stable) but the package is still not available after installation. This may indicate insufficient file system permissions, a PHP version incompatibility, or network issues preventing package download from packagist.",
          "location": "wp profile stage",
          "fix": "Try manually: wp package install wp-cli/profile-command:@stable. Check WP-CLI package directory permissions. Verify PHP version compatibility (wp-cli/profile-command requires PHP 5.4+)."
        },
        {
          "id": "PERF-PROF-HOOK-SKIP",
          "severity": "Info",
          "category": "Performance",
          "title": "Hook timing skipped — wp-cli/profile-command install failed",
          "summary": "Hook timing could not run because the wp-cli/profile-command package install did not succeed.",
          "detail": "Install was attempted (wp package install wp-cli/profile-command:@stable) but the package is still not available after installation.",
          "location": "wp profile stage bootstrap --spotlight",
          "fix": "Install wp-cli/profile-command for hook timing: wp package install wp-cli/profile-command:@stable"
        }
      ]'
      exit 0
    fi
    # Install succeeded — fall through to profiling execution below

  else
    # User said no (or anything other than "yes") — emit skip findings
    echo '[
      {
        "id": "PERF-PROF-STAGE-SKIP",
        "severity": "Info",
        "category": "Performance",
        "title": "Stage profiling skipped — wp-cli/profile-command not installed",
        "summary": "Stage profiling (bootstrap/main_query/template timing) requires the wp-cli/profile-command package.",
        "detail": "The wp-cli/profile-command package is not installed. Stage profiling measures how long each WordPress load stage takes, helping identify slow plugin initialization. The bootstrap stage covers plugins_loaded, init, and wp_loaded internally.",
        "location": "wp profile stage",
        "fix": "Install wp-cli/profile-command for stage timing: wp package install wp-cli/profile-command:@stable"
      },
      {
        "id": "PERF-PROF-HOOK-SKIP",
        "severity": "Info",
        "category": "Performance",
        "title": "Hook timing skipped — wp-cli/profile-command not installed",
        "summary": "Hook timing analysis (top 5 slowest callbacks) requires the wp-cli/profile-command package.",
        "detail": "The wp-cli/profile-command package is not installed. Hook timing shows which specific callbacks in the bootstrap stage are slowest, pinpointing which plugins are responsible for slow initialization.",
        "location": "wp profile stage bootstrap --spotlight",
        "fix": "Install wp-cli/profile-command for hook timing: wp package install wp-cli/profile-command:@stable"
      }
    ]'
    exit 0
  fi
fi
```

**Critical:** The offer-to-install is an interactive prompt requiring user input. Never auto-install. User must type "yes" explicitly — any other response (including empty) results in skip findings.

---

## Profiling Execution (when profile-command is available)

Both of the following steps run when `PROFILE_AVAILABLE` is 0 (package is installed).

### Step A: Stage Timing

Measure how long each WordPress load stage takes:

```bash
STAGE_DATA=$($WP_CLI_PREFIX profile stage --format=json 2>/dev/null)

# Validate output
if [ -z "$STAGE_DATA" ] || ! echo "$STAGE_DATA" | jq empty 2>/dev/null; then
  echo '[{"id":"PERF-PROF-ERR","severity":"Warning","category":"Performance","title":"Stage profiling failed","summary":"wp profile stage returned no data.","detail":"The wp profile stage command returned empty or invalid output. This may indicate the profile command encountered an error loading WordPress, or the site has a fatal error during bootstrap.","location":"wp profile stage","fix":"Run manually to see error output: wp profile stage. Check if WordPress loads successfully: wp option get siteurl."}]'
  exit 0
fi
```

**Stage names are `bootstrap`, `main_query`, and `template`** — these are the three pipeline stages returned by `wp profile stage`. They are NOT WordPress hook names. The `bootstrap` stage internally runs `plugins_loaded`, `init`, `wp_loaded`, and all plugin activation callbacks — but these are not surfaced as stage names.

**Time string parsing:** `wp profile stage` returns time as a string like `"0.7994s"`. Strip the trailing `s` before numeric comparison:

```bash
# Parse bootstrap time for threshold evaluation
BOOTSTRAP_TIME=$(echo "$STAGE_DATA" | jq -r \
  '[.[] | select(.stage == "bootstrap")] | .[0].time // "0s"')
BOOTSTRAP_SECONDS=$(echo "$BOOTSTRAP_TIME" | sed 's/s$//' | awk '{printf "%.4f", $1}')

# Apply severity thresholds
if awk "BEGIN {exit !($BOOTSTRAP_SECONDS > 5.0)}"; then
  STAGE_SEVERITY="Critical"
elif awk "BEGIN {exit !($BOOTSTRAP_SECONDS > 2.0)}"; then
  STAGE_SEVERITY="Warning"
else
  STAGE_SEVERITY="Info"
fi
```

**Severity thresholds for bootstrap time:**
- `Info`: bootstrap <= 2.0s — acceptable performance
- `Warning`: bootstrap > 2.0s — investigate plugin initialization
- `Critical`: bootstrap > 5.0s — significant performance problem

**Build the stage summary detail string:**

```bash
# Extract each stage's time and cache ratio
BOOTSTRAP_ENTRY=$(echo "$STAGE_DATA" | jq -r \
  '[.[] | select(.stage == "bootstrap")] | .[0] | "\(.time) (\(.cache_ratio // "N/A") cache ratio)"')
MAIN_QUERY_ENTRY=$(echo "$STAGE_DATA" | jq -r \
  '[.[] | select(.stage == "main_query")] | .[0] | "\(.time) (\(.cache_ratio // "N/A") cache ratio)"')
TEMPLATE_ENTRY=$(echo "$STAGE_DATA" | jq -r \
  '[.[] | select(.stage == "template")] | .[0] | "\(.time) (\(.cache_ratio // "N/A") cache ratio)"')

STAGE_DETAIL="Stage timing results:
  bootstrap:   ${BOOTSTRAP_ENTRY}  — covers plugins_loaded, init, wp_loaded
  main_query:  ${MAIN_QUERY_ENTRY}
  template:    ${TEMPLATE_ENTRY}

Total: ${BOOTSTRAP_TIME} + ${MAIN_QUERY_TIME} + ${TEMPLATE_TIME}

Note: The 'bootstrap' stage contains all plugin initialization, including plugins_loaded, init, and wp_loaded hooks. It accounts for most page-load overhead on plugin-heavy sites."
```

**Finding ID:** `PERF-PROF-STAGE` — single finding with all three stages in detail.

```bash
STAGE_FIX="No action required — bootstrap time is within acceptable range."
if [ "$STAGE_SEVERITY" != "Info" ]; then
  STAGE_FIX="Bootstrap time of ${BOOTSTRAP_TIME} indicates slow plugin initialization. Run hook timing analysis to identify specific slow callbacks. Common causes: slow database queries in init hooks, external HTTP requests during plugin load, uncached heavy computations. Consider: wp profile stage bootstrap --spotlight to see which hooks in bootstrap are slowest."
fi

STAGE_FINDING="{\"id\":\"PERF-PROF-STAGE\",\"severity\":\"${STAGE_SEVERITY}\",\"category\":\"Performance\",\"title\":\"WordPress stage profiling complete (bootstrap: ${BOOTSTRAP_TIME})\",\"summary\":\"Stage profiling measured how long each WordPress load stage took to execute.\",\"detail\":\"${STAGE_DETAIL}\",\"location\":\"wp profile stage\",\"fix\":\"${STAGE_FIX}\"}"
```

---

### Step B: Top 5 Slowest Hooks in Bootstrap

Identify which specific hooks in the bootstrap stage are consuming the most time:

```bash
HOOK_DATA=$($WP_CLI_PREFIX profile stage bootstrap \
  --fields=hook,time,cache_ratio \
  --spotlight \
  --format=json 2>/dev/null)
```

**Note on `--spotlight`:** The `--spotlight` flag returns only hooks with measurable execution time (non-zero time), filtering out the full list of hooks that fired but had negligible cost. This keeps the output focused on actionable findings.

**Sort by time descending and take top 5:**

```bash
# Time is returned as string "0.2340s" — strip "s" for numeric sort
TOP_HOOKS=$(echo "$HOOK_DATA" | jq \
  '[.[] | .time_numeric = (.time | gsub("s";"") | tonumber)] |
  sort_by(.time_numeric) | reverse | .[0:5]')
```

**Determine severity:** If any hook exceeds 0.5 seconds, set severity to Warning. Otherwise Info.

```bash
MAX_HOOK_TIME=$(echo "$TOP_HOOKS" | jq -r '[.[].time_numeric] | max // 0')
if awk "BEGIN {exit !($MAX_HOOK_TIME > 0.5)}"; then
  HOOK_SEVERITY="Warning"
else
  HOOK_SEVERITY="Info"
fi
```

**Build hook detail string:**

```bash
HOOK_TABLE=$(echo "$TOP_HOOKS" | jq -r \
  'to_entries[] | "  \(.key + 1). \(.value.hook)\t\(.value.time)"' | \
  column -t)

HOOK_DETAIL="Top 5 slowest hooks in bootstrap stage:
${HOOK_TABLE}

Hooks with over 0.5s execution time indicate potential performance problems. Each hook represents a specific moment in WordPress initialization where plugin callbacks run. The slowest hooks are the best starting point for optimization investigation."
```

**Example output:**
```
Top 5 slowest hooks in bootstrap stage:
  1. plugins_loaded     0.2340s
  2. init               0.1823s
  3. wp_loaded          0.0934s
  4. after_setup_theme  0.0234s
  5. widgets_init       0.0123s
```

**Finding ID:** `PERF-PROF-HOOK` — single finding listing top 5 hooks with times.

```bash
HOOK_FIX="No hooks exceeded 0.5s — bootstrap hook execution appears healthy."
if [ "$HOOK_SEVERITY" = "Warning" ]; then
  HOOK_FIX="One or more hooks exceeded 0.5s. To identify which plugin is responsible: (1) Search the codebase for add_action() calls on the slow hook name. (2) Temporarily deactivate plugins and re-profile to binary-search for the culprit. (3) Use wp profile hook {hook_name} for deeper per-callback breakdown of that specific hook."
fi

HOOK_FINDING="{\"id\":\"PERF-PROF-HOOK\",\"severity\":\"${HOOK_SEVERITY}\",\"category\":\"Performance\",\"title\":\"Bootstrap hook timing analysis complete\",\"summary\":\"Identified the top 5 slowest hooks in the WordPress bootstrap stage.\",\"detail\":\"${HOOK_DETAIL}\",\"location\":\"wp profile stage bootstrap --spotlight\",\"fix\":\"${HOOK_FIX}\"}"
```

---

## Output Assembly

```bash
FINDINGS=()
FINDINGS+=("$STAGE_FINDING")
FINDINGS+=("$HOOK_FINDING")

printf '['
for i in "${!FINDINGS[@]}"; do
  printf '%s' "${FINDINGS[$i]}"
  if [ $i -lt $((${#FINDINGS[@]} - 1)) ]; then
    printf ','
  fi
done
printf ']'
```

---

## Output Format

Return findings as a JSON array. All findings use the standard 8-field format. Category is always `"Performance"`.

**Fields for every finding:**
- `id` (string) — Finding ID (see reference table below)
- `severity` (string) — `"Critical"`, `"Warning"`, or `"Info"`
- `category` (string) — `"Performance"`
- `title` (string) — Short descriptive title
- `summary` (string) — One non-technical sentence explaining the finding
- `detail` (string) — Technical detail with exact timing values and context
- `location` (string) — WP-CLI command that produced the data
- `fix` (string) — Specific remediation steps

**Example complete output (profile available, warning-level bootstrap):**
```json
[
  {
    "id": "PERF-PROF-STAGE",
    "severity": "Warning",
    "category": "Performance",
    "title": "WordPress stage profiling complete (bootstrap: 2.4532s)",
    "summary": "Stage profiling measured how long each WordPress load stage took to execute.",
    "detail": "Stage timing results:\n  bootstrap:   2.4532s (93.21% cache ratio)  — covers plugins_loaded, init, wp_loaded\n  main_query:  0.0234s (97.81% cache ratio)\n  template:    0.1205s (91.45% cache ratio)\n\nBootstrap time of 2.45s exceeds the 2.0s warning threshold.",
    "location": "wp profile stage",
    "fix": "Bootstrap time indicates slow plugin initialization. Run hook timing analysis to identify specific slow callbacks."
  },
  {
    "id": "PERF-PROF-HOOK",
    "severity": "Warning",
    "category": "Performance",
    "title": "Bootstrap hook timing analysis complete",
    "summary": "Identified the top 5 slowest hooks in the WordPress bootstrap stage.",
    "detail": "Top 5 slowest hooks in bootstrap stage:\n  1. plugins_loaded     0.8234s\n  2. init               0.7823s\n  3. wp_loaded          0.4934s\n  4. after_setup_theme  0.1234s\n  5. widgets_init       0.0523s\n\nHooks with over 0.5s execution indicate potential performance problems.",
    "location": "wp profile stage bootstrap --spotlight",
    "fix": "Hooks 'plugins_loaded' and 'init' exceeded 0.5s. Search codebase for add_action() calls on these hooks to identify slow plugin callbacks. Consider deactivating plugins temporarily to binary-search for the culprit."
  }
]
```

**Example output when profile-command not installed (user declined install):**
```json
[
  {
    "id": "PERF-PROF-STAGE-SKIP",
    "severity": "Info",
    "category": "Performance",
    "title": "Stage profiling skipped — wp-cli/profile-command not installed",
    "summary": "Stage profiling (bootstrap/main_query/template timing) requires the wp-cli/profile-command package.",
    "detail": "The wp-cli/profile-command package is not installed. Stage profiling measures how long each WordPress load stage takes, helping identify slow plugin initialization.",
    "location": "wp profile stage",
    "fix": "Install wp-cli/profile-command for stage timing: wp package install wp-cli/profile-command:@stable"
  },
  {
    "id": "PERF-PROF-HOOK-SKIP",
    "severity": "Info",
    "category": "Performance",
    "title": "Hook timing skipped — wp-cli/profile-command not installed",
    "summary": "Hook timing analysis (top 5 slowest callbacks) requires the wp-cli/profile-command package.",
    "detail": "The wp-cli/profile-command package is not installed. Hook timing shows which specific callbacks in the bootstrap stage are slowest.",
    "location": "wp profile stage bootstrap --spotlight",
    "fix": "Install wp-cli/profile-command for hook timing: wp package install wp-cli/profile-command:@stable"
  }
]
```

---

## Finding IDs Reference

| ID | Severity | Trigger |
|----|----------|---------|
| PERF-PROF-STAGE | Info/Warning/Critical | Stage timing results (bootstrap thresholds determine severity) |
| PERF-PROF-HOOK | Info/Warning | Top 5 hook timing results (Warning if any hook > 0.5s) |
| PERF-PROF-STAGE-SKIP | Info | Stage profiling skipped (WP-CLI unavailable OR package not installed) |
| PERF-PROF-HOOK-SKIP | Info | Hook timing skipped (WP-CLI unavailable OR package not installed) |
| PERF-PROF-ERR | Warning | wp profile stage returned invalid/empty output |

**Skip finding IDs are always emitted as a pair** — one PERF-PROF-STAGE-SKIP and one PERF-PROF-HOOK-SKIP. Never a single combined skip finding.

---

## Error Handling

- **WP-CLI unavailable (Stage 1):** Emit PERF-PROF-STAGE-SKIP + PERF-PROF-HOOK-SKIP, exit
- **Profile command not installed:** Ask user. On "yes" → attempt install → re-check. On anything else → emit skip pair, exit
- **Install failed:** Emit skip pair with install error in detail field, exit
- **Profile command runs but returns empty/invalid JSON:** Emit PERF-PROF-ERR, exit
- **Hook data empty:** Skip PERF-PROF-HOOK finding — emit only PERF-PROF-STAGE

## Notes

- Use `$WP_CLI_PREFIX` for all WP-CLI invocations — never call `wp` or `wp profile` directly
- Stage names are `bootstrap`, `main_query`, `template` — these are WP-CLI Profile stage names, NOT WordPress hook names
- The `bootstrap` stage contains the `plugins_loaded`, `init`, and `wp_loaded` hooks internally — always explain this in output so users understand what "bootstrap" means
- Time strings from `wp profile stage` use format `"0.7994s"` — use `gsub("s";"") | tonumber` in jq for numeric comparison, not string comparison
- The `--spotlight` flag on `wp profile stage bootstrap` returns only hooks with non-zero execution time — this is the correct approach for finding slow hooks
- This skill is NOT in the `WP_CLI_SKILLS` array — it manages its own gating internally due to the two-stage check and interactive install prompt
- Profiling adds real load to the server (it runs a full WordPress request). Avoid running during peak traffic on production sites.
