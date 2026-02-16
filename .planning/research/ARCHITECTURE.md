# Architecture Patterns

**Domain:** WordPress Remote Diagnostics CoWork Plugin
**Researched:** 2026-02-16
**Confidence:** HIGH

## Recommended Architecture

This plugin follows the Claude CoWork plugin architecture pattern with distinct separation between declarative configuration (commands/skills) and operational data (connection profiles, diagnostic findings).

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   USER INTERACTION LAYER                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ /connect │  │/diagnose │  │  /audit  │  │ /status  │    │
│  │ command  │  │ command  │  │ command  │  │ command  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └──────────────┴──────────────┴──────────────┘         │
├─────────────────────────────────────────────────────────────┤
│                  ORCHESTRATION LAYER                         │
│  ┌────────────────────────────────────────────────────┐      │
│  │           Command Workflow Logic                   │      │
│  │  (Connection → Sync → Analysis → Report)           │      │
│  └────────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────┤
│                    SKILLS LAYER                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Security │  │Performance│  │   Code   │  │   Arch   │    │
│  │ Analysis │  │ Analysis  │  │ Quality  │  │  Review  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
├─────────────────────────────────────────────────────────────┤
│                  EXECUTION LAYER                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │ SSH/Rsync  │  │  WP-CLI    │  │  Analysis  │             │
│  │ (Bash)     │  │  (Bash)    │  │  (Claude)  │             │
│  └────┬───────┘  └────┬───────┘  └────┬───────┘             │
│       └────────────────┴────────────────┘                    │
├─────────────────────────────────────────────────────────────┤
│                    DATA LAYER                                │
│  ┌────────────────┐  ┌─────────────────────────────┐        │
│  │  sites.json    │  │     memory/ directory       │        │
│  │  (connection   │  │  (diagnostic findings,      │        │
│  │   profiles)    │  │   history, evidence)        │        │
│  └────────────────┘  └─────────────────────────────┘        │
├─────────────────────────────────────────────────────────────┤
│                 FILE SYNC LAYER                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │     Plugin Working Directory Subdirectories         │    │
│  │  (synced WordPress files per-site)                  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Commands** | User-facing workflows - connect, diagnose, audit, status | Markdown files in `commands/` with workflow instructions |
| **Skills** | Domain expertise - security, performance, code quality, architecture | Markdown files in `skills/*/SKILL.md` with analysis patterns |
| **Execution Layer** | Shell operations via Bash tool - SSH, rsync, WP-CLI | Claude's Bash tool executing shell commands |
| **Data Layer** | Persistent storage - connection profiles, findings history | JSON files and markdown documents in plugin working directory |
| **File Sync Layer** | Local copies of remote WordPress files | Subdirectories within plugin working directory |

## Recommended Project Structure

```
cowork-wp-plugin/
├── .claude-plugin/
│   └── plugin.json               # Plugin manifest (name, version, description)
├── commands/
│   ├── connect.md                # SSH connection workflow
│   ├── diagnose.md               # Full diagnostic suite workflow
│   ├── audit.md                  # Security-focused audit workflow
│   └── status.md                 # Overview/status check workflow
├── skills/
│   ├── security-analysis/
│   │   └── SKILL.md              # OWASP, WordPress vulns, sanitization patterns
│   ├── performance-analysis/
│   │   └── SKILL.md              # DB queries, caching, frontend optimization
│   ├── code-quality/
│   │   └── SKILL.md              # WPCS, static analysis, deprecated functions
│   ├── architecture-review/
│   │   └── SKILL.md              # Theme/plugin patterns, data models
│   └── wp-patterns/
│       └── SKILL.md              # WordPress hooks, APIs, best practices
├── .mcp.json                     # MCP server config (likely empty for v1)
├── data/
│   └── sites.json                # Connection profile storage
├── memory/
│   ├── findings/                 # Per-site diagnostic findings
│   │   ├── [site-id]-YYYY-MM-DD.md
│   │   └── ...
│   └── history/                  # Historical analysis data
│       ├── [site-id]-timeline.json
│       └── ...
├── synced/                       # Synced WordPress files (gitignored)
│   ├── [site-id]/
│   │   ├── wp-content/
│   │   │   ├── themes/
│   │   │   └── plugins/
│   │   └── wp-config.php
│   └── ...
├── CLAUDE.md                     # Diagnostic methodology (becomes skill content)
├── README.md                     # Plugin documentation
└── .gitignore                    # Exclude synced/, credentials, sensitive data
```

