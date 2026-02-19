# Contributing to WordPress Expert

WordPress Expert is a Claude CoWork plugin that diagnoses WordPress sites using structured markdown skills. Contributions are welcome — especially new diagnostic skills.

## How the Plugin Works

The plugin is entirely markdown + JSON. There is no compiled code. Claude reads the skill specifications (SKILL.md files) and follows their instructions to diagnose WordPress sites. Adding a new skill means writing a new SKILL.md that tells Claude what to check and how to report findings.

## Adding a New Skill

### 1. Create the Skill Directory

```
skills/diagnostic-{name}/SKILL.md
```

Use the `diagnostic-` prefix for skills that produce findings. Non-diagnostic skills (like `intake` or `report-generator`) don't need the prefix.

### 2. Write the SKILL.md

Every SKILL.md needs:

- **Frontmatter** with `name` and `description`
- **Purpose** section explaining what the skill checks and why
- **Connection setup** referencing the standard variables
- **Check procedures** with bash commands or code analysis instructions
- **Findings format** specifying the JSON structure

Use the template below as a starting point.

### 3. Register in plugin.json

Add your skill to `.claude-plugin/plugin.json`:

```json
"diagnostic-your-skill": {
  "description": "One-line description of what the skill checks",
  "status": "implemented"
}
```

### 4. Document in README

Add a row to the appropriate skills table in `README.md`.

### 5. Run Validation

```bash
bash tests/validate-plugin.sh
```

This checks that your SKILL.md has proper frontmatter and that the skill is registered in plugin.json.

## Skill Template

````markdown
---
name: diagnostic-example
description: One-line description of what this skill checks
---

# Diagnostic: Example Check

## Purpose

What this skill checks and why it matters for WordPress site health.

## Connection Setup

Uses the standard connection variables from the active site profile:

- `$LOCAL_PATH` — local synced copy of the site
- `$SSH_CMD` — SSH command prefix (e.g., `ssh user@host`)
- `$WP_CLI_PREFIX` — WP-CLI command prefix (e.g., `ssh user@host wp --path=/var/www/html`)
- `$WP_PATH` — WordPress root on the remote server

## Checks

### Check 1: Descriptive Name

**What:** What this check looks for.
**Why:** Why it matters.

```bash
$WP_CLI_PREFIX option list --autoload=yes --format=json
```

Evaluate the output for [specific conditions].

### Check 2: Another Check

```bash
grep -r "pattern" "$LOCAL_PATH/wp-content/"
```

Look for [specific patterns] indicating [specific issues].

## Findings Format

Each finding must include:

```json
{
  "id": "DOMAIN-SUBCATEGORY-SPECIFIC",
  "severity": "Critical | Warning | Info",
  "category": "Domain Name",
  "title": "Short title",
  "summary": "Plain language explanation for site owners",
  "detail": "Technical detail with file:line references",
  "location": "file path or component name",
  "fix": "Concrete remediation steps"
}
```

## Severity Guidelines

- **Critical** — Active security risk, data loss potential, or site breakage
- **Warning** — Suboptimal configuration that could cause problems
- **Info** — Best practice suggestion or informational note
````

## Finding ID Format

Finding IDs follow the pattern `{DOMAIN}-{SUBCATEGORY}-{SPECIFIC}`:

| Domain | Used for |
|--------|----------|
| `SEC` | Security findings |
| `PERF` | Performance findings |
| `DB` | Database findings |
| `CODE` | Code quality findings |
| `ARCH` | Architecture findings |
| `INFRA` | Infrastructure findings |

Examples: `SEC-CONFIG-DEBUG`, `PERF-QUERY-N1`, `DB-AUTOLOAD-BLOAT`, `INFRA-PERMS-WPCONFIG`

## Filesystem Layout

```
.claude-plugin/
  plugin.json              # Manifest — all skills and commands registered here
commands/
  {command-name}/
    COMMAND.md             # Command specification
skills/
  diagnostic-{name}/
    SKILL.md               # Skill specification (diagnostic skills)
  {name}/
    SKILL.md               # Skill specification (utility skills)
config.json                # Workflow toggle switches
tests/
  validate-plugin.sh       # Structure validation script
```

## Adding a Command

Commands live in `commands/{name}/COMMAND.md` and must be registered in `plugin.json` under `"commands"`. Commands orchestrate skills — they define the workflow (what to run, in what order, how to handle errors).

## Skill Ideas

These WordPress diagnostic skills would be valuable additions:

| Skill | Description |
|-------|-------------|
| `diagnostic-rest-api` | REST API exposure audit — enumerate public endpoints, check authentication requirements |
| `diagnostic-xmlrpc` | XML-RPC attack surface — check if enabled, pingback abuse potential |
| `diagnostic-object-cache` | Object cache analysis — persistent cache status, hit rates, configuration |
| `diagnostic-media-audit` | Media library health — orphaned files, missing thumbnails, oversized uploads |
| `diagnostic-seo-health` | SEO configuration — robots.txt, sitemap, meta tags, canonical URLs |
| `diagnostic-email-config` | Email deliverability — SMTP configuration, SPF/DKIM, transactional email setup |
| `diagnostic-multisite` | Multisite network analysis — site health, shared tables, network configuration |
| `diagnostic-backup-audit` | Backup configuration — schedule, destination, retention, last successful backup |
| `diagnostic-login-security` | Login hardening — brute force protection, 2FA, login URL, failed attempt limits |
| `diagnostic-api-keys` | Exposed secrets scan — API keys, tokens, passwords in theme/plugin code |

## PR Process

1. Fork the repository
2. Create a branch (`git checkout -b add-skill-name`)
3. Add your skill following the template above
4. Run `bash tests/validate-plugin.sh` to verify structure
5. Open a PR with:
   - What the skill checks
   - Example findings it would produce
   - Any WP-CLI or server requirements

## Code of Conduct

Be kind and constructive. This is a diagnostic tool — accuracy and clarity matter more than cleverness.
