# Phase 4: Command Workflows - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

User-facing commands that orchestrate all diagnostic skills into complete workflows. Phase 4 creates /diagnose (with modes) and enhances /status. Existing /connect from Phase 2 is reused. No new diagnostic skills are created — this phase composes what exists.

</domain>

<decisions>
## Implementation Decisions

### Command scope & overlap
- /connect stays as-is from Phase 2 — Claude decides whether to enhance with pre-flight checks
- /audit is NOT a separate command — it becomes a mode on /diagnose (security-only mode)
- /diagnose supports three modes: full (default), security-only, code-only
- /diagnose auto-connects if no active connection exists (runs /connect flow first)
- Natural re-runs supported: user can say "diagnose just security" to re-check a specific category

### Output & progress feedback
- Step-by-step inline progress: show each skill as it runs with finding counts
- Critical findings shown immediately as discovered (title + one-line summary); warnings/info just counted
- After completion: summary + file path (health grade, finding counts, top 3 issues inline; full report saved to memory/{site}/latest.md)
- Suggest next steps after completion based on findings (e.g., "Update plugins", "Re-scan after fixes")

### Error handling & partial runs
- Skip and continue: if a skill fails (SSH drop, timeout), mark as "skipped" in report and run remaining skills
- Auto-resync before diagnostics: always resync files silently to ensure fresh data
- Partial report when WP-CLI unavailable: run local-only skills (malware scan, code quality), note WP-CLI skills as "unavailable"
- Health grade marked "Incomplete" (not A-F) when skills were skipped — avoids false confidence

### Command arguments & invocation
- Natural language invocation: users say "/diagnose security only on mysite" — Claude interprets intent
- Default site from sites.json used when no site specified; override with natural language ("on mysite")
- /status gets minor enhancements: show available commands, last run time, or suggested next action

### Claude's Discretion
- Whether to enhance /connect with pre-flight checks or leave as-is
- Exact wording of progress messages and next-step suggestions
- How to parse natural language arguments into mode + site selection
- /status enhancement scope (what minor additions make sense)
- Plugin manifest version bump (1.3.0 or 2.0.0 for project completion)

</decisions>

<specifics>
## Specific Ideas

- Commands should feel conversational, not CLI-like — natural language in, structured results out
- "Diagnose just security" and "run a security audit" should both work the same way
- Progress should feel like a knowledgeable consultant walking through checks, not a script running

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-command-workflows*
*Context gathered: 2026-02-17*