### Structure Rationale

- **`.claude-plugin/plugin.json`**: CoWork plugin spec requires metadata in this location
- **`commands/`**: Explicit user-invoked workflows - each command orchestrates multiple skills and execution steps
- **`skills/`**: Auto-invoked domain knowledge - Claude selects relevant skills based on task context
- **`data/sites.json`**: Persistent connection profiles - SSH host, user, path, key location (NOT key content)
- **`memory/`**: CoWork memory pattern for diagnostic findings and history - searchable, version-controlled
- **`synced/`**: Local file cache per site - enables wide-context analysis without repeated SSH transfers
- **`.mcp.json`**: Future extensibility for MCP servers (v1 uses Bash tool directly)

## Architectural Patterns

### Pattern 1: Command as Orchestrator

**What:** Commands are markdown files that define multi-step workflows, coordinating skills and execution tools.

**When to use:** For all user-facing entry points (connect, diagnose, audit, status).

**Trade-offs:**
- **Pro:** Clear separation between user intent (command) and domain expertise (skills)
- **Pro:** Skills can be reused across multiple commands
- **Pro:** Workflows are readable prose, not code
- **Con:** Complex branching logic harder to express than in code

**Example:**
```markdown
# /wp-diagnostics:diagnose

You are conducting a comprehensive WordPress diagnostics session.

## Workflow

1. **Verify Connection**: Check that site profile exists or prompt for connection details
2. **Sync Files**: Use rsync to pull latest WordPress files to local synced/ directory
3. **Invoke Skills**: Apply security-analysis, performance-analysis, code-quality, architecture-review skills
4. **Aggregate Findings**: Collect findings from all skills, deduplicate, rank by severity
5. **Generate Report**: Create structured markdown report in memory/findings/
6. **Present Summary**: Display executive summary with critical/high findings highlighted

## Data Flow

```
User invokes /diagnose
  ↓
Load site profile from data/sites.json
  ↓
Execute: ssh [site] "wp core version" (verify connectivity)
  ↓
Execute: rsync -avz [remote]:/path/to/wp/ ./synced/[site-id]/
  ↓
Skills analyze local files (security-analysis, performance-analysis, etc.)
  ↓
Collect findings → memory/findings/[site-id]-YYYY-MM-DD.md
  ↓
Display summary to user
```
```

### Pattern 2: Skills as Domain Experts

**What:** Skills are self-contained markdown documents (SKILL.md) describing analysis patterns, red flags, and evidence requirements for a specific domain.

**When to use:** For reusable diagnostic knowledge that applies across multiple workflows.

**Trade-offs:**
- **Pro:** Auto-invoked by Claude based on task context (no manual selection)
- **Pro:** Modular - can add/remove skills without changing commands
- **Pro:** Markdown format allows rich examples, checklists, pattern libraries
- **Con:** No programmatic logic - purely declarative knowledge

