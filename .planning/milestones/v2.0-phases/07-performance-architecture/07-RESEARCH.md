# Phase 7: Performance & Architecture - Research

**Researched:** 2026-02-19
**Domain:** WordPress performance detection (N+1 patterns, wp-cron, WP-CLI Profile) and architecture review (CPT misuse, hook abuse, caching anti-patterns, synthesized narrative)
**Confidence:** HIGH

## Summary

Phase 7 adds three performance skills and one architecture skill, plus wires them into `/diagnose` and produces a synthesized narrative skill. All work is SKILL.md authoring — no new infrastructure changes, no new tool dependencies. The performance skills split into two tiers: static analysis skills (N+1 detection, hook abuse, CPT misuse, caching anti-patterns) that operate on locally synced PHP files without needing WP-CLI, and live-data skills (wp-cron analysis, WP-CLI Profile integration) that require WP-CLI.

The most technically nuanced deliverable is the WP-CLI Profile integration: `wp profile` is a separately-installable package (`wp-cli/profile-command`), not part of WP-CLI core. The correct availability check is `$WP_CLI_PREFIX profile --help` with exit code inspection — not `wp package list` (which requires network access and is slow). When unavailable, each skipped check becomes an individual Info finding rather than a generic error.

The synthesized narrative (ARCH-03) is a new kind of skill that is a reader/aggregator rather than a probe — it reads from `memory/{site}/latest.md` (or the combined findings JSON from the current scan) to synthesize an A-F health grade with a bullet-point cross-domain summary and "Top 3 issues to fix first." This is the only skill in the codebase that aggregates across domains rather than running new checks.

**Primary recommendation:** Build five SKILL.md files (`diagnostic-performance-n1`, `diagnostic-cron-analysis`, `diagnostic-wpcli-profile`, `diagnostic-architecture`, `diagnostic-arch-narrative`) and register them in `/diagnose` under a new `performance` mode alongside `full` mode. Use the established `WP_CLI_PREFIX` pattern for live-data skills and grep-on-synced-files for static analysis skills.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**N+1 Detection Confidence:**
- Pattern-based confidence tiers: High = query inside foreach/while loop, Medium = get_post inside loop, Low = multiple sequential queries on same table
- Scope: custom code only, skip well-known plugins (WooCommerce, Yoast, etc.) that users can't fix — consistent with architecture analysis scope
- Findings include flag + specific rewrite suggestion using actual variable names from the code
- Cron analysis triggers on: events overdue by >1 hour, duplicate hooks, and intervals under 5 minutes

**WP-CLI Profile Degradation:**
- Detection: run `wp profile --help` and check exit code — simplest, works regardless of install method
- When unavailable: skip with itemized list — each skipped check (hook timing, stage profiling) shown as individual Info finding with "Install wp-cli/profile-command for..." message
- Offer to install: ask the user "wp-cli/profile-command is not installed. Install it now?" before attempting — never auto-install
- When available: show stage breakdown (plugins_loaded, init, template_redirect, etc.) with times PLUS top 5 slowest hooks

**Architecture Report Depth:**
- CPT misuse: pattern-based detection — flag CPTs that register but have zero/very few posts (dead CPTs) AND CPTs with excessive rows relative to their purpose
- Hook abuse: flag expensive operations on 'init'/'wp_loaded', same hook+priority from different plugins, hooks with >20 callbacks
- Caching anti-patterns: check if persistent object cache is installed, flag direct DB queries that could use transients, flag transients used as permanent storage
- Architecture scope: same as N+1 — custom code only, skip well-known plugins

**Synthesized Narrative Style:**
- Format: bullet-point summary grouped by domain, NOT prose paragraphs
- Include overall A-F site health grade at the top (same grading matrix as existing reports)
- Scope: pull findings from ALL previous diagnostic runs (security, code quality, DB health) — true cross-domain summary
- End with "Top 3 issues to fix first" ranked by impact — actionable takeaway

### Claude's Discretion

