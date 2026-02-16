# Technology Stack

**Project:** Claude CoWork WordPress Diagnostics Plugin
**Researched:** 2026-02-16
**Confidence:** HIGH

## Recommended Stack

### CoWork Plugin Format
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Markdown + JSON | N/A | Plugin definition format | CoWork plugins are file-based (no compiled code). Commands and skills are markdown files with embedded instructions for Claude. |
| `.claude-plugin/plugin.json` | N/A | Plugin manifest | Required for all CoWork plugins. Defines metadata, component paths, and integration points. |
| `.mcp.json` | N/A | MCP server configuration | Connects plugin to external tools (optional for this plugin as we use native SSH/rsync). |

### Remote Connection & File Sync
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SSH (OpenSSH) | System default | Remote WordPress site access | Universal, secure, already available on target servers. Native macOS/Linux tool. |
| rsync | 3.x+ | WordPress file synchronization | Fast, resumable, handles interruptions. Only syncs changed files. Standard for WordPress migrations. |
| SSH Config (~/.ssh/config) | N/A | Site connection profiles | Enables host aliases, simplifies repeated connections, supports ProxyJump for bastion hosts. |

### WordPress Diagnostics
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| WP-CLI | 2.x+ | WordPress management CLI | De facto standard for WordPress automation. Required to be pre-installed on remote server. |
| WP-CLI Doctor | Latest | Health/diagnostic checks | Official diagnostic package. Customizable via doctor.yml. Covers core, plugins, database, cron, constants. |
| WP-CLI Profile | Latest | Performance diagnostics | Identifies slow components by tracking load stages. |

### PHP Code Analysis (Remote Execution)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PHPStan | 2.x+ | Static analysis | Most popular PHP static analyzer (2026). WordPress-stubs available via szepeviktor/phpstan-wordpress. |
| PHP_CodeSniffer (PHPCS) | 3.13.0+ | Coding standards | WordPress Coding Standards (WPCS 3.0+) for detecting violations. |
| WPScan | Latest (CLI) | Security vulnerability scanning | Uses WordPress Vulnerability Database API. Identifies plugin/theme/core vulnerabilities. |

### JSON Processing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| jq | 1.7.1+ | JSON parsing & transformation | Universal command-line JSON processor. Pre-installed on most systems. Essential for parsing WP-CLI JSON output. |

### Patch Generation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| git diff | System git | Generate patch files | Standard format for code changes. Compatible with `git apply`, composer patches, WordPress core contribution workflow. |

### Data Storage (Local)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| JSON files | N/A | Site profiles (sites.json), scan results | Simple, human-editable, version-controllable. No database dependency. |
| Markdown files | N/A | Diagnostic reports | Human-readable output format. Works natively in Claude interface. |

## Supporting Libraries

None required. This is a zero-dependency plugin that orchestrates existing command-line tools via Claude's Bash tool.

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| CoWork (Claude Desktop/Code) | Plugin runtime environment | Required for testing plugin commands and skills |
| SSH key management | Authentication | Recommend ssh-agent for key management, passwordless auth |

## Installation

This plugin requires NO installation of package dependencies. It orchestrates system tools that should already exist on the developer's machine.

### Prerequisites (System Tools)

```bash
# Verify required tools are available
which ssh      # Should return /usr/bin/ssh or similar
which rsync    # Should return /usr/bin/rsync or similar
which jq       # Should return /usr/bin/jq or /opt/homebrew/bin/jq
which git      # Should return /usr/bin/git or similar

# WP-CLI must be installed on REMOTE servers, not locally
# Verify on remote server:
ssh user@remote-host 'wp --info'
```

### Optional PHP Analysis Tools (Remote Installation)

These should be installed on the remote WordPress server if static analysis is required:

