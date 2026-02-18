# Architecture Research

**Domain:** WordPress CoWork Plugin — v2.0 Feature Integration
**Researched:** 2026-02-18
**Confidence:** HIGH (based on direct codebase analysis + domain knowledge)

---

## Context: What This Document Covers

This is a subsequent-milestone architecture document. The v1 architecture is already built and running (10 skills, 4 commands, SSH-only). This document focuses on:

1. How the 7 new features integrate with the existing architecture
2. What components change vs what stays the same
3. The key structural problem: `/connect` currently assumes SSH only
4. Suggested build order for the milestone

Read the existing ARCHITECTURE.md for v1 system overview. This document extends it.

---

## The Central Architectural Challenge: Source Abstraction

The v1 architecture couples access method (SSH) directly into every component: `/connect` steps, `/diagnose` resync logic, `site-scout` check execution, and all skill connection setups. Every bash code block in every COMMAND.md and SKILL.md contains `ssh {user}@{host}` commands.

v2 introduces three new source modes:
- **Local** — WordPress running on the same machine (MAMP, Flywheel, LocalWP, Lando)
- **Docker** — WordPress in a named container (`docker exec`)
- **Git** — A WordPress repo at a local path or remote URL (clone, then treat as local)

The architectural decision is: **how deep does source abstraction go?**

### The Chosen Approach: Connection Context + Source-Aware Execution

Rather than a formal adapter layer (which would require significant refactoring), use a **connection context pattern**: each site profile in `sites.json` gains a `source_type` field, and each command/skill reads this field to determine how to execute shell commands. This minimizes changes to existing skills while enabling new sources.

**Source types:**

| Type | `source_type` | How commands run |
|------|--------------|------------------|
| SSH remote | `"ssh"` | `ssh {user}@{host} "{command}"` (existing) |
| Local directory | `"local"` | `bash -c "{command}"` with `cd {wp_path}` |
| Docker container | `"docker"` | `docker exec {container} bash -c "{command}"` |
| Git repository | `"git"` | Clone to `.sites/{name}/`, treat as local |

**Key insight:** Docker and git both resolve to a local execution context. Git clones the repo, then behaves like a local directory. This means there are effectively two execution models: SSH (remote) and local (direct bash). Docker and git are just connection setup variants that produce a local working directory.

---

## Updated Component Architecture

### System Overview (v2)

```
┌─────────────────────────────────────────────────────────────────┐
│                   USER INTERACTION LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ /connect │  │/diagnose │  │/investigate│  │ /status  │         │
│  │ command  │  │ command  │  │  command  │  │ command  │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       └──────────────┴──────────────┴──────────────┘             │
├─────────────────────────────────────────────────────────────────┤
│              SOURCE RESOLUTION LAYER (NEW)                       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Read source_type from sites.json profile                │    │
│  │  → SSH: ssh {user}@{host} "{cmd}"                        │    │
│  │  → Local: bash -c "cd {wp_path} && {cmd}"               │    │
│  │  → Docker: docker exec {container} bash -c "{cmd}"       │    │
│  │  → Git: already resolved to local by /connect            │    │
│  └──────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                    SKILLS LAYER                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │Existing  │ │ NEW: DB  │ │ NEW: Perf│ │ NEW: Arch│         │
│  │7 diag    │ │ Analysis │ │Bottleneck│ │ Review   │         │
│  │skills    │ │ (SKILL)  │ │ (SKILL)  │ │ (SKILL)  │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│  ┌──────────┐ ┌──────────┐                                    │
│  │ NEW:     │ │Existing  │                                    │
│  │ Trends   │ │intake,   │                                    │
│  │ Tracker  │ │scout,    │                                    │
│  │ (SKILL)  │ │reviewer  │                                    │
│  └──────────┘ └──────────┘                                    │
├─────────────────────────────────────────────────────────────┤
│                  EXECUTION LAYER                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │  SSH/Rsync │  │  WP-CLI    │  │  Analysis  │              │
│  │  (remote)  │  │ (local or  │  │  (Claude)  │              │
│  │            │  │  SSH)      │  │            │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐                              │
│  │  Docker    │  │   Git      │                              │
│  │  exec      │  │   clone    │                              │
│  └────────────┘  └────────────┘                              │
├─────────────────────────────────────────────────────────────┤
│                    DATA LAYER                                │
│  ┌────────────────┐  ┌───────────────────────────────┐       │
│  │  sites.json    │  │  memory/{site}/               │       │
│  │  (+ source_type│  │  latest.md, archive/,         │       │
│  │   container,   │  │  case-log.json,               │       │
│  │   git_url)     │  │  scout-report.json,           │       │
│  └────────────────┘  │  TRENDS (new): trends.json    │       │
│                       └───────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## Component-by-Component Analysis

### Components That CHANGE

#### 1. `/connect` Command (COMMAND.md) — SIGNIFICANT CHANGE

Currently: 11-step SSH-only flow (gather details → SSH verify → WP detect → WP-CLI → sync → save profile).

v2 needs: A branching entry point based on connection type, then converge to the same profile-save/WP-detection steps.

**Structural change — new Section 0: Source Type Selection**

Add before the existing SSH gathering step:

```
### 0. Select Connection Type

