# Project Research Summary

**Project:** Claude CoWork WordPress Diagnostics Plugin
**Domain:** Remote WordPress Diagnostic & Security Audit Tool
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

This is a Claude CoWork plugin that performs deep diagnostic analysis of remote WordPress sites via SSH without installing anything on the target server. Unlike traditional WordPress diagnostic tools that run server-side as plugins, this operates entirely agent-side using SSH, rsync, WP-CLI, and Claude's AI capabilities to analyze code quality, security vulnerabilities, performance bottlenecks, and architectural issues.

The recommended approach is a zero-dependency, file-based CoWork plugin using markdown commands and skills to orchestrate native system tools (SSH, rsync, jq, git). Core stack: SSH for connectivity, rsync for file synchronization, WP-CLI (remote) for WordPress operations, and Claude analysis for code quality insights that automated scanners miss. Store connection profiles in sites.json (SSH config references only, never credentials), sync WordPress files locally for analysis, and generate markdown diagnostic reports in a memory/ directory for historical tracking.

Critical risks center on credential exposure and data integrity. The plugin handles SSH keys and remote site access, making security paramount: never store credentials in version control, always use SSH config indirection, implement .gitignore from day one. Secondary risks include rsync misconfiguration (--delete flag disasters), platform incompatibilities (macOS openrsync vs Linux rsync), and Claude context exhaustion on large sites (10GB+ WordPress installations). Mitigation requires strict security patterns in Phase 1, size-aware sync strategies, and selective file transfer (exclude uploads/cache).

## Key Findings

### Recommended Stack

The plugin operates as a pure orchestration layer with zero package dependencies. All functionality comes from coordinating existing command-line tools: SSH (OpenSSH) for remote access, rsync 3.x for fast file synchronization, WP-CLI 2.x (remote) for WordPress management, and jq 1.7+ for JSON parsing. Optional remote tools for advanced analysis: PHPStan 2.x for static analysis, PHP_CodeSniffer 3.13+ with WordPress Coding Standards 3.0+ for code quality, and WPScan CLI for security vulnerability scanning.

**Core technologies:**
- **CoWork plugin format (Markdown + JSON)**: Command definitions and skills are markdown files with embedded instructions for Claude, not compiled code
- **SSH + rsync**: Universal secure remote access and delta-sync file transfer (only changed files), standard for WordPress migrations
- **WP-CLI (remote)**: WordPress CLI for safe database queries, plugin/theme audits, file integrity checks (must be pre-installed on target server)
- **JSON + Markdown storage**: Sites.json for connection profiles, memory/ directory for diagnostic findings (simple, version-controllable, no database needed)
- **jq**: Command-line JSON processor for parsing WP-CLI JSON output and processing diagnostic data

**What NOT to use:**
- Compiled executables in plugin (CoWork is markdown-only)
- npm/pip dependencies (native system tools only)
- Direct database queries over SSH (dangerous, use WP-CLI instead)
- FTP/unencrypted protocols (SSH with key-based auth only)
- Hardcoded SSH credentials (use SSH config + key references)
- Full site sync including uploads (context window exhaustion)

### Expected Features

WordPress diagnostic tools have established expectations. Users expect all major security audit features (vulnerability scanning, file integrity, user account audits, SSL checks), performance analysis (database optimization recommendations, bottleneck detection), and compliance checks (version compatibility, plugin/theme audits). Missing any of these makes the product feel incomplete.

**Must have (table stakes):**
- Security vulnerability scanning (WPScan DB + checksums)
- File integrity monitoring (compare against WordPress checksums)
- Plugin/theme version audit with vulnerability cross-reference
- Database optimization recommendations (autoload bloat, orphaned data)
- Performance bottleneck detection (slow queries, N+1 patterns)
- PHP/WordPress/MySQL version compatibility checks
- User account security audit (weak admin accounts, default usernames)
- Structured audit report generation (markdown/HTML for client delivery)
- HTTPS/SSL configuration audit
- File permission checks (644/755 compliance)

