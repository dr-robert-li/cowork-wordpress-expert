# Case Log Schema

Documents the `memory/{site-name}/case-log.json` format used for tracking diagnostic history across investigations.

## Location

```
memory/{site-name}/case-log.json
```

This file is gitignored (inside `memory/`). One case log per site.

## Schema

```json
{
  "cases": [
    {
      "case_id": "case-2026-02-17-001",
      "date": "2026-02-17T10:30:00Z",
      "concern": "Site slow after plugin update",
      "mode": "investigate",
      "skills_run": ["version-audit", "code-quality", "config-security"],
      "skills_skipped": ["core-integrity"],
      "health_grade": "C",
      "confidence": "High",
      "finding_counts": {
        "critical": 1,
        "warning": 3,
        "info": 2
      },
      "open_items": ["Update outdated plugins", "Review memory limit"],
      "report_path": "memory/mysite/archive/scan-2026-02-17.md"
    }
  ]
}
```

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | string | Unique ID: `case-{YYYY-MM-DD}-{NNN}` |
| `date` | string | ISO 8601 timestamp of scan completion |
| `concern` | string | User's original concern (from intake or command args) |
| `mode` | string | How the scan was initiated: `investigate`, `diagnose-full`, `diagnose-security`, `diagnose-code` |
| `skills_run` | string[] | Skills that completed successfully |
| `skills_skipped` | string[] | Skills that were skipped (with reason in report) |
| `health_grade` | string | Final grade: A, B, C, D, F, or Incomplete |
| `confidence` | string | Scan reviewer rating: High, Medium, Low |
| `finding_counts` | object | Breakdown by severity |
| `open_items` | string[] | Recommended actions not yet resolved |
| `report_path` | string | Path to archived report for this case |

## Usage

### Written by

- `/investigate` command (Section 9: Case Log Update)
- `/diagnose` command (when `track_case_history` enabled in config.json)

### Read by

- `skills/intake/SKILL.md` — references prior cases for context
- `commands/status/COMMAND.md` — shows recent scan history per site
- `commands/investigate/COMMAND.md` — checks for prior findings on same concern
