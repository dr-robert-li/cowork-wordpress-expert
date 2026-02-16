# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
