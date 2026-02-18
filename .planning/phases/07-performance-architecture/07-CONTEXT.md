# Phase 7: Performance & Architecture - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect performance bottlenecks in code and scheduled events, and deliver an AI-synthesized architectural health assessment. Covers N+1 query pattern detection, wp-cron event analysis, WP-CLI Profile hook/stage timing (with graceful degradation), CPT misuse detection, hook abuse patterns, caching anti-patterns, and a synthesized health narrative across all diagnostic domains.

</domain>

<decisions>
## Implementation Decisions

### N+1 Detection Confidence
- Pattern-based confidence tiers: High = query inside foreach/while loop, Medium = get_post inside loop, Low = multiple sequential queries on same table
- Scope: custom code only, skip well-known plugins (WooCommerce, Yoast, etc.) that users can't fix — consistent with architecture analysis scope
- Findings include flag + specific rewrite suggestion using actual variable names from the code
- Cron analysis triggers on: events overdue by >1 hour, duplicate hooks, and intervals under 5 minutes

### WP-CLI Profile Degradation
- Detection: run `wp profile --help` and check exit code — simplest, works regardless of install method
- When unavailable: skip with itemized list — each skipped check (hook timing, stage profiling) shown as individual Info finding with "Install wp-cli/profile-command for..." message
- Offer to install: ask the user "wp-cli/profile-command is not installed. Install it now?" before attempting — never auto-install
- When available: show stage breakdown (plugins_loaded, init, template_redirect, etc.) with times PLUS top 5 slowest hooks

### Architecture Report Depth
- CPT misuse: pattern-based detection — flag CPTs that register but have zero/very few posts (dead CPTs) AND CPTs with excessive rows relative to their purpose
- Hook abuse: flag expensive operations on 'init'/'wp_loaded', same hook+priority from different plugins, hooks with >20 callbacks
- Caching anti-patterns: check if persistent object cache is installed, flag direct DB queries that could use transients, flag transients used as permanent storage
- Architecture scope: same as N+1 — custom code only, skip well-known plugins

### Synthesized Narrative Style
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

</decisions>

<specifics>
## Specific Ideas

- N+1 rewrites should show the actual code from the file with variable names, not generic examples
- The "offer to install" flow for wp-cli/profile-command should be a user prompt, not automatic
- The synthesis reads from memory/ directory to pull in findings from all diagnostic domains

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-performance-architecture*
*Context gathered: 2026-02-19*