Ask: "What type of WordPress source? (ssh/local/docker/git)"

- ssh: Continue with existing SSH flow (Steps 1-11 unchanged)
- local: Jump to LOCAL flow (new)
- docker: Jump to DOCKER flow (new)
- git: Jump to GIT flow (new)

All paths converge at: WordPress validation → WP-CLI detection → profile save
```

**New LOCAL flow (replaces SSH steps 2-4):**
```bash
# User provides path directly
LOCAL_WP_PATH="/Users/me/Sites/mysite"

# Validate WordPress exists at path
test -f "${LOCAL_WP_PATH}/wp-config.php" && \
test -d "${LOCAL_WP_PATH}/wp-content"

# No rsync needed — local files ARE the local_path
# Set local_path = LOCAL_WP_PATH (no .sites/ copy needed)
```

**New DOCKER flow (replaces SSH steps 2-4):**
```bash
# User provides container name
CONTAINER="mysite_wordpress"

# Verify container is running
docker ps --filter "name=${CONTAINER}" --format "{{.Names}}"

# Detect WordPress inside container
docker exec "${CONTAINER}" test -f /var/www/html/wp-config.php

# Rsync files from container to .sites/{name}/
docker cp "${CONTAINER}:/var/www/html/." ".sites/${SITE_NAME}/"
# Note: docker cp, not rsync (container-to-host transfer)

# Set local_path = .sites/{name}/ (copied files)
# All subsequent commands use: docker exec {container} {cmd}
```

**New GIT flow (replaces SSH steps 2-4):**
```bash
# User provides git URL or local git path
GIT_URL="https://github.com/org/mysite.git"
# OR
GIT_LOCAL="/Users/me/dev/mysite-repo"

# For remote URL: clone to .sites/{name}/
git clone "${GIT_URL}" ".sites/${SITE_NAME}/"

# For local path: symlink or copy
cp -r "${GIT_LOCAL}/." ".sites/${SITE_NAME}/"

# Detect WordPress (wp-config.php may not exist in git repos — check for it
# or check for wp-config-sample.php as indicator)
test -f ".sites/${SITE_NAME}/wp-config.php" || \
test -f ".sites/${SITE_NAME}/wp-config-sample.php"

# local_path = .sites/{name}/ (git checkout)
# No live DB access — static file analysis only
```

**sites.json profile schema additions:**
```json
{
  "source_type": "ssh | local | docker | git",
  "container": "container_name_or_null",
  "git_url": "https://... or null",
  "git_branch": "main or null"
}
```

**What stays the same in `/connect`:** WordPress validation logic, WP-CLI detection, profile-save to sites.json, the profile-shortcut lookup (Section 1). These work the same regardless of source type.

---

#### 2. `/diagnose` Command (COMMAND.md) — MODERATE CHANGE

Currently: Sections 2-3 assume SSH for auto-connect and resync.

v2 change: Resync logic in Section 3 (Silent File Resync) must branch on `source_type`:

```bash
# Read source type from profile
SOURCE_TYPE=$(echo "$PROFILE" | jq -r '.source_type // "ssh"')

