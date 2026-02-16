# Phase 4: Command Workflows - Research

**Researched:** 2026-02-17
**Domain:** Command orchestration, natural language parsing, workflow error recovery
**Confidence:** HIGH

## Summary

Phase 4 orchestrates existing diagnostic skills into user-facing command workflows. The technical challenge is creating conversational commands that parse natural language intent, run multi-step workflows with inline progress, handle partial failures gracefully, and suggest next actions. This is a composition phase — no new diagnostic skills are built, only workflow logic that ties everything together.

The research identifies three core patterns: (1) Sequential orchestration with state tracking (run skills in order, accumulate findings), (2) Natural language intent parsing via pattern matching in bash, and (3) Partial failure recovery using skip-and-continue semantics. Unlike traditional CLIs with rigid flag-based syntax, this phase implements a conversational interface where "diagnose security only on mysite" and "/diagnose --security-only mysite" both work through intent extraction.

Progress feedback follows modern CLI best practices: step-by-step inline updates with critical findings shown immediately, summary on completion, and suggested next actions based on results. Error handling uses graceful degradation — if SSH drops or WP-CLI fails mid-scan, mark affected skills as "skipped" in the report and continue with remaining checks, ensuring users get partial results instead of total failure.

**Primary recommendation:** Use sequential orchestration with explicit state tracking (connection → skill execution → report generation), parse natural language arguments via bash pattern matching (grep/sed), provide inline progress with finding counts per skill, and implement skip-and-continue error recovery so workflows survive individual skill failures.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Command scope & overlap:**
- /connect stays as-is from Phase 2 — Claude decides whether to enhance with pre-flight checks
- /audit is NOT a separate command — it becomes a mode on /diagnose (security-only mode)
- /diagnose supports three modes: full (default), security-only, code-only
- /diagnose auto-connects if no active connection exists (runs /connect flow first)
- Natural re-runs supported: user can say "diagnose just security" to re-check a specific category

**Output & progress feedback:**
- Step-by-step inline progress: show each skill as it runs with finding counts
- Critical findings shown immediately as discovered (title + one-line summary); warnings/info just counted
- After completion: summary + file path (health grade, finding counts, top 3 issues inline; full report saved to memory/{site}/latest.md)
- Suggest next steps after completion based on findings (e.g., "Update plugins", "Re-scan after fixes")

**Error handling & partial runs:**
- Skip and continue: if a skill fails (SSH drop, timeout), mark as "skipped" in report and run remaining skills
- Auto-resync before diagnostics: always resync files silently to ensure fresh data
- Partial report when WP-CLI unavailable: run local-only skills (malware scan, code quality), note WP-CLI skills as "unavailable"
- Health grade marked "Incomplete" (not A-F) when skills were skipped — avoids false confidence

**Command arguments & invocation:**
- Natural language invocation: users say "/diagnose security only on mysite" — Claude interprets intent
- Default site from sites.json used when no site specified; override with natural language ("on mysite")
- /status gets minor enhancements: show available commands, last run time, or suggested next action

### Claude's Discretion

- Whether to enhance /connect with pre-flight checks or leave as-is
- Exact wording of progress messages and next-step suggestions
- How to parse natural language arguments into mode + site selection
- /status enhancement scope (what minor additions make sense)
- Plugin manifest version bump (1.3.0 or 2.0.0 for project completion)

### Specific Ideas

- Commands should feel conversational, not CLI-like — natural language in, structured results out
- "Diagnose just security" and "run a security audit" should both work the same way
- Progress should feel like a knowledgeable consultant walking through checks, not a script running

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core Components (Existing)

This phase uses only existing tools already established in Phases 1-3. No new libraries or external dependencies are introduced.

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Bash | 3.2+ (macOS default) | Workflow orchestration, command logic | Native shell on all platforms, no installation needed |
| jq | 1.6+ | JSON manipulation (sites.json, findings) | Standard for JSON in shell scripts, already used in Phases 1-3 |
| SSH | OpenSSH 7.0+ | Remote command execution for WP-CLI skills | Universal remote access tool, core to connection workflow |
| Existing diagnostic skills | N/A | 6 diagnostic skills from Phase 3 | Already implemented, just need orchestration |
| Existing report-generator | N/A | Report compilation skill from Phase 3 | Already generates markdown reports with health grades |

