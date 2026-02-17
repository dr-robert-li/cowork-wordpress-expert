# WordPress Expert

A diagnostic plugin for WordPress sites that connects via SSH, syncs the codebase locally, and runs structured investigations with intake questioning, site reconnaissance, parallel execution, and findings verification.

Works as a [Claude CoWork](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/cowork-plugins) plugin (Claude Desktop) or a Claude Code CLI addon. Nothing is installed on the WordPress site.

## Requirements

- [Claude Desktop](https://claude.ai/download) with CoWork support **or** [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code) CLI
- SSH access to the target WordPress site
- `rsync` installed locally
- `jq` installed locally
- Optional: [WP-CLI](https://wp-cli.org/) on the remote server (enables core integrity checks, user audits, and version audits)

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

This installs commands and skills to `~/.claude/` so they're available in all Claude Code sessions. Commands are namespaced as `/wpxpert:connect`, `/wpxpert:diagnose`, `/wpxpert:investigate`, `/wpxpert:status`.

To uninstall:

```bash
npx wpxpert --uninstall
```

## Commands

### `/connect`

Connect to a WordPress site via SSH. Detects WordPress installation, discovers WP-CLI, syncs files locally, and saves the connection profile.

```
/connect
/connect mysite.com
```

### `/investigate`

Run a thorough diagnostic investigation with structured workflow:

1. **Intake** — gathers context about your concern
2. **Scout** — SSH reconnaissance for environment clues
3. **Plan** — chooses which skills to run based on concern + scout data
4. **Execute** — runs skills in parallel waves
5. **Review** — verifies findings address your concern
6. **Report** — generates report with confidence rating

```
/investigate
/investigate my site got hacked
/investigate security on mysite
/investigate slow performance on production
```

Each step is configurable via `config.json`. Use `/investigate` for thorough analysis and `/diagnose` for quick scans.

### `/diagnose`

Run diagnostic scans across all skills. Supports three modes:

- **full** (default) -- all 6 diagnostic skills
- **security-only** -- core integrity, config security, user audit
- **code-only** -- code quality, malware scan

```
/diagnose
/diagnose security only
/diagnose code only on mysite
```

Features inline progress feedback, skip-and-continue error recovery, A-F health grading, and suggested next actions.

### `/status`

View connected sites, health summaries, and suggested next actions.

```
/status
/status remove mysite
/status default mysite
/status rename oldname newname
```

## Skills

### Diagnostic Skills

| Skill | What it checks | Requires WP-CLI |
|-------|---------------|-----------------|
| Core Integrity | WordPress core file checksums against known-good values | Yes |
| Config Security | wp-config.php for debug mode, salts, file editing, DB prefix | No |
| User Audit | Admin usernames, role distribution, inactive accounts | Yes |
| Version Audit | WordPress, plugin, and theme update status | Yes |
| Malware Scan | Pattern-based detection of backdoors, obfuscation, shells | No |
| Code Quality | AI-powered analysis of active theme and custom plugins | No |

### Investigation Skills

| Skill | What it does |
|-------|-------------|
| Intake | Gathers context from the user — symptoms, timeline, environment, scope, urgency |
| Site Scout | SSH reconnaissance — error logs, recent file changes, PHP environment, disk usage |
| Scan Reviewer | Verifies findings address the original concern, checks for contradictions |

All findings use three severity levels: **Critical**, **Warning**, and **Info**.

Reports are saved to `memory/{site-name}/latest.md` with A-F health grades.

## Project Structure

```
.claude-plugin/
  plugin.json            # Plugin manifest
commands/
  connect/COMMAND.md     # /connect workflow
  diagnose/COMMAND.md    # /diagnose workflow (quick scan)
  investigate/COMMAND.md # /investigate workflow (full investigation)
  status/COMMAND.md      # /status workflow
skills/
  diagnostic-*/          # 6 diagnostic skill specifications
  intake/                # Context gathering before diagnostics
  site-scout/            # SSH reconnaissance
  scan-reviewer/         # Post-scan findings verification
  report-generator/      # Report compilation and health grading
config.json              # Workflow toggles
sites.json               # Connection profiles (gitignored)
.sites/                  # Synced site files (gitignored)
memory/                  # Diagnostic reports, case logs, and history (gitignored)
bin/
  install.js             # Claude Code CLI installer
```

## Safety

- SSH credentials are never stored in version-controlled files or logged to output
- `rsync --delete` is never used (no risk of deleting remote files)
- All rsync operations run `--dry-run` first
- Files are pulled read-only; the plugin never pushes changes to the remote site
- `sites.json` and `.sites/` are gitignored by default

## License

[MIT](LICENSE)