case "$SOURCE_TYPE" in
  "ssh")
    # Existing rsync logic (unchanged)
    rsync -az ... "${USER}@${HOST}:${WP_PATH}/" "$LOCAL_PATH/"
    ;;
  "local")
    # No sync needed — local_path IS the WordPress directory
    echo "Local source: using files at $LOCAL_PATH directly"
    ;;
  "docker")
    # Re-copy from container
    docker cp "${CONTAINER}:/var/www/html/." "$LOCAL_PATH/"
    ;;
  "git")
    # Re-pull from git (if tracking a branch)
    if [ -n "$GIT_URL" ]; then
      git -C "$LOCAL_PATH" pull origin "${GIT_BRANCH:-main}"
    fi
    ;;
esac
```

**New diagnostic modes to add:**
- `db` — runs DB analysis skill
- `performance` — runs performance bottleneck skill
- `architecture` — runs architecture review skill
- `full` (existing) — should include the new skills

Mode detection parsing in Section 1 needs these additions:
```bash
if echo "$USER_INPUT" | grep -qE "(database|db|mysql|mariadb)"; then
  MODE="db"
elif echo "$USER_INPUT" | grep -qE "(performance|perf|speed|bottleneck)"; then
  MODE="performance"
elif echo "$USER_INPUT" | grep -qE "(architecture|arch|structure|design)"; then
  MODE="architecture"
```

---

#### 3. `/investigate` Command (COMMAND.md) — MINOR CHANGE

The site-scout in Section 5 uses SSH. For non-SSH sources, the scout's reconnaissance approach changes:

- **Local source:** Skip SSH checks. Run bash commands directly. Adjust site-scout to execute commands locally.
- **Docker source:** Run `docker exec {container} {command}` instead of `ssh {user}@{host} {command}`.
- **Git source:** Skip scout entirely (no live site to scout). Proceed with file-based analysis only.

The planning section (Section 7) should add new skills to the skill-selection logic:
- `diagnostic-db-analysis` added to the wave groupings
- `diagnostic-performance` added to wave groupings
- `diagnostic-architecture` added to wave groupings

---

#### 4. `site-scout` Skill (SKILL.md) — MODERATE CHANGE

Currently: All 8 checks run via SSH. The skill reads `HOST`, `USER` from profile and uses `ssh $SSH_OPTS "${USER}@${HOST}" "..."` for every check.

v2 change: Read `SOURCE_TYPE` from profile. Build an execution function at the top of the skill:

```bash
# Source-aware command execution
run_check() {
  local cmd="$1"
  case "$SOURCE_TYPE" in
    "ssh")
      ssh $SSH_OPTS "${USER}@${HOST}" "$cmd"
      ;;
    "local")
      bash -c "cd '${WP_PATH}' && $cmd"
      ;;
    "docker")
      docker exec "${CONTAINER}" bash -c "$cmd"
      ;;
    "git")
      # Static only — no live execution
      echo "STATIC_ONLY"
      ;;
  esac
}
```

Then replace all direct `ssh $SSH_OPTS ...` calls with `run_check "..."`. This is a search-and-replace style change, not a structural rewrite.

---

#### 5. `sites.json` Schema — ADDITIVE CHANGE

New fields (all optional, default to null for backward compatibility with v1 SSH profiles):

```json
{
  "sites": {
    "mysite": {
      "host": "example.com",
      "user": "wpuser",
      "ssh_key": "~/.ssh/id_rsa",
      "wp_path": "/var/www/html",
      "local_path": ".sites/mysite",
      "wp_version": "6.7.1",
      "site_url": "https://mysite.com",
      "wp_cli_path": "/usr/local/bin/wp",
      "last_sync": "2026-02-18T10:00:00Z",
      "created_at": "2026-02-18T10:00:00Z",
      "environment": null,
      "is_default": true,
      "notes": null,

      "source_type": "ssh",
      "container": null,
      "git_url": null,
      "git_branch": null
    }
  }
}
```

Backward compatibility: Any profile without `source_type` is treated as `"ssh"`. No migration needed.

---

### Components That Are NEW

#### 6. `diagnostic-db-analysis` Skill (NEW SKILL.md)

**What it does:** Queries the WordPress database for health issues using WP-CLI's `wp db query` command.

**Key checks:**
- Autoloaded options size — query `wp_options WHERE autoload='yes'`, flag if total > 1MB
- Orphaned transients — `SELECT COUNT(*) FROM wp_options WHERE option_name LIKE '_transient_%' AND option_name NOT LIKE '_transient_timeout_%'`
- Post revision count — `SELECT COUNT(*) FROM wp_posts WHERE post_type='revision'`
- wp_postmeta bloat — total row count and size
- Table sizes — identify largest tables
- Orphaned postmeta — meta rows with no matching post
- Draft/auto-draft accumulation

**DB access approaches by source type:**

```bash
# SSH source: WP-CLI over SSH
ssh "${USER}@${HOST}" "cd ${WP_PATH} && ${WP_CLI_PATH} db query '${SQL}'"