### Supporting Tools (Already in Use)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| grep/sed | Natural language argument parsing | Extract intent from user input (mode, site name) |
| printf/echo | Progress feedback, inline output | Display step-by-step progress during execution |
| date | Timestamps for reports, sync checks | Track last run time, suggest re-scans |
| find | File existence checks | Verify local synced files before diagnostics |

**Installation:** None required. All tools are already in use and available on macOS/Linux by default.

## Architecture Patterns

### Pattern 1: Sequential Orchestration with State Tracking

**What:** Execute workflow steps in strict sequence (connection → resync → skill execution → report generation), tracking state at each step to handle failures and enable partial completion.

**When to use:** Multi-step workflows where later steps depend on earlier steps (e.g., diagnostics require connection and fresh files).

**Structure:**
```bash
# State tracking variables
WORKFLOW_STATE="starting"
SKILLS_COMPLETED=()
SKILLS_SKIPPED=()

# Step 1: Ensure connection
if ! ensure_connection "$SITE_NAME"; then
  echo "Error: Cannot establish connection. Run /connect first."
  exit 1
fi
WORKFLOW_STATE="connected"

# Step 2: Resync files
if ! resync_files "$SITE_NAME"; then
  echo "Warning: File sync failed. Using cached files."
  SKILLS_SKIPPED+=("resync")
fi
WORKFLOW_STATE="synced"

# Step 3: Execute diagnostic skills
for skill in "${SKILLS_TO_RUN[@]}"; do
  if run_skill "$skill"; then
    SKILLS_COMPLETED+=("$skill")
  else
    SKILLS_SKIPPED+=("$skill")
  fi
done
WORKFLOW_STATE="diagnostics_complete"

# Step 4: Generate report
generate_report "$SITE_NAME" "${SKILLS_COMPLETED[@]}"
WORKFLOW_STATE="report_generated"
```

**Key insight:** Explicit state tracking enables graceful degradation. If resync fails, continue with cached files. If a skill fails, continue with remaining skills. The final report notes what was skipped, preventing false confidence from incomplete scans.

**Source:** [Choose a design pattern for your agentic AI system](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system) — Sequential pattern for step-by-step workflows with clear dependencies.

### Pattern 2: Natural Language Intent Parsing via Pattern Matching

**What:** Parse natural language user input to extract structured intent (mode selection, site name) using bash pattern matching rather than rigid flag-based parsing.

**When to use:** Conversational command interfaces where users express intent in varied natural language ("security only", "just security", "security audit").

**Implementation:**
```bash
parse_diagnose_args() {
  local user_input="$*"
  local mode="full"
  local site_name=""

  # Mode detection via pattern matching
  if echo "$user_input" | grep -qiE "(security|audit).*only|only.*security"; then
    mode="security-only"
  elif echo "$user_input" | grep -qiE "code.*only|only.*code|code.*quality"; then
    mode="code-only"
  fi

  # Site name extraction
  if echo "$user_input" | grep -qE "on [a-z0-9-]+"; then
    site_name=$(echo "$user_input" | sed -n 's/.*on \([a-z0-9-]*\).*/\1/p')
  fi

  # Default to sites.json default if no site specified
  if [ -z "$site_name" ]; then
    site_name=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json)
  fi

  echo "$mode|$site_name"
}

# Usage
PARSED=$(parse_diagnose_args "$@")
MODE=$(echo "$PARSED" | cut -d'|' -f1)
SITE=$(echo "$PARSED" | cut -d'|' -f2)
```

**Pattern variations matched:**
- "security only" → security-only mode
- "just security" → security-only mode
- "security audit" → security-only mode
- "code only" → code-only mode
- "on mysite" → site_name=mysite
- No site specified → use default from sites.json

**Key insight:** Use case-insensitive grep with extended regex (`-iE`) to match multiple phrasings. Pipe-delimited output enables easy field extraction. Always provide fallback to default site.

