# Coding Standards

Standards for contributing to WordPress Expert. These are intentionally lightweight — the plugin is markdown + JSON, not compiled code.

## General

- No compiled code. The plugin is markdown, JSON, and bash snippets only.
- Every skill and command must be registered in `.claude-plugin/plugin.json`.
- Run `bash tests/validate-plugin.sh` before submitting changes.

## Markdown

- Use ATX headings (`#`, `##`, `###`) — not underline style.
- Use fenced code blocks with language identifiers (````bash`, ````json`).
- One blank line between sections.
- No trailing whitespace.
- Files end with a single newline.

## SKILL.md Files

### Required Frontmatter

Every SKILL.md must start with YAML frontmatter:

```yaml
---
name: diagnostic-example
description: One-line description of what this skill checks
---
```

Both `name` and `description` are required. The `name` must match the directory name.

### Required Sections

Diagnostic skills should include:

1. **Purpose** — what the skill checks and why
2. **Connection Setup** — reference to standard variables (`$LOCAL_PATH`, `$SSH_CMD`, `$WP_CLI_PREFIX`, `$WP_PATH`)
3. **Checks** — specific procedures with bash commands or analysis instructions
4. **Findings Format** — the JSON structure for results

### Bash in Skills

- Use `$WP_CLI_PREFIX` instead of raw `wp` commands — this handles SSH, Docker, and local paths.
- Use dynamic table prefixes (`$TABLE_PREFIX`) instead of hardcoded `wp_`.
- Include error handling for commands that may fail (WP-CLI not available, permission denied).
- Quote all variable expansions in bash snippets.

## COMMAND.md Files

Commands orchestrate skills. They define:

1. What skills to run and in what order
2. How to handle user input and mode selection
3. Error recovery and partial completion behavior
4. Output format and report generation

## Findings JSON

All diagnostic findings must use this structure:

```json
{
  "id": "DOMAIN-SUBCATEGORY-SPECIFIC",
  "severity": "Critical | Warning | Info",
  "category": "Domain Name",
  "title": "Short descriptive title",
  "summary": "Plain language explanation a site owner would understand",
  "detail": "Technical detail with file:line references for developers",
  "location": "file path or component name",
  "fix": "Concrete remediation steps with code examples where applicable"
}
```

### Required Fields

All fields are required. Do not omit any.

### Finding IDs

Pattern: `{DOMAIN}-{SUBCATEGORY}-{SPECIFIC}`

- Domain codes: `SEC`, `PERF`, `DB`, `CODE`, `ARCH`, `INFRA`
- Use UPPERCASE with hyphens
- Be specific: `SEC-CONFIG-DEBUG` not `SEC-1`

### Severity Levels

Only three levels:

| Level | When to use |
|-------|-------------|
| **Critical** | Active security risk, data loss potential, or site breakage |
| **Warning** | Suboptimal configuration that could cause problems under load or over time |
| **Info** | Best practice suggestion, informational note, or minor improvement |

Do not invent additional severity levels.

## plugin.json

Every skill directory must have a corresponding entry in `.claude-plugin/plugin.json` under `"skills"`. Every command directory must have an entry under `"commands"`.

```json
"diagnostic-example": {
  "description": "One-line description matching the SKILL.md frontmatter",
  "status": "implemented"
}
```

The `description` should match (or closely match) the SKILL.md frontmatter description.

## config.json

Workflow toggles go in `config.json`. These control investigation behavior, not individual skill behavior. Don't add config for things that should always be on.

## File Naming

- Skill directories: `skills/{name}/SKILL.md`
- Diagnostic skills: `skills/diagnostic-{name}/SKILL.md`
- Command directories: `commands/{name}/COMMAND.md`
- All specification files are uppercase: `SKILL.md`, `COMMAND.md`

## Security

- Never commit `sites.json`, `.sites/`, or `memory/` directories
- Never log SSH credentials, passwords, or private keys
- Never include `.env` files
- The `.gitignore` handles this — don't modify it to weaken these protections