# Local source: WP-CLI directly (reads wp-config.php for credentials)
${WP_CLI_PATH} db query "${SQL}" --path="${WP_PATH}"

# Docker source: WP-CLI inside container
docker exec "${CONTAINER}" wp db query "${SQL}" --path=/var/www/html

# Git source: Parse wp-config.php for credentials, use mysql CLI directly
# Extract: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD from wp-config.php
# Then: mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -e "${SQL}"
```

**Finding format:** Same JSON structure as existing diagnostic skills. New categories needed:
- `"Database Health"` (new category for report-generator)
- Finding IDs: `DB-{CHECK}-{hash}` prefix

**WP-CLI dependency:** This skill requires WP-CLI for SSH/local/Docker sources. For git sources, it requires mysql CLI access. If neither is available, the skill returns a Warning finding explaining the gap.

---

#### 7. `diagnostic-performance` Skill (NEW SKILL.md)

**What it does:** Detects WordPress performance bottlenecks through code analysis of synced files and optional WP-CLI checks.

**Key checks (code analysis — works for all source types):**
- N+1 query patterns — scan for `$wpdb->get_results()` inside `foreach` loops in synced PHP files
- Expensive hooks — detect heavy computation in `init`, `wp_loaded`, `admin_init` action callbacks
- Blocking HTTP calls — `wp_remote_get()` / `wp_remote_post()` without `timeout` arg or `async`
- Missing object cache — repeated `get_option()` calls without caching, repeated DB calls for same data
- `ORDER BY RAND()` in queries — regex scan in PHP files

**Key checks (WP-CLI required):**
- Autoload size — same as DB skill (share finding, don't run twice)
- Cron job analysis — `wp cron event list` for excessive scheduled tasks

**Source type impact:** All code-based checks work on the synced local files regardless of source type. WP-CLI checks degrade gracefully if not available.

**Finding format:** Category `"Performance"` (new for report-generator). Finding IDs: `PERF-{CHECK}-{hash}`.

---

#### 8. `diagnostic-architecture` Skill (NEW SKILL.md)

**What it does:** Reviews WordPress architectural decisions in the codebase using Claude's AI analysis of synced files.

**Key checks (pure file analysis — works for all source types):**
- Custom Post Type misuse — CPTs used for options storage or where `wp_options` would suffice
- Options table bloat — excessive use of `add_option()` for data that should be in custom tables
- Hook abuse — `add_filter()` returning values from `add_action()` callbacks, wrong hook priorities
- Caching anti-patterns — transients storing large objects, cache groups not used
- Plugin architecture — direct DB calls in templates, business logic in `functions.php`
- Theme architecture — `functions.php` > 500 lines (indicator of feature sprawl into theme layer)

**Finding format:** Category `"Architecture"` (new for report-generator). Finding IDs: `ARCH-{CHECK}-{hash}`.

---

#### 9. `trends-tracker` Skill (NEW SKILL.md)

**What it does:** Reads the case-log.json history and generates a trends analysis comparing current scan to historical data.

**Input:** `memory/{site}/case-log.json` (existing file, already populated by v1)

**What it computes:**
- Health grade trajectory — is the site improving, stable, or degrading over last N scans?
- Finding count trends — critical/warning/info counts over time
- Persistent findings — which finding IDs appear in every scan (unresolved issues)
- Resolved findings — finding IDs present before but absent now (fixed)
- Regression findings — absent before but present now (new issues)

**Output:** Writes `memory/{site}/trends.json`:
```json
{
  "site": "mysite",
  "generated_at": "2026-02-18T10:00:00Z",
  "scans_analyzed": 5,
  "trajectory": "improving",
  "grade_history": ["F", "D", "C", "B", "B"],
  "persistent_findings": ["SECR-CONFIG-DBG-a1b2c3", "DIAG-OUTDATED-d4e5f6"],
  "resolved_since_last": ["SECR-CHECKSUMS-a3f"],
  "regressions_since_last": [],
  "finding_counts": [
    {"date": "2026-02-01", "critical": 4, "warning": 6, "info": 2},
    {"date": "2026-02-10", "critical": 2, "warning": 5, "info": 3},
    {"date": "2026-02-18", "critical": 1, "warning": 3, "info": 4}
  ]
}
```

**Integration point:** The report-generator skill should check for `trends.json` and include a "Trends" section at the top of the report if it exists. The scan-reviewer should reference trends when assessing confidence (persistent unresolved findings = lower confidence in "complete" assessment).

**This skill is read-only and source-type-agnostic** — it only reads files from `memory/`, never touches the WordPress site.

---

#### 10. Updated `report-generator` Skill — ADDITIVE CHANGE

The report-generator needs two additions:

**New finding categories:**
- `"Database Health"` — findings from `diagnostic-db-analysis`
- `"Performance"` — findings from `diagnostic-performance`
- `"Architecture"` — findings from `diagnostic-architecture`

Add these sections to the report markdown template, following the existing pattern.

**New Trends section (conditional):**
```markdown
## Trends