- Exact N+1 pattern regex and matching logic
- Which plugins count as "well-known" for skip list
- WP-CLI Profile stage timing thresholds for warnings
- CPT row count thresholds for "excessive"
- Hook callback count threshold details
- Object cache detection method

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-01 | User can detect potential N+1 query patterns in theme/plugin code with confidence tiers (high/medium/low) | grep-on-synced-files: three regex passes for High/Medium/Low patterns; custom code only (WP.org plugin skip list); findings include before/after rewrite with actual variable names from file |
| PERF-02 | User can analyze wp-cron scheduled events for issues (overdue, duplicate, excessive frequency) | `$WP_CLI_PREFIX cron event list --fields=hook,next_run_gmt,recurrence,interval --format=json`; compare next_run_gmt to current time for overdue; group by hook name for duplicates; check interval value for <5min |
| PERF-03 | Plugin integrates WP-CLI Profile command for runtime performance data (with graceful degradation when unavailable) | `$WP_CLI_PREFIX profile --help` exit code check; `wp profile stage --format=json` for stage breakdown; `wp profile stage bootstrap --fields=hook,time --spotlight --format=json` for top hooks; individual Info findings when unavailable |
| ARCH-01 | User can detect CPT misuse patterns (excessive post types, misuse as data store with DB row-count gating) | `$WP_CLI_PREFIX post-type list --format=json` for registered CPTs; `$WP_CLI_PREFIX post list --post_type={cpt} --format=count` for row counts; grep on synced PHP for CPT registrations (custom code only) |
| ARCH-02 | User can detect hook abuse patterns (excessive actions/filters, priority conflicts) | grep-on-synced-files: `add_action`/`add_filter` patterns; count callbacks per hook; detect 'init'/'wp_loaded' with expensive function calls; detect same hook+priority cross-plugin; custom code only |
| ARCH-03 | Plugin produces AI-synthesized architecture narrative summarizing structural health | Read `memory/{site}/latest.md` plus current scan findings JSON; apply existing A-F grading matrix; output bullet-point grouped summary + "Top 3 issues to fix first" |
</phase_requirements>

## Standard Stack

### Core (All Existing — No New Dependencies)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| WP-CLI | 2.x | `wp cron event list`, `wp post-type list`, `wp post list --format=count`, `wp cache type` | Established Phase 5/6 pattern via `WP_CLI_PREFIX` |
| wp-cli/profile-command | latest stable | `wp profile stage`, `wp profile hook` — runtime performance timing | Optional package; graceful degradation when absent |
| Bash | 3.2+ | Skill execution, grep pattern matching, JSON parsing | Used throughout all existing skills |
| jq | 1.6+ | Parsing WP-CLI JSON output, findings assembly | Used everywhere in the plugin |
| grep | POSIX | Static analysis on synced PHP files — N+1 patterns, hook abuse, caching anti-patterns | Already used in malware-scan, code-quality, https-audit skills |

### No New Dependencies

This phase adds zero new tools. The entire implementation is authoring new SKILL.md files using tools already present in the codebase, plus optionally installing `wp-cli/profile-command` on the target environment (user-prompted, never automatic).

### WP-CLI Profile Command: Key Facts

- **Package name:** `wp-cli/profile-command`
- **Install command:** `wp package install wp-cli/profile-command:@stable`
- **Availability check:** `$WP_CLI_PREFIX profile --help` — exit 0 = installed, non-zero = not installed
- **Subcommands used:**
  - `wp profile stage --format=json` — overall stage timing (bootstrap, main_query, template)
  - `wp profile stage bootstrap --fields=hook,time --spotlight --format=json` — top slowest hooks in bootstrap
  - `wp profile hook init --fields=callback,time --format=json` — callbacks on specific hooks
- **Note:** `wp profile stage` stages are `bootstrap`, `main_query`, `template` — NOT the WordPress hook names. The bootstrap stage covers `plugins_loaded`, `init`, `wp_loaded` hooks internally.

## Architecture Patterns

### Recommended Project Structure

New skill files to create:

```
skills/
├── diagnostic-performance-n1/
│   └── SKILL.md       # PERF-01: N+1 query pattern detection
├── diagnostic-cron-analysis/
│   └── SKILL.md       # PERF-02: wp-cron event analysis
├── diagnostic-wpcli-profile/
│   └── SKILL.md       # PERF-03: WP-CLI Profile integration
├── diagnostic-architecture/
│   └── SKILL.md       # ARCH-01 + ARCH-02 + caching anti-patterns
└── diagnostic-arch-narrative/
    └── SKILL.md       # ARCH-03: synthesized narrative (cross-domain reader)
```

Modifications to existing files:
- `commands/diagnose/COMMAND.md` — add new skills to `full` mode skill list, add `performance` mode alias

