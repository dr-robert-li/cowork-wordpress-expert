---
name: scan-reviewer
description: Post-diagnostic verification — checks that findings address the original concern, skills ran as planned, and results are internally consistent
---

# Scan Reviewer Skill: Findings Verification

You verify that a completed diagnostic scan actually addressed the user's original concern. This is a goal-backward check: start from what the user wanted to know, and verify the findings answer it.

## Philosophy

A scan that runs all skills but misses the user's actual concern is a failed scan. This skill catches that gap before the user sees the report.

## Section 1: Input

Load the investigation context and combined findings.

```bash
SITE_NAME="${1:-default-site}"
MEMORY_DIR="memory/${SITE_NAME}"

# Load the active case (what the user asked about)
ACTIVE_CASE="${MEMORY_DIR}/active-case.json"
if [ -f "$ACTIVE_CASE" ]; then
  CONCERN_SUMMARY=$(jq -r '.concern.summary' "$ACTIVE_CASE")
  CONCERN_TYPE=$(jq -r '.concern.type' "$ACTIVE_CASE")
  URGENCY=$(jq -r '.concern.urgency' "$ACTIVE_CASE")
  PRIORITY_SKILLS=$(jq -r '.diagnostic_focus.priority_skills[]' "$ACTIVE_CASE")
  FOCUS_AREAS=$(jq -r '.diagnostic_focus.focus_areas[]' "$ACTIVE_CASE")
else
  # No active case — this is a standard /diagnose run, not /investigate
  # Apply basic verification only
  CONCERN_SUMMARY="General diagnostic scan"
  CONCERN_TYPE="general"
  URGENCY="routine"
fi

# Load combined findings (passed as argument or read from memory)
# COMBINED_FINDINGS is the JSON array of all findings from all skills
```

## Section 2: Verification Checks

### Check 1: Concern Addressal

Do the findings address what the user actually asked about?

**Process:**
1. Extract the concern type and keywords from `active-case.json`
2. Map concern type to expected finding categories
3. Check if findings exist in those categories

**Concern-to-category mapping:**

| Concern Type | Expected Categories | Minimum Expected |
|-------------|-------------------|-----------------|
| security | Security, Suspicious Code | At least 1 finding OR explicit "no issues found" |
| performance | Code Quality | At least 1 finding OR explicit "no issues found" |
| code-quality | Code Quality, Suspicious Code | At least 1 finding OR explicit "no issues found" |
| updates | Version & Compatibility | At least 1 finding OR explicit "no issues found" |
| general | Any | Findings in at least 2 categories |

**Scoring:**
- **Addressed:** Findings exist in expected categories (or skills explicitly reported no issues)
- **Partially addressed:** Some expected categories have findings, others were skipped
- **Not addressed:** No findings in any expected category and skills didn't report clean

### Check 2: Skill Execution Completeness

Were all planned skills actually executed?

```bash
# Compare planned skills (from active-case.json) with actually completed skills
PLANNED_SKILLS=$(jq -r '.diagnostic_focus.priority_skills[]' "$ACTIVE_CASE" 2>/dev/null)
# COMPLETED_SKILLS and SKIPPED_SKILLS are passed from the diagnose/investigate command

MISSING_SKILLS=()
for SKILL in $PLANNED_SKILLS; do
  if ! echo "$COMPLETED_SKILLS" | grep -q "$SKILL"; then
    MISSING_SKILLS+=("$SKILL")
  fi
done
```

**Scoring:**
- **Complete:** All planned skills executed
- **Partial:** Some skills skipped (with documented reason)
- **Incomplete:** Priority skills missing without explanation

### Check 3: Internal Consistency

Are the findings internally consistent? Contradictions reduce confidence.

**Contradiction patterns to check:**

| Finding A | Finding B | Contradiction |
|-----------|-----------|---------------|
| Core integrity: all files match | Malware scan: suspicious code in core files | Yes — core can't be clean and infected |
| Config security: WP_DEBUG disabled | Scout report: WP_DEBUG enabled | Yes — conflicting observations |
| User audit: no admin accounts | Any finding referencing admin user activity | Yes — impossible state |
| Version audit: all up to date | Code quality: deprecated function usage from old version | Possible — investigate |

**Process:**
1. Extract key assertions from findings (core clean/dirty, debug on/off, etc.)
2. Check for logical contradictions
3. Flag contradictions for human review

### Check 4: Focus Area Coverage

Were the specific focus areas from intake actually investigated?

```bash
# Check if focus areas map to findings
for AREA in $FOCUS_AREAS; do
  # Search findings for references to this focus area
  MATCHES=$(echo "$COMBINED_FINDINGS" | jq "[.[] | select(.title + .detail | test(\"$AREA\"; \"i\"))] | length")
  if [ "$MATCHES" -eq 0 ]; then
    UNCOVERED_AREAS+=("$AREA")
  fi
done
```

### Check 5: Health Grade Reasonableness

Is the health grade reasonable given the concern and urgency?