**Trajectory:** {improving/stable/degrading} over {N} scans
**Grade history:** {F → D → C → B}

**Persistent issues ({N} unresolved across all scans):**
- {finding title}

**Recently resolved:**
- {finding title}
```

Only render if `memory/{site}/trends.json` exists.

---

## Data Flow Changes

### New: Local Connection Flow

```
User: /connect (type: local)
    ↓
Ask: WordPress path
    ↓
Validate: test -f {path}/wp-config.php
    ↓
WP-CLI detection: which wp (or /usr/local/bin/wp etc.)
    ↓
WP info: wp core version, wp option get siteurl
    ↓
Save profile: source_type="local", local_path={path} (no .sites/ copy)
```

No file sync step. Local path IS the working directory.

### New: Docker Connection Flow

```
User: /connect (type: docker)
    ↓
Ask: Container name
    ↓
Verify: docker ps --filter name={container}
    ↓
Validate WordPress inside container: docker exec {container} test -f /var/www/html/wp-config.php
    ↓
WP-CLI detection: docker exec {container} which wp
    ↓
Copy files to local: docker cp {container}:/var/www/html/. .sites/{name}/
    ↓
WP info: docker exec {container} wp core version
    ↓
Save profile: source_type="docker", container={name}, local_path=.sites/{name}
```

### New: Git Connection Flow

```
User: /connect (type: git)
    ↓
Ask: Git URL or local path
    ↓
If URL: git clone {url} .sites/{name}/
If local: cp -r {path}/. .sites/{name}/
    ↓
Validate WordPress in .sites/{name}/: test -f .sites/{name}/wp-config.php
    ↓
WP-CLI: try locally against .sites/{name}/ (no live site)
    ↓
Save profile: source_type="git", git_url={url}, local_path=.sites/{name}
    ↓
Note to user: "Git source — DB skills unavailable unless wp-config.php has valid local DB credentials"
```

### Modified: DB Analysis Flow

```
/diagnose db on mysite
    ↓
Load profile: source_type, wp_cli_path, container, etc.
    ↓
Build DB execution context:
  SSH: ssh {user}@{host} "wp db query ..."
  Local: wp db query ... --path={wp_path}
  Docker: docker exec {container} wp db query ...
  Git: parse wp-config.php → mysql direct connection
    ↓
Run diagnostic-db-analysis skill
    ↓
Aggregate findings (new "Database Health" category)
    ↓
Run trends-tracker skill after any diagnostic run
    ↓
Report generation (updated report-generator with new categories + trends section)
```

### Modified: Trends Flow

```
After ANY diagnostic run (diagnose or investigate):
    ↓
trends-tracker reads: memory/{site}/case-log.json
    ↓
Computes trajectory, persistent findings, regressions
    ↓
Writes: memory/{site}/trends.json
    ↓