### Pattern 1: Static Analysis on Synced Files (N+1, Hook Abuse, Architecture)

**What:** Use grep on locally synced PHP files — no SSH, no WP-CLI. File access is `.sites/{site-name}/wp-content/themes/` and `.sites/{site-name}/wp-content/plugins/` (custom only, same WP.org detection heuristic as `diagnostic-code-quality`).

**When to use:** Any check that reads code patterns from files. Does not require WP-CLI. Works on all source types including git.

**Example — N+1 High confidence (query function inside loop body):**
```bash
# Find WP query functions appearing inside foreach/while loop bodies
# Step 1: Find all foreach/while constructs in PHP files
grep -rn -E "(foreach|while)\s*\(" {target_dir} --include="*.php" -l

# Step 2: For each matched file, read it and check for wpdb->get_results,
# get_post, get_post_meta, WP_Query inside the loop body
# (AI contextual analysis on flagged files — same two-pass approach as code-quality skill)
```

**Example — N+1 Medium confidence (get_post/get_post_meta inside any loop):**
```bash
grep -rn -E "(get_post|get_post_meta|get_term|get_term_meta)\s*\(" {target_dir} --include="*.php" -A 3 -B 10
# Then AI reads context to confirm it's inside a loop
```

**Example — Hook abuse (expensive operations on init):**
```bash
# Find add_action('init', ...) calls, then AI checks what the callback does
grep -rn "add_action\s*(\s*['\"]init['\"]" {target_dir} --include="*.php" -A 3

# Find hooks with many callbacks registered from same file
grep -rn "add_action\|add_filter" {target_dir} --include="*.php" | \
  grep -oP "(?<=')[^']+(?=')" | sort | uniq -c | sort -rn | head -20
```

### Pattern 2: WP-CLI Live Data (Cron, CPT Counts, Object Cache)

**What:** WP-CLI commands through `$WP_CLI_PREFIX`. Requires `WP_CLI_AVAILABLE=true` and non-git source_type. Self-gates at skill start.

**When to use:** Any check needing live database state (cron schedules, post counts, cache status).

**Example — Cron event analysis:**
```bash
# Get all cron events as JSON with timing and interval data
CRON_EVENTS=$($WP_CLI_PREFIX cron event list \
  --fields=hook,next_run_gmt,recurrence,interval,args \
  --format=json 2>/dev/null)

# Get current UTC time for overdue comparison
CURRENT_UTC=$(date -u +"%Y-%m-%d %H:%M:%S")

# Parse with jq: find overdue events (next_run_gmt < now)
# Using jq with date comparison requires string-to-epoch conversion
OVERDUE=$(echo "$CRON_EVENTS" | jq --arg now "$CURRENT_UTC" \
  '[.[] | select(.next_run_gmt < $now)]')
```

**Example — CPT post count check:**
```bash
# Get all registered non-builtin post types
CPT_LIST=$($WP_CLI_PREFIX post-type list \
  --fields=name,label,_builtin \
  --format=json 2>/dev/null | jq '[.[] | select(._builtin == false)]')

# For each custom CPT, count its published posts
CPT_NAME="my_cpt"
POST_COUNT=$($WP_CLI_PREFIX post list \
  --post_type="$CPT_NAME" \
  --post_status=any \
  --format=count 2>/dev/null | tr -d '[:space:]')
```

**Example — Object cache detection:**
```bash
# WP-CLI cache type command (requires WP-CLI 2.x)
CACHE_TYPE=$($WP_CLI_PREFIX cache type 2>/dev/null | tr -d '[:space:]')
# Returns: "Default" (no persistent cache) or "Redis", "Memcached", "APCu", etc.

# Alternative: check for object-cache.php drop-in file
ls {local_path}/wp-content/object-cache.php 2>/dev/null && echo "drop-in present"
```

### Pattern 3: WP-CLI Profile Gating (Two-Stage Degradation)

**What:** First check if `wp profile` is available. If not, ask user if they want to install. Produce itemized Info findings for each skipped check.

**When to use:** PERF-03 skill only.

