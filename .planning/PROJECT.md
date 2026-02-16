# WP Diagnostics Expert — CoWork Plugin

## What This Is

A Claude CoWork plugin that turns Claude into a senior WordPress systems analyst. It connects to remote WordPress sites via SSH, syncs files and database data locally for fast wide-context analysis, and performs comprehensive diagnostics across security, performance, code quality, and architecture. It works in both Claude Code CLI and Claude Desktop.

## Core Value

Securely connect to any WordPress site, pull its full codebase and data locally, and deliver expert-level diagnostics with evidence-backed findings — without requiring anything installed on the WordPress site itself.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Plugin follows Claude CoWork plugin structure (plugin.json, commands/, skills/, .mcp.json)
- [ ] User can connect to a WordPress site via SSH (host, key, user, remote WP path)
- [ ] Files are synced locally via rsync into a subdirectory within the plugin working directory
- [ ] User can save site profiles (connection details stored in sites.json)
- [ ] User can run one-off connections without saving a profile
- [ ] User can run a full diagnostic suite (security, performance, code quality, architecture)
- [ ] User can run a focused security audit
- [ ] User can view status of connected sites, sync state, and recent findings
- [ ] Database access via WP-CLI over SSH for live queries
- [ ] Database dump and local analysis for deep inspection
- [ ] Findings are evidence-based with file paths, line numbers, and severity ratings
- [ ] Diagnostic reports generated in structured markdown format
- [ ] Plugin proposes fixes as patch files — user decides whether to apply
- [ ] Findings history stored in CoWork memory system (memory/ directory)
- [ ] Connection details stored in sites.json, findings/history in memory/
- [ ] Communication adapts for technical and non-technical audiences
- [ ] SSH credentials are never logged, committed, or exposed in output

### Out of Scope

- Direct push of fixes to remote sites — plugin proposes patches, user applies manually
- WordPress plugin installation on the remote site — this is agent-side only
- Real-time monitoring or continuous scanning — on-demand diagnostics only
- GUI or web dashboard — works through Claude's conversational interface
- Support for non-SSH access methods (FTP, SFTP-only, cPanel API) — SSH only for v1

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
*Last updated: 2026-02-16 after initialization*