report-generator includes trends section if trends.json exists
```

---

## Recommended Project Structure Changes (v2)

```
cowork-wp-plugin/
├── .claude-plugin/
│   └── plugin.json              # Update version to 3.0.0, add new skills
├── commands/
│   ├── connect/
│   │   └── COMMAND.md           # MODIFIED: add source_type branching
│   ├── diagnose/
│   │   └── COMMAND.md           # MODIFIED: add db/performance/architecture modes
│   ├── investigate/
│   │   └── COMMAND.md           # MODIFIED: add new skills to planning/waves
│   └── status/
│       └── COMMAND.md           # MINOR: show source_type in site list
├── skills/
│   ├── [10 existing skills]     # UNCHANGED (see site-scout note above)
│   ├── site-scout/
│   │   └── SKILL.md             # MODIFIED: source-aware execution function
│   ├── report-generator/
│   │   └── SKILL.md             # MODIFIED: new categories + trends section
│   │
│   # NEW SKILLS:
│   ├── diagnostic-db-analysis/
│   │   └── SKILL.md             # NEW: DB health, autoload, transients, revisions
│   ├── diagnostic-performance/
│   │   └── SKILL.md             # NEW: N+1 queries, expensive hooks, blocking HTTP
│   ├── diagnostic-architecture/
│   │   └── SKILL.md             # NEW: CPT misuse, options bloat, hook abuse
│   └── trends-tracker/
│       └── SKILL.md             # NEW: findings trends over time
├── memory/
│   └── {site}/
│       ├── latest.md
│       ├── archive/
│       ├── case-log.json        # Existing — now also read by trends-tracker
│       ├── scout-report.json
│       └── trends.json          # NEW: written by trends-tracker
└── sites.json                   # MODIFIED: new source_type, container, git_url fields
```

---

## Integration Points: New vs Existing Components

| New Component | Reads From | Writes To | Called By |
|---------------|------------|-----------|-----------|
| `diagnostic-db-analysis` | `sites.json`, local files | findings JSON (in memory) | `/diagnose`, `/investigate` |
| `diagnostic-performance` | `sites.json`, synced files | findings JSON (in memory) | `/diagnose`, `/investigate` |
| `diagnostic-architecture` | `sites.json`, synced files | findings JSON (in memory) | `/diagnose`, `/investigate` |
| `trends-tracker` | `memory/{site}/case-log.json` | `memory/{site}/trends.json` | `/diagnose`, `/investigate` (post-run) |
| Source routing (in commands) | `sites.json` source_type | N/A (runtime branching) | All commands that run remote ops |

| Modified Component | What Changes | Backward Compatible? |
|-------------------|--------------|---------------------|
| `/connect` COMMAND.md | New source type selection at start | Yes — SSH path unchanged |
| `/diagnose` COMMAND.md | Resync branching + new modes | Yes — existing modes unchanged |
| `/investigate` COMMAND.md | New skills in planning + source-aware scout | Yes — existing flow unchanged |
| `site-scout` SKILL.md | Source-aware execution function | Yes — SSH behavior unchanged |
| `report-generator` SKILL.md | New categories + trends section | Yes — existing report structure unchanged |
| `sites.json` schema | New optional fields | Yes — old profiles work without them |

---

## Suggested Build Order

The build order follows a dependency chain. Each step should be completable and testable before starting the next.

### Step 1: sites.json Schema Extension + /connect Source Branching
**Why first:** Everything else depends on the profile having `source_type`. Without this, nothing can branch correctly.

Deliverables:
- Add `source_type`, `container`, `git_url`, `git_branch` fields to sites.json schema
- Add Section 0 (source type selection) to `/connect` COMMAND.md
- Implement LOCAL connection flow in `/connect`
- Test: connect to a local WordPress (MAMP, LocalWP), verify profile saves with `source_type: "local"`

### Step 2: Docker + Git Connection Flows in /connect
**Why second:** Completes source coverage before updating anything that depends on source_type.

Deliverables:
- Implement DOCKER connection flow in `/connect`
- Implement GIT connection flow in `/connect`
- Test: connect to a Docker WordPress container, connect to a git repo

### Step 3: Source-Aware Execution in /diagnose and site-scout
**Why third:** Diagnose/investigate must work with the new source types before adding new skills.

Deliverables:
- Add source-aware resync branching to `/diagnose` Section 3
- Add `run_check()` source-aware execution function to `site-scout` SKILL.md
- Update `/investigate` Section 5 to handle non-SSH scout
- Test: `/diagnose` on a local source site, verify skills run without SSH errors

### Step 4: diagnostic-db-analysis Skill
**Why fourth:** DB analysis is the most requested v2 feature and the most self-contained new skill.

Deliverables:
- New `skills/diagnostic-db-analysis/SKILL.md` with all DB health checks
- Source-type-aware DB access (WP-CLI SSH / WP-CLI local / docker exec / mysql CLI)
- Add `"Database Health"` category to `report-generator` SKILL.md
- Add `db` mode to `/diagnose` mode detection
- Test: run DB analysis on SSH and local sources, verify findings format

### Step 5: diagnostic-performance Skill
**Why fifth:** Code-based analysis (no new access patterns). Builds naturally after DB skill.

Deliverables:
- New `skills/diagnostic-performance/SKILL.md` with N+1 detection, hook analysis, HTTP calls
- Add `"Performance"` category to `report-generator` SKILL.md
- Add `performance` mode to `/diagnose` mode detection
- Test: run on a site with known N+1 patterns

### Step 6: diagnostic-architecture Skill
**Why sixth:** Pure file analysis. Most straightforward new skill.

Deliverables:
- New `skills/diagnostic-architecture/SKILL.md` with CPT, options, hook abuse checks
- Add `"Architecture"` category to `report-generator` SKILL.md
- Add `architecture` mode to `/diagnose` mode detection
- Test: run on a site with known architectural issues

### Step 7: trends-tracker Skill + /investigate Integration
**Why last:** Requires case-log.json data from prior runs. Also most complex to test (needs history).

Deliverables:
- New `skills/trends-tracker/SKILL.md`
- Update `report-generator` SKILL.md to include trends section (conditional)
- Update `/diagnose` and `/investigate` to call trends-tracker after each scan
- Update scan-reviewer to reference trends data in confidence assessment
- Test: run 3+ scans on same site, verify trends.json populated correctly, verify trends section in report

### Step 8: /diagnose and /investigate Full Mode Updates
**Why last of workflow:** Update `full` mode to include new skills, update wave groupings in /investigate.

Deliverables:
- Add db-analysis, performance, architecture to "full" mode skill list in `/diagnose`
- Add these skills to wave groupings in `/investigate` Section 7
- Update plugin.json manifest to list new skills
- Test: full end-to-end on both SSH and local sources

---

## Architectural Patterns for New Features

### Pattern: Source-Aware Execution Function

Recommended for any skill or command that needs to run commands on the WordPress site:

```bash
# Read source context from profile
SOURCE_TYPE=$(jq -r '.source_type // "ssh"' <<< "$PROFILE")
CONTAINER=$(jq -r '.container // ""' <<< "$PROFILE")