**Should have (differentiators):**
- AI-powered code quality analysis (Claude detects logic flaws and anti-patterns that automated scanners miss — main differentiator)
- Natural language finding explanations (technical + client-friendly language automatically)
- Automated patch file generation (rare capability: ready-to-apply .patch files for fixes)
- Architecture review with recommendations (explain WHY performance issues exist, recommend refactoring)
- Plugin/theme conflict root cause analysis (explain hook collisions, namespace pollution)
- Historical trend analysis (track security posture over time vs point-in-time snapshots)

**Defer (v2+):**
- Accessibility audit (WCAG compliance) - growing requirement but niche audience
- Compliance gap analysis (GDPR/PCI) - specialized knowledge, high complexity
- Multi-site audit comparison - agency-focused feature
- Plugin/theme conflict detection - situational, high complexity

**Anti-features (explicitly avoid):**
- Auto-apply fixes without approval (too dangerous for remote tool)
- Real-time monitoring/alerting (scope creep, requires infrastructure)
- Automatic plugin/theme updates (outside diagnostic scope)
- Built-in file backup/restore (adds complexity, existing tools handle this)
- WordPress admin dashboard integration (this is a CoWork plugin, not WP plugin)
- Malware removal/cleanup (detection yes, remediation no)

### Architecture Approach

The plugin follows the CoWork plugin pattern with clear separation between declarative configuration (commands/skills in markdown) and operational data (connection profiles in data/sites.json, diagnostic findings in memory/). Commands are user-facing workflows (connect, diagnose, audit, status) that orchestrate multiple skills and Bash tool operations. Skills are auto-invoked domain expertise modules (security-analysis, performance-analysis, code-quality, architecture-review) containing analysis patterns and red flags.

**Major components:**
1. **Commands layer** (commands/*.md) — User-invoked workflows that orchestrate skills, execute SSH/rsync via Bash tool, generate reports
2. **Skills layer** (skills/*/SKILL.md) — Domain expertise modules auto-selected by Claude based on task context (security, performance, code quality, architecture patterns)
3. **Execution layer** (Bash tool) — Shell operations for SSH connections, rsync file sync, WP-CLI remote commands, jq JSON processing
4. **Data layer** (data/sites.json, memory/) — Persistent connection profiles (SSH config references only), diagnostic findings history (markdown reports), timeline tracking (JSON)
5. **File sync layer** (synced/ directory) — Local cached copies of remote WordPress files, enables offline analysis and wide-context code review (gitignored)

**Key architectural patterns:**
- **Command as Orchestrator**: Commands are prose workflows, not code — coordinate skills and execution tools
- **Skills as Domain Experts**: Self-contained markdown knowledge bases, auto-invoked, no manual selection
- **Data Separation**: Config (sites.json) vs findings (memory/) — prevents credential leakage, enables version control
- **Bash Tool Integration**: Direct SSH/rsync execution, no custom MCP server needed for v1
- **Memory System**: Structured markdown findings with timestamps for historical comparison

**Critical anti-patterns to avoid:**
- Storing SSH keys in sites.json (security breach if committed)
- Running analysis on remote site (performance impact, requires tool installation)
- Monolithic diagnostic skill (violates separation of concerns, less precise)
- Embedding credentials in command markdown (version control leak)
- No sync tracking (wasteful transfers, no audit trail)

### Critical Pitfalls

1. **SSH Credential Exposure in sites.json** — Credentials committed to git compromise all managed sites. NEVER store passwords/keys directly. Use SSH config references only, add sites.json to .gitignore in Phase 1, use SSH agent for key management. Address in Phase 1 (Foundation).

2. **rsync --delete Flag Disasters** — Using --delete in pull operations (remote → local) can wipe local analysis directory if remote path wrong or SSH drops. Always use --dry-run first, avoid --delete for diagnostic tools, use explicit exclusions (uploads, cache, logs). Document safe patterns in Phase 1.

