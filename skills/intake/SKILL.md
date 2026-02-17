---
name: intake
description: Structured context gathering before diagnostics — asks about symptoms, timeline, environment, scope, urgency, and prior work to produce a focused investigation plan
---

# Intake Skill: Context Gathering

You gather context from the user before running diagnostics. This produces a structured understanding of what's wrong, what matters, and what to focus on — so diagnostic skills run smarter, not just harder.

## Philosophy

Ask conversationally, not as a checklist. Extract what you need from what the user already said. Only ask about gaps. If the user says "just scan it" or "skip", bypass entirely and proceed with defaults.

## Section 1: Load Prior Context

Before asking anything, check for prior diagnostic history on this site.

```bash
SITE_NAME="${1:-default-site}"
MEMORY_DIR="memory/${SITE_NAME}"
CASE_LOG="${MEMORY_DIR}/case-log.json"

# Check for prior cases
if [ -f "$CASE_LOG" ]; then
  LAST_CASE=$(jq -r '.cases[-1]' "$CASE_LOG" 2>/dev/null)
  LAST_DATE=$(echo "$LAST_CASE" | jq -r '.date // empty')
  LAST_CONCERN=$(echo "$LAST_CASE" | jq -r '.concern // empty')
  LAST_GRADE=$(echo "$LAST_CASE" | jq -r '.health_grade // empty')
  OPEN_ITEMS=$(echo "$LAST_CASE" | jq -r '.open_items[]? // empty')
fi
```

**If prior context exists**, reference it naturally:
- "Last time I looked at this site ({date}), it scored a {grade}. The main concern was: {concern}."
- "Open items from last scan: {open_items}"
- "Is this related to a previous finding, or something new?"

**If no prior context**, skip this step entirely.

## Section 2: Context Dimensions

Gather information across these six dimensions. You do NOT need to ask about all of them — extract what you can from the user's initial message and only probe gaps.

### Dimension 1: Symptoms

**What to understand:** What's happening vs. what the user expected.

**Probe questions (use 1-2, not all):**
- "What are you seeing that brought you here?"
- "Is this a specific error, or more of a general concern?"
- "Can you describe what happens when [the problem occurs]?"

**Extract:** symptom description, error messages, affected functionality.

### Dimension 2: Timeline

**What to understand:** When it started and what changed.

**Probe questions:**
- "When did you first notice this?"
- "Did anything change recently — plugin updates, theme changes, hosting migration?"
- "Was it working before? If so, what was the last known-good state?"

**Extract:** onset date, recent changes, correlation with events.

### Dimension 3: Environment

**What to understand:** Hosting, caching, CDN, and infrastructure context.

**Probe questions:**
- "What hosting are you on?"
- "Are you using any caching plugins or a CDN?"
- "Any staging/dev environments, or just production?"

**Extract:** host provider, caching layers, CDN, environment count.

**Note:** Much of this can be discovered automatically by site-scout. Only ask if it directly affects diagnostic approach.

### Dimension 4: Scope

**What to understand:** How widespread the issue is.

**Probe questions:**
- "Is this affecting the whole site or specific pages?"
- "All users or just some (logged in vs. logged out, specific roles)?"
- "Frontend, admin, or both?"

**Extract:** affected pages/areas, user segments, frontend vs backend.

### Dimension 5: Urgency

**What to understand:** Is this an emergency or a proactive review?

**Detection patterns:**
- **Emergency keywords:** "hacked", "down", "broken", "malware", "defaced", "not loading", "white screen"
- **Proactive keywords:** "review", "audit", "check", "health check", "routine", "before launch"

**If emergency detected:** Skip remaining questions, proceed immediately with full security scan.

**Extract:** urgency level (emergency / urgent / routine / proactive).

### Dimension 6: Prior Work

**What to understand:** What the user has already tried.

**Probe questions:**
- "Have you tried anything to fix this already?"
- "Any other tools or services looked at this?"

**Extract:** actions taken, tools used, results observed.

## Section 3: Adaptive Questioning

**Key principle:** Don't ask questions the user already answered.

### Pre-seeding from User Input

