# Phase 1: Plugin Foundation - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the CoWork plugin directory structure, credential protection patterns, and safe operation defaults. This phase creates the skeleton that all subsequent phases build on. No connectivity, no diagnostics — just the secure, well-organized foundation.

</domain>

<decisions>
## Implementation Decisions

### Plugin Identity
- Plugin name: `wordpress-expert`
- Command prefix: `wpe` (commands will be /wpe:connect, /wpe:diagnose, /wpe:audit, /wpe:status)
- Author: Robert Li
- Description: Claude's discretion — write a concise marketplace description

### Directory Layout
- Skills organized by diagnostic domain: skills/security-analysis/, skills/code-quality/, skills/performance/, skills/wp-patterns/
- Synced site files live in `.sites/{site-name}/` (hidden directory, gitignored)
- Findings history structured by site then date: `memory/sites/{name}/2026-02-16-audit.md`
- Ship a `sites.json.example` with placeholder values showing the connection format

### Credential Safety
- sites.json is ALWAYS gitignored — never committed regardless of content
- Support both SSH config aliases AND direct key path in sites.json — user chooses per site
- .gitignore covers: sites.json, .sites/, memory/, *.log, .DS_Store (standard list)

### CLAUDE.md Content
- Rework the existing CLAUDE.md — don't use as-is
- CLAUDE.md = identity/process at top + hot cache for active state below (combined approach)
- ALL 6 diagnostic domains from current CLAUDE.md move to skill files (full transfer)
- Communication style (dual non-technical + technical explanations) goes in a reporting skill, not CLAUDE.md
- Testing framework knowledge included as skills/testing/SKILL.md

### Claude's Discretion
- Exact plugin.json description text
- .mcp.json contents (empty or minimal for v1)
- CLAUDE.md hot cache structure and formatting
- How to split the current CLAUDE.md's content across skill files

</decisions>

<specifics>
## Specific Ideas

- The existing CLAUDE.md in the repo is the source material for all diagnostic knowledge — extract into skills rather than rewriting from scratch
- Plugin should follow the same patterns as Anthropic's official plugins (e.g., productivity plugin structure)
- Skills should be self-contained enough that Claude auto-selects the right one based on what the user asks about

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-plugin-foundation*
*Context gathered: 2026-02-16*
