# Phase 6: Database Health & Infrastructure Audits - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

New diagnostic skills for WordPress database health analysis (autoload bloat, transient buildup, post revision accumulation) and infrastructure auditing (HTTPS/SSL configuration, file permissions). All DB access goes through WP-CLI exclusively. Skills integrate into existing /diagnose workflow with source-type gating from Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Thresholds & Severity
- Autoload bloat: Warning at 900KB (matches WordPress core threshold), Critical above 2MB
- Post revisions: Recommend specific limits (e.g., 10 revisions per post) and estimate DB savings from cleanup; flag when WP_POST_REVISIONS is unlimited
- Transient severity: Ratio-based — high expired:live transient ratio is the signal, not raw count
- Severity levels: Same 3-level system as existing diagnostics (Critical/Warning/Info) — no new levels; optimization suggestions are Info

### DB Finding Attribution
- Autoload attribution: Prefix matching to known plugin slugs (e.g., wpseo_* → Yoast SEO) — no code grepping
- Top offenders display: Show all autoloaded options above a size threshold (e.g., >10KB), not a fixed top-N count
- Autoload list format: Flat list sorted by size (largest first) with plugin attribution as a column — not grouped by plugin
- Transient presentation: Aggregate counts only (total expired, total live, ratio, overall size) — no individual transient listing

### Permission Check Scope
- Check key files only: wp-config.php, .htaccess, wp-content/uploads/, wp-content/debug.log
- SSH remote check only — skip permission checks entirely for non-SSH sources with a note explaining why (rsync normalizes permissions)
- wp-config.php thresholds: World-readable (644 or looser) = Critical; 640 or 600 = OK; directories 755 max
- debug.log: Only flag if WP_DEBUG is enabled in production — ties finding to actionable config issue

### HTTPS Audit Depth
- Config values only — check siteurl/home scheme, FORCE_SSL_ADMIN via WP-CLI; no external SSL cert probing
- Mixed content: Also grep all synced PHP/JS files for hardcoded http:// URLs — catches mixed content at the source
- Split into two checks: WP-CLI config checks (gated on WP-CLI availability) + code grep for hardcoded http:// (runs on any source type) — partial results better than skipping entirely
- Code grep scope: All synced PHP/JS files, not limited to active theme/plugins

### Claude's Discretion
- Exact size threshold for autoload offender display (suggested >10KB but Claude can adjust)
- Specific revision limit recommendation number
- Transient ratio thresholds for Warning vs Info
- debug.log permission check specifics
- Mixed content grep pattern design (avoiding false positives from comments, strings, etc.)

</decisions>

<specifics>
## Specific Ideas

- DB skills all go through WP-CLI (DBHL-05) — use the WP_CLI_PREFIX pattern established in Phase 5 for source-type routing
- Table prefix must be read dynamically via `wp config get table_prefix` (DBHL-04) — never hardcoded as wp_
- Permission checks are SSH-only — consistent with the source-type capability gating pattern from Phase 5
- HTTPS audit splits into WP-CLI-gated and non-gated parts — first time a skill has two sub-checks with different gating

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-database-health-infrastructure-audits*
*Context gathered: 2026-02-19*