**Example:**
```markdown
# Security Analysis Skill

## Activation Context

This skill applies when analyzing WordPress codebases for security vulnerabilities.

## Analysis Patterns

### 1. Input Validation
- Scan for `$_GET`, `$_POST`, `$_REQUEST`, `$_COOKIE`, `$_SERVER` without sanitization
- Verify all user inputs pass through WordPress sanitization functions
- Flag direct use of superglobals without `sanitize_text_field()` or similar

**Evidence Required:**
- File path
- Line number
- Offending code snippet
- Recommended fix

**Severity:** HIGH (if user-controlled data reaches database or output)

### 2. Output Escaping
- Check all `echo` statements in template files
- Verify context-appropriate escaping: `esc_html()`, `esc_attr()`, `esc_url()`
- Flag raw output of variables without escaping

**Evidence Required:**
- File path
- Line number
- Variable being output
- Recommended escaping function

**Severity:** HIGH (if user-controlled data, MEDIUM otherwise)

[... continues with more patterns ...]
```

### Pattern 3: Data Separation (Config vs Findings)

**What:** Separate connection configuration (sites.json) from diagnostic data (memory/).

**When to use:** Always - this prevents credentials leakage and enables selective version control.

**Trade-offs:**
- **Pro:** sites.json can be version-controlled (references SSH keys, doesn't contain them)
- **Pro:** memory/ is searchable history - can be version-controlled or gitignored per user preference
- **Pro:** synced/ is always gitignored (large, temporary, potentially sensitive)
- **Con:** Multiple storage locations to manage

**Implementation:**
```json
// data/sites.json
{
  "sites": [
    {
      "id": "client-acme-prod",
      "label": "Acme Corp Production",
      "host": "acme.com",
      "user": "wpuser",
      "ssh_key": "~/.ssh/acme_prod_rsa",
      "wp_path": "/var/www/html/wordpress",
      "created": "2026-02-16T10:30:00Z",
      "last_synced": "2026-02-16T14:22:00Z"
    }
  ]
}
```

```markdown
<!-- memory/findings/client-acme-prod-2026-02-16.md -->
# Diagnostic Report: Acme Corp Production

**Date:** 2026-02-16
**Site ID:** client-acme-prod
**WordPress Version:** 6.8.1
**PHP Version:** 8.2.15

## Critical Findings

### 1. SQL Injection Risk in Custom Plugin
**File:** synced/client-acme-prod/wp-content/plugins/acme-custom/includes/class-reports.php
**Line:** 142
**Severity:** CRITICAL
**Evidence:**
```php
$sql = "SELECT * FROM {$wpdb->prefix}reports WHERE user_id = {$_GET['user_id']}";
$results = $wpdb->query($sql);
```
**Issue:** Direct concatenation of $_GET['user_id'] into SQL query without sanitization or prepared statement.
**Fix:** Use $wpdb->prepare() with placeholder.
```

### Pattern 4: Bash Tool for SSH Operations

**What:** Use Claude's Bash tool to execute SSH, rsync, and WP-CLI commands directly from command markdown.

**When to use:** For all remote operations and file synchronization.

**Trade-offs:**
- **Pro:** No custom MCP server needed for v1
- **Pro:** Standard tools (ssh, rsync, wp-cli) - no proprietary dependencies
- **Pro:** Full shell capabilities available
- **Con:** Must handle SSH key management carefully (never log credentials)
- **Con:** Platform-dependent (requires *nix environment)

**Example:**
```markdown
## Sync Files Step

Execute the following bash command to sync WordPress files:

```bash
# Verify SSH connectivity first
ssh -i ~/.ssh/acme_prod_rsa wpuser@acme.com "wp core version" || {
  echo "SSH connection failed. Check credentials and network."
  exit 1
}

# Sync WordPress files (exclude uploads for speed)
rsync -avz \
  --exclude 'wp-content/uploads/*' \
  --exclude 'wp-content/cache/*' \
  -e "ssh -i ~/.ssh/acme_prod_rsa" \
  wpuser@acme.com:/var/www/html/wordpress/ \
  ./synced/client-acme-prod/

# Verify sync
ls -lh ./synced/client-acme-prod/wp-config.php || {
  echo "Sync failed - wp-config.php not found."
  exit 1
}
```

**SECURITY NOTE:** Never log or display SSH key contents. Only reference key paths.
```

### Pattern 5: Memory System for Findings History

**What:** Store diagnostic findings in CoWork memory/ directory using structured markdown.

**When to use:** For all diagnostic outputs - enables historical comparison and pattern detection.

**Trade-offs:**
- **Pro:** Version-controllable history (if user chooses)
- **Pro:** Searchable with grep/Claude's memory tools
- **Pro:** Markdown format - human-readable and LLM-friendly
- **Con:** Manual deduplication if same finding appears across multiple runs

**Structure:**
```
memory/
├── findings/
│   ├── client-acme-prod-2026-02-16.md
│   ├── client-acme-prod-2026-02-10.md
│   └── client-beta-corp-2026-02-15.md
└── history/
    ├── client-acme-prod-timeline.json
    └── client-beta-corp-timeline.json
```

**timeline.json format:**
```json
{
  "site_id": "client-acme-prod",
  "diagnostics": [
    {
      "date": "2026-02-16T14:22:00Z",
      "findings_file": "memory/findings/client-acme-prod-2026-02-16.md",
      "summary": {
        "critical": 2,
        "high": 5,
        "medium": 12,
        "low": 8
      }
    }
  ]
}
```

## Data Flow

### Complete Diagnostic Flow

```
User: /wp-diagnostics:diagnose client-acme-prod
    ↓
[COMMAND: diagnose.md]
    ↓
1. Load Connection Profile
   data/sites.json → extract host, user, ssh_key, wp_path
    ↓
2. Verify Connectivity
   Bash: ssh -i [key] [user]@[host] "wp core version"
    ↓
3. Sync Files
   Bash: rsync -avz [remote]:[wp_path]/ ./synced/[site-id]/
    ↓
4. Invoke Skills (auto-selected by Claude based on task)
   - security-analysis/SKILL.md → scan for vulnerabilities
   - performance-analysis/SKILL.md → check DB queries, caching
   - code-quality/SKILL.md → WPCS compliance, deprecated functions
   - architecture-review/SKILL.md → theme/plugin patterns
    ↓
5. Aggregate Findings
   Collect all findings, deduplicate, rank by severity
    ↓
6. Generate Report
   Write: memory/findings/[site-id]-[date].md
   Update: memory/history/[site-id]-timeline.json
    ↓
7. Display Summary
   Critical/High findings highlighted
   Link to full report
```

### Connection Flow

```
User: /wp-diagnostics:connect
    ↓
[COMMAND: connect.md]
    ↓
1. Gather Connection Details (interactive prompts)
   - Host
   - SSH user
   - SSH key path
   - Remote WordPress path
   - Site label (for reference)
    ↓
2. Generate Site ID (kebab-case from label)
    ↓
3. Test Connection
   Bash: ssh -i [key] [user]@[host] "wp core version"
    ↓
   Success? → Continue
   Failure? → Abort, display troubleshooting steps
    ↓
4. Save Profile
   Update data/sites.json with new site entry
    ↓
5. Initialize Memory Structure
   Create: memory/history/[site-id]-timeline.json
    ↓
6. Confirm
   Display: "Site '[label]' connected. Run /diagnose to analyze."
```

### Status Flow

```
User: /wp-diagnostics:status
    ↓
[COMMAND: status.md]
    ↓
1. Load All Site Profiles
   Read: data/sites.json
    ↓
2. Check Sync Status
   For each site: compare local synced/ mtime with last_synced timestamp
    ↓
3. Load Recent Findings
   For each site: read memory/history/[site-id]-timeline.json → last diagnostic summary
    ↓
4. Display Table
   | Site | Last Sync | Last Diagnostic | Critical | High | Medium | Low |
   |------|-----------|-----------------|----------|------|--------|-----|
   | ...  | ...       | ...             | ...      | ...  | ...    | ... |
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 sites | Current architecture sufficient - local file sync, memory/ storage, JSON config |
| 10-50 sites | Add site grouping/tagging in sites.json, consider SQLite for timeline data, implement incremental sync |
| 50-100+ sites | Move to database for site/findings storage (still CoWork plugin), add background sync jobs, implement finding deduplication/trend analysis |

### Scaling Priorities

1. **First bottleneck:** Large WordPress sites (>1GB) slow to sync
   - **Solution:** Implement selective sync (exclude uploads, use rsync --size-only), cache file hashes
2. **Second bottleneck:** Many sites = cluttered memory/ directory
   - **Solution:** Site grouping, archival of old findings, summary dashboards in status command

## Anti-Patterns

### Anti-Pattern 1: Storing SSH Keys in sites.json

**What people do:** Include SSH private key content in the connection profile JSON.

**Why it's wrong:** Keys would be version-controlled, logged in diagnostics, potentially committed to git.

**Do this instead:** Store only the PATH to the SSH key file (e.g., `~/.ssh/acme_prod_rsa`). User manages keys separately. Plugin never reads or displays key content.

### Anti-Pattern 2: Running Analysis on Remote Site

**What people do:** SSH into remote site and run analysis commands directly on production server.

**Why it's wrong:**
- Performance impact on production
- Requires installing analysis tools on target server
- Security risk (diagnostic tools as attack surface)
- No offline analysis capability

**Do this instead:** Sync files locally with rsync, analyze in plugin working directory. Remote site only needs SSH access - no additional tools installed.

### Anti-Pattern 3: Monolithic Diagnostic Skill

**What people do:** Create one giant skill containing all diagnostic patterns (security + performance + code quality).

**Why it's wrong:**
- Violates separation of concerns
- Makes skill selection less precise
- Harder to maintain and extend
- Claude may invoke unnecessarily (skill description too broad)

**Do this instead:** Separate skills by domain (security-analysis, performance-analysis, code-quality, architecture-review). Commands compose skills as needed. Claude auto-selects relevant skills based on task.

### Anti-Pattern 4: Embedding Credentials in Command Markdown

**What people do:** Hardcode SSH credentials or API keys in command markdown files.

**Why it's wrong:**
- Commands are version-controlled (credential leak)
- No multi-site support (hardcoded to one site)
- Security violation

**Do this instead:** Commands reference connection profiles by site ID. Profiles stored in data/sites.json (which references key paths). Actual credentials managed by user's SSH agent.

### Anti-Pattern 5: No Sync Tracking

**What people do:** Run rsync every time without checking if files have changed.

**Why it's wrong:**
- Wastes time on unnecessary transfers
- Misses detection of recent remote changes
- No audit trail of when site was last analyzed

**Do this instead:** Track `last_synced` timestamp in sites.json. Before analysis, optionally prompt "Files synced X hours ago. Re-sync? (y/n)". Update timestamp after successful sync.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| SSH (remote site) | Bash tool: `ssh -i [key] [user]@[host] "[command]"` | Standard OpenSSH client |
| Rsync (file sync) | Bash tool: `rsync -avz -e "ssh -i [key]" [remote]:[path]/ [local]/` | Requires rsync on both client and server |
| WP-CLI (remote) | Bash tool: `ssh [host] "wp [command]"` | Requires WP-CLI installed on remote site |
| (Future) MCP servers | .mcp.json configuration | v2+ for external tool integrations |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Commands ↔ Skills | Implicit (Claude selects skills based on task) | No direct invocation - skills auto-activate |
| Commands ↔ Data Layer | File read/write via Bash or Claude tools | JSON for sites.json, markdown for findings |
| Skills ↔ Synced Files | Read-only analysis | Skills analyze local files in synced/ directory |
| Commands ↔ Bash Tool | Markdown → Bash command execution | Commands include bash code blocks, Claude executes |

## Build Order Recommendations

Based on component dependencies, recommended build order:

1. **Phase 1: Foundation**
   - Create plugin structure (.claude-plugin/plugin.json, directories)
   - Implement data/sites.json schema
   - Create .gitignore (exclude synced/, sensitive data)

2. **Phase 2: Connection Management**
   - Build `/connect` command (SSH test, profile creation)
   - Build `/status` command (list sites, sync status)
   - Test with one real WordPress site

3. **Phase 3: File Synchronization**
   - Enhance `/connect` with rsync workflow
   - Implement sync tracking (last_synced timestamp)
   - Test with various site sizes, verify gitignore works

4. **Phase 4: Core Diagnostic Skills**
   - Create security-analysis skill (OWASP patterns, WordPress vulns)
   - Create performance-analysis skill (DB queries, caching)
   - Create code-quality skill (WPCS, deprecated functions)
   - Test each skill in isolation with known-bad WordPress code

5. **Phase 5: Diagnostic Workflow**
   - Build `/diagnose` command (orchestrate skills, generate report)
   - Implement memory/findings/ report generation
   - Implement memory/history/ timeline tracking
   - Test full workflow end-to-end

6. **Phase 6: Specialized Audits**
   - Build `/audit` command (security-focused subset)
   - Create architecture-review skill
   - Create wp-patterns skill (best practices reference)
   - Test with diverse WordPress codebases

7. **Phase 7: Polish**
   - Refine report formatting (severity highlighting, evidence links)
   - Add finding deduplication
   - Improve error handling and user feedback
   - Documentation (README, inline help)

## Architectural Decisions Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| CoWork plugin (not WP plugin) | Runs agent-side, nothing installed on target site | WP plugin - rejected (requires remote installation) |
| SSH + rsync (not FTP/SFTP) | Standard, secure, widely available | FTP - rejected (insecure), SFTP-only - rejected (less flexible) |
| Bash tool (not MCP server) | Simpler for v1, no custom server needed | Custom MCP server - deferred to v2+ |
| sites.json (not database) | Simple, version-controllable, sufficient for v1 | SQLite/database - deferred until >50 sites |
| memory/ for findings (not database) | CoWork memory pattern, searchable, readable | Database - deferred, markdown preferred for LLM context |
| Skills (not agents) | Auto-invoked, no manual selection needed | Agents - rejected (requires explicit invocation) |
| Separate skills per domain | Precise skill selection, modular maintenance | Monolithic skill - rejected (see anti-patterns) |

## Sources

### Claude CoWork Plugin Architecture
- [Claude Cowork Plugins Complete Guide](https://claudecowork.im/blog/claude-cowork-plugins-complete-guide) - Plugin components and structure
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference) - Official technical specifications, manifest schema, component types
- [Build WordPress Sites with AI: New Plugin and Skills for Claude Cowork](https://wordpress.com/blog/2026/02/13/new-plugin-and-skills-for-claude-cowork/) - WordPress plugin patterns for CoWork
- [Building My First Claude Code Plugin](https://alexop.dev/posts/building-my-first-claude-code-plugin/) - Plugin development practices

### Remote Diagnostics Architecture
- [Remote Diagnostic Agent Architecture](https://dataautomationtools.com/remote-diagnostic-agent/) - RDA components: local collection, processing pipeline, reporting
- [Remote Diagnostics Design](https://www.sysnetexplorer.com/en/remote-diagnostics-design/) - Security, data flow, and management patterns
- [AI-Ready WordPress Hosting 2026: SSH Comparison Guide](https://seresa.io/blog/ai-data-readiness/ai-ready-wordpress-hosting-in-2026-the-35-month-upgrade-that-saves-500-month-in-developer-time) - SSH access patterns for AI agents

### Software Architecture Principles
- [Separation of Concerns](https://www.swiftorial.com/tutorials/software_architecture/software_architecture/architectural_principles/separation_of_concerns/) - Component boundary principles
- [Designing the Infrastructure Persistence Layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) - Data storage separation patterns

---
*Architecture research for: Claude CoWork WordPress Diagnostics Plugin*
*Researched: 2026-02-16*