When the user invokes `/investigate` with context (e.g., "investigate security on mysite — it got hacked last week"), extract:
- **Concern type:** security (from "security" keyword)
- **Symptom:** hacked (from "got hacked")
- **Timeline:** last week (from "last week")
- **Urgency:** emergency (from "hacked" keyword)

Then only ask about gaps: scope, environment, prior work.

### Question Budget

- **Emergency:** 0-1 questions, then proceed
- **Clear concern:** 2-3 questions about gaps only
- **Vague concern:** 3-5 questions to build understanding
- **Proactive review:** 1-2 questions (scope and focus areas)

### Skip Mechanism

If the user says any of these, bypass intake entirely:
- "skip"
- "just scan it"
- "run everything"
- "no questions"
- "go"

When skipped, proceed with default full scan and note: "Proceeding with standard full scan. No specific concerns noted."

## Section 4: Readiness Gate

Before proceeding to diagnostics, present a summary for confirmation.

**Template:**

```
Based on what you've told me, here's my understanding:

**Concern:** {1-2 sentence summary of the problem/goal}
**Urgency:** {Emergency / Urgent / Routine / Proactive}
**Focus areas:** {Which diagnostic categories to prioritize}
**Assumptions:** {What I'm assuming based on gaps}

Shall I proceed, or want to adjust anything?
```

**If user confirms:** Proceed to diagnostic planning.
**If user adjusts:** Update understanding and re-present gate.

## Section 5: Output

Write the structured context to `memory/{site}/active-case.json`:

```json
{
  "case_id": "case-{YYYY-MM-DD}-{NNN}",
  "created": "{ISO8601 timestamp}",
  "site": "{site-name}",
  "concern": {
    "summary": "Site was hacked last week, user wants security verification",
    "type": "security",
    "urgency": "emergency",
    "keywords": ["hacked", "security", "breach"]
  },
  "context": {
    "symptoms": "Unknown modifications detected by hosting provider",
    "timeline": "Noticed last week after hosting provider alert",
    "environment": "Shared hosting, no CDN, single production site",
    "scope": "Entire site potentially affected",
    "prior_work": "Hosting provider ran basic malware scan, found nothing"
  },
  "diagnostic_focus": {
    "priority_skills": ["diagnostic-core-integrity", "diagnostic-malware-scan", "diagnostic-config-security"],
    "secondary_skills": ["diagnostic-user-audit", "diagnostic-code-quality"],
    "skip_skills": [],
    "focus_areas": ["Modified core files", "Backdoor detection", "User account compromise"]
  },
  "prior_case_reference": "case-2026-02-10-001"
}
```

### Case ID Generation

```bash
# Generate sequential case ID for the day
DATE=$(date +%Y-%m-%d)
EXISTING=$(jq -r "[.cases[] | select(.case_id | startswith(\"case-${DATE}\"))] | length" "$CASE_LOG" 2>/dev/null || echo "0")
NEXT_NUM=$(printf "%03d" $((EXISTING + 1)))
CASE_ID="case-${DATE}-${NEXT_NUM}"
```

### Concern Type Mapping

Map user concerns to diagnostic skill priorities:

| Concern Type | Priority Skills | Secondary Skills |
|-------------|----------------|-----------------|
| security | core-integrity, malware-scan, config-security, user-audit | code-quality |
| performance | code-quality, config-security | version-audit |
| code-quality | code-quality, malware-scan | config-security |
| updates | version-audit | config-security |
| general / proactive | all skills equally | — |
| unknown | all skills equally | — |

## Error Handling

### sites.json Not Found

```bash
if [ ! -f sites.json ]; then
  echo "ERROR: No sites configured. Run /connect first."
  exit 1
fi
```

### User Provides No Input

If the user invokes `/investigate` with no additional context and doesn't respond to questions after two attempts, proceed with default full scan.

### Case Log Write Failure

If `memory/{site}/active-case.json` cannot be written (permissions, disk full), warn but continue — the diagnostic planning step can work without it by using inline context.

## Notes

- This skill is conversational — it talks to the user, not just processes data
- Always reference prior case context when available
- Emergency detection should be fast — don't ask "what's your urgency" when the user said "hacked"
- The readiness gate prevents wasted work from misunderstanding
- active-case.json is ephemeral — overwritten each investigation, archived in case-log.json after completion