```bash
# Check if profile-command is installed
$WP_CLI_PREFIX profile --help > /dev/null 2>&1
PROFILE_AVAILABLE=$?

if [ $PROFILE_AVAILABLE -ne 0 ]; then
  # Profile command not installed — emit itemized Info findings
  # Output individual findings (NOT a single generic skip):
  # PERF-PROF-STAGE: "Stage profiling skipped — install wp-cli/profile-command"
  # PERF-PROF-HOOK: "Hook timing skipped — install wp-cli/profile-command"

  # Offer to install (interactive prompt to user, not automatic)
  # Ask: "wp-cli/profile-command is not installed. Install it now? (yes/no)"
  # If yes: $WP_CLI_PREFIX package install wp-cli/profile-command:@stable
  # If no: return Info findings and exit
else
  # Profile available — run stage analysis
  STAGE_DATA=$($WP_CLI_PREFIX profile stage --format=json 2>/dev/null)
  # Then run hook analysis on bootstrap stage
  HOOK_DATA=$($WP_CLI_PREFIX profile stage bootstrap \
    --fields=hook,time,cache_ratio \
    --spotlight \
    --format=json 2>/dev/null)
fi
```

### Pattern 4: Synthesized Narrative (Cross-Domain Reader)

**What:** Unlike all other skills, this skill does NOT run new checks. It reads findings from:
1. The current scan's combined findings JSON (passed as variable by `/diagnose`)
2. Existing report at `memory/{site-name}/latest.md` for cross-scan context

**When to use:** Run last in `/diagnose` full mode, after all other skills have completed.

```bash
# The narrative skill receives the combined findings array from /diagnose
# It groups findings by domain:
# - Security: SECR-* prefix findings
# - Code Quality: CODE-* prefix findings
# - Database Health: DBHL-* prefix findings
# - Performance: PERF-* prefix findings
# - Architecture: ARCH-* prefix findings
# - Infrastructure: INFR-* prefix findings

# Apply existing grading matrix to compute overall grade
CRITICAL_COUNT=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | length')
WARNING_COUNT=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Warning")] | length')
# Then apply first-match-wins grading from report-generator

# Top 3 by impact: Critical first (sorted by category business impact),
# then highest-count Warning category
TOP_3=$(echo "$COMBINED_FINDINGS" | jq '[.[] | select(.severity == "Critical")] | .[0:3]')
```

### Anti-Patterns to Avoid

- **Hardcoding `wp_` table prefix:** Always use `$WP_CLI_PREFIX db prefix` — established in Phase 6
- **Running WP-CLI on git source_type:** Git sources never have a live DB — gate at skill start, emit skip finding
- **Auto-installing wp-cli/profile-command:** Always ask user first; never silently install
- **Single generic "profile skipped" finding:** Each skipped check gets its own Info finding with specific install instruction
- **grep for N+1 in WP.org plugins:** Skip the well-known plugin list (same as `diagnostic-code-quality`) — users cannot fix third-party code
- **Counting all CPT rows without the custom-code filter:** CPT misuse check should only flag CPTs registered in custom code, not third-party plugins
- **Prose narrative output for ARCH-03:** The synthesized narrative must be bullet-point grouped by domain, not paragraphs

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WP-CLI availability | Custom binary detection | `$WP_CLI_PREFIX profile --help` exit code | Already established pattern; no path guessing needed |
| Cron overdue detection | Custom cron table SQL | `wp cron event list --format=json` + jq date comparison | WP-CLI correctly handles all cron storage formats |
| Post type row counts | Direct SQL on wp_posts | `wp post list --post_type={cpt} --format=count` | WP-CLI handles post_status, multisite, and custom statuses correctly |
| Object cache detection | Parsing wp-config.php | `wp cache type` WP-CLI command | Direct, authoritative, works across all configurations |
| Health grade calculation | New grading formula | Existing grading matrix from `report-generator` SKILL.md | Grade must be consistent across all reports |
| Finding IDs | Sequential numbers | `{PREFIX}-{CHECK}-{HASH}` with MD5 of location | Content-based IDs for cross-scan tracking — project standard |

## Common Pitfalls

### Pitfall 1: wp profile stage Names vs WordPress Hook Names

**What goes wrong:** CONTEXT.md says "show stage breakdown (plugins_loaded, init, template_redirect)" but those are WordPress hook names. The actual `wp profile stage` command outputs stages named `bootstrap`, `main_query`, `template`.
**Why it happens:** The user described the internal hooks that happen within each stage, not the WP-CLI stage identifier names.
**How to avoid:** Use the correct stage names in all output: `bootstrap`, `main_query`, `template`. When presenting results to users, explain that "bootstrap" covers plugins_loaded, init, and wp_loaded hooks.
**Warning signs:** Any code that passes "plugins_loaded" as the stage argument to `wp profile stage` will fail.

