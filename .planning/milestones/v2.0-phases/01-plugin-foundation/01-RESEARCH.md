# Phase 1: Plugin Foundation - Research

**Researched:** 2026-02-16
**Domain:** CoWork Plugin Structure, Credential Management, File Organization
**Confidence:** HIGH

## Summary

Phase 1 establishes the secure foundation for a WordPress diagnostics plugin following Anthropic's CoWork plugin format. The research confirms that CoWork plugins use a simple file-based structure with `.claude-plugin/plugin.json` manifest, `skills/` directory for auto-triggered domain knowledge, and `commands/` for explicit user invocations. No custom MCP server or code infrastructure is needed—plugins are purely markdown and JSON.

The credential safety model is straightforward: sensitive files like `sites.json` and synced WordPress files must be gitignored. SSH credential handling follows industry standard patterns supporting both SSH config aliases (recommended) and direct key paths. The `.gitignore` file should cover all local state, synced files, credentials, and platform artifacts.

Research into the existing CLAUDE.md reveals it contains six diagnostic domains (security audit, code quality, performance analysis, plugin conflicts, architecture review, accessibility/compliance) plus testing framework knowledge and communication style patterns. All of this content should be extracted into skill files, not duplicated in the new CLAUDE.md.

**Primary recommendation:** Follow Anthropic's official plugin structure exactly. Use CLAUDE.md as hot cache for active state only, move all diagnostic knowledge to skills/, create sites.json.example as safe template, and ensure .gitignore prevents any credential exposure.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Plugin Identity
- Plugin name: `wordpress-expert`
- Command prefix: `wpe` (commands will be /wpe:connect, /wpe:diagnose, /wpe:audit, /wpe:status)
- Author: Robert Li
- Description: Claude's discretion — write a concise marketplace description

#### Directory Layout
- Skills organized by diagnostic domain: skills/security-analysis/, skills/code-quality/, skills/performance/, skills/wp-patterns/
- Synced site files live in `.sites/{site-name}/` (hidden directory, gitignored)
- Findings history structured by site then date: `memory/sites/{name}/2026-02-16-audit.md`
- Ship a `sites.json.example` with placeholder values showing the connection format

#### Credential Safety
- sites.json is ALWAYS gitignored — never committed regardless of content
- Support both SSH config aliases AND direct key path in sites.json — user chooses per site
- .gitignore covers: sites.json, .sites/, memory/, *.log, .DS_Store (standard list)

#### CLAUDE.md Content
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CoWork Plugin Format | 1.x | Plugin structure | Official Anthropic standard for Claude plugins |
| Markdown | Standard | Skill and command content | CoWork plugins are file-based markdown/JSON |
| JSON | Standard | Configuration files | plugin.json, .mcp.json, sites.json |
| Git | 2.x+ | Version control | Standard for plugin distribution |
| SSH | OpenSSH 7.0+ | Remote file access | Universal, secure, available on all hosts |
| rsync | 3.x+ | File synchronization | Industry standard for efficient file sync |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| WP-CLI | Latest stable | WordPress operations | Database queries, option management |
| jq | 1.6+ | JSON parsing in hooks | If adding post-tool-use hooks |
| .gitignore templates | Current | Baseline ignore rules | GitHub's WordPress.gitignore as starting point |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CoWork plugin | WordPress plugin | Wrong layer—CoWork runs agent-side, not on target WP site |
| SSH + rsync | FTP/SFTP | Less secure, less efficient, no standard config patterns |
| Markdown skills | Python MCP server | Unnecessary complexity—skills don't need code |
| SSH config aliases | Hardcoded credentials | Less secure, not portable, credentials in version control |

**Installation:**
```bash
# Plugin installation (user-side)
# Add plugin to CoWork marketplace or install via --plugin-dir

# Dependencies (user must have installed)
ssh -V  # Verify SSH client available
rsync --version  # Verify rsync available
```

---

## Architecture Patterns

### Recommended Project Structure