3. **WP-CLI Path Assumptions Across Hosts** — Different hosts install WP-CLI at different paths (/usr/local/bin/wp, ~/bin/wp-cli.phar, or missing entirely). Probe for availability, store per-site path in sites.json, implement fallback chain. Address in Phase 2 (Site Detection).

4. **Claude Context Window Exhaustion on Large Sites** — Syncing 10GB+ WordPress sites (with uploads/cache) overwhelms context window, causes timeouts. Use selective sync (exclude uploads/cache/logs), check size before sync, prefer incremental analysis. Address in Phase 2 (Site Detection).

5. **Cross-Platform rsync Incompatibility** — macOS Sequoia replaced rsync with openrsync (limited flags, protocol 29 only). Test both platforms, use compatible flag subset, document platform requirements, or require Homebrew GNU rsync for macOS. Address in Phase 1 (Foundation).

6. **WordPress File Permissions Corrupted by rsync** — rsync preserves source permissions, but local UID/GID differs from remote. Use --chmod to normalize (dirs: 755, files: 644), or --no-perms for read-only diagnostics. Address in Phase 2 (Site Detection).

7. **Symlinked Plugins/Themes Break Detection** — Symlinks cause incorrect paths, WP-CLI failures, rsync confusion. Detect symlinks before analysis (find -type l), use rsync -L to follow symlinks, document behavior. Address in Phase 3 (Plugin Analysis).

## Implications for Roadmap

Based on research dependencies and pitfall prevention, suggested phase structure:

### Phase 1: Foundation & Security
**Rationale:** Must establish security patterns and safe operation before any site connections. Credential exposure is immediate critical risk, rsync misconfiguration can cause data loss. These patterns must be locked in before Phase 2 writes any connection data.

**Delivers:** Plugin structure (.claude-plugin/plugin.json, directory layout), .gitignore with security exclusions, data/sites.json schema (SSH config references only), documented safe rsync patterns (--dry-run, exclusions, no --delete on pull), platform detection (macOS vs Linux rsync compatibility).

**Addresses:**
- Security foundations (no credential storage)
- rsync safety documentation
- Cross-platform compatibility

**Avoids:**
- Pitfall 1: SSH credential exposure
- Pitfall 2: rsync --delete disasters
- Pitfall 5: Cross-platform rsync incompatibility

**Research flag:** Standard patterns, skip research-phase. Well-documented security practices and rsync usage.

### Phase 2: Site Connection & Detection
**Rationale:** After security foundation, implement connection workflow with intelligent probing. Must detect WP-CLI availability/path, check site size before sync, normalize permissions. Builds on Phase 1 security patterns.

**Delivers:** /connect command (SSH test, WP-CLI probe, size check, profile creation), /status command (list sites, sync status, recent diagnostics), rsync workflow with size warnings and permission normalization, sync tracking (last_synced timestamp in sites.json).

**Addresses:**
- Site connection management
- WP-CLI path detection
- Size-aware sync strategy

**Avoids:**
- Pitfall 3: WP-CLI path assumptions
- Pitfall 4: Context window exhaustion
- Pitfall 6: File permissions corrupted

**Research flag:** Skip research-phase. SSH, rsync, WP-CLI patterns well-documented in STACK.md and PITFALLS.md.

### Phase 3: Core Diagnostic Skills
**Rationale:** With safe connection established, implement domain expertise modules. These are independent, parallelizable — security, performance, and code quality can be developed simultaneously. Each skill analyzes local synced files.

**Delivers:** security-analysis skill (OWASP patterns, WordPress vulnerabilities, input sanitization), performance-analysis skill (database queries, caching patterns), code-quality skill (WPCS compliance, deprecated functions), wp-patterns skill (WordPress best practices reference).

**Addresses:**
- Security vulnerability scanning (table stakes)
- Code quality analysis (differentiator)
- Performance bottleneck detection (table stakes)

**Avoids:**
- Pitfall 7: Symlinked plugins (detect via security-analysis skill)