### Pitfall 2: Cron Date Comparison in Bash

**What goes wrong:** `wp cron event list` returns `next_run_gmt` as a datetime string ("2026-02-19 22:15:13"), not a Unix timestamp. Bash string comparison on datetime strings is unreliable for different formats.
**Why it happens:** The field name suggests a UTC timestamp but WP-CLI outputs a formatted string.
**How to avoid:** Convert to epoch for comparison. On most systems: `date -d "2026-02-19 22:15:13" +%s` (Linux) or `date -j -f "%Y-%m-%d %H:%M:%S" "2026-02-19 22:15:13" +%s` (macOS). Use jq to parse and compare after converting to epoch.
**Warning signs:** Cron overdue detection always reporting zero overdue events even when events are clearly past due.

### Pitfall 3: WP-CLI Not Available But Profile Check Runs

**What goes wrong:** `diagnostic-wpcli-profile` skill tries to run `$WP_CLI_PREFIX profile --help` when `WP_CLI_AVAILABLE=false`.
**Why it happens:** The outer check is WP-CLI overall, but profile availability is a second-tier check inside that. The WP-CLI-available check must happen first.
**How to avoid:** The skill must self-gate: check `WP_CLI_AVAILABLE=true` first (return skip finding if false), THEN check `profile --help` exit code. Two separate gates.

### Pitfall 4: N+1 Findings Referencing Generic Variable Names

**What goes wrong:** N+1 rewrite suggestions say "$posts" and "$post_ids" when the actual code uses "$event_ids" and "$events".
**Why it happens:** Templates are used instead of reading actual code.
**How to avoid:** The N+1 skill must read the actual file content (Pass 2 deep analysis, same as `diagnostic-code-quality`), extract actual variable names, and include them verbatim in the `fix.before` and `fix.after` fields.

### Pitfall 5: Synthesized Narrative Running Before All Skills Complete

**What goes wrong:** The arch-narrative skill is registered early in the skill list and runs before performance/architecture skills have produced their findings.
**Why it happens:** Skill ordering in `/diagnose` determines execution sequence.
**How to avoid:** Register `diagnostic-arch-narrative` as the LAST skill in the full mode skill list. It must receive the complete `COMBINED_FINDINGS` array, so it runs after all other skills have completed.

### Pitfall 6: CPT Misuse Detection on Third-Party CPTs

**What goes wrong:** The skill flags WooCommerce product CPT as "low row count" on a new store, or Gravity Forms entries CPT as "excessive rows."
**Why it happens:** `wp post-type list` returns all CPTs including those from third-party plugins.
**How to avoid:** Cross-reference each CPT against the WP.org plugin detection heuristic (same method as `diagnostic-code-quality`). Only flag CPTs registered by custom code. Flag in the detail field which CPTs were skipped as third-party.

## Code Examples

Verified patterns from official WP-CLI documentation:

### wp cron event list: Getting All Fields
```bash
# Source: https://developer.wordpress.org/cli/commands/cron/event/list/
$WP_CLI_PREFIX cron event list \
  --fields=hook,next_run_gmt,recurrence,interval,schedule \
  --format=json 2>/dev/null
```

Output structure:
```json
[
  {"hook": "wp_version_check", "next_run_gmt": "2026-02-19 22:15:13", "recurrence": "Every 12 hours", "interval": 43200, "schedule": "twicedaily"},
  {"hook": "publish_future_post", "next_run_gmt": "2026-02-19 23:00:00", "recurrence": "Non-repeating", "interval": 0, "schedule": ""}
]
```

### wp profile stage: Basic Timing
```bash
# Source: https://developer.wordpress.org/cli/commands/profile/stage/
$WP_CLI_PREFIX profile stage --format=json 2>/dev/null
# Returns: [{"stage":"bootstrap","time":"0.7994s","cache_ratio":"93.21%"}, ...]

# Drill into bootstrap for hook timing
$WP_CLI_PREFIX profile stage bootstrap \
  --fields=hook,time,cache_ratio \
  --spotlight \
  --format=json 2>/dev/null
```