```
wordpress-expert/
├── .claude-plugin/
│   └── plugin.json                  # Plugin manifest
├── .mcp.json                        # Empty or minimal for v1
├── .gitignore                       # Credential and local state protection
├── CLAUDE.md                        # Identity + hot cache (reworked)
├── README.md                        # User-facing documentation
├── commands/                        # Explicit user invocations
│   ├── connect/                     # /wpe:connect command
│   ├── diagnose/                    # /wpe:diagnose command
│   ├── audit/                       # /wpe:audit command
│   └── status/                      # /wpe:status command
├── skills/                          # Auto-triggered domain knowledge
│   ├── security-analysis/           # Domain 1 from CLAUDE.md
│   │   └── SKILL.md
│   ├── code-quality/                # Domain 2 from CLAUDE.md
│   │   └── SKILL.md
│   ├── performance/                 # Domain 3 from CLAUDE.md
│   │   └── SKILL.md
│   ├── plugin-conflicts/            # Domain 4 from CLAUDE.md
│   │   └── SKILL.md
│   ├── wp-patterns/                 # Domain 5 from CLAUDE.md (architecture)
│   │   └── SKILL.md
│   ├── accessibility/               # Domain 6 from CLAUDE.md
│   │   └── SKILL.md
│   ├── testing/                     # Testing framework knowledge
│   │   └── SKILL.md
│   └── reporting/                   # Communication style patterns
│       └── SKILL.md
├── sites.json.example               # Safe template (never credentials)
├── .sites/                          # Gitignored—synced WordPress files
│   └── {site-name}/                 # One directory per site
└── memory/                          # Gitignored—diagnostic history
    └── sites/
        └── {name}/
            └── 2026-02-16-audit.md
```

### Pattern 1: Skill Directory Organization

**What:** Each diagnostic domain gets a skill folder with SKILL.md containing frontmatter and instructions.

**When to use:** Always for domain knowledge that Claude should auto-select based on context.

**Example:**
```markdown
---
name: security-analysis
description: Evaluates WordPress codebase against OWASP Top 10 and WP-specific vulnerability patterns. Use when reviewing code security, auditing plugins/themes, or investigating security incidents.
---

## Security Audit Protocol

When conducting security analysis, systematically evaluate:

1. **Input Validation & Sanitization**
   - All user inputs pass through WordPress sanitization functions
   - `$_GET`, `$_POST`, `$_REQUEST` never used directly
   - Database inputs use `$wpdb->prepare()` for all queries

[... rest of Domain 1 from CLAUDE.md ...]
```

**Source:** Anthropic official plugin structure documentation

### Pattern 2: Credential Isolation with sites.json

**What:** Configuration file storing SSH connection details, always gitignored, with .example template for users.

**When to use:** For all remote WordPress site connections.

**Example:**
```json
{
  "sites": [
    {
      "name": "production-site",
      "ssh_host": "mysite-prod",
      "ssh_user": "wpuser",
      "ssh_key": "~/.ssh/mysite-prod",
      "wp_path": "/var/www/html",
      "wp_url": "https://example.com"
    },
    {
      "name": "staging-site",
      "ssh_host": "staging.example.com",
      "ssh_user": "deployer",
      "ssh_key": null,
      "wp_path": "/home/deployer/public_html",
      "wp_url": "https://staging.example.com"
    }
  ]
}
```

**Notes:**
- `ssh_key: null` means use SSH config default or agent
- `ssh_host` can be alias from ~/.ssh/config or direct hostname
- File is NEVER committed, only sites.json.example with placeholder values

**Sources:** JSON configuration best practices, SSH config patterns

### Pattern 3: .gitignore for Credential Safety

**What:** Comprehensive ignore rules preventing credential exposure, local state commit.

**When to use:** Always, as first file created in phase.

**Example:**
```gitignore
# Credentials and connection config
sites.json

# Synced WordPress files (can contain credentials, API keys)
.sites/

# Diagnostic history and findings (may contain sensitive data)
memory/

# Logs (can contain credentials, stack traces)
*.log
logs/

# Platform artifacts
.DS_Store
Thumbs.db
desktop.ini

# Editor artifacts
.vscode/
.idea/
*.swp
*.swo
*~
```

**Critical rule:** `sites.json` is ALWAYS first item, never conditional.

**Sources:** GitHub WordPress.gitignore template, security best practices

### Pattern 4: CLAUDE.md as Hot Cache

**What:** Lean CLAUDE.md containing plugin identity/role at top, active state cache below, NOT diagnostic domain knowledge.

**When to use:** For information Claude needs about current session state.

**Structure:**
```markdown
# WordPress Expert Plugin

You are the WordPress Diagnostics Expert plugin for Claude CoWork.

## Role
[Brief identity—2-3 paragraphs from current CLAUDE.md intro]

## Process
[GSD-style discovery protocol—condensed from current CLAUDE.md]

---

## Active State Cache

### Currently Connected Site
[Populated by /wpe:connect]

### Active Diagnostic Session
[Populated by /wpe:diagnose or /wpe:audit]

### Recent Findings
[Populated as diagnostics run]
```

**What moves OUT of CLAUDE.md:** All 6 diagnostic domains, testing framework, communication style—these become skills.

**Sources:** User constraint decisions, Anthropic productivity plugin pattern