```bash
# On remote server - PHPStan with WordPress support
composer require --dev phpstan/phpstan szepeviktor/phpstan-wordpress

# On remote server - PHP_CodeSniffer with WordPress Coding Standards
composer global config allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
composer global require --dev wp-coding-standards/wpcs:"^3.0"

# On remote server - WPScan
gem install wpscan  # or download CLI from wpscan.com
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Plugin format | Markdown + JSON (CoWork) | MCP Server (TypeScript/Python) | CoWork plugins are simpler, no compilation, no server process. Perfect for orchestrating shell commands. |
| File sync | rsync | SFTP, scp, FTP | rsync is faster (delta sync), resumable, handles large WordPress sites efficiently. |
| WordPress CLI | WP-CLI | Direct database/SSH commands | WP-CLI is abstracted, safer, version-aware, uses WordPress APIs correctly. |
| Static analysis | PHPStan | Psalm, Phan | PHPStan has strongest WordPress ecosystem support (wordpress-stubs, extensive plugins). |
| Coding standards | WPCS (WordPress Coding Standards) | Generic PSR checks | WPCS is WordPress-specific, catches WordPress anti-patterns. |
| Security scanning | WPScan CLI | Manual checks, web scanners | WPScan has authoritative WordPress Vulnerability Database (333 vulns/week in 2026). |
| JSON processing | jq | python -m json.tool, Node.js scripts | jq is ubiquitous, zero dependencies, optimized for command-line JSON workflows. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Compiled executables in plugin | CoWork plugins are markdown/JSON only | Shell commands orchestrated via Bash tool |
| npm/pip dependencies | No package.json/requirements.txt in CoWork format | Native system tools (ssh, rsync, jq) |
| Direct database queries over SSH | Dangerous, version-dependent, bypasses WordPress APIs | WP-CLI commands (wp db query, wp post list, etc.) |
| FTP/unencrypted protocols | Insecure, credentials exposed | SSH with key-based auth |
| WordPress REST API for diagnostics | Limited diagnostic data, requires WordPress to be functional | WP-CLI (works even if WordPress is broken) |
| Copying entire WordPress site | Slow, unnecessary for diagnostics | rsync with --exclude patterns (skip uploads, cache, logs) |
| Hardcoded SSH credentials | Security risk | SSH config + SSH keys in ~/.ssh/ |
| wp-config.php parsing from markdown | Complex, error-prone | WP-CLI (reads wp-config.php correctly) |

## Stack Patterns by Use Case

### Pattern 1: Saved Site Profile

**When:** User manages multiple WordPress sites regularly
**Stack:**
- Site profiles stored in `sites.json` (local plugin directory)
- SSH config entries in `~/.ssh/config` for each site
- Commands reference sites by alias (e.g., `/wp:scan production-site`)

**Example sites.json:**
```json
{
  "production-site": {
    "ssh_host": "prod",
    "wp_path": "/var/www/html",
    "description": "Production WordPress site"
  }
}
```

**Example ~/.ssh/config:**
```
Host prod
  HostName 192.168.1.100
  User wordpress
  IdentityFile ~/.ssh/id_rsa_prod
  Port 22
```

### Pattern 2: One-Off Connection

**When:** User needs to diagnose an unfamiliar site once
**Stack:**
- No sites.json entry required
- Commands accept inline SSH parameters
- rsync uses explicit user@host:path syntax

**Example command:**
```
/wp:scan-quick user@example.com:/var/www/html
```

### Pattern 3: Behind Bastion Host

**When:** WordPress server not directly accessible (common in enterprise)
**Stack:**
- SSH config with ProxyJump directive
- rsync uses SSH as transport with config-based routing

**Example ~/.ssh/config:**
```
Host bastion
  HostName bastion.example.com
  User admin

Host internal-wp
  HostName 10.0.1.50
  User wordpress
  ProxyJump bastion
