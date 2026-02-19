# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-02-19

### Added

- Multi-source connection support in `/connect`
  - Local directory connections (`/connect /var/www/wordpress`)
  - Docker container connections (`/connect docker:container-name`)
  - Git repository connections (`/connect git:repo-url`)
- `/batch` command for running diagnostics across multiple saved site profiles
  - Sequential per-site execution with status lines
  - Side-by-side comparison matrix of findings across sites
- Database health diagnostic skills
  - `diagnostic-db-autoload` — autoloaded option bloat detection and plugin attribution
  - `diagnostic-db-transients` — expired transient buildup and cleanup recommendations
  - `diagnostic-db-revisions` — post revision analysis by type with storage impact estimates
- Infrastructure audit skills
  - `diagnostic-https-audit` — SSL configuration, FORCE_SSL_ADMIN, mixed content indicators
  - `diagnostic-file-permissions` — file and directory permissions against WP recommendations
- Performance diagnostic skills
  - `diagnostic-performance-n1` — N+1 query pattern detection with confidence ratings
  - `diagnostic-cron-analysis` — overdue, duplicate, and excessively-frequent cron jobs
  - `diagnostic-wpcli-profile` — WP-CLI stage and hook timing for bottleneck identification
- Architecture review skills
  - `diagnostic-architecture` — CPT misuse, hook abuse patterns, caching anti-patterns
  - `diagnostic-arch-narrative` — AI-synthesized architectural health narrative
- Cross-scan trend tracking via `trend-tracker` skill
  - NEW/RESOLVED/RECURRING finding classification
  - Inline trend badges in diagnostic reports
- Performance diagnose mode (`/diagnose performance`)
- `CONTRIBUTING.md` with skill contribution guide and template
- `STANDARDS.md` with coding standards for the plugin
- `tests/validate-plugin.sh` for plugin structure validation
- GitHub Actions CI workflow

## [2.1.0] - 2026-02-18

### Added

- `/investigate` command with full structured workflow
  - Intake questioning to gather context before scanning (symptoms, timeline, urgency, scope)
  - Site scouting via SSH reconnaissance (error logs, recent changes, PHP environment)
  - Smart diagnostic planning based on concern type and scout findings
  - Parallel wave execution of diagnostic skills via Task() subagents
  - Findings verification to ensure results address the original concern
  - Confidence rating (High/Medium/Low) appended to reports
  - Case history tracking in `memory/{site}/case-log.json`
  - Emergency detection with auto-proceed security scan
- Intake skill (`skills/intake/SKILL.md`) — conversational context gathering
- Site Scout skill (`skills/site-scout/SKILL.md`) — SSH environment reconnaissance
- Scan Reviewer skill (`skills/scan-reviewer/SKILL.md`) — post-scan findings verification
- `config.json` with workflow toggles (intake, scouting, planning, parallel, review)
- Quick intake question for `/diagnose` (optional, configurable)
- Claude Code CLI installation via `npx wpxpert`
- `bin/install.js` installer for Claude Code addon distribution
- Case log schema documentation (`sites.json.schema.md`)

## [2.0.0] - 2026-02-17

### Added

- `/diagnose` command with full orchestration of all diagnostic skills
  - Three modes: full, security-only, code-only
  - Natural language invocation (e.g., "diagnose just security on mysite")
  - Inline progress feedback with immediate critical finding display
  - Skip-and-continue error recovery for partial scans
  - Auto-connect when site profile exists but local files are missing
  - Silent file resync before diagnostics
  - A-F health grading with "Incomplete" grade for partial scans
  - Suggested next actions based on findings
- `/status` available commands footer for command discovery
- `/status` per-site suggested next action based on scan age and findings
- Report generator skill with structured markdown reports and archive rotation
- Diagnostic skill: core integrity (WP-CLI checksum verification)
- Diagnostic skill: config security (wp-config.php analysis)
- Diagnostic skill: user audit (account security review)
- Diagnostic skill: version audit (WordPress/plugin/theme update status)
- Diagnostic skill: malware scan (pattern-based suspicious code detection)
- Diagnostic skill: code quality (AI-powered theme and plugin analysis)
- `/connect` command for SSH connection, WordPress detection, WP-CLI discovery, and file sync
- `/status` command for site listing, profile management (remove, default, rename)
- Plugin foundation with `.claude-plugin/plugin.json` manifest
- `sites.json.example` template for connection profiles
- `.gitignore` preventing credential and synced file exposure
- `CLAUDE.md` with safety protocols and diagnostic identity
- Safe rsync patterns with dry-run-first, no-delete, and macOS openrsync compatibility
