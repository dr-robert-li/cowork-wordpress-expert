# WordPress Expert

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![Skills](https://img.shields.io/badge/skills-21-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)
![Claude CoWork](https://img.shields.io/badge/Claude-CoWork%20Plugin-blueviolet)

A comprehensive WordPress diagnostics plugin that connects via SSH, local directory, Docker container, or git repository. Runs structured investigations with intake questioning, site reconnaissance, parallel execution, trend tracking, and findings verification across 21 diagnostic skills.

Works as a [Claude CoWork](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/cowork-plugins) plugin (Claude Desktop) or a Claude Code CLI addon. Nothing is installed on the WordPress site.

## Requirements

- [Claude Desktop](https://claude.ai/download) with CoWork support **or** [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code) CLI
- Access to the target WordPress site (SSH, local path, Docker, or git)
- `jq` installed locally
- `rsync` installed locally (for SSH connections)
- Optional: [WP-CLI](https://wp-cli.org/) on the remote server (enables core integrity checks, user audits, cron analysis, and profiling)

## Installation

### Option A: Claude Desktop (CoWork Plugin)

1. Download or clone this repository
2. Zip the folder:
   ```bash
   zip -r wordpress-expert.zip wordpress-expert/ -x "*.git*" "*.planning*" ".sites/*" "memory/*" "sites.json"
   ```
3. Open **Claude Desktop**
4. Go to the **CoWork** tab in the sidebar
5. Click **Add Plugin** (or the + button)
6. Select **Upload Plugin** and choose the `wordpress-expert.zip` file
7. The plugin will appear in your CoWork tab ready to use

### Option B: Claude Code (CLI Addon)

```bash
npx wpxpert
```

This installs commands and skills to `~/.claude/` so they're available in all Claude Code sessions. Commands are namespaced as `/wpxpert:connect`, `/wpxpert:diagnose`, `/wpxpert:investigate`, `/wpxpert:batch`, `/wpxpert:status`.

To uninstall:

```bash
npx wpxpert --uninstall
```

## Commands

### `/connect`

Connect to a WordPress site via SSH, local directory, Docker container, or git repository. Detects WordPress installation, discovers WP-CLI, syncs files locally, and saves the connection profile.

```
/connect
/connect mysite.com
/connect /var/www/wordpress
/connect docker:my-wp-container
```

### `/investigate`

Run a thorough diagnostic investigation with structured workflow:

1. **Intake** -- gathers context about your concern
2. **Scout** -- SSH reconnaissance for environment clues
3. **Plan** -- chooses which skills to run based on concern + scout data
4. **Execute** -- runs skills in parallel waves
5. **Review** -- verifies findings address your concern
6. **Report** -- generates report with confidence rating

```
/investigate
/investigate my site got hacked
/investigate security on mysite
/investigate slow performance on production
```

Each step is configurable via `config.json`. Use `/investigate` for thorough analysis and `/diagnose` for quick scans.

### `/diagnose`

Run diagnostic scans across all skills. Supports four modes:

- **full** (default) -- all diagnostic skills
- **security-only** -- core integrity, config security, user audit
- **code-only** -- code quality, malware scan
- **performance** -- N+1 queries, cron analysis, WP-CLI profiling, autoload bloat

```
/diagnose
/diagnose security only
/diagnose code only on mysite
/diagnose performance
```

Features inline progress feedback, skip-and-continue error recovery, A-F health grading, trend badges, and suggested next actions.

### `/batch`

Run diagnostics across multiple saved site profiles with a comparison matrix.

```
/batch
/batch security only
```

Runs each site sequentially with per-site status lines, then produces a side-by-side comparison matrix of findings across all sites.

### `/status`

View connected sites, health summaries, and suggested next actions.

```
/status
/status remove mysite
/status default mysite
/status rename oldname newname
```

## Skills

### Security

| Skill | What it checks | Requires WP-CLI |
|-------|---------------|-----------------|
| Core Integrity | WordPress core file checksums against known-good values | Yes |
| Config Security | wp-config.php for debug mode, salts, file editing, DB prefix | No |
| User Audit | Admin usernames, role distribution, inactive accounts | Yes |
| Version Audit | WordPress, plugin, and theme update status | Yes |
| Malware Scan | Pattern-based detection of backdoors, obfuscation, shells | No |
| HTTPS Audit | SSL configuration, FORCE_SSL_ADMIN, mixed content indicators | No |
| File Permissions | File and directory permissions against WP security recommendations | No |

### Code Quality

| Skill | What it checks | Requires WP-CLI |
|-------|---------------|-----------------|
| Code Quality | AI-powered analysis of active theme and custom plugins | No |

### Database Health

| Skill | What it checks | Requires WP-CLI |
|-------|---------------|-----------------|
| Autoload Analysis | Autoloaded option bloat detection and plugin attribution | Yes |
| Transient Health | Expired transient buildup and cleanup recommendations | Yes |
| Revision Analysis | Post revision volume by type with storage impact estimates | Yes |

### Performance

| Skill | What it checks | Requires WP-CLI |
|-------|---------------|-----------------|
| N+1 Query Detection | N+1 query patterns in theme and plugin code with confidence ratings | No |
| Cron Analysis | Overdue, duplicate, and excessively-frequent scheduled jobs | Yes |
| WP-CLI Profile | Stage and hook timing analysis for performance bottlenecks | Yes |

### Architecture

| Skill | What it checks | Requires WP-CLI |
|-------|---------------|-----------------|
| Architecture Review | CPT misuse, hook abuse patterns, caching anti-patterns | No |
| Architectural Narrative | AI-synthesized health narrative across all diagnostic domains | No |

### Investigation

| Skill | What it does |
|-------|-------------|
| Intake | Gathers context from the user -- symptoms, timeline, environment, scope, urgency |
| Site Scout | SSH reconnaissance -- error logs, recent file changes, PHP environment, disk usage |
| Scan Reviewer | Verifies findings address the original concern, checks for contradictions |

### Utility

| Skill | What it does |
|-------|-------------|
| Report Generator | Compiles findings into structured markdown reports with A-F health grades |
| Trend Tracker | Cross-scan NEW/RESOLVED/RECURRING classification with inline report badges |

All findings use three severity levels: **Critical**, **Warning**, and **Info**.

Reports are saved to `memory/{site-name}/latest.md` with A-F health grades and trend badges.

## Multi-Source Connection

WordPress Expert can connect to sites through multiple source types:

| Source | Command | Use case |
|--------|---------|----------|
| **SSH** | `/connect user@host.com` | Production/staging servers |
| **Local** | `/connect /var/www/wordpress` | Local development environments |
| **Docker** | `/connect docker:container-name` | Docker-based development |
| **Git** | `/connect git:repo-url` | Code-only analysis from repositories |

All sources sync to a local `.sites/` directory for analysis. SSH connections use `rsync` with dry-run-first safety. Local and Docker connections use direct file copy.

## Project Structure

```
.claude-plugin/
  plugin.json            # Plugin manifest (skills + commands registry)
commands/
  batch/COMMAND.md       # /batch workflow
  connect/COMMAND.md     # /connect workflow
  diagnose/COMMAND.md    # /diagnose workflow (quick scan)
  investigate/COMMAND.md # /investigate workflow (full investigation)
  status/COMMAND.md      # /status workflow
skills/
  diagnostic-*/          # 15 diagnostic skill specifications
  intake/                # Context gathering before diagnostics
  site-scout/            # SSH reconnaissance
  scan-reviewer/         # Post-scan findings verification
  report-generator/      # Report compilation and health grading
  trend-tracker/         # Cross-scan trend analysis
  diagnostic-arch-narrative/ # AI-synthesized architectural narrative
config.json              # Workflow toggles
sites.json               # Connection profiles (gitignored)
.sites/                  # Synced site files (gitignored)
memory/                  # Diagnostic reports, case logs, and history (gitignored)
bin/
  install.js             # Claude Code CLI installer
tests/
  validate-plugin.sh     # Plugin structure validation
```

## Safety

- SSH credentials are never stored in version-controlled files or logged to output
- `rsync --delete` is never used (no risk of deleting remote files)
- All rsync operations run `--dry-run` first
- Files are pulled read-only; the plugin never pushes changes to the remote site
- `sites.json` and `.sites/` are gitignored by default
- No `.env` files are committed

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new skills, commands, and improvements.

## License

[MIT](LICENSE)