**Reasonableness checks:**
- User said "hacked" but grade is A → Suspicious (possible false negative)
- User said "routine check" but grade is F → Valid (they just didn't know)
- Many skills skipped but grade is A → Invalid (insufficient data for confidence)
- Emergency urgency + incomplete scan → Flag for re-scan

## Section 3: Confidence Assessment

Combine all checks into an overall confidence rating.

### Confidence Matrix

| Rating | Criteria |
|--------|----------|
| **High** | Concern addressed, all planned skills ran, no contradictions, focus areas covered |
| **Medium** | Concern partially addressed OR 1-2 skills skipped (with reason) OR minor gaps in focus areas |
| **Low** | Concern not addressed OR priority skills missing OR contradictions found OR grade unreasonable |

### Confidence Calculation

```bash
CONFIDENCE_SCORE=100

# Deductions
if [ "$CONCERN_ADDRESSED" == "not_addressed" ]; then
  CONFIDENCE_SCORE=$((CONFIDENCE_SCORE - 40))
elif [ "$CONCERN_ADDRESSED" == "partially" ]; then
  CONFIDENCE_SCORE=$((CONFIDENCE_SCORE - 20))
fi

if [ ${#MISSING_SKILLS[@]} -gt 0 ]; then
  CONFIDENCE_SCORE=$((CONFIDENCE_SCORE - 15 * ${#MISSING_SKILLS[@]}))
fi

if [ ${#CONTRADICTIONS[@]} -gt 0 ]; then
  CONFIDENCE_SCORE=$((CONFIDENCE_SCORE - 20 * ${#CONTRADICTIONS[@]}))
fi

if [ ${#UNCOVERED_AREAS[@]} -gt 0 ]; then
  CONFIDENCE_SCORE=$((CONFIDENCE_SCORE - 10 * ${#UNCOVERED_AREAS[@]}))
fi

# Map score to rating
if [ $CONFIDENCE_SCORE -ge 80 ]; then
  CONFIDENCE="High"
elif [ $CONFIDENCE_SCORE -ge 50 ]; then
  CONFIDENCE="Medium"
else
  CONFIDENCE="Low"
fi
```

## Section 4: Output

### Review Summary

Produce a structured review that gets appended to the diagnostic report.

```json
{
  "confidence": "High",
  "confidence_score": 85,
  "concern_addressed": true,
  "skills_completeness": "complete",
  "contradictions": [],
  "uncovered_focus_areas": [],
  "recommendations": [],
  "notes": "All planned diagnostics completed. Findings directly address the security concern."
}
```

### Report Section

Generate a markdown section for inclusion in the final report:

```markdown
## Diagnostic Confidence

**Confidence:** High (85/100)

**Concern addressal:** Your concern about site security has been directly addressed by the findings above.

**Skill coverage:** All 6 planned diagnostic skills completed successfully.

**Consistency:** No contradictions detected between findings.

**Recommendations:** None — findings are comprehensive for this concern.
```

### Low Confidence Recommendations

When confidence is Low, provide specific recommendations:

```markdown
## Diagnostic Confidence

**Confidence:** Low (35/100)

**Issues identified:**
- Your concern about malware was not directly addressed by the completed scans
- 2 priority skills (core-integrity, malware-scan) were skipped due to WP-CLI unavailability
- Focus area "backdoor detection" has no corresponding findings

**Recommendations:**
- Install WP-CLI on the remote server to enable core integrity and malware scanning
- Re-run `/investigate` with WP-CLI available for a complete security assessment
- Consider manual review of recently modified files identified by site scout
```

## Section 5: Edge Cases

### No Active Case (Standard /diagnose)

When invoked after a standard `/diagnose` (no `/investigate` intake), perform basic verification only:
- Check that findings are non-empty (unless all skills reported clean)
- Check for contradictions
- Skip concern addressal and focus area checks
- Default confidence: High (if no contradictions) or Medium (if skills skipped)

### All Skills Skipped

If all skills were skipped (total failure), confidence is automatically Low:

```json
{
  "confidence": "Low",
  "confidence_score": 0,
  "concern_addressed": false,
  "skills_completeness": "none",
  "notes": "No diagnostic skills completed. Unable to assess site health.",
  "recommendations": ["Verify SSH connection", "Check site accessibility", "Re-run diagnostics"]
}
```

### Emergency with Clean Results

If urgency is "emergency" (user said "hacked", "down", etc.) but all findings are clean:
- Don't auto-dismiss — a clean scan during an emergency is suspicious
- Add note: "All automated checks passed, but given the reported emergency, consider manual investigation of: [specific areas]"
- Confidence: Medium (not High — clean emergency results need human verification)

## Notes

- This skill runs AFTER all diagnostic skills complete, BEFORE report generation
- It adds context to the report but does NOT modify or filter findings
- Contradictions are flagged for human review, not auto-resolved
- Confidence rating is transparent — show the scoring so the user understands why
- For standard `/diagnose` runs (no intake), this adds lightweight validation without overhead