**Research flag:** Needs research-phase for security-analysis skill. OWASP patterns, WordPress vulnerability DB integration, sanitization functions require deep domain knowledge. Performance and code-quality can use documented WP-CLI/WPCS patterns.

### Phase 4: Diagnostic Workflow & Reporting
**Rationale:** Skills must exist before orchestration. This phase builds /diagnose command that coordinates Phase 3 skills, aggregates findings, generates reports. Depends on all previous phases.

**Delivers:** /diagnose command (orchestrate all skills, aggregate findings, rank by severity), memory/findings/ report generation (structured markdown with evidence), memory/history/ timeline tracking (JSON), finding deduplication logic.

**Addresses:**
- Structured audit report generation (table stakes)
- Natural language explanations (differentiator)
- Historical trend analysis foundation

**Avoids:**
- All pitfalls via proper orchestration of Phase 1-3 protections

**Research flag:** Skip research-phase. Orchestration patterns defined in ARCHITECTURE.md, report format straightforward.

### Phase 5: Specialized Audits & Advanced Features
**Rationale:** After core diagnostic workflow proven, add specialized capabilities. /audit command (security-focused subset), architecture-review skill, automated patch generation (differentiator).

**Delivers:** /audit command (security-only audit workflow), architecture-review skill (data model analysis, hook abuse detection, caching recommendations), patch file generation (git diff format from proposed fixes).

**Addresses:**
- Architecture review with recommendations (differentiator)
- Automated patch file generation (differentiator)

**Avoids:**
- Auto-apply fixes anti-pattern (generate patches for manual review only)

**Research flag:** Needs research-phase for patch generation. Git diff format, WordPress patch application workflow, testing procedures require validation.

### Phase 6: Polish & UX Refinement
**Rationale:** Core functionality complete, focus on user experience. Progress indication, error handling, help text, documentation.

**Delivers:** rsync progress indicators (--info=progress2), user-friendly error messages for common SSH/WP-CLI failures, inline help documentation, README with examples, finding deduplication improvements.

**Addresses:**
- UX pitfalls (no progress indication, cryptic errors)
- Professional polish for client delivery

**Research flag:** Skip research-phase. UX improvements based on testing, not research.

### Phase Ordering Rationale

- **Security first (Phase 1)**: Credential exposure is immediate critical risk, must be prevented before any site data stored
- **Connection before analysis (Phase 2 → 3)**: Can't analyze without files, can't get files without connection
- **Skills before orchestration (Phase 3 → 4)**: Commands compose skills, so skills must exist first
- **Core before specialized (Phase 4 → 5)**: Prove basic diagnostic workflow before adding advanced features
- **Features before polish (Phase 5 → 6)**: UX refinement after functionality complete

**Dependency chain:**
```
Phase 1 (Foundation)
  → Phase 2 (Connection)
    → Phase 3 (Skills)
      → Phase 4 (Workflow)
        → Phase 5 (Advanced)
          → Phase 6 (Polish)
```

**Parallelization opportunities:**
- Phase 3 skills can be built in parallel (security, performance, code-quality are independent)
- Phase 6 UX improvements can be applied across phases as they complete

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (security-analysis skill):** Complex domain — OWASP patterns, WordPress-specific vulnerabilities, sanitization function detection, WPScan/Patchstack integration
- **Phase 5 (patch generation):** Git diff format, WordPress patch application workflow, testing procedures for generated fixes

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Established security practices, well-documented rsync/SSH patterns
- **Phase 2 (Connection):** Standard WP-CLI usage, SSH probing, documented in STACK.md
- **Phase 4 (Workflow):** Orchestration patterns defined in ARCHITECTURE.md
- **Phase 6 (Polish):** UX improvements based on testing, not research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified via official docs (WP-CLI, SSH, rsync, jq). CoWork plugin format from Anthropic official sources. PHPStan/WPCS/WPScan widely documented. |
| Features | MEDIUM | Table stakes features verified across multiple WordPress security/diagnostic tools (Wordfence, Sucuri, ManageWP, WP-CLI Doctor). Differentiators (AI code analysis, patch generation) inferred from Claude capabilities but unproven in practice. |
| Architecture | HIGH | CoWork plugin patterns from official Anthropic documentation and examples. Remote diagnostic architecture from multiple engineering sources. Separation of concerns principles well-established. |
| Pitfalls | HIGH | SSH security practices from Google Cloud, Tailscale, Delinea best practice guides. rsync pitfalls from community experience (VKC.sh, GridPane). WP-CLI remote issues from official GitHub discussions. Context window limits from Anthropic documentation. |