### wp profile hook: Individual Hook Callbacks
```bash
# Source: https://developer.wordpress.org/cli/commands/profile/hook/
$WP_CLI_PREFIX profile hook init \
  --fields=callback,time \
  --format=json 2>/dev/null
# Returns: [{"callback":"my_plugin\\init_function","time":"0.0234s"}, ...]
```

### wp post-type list: Custom CPTs Only
```bash
# Source: https://developer.wordpress.org/cli/commands/post-type/list/
$WP_CLI_PREFIX post-type list \
  --fields=name,label,_builtin \
  --format=json 2>/dev/null | \
  jq '[.[] | select(._builtin == "false" or ._builtin == false)]'
```

### wp post list: Count Posts for a CPT
```bash
# Source: https://developer.wordpress.org/cli/commands/post/list/
$WP_CLI_PREFIX post list \
  --post_type="my_cpt" \
  --post_status=any \
  --format=count 2>/dev/null | tr -d '[:space:]'
```

### wp cache type: Detect Persistent Object Cache
```bash
# Source: WP-CLI official docs
$WP_CLI_PREFIX cache type 2>/dev/null
# Returns: "Default" = no persistent cache, or "Redis", "Memcached", etc.
```

### N+1 Pattern Detection: Confidence Tier Regex

High confidence — query call directly inside foreach/while body:
```bash
# Pattern: find PHP files where wpdb->get_results or WP_Query appears
# within 5 lines after a foreach/while statement
grep -rn -E "(foreach|while)\s*\(.+\)" {target_dir} --include="*.php" -A 5 | \
  grep -E "(\\\$wpdb->|new WP_Query|get_posts\s*\(|get_post_meta\s*\()"
```

Medium confidence — get_post/get_post_meta with loop in surrounding context:
```bash
grep -rn -E "(get_post|get_post_meta|get_term_meta|get_field)\s*\(\s*\\\$" \
  {target_dir} --include="*.php" -B 10 -A 2
# AI reads 10 lines before each match to confirm loop context
```

Low confidence — multiple sequential `$wpdb->get_results` on same table:
```bash
grep -rn "\\\$wpdb->get_results" {target_dir} --include="*.php" -n | \
  awk -F: 'prev_file==$1 && $2-prev_line<10 {print} {prev_file=$1; prev_line=$2}'
```

### Hook Abuse Pattern Detection

```bash
# Count add_action/add_filter calls per hook name
grep -rh "add_action\|add_filter" {target_dir} --include="*.php" | \
  grep -oP "(?<=['\"])[a-z_]+(?=['\"])" | sort | uniq -c | sort -rn

# Find init/wp_loaded hooks with potentially expensive callbacks
grep -rn "add_action\s*(\s*['\"]init['\"]" {target_dir} --include="*.php" -A 2
grep -rn "add_action\s*(\s*['\"]wp_loaded['\"]" {target_dir} --include="*.php" -A 2
```

### Finding ID Format for Phase 7 Skills

```bash
# Performance skills: PERF-{CHECK}-{HASH}
# Architecture skills: ARCH-{CHECK}-{HASH}
# Narrative skill: ARCH-NARR (fixed ID — no location hash, it's a synthesis)

# Example IDs:
# PERF-N1-a3f    - N+1 pattern at specific file:line
# PERF-CRON-SZ   - Cron event overdue (fixed check ID, overdue hook name in detail)
# PERF-PROF-STAGE - wp profile stage timing (fixed ID)
# PERF-PROF-HOOK  - wp profile hook timing
# PERF-PROF-SKIP  - Profile command not installed (Info, per-check)
# ARCH-CPT-a3f   - CPT misuse at specific CPT registration
# ARCH-HOOK-b2c  - Hook abuse at specific file:line
# ARCH-CACHE-d4e - Caching anti-pattern at specific file:line
# ARCH-NARR      - Synthesized narrative (single finding, no hash)
```

## Skill Decomposition

This phase requires 5 SKILL.md files. Understanding which requirements each covers helps the planner create one plan per skill.

### Skill 1: diagnostic-performance-n1 (PERF-01)
- Static analysis, no WP-CLI required
- Covers: N+1 High/Medium/Low confidence tiers
- Same WP.org plugin skip logic as diagnostic-code-quality
- Two-pass: grep for patterns → AI reads flagged files for context and variable names
- Category for findings: `"Performance"`
- Finding IDs: `PERF-N1-{hash}`

