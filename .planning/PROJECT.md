# WP Diagnostics Expert — CoWork Plugin

## What This Is

A Claude CoWork plugin that turns Claude into a senior WordPress systems analyst. It connects to remote WordPress sites via SSH, syncs files and database data locally for fast wide-context analysis, and performs comprehensive diagnostics across security, performance, code quality, and architecture. It works in both Claude Code CLI and Claude Desktop.

## Core Value

Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.

## Current Milestone: v2.0 Database, Performance & Multi-Source Access

**Goal:** Add database health analysis, performance diagnostics, architecture review, findings trends, and support for local/Docker/git-based WordPress sites alongside existing SSH remote access.

**Target features:**
- Database optimization analysis (autoload bloat, transients, revisions)
- Performance bottleneck detection (N+1 queries, expensive hooks, blocking HTTP)
- HTTPS/SSL configuration audit
- File permissions check against WP recommendations
- Architecture review (CPT misuse, options bloat, caching, hook abuse)
- Findings trends tracking (improving/degrading posture over time)
- Local WordPress directory support (MAMP, Flywheel, etc.)
- Docker container WordPress support
- Git repository support (clone remote + point at local)
- Direct DB access via wp-config.php credentials (local sites)

## Requirements

### Validated

- ✓ Plugin follows CoWork plugin structure — v1.0
- ✓ SSH connection, file sync, site profiles — v1.0
- ✓ Full diagnostic suite (security, code quality, versions) — v1.0
- ✓ Evidence-based findings with severity ratings — v1.0
- ✓ Structured markdown reports — v1.0
- ✓ Memory-based findings history — v1.0
- ✓ /connect, /diagnose, /status commands — v1.0
- ✓ /investigate with intake → scout → plan → execute → review — v2.1.0
- ✓ CLI distribution via npx wpxpert — v2.1.0

### Active

- [ ] Database optimization analysis (autoload bloat, transients, revisions)
- [ ] Performance bottleneck detection (N+1 queries, expensive hooks)
- [ ] HTTPS/SSL configuration audit
- [ ] File permissions check
- [ ] Architecture review (CPT, options, caching, hooks)
- [ ] Findings trends tracking over time
- [ ] Local WordPress directory support
- [ ] Docker container WordPress support
- [ ] Git repository support (clone + local)
- [ ] Direct DB access via wp-config.php credentials

### Out of Scope

- Direct push of fixes to remote sites — plugin proposes patches, user applies manually
- WordPress plugin installation on the remote site — this is agent-side only
- Real-time monitoring or continuous scanning — on-demand diagnostics only
- GUI or web dashboard — works through Claude's conversational interface
- Non-SSH remote access (FTP, SFTP-only, cPanel API) — SSH for remote, local/git for others
- Malware removal/cleanup — detection only
- Full code refactoring — diagnostic tool, not development service
- Multi-site batch comparison matrix — defer to v3

## Context

- Built on Anthropic's Claude CoWork plugin system (github.com/anthropics/knowledge-work-plugins)
- CoWork plugins are markdown + JSON, no compiled code — commands are prose workflows, skills are domain knowledge
- Plugin structure: `.claude-plugin/plugin.json`, `commands/*.md`, `skills/*/SKILL.md`, `.mcp.json`
- Shell commands (ssh, rsync, wp-cli) are executed through Claude's Bash tool, not through MCP servers
- The existing CLAUDE.md in this repo defines the diagnostic methodology, severity ratings, testing framework, and reporting formats — this becomes the plugin's core skill content
- Target users: WordPress developers, agency teams, freelancers managing multiple client sites, site owners with SSH access

## Constraints

- **Plugin format**: Must follow CoWork plugin spec — markdown commands, JSON config, no compiled code
- **Execution model**: SSH/rsync/WP-CLI via Claude's Bash tool (shell commands in command markdown)
- **Security**: SSH keys/passwords must never appear in logs, memory, or committed files
- **Local storage**: Synced files go into plugin working directory subdirectories
- **Compatibility**: Must work in both Claude Code CLI and Claude Desktop (CoWork)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CoWork plugin (not WP plugin) | Runs agent-side, nothing installed on target site | — Pending |
| SSH + rsync for file access | Standard, secure, available on most hosts | — Pending |
| Shell commands via Bash tool | CoWork plugins are markdown-only, no custom MCP server needed | — Pending |
| Read + propose (not push) | Safety — user reviews patches before applying to production | — Pending |
| sites.json + memory/ split | Connection config separate from diagnostic findings/history | — Pending |
| WP-CLI over SSH for DB | Leverages existing WP tooling, no direct DB credentials needed | — Pending |

---
*Last updated: 2026-02-18 after v2.0 milestone start*