```

### Pattern 4: Static Analysis

**When:** Checking code quality before deployment
**Stack:**
- rsync WordPress files to local temp directory
- Run PHPStan/PHPCS locally (faster than remote)
- Generate patch file with fixes

**Flow:**
1. rsync remote → local temp dir
2. Local PHPStan scan → JSON output → jq filter → markdown report
3. Local PHPCS with --fix → generate patch
4. Offer patch for user review/application

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| WP-CLI 2.x | WordPress 5.0+ | WordPress 6.x fully supported in 2026 |
| WPCS 3.0+ | PHP_CodeSniffer 3.13.0+ | WPCS 3.0 requires PHPCS 3.13.0 minimum |
| PHPStan 2.x | PHP 7.2+ | For WordPress, recommend PHP 8.1+ hosts |
| rsync 3.x | OpenSSH 7.0+ | macOS includes rsync, Linux uses rsync3 |
| WP-CLI Doctor | WP-CLI 2.0+ | Installable via `wp package install wp-cli/doctor-command` |

## Confidence Assessment

| Component | Confidence | Source |
|-----------|------------|--------|
| CoWork plugin format | HIGH | Official Anthropic documentation, GitHub examples |
| WP-CLI commands | HIGH | Official WordPress developer.wordpress.org CLI docs |
| WP-CLI Doctor | HIGH | Official wp-cli/doctor-command GitHub repository |
| PHPStan for WordPress | HIGH | Multiple 2026 sources, official wordpress-stubs package |
| WPCS | HIGH | Official WordPress/WordPress-Coding-Standards repository |
| WPScan | HIGH | Official wpscan.com, active WordPress Vulnerability Database |
| rsync patterns | HIGH | Multiple WordPress migration guides, GridPane/WPShout tutorials |
| SSH config | HIGH | Official OpenSSH documentation, engineering blogs (Salesforce) |
| jq | HIGH | Official jqlang.org, version 1.8 current in 2026 |

## Sources

### CoWork Plugin Format
- [Anthropic CoWork Plugins Documentation](https://claude.com/blog/cowork-plugins) - MEDIUM confidence (official but high-level)
- [Anthropic knowledge-work-plugins GitHub](https://github.com/anthropics/knowledge-work-plugins) - HIGH confidence (official examples)
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference) - HIGH confidence (official documentation)

### WordPress CLI & Diagnostics
- [WP-CLI Commands Documentation](https://developer.wordpress.org/cli/commands/) - HIGH confidence (official WordPress)
- [WP-CLI Doctor Command GitHub](https://github.com/wp-cli/doctor-command) - HIGH confidence (official package)
- [WP Doctor Diagnostic Guide](https://servebolt.com/help/technical-resources/how-to-diagnose-your-wordpress-site-using-wp-profile-and-wp-doctor/) - MEDIUM confidence (third-party tutorial)
- [WP-CLI 2026 Commands Guide](https://www.techedubyte.com/wp-cli-commands-wordpress-updates-2026/) - LOW confidence (community blog, unverified for 2026)

### PHP Static Analysis
- [PHPStan vs Psalm Comparison](https://phpunit.expert/articles/psalm-or-phpstan.html) - MEDIUM confidence (expert analysis)
- [WordPress Stubs for PHPStan](https://github.com/php-stubs/wordpress-stubs) - HIGH confidence (official stubs repository)
- [WordPress Coding Standards GitHub](https://github.com/WordPress/WordPress-Coding-Standards) - HIGH confidence (official WPCS)
- [WPCS Installation Guide](https://make.wordpress.org/core/handbook/testing/automated-testing/phpcs/) - HIGH confidence (official WordPress handbook)

### Security Scanning
- [WPScan Official Site](https://wpscan.com/) - HIGH confidence (official scanner)
- [WPScan WordPress Security Scanner GitHub](https://github.com/wpscanteam/wpscan) - HIGH confidence (official repository)
- [WordPress Vulnerability Database - Patchstack](https://patchstack.com/database) - HIGH confidence (authoritative database)

### File Synchronization
- [rsync WordPress Migration Guide - GridPane](https://gridpane.com/kb/how-to-migrate-a-wordpress-website-with-wp-cli-and-rsync/) - MEDIUM confidence (hosting provider guide)
- [Favorite rsync Commands for WordPress](https://guides.wp-bullet.com/favorite-rsync-commands-for-copying-wordpress-sites/) - MEDIUM confidence (community guide)
- [rsync Command Guide 2026](https://www.youstable.com/blog/rsync-command-in-linux/) - LOW confidence (generic rsync guide)

### SSH Management
- [SSH Config File Guide - Linuxize](https://linuxize.com/post/using-the-ssh-config-file/) - MEDIUM confidence (technical tutorial)
- [Managing Multiple SSH Environments - Salesforce Engineering](https://engineering.salesforce.com/managing-multiple-ssh-environments-a5aae1908a18/) - HIGH confidence (enterprise engineering blog)
- [SSH Config Complete Guide 2026](https://devtoolbox.dedyn.io/blog/ssh-config-complete-guide) - LOW confidence (community blog)

### JSON Processing
- [jq Official Documentation](https://jqlang.org/) - HIGH confidence (official docs)
- [jq GitHub Repository](https://github.com/jqlang/jq) - HIGH confidence (official repository)
- [jq Complete Guide 2026](https://devtoolbox.dedyn.io/blog/jq-complete-guide) - MEDIUM confidence (technical guide)

### Patch Generation
- [WordPress Patch Submission Guide](https://make.wordpress.org/core/handbook/tutorials/working-with-patches/) - HIGH confidence (official WordPress)
- [Git Patch Application Guide 2026](https://thelinuxcode.com/applying-git-patches-in-2026-a-practical-hands-on-guide/) - MEDIUM confidence (technical tutorial)

---
*Stack research for: Claude CoWork WordPress Diagnostics Plugin*
*Researched: 2026-02-16*