# Define execution wrapper
run_remote() {
  local cmd="$1"
  case "$SOURCE_TYPE" in
    "ssh")
      ssh -o BatchMode=yes -o ConnectTimeout=10 "${USER}@${HOST}" "$cmd" 2>&1
      ;;
    "local")
      bash -c "cd '${WP_PATH}' && $cmd" 2>&1
      ;;
    "docker")
      docker exec "${CONTAINER}" bash -c "$cmd" 2>&1
      ;;
    "git")
      echo "UNAVAILABLE: Live site execution not supported for git sources"
      return 1
      ;;
  esac
}

# Usage (same regardless of source type):
WP_VERSION=$(run_remote "${WP_CLI_PATH} core version")
```

This pattern means new skills do not need to know about source types — they call `run_remote()` and get the right behavior. Existing skills get this function added at the top.

### Pattern: WP-CLI Availability by Source Type

WP-CLI availability differs by source:

| Source Type | WP-CLI Status | Notes |
|-------------|--------------|-------|
| SSH | Must be installed remotely | Detected by `/connect`, stored in profile |
| Local | Must be in local PATH | Detected by `/connect` on local machine |
| Docker | Must be inside container | Detected by `/connect` via `docker exec` |
| Git | N/A (no live DB) | Always null for git sources |

Skills that require WP-CLI (core-integrity, user-audit, version-audit, db-analysis) should check both `wp_cli_path != null` AND `source_type != "git"` before running.

### Pattern: Finding Categories Expansion

The existing finding category system (`Security`, `Code Quality`, `Version & Compatibility`, `Suspicious Code`) is extended with new categories. The report-generator handles categories generically — adding a new category only requires:
1. New skill generates findings with the new category name
2. Report-generator template adds a new section for that category name

No other changes needed. The finding schema itself is unchanged.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: SSH-Hardcoded Skills

**What happens:** New skills written with `ssh {user}@{host}` hardcoded, ignoring source type.

**Why it's wrong:** Breaks for local, Docker, and git sources. Creates a maintenance burden when adding new source types later.

**Do this instead:** Every skill that touches the live site uses the `run_remote()` function from the Source-Aware Execution Pattern. Source logic lives in one place per skill, not scattered throughout.

---

### Anti-Pattern 2: DB Credentials in Memory

**What happens:** When implementing direct DB access for git sources, the skill reads `DB_PASSWORD` from `wp-config.php` and logs it or stores it in findings output.

**Why it's wrong:** Security violation. Credentials appear in reports, case logs, memory files.

**Do this instead:** Parse credentials at execution time, use them in the mysql command, discard immediately. Never store in findings JSON. Never display in output. Same rule as SSH keys.

---

### Anti-Pattern 3: Trends-Tracker Running Before Sufficient History

**What happens:** Trends-tracker runs after the first scan and produces a "trends" report with only one data point, which is misleading.

**Why it's wrong:** A trend of 1 is not a trend. Showing "trajectory: improving" after one scan is meaningless.

**Do this instead:** Trends-tracker should check `case-log.json` for at least 2 entries before generating trend data. If fewer than 2 entries, emit an Info finding: "Insufficient scan history for trends analysis. Run 2+ scans to enable trends."

---

### Anti-Pattern 4: Git Source Showing DB Analysis as "Unavailable" Without Explanation

**What happens:** User connects a git repo, runs `/diagnose db`, gets a cryptic skip notice.

**Why it's wrong:** User doesn't understand why the skill was skipped or what they can do.

**Do this instead:** When `source_type = "git"`, the DB analysis skill should emit a single Info finding explaining: "Database analysis is unavailable for git sources. To enable DB analysis: (1) set up a local development database matching the site's wp-config.php, or (2) use /connect with a local or Docker source type."

---

### Anti-Pattern 5: Separate `full-v2` Mode Instead of Updating `full`

**What happens:** Team adds new skills as a separate `/diagnose full-v2` mode to avoid "breaking" the existing `full` mode.

**Why it's wrong:** Mode proliferation. Users confused about which mode to run. `full` becomes stale.

**Do this instead:** Update `full` mode to include new skills. The new skills are additive (new finding categories, same report structure). Users expect `full` to mean all available skills. Backward compatibility is maintained because the new skills simply add more finding categories, they don't break existing ones.

---

## Sources

Analysis based on direct codebase review (2026-02-18):

- `commands/connect/COMMAND.md` — existing SSH connection flow (11 steps, all SSH-specific)
- `commands/diagnose/COMMAND.md` — resync logic, mode detection, skill execution
- `commands/investigate/COMMAND.md` — wave-based execution, planning, scout integration
- `skills/site-scout/SKILL.md` — SSH reconnaissance pattern (8 checks)
- `skills/diagnostic-core-integrity/SKILL.md` — skill pattern: connection context, SSH execution, finding format
- `skills/report-generator/SKILL.md` — finding categories, report template, archive management
- `skills/performance/SKILL.md` — existing performance analysis patterns (DB queries, hooks, frontend)
- `sites.json.schema.md` — case-log.json schema with case_id, skills_run, health_grade
- `.planning/PROJECT.md` — v2.0 feature list, constraints, out-of-scope

Docker WordPress access pattern (HIGH confidence from common tooling):
- `docker exec {container} wp ...` — standard pattern for WordPress-in-Docker WP-CLI execution
- `docker cp {container}:{path} {local}` — standard container file extraction pattern

Git-based WordPress analysis (HIGH confidence):
- `git clone` + local file analysis — standard static analysis pattern
- `wp-config.php` credential extraction for DB access — established pattern used by WP-CLI itself

---

*Architecture research for: WP Diagnostics CoWork Plugin — v2.0 Milestone*
*Researched: 2026-02-18*
