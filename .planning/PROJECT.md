# WP Diagnostics Expert — CoWork Plugin

## What This Is

A Claude CoWork plugin that turns Claude into a senior WordPress systems analyst. It connects to WordPress sites via SSH, local directories, Docker containers, or git repositories, syncs files and database data locally for fast wide-context analysis, and performs comprehensive diagnostics across security, performance, code quality, database health, and architecture. Works in both Claude Code CLI and Claude Desktop.

## Core Value

Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.

## Current State

**Shipped:** v2.0 (2026-02-19) — 9 phases, 24 plans, 57 requirements satisfied (32 v1 + 25 v2)
**Plugin LOC:** ~12,800 lines of markdown (commands + skills)
**Skills:** 21 diagnostic skills across 6 domains (security, code quality, database, infrastructure, performance, architecture)
**Commands:** 5 user-facing commands (/connect, /diagnose, /status, /investigate, /batch)

## Requirements

### Validated

- ✓ Plugin follows CoWork plugin structure — v1.0
- ✓ SSH connection, file sync, site profiles — v1.0
- ✓ Full diagnostic suite (security, code quality, versions) — v1.0
- ✓ Evidence-based findings with severity ratings — v1.0
- ✓ Structured markdown reports — v1.0
- ✓ Memory-based findings history — v1.0
- ✓ /connect, /diagnose, /status commands — v1.0
- ✓ /investigate with intake, scout, plan, execute, review — v1.0
- ✓ Local directory, Docker, git repository connection — v2.0
- ✓ Source-type capability gating (DB skills skipped for git-only) — v2.0
- ✓ Database health analysis (autoload, transients, revisions) — v2.0
- ✓ HTTPS/SSL and file permissions audits — v2.0
- ✓ N+1 query detection, cron analysis, WP-CLI Profile — v2.0
- ✓ Architecture review with AI-synthesized narrative — v2.0
- ✓ Cross-scan trend tracking with content-based finding IDs — v2.0
- ✓ Multi-site batch diagnostics with comparison matrix — v2.0

### Active

(No active requirements — next milestone not started)

### Out of Scope

- Direct push of fixes to remote sites — plugin proposes patches, user applies manually
- WordPress plugin installation on the remote site — this is agent-side only
- Real-time monitoring or continuous scanning — on-demand diagnostics only
- GUI or web dashboard — works through Claude's conversational interface
- Non-SSH remote access (FTP, SFTP-only, cPanel API) — SSH for remote, local/git for others
- Malware removal/cleanup — detection only
- Full code refactoring — diagnostic tool, not development service
- WordPress multisite network analysis — defer to v3+
- Direct MySQL connection via credentials — WP-CLI is mandatory DB access path

## Context

- Built on Anthropic's Claude CoWork plugin system
- CoWork plugins are markdown + JSON, no compiled code — commands are prose workflows, skills are domain knowledge
- Plugin structure: `.claude-plugin/plugin.json`, `commands/*.md`, `skills/*/SKILL.md`, `.mcp.json`
- Shell commands (ssh, rsync, wp-cli) executed through Claude's Bash tool
- Target users: WordPress developers, agency teams, freelancers managing multiple client sites

## Constraints

- **Plugin format**: Must follow CoWork plugin spec — markdown commands, JSON config, no compiled code
- **Execution model**: SSH/rsync/WP-CLI via Claude's Bash tool (shell commands in command markdown)
- **Security**: SSH keys/passwords must never appear in logs, memory, or committed files
- **Local storage**: Synced files go into plugin working directory subdirectories
- **Compatibility**: Must work in both Claude Code CLI and Claude Desktop (CoWork)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CoWork plugin (not WP plugin) | Runs agent-side, nothing installed on target site | ✓ Good |
| SSH + rsync for file access | Standard, secure, available on most hosts | ✓ Good |
| Shell commands via Bash tool | CoWork plugins are markdown-only, no custom MCP server needed | ✓ Good |
| Read + propose (not push) | Safety — user reviews patches before applying to production | ✓ Good |
| sites.json + memory/ split | Connection config separate from diagnostic findings/history | ✓ Good |
| WP-CLI over SSH for DB | Leverages existing WP tooling, no direct DB credentials needed | ✓ Good |
| source_type field routing | Single field in sites.json drives all execution path differences | ✓ Good |
| Content-based finding IDs | Stable across reformats, enables cross-scan trend tracking | ✓ Good |
| 3-level severity (Critical/Warning/Info) | Simple, actionable, no ambiguity between levels | ✓ Good |
| A-F health grading matrix | Deterministic first-match-wins evaluation, intuitive for users | ✓ Good |
| Self-gating skill pattern | Skills check own preconditions rather than centralized array | ✓ Good |
| Bullet-point narrative (not prose) | Scales to any finding count, scannable output | ✓ Good |

---
*Last updated: 2026-02-19 after v2.0 milestone completion*