### Skill 2: diagnostic-cron-analysis (PERF-02)
- WP-CLI required (gates on `WP_CLI_AVAILABLE`)
- Covers: overdue events (>1 hour), duplicate hooks, intervals <5 minutes
- Data source: `wp cron event list --format=json`
- Overdue threshold: 3600 seconds (>1 hour)
- Duplicate: same hook name appearing more than once in event list
- Excessive frequency: interval field < 300 seconds (5 minutes)
- Category for findings: `"Performance"`
- Finding IDs: `PERF-CRON-{hash}` or fixed `PERF-CRON-DUP`, `PERF-CRON-FREQ`, `PERF-CRON-OVRD`

### Skill 3: diagnostic-wpcli-profile (PERF-03)
- Requires WP-CLI AND wp-cli/profile-command package
- Two-stage gating: WP-CLI available check → profile package check
- When profile unavailable: two Info findings (PERF-PROF-STAGE-SKIP, PERF-PROF-HOOK-SKIP) + user prompt to install
- When available: PERF-PROF-STAGE finding with stage times, PERF-PROF-HOOK finding with top 5 slowest hooks in bootstrap
- Stage time thresholds (Claude's discretion): Warning if bootstrap > 2.0s, Critical if bootstrap > 5.0s
- Category for findings: `"Performance"`

### Skill 4: diagnostic-architecture (ARCH-01, ARCH-02 + caching anti-patterns)
- Mixed: CPT row counts need WP-CLI; hook abuse and caching anti-patterns are static grep
- Self-gates WP-CLI checks independently from grep checks (partial results better than full skip)
- Covers:
  - CPT misuse: `wp post-type list` + `wp post list --format=count` + WP.org skip filter
  - Hook abuse: grep on `add_action`/`add_filter` in synced PHP files
  - Caching anti-patterns: `wp cache type` + grep for `set_transient(... 0)` patterns
- Category for findings: `"Architecture"`
- Finding IDs: `ARCH-CPT-{hash}`, `ARCH-HOOK-{hash}`, `ARCH-CACHE-{hash}`

### Skill 5: diagnostic-arch-narrative (ARCH-03)
- No new checks — reads and aggregates
- Input: `COMBINED_FINDINGS` JSON array (all findings from current scan)
- Secondary input: `memory/{site-name}/latest.md` for prior scan context
- Applies same grading matrix from report-generator
- Output: single `ARCH-NARR` finding with structured bullet-point narrative
- Must run LAST in skill sequence

## /diagnose Command Changes

The planner will need one task to update `commands/diagnose/COMMAND.md`:

1. Add new skills to WP_CLI_SKILLS array:
   ```bash
   WP_CLI_SKILLS=(
     # ... existing ...
     "diagnostic-cron-analysis"
     "diagnostic-wpcli-profile"
   )
   ```
   Note: `diagnostic-performance-n1`, `diagnostic-architecture`, and `diagnostic-arch-narrative` do NOT require WP-CLI for their core checks — they should not be in WP_CLI_SKILLS.

2. Add to `full` mode skill list (order matters — narrative must be last):
   ```bash
   "full")
     SKILLS=(
       # ... existing 11 skills ...
       "diagnostic-performance-n1:N+1 Query Pattern Detection"
       "diagnostic-cron-analysis:Cron Event Analysis"
       "diagnostic-wpcli-profile:WP-CLI Profile Analysis"
       "diagnostic-architecture:Architecture Review"
       "diagnostic-arch-narrative:Synthesized Narrative"  # MUST BE LAST
     )
   ```

3. Add `performance` mode alias:
   ```bash
   "performance")
     SKILLS=(
       "diagnostic-performance-n1:N+1 Query Pattern Detection"
       "diagnostic-cron-analysis:Cron Event Analysis"
       "diagnostic-wpcli-profile:WP-CLI Profile Analysis"
     )
   ```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `wp profile` built into WP-CLI core | Separate installable package `wp-cli/profile-command` | Historically always a package | Must check for package separately |
| `wp transient list --expired` (non-existent) | Direct SQL with UNIX_TIMESTAMP() | Established in Phase 6 | Do not use the --expired flag |
| Prose narrative reports | Bullet-point domain groups + Top 3 actionable list | Phase 7 decision | More scannable, more actionable |
| Fixed A-F grade per scan type | Same grade matrix across all scans and narrative | Phase 3+ | Grade is deterministic and consistent |

**Deprecated/outdated:**
- `wp profile --help` on very old WP-CLI versions may behave differently: this is low risk as WP-CLI 2.x is the project standard.
- `wp post-type list` `_builtin` field may return string `"false"` instead of boolean `false` in some WP-CLI versions — handle both in jq filter.

## Open Questions

1. **wp profile stage timing output format**
   - What we know: The command outputs `time` as a string like "0.7994s", not a float
   - What's unclear: Whether jq can reliably parse this string for threshold comparison
   - Recommendation: Strip the trailing "s" with `gsub("s";"")` in jq, then convert to float for threshold comparison

2. **CPT row count thresholds for "dead CPT" vs "excessive rows"**
   - What we know: User delegated this to Claude's discretion
   - What's unclear: Exact numbers — depends heavily on CPT purpose
   - Recommendation: Dead CPT = 0 published posts (Critical/Warning), Few posts = 1-5 (Info), Excessive = context-dependent (>10,000 rows in a CPT that appears to be used as a lookup table is probably fine, but >10,000 in a CPT that appears to be logging data is a concern). Use Info severity for excessive unless threshold is extreme.

3. **Cron interval date comparison: macOS vs Linux date command**
   - What we know: `date -d` is Linux; `date -j -f` is macOS. The skill runs agent-side.
   - What's unclear: The agent environment (macOS per env vars, but skills describe remote operations)
   - Recommendation: Use jq for all date arithmetic where possible. For converting datetime strings to epoch: `date -d "..." +%s` should work in agent bash (macOS `date` supports `-j -f` but not `-d`). Use a helper: try Linux format, fall back to macOS format.

4. **Narrative skill: How much prior scan context to include**
   - What we know: Reads `memory/{site}/latest.md` for cross-domain view
   - What's unclear: If this is the first-ever scan, `latest.md` won't exist yet
   - Recommendation: Narrative skill should check for `latest.md` existence first. If absent, synthesize from current scan only. Note in narrative output if prior scan data is unavailable.

## Sources

### Primary (HIGH confidence)
- `skills/diagnostic-code-quality/SKILL.md` — two-pass analysis pattern, WP.org plugin detection, finding ID format, category/severity schema
- `skills/diagnostic-db-autoload/SKILL.md` — WP_CLI_PREFIX pattern, dynamic table prefix, self-gating, error handling format
- `commands/diagnose/COMMAND.md` — WP_CLI_SKILLS array pattern, skill list structure, performance mode addition approach
- `skills/report-generator/SKILL.md` — grading matrix, finding ID format, categories, report structure
- https://developer.wordpress.org/cli/commands/profile/stage/ — stage names, flag options, output format
- https://developer.wordpress.org/cli/commands/profile/hook/ — hook profile fields
- https://developer.wordpress.org/cli/commands/profile/ — subcommands list
- https://developer.wordpress.org/cli/commands/cron/event/list/ — cron event fields, next_run_gmt format
- https://developer.wordpress.org/cli/commands/post-type/list/ — CPT list command fields
- https://developer.wordpress.org/cli/commands/post/list/ — post count format=count

### Secondary (MEDIUM confidence)
- https://github.com/wp-cli/profile-command — install command `wp package install wp-cli/profile-command:@stable`, stage names confirmed
- https://developer.wordpress.org/news/2024/06/an-introduction-to-the-transients-api/ — set_transient with 0 expiry is an anti-pattern; confirmed 2024 official source
- WebSearch: `wp cache type` returns "Default" for no persistent cache, or backend name

### Tertiary (LOW confidence)
- WebSearch: `wp package is-installed` does not exist — must use `wp profile --help` exit code check. This is the user's stated approach, confirmed by absence of `is-installed` in official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in use in prior phases
- WP-CLI Profile command interface: HIGH — verified against official docs
- Architecture patterns: HIGH — follows established skill patterns from Phases 5 and 6
- N+1 grep patterns: MEDIUM — logic is sound but exact regex will need tuning during implementation
- Cron date comparison (macOS vs Linux): MEDIUM — flagged as open question, mitigation documented
- CPT row thresholds: MEDIUM — Claude's discretion, reasonable defaults documented

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (30 days — WP-CLI documentation is stable)