### Pattern 5: Skill Frontmatter Format

**What:** YAML frontmatter in SKILL.md defining when Claude should use this skill.

**When to use:** Every skill file.

**Example:**
```markdown
---
name: code-quality
description: Reviews WordPress code against WPCS standards and best practices. Use when analyzing custom themes/plugins, checking coding standards, or reviewing architecture patterns.
---

[Skill instructions here]
```

**Fields:**
- `name`: Skill identifier (lowercase, hyphens)
- `description`: When to use this skill (critical—tells Claude when to auto-invoke)

**Sources:** Anthropic SKILL.md format specification

### Anti-Patterns to Avoid

- **Credentials in version control:** NEVER commit sites.json, even with dummy data—use sites.json.example instead
- **Skills inside .claude-plugin/:** Only plugin.json goes in .claude-plugin/, not skills/ or commands/
- **Code in .mcp.json:** MCP config points to external servers, doesn't define them—for v1, leave empty or minimal
- **Duplicate knowledge:** Don't copy diagnostic domains into both CLAUDE.md AND skills/—choose one location (skills/ for this plugin)
- **Absolute paths in .gitignore:** Use relative paths from repo root, not absolute filesystem paths
- **Global .gitignore reliance:** Don't assume user has global gitignore—define all rules in plugin's .gitignore

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Plugin structure | Custom directory layout | CoWork official format | Anthropic spec ensures compatibility, marketplace support |
| SSH credential management | Custom encryption, config format | Standard ~/.ssh/config + JSON pointer | Leverages existing SSH infrastructure, user expertise |
| .gitignore rules | Minimal/custom ignore file | GitHub WordPress.gitignore + additions | Community-tested, comprehensive, maintained |
| File sync | Custom FTP, manual copying | rsync with standard flags | Efficient, incremental, battle-tested, supports dry-run |
| Skill format | Plain markdown, custom frontmatter | SKILL.md with name/description YAML | Required for Claude auto-selection |

**Key insight:** CoWork plugins are a *framework*—diverging from the standard structure breaks compatibility. The hard problems (skill auto-selection, plugin isolation, namespace management) are already solved by the framework. Custom approaches mean losing these benefits.

---

## Common Pitfalls

### Pitfall 1: Committing Credentials Despite .gitignore

**What goes wrong:** sites.json gets committed because .gitignore is added after first commit, or user adds sites.json before .gitignore exists.

**Why it happens:** Git only ignores untracked files—already-tracked files remain even after adding to .gitignore.

**How to avoid:**
1. Create .gitignore as FIRST file in repository
2. Include sites.json BEFORE creating sites.json
3. Verify with `git status` before first commit
4. Never commit sites.json even temporarily

**Warning signs:**
- `git status` shows sites.json as staged
- Repository history contains sites.json even if currently ignored
- `git log --all -- sites.json` returns results

### Pitfall 2: Skills in Wrong Location

**What goes wrong:** Putting skills/ inside .claude-plugin/ directory breaks plugin loading.

**Why it happens:** Misunderstanding plugin structure—.claude-plugin/ seems like "plugin config directory."

