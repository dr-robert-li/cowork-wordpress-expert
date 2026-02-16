# WordPress Expert

A [Claude CoWork](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/cowork-plugins) plugin that connects to WordPress sites via SSH, syncs their codebase locally, and runs comprehensive diagnostics covering security, code quality, and version management.

Nothing is installed on the WordPress site. The plugin operates entirely from your local machine using SSH and rsync.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code) (CLI)
- SSH access to the target WordPress site
- `rsync` installed locally
- `jq` installed locally
- Optional: [WP-CLI](https://wp-cli.org/) on the remote server (enables core integrity checks, user audits, and version audits)

## Installation

Clone this repo into your project directory (or anywhere you want to run it from):

```bash
git clone https://github.com/your-org/wordpress-expert.git
cd wordpress-expert
```

Claude Code automatically detects the `.claude-plugin/plugin.json` and loads the plugin.

## Commands

### `/connect`

Connect to a WordPress site via SSH. Detects WordPress installation, discovers WP-CLI, syncs files locally, and saves the connection profile.

```
/connect
/connect mysite.com
```

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

## Diagnostic Skills

| Skill | What it checks | Requires WP-CLI |
|-------|---------------|-----------------|
| Core Integrity | WordPress core file checksums against known-good values | Yes |
| Config Security | wp-config.php for debug mode, salts, file editing, DB prefix | No |
| User Audit | Admin usernames, role distribution, inactive accounts | Yes |
| Version Audit | WordPress, plugin, and theme update status | Yes |
| Malware Scan | Pattern-based detection of backdoors, obfuscation, shells | No |
| Code Quality | AI-powered analysis of active theme and custom plugins | No |

All findings use three severity levels: **Critical**, **Warning**, and **Info**.

Reports are saved to `memory/{site-name}/latest.md` with A-F health grades.

## Project Structure

```
.claude-plugin/
  plugin.json          # Plugin manifest
commands/
  connect/COMMAND.md   # /connect workflow
  diagnose/COMMAND.md  # /diagnose workflow
  status/COMMAND.md    # /status workflow
skills/
  diagnostic-*/        # 6 diagnostic skill specifications
  report-generator/    # Report compilation and health grading
sites.json             # Connection profiles (gitignored)
.sites/                # Synced site files (gitignored)
memory/                # Diagnostic reports and history (gitignored)
```

## Safety

- SSH credentials are never stored in version-controlled files or logged to output
- `rsync --delete` is never used (no risk of deleting remote files)
- All rsync operations run `--dry-run` first
- Files are pulled read-only; the plugin never pushes changes to the remote site
- `sites.json` and `.sites/` are gitignored by default

## License

[MIT](LICENSE)
