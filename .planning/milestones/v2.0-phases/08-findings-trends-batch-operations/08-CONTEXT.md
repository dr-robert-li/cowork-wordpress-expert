# Phase 8 Context: Findings Trends & Batch Operations

## Trend Classification

- **ID matching:** Fuzzy with fallback — try exact content-based hash first, then fall back to matching on (finding_type + file_path) if hash doesn't match. Catches reformatting but accepts risk of false matches in same file.
- **Four classifications:** New (ID not in prior scan), Resolved (in prior not current), Recurring (in both), Regression (was resolved in a prior scan but reappeared).
- **Comparison depth:** Prior scan only — compare current vs last scan. Simple, fast, most actionable.
- **Staleness:** Warn but compare — compare against prior scan regardless of age, but add note when prior scan was 90+ days ago ("trend data may be less meaningful").

## Delta Report Format

- **Placement:** Inline badges per finding — each finding gets a tag like [NEW], [RECURRING], [REGRESSION] next to its title in the existing report. No separate Trends section header.
- **Resolved findings:** Summary list only — resolved findings appear as a simple list: "Resolved since last scan: [finding titles]". No full detail repeated.
- **First scan:** Skip trends entirely on first scan — no trends section, no placeholder. Clean report. Trends appear starting scan #2.
- **History retention:** Last 2 scans only in trends.json — current + prior scan data. Older data shifts out. Prevents unbounded file growth.

## Batch Invocation UX

- **Command:** New `/batch` command — separate from `/diagnose` to keep single-site workflow simple.
- **Site selection:** User selects subset — `/batch` prompts which sites to include or accepts site names as arguments. Not all-by-default.
- **Execution:** Parallel with limit — run up to N sites concurrently. Faster than sequential but needs connection limit guard.
- **Progress:** Status line per site — compact format: "Site 1/4: example.com ... Grade B (3 critical, 5 warning) [42s]" after each site completes.

## Comparison Matrix

- **Columns:** Grade + severity counts — Site name | Grade | Critical | Warning | Info | Last Scanned. Compact, fits terminal.
- **Mixed sources:** Show with coverage note — include all sites, add footnote or column indicating partial coverage ("git: 8/16 skills"). Grade computed on available findings.
- **Access:** Part of `/batch` output — matrix appears automatically at end of batch run. No separate command.
- **Sorting:** By grade, worst first — F sites at top, A at bottom. Most urgent sites front and center.

## Deferred Ideas

None captured.