**How to avoid:**
- **Only plugin.json goes in .claude-plugin/**
- All other directories (skills/, commands/, hooks/) go at plugin root
- Follow official structure exactly, don't reorganize

**Warning signs:**
- Skills don't appear when plugin loads
- `/help` doesn't show plugin skills
- No errors but skills aren't auto-invoked

### Pitfall 3: Absolute Paths in SSH Config

**What goes wrong:** sites.json contains absolute paths like `/Users/bob/.ssh/key` that break on other machines.

**Why it happens:** Copying actual SSH key paths during development.

**How to avoid:**
- Use `~/.ssh/key` for home-relative paths
- Support `null` for "use SSH config default"
- Document that paths are relative to user's home directory
- sites.json.example should show both patterns

**Warning signs:**
- Plugin works on dev machine but fails for other users
- SSH errors about missing keys on different OS
- Different home directory structure breaks paths

### Pitfall 4: Synced Files Contain Credentials

**What goes wrong:** wp-config.php synced from remote site contains database credentials, gets committed.

**Why it happens:** Syncing entire WordPress directory without exclusions.

**How to avoid:**
- `.sites/` is gitignored entirely
- Document safe rsync exclusion patterns
- Never sync wp-config.php or other credential files
- Implement dry-run as default operation mode

**Warning signs:**
- .sites/ directory shows in `git status`
- Database credentials visible in repository
- wp-config.php in git history

### Pitfall 5: CLAUDE.md Knowledge Duplication

**What goes wrong:** Copying entire diagnostic domains into both CLAUDE.md and skills/, causing maintenance burden and version drift.

**Why it happens:** Unclear split between "what goes in CLAUDE.md" vs "what goes in skills."

**How to avoid:**
- CLAUDE.md: Identity, process, active state ONLY
- Skills: ALL diagnostic domain knowledge
- Clear rule: if it's "how to do X," it's a skill
- If it's "who I am" or "what I'm currently working on," it's CLAUDE.md

**Warning signs:**
- Same content appears in multiple files
- Updates to skills don't reflect in CLAUDE.md
- CLAUDE.md is very long (>200 lines suggests duplication)

### Pitfall 6: Forgetting sites.json.example

**What goes wrong:** Users don't know what format sites.json should have, create invalid structure.

**Why it happens:** Only creating .gitignore without providing template.

**How to avoid:**
- Ship sites.json.example with placeholder values
- Document EVERY field with inline comments (JSON doesn't support comments, so use README)
- Show both SSH config alias pattern AND direct key path pattern
- Include validation instructions

**Warning signs:**
- Users ask "what fields does sites.json need?"
- SSH connection errors from malformed config
- No example to copy from

---

## Code Examples

Verified patterns from official sources:

### plugin.json Manifest

```json
{
  "name": "wordpress-expert",
  "version": "1.0.0",
  "description": "Expert WordPress diagnostics: security audits, performance analysis, code quality review, and plugin conflict resolution for site reliability.",
  "author": {
    "name": "Robert Li"
  }
}
```

**Source:** Anthropic knowledge-work-plugins repository (productivity plugin)

### Minimal .mcp.json (v1)

```json
{}
```

**Reasoning:** Phase 1 doesn't implement MCP server connections. Empty object is valid, can be populated in later phases.

**Source:** Anthropic plugin documentation states .mcp.json is optional

### sites.json.example Template

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "sites": [
    {
      "name": "example-production",
      "ssh_host": "prod-alias",
      "ssh_user": "wpuser",
      "ssh_key": "~/.ssh/prod-key",
      "wp_path": "/var/www/html",
      "wp_url": "https://example.com",
      "description": "Production site - uses SSH config alias"
    },
    {
      "name": "example-staging",
      "ssh_host": "staging.example.com",
      "ssh_user": "deployer",
      "ssh_key": null,
      "wp_path": "/home/deployer/public_html",
      "wp_url": "https://staging.example.com",
      "description": "Staging site - direct hostname, default SSH key"
    }
  ]
}
```

**Field definitions:**
- `name`: Internal identifier for this site (used in memory/ paths)
- `ssh_host`: SSH config alias OR direct hostname
- `ssh_user`: Username for SSH connection
- `ssh_key`: Path to private key (~ expands to home) OR null for SSH agent/config default
- `wp_path`: Absolute path to WordPress installation on remote
- `wp_url`: Full URL of the site (for reference)
- `description`: Optional human-readable note

**Source:** JSON configuration patterns for SSH connections

### Safe rsync Pattern with Dry-Run

```bash
# Dry-run to preview what would be synced
rsync -avz --dry-run \
  --exclude='wp-config.php' \
  --exclude='*.log' \
  --exclude='.git' \
  --exclude='node_modules' \
  user@host:/var/www/html/ .sites/sitename/

# Actual sync (only after reviewing dry-run output)
rsync -avz \
  --exclude='wp-config.php' \
  --exclude='*.log' \
  --exclude='.git' \
  --exclude='node_modules' \
  user@host:/var/www/html/ .sites/sitename/
```

**Flags:**
- `-a`: Archive mode (recursive, preserve permissions/timestamps)
- `-v`: Verbose output
- `-z`: Compress during transfer
- `--dry-run`: Simulate only, don't modify files
- `--exclude`: Skip matching files/directories

**Critical exclusions for WordPress:**
- `wp-config.php`: Contains database credentials
- `*.log`: May contain sensitive error details
- `.git`: Not part of WordPress, don't sync version control
- `node_modules`: Build artifacts, very large

**Source:** rsync best practices, WordPress sync patterns

### Comprehensive .gitignore

```gitignore
# === Credentials and Connection Config ===
sites.json

# === Synced WordPress Files ===
# These can contain credentials, API keys, sensitive data
.sites/

# === Diagnostic History and Findings ===
# May contain sensitive site information
memory/

# === Logs ===
*.log
logs/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# === Platform Artifacts ===
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
desktop.ini

# === Editor / IDE ===
.vscode/
.idea/
*.swp
*.swo
*.swn
*~
.project
.classpath
.settings/

# === Node (if adding any tooling) ===
node_modules/
package-lock.json
yarn.lock

# === Temporary Files ===
*.tmp
*.temp
.cache/
```

**Sources:** GitHub WordPress.gitignore template, security best practices

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WordPress plugins on target site | CoWork plugins agent-side | Jan 2026 | No installation on target WP, safer |
| Custom plugin formats | CoWork standard structure | Jan 2026 | Marketplace compatibility, auto-loading |
| Code-heavy MCP servers | Markdown/JSON skills | Jan 2026 | Faster development, no infrastructure |
| Monolithic CLAUDE.md | Skills for domains, CLAUDE.md for state | Current best practice | Better auto-selection, maintenance |
| Hardcoded credentials | SSH config + JSON pointers | Long-standing | Security, portability, user control |

**Deprecated/outdated:**
- Custom plugin directory structures: CoWork spec is now standard
- Putting skills in .claude-plugin/: Confirmed anti-pattern in official docs
- .mcp.json as required: Optional for v1, can be empty object

---

## Open Questions

1. **SKILL.md frontmatter additional fields**
   - What we know: `name` and `description` are required
   - What's unclear: Are there optional fields like `disable-model-invocation`, `priority`, or `tags`?
   - Recommendation: Use minimal frontmatter (name + description only) for v1, expand if needed

2. **SSH key passphrase handling**
   - What we know: SSH keys should be passphrase-protected per best practices
   - What's unclear: How should plugin handle passphrase prompts? SSH agent? Manual entry?
   - Recommendation: Document expectation that users run ssh-agent, keys are pre-loaded. Plugin doesn't handle passphrases.

3. **CLAUDE.md hot cache format**
   - What we know: CLAUDE.md should have identity + active state
   - What's unclear: Exact markdown structure for "currently connected site" state
   - Recommendation: Use simple markdown sections that commands can find/replace. Example: `## Currently Connected Site` with site name below.

4. **sites.json validation**
   - What we know: JSON format with required fields
   - What's unclear: Should plugin validate on load? Fail fast or degrade gracefully?
   - Recommendation: Validate on /wpe:connect command, show clear error if malformed. Don't validate on plugin load.

---

## Sources

### Primary (HIGH confidence)

- **Anthropic Plugin Documentation**: https://code.claude.com/docs/en/plugins - Complete CoWork plugin structure specification, directory layout, SKILL.md format
- **Anthropic knowledge-work-plugins GitHub Repository**: https://github.com/anthropics/knowledge-work-plugins - Official plugin examples, productivity plugin structure
- **Productivity Plugin plugin.json**: https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/productivity/.claude-plugin/plugin.json - Real manifest example
- **Task Management SKILL.md**: https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/productivity/skills/task-management/SKILL.md - Real skill example

### Secondary (MEDIUM confidence)

- **GitHub WordPress.gitignore Template**: https://github.com/github/gitignore/blob/main/WordPress.gitignore - Community-maintained standard
- **SSH Config Complete Guide 2026**: https://devtoolbox.dedyn.io/blog/ssh-config-complete-guide - SSH configuration best practices
- **SSH Key Management Best Practices (Graphite)**: https://graphite.com/guides/ssh-key-management-best-practices - Key rotation, storage, access control
- **rsync Exclude Files Guide (PhoenixNAP)**: https://phoenixnap.com/kb/rsync-exclude-files-and-directories - Exclusion patterns, dry-run usage
- **JSON Schema Best Practices (JSON Utils)**: https://jsonutils.org/blog/json-schema-complete-tutorial.html - Schema structure, validation
- **JSON SSH Config Examples (GitHub)**: https://github.com/ivuk/json-to-ssh_config - JSON SSH connection format patterns

### Tertiary (LOW confidence - general context only)

- **WordPress .gitignore Best Practices (GoranStimac)**: https://www.goranstimac.com/blog/git-ignore-for-wordpress-projects/ - General WordPress project ignore patterns
- **.gitignore Best Practices (Codecademy)**: https://www.codecademy.com/article/how-to-use-gitignore - General gitignore usage

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - Anthropic official docs, verified examples
- Architecture: **HIGH** - Official plugin repository, documented structure
- Pitfalls: **MEDIUM** - Based on general best practices + plugin docs, not WP-specific plugin pitfalls yet

**Research date:** 2026-02-16
**Valid until:** 30 days (stable plugin format, unlikely to change rapidly)

**Notes:**
- CoWork plugin format is new (Jan 2026) but well-documented
- SSH/rsync patterns are mature, stable technologies
- Credential safety patterns are industry-standard, not plugin-specific
- Primary gap is real-world WordPress plugin experience—will validate during implementation