**Overall confidence:** HIGH

All critical technical patterns verified through official documentation and authoritative sources. Primary uncertainty is around AI differentiators (how well will Claude code analysis perform vs automated tools?) and patch generation accuracy (can Claude produce valid unified diffs?). These are validate-by-building questions, not research gaps.

### Gaps to Address

**Validation needed during implementation:**
- **WP-CLI remote execution reliability**: Test SSH alias setup, command timeouts, error handling across diverse hosting providers (WP Engine, Kinsta, shared hosting)
- **Patch file generation accuracy**: Verify Claude can produce valid unified diffs from code analysis that apply cleanly via `git apply` or WordPress core patch workflow
- **Vulnerability database access**: Confirm WPScan API terms, Patchstack integration requirements, rate limits, authentication needs
- **rsync performance at scale**: Test with 100K+ file WordPress installations, measure sync time, verify interruption handling

**Research gaps to fill during Phase 3 planning:**
- **WordPress-specific OWASP patterns**: Which sanitization functions are current (2026)? How to detect SQL injection in WP context (vs generic PHP)?
- **WPScan/Patchstack integration**: API endpoints, authentication, data format, rate limits
- **N+1 query detection**: How to parse WP-CLI db query output to identify N+1 patterns? What's the detection heuristic?

**Not blocking MVP, defer to post-launch:**
- Accessibility audit implementation details (WCAG 2.2 rule engines)
- Compliance frameworks (GDPR technical requirements, PCI-DSS WordPress implications)
- Multi-site comparison algorithms (diff presentation, trend visualization)

## Sources

### Primary (HIGH confidence)
- **CoWork Plugin Format:** [Anthropic knowledge-work-plugins GitHub](https://github.com/anthropics/knowledge-work-plugins), [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- **WP-CLI:** [WP-CLI Commands Documentation](https://developer.wordpress.org/cli/commands/), [WP-CLI Doctor Command GitHub](https://github.com/wp-cli/doctor-command), [Running Commands Remotely](https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/)
- **Security:** [WordPress Coding Standards (WPCS)](https://github.com/WordPress/WordPress-Coding-Standards), [WPScan](https://wpscan.com/), [Patchstack Database](https://patchstack.com/database)
- **SSH/rsync:** [OpenSSH Documentation](https://www.openssh.com/), [SSH Best Practices - Google Cloud](https://cloud.google.com/compute/docs/connect/ssh-best-practices/credentials), [Everyday rsync - VKC.sh](https://vkc.sh/everyday-rsync/)

### Secondary (MEDIUM confidence)
- **Features Research:** WordPress security plugin documentation (Wordfence, Sucuri), multi-site managers (ManageWP, WP Umbrella), diagnostic tools (Health Check plugin, Query Monitor)
- **Architecture:** [Remote Diagnostic Agent Architecture](https://dataautomationtools.com/remote-diagnostic-agent/), [Claude CoWork Plugins Complete Guide](https://claudecowork.im/blog/claude-cowork-plugins-complete-guide)
- **Pitfalls:** Community guides (WP Bullet rsync commands, GridPane migration guides), hosting provider documentation (Kinsta, WP Engine)

### Tertiary (LOW confidence)
- Generic 2026 blog posts about WP-CLI, rsync, SSH (TechEduByte, DevToolbox) — used for version verification, not authoritative patterns
- Community forum discussions (GitHub issues, Stack Overflow) — directional insights, not definitive solutions

---
*Research completed: 2026-02-16*
*Ready for roadmap: yes*