**Source:** [Natural Language as an Interface Style](https://www.dgp.toronto.edu/public_user/byron/papers/nli.html) — Users need not explicitly learn lexicon and syntax; they can express what they want in language they are used to.

### Pattern 3: Inline Progress Feedback with Finding Counts

**What:** Provide step-by-step progress updates as the workflow executes, showing what's currently running, how many findings were discovered, and critical issues immediately.

**When to use:** Long-running workflows (5-30 seconds per skill) where users need confirmation that progress is happening and critical issues need immediate attention.

**Implementation:**
```bash
run_diagnostic_skill() {
  local skill_name="$1"
  local site_name="$2"

  # Start indicator
  printf "⏳ Running %s...\n" "$skill_name"

  # Execute skill, capture findings JSON
  local findings=$(bash "skills/$skill_name/SKILL.md" "$site_name" 2>&1)
  local exit_code=$?

  # Count findings by severity
  local critical=$(echo "$findings" | jq '[.[] | select(.severity == "Critical")] | length')
  local warning=$(echo "$findings" | jq '[.[] | select(.severity == "Warning")] | length')
  local info=$(echo "$findings" | jq '[.[] | select(.severity == "Info")] | length')

  # Show completion with counts
  printf "✓ %s: %d critical, %d warning, %d info\n" "$skill_name" "$critical" "$warning" "$info"

  # Show critical findings immediately (title + summary only)
  if [ "$critical" -gt 0 ]; then
    echo "$findings" | jq -r '.[] | select(.severity == "Critical") | "  🚨 \(.title): \(.summary)"'
  fi

  echo "$findings"
}
```

**Output example:**
```
⏳ Running diagnostic-core-integrity...
✓ diagnostic-core-integrity: 0 critical, 0 warning, 1 info

⏳ Running diagnostic-config-security...
✓ diagnostic-config-security: 2 critical, 1 warning, 0 info
  🚨 Debug mode enabled in production: WP_DEBUG is set to true in wp-config.php
  🚨 Weak security keys detected: Default or weak SALT values found

⏳ Running diagnostic-user-audit...
✓ diagnostic-user-audit: 0 critical, 1 warning, 0 info
```

**Key insight:** Use Unicode symbols (⏳ ✓ 🚨) for visual distinction. Show critical findings inline to enable immediate action. Full report saved to file after all skills complete.

**Source:** [CLI UX best practices: 3 patterns for improving progress displays](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays) — Use green colors and checkmark icons to make successful outcomes stand out.

### Pattern 4: Skip-and-Continue Error Recovery

**What:** When a skill fails (SSH drop, timeout, WP-CLI unavailable), mark it as "skipped" in the report and continue executing remaining skills, ensuring partial results instead of total failure.

**When to use:** Multi-step workflows where individual step failures shouldn't abort the entire workflow, and partial results are valuable.

**Implementation:**
```bash
run_diagnostic_workflow() {
  local site_name="$1"
  local mode="$2"

  declare -a skills_to_run
  declare -a findings_all=()
  declare -a skills_skipped=()

  # Determine skills based on mode
  case "$mode" in
    "security-only")
      skills_to_run=("diagnostic-core-integrity" "diagnostic-config-security" "diagnostic-user-audit")
      ;;
    "code-only")
      skills_to_run=("diagnostic-code-quality" "diagnostic-malware-scan")
      ;;
    "full")
      skills_to_run=("diagnostic-core-integrity" "diagnostic-config-security"
                     "diagnostic-user-audit" "diagnostic-version-audit"
                     "diagnostic-malware-scan" "diagnostic-code-quality")
      ;;
  esac

  # Run each skill with error recovery
  for skill in "${skills_to_run[@]}"; do
    # Use || true to prevent exit on failure
    findings=$(bash "skills/$skill/SKILL.md" "$site_name" 2>&1 || true)

    # Check if skill returned valid JSON
    if echo "$findings" | jq empty 2>/dev/null; then
      # Valid findings - add to results
      findings_all+=("$findings")
      printf "✓ %s completed\n" "$skill"
    else
      # Skill failed - mark as skipped
      skills_skipped+=("$skill")
      printf "⚠ %s skipped (error: %s)\n" "$skill" "${findings:0:50}"
    fi
  done

  # Generate report with skipped skills noted
  if [ ${#skills_skipped[@]} -gt 0 ]; then
    echo "⚠ Incomplete scan: ${#skills_skipped[@]} skill(s) skipped"
    echo "${findings_all[@]}" | generate_report "$site_name" "Incomplete"
  else
    echo "${findings_all[@]}" | generate_report "$site_name" "Complete"
  fi
}
```

**Error scenarios handled:**
1. **SSH connection drop mid-scan**: Skill fails, marked skipped, next skill attempts connection again
2. **WP-CLI unavailable**: WP-CLI-dependent skills fail, local file-based skills (malware scan, code quality) continue
3. **Timeout on slow server**: Skill times out, marked skipped, remaining skills execute
4. **Invalid JSON from skill**: JSON parse fails, skill marked skipped, workflow continues

**Key insight:** Use `|| true` to prevent bash's `set -e` from aborting on skill failures. Always validate JSON before using findings. Mark report as "Incomplete" when skills were skipped to avoid false confidence.

**Source:** [How to Make a Bash Script Continue to Run After an Error](https://www.squash.io/ensuring-bash-scripts-continue-after-error-in-linux/) — Use `|| true` pattern and `set +e` to allow graceful continuation.

### Pattern 5: Suggested Next Actions Based on Results

**What:** After workflow completion, analyze findings and suggest concrete next actions to the user based on what was discovered.

**When to use:** End of diagnostic workflows where users need guidance on what to do with the findings.

**Implementation:**
```bash
suggest_next_actions() {
  local findings_json="$1"
  local health_grade="$2"

  local critical_count=$(echo "$findings_json" | jq '[.[] | select(.severity == "Critical")] | length')
  local warning_count=$(echo "$findings_json" | jq '[.[] | select(.severity == "Warning")] | length')

  echo ""
  echo "## Suggested Next Actions"
  echo ""

  # Critical issues take priority
  if [ "$critical_count" -gt 0 ]; then
    # Check for specific critical issue types
    if echo "$findings_json" | jq -e '.[] | select(.id | startswith("SECR-CHECKSUMS"))' >/dev/null; then
      echo "1. 🚨 URGENT: Restore modified core files with: wp core download --force --skip-content"
    fi
    if echo "$findings_json" | jq -e '.[] | select(.id | startswith("SECR-DEBUG"))' >/dev/null; then
      echo "2. 🚨 URGENT: Disable debug mode in wp-config.php"
    fi
    echo "3. Run: /diagnose again after fixes to verify resolution"
    return
  fi

  # Warning-level issues
  if [ "$warning_count" -gt 3 ]; then
    # Check for outdated plugins/themes
    if echo "$findings_json" | jq -e '.[] | select(.id | startswith("DIAG-OUTDATED"))' >/dev/null; then
      echo "1. Update plugins: wp plugin update --all"
      echo "2. Update themes: wp theme update --all"
    fi
    echo "3. Re-scan after updates: /diagnose"
    return
  fi

  # Healthy site
  if [ "$health_grade" = "A" ] || [ "$health_grade" = "B" ]; then
    echo "✓ Site is healthy! Schedule regular scans (weekly or after major changes)."
    return
  fi

  # Default
  echo "Review full report at: memory/${SITE_NAME}/latest.md"
}
```

**Suggestion categories:**
- **Critical findings**: Immediate fix commands (restore core files, disable debug mode)
- **Many warnings**: Batch update commands (update all plugins, all themes)
- **Healthy site**: Maintenance reminder (schedule regular scans)
- **Incomplete scan**: Fix connection issues, retry

**Key insight:** Analyze finding IDs (prefixes like SECR-CHECKSUMS, DIAG-OUTDATED) to provide specific actionable commands. Always suggest re-scan after fixes to verify resolution.

**Source:** [Conversational UI Design Patterns](https://www.aiuxdesign.guide/patterns/conversational-ui) — Provide guiding questions and next steps to users.

### Anti-Patterns to Avoid

**1. Aborting on First Failure**
- **Why it's bad:** User gets no results if the first skill fails, wasting time and providing no diagnostic value
- **What to do instead:** Use skip-and-continue pattern, mark failed skills as "skipped", continue with remaining skills

**2. Silent Progress (No Feedback for 30+ Seconds)**
- **Why it's bad:** User doesn't know if process is hung or working, may interrupt prematurely
- **What to do instead:** Show inline progress per skill with estimated time or finding counts

**3. Rigid Flag-Based Argument Parsing**
- **Why it's bad:** Forces users to remember exact syntax (`--security-only` vs `-s` vs `--audit`), breaks conversational feel
- **What to do instead:** Parse natural language intent with pattern matching, support multiple phrasings

**4. Generic Error Messages**
- **Why it's bad:** "Error running diagnostic" doesn't help user fix the problem
- **What to do instead:** Capture stderr, parse for specific errors (SSH timeout, WP-CLI not found), suggest concrete fixes

**5. No Suggested Next Actions**
- **Why it's bad:** User sees findings but doesn't know what to do next, friction to action
- **What to do instead:** Analyze findings, suggest specific commands or actions based on what was discovered

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON finding aggregation | Custom text parsing/concatenation | jq with `-s` (slurp) to merge arrays | jq handles escaping, nesting, validation automatically |
| Progress spinners | Custom animation loops | Simple printf with status + counts | Spinners add complexity, status + counts more informative |
| Retry with exponential backoff | Custom sleep/loop logic | Simple fixed retry with `|| true` | Diagnostic skills should fail fast; long retries hide real issues |
| Natural language parsing | Full NLP library | grep/sed pattern matching | Bash regex sufficient for simple intent extraction (mode + site) |
| Site selection UI | Interactive menu with arrow keys | Default from sites.json + override via "on sitename" | Menu requires ncurses/tput, increases complexity for simple selection |

**Key insight:** Diagnostic workflows are not long-running batch jobs requiring sophisticated retry/backoff logic. They should fail fast, provide clear error messages, and let users fix issues then re-run. Keep orchestration simple — the value is in the diagnostic skills, not fancy workflow machinery.

## Common Pitfalls

### Pitfall 1: Forgetting to Resync Before Diagnostics

**What goes wrong:** User changes files on remote server, runs `/diagnose`, gets stale results based on old cached files.

**Why it happens:** Diagnostic workflow doesn't enforce fresh sync before running skills.

**How to avoid:** Always run silent resync at start of `/diagnose` workflow:
```bash
# Silent resync before diagnostics
printf "Syncing files from remote...\n"
rsync -az --exclude='...' "$USER@$HOST:$WP_PATH/" "$LOCAL_PATH/" 2>&1 | grep -v "^$"
```

**Warning signs:** User reports findings that were already fixed, or missing recent changes.

### Pitfall 2: Not Validating JSON From Skills

**What goes wrong:** Skill returns error message as plain text instead of JSON, workflow tries to parse it with jq, entire workflow fails.

**Why it happens:** Skills can fail in unexpected ways (SSH timeout, WP-CLI error), returning stderr text instead of JSON array.

**How to avoid:** Always validate JSON before using:
```bash
findings=$(run_skill "$skill" 2>&1)
if ! echo "$findings" | jq empty 2>/dev/null; then
  echo "Warning: $skill did not return valid JSON, skipping"
  continue
fi
```

**Warning signs:** Workflow crashes with "jq parse error" mid-execution.

### Pitfall 3: Treating "Incomplete" Report as Complete

**What goes wrong:** Health grade calculated as "A" but half the skills were skipped, user thinks site is healthy when it's not fully scanned.

**Why it happens:** Report generator calculates grade based only on findings received, not on which skills ran.

**How to avoid:** Pass skip status to report generator, mark report as "Incomplete" when skills skipped:
```bash
if [ ${#skills_skipped[@]} -gt 0 ]; then
  HEALTH_GRADE="Incomplete (${#skills_skipped[@]} skill(s) failed)"
fi
```

**Warning signs:** User confused why report shows "A" but says "WP-CLI unavailable".

### Pitfall 4: Not Handling Default Site Selection

**What goes wrong:** User runs `/diagnose` without specifying a site, workflow fails because no site selected.

**Why it happens:** sites.json has multiple sites but none marked as `is_default: true`.

**How to avoid:** Always check for default site, prompt if none found:
```bash
DEFAULT_SITE=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json)
if [ -z "$DEFAULT_SITE" ]; then
  echo "No default site set. Available sites:"
  jq -r '.sites | keys[]' sites.json
  echo "Usage: /diagnose [on site-name]"
  exit 1
fi
```

**Warning signs:** First site user connects works fine, second site causes "site not found" errors.

### Pitfall 5: Not Auto-Connecting Before Diagnostics

**What goes wrong:** User runs `/diagnose mysite` on a site that exists in sites.json but has no local files synced, workflow fails because local path doesn't exist.

**Why it happens:** User decision says "/diagnose auto-connects if no active connection exists" but implementation doesn't check for local file existence.

**How to avoid:** Check for synced files, auto-connect if missing:
```bash
LOCAL_PATH=$(jq -r ".sites[\"$SITE_NAME\"].local_path" sites.json)
if [ ! -d "$LOCAL_PATH" ] || [ -z "$(ls -A "$LOCAL_PATH")" ]; then
  echo "No synced files found for $SITE_NAME. Connecting..."
  /connect "$SITE_NAME"
fi
```

**Warning signs:** User sees "file not found" errors when trying to scan a saved site.

### Pitfall 6: Verbose rsync Output Cluttering Progress

**What goes wrong:** During auto-resync, rsync outputs hundreds of file names, making it impossible to see skill progress.

**Why it happens:** Default rsync `-v` shows every file transferred.

**How to avoid:** Suppress verbose output for auto-resync, show only summary:
```bash
# Quiet resync (only show errors)
rsync -az --quiet --exclude='...' "$USER@$HOST:$WP_PATH/" "$LOCAL_PATH/" 2>&1
```

**Warning signs:** Terminal fills with file names during `/diagnose`, hiding skill progress.

## Code Examples

### Example 1: Full /diagnose Command Implementation

```bash
#!/bin/bash
# commands/diagnose/COMMAND.md implementation

# Parse natural language arguments
parse_args() {
  local input="$*"
  local mode="full"
  local site=""

  # Mode detection
  if echo "$input" | grep -qiE "security.*only|only.*security|audit"; then
    mode="security-only"
  elif echo "$input" | grep -qiE "code.*only|only.*code"; then
    mode="code-only"
  fi

  # Site extraction
  if echo "$input" | grep -qE "on [a-z0-9-]+"; then
    site=$(echo "$input" | sed -n 's/.*on \([a-z0-9-]*\).*/\1/p')
  else
    site=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json)
  fi

  echo "$mode|$site"
}

# Determine skills to run based on mode
get_skills_for_mode() {
  local mode="$1"
  case "$mode" in
    "security-only")
      echo "diagnostic-core-integrity diagnostic-config-security diagnostic-user-audit"
      ;;
    "code-only")
      echo "diagnostic-code-quality diagnostic-malware-scan"
      ;;
    *)
      echo "diagnostic-core-integrity diagnostic-config-security diagnostic-user-audit diagnostic-version-audit diagnostic-malware-scan diagnostic-code-quality"
      ;;
  esac
}

# Main workflow
main() {
  PARSED=$(parse_args "$@")
  MODE=$(echo "$PARSED" | cut -d'|' -f1)
  SITE=$(echo "$PARSED" | cut -d'|' -f2)

  echo "Running diagnostic scan on $SITE (mode: $MODE)"
  echo ""

  # Auto-connect if needed
  LOCAL_PATH=$(jq -r ".sites[\"$SITE\"].local_path" sites.json)
  if [ ! -d "$LOCAL_PATH" ] || [ -z "$(ls -A "$LOCAL_PATH")" ]; then
    echo "No synced files found. Connecting..."
    /connect "$SITE"
  fi

  # Resync files silently
  printf "Syncing files...\n"
  HOST=$(jq -r ".sites[\"$SITE\"].host" sites.json)
  USER=$(jq -r ".sites[\"$SITE\"].user" sites.json)
  WP_PATH=$(jq -r ".sites[\"$SITE\"].wp_path" sites.json)
  rsync -az --quiet --exclude='wp-content/uploads/' \
    "$USER@$HOST:$WP_PATH/" "$LOCAL_PATH/" 2>&1

  # Run diagnostic skills
  SKILLS=$(get_skills_for_mode "$MODE")
  FINDINGS_ALL='[]'
  SKILLS_SKIPPED=()

  for skill in $SKILLS; do
    printf "⏳ Running %s...\n" "$skill"
    findings=$(bash "skills/$skill/SKILL.md" "$SITE" 2>&1 || true)

    if echo "$findings" | jq empty 2>/dev/null; then
      # Valid JSON - merge findings
      FINDINGS_ALL=$(echo "$FINDINGS_ALL" "$findings" | jq -s 'add')

      # Count by severity
      critical=$(echo "$findings" | jq '[.[] | select(.severity == "Critical")] | length')
      warning=$(echo "$findings" | jq '[.[] | select(.severity == "Warning")] | length')
      info=$(echo "$findings" | jq '[.[] | select(.severity == "Info")] | length')

      printf "✓ %s: %d critical, %d warning, %d info\n" "$skill" "$critical" "$warning" "$info"

      # Show critical findings immediately
      if [ "$critical" -gt 0 ]; then
        echo "$findings" | jq -r '.[] | select(.severity == "Critical") | "  🚨 \(.title)"'
      fi
    else
      SKILLS_SKIPPED+=("$skill")
      printf "⚠ %s skipped\n" "$skill"
    fi
  done

  # Generate report
  echo ""
  echo "Generating report..."
  bash "skills/report-generator/SKILL.md" "$SITE" "$FINDINGS_ALL"

  # Show summary
  CRITICAL_COUNT=$(echo "$FINDINGS_ALL" | jq '[.[] | select(.severity == "Critical")] | length')
  WARNING_COUNT=$(echo "$FINDINGS_ALL" | jq '[.[] | select(.severity == "Warning")] | length')

  echo ""
  echo "## Scan Complete"
  echo "Report saved to: memory/$SITE/latest.md"
  echo "Findings: $CRITICAL_COUNT critical, $WARNING_COUNT warning"

  # Suggest next actions
  if [ "$CRITICAL_COUNT" -gt 0 ]; then
    echo ""
    echo "⚠ CRITICAL ISSUES FOUND"
    echo "Suggested next action: Review memory/$SITE/latest.md and fix critical issues"
  elif [ ${#SKILLS_SKIPPED[@]} -gt 0 ]; then
    echo ""
    echo "⚠ Incomplete scan (${#SKILLS_SKIPPED[@]} skill(s) skipped)"
    echo "Suggested next action: Fix connectivity issues and re-run: /diagnose"
  fi
}

main "$@"
```

**Source:** Pattern synthesis from research findings.

### Example 2: Natural Language Argument Parsing

```bash
# Test cases for parse_diagnose_args function

# Input: "/diagnose security only on staging-site"
# Expected: mode=security-only, site=staging-site

# Input: "/diagnose just code on mysite"
# Expected: mode=code-only, site=mysite

# Input: "/diagnose" (no args, default site exists)
# Expected: mode=full, site=<default from sites.json>

parse_diagnose_args() {
  local input="$*"
  local mode="full"
  local site=""

  # Lowercase for case-insensitive matching
  local input_lower=$(echo "$input" | tr '[:upper:]' '[:lower:]')

  # Mode patterns
  if echo "$input_lower" | grep -qE "security|audit"; then
    mode="security-only"
  elif echo "$input_lower" | grep -qE "code|quality"; then
    mode="code-only"
  fi

  # Site extraction (case-sensitive for site names)
  if echo "$input" | grep -qE " on [a-z0-9-]+"; then
    site=$(echo "$input" | grep -oE "on [a-z0-9-]+" | awk '{print $2}')
  fi

  # Default site fallback
  if [ -z "$site" ]; then
    site=$(jq -r '.sites | to_entries[] | select(.value.is_default == true) | .key' sites.json)
  fi

  echo "$mode|$site"
}
```

**Source:** Bash pattern matching from [jq manual](https://jqlang.org/manual/) and [command-line argument parsing](https://www.dgp.toronto.edu/public_user/byron/papers/nli.html).

### Example 3: /status Command Enhancement

```bash
# Add to existing /status command
# Show available commands and suggested next action

show_available_commands() {
  echo ""
  echo "## Available Commands"
  echo ""
  echo "- /connect [site-name] — Connect to a WordPress site"
  echo "- /diagnose [mode] [on site-name] — Run diagnostic scan"
  echo "  Modes: full (default), security only, code only"
  echo "- /status — View connected sites and scan results"
  echo "- /status remove <site-name> — Remove a site profile"
  echo "- /status default <site-name> — Set default site"
}

suggest_next_action_from_status() {
  local site_name="$1"
  local report_path="memory/$site_name/latest.md"

  if [ ! -f "$report_path" ]; then
    echo "Suggested next action: /diagnose on $site_name"
    return
  fi

  # Check scan age
  local scan_date=$(grep "^\*\*Date:\*\*" "$report_path" | sed 's/.*\*\*Date:\*\* //')
  local scan_timestamp=$(date -j -f "%Y-%m-%d" "$scan_date" "+%s" 2>/dev/null || echo "0")
  local now=$(date +%s)
  local days_old=$(( (now - scan_timestamp) / 86400 ))

  if [ "$days_old" -gt 7 ]; then
    echo "Suggested next action: /diagnose on $site_name (last scan $days_old days ago)"
    return
  fi

  # Check for critical findings
  local critical_count=$(grep "| Critical |" "$report_path" | sed 's/.*| //' | sed 's/ .*//' | tr -d ' ')
  if [ "$critical_count" -gt 0 ]; then
    echo "Suggested next action: Review and fix critical issues, then re-scan"
    return
  fi

  echo "Suggested next action: Site is healthy. Next scan recommended in $((7 - days_old)) days."
}
```

**Source:** Enhancement based on existing /status command structure and user decision for "show available commands, last run time, or suggested next action".

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rigid flag-based CLI (`--security-only`) | Natural language parsing ("security only") | 2024-2025 with AI CLI tools | More conversational, lower barrier to use |
| Abort on first error | Skip-and-continue with partial results | Best practice since 2020s | Users get value even from incomplete scans |
| Silent progress (batch job mentality) | Inline progress with finding counts | Modern CLI UX since 2023 | Reduces perceived wait time, builds trust |
| Health grades on complete scans only | "Incomplete" grade when skills skipped | Emerging pattern in 2025 | Prevents false confidence from partial scans |

**Deprecated/outdated:**
- **Spinner animations without status text**: Modern CLIs prefer status + counts over animated spinners (more informative, less distracting)
- **Requiring flags for every option**: Natural language parsing allows flexible invocation without memorizing flags
- **Hiding errors until end of workflow**: Users need immediate feedback on critical issues, not just final summary

## Open Questions

1. **Should /connect be enhanced with pre-flight checks?**
   - What we know: User decision marked as "Claude's discretion"
   - What's unclear: Whether pre-flight checks add value or just slow down connection
   - Recommendation: Leave /connect as-is from Phase 2. It already validates SSH, WordPress installation, and WP-CLI. Adding more checks would slow down the flow without clear benefit. Focus effort on /diagnose workflow quality instead.

2. **How verbose should progress messages be?**
   - What we know: User wants "step-by-step inline progress" but also "feel like a consultant, not a script"
   - What's unclear: Balance between informative and overwhelming
   - Recommendation: One line per skill with counts (current approach). Show critical findings inline, but warnings/info just counted. Full details in report file. This keeps progress concise while highlighting urgent issues.

3. **What version bump for plugin manifest?**
   - What we know: User decision marked as "Claude's discretion" — 1.3.0 or 2.0.0
   - What's unclear: Whether completing the project (all 4 phases) justifies major version bump
   - Recommendation: Use 2.0.0. Phase 4 completes the plugin's core value proposition (user-facing diagnostic workflows). This is a major milestone worthy of 2.0. Save 1.x for incremental feature additions after this.

4. **Should /status show command help inline?**
   - What we know: User wants "show available commands" but /status is primarily for site listing
   - What's unclear: Whether to always show commands or only when prompted
   - Recommendation: Add optional `/status help` subcommand to show available commands. Don't clutter default `/status` output with command help — keep it focused on site status. Users who need command help will ask for it.

## Sources

### Primary (HIGH confidence)

- **Existing codebase** — commands/connect/COMMAND.md, commands/status/COMMAND.md, skills/diagnostic-*/SKILL.md, skills/report-generator/SKILL.md verified all patterns and data structures
- [jq Manual](https://jqlang.org/manual/) — JSON processing patterns for finding aggregation
- [Command Line Interface Guidelines](https://clig.dev/) — CLI best practices for conversational commands

### Secondary (MEDIUM confidence)

- [Choose a design pattern for your agentic AI system](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system) — Sequential orchestration pattern for workflows with dependencies
- [CLI UX best practices: 3 patterns for improving progress displays](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays) — Modern progress feedback patterns
- [How to Make a Bash Script Continue to Run After an Error](https://www.squash.io/ensuring-bash-scripts-continue-after-error-in-linux/) — Skip-and-continue error recovery
- [Natural Language as an Interface Style](https://www.dgp.toronto.edu/public_user/byron/papers/nli.html) — Natural language parsing principles
- [3 Bash error-handling patterns I use in every script](https://www.howtogeek.com/bash-error-handling-patterns-i-use-in-every-script/) — Error handling best practices
- [12 Bash Scripts to Implement Intelligent Retry, Backoff & Error Recovery](https://medium.com/@obaff/12-bash-scripts-to-implement-intelligent-retry-backoff-error-recovery-a02ab682baae) — Retry patterns (decided not to use complex retry for diagnostic workflows)
- [Conversational UI Design Patterns](https://www.aiuxdesign.guide/patterns/conversational-ui) — Conversational interface design

### Tertiary (LOW confidence)

None — all findings verified with HIGH or MEDIUM confidence sources.

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — All tools already in use from Phases 1-3, no new dependencies
- **Architecture patterns:** HIGH — Sequential orchestration verified against Google Cloud docs, error recovery from bash best practices, progress feedback from Evil Martians CLI UX guide
- **Natural language parsing:** MEDIUM — Pattern matching approach synthesized from NL interface principles, not a standard library pattern
- **Pitfalls:** HIGH — Derived from existing codebase structure and common bash scripting errors

**Research date:** 2026-02-17
**Valid until:** 60 days (stable domain — bash orchestration patterns change slowly)
